import { PartitionEngine } from '../core/engine';
import { createClassicScenario } from '../core/scenarios';
import type { ControlInput, PartitionReplay, ReplayTick } from '../core/types';

interface ShowcaseMove extends ControlInput {
  ticks: number;
}

const SHOWCASE_MOVES: ShowcaseMove[] = [
  { ticks: 24, direction: 'idle', draw: 'off' },
  { ticks: 18, direction: 'right', draw: 'off' },
  { ticks: 32, direction: 'up', draw: 'fast' },
  { ticks: 34, direction: 'left', draw: 'off' },
  { ticks: 32, direction: 'down', draw: 'fast' },
  { ticks: 26, direction: 'right', draw: 'off' },
  { ticks: 32, direction: 'up', draw: 'fast' },
  { ticks: 14, direction: 'left', draw: 'off' },
  { ticks: 32, direction: 'down', draw: 'fast' },
  { ticks: 10, direction: 'idle', draw: 'off' },
];

export function createShowcaseReplay(seed = 23): PartitionReplay {
  const engine = new PartitionEngine(createClassicScenario(seed));
  const ticks: ReplayTick[] = [];
  for (const move of SHOWCASE_MOVES) {
    engine.setInput({ direction: move.direction, draw: move.draw });
    for (let index = 0; index < move.ticks && engine.snapshot().status === 'running'; index++) {
      const applied = engine.snapshot();
      const result = engine.step();
      ticks.push({
        tick: result.state.tick,
        input: { ...applied.currentInput },
        controllerVersion: applied.controllerVersion,
        controlEvents: [],
        events: structuredClone(result.events),
      });
    }
  }
  return {
    version: 1,
    scenario: structuredClone(engine.scenario),
    ticks,
    finalState: engine.snapshot(),
  };
}
