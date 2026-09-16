import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { normalizeMaltlineScenario } from '../src/core/scenario';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import type { GameEvent, MaltlineScenario, MaltlineState } from '../src/core/types';
import {
  deriveMaltlineCustomerWalkPose,
  MaltlineRenderer,
} from '../src/viewer/renderer';
import {
  deriveMaltlineRendererLayout,
  MALTLINE_RENDERER_FRAME,
} from '../src/viewer/renderer-layout';
import { MALTLINE_VISUAL_THEME } from '../src/viewer/visual-theme';

type Command = readonly unknown[];

interface GradientToken {
  readonly kind: 'gradient';
  readonly id: number;
  addColorStop(offset: number, color: string): void;
}

function commandRecorder(): { context: CanvasRenderingContext2D; commands: Command[] } {
  const commands: Command[] = [];
  const values = new Map<PropertyKey, unknown>();
  let gradientId = 0;

  function normalize(value: unknown): unknown {
    if (typeof value === 'object' && value !== null && 'kind' in value && 'id' in value) {
      const token = value as GradientToken;
      return `${token.kind}:${token.id}`;
    }
    return value;
  }

  function gradient(method: string, args: unknown[]): GradientToken {
    const id = gradientId++;
    commands.push([method, id, ...args]);
    return {
      kind: 'gradient',
      id,
      addColorStop(offset, color) {
        commands.push(['addColorStop', id, offset, color]);
      },
    };
  }

  const context = new Proxy({}, {
    get(_target, property) {
      if (values.has(property)) return values.get(property);
      if (property === 'measureText') return (text: string) => ({ width: text.length * 8 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return (...args: unknown[]) => gradient(String(property), args);
      }
      return (...args: unknown[]) => {
        commands.push([String(property), ...args.map(normalize)]);
      };
    },
    set(_target, property, value) {
      values.set(property, value);
      commands.push(['set', String(property), normalize(value)]);
      return true;
    },
  }) as CanvasRenderingContext2D;

  return { context, commands };
}

function digest(commands: Command[]): string {
  return createHash('sha256').update(JSON.stringify(commands)).digest('hex');
}

function renderedText(commands: Command[]): string[] {
  return commands
    .filter((command) => command[0] === 'fillText')
    .map((command) => String(command[1]));
}

function filledRects(commands: Command[]): Array<{ color: string; rect: number[] }> {
  const results: Array<{ color: string; rect: number[] }> = [];
  let fillStyle = '';
  for (const command of commands) {
    if (command[0] === 'set' && command[1] === 'fillStyle') fillStyle = String(command[2]);
    if (command[0] === 'fillRect') {
      results.push({ color: fillStyle, rect: command.slice(1, 5).map(Number) });
    }
  }
  return results;
}

function render(
  renderer: MaltlineRenderer,
  state: MaltlineState,
): Command[] {
  const { context, commands } = commandRecorder();
  renderer.draw(context, state, { stageIndex: 0, stageCount: 8 });
  return commands;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MaltlineRenderer presentation dependencies', () => {
  it('plants customer steps by distance and turns departing customers toward the door', () => {
    const base = {
      id: 7,
      x: 40 * FIXED_SCALE,
      phase: 'marching' as const,
    };
    const entering = deriveMaltlineCustomerWalkPose(base, false);
    const leaving = deriveMaltlineCustomerWalkPose(
      { ...base, phase: 'leaving' },
      false,
    );
    const drinking = deriveMaltlineCustomerWalkPose(
      { ...base, phase: 'drinking' },
      false,
    );
    const halfCycleLater = deriveMaltlineCustomerWalkPose(
      { ...base, x: base.x + 3.75 * FIXED_SCALE },
      false,
    );
    const fullCycleLater = deriveMaltlineCustomerWalkPose(
      { ...base, x: base.x + 7.5 * FIXED_SCALE },
      false,
    );
    const leavingCycleLater = deriveMaltlineCustomerWalkPose(
      { ...base, phase: 'leaving', x: base.x + 7.5 * FIXED_SCALE },
      false,
    );

    expect(entering.walking).toBe(true);
    expect(entering.facing).toBe(-1);
    expect(leaving).toMatchObject({ walking: true, facing: 1 });
    expect(leaving.stride).toBeCloseTo(entering.stride, 10);
    expect(halfCycleLater.stride).toBeCloseTo(-entering.stride, 10);
    expect(fullCycleLater.stride).toBeCloseTo(entering.stride, 10);
    expect(leavingCycleLater.stride).toBeCloseTo(leaving.stride, 10);
    expect(drinking).toMatchObject({
      walking: false,
      stride: 0,
      leftFootLift: 0,
      rightFootLift: 0,
      bob: 0,
    });
    expect(deriveMaltlineCustomerWalkPose(base, true)).toMatchObject({
      walking: true,
      facing: -1,
      stride: 0,
      leftFootLift: 0,
      rightFootLift: 0,
      bob: 0,
    });
    expect(Object.isFrozen(entering)).toBe(true);
  });

  it('mirrors and animates a departing customer in the real draw path', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const leavingCustomer = {
      id: 19,
      lane: 0,
      x: 55 * FIXED_SCALE,
      flavor: 'vanilla' as const,
      phase: 'leaving' as const,
      timer: 0,
      fulfilled: true,
      requeues: 0,
      catchBonusEligible: false,
      exitAfterDrink: true,
    };
    const state: MaltlineState = {
      ...baseline,
      customers: [leavingCustomer],
      spawned: 1,
    };
    const renderer = new MaltlineRenderer({ reducedMotion: false });
    const layout = renderer.setScenario(scenario);
    const tape = render(renderer, state);
    const centerX = layout.project(
      leavingCustomer.x,
      layout.counterFrontY(leavingCustomer.lane),
    ).x;

    expect(tape).toContainEqual(['translate', centerX * 2, 0]);
    expect(tape).toContainEqual(['scale', -1, 1]);
    expect(deriveMaltlineCustomerWalkPose(leavingCustomer, false).stride)
      .not.toBe(0);
  });

  it('fails closed before canvas or effect mutation when unbound or state-mismatched', () => {
    const firstEngine = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!);
    const secondEngine = new MaltlineEngine(MALTLINE_CAMPAIGN[1]!);
    const random = vi.fn(() => 0.5);
    const renderer = new MaltlineRenderer({ random, nowMs: () => 0 });
    const unbound = commandRecorder();

    expect(() => renderer.draw(unbound.context, firstEngine.snapshot(), {
      stageIndex: 0, stageCount: 8,
    })).toThrow(/bound scenario/u);
    expect(unbound.commands).toEqual([]);
    expect(() => renderer.pushEvents([
      { tick: 1, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
    ], firstEngine.snapshot())).toThrow(/bound scenario/u);
    expect(random).not.toHaveBeenCalled();

    renderer.setScenario(firstEngine.scenario);
    const mismatched = commandRecorder();
    expect(() => renderer.draw(mismatched.context, secondEngine.snapshot(), {
      stageIndex: 1, stageCount: 8,
    })).toThrow(/scenario mismatch/u);
    expect(mismatched.commands).toEqual([]);
    expect(() => renderer.pushEvents([
      { tick: 1, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
    ], secondEngine.snapshot())).toThrow(/scenario mismatch/u);
    expect(random).not.toHaveBeenCalled();

    const fresh = new MaltlineRenderer({ random: () => 0.5, nowMs: () => 0 });
    fresh.setScenario(firstEngine.scenario);
    expect(digest(render(renderer, firstEngine.snapshot())))
      .toBe(digest(render(fresh, firstEngine.snapshot())));
  });

  it('rebinds one scenario/layout authority between stages', () => {
    const firstEngine = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!);
    const laterEngine = new MaltlineEngine(MALTLINE_CAMPAIGN[2]!);
    const renderer = new MaltlineRenderer({ random: mulberry32(9000), nowMs: () => 0 });
    const firstLayout = renderer.setScenario(firstEngine.scenario);
    const laterLayout = renderer.setScenario(laterEngine.scenario);

    expect(firstLayout.scenario).toBe(firstEngine.scenario);
    expect(firstLayout.scenario.stations).toHaveLength(1);
    expect(laterLayout.scenario).toBe(laterEngine.scenario);
    expect(laterLayout.scenario.stations).toHaveLength(3);
    expect(() => render(renderer, firstEngine.snapshot())).toThrow(/scenario mismatch/u);
    expect(render(renderer, laterEngine.snapshot()).length).toBeGreaterThan(500);
  });

  it('keeps the previous valid binding when a replacement layout is rejected', () => {
    const engine = new MaltlineEngine(MALTLINE_CAMPAIGN[0]!);
    const renderer = new MaltlineRenderer({ random: mulberry32(9000), nowMs: () => 0 });
    renderer.setScenario(engine.scenario);
    const before = digest(render(renderer, engine.snapshot()));

    expect(() => renderer.setScenario({ ...engine.scenario }))
      .toThrow(/normalized frozen scenario/u);
    expect(digest(render(renderer, engine.snapshot()))).toBe(before);

    const fiveLaneScenario = normalizeMaltlineScenario({
      ...MALTLINE_CAMPAIGN[2]!,
      lanes: 5,
    });
    expect(() => renderer.setScenario(fiveLaneScenario))
      .toThrow(/room renderer supports 1–4 lanes/u);
    expect(digest(render(renderer, engine.snapshot()))).toBe(before);
  });

  it('reproduces event effects from the same seed, state, time, and advancement', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const events: GameEvent[] = [
      { tick: 1, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 1, type: 'jar_caught', customerId: 1, lane: 1, points: 25 },
    ];

    const makeRenderer = (seed: number) => {
      const renderer = new MaltlineRenderer({ random: mulberry32(seed), nowMs: () => 12_345 });
      renderer.setScenario(scenario);
      renderer.pushEvents(events, state);
      renderer.update(125);
      return renderer;
    };

    const first = render(makeRenderer(9001), state);
    const second = render(makeRenderer(9001), state);
    const differentSeed = render(makeRenderer(9002), state);

    expect(first.length).toBeGreaterThan(500);
    expect(digest(first)).toBe(digest(second));
    expect(digest(first)).not.toBe(digest(differentSeed));
  });

  it('renders the same event-age matrix regardless of update partitioning', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const engine = new MaltlineEngine(scenario);
    const baseline = engine.snapshot();
    const state: MaltlineState = {
      ...baseline,
      customers: [{
        id: 7, lane: 0, x: 50 * 1024, flavor: 'vanilla', phase: 'drinking', timer: 30,
        fulfilled: true, requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
      }],
    };
    const events: GameEvent[] = [
      { tick: 10, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 10, type: 'life_lost', reason: 'shake_smashed', lives: 2 },
      { tick: 10, type: 'served', customerId: 7, lane: 0, flavor: 'vanilla', exitAfterDrink: true, firstFulfillment: true, points: 125 },
      { tick: 10, type: 'jar_caught', customerId: 7, lane: 0, points: 25 },
    ];
    const makeRenderer = () => {
      const renderer = new MaltlineRenderer({ random: mulberry32(9010), nowMs: () => 4_000 });
      renderer.setScenario(engine.scenario);
      renderer.pushEvents(events, state);
      return renderer;
    };
    for (const age of [0, 90, 479, 480, 899, 900, 1_119, 1_120, 1_399, 1_400]) {
      const single = makeRenderer();
      const partitioned = makeRenderer();
      single.update(age);
      let remaining = age;
      while (remaining > 0) {
        const step = Math.min(30, remaining);
        partitioned.update(step);
        remaining -= step;
      }
      expect(digest(render(partitioned, state)), `event effects at ${age}ms`)
        .toBe(digest(render(single, state)));
    }
  });

  it('advances presentation only through update, independently of wall-clock passage', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state: MaltlineState = {
      ...new MaltlineEngine(scenario).snapshot(),
      jarsAvailable: 3,
      washing: [60],
    };
    let presentationTime = 2_000;
    const renderer = new MaltlineRenderer({
      random: mulberry32(17),
      nowMs: () => presentationTime,
    });
    renderer.setScenario(scenario);

    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const before = render(renderer, state);
    vi.mocked(Date.now).mockReturnValue(9_000_000);
    const afterWallClockPassage = render(renderer, state);

    expect(digest(afterWallClockPassage)).toBe(digest(before));

    presentationTime += 300;
    const afterExactPresentationAdvance = render(renderer, state);
    expect(digest(afterExactPresentationAdvance)).toBe(digest(before));
  });

  it('uses authoritative event points and names zero-point rescues honestly', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state: MaltlineState = {
      ...new MaltlineEngine(scenario).snapshot(),
      streak: 9,
      customers: [{
        id: 7,
        lane: 0,
        x: 50 * 1024,
        flavor: 'vanilla',
        phase: 'drinking',
        timer: 30,
        fulfilled: true,
        requeues: 1,
        catchBonusEligible: false,
        exitAfterDrink: true,
      }],
    };

    const scoreRenderer = new MaltlineRenderer({ random: mulberry32(21), nowMs: () => 0 });
    scoreRenderer.setScenario(scenario);
    scoreRenderer.pushEvents([{
      tick: 20,
      type: 'served',
      customerId: 7,
      lane: 0,
      flavor: 'vanilla',
      exitAfterDrink: true,
      firstFulfillment: true,
      points: 137,
    }], state);
    expect(renderedText(render(scoreRenderer, state))).toContain('+137');
    expect(renderedText(render(scoreRenderer, state))).toContain('CHAIN 9');

    const rescueRenderer = new MaltlineRenderer({ random: mulberry32(21), nowMs: () => 0 });
    rescueRenderer.setScenario(scenario);
    rescueRenderer.pushEvents([{
      tick: 21,
      type: 'served',
      customerId: 7,
      lane: 0,
      flavor: 'vanilla',
      exitAfterDrink: true,
      firstFulfillment: false,
      points: 0,
    }], state);
    rescueRenderer.pushEvents([{
      tick: 22,
      type: 'jar_caught',
      customerId: 7,
      lane: 0,
      points: 0,
    }], state);
    rescueRenderer.pushEvents([{
      tick: 23,
      type: 'jar_caught',
      customerId: 7,
      lane: 0,
      points: 41,
    }], state);
    const rescueText = renderedText(render(rescueRenderer, state));
    expect(rescueText).toContain('RESCUED · 0 PTS');
    expect(rescueText).toContain('RETURN CAUGHT · 0 PTS');
    expect(rescueText).toContain('+41');
    expect(rescueText).not.toContain('+180');
    expect(rescueText).not.toContain('+25');
  });

  it('keeps truthful chain labels contained with motion-independent intrinsic geometry', () => {
    const scenario = MALTLINE_CAMPAIGN[7]!;
    const baseline = new MaltlineEngine(scenario).snapshot();

    for (const streak of [2, 10, 11, 31]) {
      const state: MaltlineState = { ...baseline, tick: 0, streak };
      const commandsByMode = [false, true].map((reducedMotion) => {
        const renderer = new MaltlineRenderer({ reducedMotion, random: () => 0.5, nowMs: () => 0 });
        renderer.setScenario(scenario);
        return render(renderer, state);
      });
      const expected = `CHAIN ${streak}`;

      for (const commands of commandsByMode) {
        const labelIndex = commands.findIndex((command) =>
          command[0] === 'fillText' && command[1] === expected);
        expect(labelIndex, `${expected} is rendered`).toBeGreaterThan(-1);
        expect(commands[labelIndex]).toEqual(['fillText', expected, 0, 1]);
        expect(commands.slice(0, labelIndex).reverse().find((command) => command[0] === 'roundRect'))
          .toEqual(['roundRect', -8, -11, 92, 22, 11]);
        expect(commands.slice(0, labelIndex).reverse().find((command) => command[0] === 'translate'))
          .toEqual(['translate', 126, 23]);
        expect(renderedText(commands).join(' ')).not.toMatch(/STREAK|×/u);
      }

      const intrinsic = (commands: Command[]) => commands.filter((command) =>
        command[0] === 'fillText' && command[1] === expected
        || command[0] === 'roundRect' && command[1] === -8 && command[2] === -11
        || command[0] === 'translate' && command[1] === 126 && command[2] === 23);
      expect(intrinsic(commandsByMode[1]!)).toEqual(intrinsic(commandsByMode[0]!));
    }
  });

  it('renders a dominant numeric lives role for zero through four without HUD collisions', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const { hudLives, hudOrders } = MALTLINE_RENDERER_FRAME;

    for (const lives of [0, 1, 2, 4]) {
      const state: MaltlineState = { ...baseline, tick: 0, lives };
      const commandsByMode = [false, true].map((reducedMotion) => {
        const renderer = new MaltlineRenderer({ reducedMotion, random: () => 0.5, nowMs: () => 0 });
        renderer.setScenario(scenario);
        return render(renderer, state);
      });
      const expected = `LIVES ${lives}`;

      for (const commands of commandsByMode) {
        const ordersIndex = commands.findIndex((command) =>
          command[0] === 'fillText' && String(command[1]).startsWith('ORDERS LEFT '));
        expect(commands.slice(0, ordersIndex).reverse()
          .find((command) => command[0] === 'roundRect')).toEqual([
          'roundRect', hudOrders.x, hudOrders.y, hudOrders.width, hudOrders.height, 12,
        ]);
        const labelIndex = commands.findIndex((command) =>
          command[0] === 'fillText' && command[1] === expected);
        expect(labelIndex, `${expected} is rendered`).toBeGreaterThan(-1);
        expect(commands[labelIndex]).toEqual([
          'fillText', expected, hudLives.x + 10, hudLives.y + hudLives.height / 2 + 1,
        ]);
        const chip = commands.slice(0, labelIndex).reverse()
          .find((command) => command[0] === 'roundRect');
        expect(chip).toEqual([
          'roundRect', hudLives.x, hudLives.y, hudLives.width, hudLives.height, 12,
        ]);
        const [x, , width] = chip!.slice(1, 4).map(Number);
        expect(x).toBeGreaterThan(hudOrders.x + hudOrders.width);
        expect(x + width).toBeLessThan(MALTLINE_RENDERER_FRAME.canvasWidth);
        expect(renderedText(commands)).not.toContain('S');
      }

      const livesGeometry = (commands: Command[]) => commands.filter((command) =>
        command[0] === 'fillText' && command[1] === expected
        || command[0] === 'roundRect'
          && command[1] === hudLives.x && command[2] === hudLives.y);
      expect(livesGeometry(commandsByMode[1]!)).toEqual(livesGeometry(commandsByMode[0]!));
    }
  });

  it('keeps serve and catch feedback through 899ms and expires it exactly at 900ms', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      customers: [{
        id: 17, lane: 0, x: 48 * 1024, flavor: 'vanilla', phase: 'drinking', timer: 30,
        fulfilled: true, requeues: 0, catchBonusEligible: true, exitAfterDrink: true,
      }],
    };
    const cases: Array<{ event: GameEvent; text: string }> = [
      {
        event: { tick: 30, type: 'served', customerId: 17, lane: 0, flavor: 'vanilla', exitAfterDrink: true, firstFulfillment: true, points: 123 },
        text: '+123',
      },
      { event: { tick: 30, type: 'jar_caught', customerId: 17, lane: 0, points: 25 }, text: '+25' },
    ];

    for (const { event, text } of cases) {
      for (const age of [0, 90, 899]) {
        const renderer = new MaltlineRenderer({ random: mulberry32(30), nowMs: () => 0 });
        renderer.setScenario(scenario);
        renderer.pushEvents([event], state);
        renderer.update(age);
        expect(renderedText(render(renderer, state)), `${event.type} at ${age}ms`).toContain(text);
      }
      const expired = new MaltlineRenderer({ random: mulberry32(30), nowMs: () => 0 });
      expired.setScenario(scenario);
      expired.pushEvents([event], state);
      expired.update(900);
      expect(renderedText(render(expired, state))).not.toContain(text);
    }
  });

  it('expires lane flashes at 480ms and loss callouts at 1400ms', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const blank = new MaltlineRenderer({ reducedMotion: true, nowMs: () => 0 });
    blank.setScenario(scenario);
    const blankDigest = digest(render(blank, state));

    for (const age of [0, 479, 480]) {
      const flash = new MaltlineRenderer({ reducedMotion: true, nowMs: () => 0 });
      flash.setScenario(scenario);
      flash.pushEvents([{ tick: 40, type: 'walkout', customerId: 2, lane: 0 }], state);
      flash.update(age);
      expect(digest(render(flash, state)) === blankDigest, `walkout flash at ${age}ms`)
        .toBe(age === 480);
    }

    for (const age of [0, 90, 1_399, 1_400]) {
      const callout = new MaltlineRenderer({ reducedMotion: true, nowMs: () => 0 });
      callout.setScenario(scenario);
      callout.pushEvents([{ tick: 40, type: 'life_lost', reason: 'jar_smashed', lives: 2 }], state);
      callout.update(age);
      expect(renderedText(render(callout, state)).includes('LIFE LOST · RETURN JAR MISSED'),
        `loss callout at ${age}ms`).toBe(age < 1_400);
    }
  });

  it('does not reconstruct event-local chain labels from one post-tick aggregate', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const customers = [
      { id: 71, lane: 0, x: 45 * 1024, flavor: 'vanilla' as const },
      { id: 72, lane: 1, x: 55 * 1024, flavor: 'chocolate' as const },
    ].map((customer) => ({
      ...customer,
      phase: 'drinking' as const,
      timer: 20,
      fulfilled: true,
      requeues: 0,
      catchBonusEligible: true,
      exitAfterDrink: true,
    }));
    const state: MaltlineState = { ...baseline, streak: 9, customers };
    const renderer = new MaltlineRenderer({ random: mulberry32(23), nowMs: () => 0 });
    renderer.setScenario(scenario);
    renderer.pushEvents([
      { tick: 70, type: 'served', customerId: 71, lane: 0, flavor: 'vanilla', exitAfterDrink: true, firstFulfillment: true, points: 100 },
      { tick: 70, type: 'served', customerId: 72, lane: 1, flavor: 'chocolate', exitAfterDrink: true, firstFulfillment: true, points: 110 },
    ], state);

    const popupText = renderedText(render(renderer, state));
    expect(popupText).toContain('+100');
    expect(popupText).toContain('+110');
    expect(popupText.filter((text) => text.startsWith('CHAIN '))).toEqual(['CHAIN 9']);
    expect(popupText.join(' ')).not.toMatch(/STREAK|×/u);
  });

  it('derives outstanding orders from resolved customers', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state: MaltlineState = {
      ...new MaltlineEngine(scenario).snapshot(),
      resolved: 3,
      exited: 1,
      walkouts: 2,
    };
    const renderer = new MaltlineRenderer({ random: mulberry32(22), nowMs: () => 0 });
    renderer.setScenario(scenario);

    const text = renderedText(render(renderer, state));
    expect(text).toContain('ORDERS LEFT 5');
    expect(text.some((value) => value.startsWith('IN LINE'))).toBe(false);
  });

  it('names each life-loss reason in a fixed-age callout', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const cases: Array<{ reason: 'walkout' | 'shake_smashed' | 'jar_smashed'; text: string }> = [
      { reason: 'walkout', text: 'LIFE LOST · CUSTOMER REACHED COUNTER' },
      { reason: 'shake_smashed', text: 'LIFE LOST · SHAKE MISSED' },
      { reason: 'jar_smashed', text: 'LIFE LOST · RETURN JAR MISSED' },
    ];

    for (const [index, entry] of cases.entries()) {
      const renderer = new MaltlineRenderer({ random: mulberry32(30 + index), nowMs: () => 0 });
      renderer.setScenario(scenario);
      renderer.pushEvents([{
        tick: 40,
        type: 'life_lost',
        reason: entry.reason,
        lives: 2,
      }], state);
      renderer.update(120);
      expect(renderedText(render(renderer, state))).toContain(entry.text);
    }
  });

  it('does not let repeated draws alter shake or later seeded effects', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const failure: GameEvent[] = [
      { tick: 50, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 50, type: 'life_lost', reason: 'shake_smashed', lives: 2 },
    ];
    const caught: GameEvent[] = [
      { tick: 51, type: 'jar_caught', customerId: 4, lane: 1, points: 25 },
    ];
    const withExtraDraws = new MaltlineRenderer({ random: mulberry32(88), nowMs: () => 400 });
    const withoutExtraDraws = new MaltlineRenderer({ random: mulberry32(88), nowMs: () => 400 });
    for (const renderer of [withExtraDraws, withoutExtraDraws]) {
      renderer.setScenario(scenario);
      renderer.pushEvents(failure, state);
      renderer.update(90);
    }

    const firstDraw = render(withExtraDraws, state);
    const repeatedDraw = render(withExtraDraws, state);
    expect(digest(repeatedDraw)).toBe(digest(firstDraw));

    withExtraDraws.pushEvents(caught, state);
    withoutExtraDraws.pushEvents(caught, state);
    expect(digest(render(withExtraDraws, state))).toBe(digest(render(withoutExtraDraws, state)));
  });

  it('clears all transient effects at a presentation boundary', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ random: mulberry32(99), nowMs: () => 500 });
    renderer.setScenario(scenario);
    renderer.pushEvents([
      { tick: 60, type: 'walkout', customerId: 8, lane: 0 },
      { tick: 60, type: 'life_lost', reason: 'walkout', lives: 2 },
      { tick: 60, type: 'jar_caught', customerId: 7, lane: 1, points: 25 },
    ], state);
    renderer.update(100);
    renderer.resetPresentation();

    const fresh = new MaltlineRenderer({ random: mulberry32(1), nowMs: () => 500 });
    fresh.setScenario(scenario);
    expect(digest(render(renderer, state))).toBe(digest(render(fresh, state)));
  });

  it('puts truthful progress, readiness and blocked status beside the active motor', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const initial = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    const layout = renderer.setScenario(scenario);
    for (const [lane, station] of [[0, 0], [1, 1], [2, 2]]) {
      const bank = layout.workstation(lane!, station!);
      const state = { ...initial, player: { ...initial.player, lane: lane!, station: station! } };
      expect(renderedText(render(renderer, state))).not.toContain('READY');
      const blend = render(renderer, { ...state, player: { ...state.player,
        blending: 'strawberry', blendProgress: scenario.blendTicks / 2 } });
      expect(renderedText(blend)).toContain('BLEND 50%');
      expect(blend).toContainEqual(['roundRect', bank.status.bounds.x, bank.status.bounds.y,
        bank.status.bounds.width, bank.status.bounds.height, 12]);
      expect(renderedText(render(renderer, { ...state, player: { ...state.player, holding: 'strawberry' } }))).toContain('READY');
      const blocked = render(renderer, { ...state, jarsAvailable: 0 });
      expect(renderedText(blocked)).toContain('NO CLEAN CUPS');
      expect(blocked).toContainEqual(['set', 'fillStyle', MALTLINE_VISUAL_THEME.station.blocked]);
      expect(renderedText(blocked).join(' ')).not.toMatch(/CLEAN 0|WASH|IN PLAY/);
    }
  });

  it('keeps returning-jar cue geometry and draw transcript shape exact across motion modes', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const threshold = scenario.laneLength * FIXED_SCALE * .25;
    const state = { ...baseline, jars: [
      { id: 61, customerId: 41, lane: 0, x: threshold, catchBonusEligible: true },
      { id: 62, customerId: 42, lane: 1, x: threshold + 1, catchBonusEligible: false },
    ] };
    const commands = [false, true].map(reducedMotion => {
      const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion });
      renderer.setScenario(scenario); return render(renderer, state);
    });
    const cue = deriveMaltlineRendererLayout(scenario).projectReturningJar(threshold, 0).catchCue!;
    for (const tape of commands) {
      expect(tape.filter(c => c[0] === 'roundRect' && c[1] === cue.x && c[2] === cue.y))
        .toEqual([['roundRect', cue.x, cue.y, cue.width, cue.height, 9]]);
      expect(renderedText(tape)).toContain('◀ CATCH');
      expect(renderedText(tape)).not.toContain('WINDOW 2');
    }
    expect(commands[0]!.map(([method]) => method)).toEqual(commands[1]!.map(([method]) => method));
  });

  it('fills only the processing pitcher, including a different selected flavor, and freezes reduced-motion art', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const initial = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    const layout = renderer.setScenario(scenario);
    const state = { ...initial, player: { ...initial.player, lane: 1, station: 1, blending: 'strawberry' as const } };
    let previousTop = Infinity;
    for (const fraction of [.25, .5, .75]) {
      const progress = Math.floor(scenario.blendTicks * fraction);
      const commands = render(renderer, { ...state, player: { ...state.player, blendProgress: progress } });
      const liquid = filledRects(commands).filter(({color, rect}) => color === MALTLINE_VISUAL_THEME.flavors.strawberry.base && rect[0] === -16);
      expect(liquid).toHaveLength(1);
      expect(liquid[0]!.rect[1]).toBeLessThan(previousTop); previousTop = liquid[0]!.rect[1]!;
      const bank = layout.workstation(1, 1);
      expect(bank.pitchers.find(p => p.stationIndex === 1)!.dock).toBe(1);
      expect(bank.pitchers.find(p => p.stationIndex === 2)!.dock).toBe(0);
      expect(filledRects(commands)).toContainEqual({color:MALTLINE_VISUAL_THEME.station.selectedKeyline, rect:[-7,-30,14,2]});
      expect(filledRects(commands)).toContainEqual({color:MALTLINE_VISUAL_THEME.station.processing, rect:[-7,-30,14,2]});
      expect(digest(render(renderer, { ...state, tick: 123, player: { ...state.player, blendProgress: progress } }))).toBe(digest(commands));
    }
    const held = render(renderer, { ...initial, player: { ...initial.player, station: 1, holding: 'strawberry' } });
    expect(filledRects(held)).toContainEqual({color:MALTLINE_VISUAL_THEME.station.ready, rect:[-7,-30,14,2]});
    expect(renderedText(held)).toContain('READY');
  });

  it('paints exactly one active motor with its pitchers left of the serving track', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    const layout = renderer.setScenario(scenario);
    for (let lane = 0; lane < scenario.lanes; lane++) {
      const bank = layout.workstation(lane, 1);
      const commands = render(renderer, { ...baseline, player: { ...baseline.player, lane, station: 1 } });
      expect(commands.filter(c => c[0] === 'translate' && c[1] === bank.motor.anchor.x && c[2] === bank.motor.anchor.y)).toHaveLength(1);
      for (const pitcher of bank.pitchers) expect(commands).toContainEqual(['translate',pitcher.anchor.x,pitcher.anchor.y+29*pitcher.scale]);
      expect(bank.motor.bounds.x + bank.motor.bounds.width).toBeLessThan(layout.project(0,layout.counterFrontY(lane)).x);
    }
  });

  it('paints customers before their counter and vessels after it without altering state', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = { ...baseline,
      customers: [{id:80,lane:0,x:60*FIXED_SCALE,flavor:'strawberry',phase:'marching',timer:0,fulfilled:false,requeues:0,catchBonusEligible:false,exitAfterDrink:false}],
      slides:[{id:81,lane:0,x:35*FIXED_SCALE,flavor:'vanilla'}] };
    const saved = JSON.stringify(state), renderer = new MaltlineRenderer({ nowMs:()=>0,reducedMotion:true });
    const layout = renderer.setScenario(scenario), commands = render(renderer,state);
    const customer = commands.findIndex(c => c[0]==='set'&&c[1]==='strokeStyle'&&c[2]===MALTLINE_VISUAL_THEME.customerOrder.silhouetteKeyline);
    const front = layout.counter(0).top[3];
    const counter = commands.findIndex((c,index) => index>customer&&c[0]==='moveTo'&&c[1]===front.x&&c[2]===front.y);
    const vessel = commands.findIndex(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]===MALTLINE_VISUAL_THEME.outgoingShake.shadow);
    expect(customer).toBeGreaterThan(-1); expect(counter).toBeGreaterThan(customer);expect(vessel).toBeGreaterThan(counter);
    expect(JSON.stringify(state)).toBe(saved);
  });

  it('moves the real station queue in 200ms independently of frame partition, wraps both directions and resets', () => {
    const scenario=MALTLINE_CAMPAIGN[2]!, initial=new MaltlineEngine(scenario).snapshot();
    const at=(station:number)=>({...initial,player:{...initial.player,station}});
    const make=(reducedMotion=false)=>{const r=new MaltlineRenderer({nowMs:()=>0,random:()=>.5,reducedMotion});r.setScenario(scenario);return r;};
    for(const [from,to] of [[0,1],[2,0],[0,2]]){
      const a=make(),b=make();render(a,at(from!));render(b,at(from!));render(a,at(to!));render(b,at(to!));
      a.update(100);for(const dt of [25,25,50])b.update(dt);
      expect(digest(render(a,at(to!)))).toBe(digest(render(b,at(to!))));
      const settled=make();const final=digest(render(settled,at(to!)));
      expect(digest(render(a,at(to!)))).not.toBe(final);
      a.update(100);expect(digest(render(a,at(to!)))).toBe(final);
      const reduced=make(true);render(reduced,at(from!));expect(digest(render(reduced,at(to!)))).toBe(digest(render(make(true),at(to!))));
      b.resetPresentation();expect(digest(render(b,at(to!)))).toBe(final);
      render(b,at(from!));b.update(50);b.setScenario(scenario);expect(digest(render(b,at(to!)))).toBe(final);
    }
  });

  it('renders physical clean stock with six bounded seats and an explicit overflow count', () => {
    const scenario=normalizeMaltlineScenario({...MALTLINE_CAMPAIGN[0]!,jarPoolSize:999});
    const initial=new MaltlineEngine(scenario).snapshot(),renderer=new MaltlineRenderer({nowMs:()=>0,reducedMotion:true});
    const layout=renderer.setScenario(scenario);
    for(const available of [0,1,4,6,999]){
      const commands=render(renderer,{...initial,jarsAvailable:available});
      const painted=layout.cleanRack.slots.filter(slot=>commands.some(c=>c[0]==='translate'&&c[1]===slot.center.x&&c[2]===slot.center.y));
      expect(painted).toHaveLength(Math.min(available,6));
      expect(renderedText(commands).filter(text=>/^\+\d+$/.test(text))).toEqual(available>6?[`+${available-6}`]:[]);
    }
  });

  it('keeps top-lane order tickets below the HUD with balanced canvas state', () => {
    const scenario = MALTLINE_CAMPAIGN[3]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      tick: 2_290,
      customers: [{
        id: 201,
        lane: 0,
        x: 18 * 1024,
        flavor: 'strawberry',
        phase: 'marching',
        timer: 0,
        fulfilled: false,
        requeues: 0,
        catchBonusEligible: false,
        exitAfterDrink: false,
      }],
      spawned: 1,
    };
    const renderer = new MaltlineRenderer({ random: mulberry32(106), nowMs: () => 0 });
    renderer.setScenario(scenario);
    const commands = render(renderer, state);
    const ticketRects = commands.filter((command) =>
      command[0] === 'roundRect' && command[3] === 40 && command[4] === 28);

    expect(ticketRects).toHaveLength(3);
    for (const ticket of ticketRects) expect(Number(ticket[2])).toBeGreaterThanOrEqual(48);
    expect(commands.filter((command) => command[0] === 'save')).toHaveLength(
      commands.filter((command) => command[0] === 'restore').length,
    );
  });

  it('freezes decorative movement and suppresses burst motion when reduced motion is enabled', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      tick: 10,
      streak: 3,
      customers: [{
        id: 81,
        lane: 1,
        x: 65 * 1024,
        flavor: 'chocolate',
        phase: 'marching',
        timer: 0,
        fulfilled: false,
        requeues: 0,
        catchBonusEligible: false,
        exitAfterDrink: false,
      }],
      slides: [{ id: 82, lane: 0, x: 35 * 1024, flavor: 'vanilla' }],
      washing: [50],
      jarsAvailable: 2,
    };
    const later = { ...state, tick: 900 };
    const random = vi.fn(() => 0.5);
    const reduced = new MaltlineRenderer({ random, nowMs: () => 2_000, reducedMotion: true });
    reduced.setScenario(scenario);
    reduced.pushEvents([
      { tick: 10, type: 'shake_smashed', lane: 0, flavor: 'vanilla' },
      { tick: 10, type: 'life_lost', reason: 'shake_smashed', lives: 2 },
    ], state);

    expect(digest(render(reduced, state))).toBe(digest(render(reduced, later)));
    expect(renderedText(render(reduced, state))).toContain('LIFE LOST · SHAKE MISSED');
    expect(random).not.toHaveBeenCalled();

    const full = new MaltlineRenderer({ random: mulberry32(105), nowMs: () => 2_000, reducedMotion: false });
    full.setScenario(scenario);
    expect(digest(render(full, state))).not.toBe(digest(render(full, later)));
  });

  it('changes all renderer-owned motion at the same state and restores full-motion pixels', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      tick: 37,
      streak: 3,
      customers: [{
        id: 81,
        lane: 1,
        x: 65 * 1024,
        flavor: 'chocolate',
        phase: 'marching',
        timer: 0,
        fulfilled: false,
        requeues: 0,
        catchBonusEligible: false,
        exitAfterDrink: false,
      }],
      washing: [50],
      jarsAvailable: 2,
    };
    const renderer = new MaltlineRenderer({
      random: mulberry32(106),
      nowMs: () => 2_000,
      reducedMotion: false,
    });
    renderer.setScenario(scenario);
    const full = digest(render(renderer, state));

    expect(renderer.setReducedMotion(false)).toBe(false);
    expect(renderer.setReducedMotion(true)).toBe(true);
    expect(digest(render(renderer, state))).not.toBe(full);
    expect(renderer.setReducedMotion(true)).toBe(false);
    expect(renderer.setReducedMotion(false)).toBe(true);
    expect(digest(render(renderer, state))).toBe(full);
  });
});
