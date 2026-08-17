import type { EpisodeStatus } from '../core/types';

export type TimePressureLevel = 'none' | 'pulse' | 'warning' | 'critical';

export interface TimePressureState {
  level: TimePressureLevel;
  remainingSeconds: number;
  warningAtSeconds: number;
  criticalAtSeconds: number;
  remainingFraction: number;
}

export function resolveTimePressure(
  totalTicks: number | undefined,
  remainingTicks: number | null,
  ticksPerSecond: number,
  status: EpisodeStatus,
): TimePressureState {
  if (totalTicks === undefined || remainingTicks === null || status !== 'running') {
    return {
      level: 'none', remainingSeconds: 0, warningAtSeconds: 0, criticalAtSeconds: 0, remainingFraction: 0,
    };
  }
  const totalSeconds = totalTicks / ticksPerSecond;
  const remainingSeconds = Math.max(0, Math.ceil(remainingTicks / ticksPerSecond));
  const warningAtSeconds = Math.max(15, Math.min(30, Math.ceil(totalSeconds * 0.2)));
  const criticalAtSeconds = Math.max(6, Math.min(12, Math.ceil(totalSeconds * 0.08)));
  let level: TimePressureLevel = remainingSeconds <= criticalAtSeconds
    ? 'critical'
    : remainingSeconds <= warningAtSeconds
      ? 'warning'
      : 'none';
  if (level === 'none') {
    const pulseEveryTicks = ticksPerSecond * 30;
    const pulseDurationTicks = Math.round(ticksPerSecond * 1.25);
    const elapsedTicks = totalTicks - remainingTicks;
    const ticksSinceMilestone = (pulseEveryTicks - (remainingTicks % pulseEveryTicks)) % pulseEveryTicks;
    if (elapsedTicks >= ticksPerSecond * 10 && ticksSinceMilestone <= pulseDurationTicks) level = 'pulse';
  }
  return {
    level,
    remainingSeconds,
    warningAtSeconds,
    criticalAtSeconds,
    remainingFraction: Math.max(0, Math.min(1, remainingTicks / totalTicks)),
  };
}
