import { BUCKET_HEIGHT, BUCKET_RIM, SMILEY_RADIUS, toUnits } from '../core/physics';
import { rockRadius } from '../core/engine';
import type {
  BucketSpec,
  PlatformSpec,
  SpikeStripSpec,
  RockSpawn,
  RockKind,
  SmileyDrop,
  SmilefallScenario,
} from '../core/types';
import type { LevelValidationResult, SmilefallMoodId, SmilefallStage, CatalogValidationResult } from './types';

export const MOOD_ORDER: readonly SmilefallMoodId[] = ['giggle', 'chuckle', 'guffaw', 'cackle'];

export const MOOD_LABELS: Record<SmilefallMoodId, string> = {
  giggle: 'Giggle',
  chuckle: 'Chuckle',
  guffaw: 'Guffaw',
  cackle: 'Cackle',
};

export const MOOD_BLURBS: Record<SmilefallMoodId, string> = {
  giggle: 'Extra frowns to spare and a roomy hop meter.',
  chuckle: 'The stage exactly as it was authored.',
  guffaw: 'Fewer frowns. The rocks stop being funny.',
  cackle: 'One frown. Good luck, buddy.',
};

/** Drops a smiley every `everyTicks`, cycling through the given columns. */
export function dropRun(
  startTick: number,
  count: number,
  everyTicks: number,
  columns: readonly number[],
): SmileyDrop[] {
  if (columns.length < 1) throw new Error('dropRun needs at least one column');
  return Array.from({ length: count }, (_, index) => ({
    tick: startTick + index * everyTicks,
    x: columns[index % columns.length]!,
  }));
}

/** Two smilies at once, so the shared lean has to compromise. */
export function dropPairs(
  startTick: number,
  pairs: number,
  everyTicks: number,
  columns: readonly [number, number],
): SmileyDrop[] {
  return Array.from({ length: pairs }, (_, index) => index).flatMap((index) => [
    { tick: startTick + index * everyTicks, x: columns[0] },
    { tick: startTick + index * everyTicks, x: columns[1] },
  ]);
}

/** Every column at once, over and over. The shared lean has to pick a side. */
export function dropVolley(
  startTick: number,
  volleys: number,
  everyTicks: number,
  columns: readonly number[],
): SmileyDrop[] {
  if (columns.length < 1) throw new Error('dropVolley needs at least one column');
  return Array.from({ length: volleys }, (_, index) => index).flatMap((index) =>
    columns.map((x) => ({ tick: startTick + index * everyTicks, x })));
}

/** A wall of rocks with one hole in it, so the flock has a lane to aim for. */
export function rockWall(
  tick: number,
  lanes: readonly number[],
  gapLane: number,
  speed: number,
  kind: RockKind = 'boulder',
): RockSpawn[] {
  return lanes.filter((lane) => lane !== gapLane).map((lane) => ({ tick, y: lane, speed, kind }));
}

export function rockRun(
  startTick: number,
  count: number,
  everyTicks: number,
  lanes: readonly number[],
  speed: number,
  kind: RockKind = 'boulder',
  drift = 0,
): RockSpawn[] {
  if (lanes.length < 1) throw new Error('rockRun needs at least one lane');
  return Array.from({ length: count }, (_, index) => ({
    tick: startTick + index * everyTicks,
    y: lanes[index % lanes.length]!,
    speed,
    kind,
    ...(drift === 0 ? {} : { drift: index % 2 === 0 ? drift : -drift }),
  }));
}

/** Spike beds, laid out as [x, y, width] triples on whichever surface holds them. */
export function spikeStrips(
  idPrefix: string,
  strips: ReadonlyArray<readonly [x: number, y: number, width: number, facing?: 'up' | 'down']>,
): SpikeStripSpec[] {
  return strips.map(([x, y, width, facing], index) => ({
    id: `${idPrefix}${index + 1}`,
    x,
    y,
    width,
    ...(facing === undefined ? {} : { facing }),
  }));
}

/**
 * A run of ledges, laid out as [x, y, width] triples. Authoring stairs as a
 * table keeps the two things that actually matter — how far apart the steps
 * are and which columns they occupy — readable at a glance.
 *
 * Two rules govern a climbable staircase, both falling straight out of the
 * physics: a free bounce lifts 3.2 units, so a rise much over three needs a
 * hop; and a ledge sitting directly above another one blocks the bounce off it
 * unless they are at least six units apart.
 */
export function ledges(
  idPrefix: string,
  steps: ReadonlyArray<readonly [x: number, y: number, width: number]>,
): PlatformSpec[] {
  return steps.map(([x, y, width], index) => ({ id: `${idPrefix}${index + 1}`, x, y, width }));
}

/** Player-selected mood re-tunes forgiveness without touching the authoring. */
export function applyMood<Scenario extends SmilefallScenario>(
  scenario: Scenario,
  mood: SmilefallMoodId,
): Scenario {
  switch (mood) {
    case 'giggle':
      return { ...scenario, moodId: mood, frownLimit: scenario.frownLimit + 3, hopCharges: scenario.hopCharges + 1 };
    case 'guffaw':
      return { ...scenario, moodId: mood, frownLimit: Math.max(2, scenario.frownLimit - 2) };
    case 'cackle':
      return { ...scenario, moodId: mood, frownLimit: 1, hopCharges: Math.max(1, scenario.hopCharges - 1) };
    default:
      return { ...scenario, moodId: mood };
  }
}

export function requiredCatches(scenario: SmilefallScenario): number {
  return scenario.buckets.reduce((total, bucket) => total + bucket.capacity, 0);
}

export function validateLevel(scenario: SmilefallScenario): LevelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const needed = requiredCatches(scenario);
  const mouthY = scenario.height - toUnits(BUCKET_HEIGHT);
  const minimumMouth = toUnits(BUCKET_RIM) * 2 + toUnits(SMILEY_RADIUS) * 2;

  if (scenario.buckets.length < 1) errors.push('a stage needs at least one bucket');
  if (scenario.drops.length < 1) errors.push('a stage needs at least one smiley drop');

  const platforms = scenario.platforms ?? [];
  for (const platform of platforms) {
    if (platform.x < 0 || platform.x + platform.width > scenario.width) {
      errors.push(`platform ${platform.id} hangs outside the field`);
    }
    if (platform.y <= 0 || platform.y >= scenario.height) {
      errors.push(`platform ${platform.id} sits outside the field`);
    }
    if (platform.width < minimumMouth) errors.push(`platform ${platform.id} is too narrow to stand on`);
  }

  const spikes = scenario.spikes ?? [];
  for (const strip of spikes) {
    if (strip.x < 0 || strip.x + strip.width > scenario.width) {
      errors.push(`spike strip ${strip.id} hangs outside the field`);
    }
    if (strip.y <= 0 || strip.y > scenario.height) errors.push(`spike strip ${strip.id} sits outside the field`);
    if (strip.width <= 0) errors.push(`spike strip ${strip.id} has no width`);
    // Teeth across a mouth would make the pail unfillable, which no amount of
    // skill can work around.
    for (const bucket of scenario.buckets) {
      const base = bucket.baseY ?? scenario.height;
      if (strip.y > base || strip.y < base - toUnits(BUCKET_HEIGHT) - 1) continue;
      const left = bucket.drift ? Math.min(bucket.x, bucket.drift.minX) : bucket.x;
      const right = (bucket.drift ? Math.max(bucket.x, bucket.drift.maxX) : bucket.x) + bucket.width;
      if (strip.x < right && strip.x + strip.width > left) {
        errors.push(`spike strip ${strip.id} blocks the mouth of bucket ${bucket.id}`);
      }
    }
  }

  // Buckets only conflict with the ones sharing their shelf; a stage that
  // stacks tiers is allowed to put two pails in the same column.
  const byTier = new Map<number, BucketSpec[]>();
  for (const bucket of scenario.buckets) {
    const tier = bucket.baseY ?? scenario.height;
    const shelf = byTier.get(tier) ?? [];
    shelf.push(bucket);
    byTier.set(tier, shelf);
  }
  for (const [tier, shelf] of byTier) {
    const sorted = [...shelf].sort((a, b) => a.x - b.x);
    for (const [index, bucket] of sorted.entries()) {
      const left = bucket.drift ? Math.min(bucket.x, bucket.drift.minX) : bucket.x;
      const right = (bucket.drift ? Math.max(bucket.x, bucket.drift.maxX) : bucket.x) + bucket.width;
      if (left < 0 || right > scenario.width) errors.push(`bucket ${bucket.id} travels outside the field`);
      if (bucket.width < minimumMouth) errors.push(`bucket ${bucket.id} is narrower than a smiley can fit`);
      if (bucket.capacity < 1) errors.push(`bucket ${bucket.id} must hold at least one smiley`);
      if (tier !== scenario.height) {
        // An elevated pail needs a shelf wide enough to hold it, or it is
        // hanging in mid-air where nothing can climb to it.
        const shelfUnder = platforms.some((platform) =>
          platform.y === tier && platform.x <= left && platform.x + platform.width >= right);
        if (!shelfUnder) errors.push(`bucket ${bucket.id} stands on nothing at y=${tier}`);
      }
      const next = sorted[index + 1];
      if (next) {
        const nextLeft = next.drift ? Math.min(next.x, next.drift.minX) : next.x;
        if (nextLeft < right) errors.push(`bucket ${bucket.id} overlaps ${next.id}`);
      }
    }
  }

  for (const drop of scenario.drops) {
    if (drop.tick < 1) errors.push('every drop must be scheduled on tick 1 or later');
    if (drop.x < 0 || drop.x > scenario.width) errors.push(`drop at tick ${drop.tick} starts outside the field`);
    const spawnY = drop.y ?? scenario.dropY ?? toUnits(SMILEY_RADIUS);
    if (spawnY < 0 || spawnY > mouthY) errors.push(`drop at tick ${drop.tick} spawns outside the sky`);
  }

  for (const rock of scenario.rocks) {
    if (rock.tick < 1) errors.push('every rock must be scheduled on tick 1 or later');
    if (rock.speed <= 0) errors.push(`rock at tick ${rock.tick} must travel leftward at a positive speed`);
    const radius = toUnits(rockRadius(rock.kind ?? 'boulder'));
    if (rock.y - radius < 0 || rock.y + radius > mouthY) {
      warnings.push(`rock at tick ${rock.tick} starts clipped into the ceiling or the bucket line`);
    }
  }

  // On a bouncy stage with no rocks nothing can remove a smiley, so an exact
  // roster is the design rather than a mistake.
  // Rocks and spikes are the only two things that can remove a smiley on a
  // bouncy stage; without either, the roster is exact by design.
  const canLoseSmilies = scenario.floorRule !== 'bounce'
    || scenario.rocks.length > 0
    || spikes.length > 0;
  if (scenario.drops.length < needed) {
    errors.push(`only ${scenario.drops.length} smilies drop but ${needed} are needed to fill every bucket`);
  } else if (canLoseSmilies && scenario.drops.length < needed + 2) {
    // The roster is the real budget: the run ends the instant there are fewer
    // smilies left than slots, so a stage that can lose smilies needs spares.
    warnings.push('there are no spare smilies on a stage where smilies can be lost');
  }
  if (scenario.timeLimitTicks !== undefined) {
    const lastDrop = Math.max(...scenario.drops.map((drop) => drop.tick));
    if (lastDrop >= scenario.timeLimitTicks) warnings.push('some smilies drop after the clock runs out');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredCatches: needed,
    dropCount: scenario.drops.length,
  };
}

export function validateCatalog(stages: readonly SmilefallStage[]): CatalogValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slugs = new Set<string>();
  const numbers = new Set<number>();
  for (const stage of stages) {
    if (slugs.has(stage.metadata.slug)) errors.push(`duplicate slug: ${stage.metadata.slug}`);
    if (numbers.has(stage.metadata.number)) errors.push(`duplicate stage number: ${stage.metadata.number}`);
    slugs.add(stage.metadata.slug);
    numbers.add(stage.metadata.number);
    const result = validateLevel(stage.scenario);
    errors.push(...result.errors.map((error) => `${stage.metadata.slug}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${stage.metadata.slug}: ${warning}`));
  }
  return { valid: errors.length === 0, errors, warnings };
}
