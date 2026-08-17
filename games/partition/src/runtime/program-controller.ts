import type { ControlInput, PartitionState } from '../core/types';
import type { PartitionController } from './session';

export interface ProgramStep {
  ticks: number;
  input: ControlInput;
}

export interface SequenceProgram {
  steps: ProgramStep[];
  loop?: boolean;
  fallback?: ControlInput;
}

interface SequenceMemory {
  step: number;
  remaining: number;
}

export function validateSequenceProgram(value: unknown): SequenceProgram {
  if (value === null || typeof value !== 'object') throw new Error('program must be an object');
  const candidate = value as Partial<SequenceProgram>;
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0 || candidate.steps.length > 256) {
    throw new Error('program.steps must contain 1 to 256 timed control steps');
  }
  const validDirections = new Set(['up', 'down', 'left', 'right', 'idle']);
  const validDrawModes = new Set(['off', 'fast', 'slow']);
  for (const [index, step] of candidate.steps.entries()) {
    if (!Number.isInteger(step?.ticks) || step.ticks < 1 || step.ticks > 10_000) {
      throw new Error(`program.steps[${index}].ticks must be an integer in [1, 10000]`);
    }
    if (!step.input || !validDirections.has(step.input.direction) || !validDrawModes.has(step.input.draw)) {
      throw new Error(`program.steps[${index}].input is invalid`);
    }
  }
  if (candidate.fallback) {
    if (!validDirections.has(candidate.fallback.direction) || !validDrawModes.has(candidate.fallback.draw)) {
      throw new Error('program.fallback is invalid');
    }
  }
  return structuredClone(candidate as SequenceProgram);
}

export function sequenceController(programValue: unknown): PartitionController<SequenceMemory> {
  const program = validateSequenceProgram(programValue);
  return {
    reset: (_state: Readonly<PartitionState>) => ({ step: 0, remaining: program.steps[0]!.ticks }),
    onTick: (_state, _events, memory) => {
      if (memory.step >= program.steps.length) return program.fallback ?? { direction: 'idle', draw: 'off' };
      const current = program.steps[memory.step]!;
      memory.remaining--;
      if (memory.remaining <= 0) {
        memory.step++;
        if (memory.step >= program.steps.length && program.loop) memory.step = 0;
        if (memory.step < program.steps.length) memory.remaining = program.steps[memory.step]!.ticks;
      }
      return current.input;
    },
  };
}

