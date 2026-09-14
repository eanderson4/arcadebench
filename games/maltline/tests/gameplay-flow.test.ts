import { describe, expect, it } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { MaltlineEngine } from '../src/core/engine';
import {
  countdownPresentation,
  gameOverPresentation,
  instructionPresentation,
  stageCardPresentation,
  stageClearPresentation,
  terminalLifeLossReason,
  titlePresentation,
  victoryPresentation,
} from '../src/viewer/gameplay-flow';

describe('first-run presentation copy', () => {
  it('teaches objective, controls, failure reasons, and lives before play', () => {
    const title = titlePresentation();
    const instructions = instructionPresentation();
    const completeCopy = [title.body, instructions.body, ...(instructions.steps ?? [])].join(' ');

    expect(title.hint).toContain('Enter');
    expect(completeCopy).toContain('Four lives');
    expect(completeCopy).toContain('walkout');
    expect(completeCopy).toContain('missed shake');
    expect(completeCopy).toContain('missed return');
    expect(completeCopy).toContain('← →');
    expect(completeCopy).toContain('↑ ↓');
    expect(completeCopy).toContain('SPACE');
    expect(completeCopy).toContain('F / ENTER');
    expect(completeCopy).toContain('READY');
    expect(completeCopy).toContain('intercept return');
    const slideControl = instructions.steps?.find((step) => step.includes('F / ENTER'));
    expect(slideControl).toContain('slide held shake');
    expect(slideControl).not.toContain('catch');
  });

  it('gives every authored stage a distinct skill or pressure brief', () => {
    const cards = MALTLINE_CAMPAIGN.map((scenario, index) =>
      stageCardPresentation(scenario, index, MALTLINE_CAMPAIGN.length));

    expect(cards.map((card) => card.title)).toEqual(
      MALTLINE_CAMPAIGN.map((scenario) => scenario.name.toUpperCase()),
    );
    expect(new Set(cards.map((card) => card.kicker)).size).toBe(MALTLINE_CAMPAIGN.length);
    expect(new Set(cards.map((card) => card.body)).size).toBe(MALTLINE_CAMPAIGN.length);
    expect(cards[0]?.body).toContain('intercept the returning jar');
    expect(cards[4]?.body).toContain('four jars');
    expect(cards[7]?.body).toContain('final order');
    expect(cards[7]?.body).toContain('remaining lives');
    expect(cards[7]?.body).not.toContain('all four');
  });

  it('keeps countdown and terminal calls to action explicit', () => {
    const first = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(first).snapshot();

    expect(countdownPresentation(3, first, 0, 8)).toMatchObject({
      title: '3',
      kicker: 'STAGE 1 / 8',
      variant: 'countdown',
    });
    expect(countdownPresentation('SERVE', first, 0, 8).hint).toContain('blend');
    expect(gameOverPresentation(state, 0, 8, first.name).hint).toContain('restart at Stage 1');
    expect(victoryPresentation(state, 8).hint).toContain('run it again');
  });

  it('provides one semantic announcement per flow screen and keeps 2/1 silent', () => {
    const first = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(first).snapshot();

    expect(titlePresentation().announcement).toContain('Maltline');
    expect(instructionPresentation().announcement).toContain('Counter instructions');
    expect(stageCardPresentation(first, 0, 8).announcement).toContain('Stage 1 of 8');
    expect(countdownPresentation(3, first, 0, 8).announcement).toContain('Get ready');
    expect(countdownPresentation(2, first, 0, 8).announcement).toBeUndefined();
    expect(countdownPresentation(1, first, 0, 8).announcement).toBeUndefined();
    expect(countdownPresentation('SERVE', first, 0, 8).announcement).toBe('Serve.');
    expect(stageClearPresentation(state, 0).announcement).toContain('Stage clear');
    expect(stageClearPresentation(state, 0, { finalStage: true }).hint)
      .toBe('Enter — final result · R — restart');
    expect(stageClearPresentation(state, 0, {
      finalStage: true,
      rankedResultProtected: true,
    }).announcement).toContain('R to review the ranked run');
    expect(gameOverPresentation(state, 0, 8, first.name).announcement).toContain('Shop closed');
    expect(victoryPresentation(state, 8).announcement).toContain('Last call survived');
  });

  it.each([
    ['walkout', 'customer reached the counter'],
    ['shake_smashed', 'shake missed the line'],
    ['jar_smashed', 'return jar was missed'],
  ] as const)('names a fatal %s in the terminal body and announcement', (reason, copy) => {
    const first = MALTLINE_CAMPAIGN[0]!;
    const state = { ...new MaltlineEngine(first).snapshot(), lives: 0, status: 'lost' as const };
    const events = [
      { tick: 40, type: 'life_lost' as const, reason, lives: 0 },
      { tick: 40, type: 'game_lost' as const },
    ];
    expect(terminalLifeLossReason(events)).toBe(reason);
    const presentation = gameOverPresentation(state, 0, 8, first.name, terminalLifeLossReason(events));
    expect(presentation.body).toContain(`Last life: ${copy}.`);
    expect(presentation.announcement).toContain(`Last life: ${copy}.`);
  });

  it('does not invent a fatal cause for a malformed or nonterminal event batch', () => {
    expect(terminalLifeLossReason([])).toBeNull();
    expect(terminalLifeLossReason([{
      tick: 39, type: 'life_lost', reason: 'walkout', lives: 1,
    }])).toBeNull();
  });
});
