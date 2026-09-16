import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import type { MaltlineState } from '../src/core/types';
import { deriveMaltlineStationActionPresentation } from '../src/viewer/station-action-presentation';

function reachCrossStationBlend(): { engine: MaltlineEngine; state: MaltlineState } {
  const scenario = MALTLINE_CAMPAIGN[2]!;
  const engine = new MaltlineEngine(scenario);
  while (engine.snapshot().player.station < 2) {
    engine.setInput({ stationDir: 1, laneDir: 0, blend: false, serve: false });
    engine.step();
  }
  engine.setInput({ stationDir: 0, laneDir: 0, blend: true, serve: false });
  engine.step();
  while (engine.snapshot().player.station > 1) {
    engine.setInput({ stationDir: -1, laneDir: 0, blend: true, serve: false });
    engine.step();
  }
  return { engine, state: engine.snapshot() };
}

describe('Maltline station/action presentation model', () => {
  it('keeps selected station separate from the reachable flavor being processed', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const { state } = reachCrossStationBlend();
    expect(state.player).toMatchObject({ station: 1, blending: 'strawberry', holding: null });

    expect(deriveMaltlineStationActionPresentation(scenario, state)).toEqual({
      mode: 'blending',
      selectedStation: { index: 1, flavor: 'chocolate' },
      processingFlavor: 'strawberry',
      heldFlavor: null,
      actionFlavor: 'strawberry',
      quantizedPercent: 10,
      tone: 'blending',
      canvasText: 'BLENDING · 10%',
      semanticText: 'Blending Strawberry, 10 percent.',
    });
  });

  it('uses held flavor rather than a different selected station and prioritizes holding', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      jarsAvailable: 0,
      player: {
        ...baseline.player,
        station: 1,
        holding: 'strawberry',
        blending: 'vanilla',
        blendProgress: 10,
      },
    };

    expect(deriveMaltlineStationActionPresentation(scenario, state)).toMatchObject({
      mode: 'holding',
      selectedStation: { index: 1, flavor: 'chocolate' },
      processingFlavor: 'vanilla',
      heldFlavor: 'strawberry',
      actionFlavor: 'strawberry',
      quantizedPercent: null,
      tone: 'ready',
      canvasText: 'READY · RELEASE SPACE',
      semanticText: 'Strawberry shake ready. Release button 1 (Space) to toss. Press button 2 (Enter) to replace it and switch flavor.',
    });
  });

  it('applies blending over blocked, blocked over idle, then idle', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const blocked: MaltlineState = { ...baseline, jarsAvailable: 0 };
    const blending: MaltlineState = {
      ...blocked,
      player: { ...blocked.player, blending: 'vanilla', blendProgress: 0 },
    };

    expect(deriveMaltlineStationActionPresentation(scenario, blending)).toMatchObject({
      mode: 'blending',
      tone: 'blending',
      processingFlavor: 'vanilla',
    });
    expect(deriveMaltlineStationActionPresentation(scenario, blocked)).toMatchObject({
      mode: 'blocked-no-jars',
      tone: 'blocked',
      canvasText: 'NO CLEAN JARS · CATCH A RETURN',
    });
    expect(deriveMaltlineStationActionPresentation(scenario, baseline)).toMatchObject({
      mode: 'idle',
      tone: 'selected-flavor',
      selectedStation: { index: 0, flavor: 'vanilla' },
      actionFlavor: 'vanilla',
      canvasText: 'HOLD SPACE · FILL',
    });
  });

  it('tells a down-counter player that Space recalls them to the mixer', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const away: MaltlineState = {
      ...baseline,
      player: { ...baseline.player, x: 20 * 1024 },
    };

    expect(deriveMaltlineStationActionPresentation(scenario, away)).toMatchObject({
      mode: 'return-to-mixer',
      canvasText: 'SPACE · RETURN + FILL',
      semanticText: 'Hold button 1 (Space) to return to the mixer and fill.',
    });
  });

  it('preserves the existing five-percent quantization at progress boundaries', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const percent = (blendProgress: number): number | null =>
      deriveMaltlineStationActionPresentation(scenario, {
        ...baseline,
        player: { ...baseline.player, blending: 'vanilla', blendProgress },
      }).quantizedPercent;

    expect(percent(0)).toBe(0);
    expect(percent(1)).toBe(0);
    expect(percent(2)).toBe(5);
    expect(percent(Math.floor(scenario.blendTicks / 2))).toBe(50);
    expect(percent(scenario.blendTicks - 1)).toBe(100);
    expect(percent(scenario.blendTicks)).toBe(100);
  });

  it('is deterministic, deeply frozen, and isolated from later source mutation', () => {
    const scenario = { ...MALTLINE_CAMPAIGN[2]!, stations: [...MALTLINE_CAMPAIGN[2]!.stations] };
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = { ...baseline, player: { ...baseline.player, station: 1 } };
    const first = deriveMaltlineStationActionPresentation(scenario, state);
    const second = deriveMaltlineStationActionPresentation(scenario, state);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selectedStation)).toBe(true);
    scenario.stations[1] = 'vanilla';
    state.player.station = 2;
    expect(first.selectedStation).toEqual({ index: 1, flavor: 'chocolate' });
    expect(() => {
      (first.selectedStation as { index: number }).index = 2;
    }).toThrow();
  });

  it('rejects an invalid selected station instead of emitting misleading copy', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const invalid: MaltlineState = {
      ...baseline,
      player: { ...baseline.player, station: scenario.stations.length },
    };
    expect(() => deriveMaltlineStationActionPresentation(scenario, invalid))
      .toThrow(/valid selected station/);
  });
});
