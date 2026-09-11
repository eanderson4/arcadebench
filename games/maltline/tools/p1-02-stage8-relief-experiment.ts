import {
  runP102Stage8ReliefExperiment,
} from '../src/experiments/p1-02-stage8-relief-experiment';
import {
  createP102Stage8ReliefEnvelope,
  formatP102Stage8ReliefEnvelope,
} from './p1-02-stage8-relief-envelope';

try {
  const payload = await runP102Stage8ReliefExperiment();
  process.stdout.write(formatP102Stage8ReliefEnvelope(await createP102Stage8ReliefEnvelope(payload)));
} catch (error) {
  process.stderr.write(`P1-02 Stage 8 relief experiment failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
