import { runP104RecoveryExperiment } from '../src/experiments/p1-04-recovery-experiment';

try {
  const artifact = await runP104RecoveryExperiment();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`P1-04 recovery experiment failed: ${message}\n`);
  process.exitCode = 1;
}
