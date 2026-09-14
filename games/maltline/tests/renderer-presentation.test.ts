import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MALTLINE_CAMPAIGN } from '../src/core/campaign';
import { FIXED_SCALE, MaltlineEngine } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import type { GameEvent, MaltlineScenario, MaltlineState } from '../src/core/types';
import { MaltlineRenderer } from '../src/viewer/renderer';
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

function strokedRoundRects(commands: Command[]): Array<{ color: string; rect: number[] }> {
  const results: Array<{ color: string; rect: number[] }> = [];
  let strokeStyle = '';
  let path: number[] | null = null;
  for (const command of commands) {
    if (command[0] === 'set' && command[1] === 'strokeStyle') strokeStyle = String(command[2]);
    if (command[0] === 'beginPath') path = null;
    if (command[0] === 'roundRect') path = command.slice(1, 5).map(Number);
    if (command[0] === 'stroke' && path !== null) results.push({ color: strokeStyle, rect: path });
  }
  return results;
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
    expect(firstLayout.stations).toHaveLength(1);
    expect(laterLayout.scenario).toBe(laterEngine.scenario);
    expect(laterLayout.stations).toHaveLength(3);
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

  it('ignores wall-clock passage while an injected presentation clock is frozen', () => {
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
    expect(digest(afterExactPresentationAdvance)).not.toBe(digest(before));
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

  it('renders peripheral text cues for lane, flavor, action, and jar economy', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const blendingState: MaltlineState = {
      ...baseline,
      player: {
        lane: 1,
        station: 1,
        x: 0,
        holding: null,
        blending: 'chocolate',
        blendProgress: Math.floor(scenario.blendTicks / 2),
      },
      customers: [{
        id: 80,
        lane: 2,
        x: 60 * 1024,
        flavor: 'strawberry',
        phase: 'marching',
        timer: 0,
        fulfilled: false,
        requeues: 0,
        catchBonusEligible: false,
        exitAfterDrink: false,
      }],
      jarsAvailable: 0,
      washing: [30, 60],
    };
    const renderer = new MaltlineRenderer({ random: mulberry32(104), nowMs: () => 0 });
    renderer.setScenario(scenario);
    const text = renderedText(render(renderer, blendingState));

    expect(text).toContain('BLENDING · 50%');
    expect(text).toContain('VANILLA');
    expect(text).toContain('CHOCOLATE');
    expect(text).toContain('STRAWBERRY');
    expect(text).toContain('CLEAN 0');
    expect(text).toContain('WASH 2 · IN PLAY 3');
    expect(text).toContain('CATCH A RETURN');
    for (const letter of ['V', 'C', 'S']) expect(text).not.toContain(letter);

    const readyState: MaltlineState = {
      ...blendingState,
      player: { ...blendingState.player, holding: 'strawberry', blending: null, blendProgress: 0 },
    };
    expect(renderedText(render(renderer, readyState)))
      .toContain('READY · F / ENTER');
  });

  it('keeps returning-jar cue geometry and draw transcript shape exact across motion modes', () => {
    const scenario = MALTLINE_CAMPAIGN[0]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const threshold = scenario.laneLength * FIXED_SCALE * 0.25;
    const state: MaltlineState = {
      ...baseline,
      tick: 37,
      player: { ...baseline.player, lane: 0 },
      jars: [
        { id: 61, customerId: 41, lane: 0, x: threshold, catchBonusEligible: true },
        { id: 62, customerId: 42, lane: 1, x: threshold + 1, catchBonusEligible: false },
      ],
      jarsAvailable: scenario.jarPoolSize - 2,
    };
    const normal = new MaltlineRenderer({ random: mulberry32(401), nowMs: () => 0, reducedMotion: false });
    const reduced = new MaltlineRenderer({ random: mulberry32(401), nowMs: () => 0, reducedMotion: true });
    normal.setScenario(scenario);
    reduced.setScenario(scenario);
    const normalCommands = render(normal, state);
    const reducedCommands = render(reduced, state);
    const cueRects = (commands: Command[]) => commands.filter((command) =>
      command[0] === 'roundRect' && command[3] === 70 && command[4] === 19);

    const cue = deriveMaltlineRendererLayout(scenario).projectReturningJar(threshold, 0).catchCue!;
    expect(cueRects(normalCommands)).toEqual([['roundRect', cue.x, cue.y, 70, 19, 9]]);
    expect(cueRects(reducedCommands)).toEqual(cueRects(normalCommands));
    expect(renderedText(normalCommands)).toContain('◀ CATCH');
    expect(renderedText(normalCommands)).not.toContain('WINDOW 2');
    expect(normalCommands.map(([method]) => method)).toEqual(
      reducedCommands.map(([method]) => method),
    );
  });

  it('puts exact pour progress in the bartender cup and freezes decorative pour motion', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    renderer.setScenario(scenario);
    for (const requestedFraction of [0, 0.25, 0.5, 0.75]) {
      const blendProgress = Math.floor(scenario.blendTicks * requestedFraction);
      const fraction = blendProgress / scenario.blendTicks;
      const state: MaltlineState = {
        ...baseline,
        player: { ...baseline.player, lane: 1, x: 0, blending: 'strawberry', blendProgress },
      };
      const commands = render(renderer, state);
      expect(filledRects(commands)).toContainEqual({
        color: MALTLINE_VISUAL_THEME.flavors.strawberry.base,
        rect: [-9, 12 - 27 * fraction, 18, 27 * fraction],
      });
      expect(digest(render(renderer, { ...state, tick: 123 }))).toBe(digest(commands));
    }
    const held = render(renderer, {
      ...baseline,
      player: { ...baseline.player, holding: 'strawberry', blending: null, blendProgress: 0 },
    });
    expect(filledRects(held).filter(({ rect }) => rect[0] === -9 && rect[2] === 18)).toEqual([]);
  });

  it('shows the available ingredient selector at the service end with truthful selection', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    renderer.setScenario(scenario);
    const state: MaltlineState = {
      ...baseline,
      player: { ...baseline.player, station: 1, blending: 'strawberry', blendProgress: 10 },
    };
    const commands = render(renderer, state);
    expect(renderedText(commands)).toContain('A / D  FLAVOR');
    const selected = strokedRoundRects(commands).filter(({ color, rect }) =>
      color === '#ffe39a' && rect[2] === 25 && rect[3] === 27);
    expect(selected).toEqual([{ color: '#ffe39a', rect: [84, -63, 25, 27] }]);
    for (const letter of ['V', 'C', 'S']) expect(renderedText(commands)).not.toContain(letter);
  });

  it('occludes customers behind each counter and paints sliding vessels on its surface', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const state: MaltlineState = {
      ...baseline,
      customers: [{
        id: 80, lane: 0, x: 60 * FIXED_SCALE, flavor: 'strawberry', phase: 'marching',
        timer: 0, fulfilled: false, requeues: 0, catchBonusEligible: false, exitAfterDrink: false,
      }],
      slides: [{ id: 81, lane: 0, x: 35 * FIXED_SCALE, flavor: 'vanilla' }],
    };
    const before = JSON.stringify(state);
    const renderer = new MaltlineRenderer({ nowMs: () => 0, reducedMotion: true });
    renderer.setScenario(scenario);
    const commands = render(renderer, state);
    const customer = commands.findIndex((command) => command[0] === 'set'
      && command[1] === 'strokeStyle' && command[2] === MALTLINE_VISUAL_THEME.customerOrder.silhouetteKeyline);
    const front = commands.findIndex((command) => command[0] === 'set'
      && command[1] === 'fillStyle' && command[2] === '#d96b50');
    const vessel = commands.findIndex((command) => command[0] === 'set'
      && command[1] === 'fillStyle' && command[2] === MALTLINE_VISUAL_THEME.outgoingShake.shadow);
    expect(customer).toBeGreaterThan(-1);
    expect(front).toBeGreaterThan(customer);
    expect(vessel).toBeGreaterThan(front);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps the active counter lip and its perspective static in both motion modes', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const state = new MaltlineEngine(scenario).snapshot();
    const layout = deriveMaltlineRendererLayout(scenario);
    const near = layout.project(0, layout.counterFrontY(0), -12);
    const far = layout.project(scenario.laneLength * FIXED_SCALE, layout.counterFrontY(0), -12);

    for (const reducedMotion of [false, true]) {
      const renderer = new MaltlineRenderer({
        random: mulberry32(402), nowMs: () => 0, reducedMotion,
      });
      renderer.setScenario(scenario);
      const commands = render(renderer, state);
      expect(commands).toContainEqual([
        'set', 'strokeStyle', MALTLINE_VISUAL_THEME.ambience.activeLane,
      ]);
      expect(commands).toContainEqual([
        'moveTo', near.x, near.y,
      ]);
      expect(commands).toContainEqual([
        'lineTo', far.x, far.y,
      ]);
    }
  });

  it('paints selection, processing, blocked, and held readiness on truthful surfaces', () => {
    const scenario = MALTLINE_CAMPAIGN[2]!;
    const baseline = new MaltlineEngine(scenario).snapshot();
    const crossStationBlend: MaltlineState = {
      ...baseline,
      jarsAvailable: scenario.jarPoolSize - 1,
      player: {
        lane: 1,
        station: 1,
        x: 0,
        holding: null,
        blending: 'strawberry',
        blendProgress: Math.floor(scenario.blendTicks / 2),
      },
    };
    const renderer = new MaltlineRenderer({ random: mulberry32(107), nowMs: () => 0 });
    renderer.setScenario(scenario);
    const crossCommands = render(renderer, crossStationBlend);
    const crossFrames = strokedRoundRects(crossCommands);
    const selected = crossFrames.find(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.selectedKeyline
      && Math.abs(rect[0]! - 463) < 0.01 && rect[2] === 78 && rect[3] === 74);
    const processing = crossFrames.find(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.processing
      && Math.abs(rect[0]! - 742.3333333333333) < 0.01 && rect[2] === 70 && rect[3] === 66);
    expect(selected).toBeDefined();
    expect(processing).toBeDefined();
    expect(renderedText(crossCommands)).toContain('BLENDING · 50%');

    const blockedState: MaltlineState = {
      ...baseline,
      jarsAvailable: 0,
      player: { ...baseline.player, station: 1 },
    };
    const blockedCommands = render(renderer, blockedState);
    const blockedFrames = strokedRoundRects(blockedCommands);
    expect(blockedFrames.some(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.blocked
      && Math.abs(rect[0]! - 463) < 0.01 && rect[2] === 78 && rect[3] === 74)).toBe(true);
    expect(blockedCommands.some((command) =>
      command[0] === 'set'
      && (command[1] === 'fillStyle' || command[1] === 'strokeStyle')
      && command[2] === MALTLINE_VISUAL_THEME.station.ready)).toBe(false);

    const holdingState: MaltlineState = {
      ...baseline,
      jarsAvailable: scenario.jarPoolSize - 1,
      player: { ...baseline.player, station: 1, holding: 'strawberry' },
    };
    const holdingCommands = render(renderer, holdingState);
    const holdingFrames = strokedRoundRects(holdingCommands);
    expect(holdingFrames.some(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.ready
      && rect[0] === 112 && rect[1] === 353 && rect[2] === 276 && rect[3] === 30)).toBe(true);
    expect(holdingFrames.some(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.ready
      && Math.abs(rect[0]! - 463) < 0.01 && rect[2] === 78 && rect[3] === 74)).toBe(false);
    expect(renderedText(holdingCommands)).toContain('READY · F / ENTER');
  });

  it('fills the processing meter continuously from exact progress in both motion modes', () => {
    const scenario: MaltlineScenario = { ...MALTLINE_CAMPAIGN[2]!, blendTicks: 100 };
    const engine = new MaltlineEngine(scenario);
    const baseline = engine.snapshot();
    const stateAt = (blendProgress: number): MaltlineState => ({
      ...baseline,
      player: {
        ...baseline.player,
        station: 1,
        blending: 'strawberry',
        blendProgress,
      },
    });
    const meterFill = (commands: Command[]): number[] => filledRects(commands).find(({ color, rect }) =>
      color === MALTLINE_VISUAL_THEME.station.processing && rect[2] === 6)!.rect;
    const meterDividers = (commands: Command[]): number[][] => commands
      .filter((command) => command[0] === 'moveTo'
        && Math.abs(Number(command[1]) - 726.3333333333333) < 0.01
        && Number(command[2]) > 415 && Number(command[2]) < 469)
      .map((command) => command.slice(1, 3).map(Number));

    for (const [progress, expectedY, expectedHeight] of [
      [0, 469, 0],
      [50, 442, 27],
      [99, 415.54, 53.46],
      [100, 415, 54],
    ] as const) {
      const renderer = new MaltlineRenderer({ random: mulberry32(108), nowMs: () => 0 });
      renderer.setScenario(engine.scenario);
      const commands = render(renderer, stateAt(progress));
      const fill = meterFill(commands);
      expect(fill[0]).toBeCloseTo(726.3333333333333);
      expect(fill[1]).toBeCloseTo(expectedY);
      expect(fill[2]).toBe(6);
      expect(fill[3]).toBeCloseTo(expectedHeight);
      expect(renderedText(commands)).toContain(`BLENDING · ${Math.round(progress / 5) * 5}%`);
    }

    const full = new MaltlineRenderer({ random: mulberry32(109), nowMs: () => 0, reducedMotion: false });
    const reduced = new MaltlineRenderer({ random: mulberry32(109), nowMs: () => 0, reducedMotion: true });
    full.setScenario(engine.scenario);
    reduced.setScenario(engine.scenario);
    const fullCommands = render(full, stateAt(50));
    const reducedCommands = render(reduced, stateAt(50));
    expect(meterFill(reducedCommands)).toEqual(meterFill(fullCommands));
    expect(meterDividers(fullCommands).map(([, y]) => y))
      .toEqual([425.8, 436.6, 447.4, 458.2]);
    expect(meterDividers(reducedCommands)).toEqual(meterDividers(fullCommands));
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
