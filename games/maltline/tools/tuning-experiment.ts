import {
  formatMaltlineTuningExperiment,
  runMaltlineTuningExperiment,
} from '../src/telemetry/tuning-experiment';

process.stdout.write(formatMaltlineTuningExperiment(runMaltlineTuningExperiment()));
