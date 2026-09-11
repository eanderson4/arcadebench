import { FIXED_SCALE } from '../core/engine';
import type { MaltlineInput, MaltlineScenario, MaltlineState } from '../core/types';
import type { CanonicalValue } from '../core/fingerprint';
import { maltlineControllerInput } from './controller-input';

export const REACTIVE_MALTLINE_CONTROLLER_ID = 'reactive-current-state-v1' as const;

export type MaltlineController = (
  state: Readonly<MaltlineState>,
  scenario: Readonly<MaltlineScenario>,
) => MaltlineInput;

/**
 * A controller and the canonical metadata that identifies its behavior.
 * Logic or parameter changes require a metadata/version change as well.
 */
export interface MaltlineControllerDefinition {
  readonly id: string;
  readonly fingerprintData: CanonicalValue;
  /** A fresh deterministic controller instance for each stage. */
  readonly create: () => MaltlineController;
}

function linearDirection(from: number, to: number): -1 | 0 | 1 {
  return from === to ? 0 : from < to ? 1 : -1;
}

function wrappedDirection(from: number, to: number, count: number): -1 | 0 | 1 {
  if (from === to) return 0;
  const forward = (to - from + count) % count;
  const backward = (from - to + count) % count;
  return forward <= backward ? 1 : -1;
}

/**
 * A deterministic, current-state-only reference player for campaign tuning.
 * It has exact state precision but no seed, spawn, or future-event knowledge.
 */
export const reactiveMaltlineController: MaltlineController = (state, scenario) => {
  // Each slide reserves the closest matching customer it can reach. This keeps
  // the controller from launching duplicate shakes at the same order.
  const reservedCustomerIds = new Set<number>();
  for (const slide of state.slides) {
    const target = state.customers
      .filter((customer) => customer.phase === 'marching'
        && customer.lane === slide.lane
        && customer.flavor === slide.flavor
        && customer.x > slide.x)
      .sort((a, b) => a.x - b.x || a.id - b.id)[0];
    if (target) reservedCustomerIds.add(target.id);
  }

  const target = state.customers
    .filter((customer) => customer.phase === 'marching' && !reservedCustomerIds.has(customer.id))
    .sort((a, b) => a.x - b.x || a.id - b.id)[0];

  // Reserve enough time for every lane step plus one repeat-cadence window.
  // The small fixed margin absorbs the engine's global modulo input cadence.
  const returnSpeedFp = Math.round(scenario.returnSpeed * FIXED_SCALE);
  const urgentJar = [...state.jars]
    .sort((a, b) => a.x - b.x || a.id - b.id)
    .find((jar) => {
      const eta = Math.ceil(jar.x / returnSpeedFp);
      const forward = (jar.lane - state.player.lane + scenario.lanes) % scenario.lanes;
      const backward = (state.player.lane - jar.lane + scenario.lanes) % scenario.lanes;
      const laneSteps = Math.min(forward, backward);
      return eta <= (laneSteps + 1) * scenario.laneRepeatTicks + 3;
    });

  let stationDir: -1 | 0 | 1 = 0;
  let laneDir: -1 | 0 | 1 = 0;
  let blend = false;
  let serve = false;

  if (urgentJar) {
    laneDir = wrappedDirection(state.player.lane, urgentJar.lane, scenario.lanes);
  } else if (state.player.holding !== null && target) {
    const heldTarget = state.customers
      .filter((customer) => customer.phase === 'marching'
        && customer.flavor === state.player.holding
        && !reservedCustomerIds.has(customer.id))
      .sort((a, b) => a.x - b.x || a.id - b.id)[0] ?? target;
    laneDir = wrappedDirection(state.player.lane, heldTarget.lane, scenario.lanes);
    if (state.player.lane === heldTarget.lane
      && heldTarget.flavor === state.player.holding
      && !state.currentInput.serve) {
      serve = true;
    }
  } else if (target) {
    laneDir = wrappedDirection(state.player.lane, target.lane, scenario.lanes);
  }

  if (state.player.blending !== null) {
    blend = true;
  } else if (state.player.holding === null && target && state.jarsAvailable > 0) {
    const targetStation = scenario.stations.indexOf(target.flavor);
    stationDir = linearDirection(state.player.station, targetStation);
    blend = state.player.station === targetStation;
  }

  return maltlineControllerInput(stationDir, laneDir, blend, serve);
};

export const REACTIVE_MALTLINE_CONTROLLER: MaltlineControllerDefinition = Object.freeze({
  id: REACTIVE_MALTLINE_CONTROLLER_ID,
  fingerprintData: Object.freeze({
    algorithm: 'reactive-current-state',
    version: 1,
  }),
  create: () => reactiveMaltlineController,
});
