/** Test-only vectors and protocol bounds. Not part of the production root API. */
export {
  GENERATION_2_LOSS_PROOF,
  GENERATION_2_MISTAKE_PROOF,
  GENERATION_2_WIN_PROOF,
} from './generation-2-proofs';
export {
  MAX_MALTLINE_PROOF_INPUT_RUNS,
  MAX_MALTLINE_PROOF_STAGE_TICKS,
  MAX_MALTLINE_PROOF_TOTAL_TICKS,
} from '../core/proof';
export {
  MALTLINE_RESOLUTION_HARNESS_KIND,
  createMaltlineResolutionHarness,
  type MaltlineResolutionHarness,
  type MaltlineResolutionHarnessInput,
  type MaltlineResolutionHarnessState,
} from './resolution-harness';
