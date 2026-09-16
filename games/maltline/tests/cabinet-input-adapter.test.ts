import { describe, expect, it } from 'vitest';
import { MaltlineEngine } from '../src/core/engine';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { parseMaltlineReplay, replayMaltline, replayMaltlineCabinet } from '../src/core/replay';
import type { MaltlineInput, MaltlineScenario } from '../src/core/types';
import { MaltlineCabinetInputAdapter } from '../src/viewer/cabinet-input-adapter';

function setup(overrides: Partial<MaltlineScenario> = {}) {
  const scenario: MaltlineScenario = {
    ...MALTLINE_GENERATION_2_AUTHORITY.campaign[2]!,
    stations: ['vanilla', 'chocolate', 'strawberry'],
    stationRepeatTicks: 1,
    laneRepeatTicks: 1,
    blendTicks: 2,
    washTicks: 5,
    jarPoolSize: 2,
    ...overrides,
  };
  const run = { lives: scenario.lives, score: 0 };
  const engine = new MaltlineEngine(scenario, run, 'two-button-v1');
  const adapter = new MaltlineCabinetInputAdapter(scenario);
  const inputs: MaltlineInput[] = [];
  const events: string[] = [];
  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      const input = adapter.inputForTick(engine.snapshot().tick + 1, engine.snapshot());
      inputs.push(input);
      engine.setInput(input);
      events.push(...engine.step().events.map(event => event.type));
    }
    return engine.snapshot();
  }
  function tap(code: string) {
    adapter.keyDown(code);
    adapter.keyUp(code);
  }
  return { scenario, run, engine, adapter, inputs, events, step, tap };
}

describe('Maltline two-button cabinet', () => {
  it('holds A to fill and releases A to toss exactly once', () => {
    const { adapter, step, events } = setup();
    adapter.keyDown('Space');
    expect(step(3).player.holding).toBe('vanilla');
    expect(step(3).slides).toHaveLength(0);
    adapter.keyUp('Space');
    expect(step().slides).toHaveLength(1);
    step(3);
    expect(events.filter(event => event === 'shake_launched')).toHaveLength(1);
  });

  it('cancels an unfinished fill and never arms a future toss', () => {
    const { adapter, step, events, scenario } = setup();
    adapter.keyDown('Space');
    expect(step().jarsAvailable).toBe(scenario.jarPoolSize - 1);
    adapter.keyUp('Space');
    expect(step().player.blending).toBeNull();
    expect(step().jarsAvailable).toBe(scenario.jarPoolSize);
    adapter.keyDown('Space');
    expect(step(5).player.holding).toBe('vanilla');
    expect(events).not.toContain('shake_launched');
  });

  it('Enter dumps a finished chocolate shake into washing and permits vanilla immediately', () => {
    const { adapter, step, tap, scenario, events } = setup({ stations: ['vanilla', 'chocolate'] });
    tap('Enter');
    expect(step().player.station).toBe(1);
    adapter.keyDown('Space');
    expect(step(3).player.holding).toBe('chocolate');
    tap('Enter');
    const dumped = step();
    expect(dumped.player).toMatchObject({ station: 0, holding: null, blending: null });
    expect(dumped.washing).toEqual([scenario.washTicks - 1]);
    expect(dumped.jarsAvailable).toBe(1);
    expect(dumped.lives).toBe(scenario.lives);
    expect(dumped.score).toBe(0);
    expect(step(3).player.holding).toBe('vanilla');
    const washed = step();
    expect(washed.washing).toHaveLength(0);
    expect(washed.jarsAvailable).toBe(1);
    expect(events).not.toContain('shake_launched');
    expect(events).not.toContain('life_lost');
  });

  it('waits for the only jar to finish washing before starting the replacement', () => {
    const { adapter, step, tap } = setup({ jarPoolSize: 1 });
    adapter.keyDown('Space');
    step(3);
    tap('Enter');
    expect(step().jarsAvailable).toBe(0);
    expect(step(3).player.blending).toBeNull();
    expect(step().jarsAvailable).toBe(1);
    expect(step().player.blending).toBe('chocolate');
  });

  it('queues rapid Enter taps exactly once each, including a full flavor cycle', () => {
    const { adapter, step, tap } = setup({ stationRepeatTicks: 3 });
    tap('Enter');
    tap('Enter');
    tap('Enter');
    adapter.keyDown('Space');
    expect(step(2).player.station).toBe(0);
    expect(step().player.station).toBe(1);
    expect(step(3).player.station).toBe(2);
    expect(step(3).player.station).toBe(0);
    expect(step(3).player.holding).toBe('vanilla');
  });

  it('ignores Enter key repeat and supports replacement with one available flavor', () => {
    const { adapter, step } = setup({ stations: ['vanilla'] });
    adapter.keyDown('Space');
    step(3);
    adapter.keyDown('Enter');
    adapter.keyDown('Enter');
    expect(step().player).toMatchObject({ station: 0, holding: null });
    expect(step(3).player.holding).toBe('vanilla');
  });

  it('Enter cancels a partial fill and returns its jar without washing', () => {
    const { adapter, step, tap, scenario } = setup();
    adapter.keyDown('Space');
    step();
    tap('Enter');
    const switched = step();
    expect(switched.player).toMatchObject({ station: 1, blending: null });
    expect(switched.jarsAvailable).toBe(scenario.jarPoolSize);
    expect(switched.washing).toHaveLength(0);
    expect(step(3).player.holding).toBe('chocolate');
  });

  it('gives Enter priority over concurrent A release, even before an eligible cadence tick', () => {
    const { adapter, step, tap, events } = setup({ stationRepeatTicks: 5 });
    adapter.keyDown('Space');
    step(3);
    adapter.keyUp('Space');
    tap('Enter');
    expect(step().player.holding).toBe('vanilla');
    expect(step().player).toMatchObject({ station: 1, holding: null });
    step(3);
    expect(events).not.toContain('shake_launched');
  });

  it('keeps joystick run signals separate from fill, toss, and flavor selection', () => {
    const { adapter, step, tap, inputs } = setup();
    adapter.keyDown('ArrowRight');
    expect(step().player.x).toBeGreaterThan(0);
    adapter.keyDown('Space');
    expect(step().player).toMatchObject({ x: 0, blending: 'vanilla' });
    step(2);
    adapter.keyUp('Space');
    step();
    expect(inputs.at(-1)).toMatchObject({ stationDir: 0, blend: false, serve: true });
    tap('Enter');
    expect(step().player).toMatchObject({ station: 1, x: 0 });
    expect(inputs.at(-1)).toMatchObject({ stationDir: 1, blend: false, serve: false });
    expect(step().player.x).toBeGreaterThan(0);
  });

  it('reset and cadence changes clear all queued actions and physical holds', () => {
    const { adapter, step, tap, scenario, inputs } = setup();
    adapter.keyDown('ArrowRight');
    adapter.keyDown('ArrowDown');
    adapter.keyDown('Space');
    tap('Enter');
    adapter.reset();
    expect(step().player).toMatchObject({ station: 0, lane: 0, x: 0, blending: null });
    tap('Space');
    tap('Enter');
    adapter.setCadence(scenario);
    step();
    expect(inputs.at(-1)).toEqual({ stationDir: 0, laneDir: 0, blend: false, serve: false });
  });

  it('keeps the old third-button and flavor keys inactive', () => {
    const { adapter, step, inputs } = setup();
    for (const code of ['KeyA', 'KeyD', 'KeyF', 'KeyW', 'KeyS']) adapter.keyDown(code);
    step();
    expect(inputs.at(-1)).toEqual({ stationDir: 0, laneDir: 0, blend: false, serve: false });
  });

  it('keeps X as a compatibility alias for the same cabinet input and replay', () => {
    const primary = setup();
    const compatibility = setup();
    for (const [run, key] of [[primary, 'Enter'], [compatibility, 'KeyX']] as const) {
      run.tap(key);
      run.step();
      run.adapter.keyDown('Space');
      run.step(3);
      run.tap(key);
      run.step();
      run.step(3);
      run.adapter.keyUp('Space');
      run.step();
    }
    expect(primary.inputs).toEqual(compatibility.inputs);
    expect(primary.engine.snapshot()).toEqual(compatibility.engine.snapshot());
  });

  it('records deterministic cabinet replay separately from unchanged ranked semantics', () => {
    const { adapter, step, tap, inputs, engine, scenario, run } = setup({ stations: ['vanilla', 'chocolate'] });
    tap('Enter');
    step();
    adapter.keyDown('Space');
    step(3);
    tap('Enter');
    step();
    step(3);
    adapter.keyUp('Space');
    step();
    const replay = replayMaltlineCabinet(scenario, run, inputs);
    expect(replay.finalState).toEqual(engine.snapshot());
    expect(replayMaltlineCabinet(scenario, run, inputs)).toEqual(replay);
    expect(replay).toMatchObject({ version: 3, controlMode: 'two-button-v1' });
    expect(() => parseMaltlineReplay(JSON.stringify(replay))).toThrow('unsupported Maltline replay version: 3');
    const ranked = replayMaltline(scenario, run, inputs);
    expect(ranked.version).toBe(2);
    expect(ranked.finalState.player.station).toBe(1);
    expect(ranked.finalState.slides[0]?.flavor).toBe('chocolate');
    expect(replay.finalState.slides[0]?.flavor).toBe('vanilla');
  });
});
