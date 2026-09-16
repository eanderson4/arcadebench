import type { ControlInput, Direction, PartitionState, TickResult } from '../core/types';

export function directionForCode(code: string): Direction | null {
  switch (code) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    default: return null;
  }
}

/** Physical controls and one-shot trace intent are separate. Only engine inputs
 * are recorded: no wall-clock expiry, browser repeat, or touch timing enters a replay. */
export class PartitionHumanInput {
  private keys = new Set<string>();
  private directions: Direction[] = [];
  private pointers = new Map<number, Direction | 'trace'>();
  private bufferedDirection: Direction = 'idle';
  private armed = false;
  private releaseRequired = false;

  isTraceArmed(): boolean { return this.armed; }

  private arm(state: PartitionState): void {
    if (state.status === 'running' && !state.spark.drawing) this.armed = true;
  }

  keyDown(code: string, state: PartitionState, repeat = false): void {
    if (code !== 'Space' && !directionForCode(code)) return;
    // A repeat after focus loss must not resurrect a discarded control.
    if (repeat || this.keys.has(code)) return;
    this.keys.add(code);
    const direction = directionForCode(code);
    if (direction) {
      this.directions = this.directions.filter(item => item !== direction);
      this.directions.push(direction);
      this.bufferedDirection = direction;
    } else this.arm(state);
  }

  keyUp(code: string): void {
    this.keys.delete(code);
    const direction = directionForCode(code);
    if (direction) this.directions = this.directions.filter(item => item !== direction);
  }

  pointerDown(id: number, action: Direction | 'trace', state: PartitionState): void {
    this.pointers.delete(id);
    this.pointers.set(id, action);
    if (action === 'trace') this.arm(state);
    else this.bufferedDirection = action;
  }

  pointerUp(id: number): void { this.pointers.delete(id); }
  pointerCancel(id: number): void {
    const action = this.pointers.get(id);
    this.pointers.delete(id);
    if (action === 'trace') this.armed = false;
    else if (action === this.bufferedDirection) this.bufferedDirection = 'idle';
  }

  /** Keyboard/assistive activation of the native touch button is also a tap. */
  tapTrace(state: PartitionState): void { this.arm(state); }

  /** Stage continuation preserves held devices, but never a stale tap or turn.
   * Holding TRACE/Space into the new stage explicitly arms its first cut. */
  nextStage(): void {
    this.bufferedDirection = 'idle';
    this.releaseRequired = false;
    this.armed = this.keys.has('Space') || [...this.pointers.values()].includes('trace');
  }

  reset(): void {
    this.keys.clear();
    this.directions = [];
    this.pointers.clear();
    this.bufferedDirection = 'idle';
    this.armed = false;
    this.releaseRequired = false;
  }

  sample(state: PartitionState): ControlInput {
    if (state.status !== 'running') return { direction: 'idle', draw: 'off' };
    // A press immediately after reconnection still owes the engine one off
    // tick. Preserve a short direction tap until it can actually open the cut.
    if (this.releaseRequired && this.armed) {
      this.releaseRequired = false;
      return { direction: 'idle', draw: 'off' };
    }
    const touchDirections = [...this.pointers.values()].filter(action => action !== 'trace');
    let direction: Direction = this.directions.at(-1) ?? touchDirections.at(-1) ?? 'idle';
    if (state.tick % state.sparkMoveEveryTicks === 0) {
      if (direction === 'idle') direction = this.bufferedDirection;
      this.bufferedDirection = 'idle';
    }
    // The frozen engine requires an off input after a completed/severed trace.
    // A fresh press before the next tick remains armed while that release runs.
    const release = this.releaseRequired;
    this.releaseRequired = false;
    return { direction, draw: this.armed && !state.spark.drawing && !release ? 'fast' : 'off' };
  }

  observe(result: TickResult): void {
    if (result.events.some(event => event.type === 'trace_completed' || event.type === 'trace_hit')) {
      this.releaseRequired = true;
    }
    if (result.state.status !== 'running' || result.state.spark.drawing
      || result.events.some(event => event.type === 'trace_started'
        || event.type === 'trace_completed' || event.type === 'trace_hit')) this.armed = false;
  }
}
