import type { MaltlineInput, MaltlineState } from '../core/types';
import { IDLE_INPUT } from '../core/types';
import { maltlineControllerInput } from './controller-input';
import {
  reactiveMaltlineController,
  type MaltlineController,
  type MaltlineControllerDefinition,
} from './reactive-controller';

export interface DelayedCompetentParameters {
  readonly reactionDelayTicks: number;
  readonly hesitationEveryTicks: number;
  readonly hesitationTicks: number;
}

export interface NoviceErrorParameters extends DelayedCompetentParameters {
  readonly misserveEveryOpportunities: number;
}

export const DELAYED_COMPETENT_PARAMETERS: DelayedCompetentParameters = Object.freeze({
  reactionDelayTicks: 2,
  hesitationEveryTicks: 120,
  hesitationTicks: 1,
});

export const NOVICE_ERROR_PARAMETERS: NoviceErrorParameters = Object.freeze({
  reactionDelayTicks: 7,
  hesitationEveryTicks: 90,
  hesitationTicks: 2,
  misserveEveryOpportunities: 8,
});

function cloneInput(input: MaltlineInput): MaltlineInput {
  return maltlineControllerInput(input.stationDir, input.laneDir, input.blend, input.serve);
}

function inputsEqual(left: MaltlineInput, right: MaltlineInput): boolean {
  return left.stationDir === right.stationDir
    && left.laneDir === right.laneDir
    && left.blend === right.blend
    && left.serve === right.serve;
}

function createDelayedController(parameters: DelayedCompetentParameters): MaltlineController {
  let active = cloneInput(IDLE_INPUT);
  let pending: MaltlineInput | null = null;
  let reactionTicksRemaining = 0;
  return (state, scenario) => {
    const planned = reactiveMaltlineController(state, scenario);
    if (!inputsEqual(planned, active)) {
      if (pending === null || !inputsEqual(planned, pending)) {
        pending = cloneInput(planned);
        reactionTicksRemaining = parameters.reactionDelayTicks;
      }
      if (reactionTicksRemaining > 0) {
        reactionTicksRemaining--;
        return cloneInput(IDLE_INPUT);
      }
      active = pending;
      pending = null;
    } else {
      pending = null;
      reactionTicksRemaining = 0;
    }
    const hesitationPhase = parameters.hesitationEveryTicks === 0
      ? parameters.hesitationTicks
      : state.tick % parameters.hesitationEveryTicks;
    if (hesitationPhase < parameters.hesitationTicks) return cloneInput(IDLE_INPUT);
    return cloneInput(active);
  };
}

interface MisservePlan {
  readonly wrongLane: number;
}

function nearestUnreservedMarcher(state: Readonly<MaltlineState>): number | null {
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
  return state.customers
    .filter((customer) => customer.phase === 'marching' && !reservedCustomerIds.has(customer.id))
    .sort((a, b) => a.x - b.x || a.id - b.id)[0]?.lane ?? null;
}

function wrappedDirection(from: number, to: number, count: number): -1 | 0 | 1 {
  if (from === to) return 0;
  const forward = (to - from + count) % count;
  const backward = (from - to + count) % count;
  return forward <= backward ? 1 : -1;
}

function createNoviceController(parameters: NoviceErrorParameters): MaltlineController {
  const delayed = createDelayedController(parameters);
  let serveOpportunities = 0;
  let previousPlannedServe = false;
  let misserve: MisservePlan | null = null;

  return (state, scenario) => {
    if (misserve !== null) {
      if (state.player.holding === null) {
        misserve = null;
        return cloneInput(IDLE_INPUT);
      }
      if (state.player.lane !== misserve.wrongLane) {
        return maltlineControllerInput(
          0,
          wrappedDirection(state.player.lane, misserve.wrongLane, scenario.lanes),
          false,
          false,
        );
      }
      if (state.currentInput.serve) return cloneInput(IDLE_INPUT);
      misserve = null;
      return maltlineControllerInput(0, 0, false, true);
    }

    const planned = delayed(state, scenario);
    const newServeOpportunity = planned.serve && !previousPlannedServe;
    previousPlannedServe = planned.serve;
    if (newServeOpportunity) {
      serveOpportunities++;
      const targetLane = nearestUnreservedMarcher(state);
      if (scenario.lanes > 1
        && targetLane !== null
        && serveOpportunities % parameters.misserveEveryOpportunities === 0) {
        misserve = { wrongLane: (targetLane + 1) % scenario.lanes };
        return maltlineControllerInput(
          0,
          wrappedDirection(state.player.lane, misserve.wrongLane, scenario.lanes),
          false,
          false,
        );
      }
    }
    return planned;
  };
}

export const DELAYED_COMPETENT_MALTLINE_CONTROLLER: MaltlineControllerDefinition = Object.freeze({
  id: 'delayed-competent-v1',
  fingerprintData: Object.freeze({
    algorithm: 'delayed-reactive',
    version: 1,
    reactionDelayTicks: DELAYED_COMPETENT_PARAMETERS.reactionDelayTicks,
    hesitationEveryTicks: DELAYED_COMPETENT_PARAMETERS.hesitationEveryTicks,
    hesitationTicks: DELAYED_COMPETENT_PARAMETERS.hesitationTicks,
  }),
  create: () => createDelayedController(DELAYED_COMPETENT_PARAMETERS),
});

export const NOVICE_ERROR_MALTLINE_CONTROLLER: MaltlineControllerDefinition = Object.freeze({
  id: 'novice-error-injection-v1',
  fingerprintData: Object.freeze({
    algorithm: 'delayed-reactive-with-misserve',
    version: 1,
    reactionDelayTicks: NOVICE_ERROR_PARAMETERS.reactionDelayTicks,
    hesitationEveryTicks: NOVICE_ERROR_PARAMETERS.hesitationEveryTicks,
    hesitationTicks: NOVICE_ERROR_PARAMETERS.hesitationTicks,
    misserveEveryOpportunities: NOVICE_ERROR_PARAMETERS.misserveEveryOpportunities,
  }),
  create: () => createNoviceController(NOVICE_ERROR_PARAMETERS),
});
