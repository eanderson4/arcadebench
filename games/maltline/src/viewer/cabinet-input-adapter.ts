import type { MaltlineInput, MaltlineScenario, MaltlineState } from '../core/types';
import { MaltlineViewerInputAdapter } from './viewer-input-adapter';

/** The live cabinet uses two buttons; historical telemetry keeps its original adapter. */
export class MaltlineCabinetInputAdapter {
  private readonly directions: MaltlineViewerInputAdapter;
  private readonly held = new Set<string>();
  private releasedFill = false;
  private previousServe = false;
  private flavorPresses = 0;
  private scenario: Readonly<MaltlineScenario>;

  constructor(scenario: Readonly<MaltlineScenario>) {
    this.scenario = scenario;
    this.directions = new MaltlineViewerInputAdapter(scenario);
  }

  setCadence(scenario: Readonly<MaltlineScenario>): void {
    this.scenario = scenario;
    this.directions.setCadence(scenario);
    this.reset();
  }

  keyDown(code: string): void {
    if (this.held.has(code)) return;
    this.held.add(code);
    // Enter is button 2 on desktop; X remains a compatibility alias.
    if (code === 'Enter' || code === 'KeyX') {
      this.flavorPresses++;
    }
    if (code.startsWith('Arrow')) this.directions.keyDown(code);
  }

  keyUp(code: string): void {
    const filling = this.fillHeld();
    this.held.delete(code);
    if (filling && !this.fillHeld()) this.releasedFill = true;
    if (code.startsWith('Arrow')) this.directions.keyUp(code);
  }

  inputForTick(tick: number, state: Readonly<MaltlineState>): MaltlineInput {
    const direction = this.directions.inputForTick(tick, state);
    const filling = this.fillHeld();
    const switching = this.flavorPresses > 0;

    // Releasing an unfinished pour cancels it. A release never arms a future shake.
    const serve = this.releasedFill && state.player.holding !== null
      && !this.previousServe && !switching;
    this.releasedFill = false;
    this.previousServe = serve;
    if (serve) return { stationDir: 0, laneDir: direction.laneDir, blend: false, serve: true };

    // Finish queued flavor changes before pouring or running. The cabinet engine
    // wraps each pulse, including a full cycle or a one-flavor replacement.
    const running = direction.blend && direction.serve && !filling && !switching;
    if (running) return direction;
    const stationDir = switching && tick % this.scenario.stationRepeatTicks === 0
      ? 1
      : 0;
    if (stationDir !== 0) this.flavorPresses--;
    return {
      stationDir,
      laneDir: direction.laneDir,
      blend: filling && !switching,
      serve: false,
    };
  }

  reset(): void {
    this.held.clear();
    this.directions.reset();
    this.releasedFill = false;
    this.previousServe = false;
    this.flavorPresses = 0;
  }

  private fillHeld(): boolean {
    return this.held.has('Space');
  }
}
