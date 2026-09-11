import { fingerprintCanonical } from '../core/fingerprint';
import { normalizeMaltlineInput } from '../core/input';
import type { MaltlineInput } from '../core/types';
import {
  MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER,
  MALTLINE_VIEWER_INPUT_ADAPTER_ID,
  MALTLINE_VIEWER_SERVE_LATCH_POLICY,
  MaltlineViewerInputAdapter,
} from '../viewer/viewer-input-adapter';
import {
  runMaltlinePlayerModelComparison,
  type MaltlinePlayerModelComparison,
  type PlayerModelComparisonOptions,
} from './player-model-comparison';
import {
  DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  NOVICE_ERROR_MALTLINE_CONTROLLER,
} from './player-model-controllers';
import {
  REACTIVE_MALTLINE_CONTROLLER,
  type MaltlineController,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export const MALTLINE_PHYSICAL_INTENT_MEDIATOR_ID = 'physical-intent-mediator-v1' as const;

export const MALTLINE_PHYSICAL_INTENT_ADAPTER_FINGERPRINT_DATA = Object.freeze({
  id: MALTLINE_VIEWER_INPUT_ADAPTER_ID,
  directionInitialRepeatMultiplier: MALTLINE_DIRECTION_INITIAL_REPEAT_MULTIPLIER,
  serveLatchPolicy: MALTLINE_VIEWER_SERVE_LATCH_POLICY,
});

function desiredCodes(input: MaltlineInput): ReadonlySet<string> {
  const codes = new Set<string>();
  if (input.stationDir < 0) codes.add('ArrowLeft');
  if (input.stationDir > 0) codes.add('ArrowRight');
  if (input.laneDir < 0) codes.add('ArrowUp');
  if (input.laneDir > 0) codes.add('ArrowDown');
  if (input.blend) codes.add('Space');
  if (input.serve) codes.add('KeyF');
  return codes;
}

/**
 * Treats a deterministic controller's output as desired physical key levels,
 * then passes the corresponding key transitions through the shipped viewer
 * adapter. Existing raw controller identities and evidence remain unchanged.
 */
export function mediateMaltlinePhysicalIntent(
  source: MaltlineControllerDefinition,
): MaltlineControllerDefinition {
  if (source === null || typeof source !== 'object' || typeof source.create !== 'function') {
    throw new Error('physical-intent source controller must be a controller definition');
  }
  const sourceFingerprint = fingerprintCanonical({
    id: source.id,
    behavior: source.fingerprintData,
  });
  const mediated: MaltlineControllerDefinition = Object.freeze({
    id: `${source.id}-physical-intent-v1`,
    fingerprintData: Object.freeze({
      algorithm: MALTLINE_PHYSICAL_INTENT_MEDIATOR_ID,
      version: 1,
      sourceControllerId: source.id,
      sourceControllerFingerprint: sourceFingerprint,
      adapter: MALTLINE_PHYSICAL_INTENT_ADAPTER_FINGERPRINT_DATA,
    }),
    create: () => {
      const controller = source.create();
      let adapter: MaltlineViewerInputAdapter | null = null;
      let heldCodes: ReadonlySet<string> = new Set();
      const mediatedController: MaltlineController = (state, scenario) => {
        adapter ??= new MaltlineViewerInputAdapter(scenario);
        const intended = normalizeMaltlineInput(
          controller(state, scenario),
          `Physical-intent controller ${source.id} output`,
        );
        const nextCodes = desiredCodes(intended);
        for (const code of heldCodes) {
          if (!nextCodes.has(code)) adapter.keyUp(code);
        }
        for (const code of nextCodes) {
          if (!heldCodes.has(code)) adapter.keyDown(code);
        }
        heldCodes = nextCodes;
        return adapter.inputForTick(state.tick + 1, state);
      };
      return mediatedController;
    },
  });
  return mediated;
}

export const PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER =
  mediateMaltlinePhysicalIntent(REACTIVE_MALTLINE_CONTROLLER);
export const PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER =
  mediateMaltlinePhysicalIntent(DELAYED_COMPETENT_MALTLINE_CONTROLLER);
export const PHYSICAL_INTENT_NOVICE_ERROR_MALTLINE_CONTROLLER =
  mediateMaltlinePhysicalIntent(NOVICE_ERROR_MALTLINE_CONTROLLER);

export const MALTLINE_PHYSICAL_INTENT_PROFILES = Object.freeze([
  PHYSICAL_INTENT_REACTIVE_MALTLINE_CONTROLLER,
  PHYSICAL_INTENT_DELAYED_COMPETENT_MALTLINE_CONTROLLER,
  PHYSICAL_INTENT_NOVICE_ERROR_MALTLINE_CONTROLLER,
]);

export interface MaltlinePhysicalIntentComparisonOptions extends
  Omit<PlayerModelComparisonOptions, 'profiles'> {
  sourceProfiles?: readonly MaltlineControllerDefinition[];
}

/** Runs the existing comparison artifact with explicitly adapter-mediated profiles. */
export function runMaltlinePhysicalIntentComparison(
  options: MaltlinePhysicalIntentComparisonOptions = {},
): MaltlinePlayerModelComparison {
  const { sourceProfiles = [
    REACTIVE_MALTLINE_CONTROLLER,
    DELAYED_COMPETENT_MALTLINE_CONTROLLER,
    NOVICE_ERROR_MALTLINE_CONTROLLER,
  ], ...comparisonOptions } = options;
  return runMaltlinePlayerModelComparison({
    ...comparisonOptions,
    profiles: sourceProfiles.map(mediateMaltlinePhysicalIntent),
  });
}
