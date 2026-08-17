import type { EpisodeStatus } from '../core/types';

export type TimePressureLevel = 'none' | 'warning' | 'critical';

export interface TimePressureState {
  level: TimePressureLevel;
  remainingSeconds: number;
  warningAtSeconds: number;
  criticalAtSeconds: number;
}

export function resolveTimePressure(
  totalTicks: number | undefined,
  remainingTicks: number | null,
  ticksPerSecond: number,
  status: EpisodeStatus,
): TimePressureState {
  if (totalTicks === undefined || remainingTicks === null || status !== 'running') {
    return { level: 'none', remainingSeconds: 0, warningAtSeconds: 0, criticalAtSeconds: 0 };
  }
  const totalSeconds = totalTicks / ticksPerSecond;
  const remainingSeconds = Math.max(0, Math.ceil(remainingTicks / ticksPerSecond));
  const warningAtSeconds = Math.max(15, Math.min(30, Math.ceil(totalSeconds * 0.2)));
  const criticalAtSeconds = Math.max(6, Math.min(12, Math.ceil(totalSeconds * 0.08)));
  const level = remainingSeconds <= criticalAtSeconds
    ? 'critical'
    : remainingSeconds <= warningAtSeconds
      ? 'warning'
      : 'none';
  return { level, remainingSeconds, warningAtSeconds, criticalAtSeconds };
}
