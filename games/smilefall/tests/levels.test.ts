import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { smilefallCatalog, nextStage, stageBySlug } from '../src/levels/catalog';
import { applyMood, requiredCatches, validateCatalog, validateLevel } from '../src/levels/toolbox';

describe('Smilefall catalog', () => {
  it('validates every authored stage', () => {
    const result = validateCatalog(smilefallCatalog);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('numbers stages in run order', () => {
    // Numbered 1..N in catalog order, so adding a stage never silently
    // renumbers the arcade run.
    expect(smilefallCatalog.map((stage) => stage.metadata.number))
      .toEqual(smilefallCatalog.map((_, index) => index + 1));
    expect(nextStage('first-giggle')?.metadata.slug).toBe('rock-season');
    expect(nextStage(smilefallCatalog.at(-1)!.metadata.slug)).toBeUndefined();
    expect(stageBySlug('wobble-row')?.metadata.title).toBe('Wobble Row');
    expect(nextStage('wobble-row')?.metadata.slug).toBe('bucket-brigade');
  });

  it('says out loud on every stage where a rock is fatal', () => {
    // The renderer draws spiky rocks and balloon smilies whenever rockRule is
    // 'smash', so a stage that switches the rule silently would be lying to the
    // player twice: once in the picker and once on the field.
    const smashing = smilefallCatalog.filter((stage) => stage.scenario.rockRule === 'smash');
    expect(smashing.map((stage) => stage.metadata.slug)).toContain('chonk-parade');
    for (const stage of smashing) {
      const shouts = stage.metadata.features.some((feature) => /SMASH|POP/.test(feature));
      expect(shouts, `${stage.metadata.slug} hides its rock rule`).toBe(true);
    }
    // And a stage that only bruises must never claim otherwise.
    for (const stage of smilefallCatalog.filter((candidate) => candidate.scenario.rockRule !== 'smash')) {
      expect(stage.metadata.features.some((feature) => /SMASH|POP/.test(feature))).toBe(false);
    }
  });

  it('builds every stacked stage so its raised pails stand on something', () => {
    const stacked = smilefallCatalog.filter((stage) =>
      stage.scenario.buckets.some((bucket) => bucket.baseY !== undefined));
    expect(stacked.map((stage) => stage.metadata.slug)).toEqual(['stair-master', 'sky-ladder']);
    for (const stage of stacked) {
      // A tower only works because a smiley survives the ground, and only
      // reveals itself because the field is taller than the opening framing.
      expect(stage.scenario.floorRule).toBe('bounce');
      expect(stage.scenario.viewHeight!).toBeLessThan(stage.scenario.height);
      const highest = Math.min(...stage.scenario.buckets.map((bucket) => bucket.baseY ?? stage.scenario.height));
      expect(highest).toBeLessThan(stage.scenario.height - stage.scenario.viewHeight!);
      expect(validateLevel(stage.scenario).errors).toEqual([]);
    }
  });

  it('drops more smilies than the buckets need', () => {
    for (const stage of smilefallCatalog) {
      const needed = requiredCatches(stage.scenario);
      const canLose = stage.scenario.floorRule !== 'bounce'
        || stage.scenario.rocks.length > 0
        || (stage.scenario.spikes?.length ?? 0) > 0;
      // A bouncy stage with nothing sharp on it cannot lose a smiley, so its
      // roster only has to be able to fill up.
      if (!canLose) {
        expect(stage.scenario.drops.length).toBeGreaterThanOrEqual(needed);
        continue;
      }
      // Everywhere else the roster is the budget: the run ends the moment
      // there are fewer smilies left than slots, so spares are the whole game.
      expect(stage.scenario.drops.length).toBeGreaterThan(needed + 1);
      // And the frown limit must not quietly end the run before the roster
      // does, or the HUD would be counting the wrong thing.
      expect(stage.scenario.frownLimit).toBeLessThanOrEqual(stage.scenario.drops.length - needed + 1);
    }
  });

  it('keeps Bounce House on an exact roster', () => {
    // Its whole premise is twelve smilies and twelve slots: no spares, so the
    // only thing a miss costs is the time to bring one back around.
    const stage = stageBySlug('bounce-house')!;
    expect(stage.scenario.drops.length).toBe(requiredCatches(stage.scenario));
  });

  it('constructs an engine for every stage', () => {
    for (const stage of smilefallCatalog) {
      const state = new SmilefallEngine(stage.scenario).snapshot();
      expect(state.status).toBe('running');
      expect(state.bucketCount).toBe(stage.scenario.buckets.length);
      expect(state.dropsRemaining).toBe(stage.scenario.drops.length);
    }
  });

  it('retunes forgiveness for the selected mood', () => {
    const base = smilefallCatalog[0]!.scenario;
    expect(applyMood(base, 'giggle').frownLimit).toBe(base.frownLimit + 3);
    expect(applyMood(base, 'chuckle').frownLimit).toBe(base.frownLimit);
    expect(applyMood(base, 'guffaw').frownLimit).toBe(base.frownLimit - 2);
    expect(applyMood(base, 'cackle').frownLimit).toBe(1);
    expect(applyMood(base, 'cackle').hopCharges).toBe(base.hopCharges - 1);
  });

  it('rejects a stage whose buckets overlap or leave the field', () => {
    const broken = validateLevel({
      ...smilefallCatalog[0]!.scenario,
      buckets: [
        { id: 'b1', x: 3, width: 4, capacity: 2 },
        { id: 'b2', x: 5, width: 4, capacity: 2 },
        { id: 'b3', x: 30, width: 4, capacity: 2 },
      ],
    });
    expect(broken.valid).toBe(false);
    expect(broken.errors.some((error) => error.includes('overlaps'))).toBe(true);
    expect(broken.errors.some((error) => error.includes('outside the field'))).toBe(true);
  });

  it('rejects a stage that cannot possibly fill its buckets', () => {
    const stage = smilefallCatalog[0]!.scenario;
    const broken = validateLevel({ ...stage, drops: stage.drops.slice(0, 2) });
    expect(broken.valid).toBe(false);
    expect(broken.requiredCatches).toBe(requiredCatches(stage));
  });
});
