import { BUCKET_HEIGHT, BUCKET_RIM, SMILEY_RADIUS, toUnits } from '../core/physics';
import { rockRadius } from '../core/engine';
import type {
  BucketSpec,
  PlatformSpec,
  RockHazard,
  RockKind,
  RockSpawn,
  SmileyDrop,
  SmilefallScenario,
  SpikeStripSpec,
} from '../core/types';
import type {
  CatalogValidationResult,
  LevelValidationResult,
  ProgressionValidationResult,
  SmilefallMechanic,
  SmilefallMoodId,
  SmilefallStage,
} from './types';

export const MOOD_ORDER: readonly SmilefallMoodId[] = ['giggle', 'chuckle', 'guffaw', 'cackle'];

export const MOOD_LABELS: Record<SmilefallMoodId, string> = {
  giggle: 'Giggle',
  chuckle: 'Chuckle',
  guffaw: 'Guffaw',
  cackle: 'Cackle',
};

export const MOOD_BLURBS: Record<SmilefallMoodId, string> = {
  giggle: 'More reserve smiles, more time, and a roomy hop meter.',
  chuckle: 'The stage exactly as it was authored.',
  guffaw: 'A smaller reserve and a tighter clock.',
  cackle: 'Very little reserve. Every spike matters.',
};

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

export function rockWall(
  tick: number,
  lanes: readonly number[],
  gapLane: number,
  speed: number,
  kind: RockKind = 'boulder',
  hazard: RockHazard = 'plain',
): RockSpawn[] {
  return lanes
    .filter((lane) => lane !== gapLane)
    .map((lane) => ({ tick, y: lane, speed, kind, hazard }));
}

export function rockRun(
  startTick: number,
  count: number,
  everyTicks: number,
  lanes: readonly number[],
  speed: number,
  kind: RockKind = 'boulder',
  hazard: RockHazard = 'plain',
  drift = 0,
): RockSpawn[] {
  if (lanes.length < 1) throw new Error('rockRun needs at least one lane');
  return Array.from({ length: count }, (_, index) => ({
    tick: startTick + index * everyTicks,
    y: lanes[index % lanes.length]!,
    speed,
    kind,
    hazard,
    ...(drift === 0 ? {} : { drift: index % 2 === 0 ? drift : -drift }),
  }));
}

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

export function ledges(
  idPrefix: string,
  steps: ReadonlyArray<readonly [x: number, y: number, width: number]>,
): PlatformSpec[] {
  return steps.map(([x, y, width], index) => ({ id: `${idPrefix}${index + 1}`, x, y, width }));
}

function retuneReserve(drops: readonly SmileyDrop[], required: number, adjustment: number): SmileyDrop[] {
  const targetCount = Math.max(required + 1, drops.length + adjustment);
  if (targetCount <= drops.length) return drops.slice(0, targetCount).map((drop) => ({ ...drop }));
  const result = drops.map((drop) => ({ ...drop }));
  const ordered = [...drops].sort((a, b) => a.tick - b.tick);
  const lastTick = ordered.at(-1)?.tick ?? 1;
  const spacing = Math.max(8, ordered.length > 1
    ? ordered.at(-1)!.tick - ordered.at(-2)!.tick
    : 30);
  for (let index = 0; result.length < targetCount; index++) {
    const template = drops[index % drops.length]!;
    result.push({ ...template, tick: lastTick + spacing * (index + 1) });
  }
  return result;
}

/** Player-selected mood retunes the actual reserve, clock, and hop meter. */
export function applyMood<Scenario extends SmilefallScenario>(
  scenario: Scenario,
  mood: SmilefallMoodId,
): Scenario {
  const required = requiredCatches(scenario);
  const settings = {
    giggle: { reserve: 2, hops: 1, clock: 1.12 },
    chuckle: { reserve: 0, hops: 0, clock: 1 },
    guffaw: { reserve: -1, hops: 0, clock: 0.95 },
    cackle: { reserve: -2, hops: -1, clock: 0.9 },
  }[mood];
  const drops = retuneReserve(scenario.drops, required, settings.reserve);
  const lastDrop = Math.max(...drops.map((drop) => drop.tick));
  const timeLimitTicks = scenario.timeLimitTicks === undefined
    ? undefined
    : Math.max(lastDrop + scenario.ticksPerSecond * 4, Math.round(scenario.timeLimitTicks * settings.clock));
  return {
    ...scenario,
    moodId: mood,
    drops,
    hopCharges: Math.max(1, scenario.hopCharges + settings.hops),
    ...(timeLimitTicks === undefined ? {} : { timeLimitTicks }),
  };
}

export function requiredCatches(scenario: SmilefallScenario): number {
  return scenario.buckets.reduce((total, bucket) => total + bucket.capacity, 0);
}

export function startingReserve(scenario: SmilefallScenario): number {
  return scenario.drops.length - requiredCatches(scenario);
}

export function hasLethalHazards(scenario: SmilefallScenario): boolean {
  return (scenario.spikes?.length ?? 0) > 0
    || scenario.rocks.some((rock) => rock.hazard === 'spiked');
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

  if (scenario.drops.length <= needed) {
    errors.push(
      `only ${scenario.drops.length} smilies drop for ${needed} slots; every stage needs at least one reserve smile`,
    );
  } else if (hasLethalHazards(scenario) && startingReserve(scenario) < 3) {
    warnings.push('a lethal stage has fewer than three reserve smiles');
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

function validateMechanicClaims(stage: SmilefallStage): string[] {
  const mechanics = new Set(stage.metadata.mechanics);
  const errors: string[] = [];
  const hasPlain = stage.scenario.rocks.some((rock) => (rock.hazard ?? 'plain') === 'plain');
  const hasSpiked = stage.scenario.rocks.some((rock) => rock.hazard === 'spiked');
  const checks: Array<[SmilefallMechanic, boolean]> = [
    ['plain-rocks', hasPlain],
    ['spiked-rocks', hasSpiked],
    ['fixed-spikes', (stage.scenario.spikes?.length ?? 0) > 0],
    ['moving-buckets', stage.scenario.buckets.some((bucket) => bucket.drift !== undefined)],
    ['platforms', (stage.scenario.platforms?.length ?? 0) > 0],
    ['vertical-camera', (stage.scenario.viewHeight ?? stage.scenario.height) < stage.scenario.height],
    ['stacked-buckets', stage.scenario.buckets.some((bucket) => bucket.baseY !== undefined)],
    ['downward-spikes', (stage.scenario.spikes ?? []).some((spike) => spike.facing === 'down')],
  ];
  for (const [mechanic, present] of checks) {
    if (mechanics.has(mechanic) && !present) errors.push(`${mechanic} is claimed but not authored`);
  }
  return errors;
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
    errors.push(...validateMechanicClaims(stage).map((error) => `${stage.metadata.slug}: ${error}`));
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateArcadeProgression(stages: readonly SmilefallStage[]): ProgressionValidationResult {
  const base = validateCatalog(stages);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const seen = new Set<SmilefallMechanic>();
  const introductions: Record<string, readonly SmilefallMechanic[]> = {};
  if (stages.length < 8 || stages.length > 10) {
    errors.push('an arcade run must contain between 8 and 10 stages');
  }
  for (const [index, stage] of stages.entries()) {
    const next = [...new Set(stage.metadata.mechanics)].filter((mechanic) => !seen.has(mechanic));
    introductions[stage.metadata.slug] = next;
    if (index > 0 && next.length > 2) {
      errors.push(`${stage.metadata.slug} introduces ${next.length} mechanics; the limit is two`);
    }
    for (const mechanic of stage.metadata.mechanics) seen.add(mechanic);
  }
  for (const stage of stages.slice(0, 3)) {
    if (hasLethalHazards(stage.scenario)) errors.push(`${stage.metadata.slug} is lethal before stage 4`);
  }
  if (stages[3] && !hasLethalHazards(stages[3].scenario)) {
    errors.push('stage 4 must introduce the first lethal hazard');
  }
  const fifth = stages[4];
  if (fifth) {
    const hazards = new Set(fifth.scenario.rocks.map((rock) => rock.hazard ?? 'plain'));
    if (!hazards.has('plain') || !hazards.has('spiked')) {
      errors.push('stage 5 must mix plain and spiked rocks');
    }
  }
  for (const stage of stages.slice(-3)) {
    if ((stage.scenario.platforms?.length ?? 0) < 1
      || (stage.scenario.viewHeight ?? stage.scenario.height) >= stage.scenario.height
      || !hasLethalHazards(stage.scenario)) {
      errors.push(`${stage.metadata.slug} must be a vertical platform stage with lethal spikes`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, introductions };
}
