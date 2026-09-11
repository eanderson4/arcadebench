import { fingerprintCanonical, type CanonicalValue } from './fingerprint';
import {
  normalizeMaltlineScenario,
  type NormalizedMaltlineScenario,
} from './scenario';
import type { MaltlineScenario } from './types';

export function maltlineScenarioFingerprintData(
  scenario: NormalizedMaltlineScenario,
): CanonicalValue {
  return {
    id: scenario.id,
    name: scenario.name,
    ticksPerSecond: scenario.ticksPerSecond,
    lanes: scenario.lanes,
    laneLength: scenario.laneLength,
    stations: [...scenario.stations],
    jarPoolSize: scenario.jarPoolSize,
    blendTicks: scenario.blendTicks,
    washTicks: scenario.washTicks,
    drinkTicks: scenario.drinkTicks,
    customerCount: scenario.customerCount,
    spawnIntervalTicks: scenario.spawnIntervalTicks,
    spawnAccelerationTicks: scenario.spawnAccelerationTicks,
    spawnIntervalFloorTicks: scenario.spawnIntervalFloorTicks,
    marchSpeed: scenario.marchSpeed,
    leaveSpeed: scenario.leaveSpeed,
    slideSpeed: scenario.slideSpeed,
    returnSpeed: scenario.returnSpeed,
    resumeExitThreshold: scenario.resumeExitThreshold,
    stationRepeatTicks: scenario.stationRepeatTicks,
    laneRepeatTicks: scenario.laneRepeatTicks,
    lives: scenario.lives,
    seed: scenario.seed,
  };
}

export function fingerprintNormalizedMaltlineScenario(
  scenario: NormalizedMaltlineScenario,
): string {
  return fingerprintCanonical(maltlineScenarioFingerprintData(scenario));
}

export function fingerprintMaltlineCampaign(
  scenarios: readonly MaltlineScenario[],
): string {
  const normalized = scenarios.map(normalizeMaltlineScenario);
  return fingerprintCanonical({
    scenarios: normalized.map(maltlineScenarioFingerprintData),
  });
}
