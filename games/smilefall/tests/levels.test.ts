import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import {
  arcadeStageByNumber,
  nextArcadeStage,
  smilefallArcadeRun,
  smilefallCatalog,
  stageBySlug,
} from '../src/levels/catalog';
import {
  applyMood,
  hasLethalHazards,
  requiredCatches,
  startingReserve,
  validateArcadeProgression,
  validateCatalog,
  validateLevel,
} from '../src/levels/toolbox';

describe('Smilefall catalog and arcade progression', () => {
  it('keeps a broader individual catalog around a ten-stage arcade run', () => {
    expect(smilefallArcadeRun.map((stage) => stage.metadata.title)).toEqual([
      'First Giggle',
      'Wobble Season',
      'Bucket Brigade',
      'Pin Cushion',
      'Rock Alley',
      'Split Decision',
      'Swarm Hour',
      'Stair Master',
      'Low Ceiling',
      'Sky Ladder',
    ]);
    expect(smilefallCatalog.length).toBeGreaterThan(smilefallArcadeRun.length);
    expect(smilefallCatalog.map((stage) => stage.metadata.number))
      .toEqual(smilefallCatalog.map((_, index) => index + 1));
    expect(nextArcadeStage('first-giggle')?.metadata.slug).toBe('wobble-season');
    expect(nextArcadeStage('sky-ladder')).toBeUndefined();
    expect(nextArcadeStage('bounce-house')).toBeUndefined();
    expect(arcadeStageByNumber(4)?.metadata.slug).toBe('pin-cushion');
    expect(stageBySlug('bounce-house')?.metadata.number).toBe(11);
  });

  it('validates every catalog stage and the teaching progression', () => {
    expect(validateCatalog(smilefallCatalog)).toEqual({ valid: true, errors: [], warnings: [] });
    const result = validateArcadeProgression(smilefallArcadeRun);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    for (const [index, stage] of smilefallArcadeRun.entries()) {
      if (index === 0) continue;
      expect(result.introductions[stage.metadata.slug]!.length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the first three stages forgiving and introduces the first lethal hazard at four', () => {
    for (const stage of smilefallArcadeRun.slice(0, 3)) {
      expect(hasLethalHazards(stage.scenario), stage.metadata.slug).toBe(false);
    }
    expect(smilefallArcadeRun[3]!.metadata.slug).toBe('pin-cushion');
    expect(hasLethalHazards(smilefallArcadeRun[3]!.scenario)).toBe(true);
  });

  it('mixes plain and visibly spiked rocks in Rock Alley', () => {
    const hazards = new Set(stageBySlug('rock-alley')!.scenario.rocks.map((rock) => rock.hazard));
    expect(hazards).toEqual(new Set(['plain', 'spiked']));
  });

  it('ends with three vertical platform stages that contain lethal spikes', () => {
    for (const stage of smilefallArcadeRun.slice(-3)) {
      expect(stage.scenario.platforms!.length, stage.metadata.slug).toBeGreaterThan(0);
      expect(stage.scenario.viewHeight!, stage.metadata.slug).toBeLessThan(stage.scenario.height);
      expect(hasLethalHazards(stage.scenario), stage.metadata.slug).toBe(true);
    }
    expect(stageBySlug('low-ceiling')!.scenario.spikes)
      .toContainEqual(expect.objectContaining({ facing: 'down' }));
    expect(stageBySlug('sky-ladder')!.scenario.buckets.some((bucket) => bucket.baseY !== undefined)).toBe(true);
  });

  it('gives every stage a real reserve because zero reserve is terminal', () => {
    for (const stage of smilefallCatalog) {
      expect(stage.scenario.drops.length, stage.metadata.slug)
        .toBeGreaterThan(requiredCatches(stage.scenario));
      expect(startingReserve(stage.scenario), stage.metadata.slug).toBeGreaterThan(0);
    }
    expect(startingReserve(stageBySlug('pin-cushion')!.scenario)).toBe(5);
  });

  it('retunes the actual reserve, clock, and hop meter for each mood', () => {
    const base = stageBySlug('rock-alley')!.scenario;
    expect(startingReserve(applyMood(base, 'giggle'))).toBe(startingReserve(base) + 2);
    expect(startingReserve(applyMood(base, 'chuckle'))).toBe(startingReserve(base));
    expect(startingReserve(applyMood(base, 'guffaw'))).toBe(startingReserve(base) - 1);
    expect(startingReserve(applyMood(base, 'cackle'))).toBe(startingReserve(base) - 2);
    expect(applyMood(base, 'giggle').timeLimitTicks).toBeGreaterThan(base.timeLimitTicks);
    expect(applyMood(base, 'cackle').timeLimitTicks).toBeLessThan(base.timeLimitTicks);
    expect(applyMood(base, 'cackle').hopCharges).toBe(base.hopCharges - 1);
  });

  it('constructs an engine for every stage without legacy global hazard rules', () => {
    for (const stage of smilefallCatalog) {
      expect('rockRule' in stage.scenario).toBe(false);
      expect('floorRule' in stage.scenario).toBe(false);
      expect('frownLimit' in stage.scenario).toBe(false);
      const state = new SmilefallEngine(stage.scenario).snapshot();
      expect(state.status).toBe('running');
      expect(state.reserveSmilies).toBe(startingReserve(stage.scenario));
    }
  });

  it('rejects impossible geometry and a roster with no reserve', () => {
    const stage = smilefallCatalog[0]!.scenario;
    const brokenGeometry = validateLevel({
      ...stage,
      buckets: [
        { id: 'b1', x: 3, width: 4, capacity: 2 },
        { id: 'b2', x: 5, width: 4, capacity: 2 },
        { id: 'b3', x: 30, width: 4, capacity: 2 },
      ],
    });
    expect(brokenGeometry.valid).toBe(false);
    expect(brokenGeometry.errors.some((error) => error.includes('overlaps'))).toBe(true);
    expect(brokenGeometry.errors.some((error) => error.includes('outside the field'))).toBe(true);

    const noReserve = validateLevel({
      ...stage,
      drops: stage.drops.slice(0, requiredCatches(stage)),
    });
    expect(noReserve.valid).toBe(false);
    expect(noReserve.errors.some((error) => error.includes('reserve smile'))).toBe(true);
  });
});
