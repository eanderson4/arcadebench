/**
 * Authoritative deterministic rules that affect simulation or score output.
 * Telemetry fingerprints this manifest, so changing one of these values is an
 * explicit protocol change rather than an invisible change to benchmark data.
 */
export const MALTLINE_GAME_ID = 'maltline' as const;
export const MALTLINE_SCENARIO_SCHEMA_VERSION = 1 as const;

export const MALTLINE_RULES = Object.freeze({
  version: 2,
  fixedScale: 1024,
  initialSpawnDelayTicks: 30,
  stageClearBonusPerLife: 250,
  serveBaseScore: 100,
  serveStreakStep: 10,
  serveStreakCap: 10,
  jarCatchScore: 25,
  maximumRequeuesPerCustomer: 1,
  tickOrder: Object.freeze([
    'input',
    'spawn',
    'customers',
    'slides',
    'jars',
    'washing',
    'status',
  ] as const),
});
