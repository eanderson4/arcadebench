import { describe, expect, it } from 'vitest';
import { MaltlineEngine } from '../src/core/engine';
import { replayMaltline } from '../src/core/replay';
import type { FlavorId, MaltlineInput } from '../src/core/types';
import { FixedStepClock } from '../src/viewer/fixed-step-clock';
import {
  MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER,
  MaltlineViewerInputAdapter,
  type MaltlineViewerPreStepState,
} from '../src/viewer/viewer-input-adapter';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';

const CADENCE = { stationRepeatTicks: 5, laneRepeatTicks: 5 } as const;
const IDLE_PRE_STEP: MaltlineViewerPreStepState = {
  player: { holding: null, blending: null },
};

function preStep(
  holding: FlavorId | null = null,
  blending: FlavorId | null = null,
  lane?: number,
): MaltlineViewerPreStepState {
  return { player: { lane, holding, blending } };
}

function inputTicks(
  adapter: MaltlineViewerInputAdapter,
  firstTick: number,
  lastTick: number,
  state: MaltlineViewerPreStepState = IDLE_PRE_STEP,
): Array<{ tick: number; input: MaltlineInput }> {
  const inputs: Array<{ tick: number; input: MaltlineInput }> = [];
  for (let tick = firstTick; tick <= lastTick; tick++) {
    inputs.push({ tick, input: adapter.inputForTick(tick, state) });
  }
  return inputs;
}

describe('Maltline viewer input adapter', () => {
  it('turns a station and lane tap at every cadence phase into exactly one engine move', () => {
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[2]!;
    for (let phase = 0; phase < scenario.stationRepeatTicks; phase++) {
      const adapter = new MaltlineViewerInputAdapter(scenario);
      const engine = new MaltlineEngine(scenario);
      for (let tick = 1; tick <= phase; tick++) {
        engine.setInput(adapter.inputForTick(tick, engine.snapshot()));
        engine.step();
      }
      adapter.keyDown('KeyD');
      adapter.keyDown('ArrowDown');
      adapter.keyUp('KeyD');
      adapter.keyUp('ArrowDown');

      const emitted: MaltlineInput[] = [];
      while (engine.snapshot().tick < 25) {
        const input = adapter.inputForTick(engine.snapshot().tick + 1, engine.snapshot());
        emitted.push(input);
        engine.setInput(input);
        engine.step();
      }

      expect(emitted.filter((input) => input.stationDir !== 0)).toHaveLength(1);
      expect(emitted.filter((input) => input.laneDir !== 0)).toHaveLength(1);
      expect(engine.snapshot().player).toMatchObject({ station: 1, lane: 1 });
    }
  });

  it('moves a held direction first at the next eligible tick, then delays and repeats by cadence', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    inputTicks(adapter, 1, 2);
    adapter.keyDown('KeyD');
    adapter.keyDown('ArrowDown');
    const outputs = inputTicks(adapter, 3, 35);
    const stationTicks = outputs
      .filter(({ input }) => input.stationDir === 1)
      .map(({ tick }) => tick);
    const laneTicks = outputs
      .filter(({ input }) => input.laneDir === 1)
      .map(({ tick }) => tick);

    expect(MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER).toBe(3);
    expect(stationTicks).toEqual([5, 20, 25, 30, 35]);
    expect(laneTicks).toEqual(stationTicks);
  });

  it('does not emit lane movement beyond the top or bottom edge', () => {
    const adapter = new MaltlineViewerInputAdapter({ ...CADENCE, lanes: 3 });

    adapter.keyDown('ArrowUp');
    expect(adapter.inputForTick(5, preStep(null, null, 0)).laneDir).toBe(0);
    adapter.keyUp('ArrowUp');

    adapter.keyDown('ArrowDown');
    expect(adapter.inputForTick(10, preStep(null, null, 2)).laneDir).toBe(0);
  });

  it('releasing a held flavor direction cancels its repeat', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyD');
    expect(inputTicks(adapter, 1, 5).at(-1)?.input.stationDir).toBe(1);
    adapter.keyUp('KeyD');
    expect(inputTicks(adapter, 6, 30).every(({ input }) => input.stationDir === 0)).toBe(true);
  });

  it('is independent of display frame grouping because only simulation ticks advance it', () => {
    const movementTicksAtDisplayHz = (displayHz: number): number[] => {
      const adapter = new MaltlineViewerInputAdapter(CADENCE);
      const clock = new FixedStepClock(60, 6);
      const movementTicks: number[] = [];
      let simulationTick = 0;
      let frame = 0;
      adapter.keyDown('ArrowDown');
      while (simulationTick < 30) {
        const advance = clock.advance(frame * (1000 / displayHz));
        expect(advance.droppedMs).toBe(0);
        for (let step = 0; step < advance.ticks && simulationTick < 30; step++) {
          simulationTick++;
          if (adapter.inputForTick(simulationTick, IDLE_PRE_STEP).laneDir !== 0) {
            movementTicks.push(simulationTick);
          }
        }
        frame++;
      }
      return movementTicks;
    };

    expect(movementTicksAtDisplayHz(30)).toEqual([5, 20, 25, 30]);
    expect(movementTicksAtDisplayHz(60)).toEqual([5, 20, 25, 30]);
    expect(movementTicksAtDisplayHz(144)).toEqual([5, 20, 25, 30]);
  });

  it('makes opposite chords neutral and treats the remaining held side as a fresh direction', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyA');
    adapter.keyDown('KeyD');
    expect(inputTicks(adapter, 1, 5).map(({ input }) => input.stationDir)).toEqual([0, 0, 0, 0, 0]);

    adapter.keyUp('KeyA');
    expect(inputTicks(adapter, 6, 10).map(({ input }) => input.stationDir)).toEqual([0, 0, 0, 0, 1]);
    adapter.keyDown('KeyD'); // Native repeat keydown does not restart the delay.
    expect(inputTicks(adapter, 11, 20)
      .filter(({ input }) => input.stationDir !== 0)
      .map(({ tick }) => tick)).toEqual([]);
    expect(inputTicks(adapter, 21, 25)
      .filter(({ input }) => input.stationDir !== 0)
      .map(({ tick }) => tick)).toEqual([25]);
  });

  it('preserves a released tap, cancels a pending direction on a chord, and uses last tap wins', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('ArrowUp');
    adapter.keyUp('ArrowUp');
    expect(inputTicks(adapter, 1, 5).at(-1)?.input.laneDir).toBe(-1);
    expect(inputTicks(adapter, 6, 10).every(({ input }) => input.laneDir === 0)).toBe(true);

    adapter.keyDown('ArrowUp');
    adapter.keyDown('ArrowDown');
    adapter.keyUp('ArrowUp');
    adapter.keyUp('ArrowDown');
    expect(inputTicks(adapter, 11, 15).at(-1)?.input.laneDir).toBe(1);

    adapter.keyDown('ArrowUp');
    adapter.keyUp('ArrowUp');
    adapter.keyDown('ArrowDown');
    adapter.keyUp('ArrowDown');
    expect(inputTicks(adapter, 16, 20).at(-1)?.input.laneDir).toBe(1);
  });

  it('retains a released serve tap while blending and emits one pulse once a shake is held', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyF');
    adapter.keyDown('KeyF'); // Native repeat is not a second logical action.
    adapter.keyDown('Enter'); // A held alias is not a second logical action.
    adapter.keyUp('KeyF');
    adapter.keyUp('Enter');

    expect(adapter.inputForTick(1, preStep(null, 'vanilla')).serve).toBe(false);
    expect(adapter.inputForTick(2, preStep('vanilla')).serve).toBe(true);
    expect(adapter.inputForTick(3, preStep('vanilla')).serve).toBe(false);
    expect(adapter.inputForTick(4, preStep('vanilla')).serve).toBe(false);
  });

  it('discards idle serve presses and requires a fresh logical F/Enter action', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyF');
    expect(adapter.inputForTick(1, IDLE_PRE_STEP).serve).toBe(false);
    expect(adapter.inputForTick(2, preStep(null, 'vanilla')).serve).toBe(false);
    expect(adapter.inputForTick(3, preStep('vanilla')).serve).toBe(false);

    adapter.keyDown('Enter'); // Alias while F remains held is not a fresh action.
    adapter.keyDown('KeyF'); // Native repeat is ignored.
    expect(adapter.inputForTick(4, preStep('vanilla')).serve).toBe(false);
    adapter.keyUp('KeyF');
    adapter.keyUp('Enter');
    adapter.keyDown('Enter');
    adapter.keyUp('Enter');
    expect(adapter.inputForTick(5, preStep('vanilla')).serve).toBe(true);
  });

  it('forces a false tick before a newly rearmed serve pulse', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyF');
    expect(adapter.inputForTick(1, preStep('vanilla')).serve).toBe(true);
    adapter.keyUp('KeyF');
    adapter.keyDown('KeyF');

    expect(adapter.inputForTick(2, preStep('vanilla')).serve).toBe(false);
    expect(adapter.inputForTick(3, preStep('vanilla')).serve).toBe(true);
    expect(adapter.inputForTick(4, preStep('vanilla')).serve).toBe(false);
  });

  it.each([0, 1, 2, 3, 4])(
    'launches exactly once when a released serve tap occurs at blend progress %i',
    (pressProgress) => {
      const scenario = {
        ...MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!,
        blendTicks: 5,
      };
      const adapter = new MaltlineViewerInputAdapter(scenario);
      const engine = new MaltlineEngine(scenario);
      const launches: number[] = [];
      const stepEngine = () => {
        const state = engine.snapshot();
        engine.setInput(adapter.inputForTick(state.tick + 1, state));
        const result = engine.step();
        launches.push(...result.events
          .filter((event) => event.type === 'shake_launched')
          .map((event) => event.tick));
      };

      adapter.keyDown('Space');
      while (engine.snapshot().player.blending === null
        || engine.snapshot().player.blendProgress < pressProgress) {
        stepEngine();
      }
      adapter.keyDown('KeyF');
      adapter.keyUp('KeyF');
      while (engine.snapshot().player.holding === null) stepEngine();
      stepEngine();
      stepEngine();

      expect(launches).toHaveLength(1);
      expect(engine.snapshot().currentInput.serve).toBe(false);
    },
  );

  it('records a pre-completion serve tap as replay-identical ordinary inputs', () => {
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[0]!;
    const adapter = new MaltlineViewerInputAdapter(scenario);
    const engine = new MaltlineEngine(scenario);
    const inputs: MaltlineInput[] = [];
    const stepEngine = () => {
      const state = engine.snapshot();
      const input = adapter.inputForTick(state.tick + 1, state);
      inputs.push({ ...input });
      engine.setInput(input);
      return engine.step();
    };

    adapter.keyDown('Space');
    while (engine.snapshot().player.blending === null
      || engine.snapshot().player.blendProgress < scenario.blendTicks - 1) {
      stepEngine();
    }
    adapter.keyDown('KeyF');
    adapter.keyUp('KeyF');
    expect(stepEngine().events.map((event) => event.type)).toContain('blend_completed');
    expect(stepEngine().events.map((event) => event.type)).toContain('shake_launched');

    const replay = replayMaltline(
      scenario,
      { lives: scenario.lives, score: 0 },
      inputs,
    );
    expect(replay.finalState).toEqual(engine.snapshot());
    expect(inputs.filter((input) => input.serve)).toHaveLength(1);
    expect(inputs.at(-2)?.serve).toBe(false);
    expect(inputs.at(-1)?.serve).toBe(true);
  });

  it.each([
    'blur',
    'hidden document',
    'unsupported width',
    'countdown',
    'stage transition',
    'restart',
  ])('reset clears queued taps and held actions for %s', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('ArrowRight');
    adapter.keyUp('ArrowRight');
    adapter.keyDown('ArrowDown');
    adapter.keyDown('Space');
    adapter.keyDown('KeyF');
    adapter.reset();

    expect(inputTicks(adapter, 1, 10).every(({ input }) =>
      input.stationDir === 0
      && input.laneDir === 0
      && !input.blend
      && !input.serve)).toBe(true);
  });

  it('resets on cadence changes and leaves blend as an unbuffered held level', () => {
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    adapter.keyDown('KeyD');
    adapter.keyDown('Space');
    expect(adapter.inputForTick(1, IDLE_PRE_STEP)).toMatchObject({ blend: true, serve: false });

    adapter.setCadence({ stationRepeatTicks: 3, laneRepeatTicks: 4 });
    expect(adapter.inputForTick(3, IDLE_PRE_STEP)).toEqual({
      stationDir: 0,
      laneDir: 0,
      blend: false,
      serve: false,
    });
  });

  it('emits smooth arrow-run input every tick without changing flavor cadence', () => {
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[2]!;
    const adapter = new MaltlineViewerInputAdapter(scenario);
    const engine = new MaltlineEngine(scenario);

    adapter.keyDown('ArrowRight');
    for (let tick = 1; tick <= 10; tick++) {
      const input = adapter.inputForTick(tick, engine.snapshot());
      expect(input).toMatchObject({ stationDir: 1, blend: true, serve: true });
      engine.setInput(input);
      engine.step();
    }
    expect(engine.snapshot().player).toMatchObject({ station: 0, x: 10 * Math.round(1024 * 0.9) });

    adapter.keyUp('ArrowRight');
    adapter.keyDown('KeyD');
    for (let tick = 11; tick <= 15; tick++) {
      const input = adapter.inputForTick(tick, engine.snapshot());
      engine.setInput(input);
      engine.step();
    }
    expect(engine.snapshot().player).toMatchObject({ station: 1 });
  });

  it('rejects invalid cadence and tick values', () => {
    expect(() => new MaltlineViewerInputAdapter({ ...CADENCE, stationRepeatTicks: 0 })).toThrow(
      /stationRepeatTicks/,
    );
    const adapter = new MaltlineViewerInputAdapter(CADENCE);
    expect(() => adapter.inputForTick(0, IDLE_PRE_STEP)).toThrow(/simulationTick/);
    expect(() => adapter.inputForTick(1.5, IDLE_PRE_STEP)).toThrow(/simulationTick/);
    expect(() => adapter.inputForTick(1, null as never)).toThrow(/preStepState/);
  });
});
