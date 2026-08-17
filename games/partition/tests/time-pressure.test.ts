import { describe, expect, it } from 'vitest';
import { resolveTimePressure } from '../src/viewer/time-pressure';

describe('time pressure HUD thresholds', () => {
  it('escalates a three-minute field through warning and critical phases', () => {
    const ticksPerSecond = 30;
    const totalTicks = 180 * ticksPerSecond;
    expect(resolveTimePressure(totalTicks, 31 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('none');
    expect(resolveTimePressure(totalTicks, 30 * ticksPerSecond, ticksPerSecond, 'running')).toMatchObject({
      level: 'warning', warningAtSeconds: 30, criticalAtSeconds: 12,
    });
    expect(resolveTimePressure(totalTicks, 12 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('critical');
  });

  it('keeps shorter fields calm until the final fifteen seconds', () => {
    const ticksPerSecond = 30;
    const totalTicks = 65 * ticksPerSecond;
    expect(resolveTimePressure(totalTicks, 16 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('none');
    expect(resolveTimePressure(totalTicks, 15 * ticksPerSecond, ticksPerSecond, 'running')).toMatchObject({
      level: 'warning', warningAtSeconds: 15, criticalAtSeconds: 6,
    });
  });

  it('briefly pulses the clock at thirty-second countdown milestones', () => {
    const ticksPerSecond = 30;
    const totalTicks = 180 * ticksPerSecond;
    expect(resolveTimePressure(totalTicks, 151 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('none');
    expect(resolveTimePressure(totalTicks, 150 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('pulse');
    expect(resolveTimePressure(totalTicks, 147 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('pulse');
    expect(resolveTimePressure(totalTicks, 145 * ticksPerSecond, ticksPerSecond, 'running').level).toBe('none');
  });

  it('removes pressure treatment once the field is terminal or untimed', () => {
    expect(resolveTimePressure(undefined, null, 30, 'running').level).toBe('none');
    expect(resolveTimePressure(900, 30, 30, 'won').level).toBe('none');
    expect(resolveTimePressure(900, 0, 30, 'lost').level).toBe('none');
  });
});
