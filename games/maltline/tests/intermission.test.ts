import { describe, expect, it } from 'vitest';
import { MaltlineViewerFlowController } from '../src/viewer/viewer-flow-controller';
import { intermissionPresentation, MALTLINE_INTERMISSION_MS } from '../src/viewer/gameplay-flow';
import { drawMaltlineIntermission, intermissionPose } from '../src/viewer/intermission';

function setup() {
  let playable = true;
  const effects: string[] = [];
  const flow = new MaltlineViewerFlowController({
    stageCount: 8, countdownStepMs: 650, countdownServeMs: 350,
    intermissionAfterStage: 4, intermissionDurationMs: MALTLINE_INTERMISSION_MS,
    scheduler: { schedule: () => 1, cancel: () => {} },
    isPlayable: () => playable,
    onTransition: transition => { if (transition.effect) effects.push(transition.effect.type); },
  });
  flow.dispatch({ type: 'restart' });
  const clearStage = (): void => {
    flow.dispatch({ type: 'advance' }); flow.dispatch({ type: 'advance' });
    const snapshot = flow.snapshot();
    expect(snapshot.screen).toBe('playing');
    flow.dispatch({ type: 'stage-cleared', attempt: snapshot.attempt, stageIndex: snapshot.stageIndex, bonus: 500 });
    flow.dispatch({ type: 'advance' });
  };
  return { flow, effects, clearStage, setPlayable(value: boolean) { playable = value; } };
}

function halfway() {
  const result = setup();
  for (let index = 0; index < 4; index++) result.clearStage();
  return result;
}

describe('halfway arcade intermission', () => {
  it('appears only after Stage 4, preserves attempt identity, and advances to a fresh Stage 5 card', () => {
    const run = setup();
    const attempt = run.flow.snapshot().attempt;
    for (let stage = 0; stage < 3; stage++) {
      run.clearStage();
      expect(run.flow.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: stage + 1, attempt });
    }
    run.clearStage();
    expect(run.flow.snapshot()).toMatchObject({ screen: 'intermission', stageIndex: 3, attempt });
    expect(run.effects.filter(effect => effect === 'show-intermission')).toHaveLength(1);
    const next = run.flow.dispatch({ type: 'advance' });
    expect(next.current).toMatchObject({ screen: 'stage-card', stageIndex: 4, attempt });
    expect(next.effect).toMatchObject({ type: 'show-stage-card', constructStage: true });
    for (let stage = 4; stage < 8; stage++) run.clearStage();
    expect(run.flow.snapshot().screen).toBe('victory');
    expect(run.effects.filter(effect => effect === 'show-intermission')).toHaveLength(1);
  });

  it('uses bounded presentation time, independent of frame partition, and never starts Stage 5 gameplay', () => {
    const a = halfway(), b = halfway();
    a.flow.advancePresentation(3000);
    for (const dt of [1000, 1500, 500]) b.flow.advancePresentation(dt);
    expect(intermissionPose(a.flow.intermissionTime())).toEqual(intermissionPose(b.flow.intermissionTime()));
    a.flow.advancePresentation(2999);
    expect(a.flow.snapshot().screen).toBe('intermission');
    a.flow.advancePresentation(1);
    b.flow.advancePresentation(3000);
    expect(a.flow.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 4 });
    expect(b.flow.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 4 });
    a.flow.advancePresentation(60_000);
    expect(a.flow.snapshot().screen).toBe('stage-card');
  });

  it('pauses when hidden or unsupported, and restart/dispose prevent late presentation advancement', () => {
    const run = halfway();
    run.flow.advancePresentation(1000);
    run.setPlayable(false); run.flow.advancePresentation(10_000);
    expect(run.flow.intermissionTime()).toBe(1000);
    expect(run.flow.dispatch({ type: 'interrupt', reason: 'window_blur' }).accepted).toBe(false);
    run.setPlayable(true); run.flow.advancePresentation(500);
    expect(run.flow.intermissionTime()).toBe(1500);
    run.flow.dispatch({ type: 'restart' }); run.flow.advancePresentation(6000);
    expect(run.flow.snapshot()).toMatchObject({ screen: 'stage-card', stageIndex: 0 });
    const disposed = halfway(); disposed.flow.dispose(); disposed.flow.advancePresentation(6000);
    expect(disposed.flow.snapshot().screen).toBe('intermission');
    for (const value of [NaN, Infinity, -1]) expect(() => run.flow.advancePresentation(value)).toThrow(/finite/);
  });

  it('keeps the visual deterministic and reduced motion static while retaining explicit skip instructions', () => {
    expect(intermissionPresentation().kicker).toContain('INTERMISSION');
    expect(intermissionPresentation().hint).toContain('Space / Enter');
    expect(intermissionPose(1000).returning).toBe(false);
    expect(intermissionPose(4000).returning).toBe(true);
    expect(intermissionPose(1000, true)).toEqual(intermissionPose(5000, true));
    expect(intermissionPose(7000)).toEqual(intermissionPose(6000));
    for (const value of [NaN, Infinity, -1]) expect(() => intermissionPose(value)).toThrow(/finite/);
    let depth = 0;
    const trace: unknown[][] = [];
    const context = new Proxy({}, {
      set(_target, property, value) { trace.push(['set', property, value]); return true; },
      get(_target, property) { return (...args: unknown[]) => {
        if (property === 'save') depth++;
        if (property === 'restore') { depth--; expect(depth).toBeGreaterThanOrEqual(0); }
        for (const arg of args) if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
        trace.push([property, ...args]);
      }; },
    }) as CanvasRenderingContext2D;
    drawMaltlineIntermission(context, 4000, false);
    expect(depth).toBe(0);
    const first = JSON.stringify(trace); trace.length = 0;
    drawMaltlineIntermission(context, 4000, false);
    expect(JSON.stringify(trace)).toBe(first);
  });
});
