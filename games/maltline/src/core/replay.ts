import { MaltlineEngine } from './engine';
import type { MaltlineInput, MaltlineReplay, MaltlineScenario, RunContext } from './types';
import { IDLE_INPUT } from './types';

/** Runs a scenario from recorded inputs and returns the resulting replay. */
export function replayMaltline(scenario: MaltlineScenario, run: RunContext, inputs: MaltlineInput[]): MaltlineReplay {
  const engine = new MaltlineEngine(scenario, run);
  const ticks = [];
  for (const input of inputs) {
    engine.setInput(input);
    const result = engine.step();
    ticks.push({ tick: result.state.tick, input: { ...input }, events: result.events });
    if (result.state.status !== 'running') break;
  }
  return {
    version: 1,
    scenario,
    run,
    ticks,
    finalState: engine.snapshot(),
  };
}

/** Replays always cover a whole stage; idle padding runs the clock out. */
export function idleInputs(count: number): MaltlineInput[] {
  return Array.from({ length: count }, () => ({ ...IDLE_INPUT }));
}
