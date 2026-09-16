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
export { MALTLINE_CABINET_AUTHORITY, MALTLINE_CABINET_GAME_VERSION, MALTLINE_CABINET_SEASON_ID } from './core/cabinet-authority';
export {
  MaltlineCabinetProofError,
  verifyMaltlineCabinetProof,
  type MaltlineCabinetChallenge,
  type MaltlineCabinetSummary,
} from './core/cabinet-proof';

export { MALTLINE_CURRENT_CABINET_AUTHORITY, MALTLINE_CABINET_2_AUTHORITY, resolveMaltlineCabinetAuthority } from './core/cabinet-authorities';
