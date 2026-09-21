import type { CircleSpec, RectangleSpec, RollSignalCourse } from '../core/types';
import type { CatalogValidationResult, CourseValidationResult } from './types';

function containsPoint(rectangle: RectangleSpec, x: number, y: number): boolean {
  return x >= rectangle.x && x <= rectangle.x + rectangle.width
    && y >= rectangle.y && y <= rectangle.y + rectangle.height;
}

function supported(course: RollSignalCourse, point: { x: number; y: number }): boolean {
  return course.decks.some((deck) => containsPoint(deck, point.x, point.y));
}

function checkRectangle(spec: RectangleSpec, label: string, errors: string[]): void {
  if (!spec.id.trim()) errors.push(`${label} needs an id`);
  if (![spec.x, spec.y, spec.width, spec.height].every(Number.isFinite)) errors.push(`${label} geometry must be finite`);
  if (spec.width <= 0 || spec.height <= 0) errors.push(`${label} must have positive width and height`);
}

function checkCircle(course: RollSignalCourse, spec: CircleSpec, label: string, errors: string[]): void {
  if (!spec.id.trim()) errors.push(`${label} needs an id`);
  if (![spec.x, spec.y, spec.radius].every(Number.isFinite) || spec.radius <= 0) {
    errors.push(`${label} must have finite geometry and a positive radius`);
  }
  if (!supported(course, spec)) errors.push(`${label} is not supported by a deck`);
}

export function validateRollSignalCourse(course: RollSignalCourse): CourseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const registerId = (id: string, label: string): void => {
    if (ids.has(id)) errors.push(`duplicate id ${id} (${label})`);
    ids.add(id);
  };

  if (!course.id.trim()) errors.push('course needs an id');
  if (!course.name.trim()) errors.push('course needs a name');
  if (!Number.isInteger(course.number) || course.number < 1) errors.push('course number must be a positive integer');
  if (!Number.isInteger(course.timeLimitTicks) || course.timeLimitTicks < 1) errors.push('time limit must be positive ticks');
  if (!Number.isInteger(course.parTicks) || course.parTicks < 1 || course.parTicks > course.timeLimitTicks) {
    errors.push('par must be positive and no longer than the time limit');
  }
  if (!Number.isInteger(course.referenceMaxTicks) || course.referenceMaxTicks < 1 || course.referenceMaxTicks > course.timeLimitTicks) {
    errors.push('reference limit must be positive and no longer than the time limit');
  }
  if (course.decks.length < 1) errors.push('course needs at least one deck');
  if (course.referenceWaypoints.length < 1) errors.push('course needs reference waypoints');
  if (!supported(course, course.spawn)) errors.push('spawn is not supported by a deck');

  for (const deck of course.decks) {
    registerId(deck.id, 'deck');
    checkRectangle(deck, `deck ${deck.id}`, errors);
    if (deck.surface !== undefined && deck.surface !== 'normal' && deck.surface !== 'slick') {
      errors.push(`deck ${deck.id} has an unknown surface`);
    }
  }
  for (const rail of course.rails) {
    registerId(rail.id, 'rail');
    checkRectangle(rail, `rail ${rail.id}`, errors);
  }
  for (const checkpoint of course.checkpoints) {
    registerId(checkpoint.id, 'checkpoint');
    checkCircle(course, checkpoint, `checkpoint ${checkpoint.id}`, errors);
  }
  for (const ring of course.rings) {
    registerId(ring.id, 'ring');
    checkCircle(course, ring, `ring ${ring.id}`, errors);
    if (ring.points !== undefined && (!Number.isSafeInteger(ring.points) || ring.points < 0 || ring.points > 1_000_000)) {
      errors.push(`ring ${ring.id} points must be a non-negative safe integer no greater than 1000000`);
    }
  }
  registerId(course.goal.id, 'goal');
  checkCircle(course, course.goal, `goal ${course.goal.id}`, errors);

  for (const zone of course.zones ?? []) {
    registerId(zone.id, 'zone');
    checkRectangle(zone, `zone ${zone.id}`, errors);
    if (zone.kind !== 'wind' && zone.kind !== 'conveyor') errors.push(`zone ${zone.id} has an unknown kind`);
    if (!Number.isInteger(zone.forceX) || !Number.isInteger(zone.forceY)) {
      errors.push(`zone ${zone.id} force must use integer fixed-point acceleration`);
    }
    if (Math.abs(zone.forceX) > 40 || Math.abs(zone.forceY) > 40) {
      errors.push(`zone ${zone.id} force exceeds the safe acceleration bound`);
    }
  }
  for (const obstacle of course.obstacles ?? []) {
    registerId(obstacle.id, 'obstacle');
    checkRectangle(obstacle, `obstacle ${obstacle.id}`, errors);
    if (obstacle.motion && (!Number.isInteger(obstacle.motion.periodTicks) || obstacle.motion.periodTicks < 2)) {
      errors.push(`obstacle ${obstacle.id} needs a motion period of at least two ticks`);
    }
    if (obstacle.motion && (!Number.isFinite(obstacle.motion.range) || obstacle.motion.range < 0)) {
      errors.push(`obstacle ${obstacle.id} motion range must be non-negative`);
    }
    if (obstacle.motion && obstacle.motion.axis !== 'x' && obstacle.motion.axis !== 'y') {
      errors.push(`obstacle ${obstacle.id} motion axis must be x or y`);
    }
    if (obstacle.motion?.phaseTicks !== undefined && !Number.isInteger(obstacle.motion.phaseTicks)) {
      errors.push(`obstacle ${obstacle.id} motion phase must use integer ticks`);
    }
    if (obstacle.penaltyTicks !== undefined
      && (!Number.isSafeInteger(obstacle.penaltyTicks) || obstacle.penaltyTicks < 0 || obstacle.penaltyTicks > course.timeLimitTicks)) {
      errors.push(`obstacle ${obstacle.id} penalty must be a non-negative safe integer no greater than the time limit`);
    }
  }
  const gateIds = new Set((course.gates ?? []).map((gate) => gate.id));
  const padIds = new Set((course.relayPads ?? []).map((pad) => pad.id));
  for (const pad of course.relayPads ?? []) {
    registerId(pad.id, 'relay pad');
    checkCircle(course, pad, `relay pad ${pad.id}`, errors);
    if (!gateIds.has(pad.gateId)) errors.push(`relay pad ${pad.id} refers to missing gate ${pad.gateId}`);
  }
  for (const gate of course.gates ?? []) {
    registerId(gate.id, 'gate');
    checkRectangle(gate, `gate ${gate.id}`, errors);
    if (gate.requiredPadIds.length < 1) errors.push(`gate ${gate.id} needs at least one relay pad`);
    for (const padId of gate.requiredPadIds) {
      if (!padIds.has(padId)) errors.push(`gate ${gate.id} requires missing pad ${padId}`);
    }
  }
  for (const [index, waypoint] of course.referenceWaypoints.entries()) {
    if (!Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.y)) errors.push(`reference waypoint ${index + 1} must be finite`);
    else if (!supported(course, waypoint)) errors.push(`reference waypoint ${index + 1} is not supported by a deck`);
  }
  if (course.fallPenaltyTicks !== undefined && (!Number.isInteger(course.fallPenaltyTicks) || course.fallPenaltyTicks < 0)) {
    errors.push('fall penalty must be a non-negative integer');
  }
  if (course.rails.length === 0) warnings.push('course has no safety rails');
  if (course.checkpoints.length === 0) warnings.push('course has no checkpoint beyond its start');
  return { valid: errors.length === 0, errors, warnings };
}

export function validateRollSignalCatalog(courses: readonly RollSignalCourse[]): CatalogValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const courseResults: Record<string, CourseValidationResult> = {};
  const courseIds = new Set<string>();
  const numbers = new Set<number>();
  for (const course of courses) {
    const result = validateRollSignalCourse(course);
    courseResults[course.id] = result;
    errors.push(...result.errors.map((error) => `${course.id}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${course.id}: ${warning}`));
    if (courseIds.has(course.id)) errors.push(`duplicate course id ${course.id}`);
    if (numbers.has(course.number)) errors.push(`duplicate course number ${course.number}`);
    courseIds.add(course.id);
    numbers.add(course.number);
  }
  const ordered = [...courses].sort((a, b) => a.number - b.number);
  ordered.forEach((course, index) => {
    if (course.number !== index + 1) errors.push(`course order skips number ${index + 1}`);
  });
  return { valid: errors.length === 0, errors, warnings, courseResults };
}
