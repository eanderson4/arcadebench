import { MaltlineEngine } from './engine';
import { normalizeMaltlineInput } from './input';
import type { MaltlineInput, MaltlineReplay, MaltlineScenario, RunContext } from './types';
import { IDLE_INPUT } from './types';

/** Rich local replay generation. Version 2 includes fulfillment-aware state and events. */
export const MALTLINE_REPLAY_VERSION = 2 as const;

/** Runs a scenario from recorded inputs and returns the resulting replay. */
export function replayMaltline(scenario: MaltlineScenario, run: RunContext, inputs: MaltlineInput[]): MaltlineReplay {
  const engine = new MaltlineEngine(scenario, run);
  const ticks = [];
  for (let index = 0; index < inputs.length; index++) {
    const input = normalizeMaltlineInput(inputs[index], `Maltline replay input ${index + 1}`);
    engine.setInput(input);
    const result = engine.step();
    ticks.push({ tick: result.state.tick, input: { ...input }, events: result.events });
    if (result.state.status !== 'running') break;
  }
  return {
    version: MALTLINE_REPLAY_VERSION,
    scenario: structuredClone(scenario),
    run: { ...run },
    ticks,
    finalState: engine.snapshot(),
  };
}

/** Parses the rich local artifact and explicitly rejects the pre-fulfillment generation. */
export function parseMaltlineReplay(json: string): MaltlineReplay {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Maltline replay must be an object');
  }
  const replay = value as Partial<MaltlineReplay> & { version?: unknown };
  if (replay.version !== MALTLINE_REPLAY_VERSION) {
    throw new Error(`unsupported Maltline replay version: ${String(replay.version)}`);
  }
  if (!replay.scenario || !replay.run || !Array.isArray(replay.ticks) || !replay.finalState) {
    throw new Error('Maltline replay is missing scenario, run, ticks, or finalState');
  }
  const ticks = replay.ticks.map((tick, index) => {
    if (tick === null || typeof tick !== 'object' || Array.isArray(tick)) {
      throw new Error(`Maltline replay tick ${index + 1} must be an object`);
    }
    const input = normalizeMaltlineInput(
      (tick as { input?: unknown }).input,
      `Maltline replay tick ${index + 1} input`,
    );
    return { ...tick, input: { ...input } };
  });
  return { ...replay, ticks } as MaltlineReplay;
}

/** Replays always cover a whole stage; idle padding runs the clock out. */
export function idleInputs(count: number): MaltlineInput[] {
  return Array.from({ length: count }, () => ({ ...IDLE_INPUT }));
}
