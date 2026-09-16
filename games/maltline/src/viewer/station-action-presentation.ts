import type { FlavorId, MaltlineScenario, MaltlineState } from '../core/types';
import { FLAVOR_LABELS } from '../core/types';

export type MaltlineStationActionMode =
  | 'return-to-mixer'
  | 'holding'
  | 'blending'
  | 'blocked-no-jars'
  | 'idle';
export type MaltlineStationActionTone = 'ready' | 'blending' | 'blocked' | 'selected-flavor';

export interface MaltlineStationActionPresentation {
  readonly mode: MaltlineStationActionMode;
  readonly selectedStation: Readonly<{
    index: number;
    flavor: FlavorId;
  }>;
  /** Flavor currently being processed, independent of later station movement. */
  readonly processingFlavor: FlavorId | null;
  readonly heldFlavor: FlavorId | null;
  /** Flavor named by the highest-precedence current action. */
  readonly actionFlavor: FlavorId;
  readonly quantizedPercent: number | null;
  readonly tone: MaltlineStationActionTone;
  readonly canvasText: string;
  readonly semanticText: string;
}

/**
 * Shared presentation policy for station identity, action precedence, and
 * player-facing copy. It remains presentation-only and never influences engine
 * state.
 */
export function deriveMaltlineStationActionPresentation(
  scenario: Readonly<MaltlineScenario>,
  state: Readonly<MaltlineState>,
): MaltlineStationActionPresentation {
  const selectedIndex = state.player.station;
  const selectedFlavor = scenario.stations[selectedIndex];
  if (!Number.isSafeInteger(selectedIndex) || selectedFlavor === undefined) {
    throw new Error('Maltline presentation needs a valid selected station.');
  }
  const selectedStation = Object.freeze({ index: selectedIndex, flavor: selectedFlavor });

  if (state.player.x > 0) {
    const flavor = state.player.holding ?? selectedFlavor;
    return Object.freeze({
      mode: 'return-to-mixer',
      selectedStation,
      processingFlavor: state.player.blending,
      heldFlavor: state.player.holding,
      actionFlavor: flavor,
      quantizedPercent: null,
      tone: state.player.holding === null ? 'selected-flavor' : 'ready',
      canvasText: state.player.holding === null
        ? 'SPACE · RETURN + FILL'
        : 'RELEASE SPACE · RETURN + TOSS',
      semanticText: state.player.holding === null
        ? 'Hold button 1 (Space) to return to the mixer and fill.'
        : `${FLAVOR_LABELS[flavor]} shake ready. Release button 1 (Space) to return and toss it. Press button 2 (Enter) to replace it and switch flavor.`,
    });
  }

  if (state.player.holding !== null) {
    const flavor = state.player.holding;
    return Object.freeze({
      mode: 'holding',
      selectedStation,
      processingFlavor: state.player.blending,
      heldFlavor: flavor,
      actionFlavor: flavor,
      quantizedPercent: null,
      tone: 'ready',
      canvasText: 'READY · RELEASE SPACE',
      semanticText: `${FLAVOR_LABELS[flavor]} shake ready. Release button 1 (Space) to toss. Press button 2 (Enter) to replace it and switch flavor.`,
    });
  }

  if (state.player.blending !== null) {
    const flavor = state.player.blending;
    const exactProgress = Math.min(1, state.player.blendProgress / scenario.blendTicks);
    const quantizedPercent = Math.round(exactProgress * 20) * 5;
    return Object.freeze({
      mode: 'blending',
      selectedStation,
      processingFlavor: flavor,
      heldFlavor: null,
      actionFlavor: flavor,
      quantizedPercent,
      tone: 'blending',
      canvasText: `BLENDING · ${quantizedPercent}%`,
      semanticText: `Blending ${FLAVOR_LABELS[flavor]}, ${quantizedPercent} percent.`,
    });
  }

  if (state.jarsAvailable === 0) {
    return Object.freeze({
      mode: 'blocked-no-jars',
      selectedStation,
      processingFlavor: null,
      heldFlavor: null,
      actionFlavor: selectedFlavor,
      quantizedPercent: null,
      tone: 'blocked',
      canvasText: 'NO CLEAN JARS · CATCH A RETURN',
      semanticText: 'No clean jars. Run along a lane to intercept a returning jar.',
    });
  }

  return Object.freeze({
    mode: 'idle',
    selectedStation,
    processingFlavor: null,
    heldFlavor: null,
    actionFlavor: selectedFlavor,
    quantizedPercent: null,
    tone: 'selected-flavor',
    canvasText: 'HOLD SPACE · FILL',
    semanticText: `Selected ${FLAVOR_LABELS[selectedFlavor]}. Hold button 1 (Space) to fill, then release to toss. Press button 2 (Enter) to switch flavor.`,
  });
}
