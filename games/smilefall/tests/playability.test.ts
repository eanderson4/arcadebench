import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { FIXED_SCALE } from '../src/core/physics';
import { smilefallCatalog } from '../src/levels/catalog';
import { applyMood, requiredCatches } from '../src/levels/toolbox';
import type { ControlInput, GameEvent, SmilefallState } from '../src/core/types';
import type { SmilefallMoodId } from '../src/levels/types';

/**
 * A deliberately naive pilot: steer the lowest smiley toward the nearest bucket
 * that still has room, and hop when a rock is closing in. It is the yardstick
 * for "is this stage fair" — stage one should fall to it, later stages should
 * not.
 */
function pilot(state: SmilefallState): ControlInput {
  if (state.smilies.length < 1) return { lean: 'none', hop: false };
  const target = [...state.smilies].sort((a, b) => b.position.y - a.position.y)[0]!;
  const open = state.buckets.filter((bucket) => bucket.filled < bucket.capacity);
  if (open.length < 1) return { lean: 'none', hop: false };
  const nearest = open
    .map((bucket) => bucket.x + bucket.width / 2)
    .sort((a, b) => Math.abs(a - target.position.x) - Math.abs(b - target.position.x))[0]!;
  const delta = nearest - target.position.x;
  const danger = state.rocks.some((rock) =>
    Math.abs(rock.position.x - target.position.x) < FIXED_SCALE * 3
    && rock.position.y > target.position.y
    && rock.position.y - target.position.y < FIXED_SCALE * 2.4);
  return {
    lean: Math.abs(delta) < FIXED_SCALE * 0.2 ? 'none' : delta > 0 ? 'right' : 'left',
    hop: danger && state.hopCharges > 0,
  };
}

/**
 * A pilot that can actually climb: it picks the nearest unfilled pail — the
 * lowest one first, which is the order a stacked stage means you to take them
 * in — steers the closest smiley at it, and spends a hop whenever that smiley
 * is below the mouth it is aiming for. It is the yardstick for "is this tower
 * possible at all", which the greedy pilot cannot answer because it never
 * hops on purpose.
 */
function climbingPilot(state: SmilefallState): ControlInput {
  const open = state.buckets.filter((bucket) => bucket.filled < bucket.capacity);
  if (open.length < 1 || state.smilies.length < 1) return { lean: 'none', hop: false };
  const target = [...open].sort((a, b) => b.mouthY - a.mouthY)[0]!;
  const targetX = target.x + target.width / 2;
  const nearest = [...state.smilies].sort((a, b) =>
    Math.hypot(a.position.x - targetX, a.position.y - target.mouthY)
    - Math.hypot(b.position.x - targetX, b.position.y - target.mouthY))[0]!;
  const delta = targetX - nearest.position.x;
  return {
    lean: Math.abs(delta) < FIXED_SCALE * 0.25 ? 'none' : delta > 0 ? 'right' : 'left',
    // Below the mouth it is aiming for, so the only way up is a hop — spent on
    // the way down, where it buys the most height.
    hop: nearest.position.y > target.mouthY + FIXED_SCALE
      && nearest.velocity.y > 0
      && state.hopCharges > 0,
  };
}

function flySlug(
  slug: string,
  pilot: (state: SmilefallState) => ControlInput,
): { final: SmilefallState; events: GameEvent[] } {
  const stage = smilefallCatalog.find((candidate) => candidate.metadata.slug === slug)!;
  const engine = new SmilefallEngine(stage.scenario);
  const events: GameEvent[] = [];
  for (let tick = 0; tick < 4200; tick++) {
    const state = engine.snapshot();
    if (state.status !== 'running') break;
    engine.setInput(pilot(state));
    events.push(...engine.step().events);
  }
  return { final: engine.snapshot(), events };
}

function flyStage(index: number, mood: SmilefallMoodId = 'chuckle'): SmilefallState {
  const engine = new SmilefallEngine(applyMood(smilefallCatalog[index]!.scenario, mood));
  for (let tick = 0; tick < 4000; tick++) {
    const state = engine.snapshot();
    if (state.status !== 'running') break;
    engine.setInput(pilot(state));
    engine.step();
  }
  return engine.snapshot();
}

describe('Smilefall playability', () => {
  it('lets a naive pilot clear the opening stage', () => {
    const final = flyStage(0);
    expect(final.status).toBe('won');
    expect(final.bucketsFilled).toBe(final.bucketCount);
  });

  it('still resolves the opening stage on the harshest mood', () => {
    const final = flyStage(0, 'cackle');
    expect(final.status).not.toBe('running');
  });

  it('asks more of the player on later stages', () => {
    const wobbleRow = flyStage(2);
    expect(wobbleRow.status).toBe('lost');
    expect(wobbleRow.caught).toBeGreaterThan(0);
  });

  it('keeps a curve the naive pilot can only partly clear', () => {
    // The yardstick: some stages must fall to a dumb greedy pilot and some
    // must not, or the catalog has drifted into being uniformly easy or hard.
    const cleared = smilefallCatalog
      .filter((_, index) => flyStage(index).status === 'won')
      .map((stage) => stage.metadata.slug);
    expect(cleared).toContain('first-giggle');
    expect(cleared).not.toContain('wobble-row');
    expect(cleared).not.toContain('swarm-hour');
    expect(cleared.length).toBeGreaterThanOrEqual(3);
    expect(cleared.length).toBeLessThanOrEqual(smilefallCatalog.length - 3);
  });

  it('lets rocks actually reach the flock on the rock-heavy stages', () => {
    for (const slug of ['rock-season', 'wobble-row', 'rock-alley', 'split-decision']) {
      const index = smilefallCatalog.findIndex((stage) => stage.metadata.slug === slug);
      const final = flyStage(index);
      expect(final.bonks, `${slug} never landed a rock hit`).toBeGreaterThan(0);
    }
  });

  it('never breaks a smiley on the bouncy stage, and charges it in value', () => {
    const stage = smilefallCatalog.find((candidate) => candidate.metadata.slug === 'bounce-house')!;
    const engine = new SmilefallEngine(stage.scenario);
    const events: GameEvent[] = [];
    for (let tick = 0; tick < 4000; tick++) {
      const state = engine.snapshot();
      if (state.status !== 'running') break;
      engine.setInput(pilot(state));
      events.push(...engine.step().events);
    }
    const final = engine.snapshot();
    expect(final.status).toBe('won');
    // The whole premise: the ground never removes anybody.
    expect(events.some((event) => event.type === 'smiley_splatted')).toBe(false);
    expect(final.missed).toBe(0);
    expect(final.caught).toBe(requiredCatches(stage.scenario));
    expect(events.some((event) => event.type === 'smiley_bruised' && event.cause === 'floor')).toBe(true);

    // A bruised smiley still fills its slot but pays less than a clean one.
    const catches = events.filter((event) => event.type === 'smiley_caught');
    const clean = catches.filter((event) => !event.bruised);
    const bruised = catches.filter((event) => event.bruised);
    expect(bruised.length).toBeGreaterThan(0);
    expect(Math.min(...bruised.map((event) => event.points)))
      .toBeLessThan(Math.min(...clean.map((event) => event.points)));
  });

  it('pays out mostly in time bonus on a stage scored for speed', () => {
    const stage = smilefallCatalog.find((candidate) => candidate.metadata.slug === 'bounce-house')!;
    const engine = new SmilefallEngine(stage.scenario);
    for (let tick = 0; tick < 4000; tick++) {
      const state = engine.snapshot();
      if (state.status !== 'running') break;
      engine.setInput(pilot(state));
      engine.step();
    }
    const final = engine.snapshot();
    const bonus = stage.scenario.timeBonusPerTick! * (stage.scenario.timeLimitTicks - final.tick);
    expect(bonus).toBeGreaterThan(final.score - bonus);
  });

  it('lets a climbing pilot reach every tier of a stacked stage', () => {
    for (const slug of ['stair-master', 'sky-ladder']) {
      const { final, events } = flySlug(slug, climbingPilot);
      expect(final.status, `${slug} was not climbable`).toBe('won');
      expect(final.bucketsFilled).toBe(final.bucketCount);
      // The raised pails are the point: prove smilies actually got up there
      // rather than the stage being won on the ground tier alone.
      const raised = final.buckets.filter((bucket) => bucket.baseY < final.height * 1024);
      expect(raised.length).toBeGreaterThanOrEqual(2);
      for (const bucket of raised) expect(bucket.filled).toBe(bucket.capacity);
      // And that they used the stairs, which never cost anybody anything.
      const ledgeBounces = events.filter((event) => event.type === 'smiley_bounced');
      expect(ledgeBounces.length, `${slug} never used its ledges`).toBeGreaterThan(0);
    }
  });

  it('never charges a smiley for bouncing off a ledge', () => {
    const { events } = flySlug('low-ceiling', climbingPilot);
    const bounces = events.filter((event) => event.type === 'smiley_bounced');
    expect(bounces.length).toBeGreaterThan(0);
    // Ledges are furniture. Only the dirt, the rims and the rocks bruise.
    for (const bounce of bounces) {
      const sameTick = events.filter((event) =>
        event.type === 'smiley_bruised' && event.tick === bounce.tick && event.smileyId === bounce.smileyId);
      expect(sameTick).toEqual([]);
    }
    // The only thing on this stage that can remove a smiley is the spiked roof.
    for (const event of events.filter((candidate) => candidate.type === 'smiley_splatted')) {
      expect(event.reason).toBe('spikes');
    }
  });

  it('ends a run the moment the buckets can no longer be filled', () => {
    const stage = smilefallCatalog.find((candidate) => candidate.metadata.slug === 'stair-master')!;
    const needed = requiredCatches(stage.scenario);
    const spare = stage.scenario.drops.length - needed;
    expect(spare).toBeGreaterThan(0);
    // Walk the flock straight into the spiked ground and confirm the run ends
    // on arithmetic rather than on the clock.
    const engine = new SmilefallEngine(stage.scenario);
    for (let tick = 0; tick < 4200; tick++) {
      const state = engine.snapshot();
      if (state.status !== 'running') break;
      engine.setInput({ lean: 'right', hop: false });
      engine.step();
    }
    const final = engine.snapshot();
    expect(final.status).toBe('lost');
    expect(final.tick).toBeLessThan(stage.scenario.timeLimitTicks);
    expect(final.smiliesRemaining).toBeLessThan(final.slotsRemaining);
    expect(final.spareSmilies).toBeLessThan(0);
  });

  it('actually pops balloons on the spiky stages', () => {
    // If nothing ever pops on a stage drawn with spikes and balloons, the art
    // is writing a cheque the rules do not cash.
    for (const slug of ['pin-cushion', 'sky-ladder']) {
      const { events } = flySlug(slug, climbingPilot);
      const popped = events.some((event) => event.type === 'smiley_smashed')
        || events.some((event) => event.type === 'smiley_splatted' && event.reason === 'spikes');
      expect(popped, `${slug} never popped anybody`).toBe(true);
      // Nothing on a bouncy stage should ever die to the ground or a rim.
      for (const event of events.filter((candidate) => candidate.type === 'smiley_splatted')) {
        expect(event.reason).toBe('spikes');
      }
    }
  });

  it('always terminates every stage well inside its clock', () => {
    for (const [index, stage] of smilefallCatalog.entries()) {
      const final = flyStage(index);
      expect(final.status).not.toBe('running');
      expect(final.tick).toBeLessThanOrEqual(stage.scenario.timeLimitTicks);
    }
  });
});
