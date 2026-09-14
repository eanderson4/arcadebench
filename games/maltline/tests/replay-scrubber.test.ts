import { beforeAll, describe, expect, it } from 'vitest';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import {
  createVerifiedMaltlinePlayback,
  type VerifiedMaltlinePlayback,
} from '../src/core/playback';
import { verifyAndHashMaltlineProof, type HashedMaltlineProof } from '../src/core/proof';
import type { GameEvent } from '../src/core/types';
import {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from '../src/testing/generation-2-proofs';
import {
  describeMaltlineReplayImportantEvent,
  describeMaltlineReplayRecentEvent,
  describeMaltlineReplayFrameAction,
  mountMaltlineReplayScrubber,
  type MaltlineReplayAnimationScheduler,
  type MaltlineReplayMotionPreference,
} from '../src/viewer/replay-scrubber';

describe('replay event presentation copy', () => {
  it.each([
    [{ tick: 9, type: 'customer_spawned', customerId: 1, lane: 0, flavor: 'vanilla' }, null],
    [{ tick: 9, type: 'shake_launched', lane: 1, flavor: 'chocolate' },
      'Chocolate shake sent to window 2.'],
    [{ tick: 9, type: 'served', customerId: 2, lane: 0, flavor: 'vanilla', exitAfterDrink: false,
      firstFulfillment: false, points: 0 }, 'Vanilla rescue served at window 1, no points.'],
    [{ tick: 9, type: 'customer_exited', customerId: 2 }, 'Customer finished and left happy.'],
    [{ tick: 9, type: 'jar_returned', customerId: 2, lane: 2 },
      'A jar is returning from window 3.'],
    [{ tick: 9, type: 'jar_caught', customerId: 2, lane: 1, points: 0 },
      'Return jar caught at window 2.'],
    [{ tick: 9, type: 'shake_smashed', lane: 2, flavor: 'strawberry' },
      'Strawberry shake missed at window 3.'],
    [{ tick: 9, type: 'jar_smashed', lane: 1 }, 'Return jar missed at window 2.'],
    [{ tick: 9, type: 'walkout', customerId: 3, lane: 0 }, 'Customer walked out at window 1.'],
    [{ tick: 9, type: 'life_lost', reason: 'jar_smashed', lives: 1 },
      'Life lost: missed return jar. 1 life left.'],
    [{ tick: 9, type: 'blend_completed', flavor: 'chocolate' }, 'Chocolate shake ready.'],
    [{ tick: 9, type: 'stage_cleared', bonus: 1_250 },
      'Stage cleared, +1,250 bonus points.'],
    [{ tick: 9, type: 'game_lost' }, 'Run ended.'],
  ] as const)('preserves recent-event copy for %#', (event, expected) => {
    expect(describeMaltlineReplayRecentEvent([event as GameEvent])).toBe(expected);
  });

  it('uses the last loss for recent/important copy and terminal for important copy', () => {
    const losses: GameEvent[] = [
      { tick: 50, type: 'life_lost', reason: 'walkout', lives: 1 },
      { tick: 50, type: 'life_lost', reason: 'shake_smashed', lives: 0 },
    ];
    expect(describeMaltlineReplayRecentEvent(losses))
      .toBe('Life lost: missed shake. 0 lives left.');
    expect(describeMaltlineReplayImportantEvent(losses))
      .toBe('Life lost: missed shake. 0 lives left.');
    expect(describeMaltlineReplayImportantEvent([...losses, { tick: 50, type: 'game_lost' }]))
      .toBe('Game over in replay.');
    expect(describeMaltlineReplayImportantEvent([
      ...losses,
      { tick: 50, type: 'stage_cleared', bonus: 900 },
    ])).toBe('Stage cleared in replay. Bonus 900 points.');
    expect(describeMaltlineReplayImportantEvent([{
      tick: 50, type: 'jar_caught', customerId: 4, lane: 0, points: 0,
    }])).toBeNull();
  });

  it.each([
    ['walkout', 'Life lost: customer walkout. 2 lives left.'],
    ['shake_smashed', 'Life lost: missed shake. 2 lives left.'],
    ['jar_smashed', 'Life lost: missed return jar. 2 lives left.'],
  ] as const)('preserves replay language for %s', (reason, expected) => {
    expect(describeMaltlineReplayRecentEvent([{
      tick: 12, type: 'life_lost', reason, lives: 2,
    }])).toBe(expected);
  });
});

const CHALLENGE = {
  runId: 'run_scrubber_test_1',
  seasonId: 'maltline-generation-2',
  boardId: 'arcade',
  nonce: 0x5152_5354,
  authority: MALTLINE_GENERATION_2_AUTHORITY.identity,
} as const;

interface CanvasFixture {
  readonly context: CanvasRenderingContext2D;
  readonly commands: unknown[][];
}

function canvasFixture(): CanvasFixture {
  const commands: unknown[][] = [];
  const values = new Map<PropertyKey, unknown>();
  const gradient = { addColorStop: (...args: unknown[]) => commands.push(['addColorStop', ...args]) };
  const context = new Proxy({}, {
    get(_target, property) {
      if (values.has(property)) return values.get(property);
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return (...args: unknown[]) => {
          commands.push([String(property), ...args]);
          return gradient;
        };
      }
      return (...args: unknown[]) => commands.push([String(property), ...args]);
    },
    set(_target, property, value) {
      values.set(property, value);
      commands.push(['set', String(property), value]);
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { context, commands };
}

class FakeDocument extends EventTarget {
  hidden = false;
  readonly defaultView = null;
  readonly canvas = canvasFixture();

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeElement extends EventTarget {
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  className = '';
  value = '';
  type = '';
  min = '';
  max = '';
  step = '';
  width = 0;
  height = 0;
  disabled = false;
  #text = '';

  constructor(ownerDocument: FakeDocument, tagName: string) {
    super();
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this.#text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.#text = value;
    this.children.length = 0;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getContext(kind: string): CanvasRenderingContext2D | null {
    return this.tagName === 'CANVAS' && kind === '2d' ? this.ownerDocument.canvas.context : null;
  }

  remove(): void {
    if (this.parentElement === null) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
}

class FakeRaf implements MaltlineReplayAnimationScheduler {
  #nextHandle = 1;
  readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly cancelled: number[] = [];

  request(callback: FrameRequestCallback): number {
    const handle = this.#nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  fire(timestamp: number): void {
    const pending = this.callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (pending === undefined) throw new Error('No animation frame is pending.');
    this.callbacks.delete(pending[0]);
    pending[1](timestamp);
  }
}

class FakeMotionPreference implements MaltlineReplayMotionPreference {
  readonly listeners = new Set<(reducedMotion: boolean) => void>();

  constructor(private value: boolean) {}

  current(): boolean {
    return this.value;
  }

  subscribe(listener: (reducedMotion: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(value: boolean): void {
    this.value = value;
    for (const listener of [...this.listeners]) listener(value);
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(descendants)];
}

function control(root: FakeElement, text: string): FakeElement {
  const found = descendants(root).find((candidate) => candidate.textContent === text);
  if (found === undefined) throw new Error(`Missing control: ${text}`);
  return found;
}

function byClass(root: FakeElement, className: string): FakeElement {
  const found = descendants(root).find((candidate) => candidate.className === className);
  if (found === undefined) throw new Error(`Missing class: ${className}`);
  return found;
}

function eventPosition(
  playback: VerifiedMaltlinePlayback,
  type: GameEvent['type'],
): { stageIndex: number; stageTick: number } {
  for (const stage of playback.stages) {
    for (let stageTick = 1; stageTick <= stage.ticks; stageTick++) {
      const frame = playback.frameAt({ stageIndex: stage.stageIndex, stageTick });
      if (frame.events.some((event) => event.type === type)) return { stageIndex: stage.stageIndex, stageTick };
    }
  }
  throw new Error(`Fixture has no ${type} event.`);
}

let retainedWin: HashedMaltlineProof;
let retainedLoss: HashedMaltlineProof;
let retainedMistake: HashedMaltlineProof;

beforeAll(async () => {
  [retainedWin, retainedLoss, retainedMistake] = await Promise.all([
    verifyAndHashMaltlineProof(GENERATION_2_WIN_PROOF, CHALLENGE),
    verifyAndHashMaltlineProof(GENERATION_2_LOSS_PROOF, CHALLENGE),
    verifyAndHashMaltlineProof(GENERATION_2_MISTAKE_PROOF, CHALLENGE),
  ]);
});

async function fixture(retained = retainedWin) {
  const playback = await createVerifiedMaltlinePlayback(retained.envelope);
  const documentRef = new FakeDocument();
  const target = new FakeElement(documentRef, 'div');
  const scheduler = new FakeRaf();
  const announcements: string[] = [];
  const scrubber = mountMaltlineReplayScrubber(
    target as unknown as HTMLElement,
    playback,
    {
      scheduler,
      announce: (message) => announcements.push(message),
      rendererDependencies: { reducedMotion: true, random: () => 0.5, nowMs: () => 12_000 },
    },
  );
  return {
    playback,
    documentRef,
    target,
    scheduler,
    announcements,
    scrubber,
    root: scrubber.root as unknown as FakeElement,
  };
}

describe('Maltline retained-proof replay scrubber', () => {
  it('mounts paused at the last recorded stage with native, meaningful controls and a dedicated canvas', async () => {
    const { root, scrubber, documentRef } = await fixture();

    expect(scrubber.snapshot()).toEqual({
      stageIndex: 7,
      stageTick: 0,
      playing: false,
      speed: 4,
      destroyed: false,
    });
    expect(root.textContent).toContain('Stage 8 of 8, Closing Time.');
    expect(root.textContent).toContain('0 of 31 orders resolved');
    expect(root.textContent).toContain('Stages play separately.');
    expect(root.getAttribute('aria-label')).toBe('Verified run replay');
    expect(control(root, 'Play stage').getAttribute('aria-label')).toBe('Play replay stage');
    expect(control(root, '−1 frame').getAttribute('aria-label')).toBe('Previous replay frame');
    expect(control(root, '+1 frame').getAttribute('aria-label')).toBe('Next replay frame');
    expect(control(root, '+5s').getAttribute('aria-label')).toBe('Forward 5 seconds');
    expect(byClass(root, 'maltline-replay-scrubber__position').getAttribute('aria-valuetext'))
      .toBe('Closing Time, frame 1 of 3,302, game time 0:00 of 0:55');
    expect(byClass(root, 'maltline-replay-scrubber__time').textContent)
      .toBe('Frame 1 / 3,302 · game time 0:00 / 0:55');
    expect(byClass(root, 'maltline-replay-scrubber__time').getAttribute('role')).toBe('timer');
    expect(byClass(root, 'maltline-replay-scrubber__time').getAttribute('aria-live')).toBe('off');
    expect(byClass(root, 'maltline-replay-scrubber__time').getAttribute('aria-label'))
      .toBe('Replay frame and game time');
    expect(byClass(root, 'maltline-replay-scrubber__time').getAttribute('for'))
      .toBe('maltline-replay-position');
    const canvas = byClass(root, 'maltline-replay-scrubber__canvas');
    expect([canvas.width, canvas.height]).toEqual([960, 540]);
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('aria-describedby'))
      .toBe('maltline-replay-frame-summary maltline-replay-event-summary');
    expect(byClass(root, 'maltline-replay-scrubber__event').textContent)
      .toBe('Recent event: No recent major event.');
    expect(documentRef.canvas.commands.length).toBeGreaterThan(0);
  });

  it('makes every adjacent exact frame distinct in visible, range, and announced position', async () => {
    const { root, scrubber, announcements } = await fixture();
    const position = byClass(root, 'maltline-replay-scrubber__position');
    const time = byClass(root, 'maltline-replay-scrubber__time');

    scrubber.seekToTick(0);
    expect(time.textContent).toContain('Frame 1 / 3,302');
    control(root, '+1 frame').dispatchEvent(new Event('click'));
    expect(scrubber.snapshot().stageTick).toBe(1);
    expect(position.value).toBe('1');
    expect(position.getAttribute('aria-valuetext'))
      .toBe('Closing Time, frame 2 of 3,302, game time 0:00 of 0:55');
    expect(time.textContent).toContain('Frame 2 / 3,302');
    expect(announcements.at(-1))
      .toBe('Replay paused at frame 2 of 3,302, game time 0:00 in Closing Time.');

    control(root, '+1 frame').dispatchEvent(new Event('click'));
    expect(time.textContent).toContain('Frame 3 / 3,302');
    expect(announcements.at(-1))
      .toBe('Replay paused at frame 3 of 3,302, game time 0:00 in Closing Time.');
  });

  it('advances at 4x, pauses without catch-up, changes speed, and caps frames while preserving backlog', async () => {
    const { scrubber, scheduler } = await fixture();
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(100);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 24, playing: true, speed: 4 });

    scrubber.pause();
    expect(scheduler.callbacks.size).toBe(0);
    scrubber.setSpeed(1);
    scrubber.play();
    scheduler.fire(1_000);
    scheduler.fire(1_100);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 30, playing: true, speed: 1 });

    scrubber.pause();
    scrubber.seekToTick(0);
    scrubber.setSpeed(4);
    scrubber.play();
    scheduler.fire(2_000);
    scheduler.fire(3_000);
    expect(scrubber.snapshot().stageTick).toBe(32);
    scheduler.fire(3_000);
    expect(scrubber.snapshot().stageTick).toBe(64);
  });

  it('stops exactly at a terminal frame and never crosses stages automatically', async () => {
    const { playback, root, scrubber, scheduler, announcements } = await fixture();
    const first = playback.stages[0]!;
    scrubber.selectStage(0);
    scrubber.seekToTick(first.ticks - 2);
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(1_000);

    expect(scrubber.snapshot()).toMatchObject({
      stageIndex: 0,
      stageTick: first.ticks,
      playing: false,
    });
    expect(scheduler.callbacks.size).toBe(0);
    expect(announcements.at(-1))
      .toBe('Replay stage 1, First Pour, cleared. Choose another stage to continue.');
    expect(byClass(root, 'maltline-replay-scrubber__summary').textContent)
      .toContain('Stage cleared. Choose another stage to continue.');

    scrubber.nextStage();
    expect(scrubber.snapshot()).toMatchObject({ stageIndex: 1, stageTick: 0, playing: false });
  });

  it('describes a terminal single-stage loss as complete without unavailable navigation', async () => {
    const { playback, root, scrubber, scheduler, announcements } = await fixture(retainedLoss);
    const onlyStage = playback.stages[0]!;
    scrubber.seekToTick(onlyStage.ticks - 1);
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(1_000);

    expect(scrubber.snapshot()).toMatchObject({
      stageIndex: 0,
      stageTick: onlyStage.ticks,
      playing: false,
    });
    expect(byClass(root, 'maltline-replay-scrubber__summary').textContent)
      .toContain('Run ended. Replay complete.');
    expect(byClass(root, 'maltline-replay-scrubber__summary').textContent)
      .not.toContain('Choose another stage');
    expect(announcements.at(-1)).toContain('ended the run.');
    expect(announcements.at(-1)).toContain('Replay complete.');
    expect(announcements.at(-1)).not.toContain('Choose another stage');
    expect(control(root, 'Prev stage').disabled).toBe(true);
    expect(control(root, 'Next stage').disabled).toBe(true);
  });

  it('navigates only recorded stages and keeps each selection paused at its start', async () => {
    const { playback, scrubber } = await fixture();
    scrubber.selectStage(0);
    scrubber.previousStage();
    expect(scrubber.snapshot().stageIndex).toBe(0);
    scrubber.selectStage(4);
    scrubber.seekToTick(300);
    scrubber.nextStage();
    expect(scrubber.snapshot()).toMatchObject({ stageIndex: 5, stageTick: 0, playing: false });
    scrubber.previousStage();
    expect(scrubber.snapshot()).toMatchObject({ stageIndex: 4, stageTick: 0, playing: false });
    scrubber.selectStage(playback.stages.length - 1);
    scrubber.nextStage();
    expect(scrubber.snapshot().stageIndex).toBe(playback.stages.length - 1);
    expect(() => scrubber.selectStage(-1)).toThrow(/out of range/u);
    expect(() => scrubber.selectStage(playback.stages.length)).toThrow(/out of range/u);
  });

  it('supports exact and second-based seeks, clamps boundaries, and pauses range input', async () => {
    const { root, scrubber, scheduler, announcements } = await fixture();
    scrubber.selectStage(0);
    scrubber.seekToTick(600);
    scrubber.seekBySeconds(-1);
    expect(scrubber.snapshot().stageTick).toBe(540);
    control(root, '+5s').dispatchEvent(new Event('click'));
    expect(scrubber.snapshot().stageTick).toBe(840);
    control(root, '−1 frame').dispatchEvent(new Event('click'));
    expect(scrubber.snapshot().stageTick).toBe(839);
    control(root, '+1 frame').dispatchEvent(new Event('click'));
    expect(scrubber.snapshot().stageTick).toBe(840);
    scrubber.seekToTick(-100);
    expect(scrubber.snapshot().stageTick).toBe(0);
    scrubber.seekToTick(100_000);
    expect(scrubber.snapshot().stageTick).toBe(1_558);
    expect(() => scrubber.seekToTick(Number.NaN)).toThrow(/finite/u);
    expect(() => scrubber.seekBySeconds(Number.POSITIVE_INFINITY)).toThrow(/finite/u);

    scrubber.play();
    const range = byClass(root, 'maltline-replay-scrubber__position');
    const beforeInputAnnouncements = announcements.length;
    for (let stageTick = 24; stageTick <= 123; stageTick++) {
      range.value = String(stageTick);
      range.dispatchEvent(new Event('input'));
    }
    expect(scheduler.callbacks.size).toBe(1);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 0, playing: false });
    scheduler.fire(0);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 123, playing: false });
    expect(announcements).toHaveLength(beforeInputAnnouncements);
    range.dispatchEvent(new Event('change'));
    expect(announcements.at(-1)).toContain('Replay paused at frame 124 of 1,559, game time 0:02');
  });

  it('rebuilds once for a range burst and never rewinds during continuous playback', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    let frameAtCalls = 0;
    const instrumented = new Proxy(playback, {
      get(target, property) {
        if (property === 'frameAt') {
          return (...args: Parameters<VerifiedMaltlinePlayback['frameAt']>) => {
            frameAtCalls++;
            return target.frameAt(...args);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as VerifiedMaltlinePlayback;
    const documentRef = new FakeDocument();
    const target = new FakeElement(documentRef, 'div');
    const scheduler = new FakeRaf();
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, instrumented, {
      scheduler,
      rendererDependencies: { reducedMotion: true },
    });
    const range = byClass(scrubber.root as unknown as FakeElement, 'maltline-replay-scrubber__position');
    frameAtCalls = 0;
    for (let tick = 2_901; tick <= 3_000; tick++) {
      range.value = String(tick);
      range.dispatchEvent(new Event('input'));
    }
    scheduler.fire(0);
    expect(frameAtCalls).toBe(1);
    expect(scrubber.snapshot().stageTick).toBe(3_000);

    frameAtCalls = 0;
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(17);
    expect(frameAtCalls).toBe(0);
    expect(scrubber.snapshot().stageTick).toBeGreaterThan(3_000);
  });

  it('reconstructs deterministic presentation drawing on discontinuous seeks', async () => {
    const { scrubber, documentRef } = await fixture();
    documentRef.canvas.commands.length = 0;
    scrubber.seekToTick(400);
    const first = JSON.stringify(documentRef.canvas.commands);
    documentRef.canvas.commands.length = 0;
    scrubber.seekToTick(100);
    documentRef.canvas.commands.length = 0;
    scrubber.seekToTick(400);
    expect(JSON.stringify(documentRef.canvas.commands)).toBe(first);
  });

  it('reconstructs the same normal- and reduced-motion frame across seek and display cadences', async () => {
    const probe = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    const target = eventPosition(probe, 'life_lost');

    const renderBySeek = async (reducedMotion: boolean): Promise<string> => {
      const playback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
      const documentRef = new FakeDocument();
      const targetElement = new FakeElement(documentRef, 'div');
      const scrubber = mountMaltlineReplayScrubber(targetElement as unknown as HTMLElement, playback, {
        scheduler: new FakeRaf(),
        rendererDependencies: { reducedMotion },
      });
      scrubber.selectStage(target.stageIndex);
      documentRef.canvas.commands.length = 0;
      scrubber.seekToTick(target.stageTick);
      return JSON.stringify(documentRef.canvas.commands);
    };

    const renderByPlayback = async (reducedMotion: boolean, cadenceMs: number): Promise<string> => {
      const playback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
      const documentRef = new FakeDocument();
      const targetElement = new FakeElement(documentRef, 'div');
      const scheduler = new FakeRaf();
      const scrubber = mountMaltlineReplayScrubber(targetElement as unknown as HTMLElement, playback, {
        scheduler,
        rendererDependencies: { reducedMotion },
      });
      scrubber.selectStage(target.stageIndex);
      scrubber.seekToTick(target.stageTick - 1);
      scrubber.setSpeed(1);
      scrubber.play();
      scheduler.fire(0);
      documentRef.canvas.commands.length = 0;
      let timestamp = 0;
      while (scrubber.snapshot().stageTick < target.stageTick) {
        timestamp += cadenceMs;
        scheduler.fire(timestamp);
        if (scrubber.snapshot().stageTick < target.stageTick) {
          documentRef.canvas.commands.length = 0;
        }
      }
      return JSON.stringify(documentRef.canvas.commands);
    };

    for (const reducedMotion of [false, true]) {
      const direct = await renderBySeek(reducedMotion);
      expect(await renderByPlayback(reducedMotion, 1_000 / 60)).toBe(direct);
      expect(await renderByPlayback(reducedMotion, 1_000 / 144)).toBe(direct);
    }
  });

  it('rebuilds one exact paused frame when the live motion preference changes', async () => {
    const probe = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    const targetPosition = eventPosition(probe, 'life_lost');
    const playback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    let frameAtCalls = 0;
    const instrumented = new Proxy(playback, {
      get(target, property) {
        if (property === 'frameAt') {
          return (...args: Parameters<VerifiedMaltlinePlayback['frameAt']>) => {
            frameAtCalls++;
            return target.frameAt(...args);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as VerifiedMaltlinePlayback;
    const documentRef = new FakeDocument();
    const target = new FakeElement(documentRef, 'div');
    const motionPreference = new FakeMotionPreference(false);
    const announcements: string[] = [];
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, instrumented, {
      scheduler: new FakeRaf(),
      announce: (message) => announcements.push(message),
      motionPreference,
      rendererDependencies: { random: () => 0.5, nowMs: () => 12_000 },
    });
    scrubber.selectStage(targetPosition.stageIndex);
    scrubber.seekToTick(targetPosition.stageTick);
    documentRef.canvas.commands.length = 0;
    frameAtCalls = 0;
    const priorAnnouncements = announcements.length;

    motionPreference.set(true);

    const switchedCommands = JSON.stringify(documentRef.canvas.commands);
    const descriptor = playback.stages[targetPosition.stageIndex]!;
    expect(scrubber.snapshot()).toMatchObject({
      stageIndex: targetPosition.stageIndex,
      stageTick: targetPosition.stageTick,
      playing: false,
    });
    expect(frameAtCalls).toBe(1);
    expect(announcements.slice(priorAnnouncements)).toEqual([
      `Reduced motion enabled; replay paused at frame ${new Intl.NumberFormat('en-US').format(targetPosition.stageTick + 1)} of ${new Intl.NumberFormat('en-US').format(descriptor.ticks + 1)} in ${descriptor.name}.`,
    ]);

    documentRef.canvas.commands.length = 0;
    motionPreference.set(true);
    expect(documentRef.canvas.commands).toEqual([]);
    expect(frameAtCalls).toBe(1);
    expect(announcements).toHaveLength(priorAnnouncements + 1);

    const directPlayback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    const directDocument = new FakeDocument();
    const directTarget = new FakeElement(directDocument, 'div');
    const direct = mountMaltlineReplayScrubber(
      directTarget as unknown as HTMLElement,
      directPlayback,
      {
        scheduler: new FakeRaf(),
        rendererDependencies: { reducedMotion: true, random: () => 0.5, nowMs: () => 12_000 },
      },
    );
    direct.selectStage(targetPosition.stageIndex);
    directDocument.canvas.commands.length = 0;
    direct.seekToTick(targetPosition.stageTick);
    expect(switchedCommands).toBe(JSON.stringify(directDocument.canvas.commands));
  });

  it('pauses live playback at its committed frame before rebuilding for motion changes', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const documentRef = new FakeDocument();
    const target = new FakeElement(documentRef, 'div');
    const scheduler = new FakeRaf();
    const motionPreference = new FakeMotionPreference(false);
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
      scheduler,
      motionPreference,
      rendererDependencies: { random: () => 0.5, nowMs: () => 12_000 },
    });
    scrubber.seekToTick(100);
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(17);
    const committed = scrubber.snapshot();
    const [scheduledHandle, staleAnimation] = scheduler.callbacks.entries().next().value as [
      number,
      FrameRequestCallback,
    ];
    documentRef.canvas.commands.length = 0;

    motionPreference.set(true);

    const switchedCommands = JSON.stringify(documentRef.canvas.commands);
    expect(scrubber.snapshot()).toMatchObject({
      stageIndex: committed.stageIndex,
      stageTick: committed.stageTick,
      playing: false,
    });
    expect(scheduler.cancelled).toContain(scheduledHandle);
    staleAnimation(10_000);
    expect(scrubber.snapshot()).toMatchObject({
      stageIndex: committed.stageIndex,
      stageTick: committed.stageTick,
      playing: false,
    });
    expect(JSON.stringify(documentRef.canvas.commands)).toBe(switchedCommands);

    const directPlayback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const directDocument = new FakeDocument();
    const directTarget = new FakeElement(directDocument, 'div');
    const direct = mountMaltlineReplayScrubber(
      directTarget as unknown as HTMLElement,
      directPlayback,
      {
        scheduler: new FakeRaf(),
        rendererDependencies: { reducedMotion: true, random: () => 0.5, nowMs: () => 12_000 },
      },
    );
    direct.selectStage(committed.stageIndex);
    directDocument.canvas.commands.length = 0;
    direct.seekToTick(committed.stageTick);
    expect(switchedCommands).toBe(JSON.stringify(directDocument.canvas.commands));
  });

  it('cancels a pending range seek on motion change and unsubscribes on destroy', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const documentRef = new FakeDocument();
    const target = new FakeElement(documentRef, 'div');
    const scheduler = new FakeRaf();
    const motionPreference = new FakeMotionPreference(false);
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
      scheduler,
      motionPreference,
      rendererDependencies: { reducedMotion: false },
    });
    const range = byClass(scrubber.root as unknown as FakeElement, 'maltline-replay-scrubber__position');
    range.value = '321';
    range.dispatchEvent(new Event('input'));
    const [scheduledHandle, staleRangeSeek] = scheduler.callbacks.entries().next().value as [
      number,
      FrameRequestCallback,
    ];

    motionPreference.set(true);

    expect(scrubber.snapshot()).toMatchObject({ stageTick: 0, playing: false });
    expect(range.value).toBe('0');
    expect(scheduler.cancelled).toContain(scheduledHandle);
    staleRangeSeek(0);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 0, playing: false });
    expect(motionPreference.listeners.size).toBe(1);

    scrubber.destroy();
    expect(motionPreference.listeners.size).toBe(0);
    motionPreference.set(false);
    expect(scrubber.snapshot()).toMatchObject({ stageTick: 0, destroyed: true });
  });

  it('keeps an explicitly supplied renderer motion mode fixed without a browser listener', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const documentRef = new FakeDocument();
    let subscriptions = 0;
    Object.defineProperty(documentRef, 'defaultView', {
      value: {
        matchMedia: () => ({
          matches: true,
          addEventListener: () => { subscriptions++; },
          removeEventListener: () => undefined,
        }),
      },
    });
    const target = new FakeElement(documentRef, 'div');
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
      scheduler: new FakeRaf(),
      rendererDependencies: { reducedMotion: false },
    });

    expect(subscriptions).toBe(0);
    scrubber.destroy();
  });

  it('describes player action and moving jar state outside the hidden canvas', async () => {
    const { playback, scrubber, root } = await fixture(retainedMistake);
    const wanted = {
      blending: null as { stageIndex: number; stageTick: number } | null,
      holding: null as { stageIndex: number; stageTick: number } | null,
      outbound: null as { stageIndex: number; stageTick: number } | null,
      returning: null as { stageIndex: number; stageTick: number } | null,
    };
    for (const stage of playback.stages) {
      for (let stageTick = 0; stageTick <= stage.ticks; stageTick++) {
        const candidate = playback.frameAt({ stageIndex: stage.stageIndex, stageTick });
        const position = { stageIndex: stage.stageIndex, stageTick };
        if (wanted.blending === null && candidate.state.player.blending !== null) wanted.blending = position;
        if (wanted.holding === null && candidate.state.player.holding !== null) wanted.holding = position;
        if (wanted.outbound === null && candidate.state.slides.length > 0) wanted.outbound = position;
        if (wanted.returning === null && candidate.state.jars.length > 0) wanted.returning = position;
        if (Object.values(wanted).every((value) => value !== null)) break;
      }
      if (Object.values(wanted).every((value) => value !== null)) break;
    }

    const summary = byClass(root, 'maltline-replay-scrubber__summary');
    for (const [kind, position] of Object.entries(wanted)) {
      expect(position, `missing ${kind} fixture`).not.toBeNull();
      scrubber.selectStage(position!.stageIndex);
      scrubber.seekToTick(position!.stageTick);
      expect(summary.textContent).toMatch(/Window \d+; .* station selected;/u);
      if (kind === 'blending') expect(summary.textContent).toMatch(/shake processing at \d+%/u);
      if (kind === 'holding') expect(summary.textContent).toMatch(/shake held and ready/u);
      if (kind === 'outbound') expect(summary.textContent).toMatch(/[1-9]\d* shakes? outbound/u);
      if (kind === 'returning') expect(summary.textContent).toMatch(/[1-9]\d* jars? returning/u);
      expect(summary.textContent).toContain('campaign points');
    }
  });

  it('shares station-action truth for no-clean and selected-versus-processing frames', async () => {
    const { playback } = await fixture();
    const scenario = MALTLINE_GENERATION_2_AUTHORITY.campaign[5]!;
    const baseline = playback.frameAt({ stageIndex: 0, stageTick: 0 });
    const splitFrame = {
      ...baseline,
      state: {
        ...baseline.state,
        scenarioId: scenario.id,
        jarsAvailable: 2,
        player: {
          ...baseline.state.player,
          station: 1,
          blending: 'strawberry' as const,
          blendProgress: scenario.blendTicks / 2,
          holding: null,
        },
      },
    };
    expect(describeMaltlineReplayFrameAction(splitFrame, scenario)).toContain(
      'Chocolate station selected; Strawberry shake processing at 50%',
    );

    const blockedFrame = {
      ...splitFrame,
      state: {
        ...splitFrame.state,
        jarsAvailable: 0,
        player: { ...splitFrame.state.player, blending: null, blendProgress: 0 },
      },
    };
    expect(describeMaltlineReplayFrameAction(blockedFrame, scenario)).toContain(
      'Chocolate station selected; no clean jars available',
    );
  });

  it.each([
    ['won', () => retainedWin],
    ['lost', () => retainedLoss],
  ])('clears stale terminal event copy when a %s stage is replayed', async (_status, retained) => {
    const { playback, scrubber, root } = await fixture(retained());
    const terminalStage = playback.stages.length - 1;
    scrubber.selectStage(terminalStage);
    scrubber.seekToTick(playback.stages[terminalStage]!.ticks);
    expect(byClass(root, 'maltline-replay-scrubber__event').textContent)
      .not.toBe('Recent event: No recent major event.');
    control(root, 'Replay stage').dispatchEvent(new Event('click'));
    expect(scrubber.snapshot()).toMatchObject({ stageIndex: terminalStage, stageTick: 0, playing: true });
    expect(byClass(root, 'maltline-replay-scrubber__event').textContent)
      .toBe('Recent event: No recent major event.');
  });

  it('derives default renderer time and randomness from proof, stage, and tick', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const renderAt = (stageIndex: number, stageTick: number): string => {
      const documentRef = new FakeDocument();
      const target = new FakeElement(documentRef, 'div');
      const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
        scheduler: new FakeRaf(),
      });
      scrubber.selectStage(stageIndex);
      documentRef.canvas.commands.length = 0;
      scrubber.seekToTick(stageTick);
      return JSON.stringify(documentRef.canvas.commands);
    };

    expect(renderAt(4, 400)).toBe(renderAt(4, 400));
    expect(renderAt(4, 400)).not.toBe(renderAt(4, 401));
  });

  it('keeps controls and semantic facts usable when a canvas context is unavailable', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedWin.envelope);
    const documentRef = new FakeDocument();
    Object.defineProperty(documentRef, 'canvas', { value: null });
    const target = new FakeElement(documentRef, 'div');
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
      scheduler: new FakeRaf(),
    });
    const root = scrubber.root as unknown as FakeElement;

    expect(root.textContent).toContain('Replay picture unavailable.');
    expect(root.textContent).toContain('Stage 8 of 8, Closing Time.');
    expect(control(root, 'Play stage').getAttribute('aria-label')).toBe('Play replay stage');
    scrubber.seekToTick(10);
    expect(scrubber.snapshot().stageTick).toBe(10);
  });

  it('keeps latest event text and announces only discrete important playback events', async () => {
    const playback = await createVerifiedMaltlinePlayback(retainedMistake.envelope);
    const lifeLoss = eventPosition(playback, 'life_lost');
    const documentRef = new FakeDocument();
    const target = new FakeElement(documentRef, 'div');
    const scheduler = new FakeRaf();
    const announcements: string[] = [];
    const scrubber = mountMaltlineReplayScrubber(target as unknown as HTMLElement, playback, {
      scheduler,
      announce: (message) => announcements.push(message),
      rendererDependencies: { reducedMotion: true, random: () => 0.5, nowMs: () => 12_000 },
    });
    const root = scrubber.root as unknown as FakeElement;
    scrubber.selectStage(lifeLoss.stageIndex);
    scrubber.seekToTick(lifeLoss.stageTick - 1);
    scrubber.setSpeed(1);
    const prior = announcements.length;
    scrubber.play();
    scheduler.fire(0);
    scheduler.fire(17);

    expect(scrubber.snapshot().stageTick).toBe(lifeLoss.stageTick);
    expect(byClass(root, 'maltline-replay-scrubber__event').textContent).toMatch(/Life lost:/u);
    expect(announcements.slice(prior)).toHaveLength(2);
    expect(announcements.at(-1)).toMatch(/Life lost:/u);

    scheduler.fire(34);
    expect(byClass(root, 'maltline-replay-scrubber__event').textContent).toMatch(/Life lost:/u);
    expect(announcements.slice(prior)).toHaveLength(2);
  });

  it('pauses on visibility loss and cancels/removes everything on idempotent destroy', async () => {
    const { scrubber, scheduler, documentRef, target, root, announcements } = await fixture();
    scrubber.play();
    expect(scheduler.callbacks.size).toBe(1);
    documentRef.hidden = true;
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(scrubber.snapshot().playing).toBe(false);
    expect(scheduler.callbacks.size).toBe(0);
    expect(announcements.at(-1)).toBe('Replay paused because the page is hidden.');

    scrubber.play();
    const range = byClass(root, 'maltline-replay-scrubber__position');
    range.value = '321';
    range.dispatchEvent(new Event('input'));
    expect(scheduler.callbacks.size).toBe(1);
    const scheduledHandle = [...scheduler.callbacks.keys()][0]!;
    scrubber.destroy();
    scrubber.destroy();
    expect(scrubber.snapshot().destroyed).toBe(true);
    expect(scheduler.cancelled).toContain(scheduledHandle);
    expect(target.children).not.toContain(root);
    scrubber.play();
    expect(scheduler.callbacks.size).toBe(0);
  });
});
