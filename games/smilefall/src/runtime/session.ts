import { SmilefallEngine } from '../core/engine';
import type {
  ControlInput,
  GameEvent,
  ReplayTick,
  SmilefallReplay,
  SmilefallState,
  TickResult,
} from '../core/types';

export interface SmilefallController<Memory = unknown> {
  reset(state: Readonly<SmilefallState>): Memory;
  onTick(state: Readonly<SmilefallState>, events: readonly GameEvent[], memory: Memory): ControlInput | null;
}

export interface WatchOptions {
  ticks: number;
  sampleEveryTicks?: number;
}

export interface WatchResult {
  fromTick: number;
  toTick: number;
  controllerVersion: number;
  samples: SmilefallState[];
  events: GameEvent[];
  terminal: boolean;
}

interface Watcher {
  fromTick: number;
  throughTick: number;
  sampleEvery: number;
  samples: SmilefallState[];
  events: GameEvent[];
  resolve(result: WatchResult): void;
}

/**
 * The clock keeps running while a model thinks, exactly like Partition. A
 * resident controller stays responsible for the flock between model calls.
 */
export class ContinuousSmilefallSession {
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: SmilefallController | null = null;
  private controllerMemory: unknown;
  private version = 0;
  private lastEvents: GameEvent[] = [];
  private pendingReplayEvents: GameEvent[] = [];
  private watchers = new Set<Watcher>();
  private replayTicks: ReplayTick[] = [];

  constructor(readonly engine: SmilefallEngine) {}

  startRealtime(): void {
    if (this.timer) return;
    const intervalMs = 1000 / this.engine.scenario.ticksPerSecond;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): TickResult {
    const before = this.engine.snapshot();
    if (this.controller && before.status === 'running') {
      const next = this.controller.onTick(before, this.lastEvents, this.controllerMemory);
      if (next) this.engine.setInput(next);
    }
    const appliedState = this.engine.snapshot();
    const result = this.engine.step();
    this.replayTicks.push({
      tick: result.state.tick,
      input: { ...appliedState.currentInput },
      controllerVersion: appliedState.controllerVersion,
      controlEvents: structuredClone(this.pendingReplayEvents),
      events: structuredClone(result.events),
    });
    this.pendingReplayEvents = [];
    this.lastEvents = result.events;
    this.notifyWatchers(result);
    return result;
  }

  setInput(input: ControlInput): void {
    this.engine.setInput(input);
  }

  installController<Memory>(controller: SmilefallController<Memory>): number {
    this.version++;
    this.controller = controller as SmilefallController;
    this.controllerMemory = controller.reset(this.engine.snapshot());
    this.engine.setControllerVersion(this.version);
    const event = { tick: this.engine.snapshot().tick, type: 'controller_installed', version: this.version } as const;
    this.lastEvents = [...this.lastEvents, event];
    this.pendingReplayEvents.push(event);
    return this.version;
  }

  watchGameplay(options: WatchOptions): Promise<WatchResult> {
    if (!Number.isInteger(options.ticks) || options.ticks < 1) throw new Error('watch ticks must be a positive integer');
    const sampleEvery = options.sampleEveryTicks ?? 1;
    if (!Number.isInteger(sampleEvery) || sampleEvery < 1) {
      throw new Error('sampleEveryTicks must be a positive integer');
    }
    if (Math.ceil(options.ticks / sampleEvery) > 120) {
      throw new Error('watch request would return more than 120 state samples; increase sampleEveryTicks');
    }
    const fromTick = this.engine.snapshot().tick;
    if (this.engine.snapshot().status !== 'running') {
      return Promise.resolve({
        fromTick,
        toTick: fromTick,
        controllerVersion: this.engine.snapshot().controllerVersion,
        samples: [this.engine.snapshot()],
        events: [],
        terminal: true,
      });
    }
    return new Promise((resolve) => {
      this.watchers.add({
        fromTick,
        throughTick: fromTick + options.ticks,
        sampleEvery,
        samples: [],
        events: [],
        resolve,
      });
    });
  }

  replay(): SmilefallReplay {
    return {
      version: 1,
      scenario: structuredClone(this.engine.scenario),
      ticks: structuredClone(this.replayTicks),
      finalState: this.engine.snapshot(),
    };
  }

  private notifyWatchers(result: TickResult): void {
    for (const watcher of this.watchers) {
      if ((result.state.tick - watcher.fromTick) % watcher.sampleEvery === 0) watcher.samples.push(result.state);
      watcher.events.push(...result.events);
      if (result.state.tick >= watcher.throughTick || result.state.status !== 'running') {
        this.watchers.delete(watcher);
        watcher.resolve({
          fromTick: watcher.fromTick,
          toTick: result.state.tick,
          controllerVersion: result.state.controllerVersion,
          samples: watcher.samples,
          events: watcher.events,
          terminal: result.state.status !== 'running',
        });
      }
    }
  }
}
