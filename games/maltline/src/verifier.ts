/**
 * Production verifier surface for server runtimes.
 *
 * Keep this leaf entry free of viewer, telemetry, experiment, and testing
 * imports. Browser/local tooling can continue to use the package root.
 */
export {
  MALTLINE_GENERATION_2_AUTHORITY,
} from './core/authority';
export {
  MALTLINE_PROOF_ENVELOPE_VERSION,
  MaltlineProofError,
  verifyAndHashMaltlineProof,
  type HashedMaltlineProof,
  type MaltlineServerChallenge,
} from './core/proof';
