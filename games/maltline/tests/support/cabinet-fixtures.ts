import { MALTLINE_CABINET_AUTHORITY as authority } from '../../src/core/cabinet-authority';
import type { MaltlineRegisteredCabinetAuthority } from '../../src/core/cabinet-authorities';
import { MaltlineEngine } from '../../src/core/engine';
import type { MaltlineCabinetReplay } from '../../src/core/replay';
import { IDLE_INPUT, type MaltlineInput } from '../../src/core/types';
import { reactiveMaltlineController } from '../../src/telemetry/reactive-controller';

/** Executes real immutable campaign data; no fabricated scores or custom verifier authority. */
export function cabinetReplays(win: boolean, selectedAuthority: MaltlineRegisteredCabinetAuthority = authority): MaltlineCabinetReplay[] {
  const authority = selectedAuthority;
  let run = { ...authority.initialRun };
  const replays: MaltlineCabinetReplay[] = [];
  for (const scenario of authority.campaign) {
    const engine = new MaltlineEngine(scenario, run, authority.controlMode);
    let state = engine.snapshot();
    const ticks: MaltlineCabinetReplay['ticks'] = [];
    while (state.status === 'running' && state.tick < 60_000) {
      const input: MaltlineInput = win ? reactiveMaltlineController(state, scenario) : { ...IDLE_INPUT };
      engine.setInput(input);
      const result = engine.step();
      state = result.state;
      ticks.push({ tick: state.tick, input, events: result.events });
    }
    if (state.status === 'running') throw new Error('Cabinet fixture exceeded tick limit');
    replays.push({ version: 3, controlMode: authority.controlMode, scenario: structuredClone(scenario),
      run, ticks, finalState: state });
    run = { score: state.score, lives: state.lives };
    if (state.status !== 'won') break;
  }
  return replays;
}
