import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { parsePartitionReplay, replayPartition, replayPartitionFrames } from '../src/core/replay';
import { createClassicScenario } from '../src/core/scenarios';
import { ContinuousPartitionSession } from '../src/runtime/session';
import { createShowcaseReplay } from '../src/viewer/showcase-replay';

describe('Partition replay', () => {
  it('re-simulates applied inputs to the identical final state', () => {
    const session = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(17)));
    session.setInput({ direction: 'left', draw: 'off' });
    for (let index = 0; index < 6; index++) session.tick();
    session.setInput({ direction: 'up', draw: 'fast' });
    for (let index = 0; index < 20; index++) session.tick();
    const replay = session.replay();
    expect(replayPartition(replay)).toEqual(replay.finalState);
  });

  it('records the applied draw input on a trace-closing tick', () => {
    const scenario = createClassicScenario(23);
    // This test isolates replay input attribution from the human-play cadence.
    scenario.sparkMoveEveryTicks = 1;
    const session = new ContinuousPartitionSession(new PartitionEngine(scenario));
    session.setInput({ direction: 'right', draw: 'off' });
    while (session.engine.snapshot().spark.position.x < 42) session.tick();
    session.setInput({ direction: 'up', draw: 'fast' });
    let completed = false;
    for (let tick = 0; tick < 200 && !completed; tick++) {
      const result = session.tick();
      completed = result.events.some((event) => event.type === 'trace_completed');
    }

    const replay = session.replay();
    expect(completed).toBe(true);
    expect(replay.ticks.at(-1)?.events.some((event) => event.type === 'trace_completed')).toBe(true);
    expect(replay.ticks.at(-1)?.input.draw).toBe('fast');
    expect(replayPartition(replay)).toEqual(replay.finalState);
  });

  it('builds a validated, tick-addressable showcase timeline', () => {
    const replay = createShowcaseReplay();
    const frames = replayPartitionFrames(replay);
    const events = replay.ticks.flatMap((record) => record.events);

    expect(frames).toHaveLength(replay.ticks.length + 1);
    expect(frames.at(-1)?.state).toEqual(replay.finalState);
    expect(events.some((event) => event.type === 'trace_completed')).toBe(true);
    expect(replay.finalState.capturedFraction).toBeGreaterThan(0);
    expect(parsePartitionReplay(JSON.stringify(replay))).toEqual(replay);
  });

  it('rejects incomplete replay JSON before playback', () => {
    expect(() => parsePartitionReplay('{"version":1,"ticks":[]}')).toThrow('missing scenario');
  });

  it('preserves controller installations as inspectable replay events', () => {
    const session = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(11)));
    session.installController({
      reset: () => null,
      onTick: () => ({ direction: 'left', draw: 'off' }),
    });
    session.tick();

    const replay = session.replay();
    expect(replay.ticks[0].controlEvents).toEqual([
      { tick: 0, type: 'controller_installed', version: 1 },
    ]);
    expect(replayPartitionFrames(replay)[1].events[0]).toEqual(
      { tick: 0, type: 'controller_installed', version: 1 },
    );
  });

  it('accepts additive state fields missing from an older version-1 artifact', () => {
    const scenario = createClassicScenario(11);
    delete scenario.sparkMoveEveryTicks;
    const session = new ContinuousPartitionSession(new PartitionEngine(scenario));
    session.setInput({ direction: 'left', draw: 'off' });
    session.tick();
    const replay = session.replay();
    const legacyFinalState = replay.finalState as unknown as Record<string, unknown>;
    for (const field of [
      'failureReason',
      'difficultyId',
      'blockedCells',
      'playableCellCount',
      'timeRemainingTicks',
      'sparkMoveEveryTicks',
    ]) delete legacyFinalState[field];

    expect(replayPartitionFrames(replay).at(-1)?.state.tick).toBe(1);
  });

  it('rejects a replay whose claimed final state was altered', () => {
    const replay = createShowcaseReplay();
    replay.finalState.capturedFraction = 0;
    expect(() => replayPartitionFrames(replay)).toThrow('final state does not match');
  });
});
