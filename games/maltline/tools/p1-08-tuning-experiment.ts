import { runP108TuningExperiment } from '../src/telemetry/p1-08-tuning-experiment';
import {
  createP108ArtifactEnvelope,
  formatP108ArtifactEnvelope,
} from './p1-08-artifact-envelope';

const payload = await runP108TuningExperiment();
process.stdout.write(formatP108ArtifactEnvelope(await createP108ArtifactEnvelope(payload)));
