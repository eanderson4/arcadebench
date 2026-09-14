import type { GameEvent, LifeLossReason, MaltlineScenario, MaltlineState } from '../core/types';
import { stageClearBody } from './presentation-copy';
import type { OverlayPresentation } from './shell';

export type MaltlineFlowScreen =
  | 'title'
  | 'instructions'
  | 'stage-card'
  | 'countdown'
  | 'playing'
  | 'interrupted'
  | 'cleared'
  | 'gameover'
  | 'victory';

export const MALTLINE_COUNTDOWN_STEP_MS = 650;
export const MALTLINE_COUNTDOWN_SERVE_MS = 350;

interface StageBrief {
  kicker: string;
  pressure: string;
}

const STAGE_BRIEFS: Readonly<Record<string, StageBrief>> = {
  'maltline-01-first-pour': {
    kicker: 'LEARN THE LOOP',
    pressure: 'One flavor. Blend, slide, then run along the lane to intercept the returning jar.',
  },
  'maltline-02-two-tap': {
    kicker: 'READ THE MENU',
    pressure: 'Chocolate joins vanilla. Choose the requested station before you blend.',
  },
  'maltline-03-three-windows': {
    kicker: 'OWN THE WINDOWS',
    pressure: 'Three windows are open. Choose where to slide; face a return window to auto-catch its jar.',
  },
  'maltline-04-lunch-rush': {
    kicker: 'TRIAGE THE LINE',
    pressure: 'Orders arrive faster. Serve the customers nearest the counter first.',
  },
  'maltline-05-jar-shortage': {
    kicker: 'MANAGE THE JARS',
    pressure: 'Only four jars circulate. Catch returns and watch the wash queue.',
  },
  'maltline-06-thick-shakes': {
    kicker: 'HOLD YOUR NERVE',
    pressure: 'Shakes take longer to blend. Release only when the machine says READY.',
  },
  'maltline-07-happy-hour': {
    kicker: 'SUSTAIN THE TEMPO',
    pressure: 'The line keeps accelerating. Plan the next flavor while jars return.',
  },
  'maltline-08-closing-time': {
    kicker: 'RUN THE WHOLE SHOP',
    pressure: 'Every skill at closing speed. Protect your remaining lives through the final order.',
  },
};

function flavorSummary(scenario: MaltlineScenario): string {
  return scenario.stations.map((flavor) => flavor[0]!.toUpperCase()).join(' / ');
}

export function titlePresentation(fontFallbackCopy = ''): OverlayPresentation {
  const body = `Match each order, blend its flavor, and slide the shake. Run along the lane to intercept returning jars. Four lives—misses and walkouts cost one.${fontFallbackCopy}`;
  return {
    variant: 'title',
    kicker: 'ARCADE SHIFT',
    title: 'MALTLINE',
    body,
    hint: 'Press Enter to learn the counter',
    announcement: `Maltline. ${body} Press Enter to learn the counter.`,
  };
}

export function instructionPresentation(): OverlayPresentation {
  const steps = [
    '← →  run along the active counter · intercept returns',
    '↑ ↓  choose lane',
    'A D  choose flavor station',
    'Hold SPACE until READY',
    'F / ENTER  slide held shake',
  ] as const;
  return {
    variant: 'instructions',
    kicker: 'HOW TO WORK THE LINE',
    title: 'MATCH · BLEND · SLIDE · CATCH',
    body: 'Serve every order before the customer reaches the counter. A walkout, missed shake, or missed return costs one of four lives.',
    steps,
    hint: 'Press Enter for Stage 1',
    announcement: 'Counter instructions. Match, blend, slide, and run along the lane to catch returns. Press Enter for Stage 1.',
  };
}

export function stageCardPresentation(
  scenario: MaltlineScenario,
  stageIndex: number,
  stageCount: number,
): OverlayPresentation {
  const brief = STAGE_BRIEFS[scenario.id] ?? {
    kicker: 'KEEP THE LINE MOVING',
    pressure: 'Match each order, serve it, and catch the returning jar.',
  };
  return {
    variant: 'stage',
    kicker: `STAGE ${stageIndex + 1} / ${stageCount} · ${brief.kicker}`,
    title: scenario.name.toUpperCase(),
    body: brief.pressure,
    steps: [
      `${scenario.lanes} windows · ${scenario.customerCount} orders · ${flavorSummary(scenario)}`,
    ],
    hint: 'Press Enter when ready',
    announcement: `Stage ${stageIndex + 1} of ${stageCount}, ${scenario.name}. ${brief.pressure} Press Enter when ready.`,
  };
}

export function countdownPresentation(
  value: 3 | 2 | 1 | 'SERVE',
  scenario: MaltlineScenario,
  stageIndex: number,
  stageCount: number,
): OverlayPresentation {
  return {
    variant: 'countdown',
    kicker: `STAGE ${stageIndex + 1} / ${stageCount}`,
    title: String(value),
    body: scenario.name,
    hint: value === 'SERVE' ? 'Match · blend · slide · face to catch' : 'Hands on the controls',
    announcement: value === 3
      ? `Get ready for Stage ${stageIndex + 1} of ${stageCount}, ${scenario.name}.`
      : value === 'SERVE' ? 'Serve.' : undefined,
  };
}

export function stageClearPresentation(
  state: MaltlineState,
  bonus: number,
  options: { finalStage?: boolean; rankedResultProtected?: boolean } = {},
): OverlayPresentation {
  const body = stageClearBody(state, bonus);
  const finalHint = options.rankedResultProtected
    ? 'Enter — final result · R — review ranked run'
    : 'Enter — final result · R — restart';
  const finalAnnouncement = options.rankedResultProtected
    ? 'Press Enter for the final result, or R to review the ranked run.'
    : 'Press Enter for the final result, or R to restart.';
  return {
    variant: 'terminal',
    kicker: 'WINDOW CLOSED',
    title: 'STAGE CLEAR',
    body,
    hint: options.finalStage ? finalHint : 'Enter — next window · R — restart',
    announcement: `Stage clear. ${body} ${options.finalStage
      ? finalAnnouncement
      : 'Press Enter for the next window, or R to restart.'}`,
  };
}

export function gameOverPresentation(
  state: MaltlineState,
  stageIndex: number,
  stageCount: number,
  stageName: string,
  fatalReason: LifeLossReason | null = null,
): OverlayPresentation {
  const lastLife = fatalReason === null ? '' : ` Last life: ${({
    walkout: 'customer reached the counter',
    shake_smashed: 'shake missed the line',
    jar_smashed: 'return jar was missed',
  } satisfies Record<LifeLossReason, string>)[fatalReason]}.`;
  const body = `Final score ${state.score} — reached stage ${stageIndex + 1} of ${stageCount} (${stageName}).${lastLife} Missed shakes, missed returns, and walkouts each cost a life.`;
  return {
    variant: 'terminal',
    kicker: 'OUT OF LIVES',
    title: 'SHOP CLOSED',
    body,
    hint: 'Enter / R — restart at Stage 1',
    announcement: `Shop closed. ${body} Press Enter or R to restart at Stage 1.`,
  };
}

export function terminalLifeLossReason(events: readonly GameEvent[]): LifeLossReason | null {
  for (const event of events) {
    if (event.type === 'life_lost' && event.lives === 0) return event.reason;
  }
  return null;
}

export function victoryPresentation(state: MaltlineState, stageCount: number): OverlayPresentation {
  const body = `All ${stageCount} stages survived. Final score ${state.score}. The counter is ready for another run.`;
  return {
    variant: 'terminal',
    kicker: 'SHIFT COMPLETE',
    title: 'LAST CALL SURVIVED',
    body,
    hint: 'Enter / R — run it again',
    announcement: `Last call survived. ${body} Press Enter or R to run it again.`,
  };
}
