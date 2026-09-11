import { describe, expect, it } from 'vitest';
import type { MaltlineInput } from '../src/core/types';
import { maltlineControllerInput } from '../src/telemetry/controller-input';

type RuntimeControllerInput = (...values: unknown[]) => MaltlineInput;

const runtimeInput = maltlineControllerInput as RuntimeControllerInput;
const DIRECTIONS = [-1, 0, 1] as const;
const ACTIONS = [false, true] as const;

const INVALID_DIRECTIONS: readonly unknown[] = [
  -2,
  2,
  -0.5,
  0.5,
  Number.NaN,
  Number.NEGATIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  '-1',
  '0',
  '1',
  false,
  true,
  null,
  undefined,
];

const INVALID_ACTIONS: readonly unknown[] = [
  -1,
  0,
  1,
  Number.NaN,
  Number.NEGATIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  'false',
  'true',
  null,
  undefined,
];

interface InvalidCall {
  readonly field: keyof MaltlineInput;
  readonly value: unknown;
  readonly args: readonly unknown[];
}

function invalidCalls(): InvalidCall[] {
  return [
    ...INVALID_DIRECTIONS.map((value) => ({
      field: 'stationDir' as const,
      value,
      args: [value, 0, false, false],
    })),
    ...INVALID_DIRECTIONS.map((value) => ({
      field: 'laneDir' as const,
      value,
      args: [0, value, false, false],
    })),
    ...INVALID_ACTIONS.map((value) => ({
      field: 'blend' as const,
      value,
      args: [0, 0, value, false],
    })),
    ...INVALID_ACTIONS.map((value) => ({
      field: 'serve' as const,
      value,
      args: [0, 0, false, value],
    })),
  ];
}

function expectInvalidCallsToThrow(calls: readonly InvalidCall[]): void {
  for (const { field, value, args } of calls) {
    expect(
      () => runtimeInput(...args),
      `${field} accepted ${String(value)}`,
    ).toThrow(new RegExp(field, 'u'));
  }
}

describe('built-in controller input cache boundary', () => {
  it('rejects every invalid runtime argument before and after warming all legal slots', () => {
    const calls = invalidCalls();
    expectInvalidCallsToThrow(calls);

    const warmed: MaltlineInput[] = [];
    for (const stationDir of DIRECTIONS) {
      for (const laneDir of DIRECTIONS) {
        for (const blend of ACTIONS) {
          for (const serve of ACTIONS) {
            const input = maltlineControllerInput(stationDir, laneDir, blend, serve);
            expect(input).toEqual({ stationDir, laneDir, blend, serve });
            expect(Object.isFrozen(input)).toBe(true);
            warmed.push(input);
          }
        }
      }
    }
    expect(warmed).toHaveLength(36);
    expect(new Set(warmed).size).toBe(36);

    expectInvalidCallsToThrow(calls);
  });

  it('rejects omitted arguments in every position regardless of warmed neighbors', () => {
    const missingByPosition: ReadonlyArray<readonly unknown[]> = [
      [undefined, 0, false, false],
      [0, undefined, false, false],
      [0, 0, undefined, false],
      [0, 0, false],
    ];
    for (const args of missingByPosition) {
      expect(() => runtimeInput(...args)).toThrow();
    }
  });

  it('returns the same validated frozen value for repeated legal calls', () => {
    for (const stationDir of DIRECTIONS) {
      for (const laneDir of DIRECTIONS) {
        for (const blend of ACTIONS) {
          for (const serve of ACTIONS) {
            expect(maltlineControllerInput(stationDir, laneDir, blend, serve)).toBe(
              maltlineControllerInput(stationDir, laneDir, blend, serve),
            );
          }
        }
      }
    }
  });
});
