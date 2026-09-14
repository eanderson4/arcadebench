import { describe, expect, it, vi } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import { normalizeMaltlineInput } from '../src/core/input';
import { parseMaltlineReplay, replayMaltline } from '../src/core/replay';
import type { MaltlineInput } from '../src/core/types';
import { encodeMaltlineInputRuns } from '../src/core/proof';
import { runMaltlineCampaignTelemetry } from '../src/telemetry/campaign-telemetry';

const VALID_INPUT: MaltlineInput = {
  stationDir: 1,
  laneDir: -1,
  blend: true,
  serve: false,
};

function asInput(value: unknown): MaltlineInput {
  return value as MaltlineInput;
}

describe('normalizeMaltlineInput', () => {
  it('copies exactly the four primitive fields and canonicalizes negative zero', () => {
    const source = { ...VALID_INPUT, stationDir: -0, laneDir: -0 };
    const normalized = normalizeMaltlineInput(source);

    expect(normalized).toEqual({ stationDir: 0, laneDir: 0, blend: true, serve: false });
    expect(Object.is(normalized.stationDir, -0)).toBe(false);
    expect(Object.is(normalized.laneDir, -0)).toBe(false);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized).not.toBe(source);
  });

  it.each([null, undefined, 1, 'input', true, [], () => VALID_INPUT])(
    'rejects a non-record input: %s',
    (value) => {
      expect(() => normalizeMaltlineInput(value)).toThrow(/must be an object/i);
    },
  );

  it.each([
    ['stationDir', -2],
    ['stationDir', 2],
    ['stationDir', 0.5],
    ['stationDir', Number.NaN],
    ['stationDir', Number.POSITIVE_INFINITY],
    ['stationDir', '1'],
    ['laneDir', -2],
    ['laneDir', 2],
    ['laneDir', 0.5],
    ['laneDir', Number.NaN],
    ['laneDir', Number.NEGATIVE_INFINITY],
    ['laneDir', '0'],
    ['blend', 0],
    ['blend', 'true'],
    ['blend', null],
    ['serve', 1],
    ['serve', 'false'],
    ['serve', null],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    expect(() => normalizeMaltlineInput({ ...VALID_INPUT, [field]: value }))
      .toThrow(field.endsWith('Dir') ? new RegExp(field, 'u') : /booleans/u);
  });

  it.each(['stationDir', 'laneDir', 'blend', 'serve'] as const)(
    'rejects a missing %s field',
    (field) => {
      const candidate = { ...VALID_INPUT } as Record<string, unknown>;
      delete candidate[field];
      expect(() => normalizeMaltlineInput(candidate)).toThrow(/exactly/u);
    },
  );

  it('rejects string, symbol, and non-enumerable extras', () => {
    expect(() => normalizeMaltlineInput({ ...VALID_INPUT, extra: 1 })).toThrow(/exactly/u);
    expect(() => normalizeMaltlineInput({ ...VALID_INPUT, [Symbol('extra')]: 1 })).toThrow(/exactly/u);
    const hiddenExtra = { ...VALID_INPUT };
    Object.defineProperty(hiddenExtra, 'extra', { value: 1, enumerable: false });
    expect(() => normalizeMaltlineInput(hiddenExtra)).toThrow(/exactly/u);
  });

  it.each(['stationDir', 'laneDir', 'blend', 'serve'] as const)(
    'rejects a %s getter without invoking it',
    (field) => {
      const getter = vi.fn(() => VALID_INPUT[field]);
      const candidate = { ...VALID_INPUT };
      Object.defineProperty(candidate, field, { enumerable: true, get: getter });

      expect(() => normalizeMaltlineInput(candidate)).toThrow(/data property/u);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('rejects an extra getter without invoking it', () => {
    const getter = vi.fn(() => 1);
    const candidate = { ...VALID_INPUT };
    Object.defineProperty(candidate, 'extra', { enumerable: true, get: getter });

    expect(() => normalizeMaltlineInput(candidate)).toThrow(/exactly/u);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('shared Maltline input boundaries', () => {
  it('leaves engine state unchanged when validation fails before a tick', () => {
    const engine = new MaltlineEngine(MALTLINE_CAMPAIGN[2]!);
    const before = engine.snapshot();

    expect(() => engine.setInput(asInput({ ...VALID_INPUT, laneDir: Number.NaN })))
      .toThrow(/laneDir/u);
    expect(engine.snapshot()).toEqual(before);
  });

  it('does not invoke an engine input getter or mutate pre-tick state', () => {
    const engine = new MaltlineEngine(MALTLINE_CAMPAIGN[2]!);
    const before = engine.snapshot();
    const getter = vi.fn(() => true);
    const candidate = { ...VALID_INPUT };
    Object.defineProperty(candidate, 'serve', { enumerable: true, get: getter });

    expect(() => engine.setInput(candidate)).toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
    expect(engine.snapshot()).toEqual(before);
  });

  it('defensively copies a valid input supplied to the engine', () => {
    const engine = new MaltlineEngine(MALTLINE_CAMPAIGN[2]!);
    const source: MaltlineInput = { ...VALID_INPUT };
    engine.setInput(source);
    source.stationDir = -1;
    source.laneDir = 1;
    source.blend = false;
    source.serve = true;

    expect(engine.snapshot().currentInput).toEqual(VALID_INPUT);
  });

  it('fails malformed controller output before telemetry advances a tick', () => {
    const getter = vi.fn(() => true);
    const malformed = { ...VALID_INPUT };
    Object.defineProperty(malformed, 'blend', { enumerable: true, get: getter });
    const controller = {
      id: 'malformed-controller-v1',
      fingerprintData: { algorithm: 'malformed-test', version: 1 },
      create: () => () => malformed,
    } as const;

    expect(() => runMaltlineCampaignTelemetry({
      scenarios: [MALTLINE_CAMPAIGN[0]!],
      controller,
      tickLimitPerStage: 1,
    })).toThrow(/data property/u);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects malformed proof encoding and replay generation inputs', () => {
    const extra = asInput({ ...VALID_INPUT, unexpected: true });
    expect(() => encodeMaltlineInputRuns([extra])).toThrow(/exactly/u);
    expect(() => replayMaltline(
      MALTLINE_CAMPAIGN[0]!,
      { lives: 4, score: 0 },
      [extra],
    )).toThrow(/exactly/u);
  });

  it('normalizes parsed rich-replay inputs and rejects malformed ones', () => {
    const replay = replayMaltline(
      MALTLINE_CAMPAIGN[0]!,
      { lives: 4, score: 0 },
      [{ stationDir: -0, laneDir: -0, blend: false, serve: false }],
    );
    const parsed = parseMaltlineReplay(JSON.stringify(replay));
    expect(parsed.ticks[0]!.input).toEqual({
      stationDir: 0,
      laneDir: 0,
      blend: false,
      serve: false,
    });

    const malformed = structuredClone(replay) as unknown as {
      ticks: Array<{ input: Record<string, unknown> }>;
    };
    malformed.ticks[0]!.input.extra = true;
    expect(() => parseMaltlineReplay(JSON.stringify(malformed))).toThrow(/exactly/u);
  });
});
