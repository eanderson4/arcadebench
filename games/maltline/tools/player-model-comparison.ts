import {
  formatMaltlinePlayerModelComparison,
  runMaltlinePlayerModelComparison,
} from '../src/telemetry/player-model-comparison';

process.stdout.write(formatMaltlinePlayerModelComparison(runMaltlinePlayerModelComparison()));
