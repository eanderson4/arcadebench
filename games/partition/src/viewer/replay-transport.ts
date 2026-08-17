export interface TickFrame {
  state: { tick: number };
}

export interface TransportAdvance {
  changed: boolean;
  reachedEnd: boolean;
  looped: boolean;
}

export class ReplayTransport<Frame extends TickFrame> {
  private cursor = 0;
  private accumulator = 0;
  private playing = false;
  private playbackSpeed = 1;
  private looping = false;

  constructor(
    readonly frames: readonly Frame[],
    readonly ticksPerSecond: number,
  ) {
    if (frames.length === 0) throw new Error('replay transport requires at least one frame');
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
      throw new Error('replay transport ticksPerSecond must be positive');
    }
  }

  get index(): number { return this.cursor; }
  get current(): Frame { return this.frames[this.cursor]; }
  get isPlaying(): boolean { return this.playing; }
  get speed(): number { return this.playbackSpeed; }
  get loop(): boolean { return this.looping; }
  get atEnd(): boolean { return this.cursor === this.frames.length - 1; }

  play(): void {
    if (this.atEnd && !this.looping) this.seekFrame(0);
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
    this.accumulator = 0;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0 || speed > 16) {
      throw new Error('replay speed must be greater than zero and at most 16');
    }
    this.playbackSpeed = speed;
  }

  setLoop(loop: boolean): void {
    this.looping = loop;
  }

  seekFrame(index: number): number {
    if (!Number.isFinite(index)) throw new Error('replay frame index must be finite');
    this.cursor = Math.max(0, Math.min(this.frames.length - 1, Math.round(index)));
    this.accumulator = 0;
    return this.cursor;
  }

  seekTick(tick: number): number {
    if (!Number.isFinite(tick)) throw new Error('replay tick must be finite');
    let low = 0;
    let high = this.frames.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.frames[middle].state.tick < tick) low = middle + 1;
      else high = middle;
    }
    return this.seekFrame(low);
  }

  step(delta: number): number {
    this.pause();
    return this.seekFrame(this.cursor + delta);
  }

  advance(elapsedMs: number): TransportAdvance {
    if (!this.playing || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return { changed: false, reachedEnd: false, looped: false };
    }

    // A backgrounded tab should resume naturally instead of skipping most of a replay.
    const boundedElapsed = Math.min(elapsedMs, 250);
    this.accumulator += (boundedElapsed / 1000) * this.ticksPerSecond * this.playbackSpeed;
    const frameCount = Math.floor(this.accumulator);
    if (frameCount < 1) return { changed: false, reachedEnd: false, looped: false };
    this.accumulator -= frameCount;

    const target = this.cursor + frameCount;
    if (target < this.frames.length) {
      this.cursor = target;
      return { changed: true, reachedEnd: this.atEnd, looped: false };
    }

    if (this.looping) {
      this.cursor = target % this.frames.length;
      return { changed: true, reachedEnd: false, looped: true };
    }

    this.cursor = this.frames.length - 1;
    this.pause();
    return { changed: true, reachedEnd: true, looped: false };
  }
}
