import { describe, expect, it } from 'vitest';
import { ROLLSIGNAL_COURSES, validateRollSignalCatalog, validateRollSignalCourse } from '../src';

describe('authored course catalog', () => {
  it('contains eight valid, progressively distinct courses', () => {
    const result = validateRollSignalCatalog(ROLLSIGNAL_COURSES);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(ROLLSIGNAL_COURSES).toHaveLength(8);
    expect(ROLLSIGNAL_COURSES.map((course) => course.name)).toEqual([
      'First Chime', 'Silver Switchbacks', 'Glass Current', 'Crosswind Causeway',
      'Brass Transit', 'Clockwork Crossing', 'Relay Run', 'Signal Crown',
    ]);
    expect(new Set(ROLLSIGNAL_COURSES.flatMap((course) => course.metadata.mechanics)).size).toBeGreaterThanOrEqual(9);
  });

  it('rejects unsupported goals and duplicate authored ids', () => {
    const source = ROLLSIGNAL_COURSES[0]!;
    const invalid = structuredClone(source);
    invalid.goal.x = 5_000;
    invalid.rings[0]!.id = invalid.decks[0]!.id;
    const result = validateRollSignalCourse(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/duplicate id/);
    expect(result.errors.join(' ')).toMatch(/goal .* not supported/);
  });
});
