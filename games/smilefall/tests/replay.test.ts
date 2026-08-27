import { describe, expect, it } from 'vitest';
import { SmilefallEngine } from '../src/core/engine';
import { parseSmilefallReplay, replaySmilefall, replaySmilefallFrames } from '../src/core/replay';
import { ContinuousSmilefallSession } from '../src/runtime/session';
import { smilefallCatalog } from '../src/levels/catalog';
import type { ControlInput, SmilefallState } from '../src/core/types';

function scriptedInput(tick: number): ControlInput {
  return {
    lean: tick % 120 < 40 ? 'left' : tick % 120 < 80 ? 'right' : 'none',
    hop: tick % 97 === 0,
  };
}

function recordedSession(ticks: number): ContinuousSmilefallSession {
  const session = new ContinuousSmilefallSession(new SmilefallEngine(smilefallCatalog[0]!.scenario));
  for (let tick = 0; tick < ticks; tick++) {
    session.setInput(scriptedInput(tick));
    session.tick();
  }
  return session;
}

describe('Smilefall replay', () => {
  it('reconstructs a recorded session exactly', () => {
    const session = recordedSession(300);
    const replay = session.replay();
    const finalState = replaySmilefall(replay);
    expect(finalState).toEqual(session.engine.snapshot());
  });

  it('produces one frame per recorded tick plus the opening frame', () => {
    const replay = recordedSession(120).replay();
    const frames = replaySmilefallFrames(replay);
    expect(frames).toHaveLength(replay.ticks.length + 1);
    expect(frames[0]!.state.tick).toBe(0);
    expect(frames.at(-1)!.state.tick).toBe(replay.ticks.length);
  });

  it('round-trips through JSON', () => {
    const replay = recordedSession(90).replay();
    const parsed = parseSmilefallReplay(JSON.stringify(replay));
    expect(replaySmilefall(parsed)).toEqual(replay.finalState);
  });

  it('rejects a replay whose final state was tampered with', () => {
    const replay = recordedSession(90).replay();
    const tampered = {
      ...replay,
      finalState: { ...replay.finalState, score: replay.finalState.score + 5000 } as SmilefallState,
    };
    expect(() => replaySmilefall(tampered)).toThrow(/final state/);
  });

  it('records controller installs alongside the tick stream', () => {
    const session = new ContinuousSmilefallSession(new SmilefallEngine(smilefallCatalog[0]!.scenario));
    session.installController({
      reset: () => ({ leaning: 'left' as const }),
      onTick: (_state, _events, memory) => ({ lean: memory.leaning, hop: false }),
    });
    for (let tick = 0; tick < 60; tick++) session.tick();
    const replay = session.replay();
    expect(replay.ticks[0]!.controlEvents?.[0]).toMatchObject({ type: 'controller_installed', version: 1 });
    expect(replay.finalState.controllerVersion).toBe(1);
    expect(replaySmilefall(replay)).toEqual(session.engine.snapshot());
  });

  it('samples live gameplay for a watching model', async () => {
    const session = new ContinuousSmilefallSession(new SmilefallEngine(smilefallCatalog[0]!.scenario));
    const watch = session.watchGameplay({ ticks: 30, sampleEveryTicks: 10 });
    for (let tick = 0; tick < 30; tick++) session.tick();
    const result = await watch;
    expect(result.fromTick).toBe(0);
    expect(result.toTick).toBe(30);
    expect(result.samples.map((sample) => sample.tick)).toEqual([10, 20, 30]);
  });
});
