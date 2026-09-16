import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/core/types';
import { PartitionAudio, partitionSoundCues } from '../src/viewer/audio';

describe('Partition runtime audio', () => {
  it('maps authoritative engine events to field cues', () => {
    const events: GameEvent[] = [
      { tick: 1, type: 'trace_started', at: { x: 1, y: 2 } },
      { tick: 2, type: 'trace_completed', capturedCells: 14 },
      { tick: 2, type: 'level_won', capturedFraction: 0.76 },
    ];
    expect(partitionSoundCues(events)).toEqual(['trace-open', 'partition', 'win']);
  });

  it('uses the terminal loss cue instead of stacking damage', () => {
    expect(partitionSoundCues([
      { tick: 3, type: 'trace_hit', anomalyId: 'a', integrity: 0 },
      { tick: 3, type: 'game_lost' },
    ])).toEqual(['loss']);
  });

  it('keeps mute usable when Web Audio is unavailable', () => {
    const audio = new PartitionAudio(() => null);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
    expect(() => audio.play('partition')).not.toThrow();
  });
});
