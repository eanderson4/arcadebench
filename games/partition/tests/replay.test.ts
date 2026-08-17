import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { replayPartition } from '../src/core/replay';
import { createClassicScenario } from '../src/core/scenarios';
import { ContinuousPartitionSession } from '../src/runtime/session';

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
});

