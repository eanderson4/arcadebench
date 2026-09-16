import { describe, expect, it } from 'vitest';
import type { GameEvent, MaltlineState } from '../src/core/types';
import { MaltlineAudio, maltlineSoundCues } from '../src/viewer/audio';

function state(lane: number, station: number): MaltlineState {
  return { player: { lane, station, x: 0, holding: null, blending: null, blendProgress: 0 } } as MaltlineState;
}

describe('Maltline runtime audio', () => {
  it('maps movement and gameplay outcomes to distinct presentation cues', () => {
    const events: GameEvent[] = [
      { tick: 1, type: 'blend_completed', flavor: 'vanilla' },
      { tick: 1, type: 'shake_launched', lane: 1, flavor: 'vanilla' },
      { tick: 1, type: 'served', customerId: 1, lane: 1, flavor: 'vanilla', exitAfterDrink: true, firstFulfillment: true, points: 100 },
      { tick: 1, type: 'jar_caught', customerId: 1, lane: 1, points: 25 },
    ];
    expect(maltlineSoundCues(state(0, 0), state(1, 1), events)).toEqual([
      'lane-move', 'flavor-move', 'ready', 'serve', 'served', 'jar-caught',
    ]);
  });

  it('uses the terminal cue instead of stacking a failure cue on game over', () => {
    expect(maltlineSoundCues(state(0, 0), state(0, 0), [
      { tick: 2, type: 'life_lost', reason: 'walkout', lives: 0 },
      { tick: 2, type: 'game_lost' },
    ])).toEqual(['game-over']);
  });

  it('keeps mute usable when Web Audio is unavailable', () => {
    const audio = new MaltlineAudio(() => null);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
    expect(() => audio.play('ready')).not.toThrow();
  });
});
