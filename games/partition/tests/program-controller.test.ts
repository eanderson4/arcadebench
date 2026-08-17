import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { createClassicScenario } from '../src/core/scenarios';
import { sequenceController, validateSequenceProgram } from '../src/runtime/program-controller';

describe('sequenceController', () => {
  it('runs timed steps and then falls back', () => {
    const controller = sequenceController({
      steps: [
        { ticks: 2, input: { direction: 'left', draw: 'off' } },
        { ticks: 1, input: { direction: 'up', draw: 'fast' } },
      ],
      fallback: { direction: 'idle', draw: 'off' },
    });
    const state = new PartitionEngine(createClassicScenario(1)).snapshot();
    const memory = controller.reset(state);
    expect(controller.onTick(state, [], memory)?.direction).toBe('left');
    expect(controller.onTick(state, [], memory)?.direction).toBe('left');
    expect(controller.onTick(state, [], memory)?.direction).toBe('up');
    expect(controller.onTick(state, [], memory)?.direction).toBe('idle');
  });

  it('rejects zero-duration steps', () => {
    expect(() =>
      validateSequenceProgram({ steps: [{ ticks: 0, input: { direction: 'left', draw: 'off' } }] }),
    ).toThrow(/ticks/);
  });
});

