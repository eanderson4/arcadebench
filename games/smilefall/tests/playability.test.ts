import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { FIXED_SCALE } from '../src/core/physics';
import { smilefallArcadeRun, smilefallCatalog, stageBySlug } from '../src/levels/catalog';
import { applyMood } from '../src/levels/toolbox';
import type { ControlInput, GameEvent, SmilefallState } from '../src/core/types';
import type { SmilefallLevelScenario } from '../src/levels/types';

function pilot(state: SmilefallState): ControlInput {
  if (state.smilies.length < 1) return { lean: 'none', hop: false };
  const open = state.buckets.filter((bucket) => bucket.filled < bucket.capacity);
  if (open.length < 1) return { lean: 'none', hop: false };
  const target = [...state.smilies].sort((a, b) => b.position.y - a.position.y)[0]!;
  const targetX = open
    .map((bucket) => bucket.x + bucket.width / 2)
    .sort((a, b) => Math.abs(a - target.position.x) - Math.abs(b - target.position.x))[0]!;
  const delta = targetX - target.position.x;
  const danger = state.rocks.some((rock) =>
    rock.hazard === 'spiked'
    && Math.abs(rock.position.x - target.position.x) < FIXED_SCALE * 4
    && Math.abs(rock.position.y - target.position.y) < FIXED_SCALE * 2.5);
  return {
    lean: Math.abs(delta) < FIXED_SCALE * 0.2 ? 'none' : delta > 0 ? 'right' : 'left',
    hop: danger && target.velocity.y > 0 && state.hopCharges > 0,
  };
}

function run(
  slug: string,
  controller: (state: SmilefallState) => ControlInput = pilot,
): { final: SmilefallState; events: GameEvent[] } {
  const stage = stageBySlug(slug)!;
  return runScenario(stage.scenario, controller);
}

function runScenario(
  scenario: SmilefallLevelScenario,
  controller: (state: SmilefallState) => ControlInput,
): { final: SmilefallState; events: GameEvent[] } {
  const engine = new SmilefallEngine(scenario);
  const events: GameEvent[] = [];
  for (let tick = 0; tick <= scenario.timeLimitTicks; tick++) {
    const state = engine.snapshot();
    if (state.status !== 'running') break;
    engine.setInput(controller(state));
    events.push(...engine.step().events);
  }
  return { final: engine.snapshot(), events };
}

function steerTo(targetX: number, smileyX: number, hop = false, tolerance = 0.3): ControlInput {
  const delta = targetX - smileyX;
  return {
    lean: Math.abs(delta) < FIXED_SCALE * tolerance ? 'none' : delta > 0 ? 'right' : 'left',
    hop,
  };
}

/**
 * A reproducible human-style route for rooms with walkways: aim the lowest
 * smile at the nearest open pail, walk off any shelf covering that pail, then
 * fold back underneath it. This exercises the intended landing route instead
 * of deleting platforms from the playability fixture.
 */
function walkwayPilot(state: SmilefallState): ControlInput {
  const smiley = [...state.smilies].sort((a, b) => b.position.y - a.position.y)[0];
  if (!smiley) return { lean: 'none', hop: false };
  const bucket = state.buckets
    .filter((candidate) => candidate.filled < candidate.capacity)
    .sort((a, b) =>
      Math.abs(a.x + a.width / 2 - smiley.position.x)
      - Math.abs(b.x + b.width / 2 - smiley.position.x))[0];
  if (!bucket) return { lean: 'none', hop: false };

  let targetX = bucket.x + bucket.width / 2;
  const coveringWalkway = state.platforms.find((platform) =>
    platform.y < bucket.mouthY
    && platform.x <= targetX
    && platform.x + platform.width >= targetX);
  if (coveringWalkway && smiley.position.y < coveringWalkway.y + coveringWalkway.thickness + smiley.radius) {
    const leftExit = coveringWalkway.x - smiley.radius - FIXED_SCALE * 0.5;
    const rightExit = coveringWalkway.x + coveringWalkway.width + smiley.radius + FIXED_SCALE * 0.5;
    const canExitLeft = leftExit >= smiley.radius;
    const canExitRight = rightExit <= state.width * FIXED_SCALE - smiley.radius;
    targetX = !canExitLeft
      ? rightExit
      : !canExitRight
        ? leftExit
        : Math.abs(leftExit - targetX) <= Math.abs(rightExit - targetX)
          ? leftExit
          : rightExit;
  }
  return steerTo(targetX, smiley.position.x);
}

/** Climb to Sky Ladder's top pail first, then descend through the remaining tiers. */
function skyLadderPilot(state: SmilefallState): ControlInput {
  const topBucket = state.buckets.find((bucket) => bucket.id === 'b4')!;
  if (topBucket.filled < topBucket.capacity) {
    const launchCandidate = state.smilies
      .filter((smiley) => smiley.position.y < FIXED_SCALE * 26)
      .sort((a, b) => b.position.y - a.position.y)[0];
    const climber = launchCandidate ?? state.smilies[0];
    if (!climber) return { lean: 'none', hop: false };
    const inLaunchLane = launchCandidate !== undefined
      && launchCandidate.position.x > FIXED_SCALE * 17
      && launchCandidate.position.x < FIXED_SCALE * 25;
    const hop = launchCandidate !== undefined
      && state.hopCharges > 0
      && inLaunchLane
      && launchCandidate.position.y > FIXED_SCALE * 18
      && launchCandidate.velocity.y >= 0
      && state.tick % 2 === 0;
    return steerTo(topBucket.x + topBucket.width / 2, climber.position.x, hop, 0.4);
  }

  const smiley = [...state.smilies].sort((a, b) => b.position.y - a.position.y)[0];
  if (!smiley) return { lean: 'none', hop: false };
  const middleBucket = state.buckets.find((bucket) => bucket.id === 'b3')!;
  if (middleBucket.filled < middleBucket.capacity) {
    return steerTo(middleBucket.x + middleBucket.width / 2, smiley.position.x, false, 0.4);
  }
  const groundBucket = state.buckets.find((bucket) => bucket.filled < bucket.capacity);
  return groundBucket
    ? steerTo(groundBucket.x + groundBucket.width / 2, smiley.position.x, false, 0.4)
    : { lean: 'none', hop: false };
}

describe('Smilefall playability guardrails', () => {
  it('lets a naive pilot clear the opening lesson', () => {
    const { final } = run('first-giggle');
    expect(final.status).toBe('won');
    expect(final.bucketsFilled).toBe(final.bucketCount);
  });

  it('makes the first three stages completely nonlethal', () => {
    for (const stage of smilefallArcadeRun.slice(0, 3)) {
      const { events } = run(stage.metadata.slug, () => ({ lean: 'none', hop: false }));
      expect(events.some((event) => event.type === 'smiley_popped'), stage.metadata.slug).toBe(false);
      expect(events.some((event) => event.type === 'smiley_bruised'), stage.metadata.slug).toBe(true);
    }
  });

  it('lets safe impacts visibly frown a smile without spending reserve', () => {
    const stage = stageBySlug('wobble-season')!;
    const engine = new SmilefallEngine(stage.scenario);
    const initialReserve = engine.snapshot().reserveSmilies;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < 800 && engine.snapshot().status === 'running'; tick++) {
      engine.setInput({ lean: 'none', hop: false });
      events.push(...engine.step().events);
    }
    expect(events.some((event) => event.type === 'smiley_bruised')).toBe(true);
    expect(events.some((event) => event.type === 'smiley_popped')).toBe(false);
    expect(engine.snapshot().reserveSmilies).toBe(initialReserve);
  });

  it('keeps every stage bounded by a clock', () => {
    for (const stage of smilefallCatalog) {
      const { final } = run(stage.metadata.slug, () => ({ lean: 'none', hop: false }));
      expect(final.status, stage.metadata.slug).not.toBe('running');
      expect(final.tick, stage.metadata.slug).toBeLessThanOrEqual(stage.scenario.timeLimitTicks);
    }
  });

  it('keeps every elevated bucket on a reachable authored landing', () => {
    for (const stage of smilefallArcadeRun.slice(-3)) {
      const platforms = stage.scenario.platforms ?? [];
      for (const bucket of stage.scenario.buckets.filter((candidate) => candidate.baseY !== undefined)) {
        expect(platforms.some((platform) =>
          platform.y === bucket.baseY
          && platform.x <= bucket.x
          && platform.x + platform.width >= bucket.x + bucket.width,
        ), `${stage.metadata.slug}:${bucket.id}`).toBe(true);
      }
    }
  });

  it.each([
    ['stair-master', walkwayPilot],
    ['low-ceiling', walkwayPilot],
    ['sky-ladder', skyLadderPilot],
  ] as const)('has a deterministic winning route through %s on default Chuckle', (slug, controller) => {
    const stage = stageBySlug(slug)!;
    const scenario = applyMood(stage.scenario, 'chuckle');
    const { final, events } = runScenario(scenario, controller);

    expect(final.status).toBe('won');
    expect(final.failureReason).toBeNull();
    expect(final.bucketsFilled).toBe(final.bucketCount);
    expect(final.tick).toBeLessThan(scenario.timeLimitTicks);
    expect(new Set(events
      .filter((event) => event.type === 'smiley_caught')
      .map((event) => event.bucketId))).toEqual(new Set(scenario.buckets.map((bucket) => bucket.id)));
    if (slug === 'low-ceiling') {
      expect(events.some((event) => event.type === 'smiley_bounced' && event.surface === 'ledge')).toBe(true);
    }
    if (slug === 'sky-ladder') {
      expect(events.some((event) => event.type === 'flock_hopped')).toBe(true);
      expect(events.some((event) => event.type === 'rock_spawned' && event.hazard === 'spiked')).toBe(true);
    }
  });

  it('replays identical input streams identically on every arcade stage', () => {
    for (const stage of smilefallArcadeRun) {
      const a = new SmilefallEngine(stage.scenario);
      const b = new SmilefallEngine(stage.scenario);
      for (let tick = 0; tick < 360; tick++) {
        const input: ControlInput = {
          lean: tick % 90 < 30 ? 'left' : tick % 90 < 60 ? 'right' : 'none',
          hop: tick % 79 === 0,
        };
        a.setInput(input);
        b.setInput(input);
        expect(a.step(), `${stage.metadata.slug} tick ${tick}`).toEqual(b.step());
        if (a.snapshot().status !== 'running') break;
      }
    }
  });
});
