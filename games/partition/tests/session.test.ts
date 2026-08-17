import { describe, expect, it } from 'vitest';
import { PartitionEngine } from '../src/core/engine';
import { createClassicScenario } from '../src/core/scenarios';
import { ContinuousPartitionSession } from '../src/runtime/session';

describe('ContinuousPartitionSession', () => {
  it('watches an already-running tick interval without owning advancement', async () => {
    const session = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(11)));
    const watched = session.watchGameplay({ ticks: 3 });
    session.tick();
    session.tick();
    session.tick();
    const result = await watched;
    expect(result.fromTick).toBe(0);
    expect(result.toTick).toBe(3);
    expect(result.samples).toHaveLength(3);
  });

  it('keeps a resident controller active across ticks', () => {
    const session = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(11)));
    const version = session.installController({
      reset: () => ({ ticks: 0 }),
      onTick: (_state, _events, memory) => {
        memory.ticks++;
        return { direction: 'left', draw: 'off' };
      },
    });
    session.tick();
    session.tick();
    expect(version).toBe(1);
    expect(session.engine.snapshot().spark.position.x).toBe(22);
  });

  it('rejects watch requests that would flood model context', async () => {
    const session = new ContinuousPartitionSession(new PartitionEngine(createClassicScenario(11)));
    expect(() => session.watchGameplay({ ticks: 121 })).toThrow(/120 state samples/);
    const watched = session.watchGameplay({ ticks: 600, sampleEveryTicks: 5 });
    for (let tick = 0; tick < 600; tick++) session.tick();
    await expect(watched).resolves.toMatchObject({ fromTick: 0, toTick: 600 });
  });
});
