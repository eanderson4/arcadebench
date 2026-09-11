import type { MaltlineState } from '../core/types';

type StageClearState = Pick<
  MaltlineState,
  'fulfilled' | 'exited' | 'walkouts' | 'resolved' | 'score' | 'lives'
>;

function countLabel(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/**
 * Names the active first-fulfillment chain without implying a score
 * multiplier. The HUD deliberately stays quiet until the second serve.
 */
export function activeChainText(streak: number): string | null {
  return streak > 1 ? `CHAIN ${streak}` : null;
}

export function stageClearBody(state: StageClearState, bonus: number): string {
  const lifeLabel = state.lives === 1 ? 'life' : 'lives';
  const walkouts = state.walkouts === 0 ? 'no walkouts' : countLabel(state.walkouts, 'walkout');
  return `Window closed: ${countLabel(state.fulfilled, 'order')} fulfilled. Final outcomes: ${countLabel(state.exited, 'happy exit')}, ${walkouts} (${state.resolved} resolved). Bonus +${bonus} — score ${state.score}, ${state.lives} ${lifeLabel} left.`;
}
