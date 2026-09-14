import type { GameEvent, MaltlineScenario, MaltlineState } from '../core/types';
import { FLAVOR_LABELS } from '../core/types';
import { deriveMaltlineEventPresentation } from './event-presentation';
import { activeChainText } from './presentation-copy';
import { deriveMaltlineStationActionPresentation } from './station-action-presentation';

export interface MaltlineSemanticMeta {
  stageIndex: number;
  stageCount: number;
}

export function semanticPlayStatus(
  scenario: MaltlineScenario,
  state: MaltlineState,
  meta: MaltlineSemanticMeta,
): string {
  const ordersLeft = Math.max(0, scenario.customerCount - state.resolved);
  const action = deriveMaltlineStationActionPresentation(scenario, state);
  const chain = activeChainText(state.streak);
  const lifeLabel = state.lives === 1 ? 'life' : 'lives';
  const jarLabel = state.jarsAvailable === 1 ? 'clean jar' : 'clean jars';
  return [
    `Stage ${meta.stageIndex + 1} of ${meta.stageCount}, ${scenario.name}.`,
    `Score ${state.score}.${chain === null ? '' : ` ${chain}.`} ${state.lives} ${lifeLabel}. ${ordersLeft} orders left.`,
    `Window ${state.player.lane + 1} of ${scenario.lanes}. ${action.semanticText}`,
    `${state.jarsAvailable} ${jarLabel}; ${state.washing.length} washing.`,
  ].join(' ');
}

export interface MaltlineEventAnnouncement {
  id: string;
  text: string;
}

/** Select at most one useful announcement from an engine tick. */
export function eventAnnouncement(events: readonly GameEvent[]): MaltlineEventAnnouncement | null {
  const selected = deriveMaltlineEventPresentation(events).live;
  if (selected === null) return null;
  const event = selected.event;
  switch (event.type) {
    case 'game_lost': {
      const cause = selected.relatedLifeLoss === null
        ? 'Run ended.'
        : lifeLossText(selected.relatedLifeLoss.reason);
      return { id: `${event.tick}:game-lost`, text: `Game over. ${cause}` };
    }
    case 'life_lost': {
      const lifeLabel = event.lives === 1 ? 'life' : 'lives';
      return {
        id: `${event.tick}:life-lost:${event.reason}:${event.lives}`,
        text: `${lifeLossText(event.reason)} ${event.lives} ${lifeLabel} remaining.`,
      };
    }
    case 'stage_cleared':
      return {
        id: `${event.tick}:stage-cleared:${event.bonus}`,
        text: `Stage clear. Bonus ${event.bonus} points.`,
      };
    case 'served': {
      const result = event.firstFulfillment
        ? `${event.points} points.`
        : event.points > 0 ? `Repeat rescue, ${event.points} points.` : 'Repeat rescue, no points.';
      return { id: `${event.tick}:served:${event.customerId}`, text: `Order served. ${result}` };
    }
    case 'jar_caught': {
      const result = event.points > 0 ? `${event.points} points.` : 'No points.';
      return { id: `${event.tick}:jar-caught:${event.customerId}`, text: `Return jar caught. ${result}` };
    }
    case 'blend_completed':
      return {
        id: `${event.tick}:blend-completed:${event.flavor}`,
        text: `${FLAVOR_LABELS[event.flavor]} shake ready.`,
      };
  }
}

function lifeLossText(reason: Extract<GameEvent, { type: 'life_lost' }>['reason']): string {
  switch (reason) {
    case 'walkout':
      return 'Life lost: customer reached the counter.';
    case 'shake_smashed':
      return 'Life lost: shake missed.';
    case 'jar_smashed':
      return 'Life lost: return jar missed.';
  }
}

/**
 * Event-gated live-region writer. Repainting or replaying the same batch cannot
 * spam assistive technology, and a busy tick produces one prioritized message.
 */
export class MaltlineEventAnnouncer {
  private lastAnnouncementId: string | null = null;

  constructor(private readonly target: HTMLElement) {}

  push(events: readonly GameEvent[]): boolean {
    const announcement = eventAnnouncement(events);
    return announcement ? this.announce(announcement.id, announcement.text) : false;
  }

  announce(id: string, text: string): boolean {
    if (id === this.lastAnnouncementId) return false;
    this.lastAnnouncementId = id;
    this.target.replaceChildren(this.target.ownerDocument.createTextNode(text));
    return true;
  }

  reset(): void {
    this.lastAnnouncementId = null;
    this.target.replaceChildren();
  }
}
