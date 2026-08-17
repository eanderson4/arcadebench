import { describe, expect, it } from 'vitest';
import { ReplayTransport } from '../src/viewer/replay-transport';

const frames = Array.from({ length: 11 }, (_, tick) => ({ state: { tick } }));

describe('ReplayTransport', () => {
  it('advances according to authoritative tick rate and playback speed', () => {
    const transport = new ReplayTransport(frames, 10);
    transport.setSpeed(2);
    transport.play();

    expect(transport.advance(49).changed).toBe(false);
    expect(transport.advance(1).changed).toBe(true);
    expect(transport.index).toBe(1);
    transport.advance(100);
    expect(transport.index).toBe(3);
  });

  it('seeks, steps, and restarts playback from the end', () => {
    const transport = new ReplayTransport(frames, 10);
    expect(transport.seekTick(6)).toBe(6);
    expect(transport.step(-2)).toBe(4);
    expect(transport.isPlaying).toBe(false);
    transport.seekFrame(10);
    transport.play();
    expect(transport.index).toBe(0);
    expect(transport.isPlaying).toBe(true);
  });

  it('stops exactly at the final frame when loop is disabled', () => {
    const transport = new ReplayTransport(frames, 10);
    transport.seekFrame(9);
    transport.play();
    expect(transport.advance(200)).toEqual({ changed: true, reachedEnd: true, looped: false });
    expect(transport.index).toBe(10);
    expect(transport.isPlaying).toBe(false);
  });

  it('wraps across the timeline when loop is enabled', () => {
    const transport = new ReplayTransport(frames, 10);
    transport.setLoop(true);
    transport.setSpeed(2);
    transport.seekFrame(9);
    transport.play();
    expect(transport.advance(150)).toEqual({ changed: true, reachedEnd: false, looped: true });
    expect(transport.index).toBe(1);
    expect(transport.isPlaying).toBe(true);
  });

  it('bounds long background gaps and validates speeds', () => {
    const transport = new ReplayTransport(frames, 10);
    transport.play();
    transport.advance(5_000);
    expect(transport.index).toBe(2);
    expect(() => transport.setSpeed(0)).toThrow('greater than zero');
    expect(() => transport.setSpeed(17)).toThrow('at most 16');
  });
});
