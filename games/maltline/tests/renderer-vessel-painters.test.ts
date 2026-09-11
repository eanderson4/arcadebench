import { describe, expect, it } from 'vitest';
import type { FlavorId } from '../src/core/types';
import {
  drawMaltlineCup,
  drawMaltlineJar,
  drawMaltlineSoftServe,
} from '../src/viewer/renderer-vessel-painters';
import { MALTLINE_VISUAL_THEME } from '../src/viewer/visual-theme';

type Command = readonly unknown[];

function commandRecorder(): {
  readonly context: CanvasRenderingContext2D;
  readonly commands: Command[];
} {
  const commands: Command[] = [];
  const values = new Map<PropertyKey, unknown>([['globalAlpha', 1]]);
  let gradientId = 0;
  const normalize = (value: unknown): unknown => value !== null && typeof value === 'object'
    && 'gradientId' in value ? `gradient:${String(value.gradientId)}` : value;
  const context = new Proxy({}, {
    get(_target, property) {
      if (values.has(property)) return values.get(property);
      if (property === 'createLinearGradient') {
        return (...args: unknown[]) => {
          const id = gradientId++;
          commands.push(['createLinearGradient', id, ...args]);
          return {
            gradientId: id,
            addColorStop(offset: number, color: string) {
              commands.push(['addColorStop', id, offset, color]);
            },
          };
        };
      }
      return (...args: unknown[]) => commands.push([String(property), ...args.map(normalize)]);
    },
    set(_target, property, value) {
      values.set(property, value);
      commands.push(['set', String(property), normalize(value)]);
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { context, commands };
}

function methods(commands: readonly Command[]): string[] {
  return commands.map(([method]) => String(method));
}

function expectBalancedState(commands: readonly Command[]): void {
  expect(methods(commands).filter((method) => method === 'save')).toHaveLength(
    methods(commands).filter((method) => method === 'restore').length,
  );
}

describe('stateless Maltline vessel painters', () => {
  it.each([
    ['vanilla', 'V'],
    ['chocolate', 'C'],
    ['strawberry', 'S'],
  ] as const)('draws the %s cup with its non-color cue', (flavor, cue) => {
    const { context, commands } = commandRecorder();
    drawMaltlineCup(context, 12, 34, flavor, 1.25);

    expect(commands.slice(0, 5)).toEqual([
      ['save'],
      ['translate', 12, 34],
      ['rotate', 0],
      ['scale', 1.25, 1.25],
      ['createLinearGradient', 0, -7, 0, 7, 0],
    ]);
    expect(commands).toContainEqual(['fillText', cue, 0, 0.5]);
    expect(commands).toContainEqual(['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].base]);
    expect(commands).toContainEqual(['set', 'textAlign', 'center']);
    expect(commands).toContainEqual(['set', 'textBaseline', 'middle']);
    expect(commands).toContainEqual(['set', 'textAlign', 'left']);
    expect(commands).toContainEqual(['set', 'textBaseline', 'alphabetic']);
    expect(commands.at(-1)).toEqual(['restore']);
    expectBalancedState(commands);
  });

  it('pins ordinary cup transform, gradient, path, text reset, nesting, and straw order', () => {
    const { context, commands } = commandRecorder();
    drawMaltlineCup(context, -4, 7, 'vanilla', 0.75, -0.5);

    expect(methods(commands)).toEqual([
      'save', 'translate', 'rotate', 'scale',
      'createLinearGradient', 'addColorStop', 'addColorStop', 'addColorStop', 'set',
      'beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'closePath', 'fill',
      'set', 'beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'closePath', 'fill',
      'set', 'set', 'set', 'set', 'fillText', 'set', 'set',
      'set', 'beginPath', 'roundRect', 'fill',
      'set', 'beginPath', 'arc', 'fill',
      'save', 'translate', 'scale',
      'set', 'beginPath', 'arc', 'fill',
      'set', 'beginPath', 'arc', 'fill',
      'set', 'beginPath', 'arc', 'fill',
      'set', 'beginPath', 'arc', 'fill',
      'set', 'beginPath', 'arc', 'arc', 'fill',
      'set', 'beginPath', 'arc', 'fill', 'restore',
      'set', 'set', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore',
    ]);
    expect(commands.slice(5, 8)).toEqual([
      ['addColorStop', 0, 0, MALTLINE_VISUAL_THEME.scene.creamDim],
      ['addColorStop', 0, 0.35, '#fdf6e4'],
      ['addColorStop', 0, 1, MALTLINE_VISUAL_THEME.scene.creamDim],
    ]);
    const textIndex = commands.findIndex(([method]) => method === 'fillText');
    expect(commands.slice(textIndex - 4, textIndex + 4)).toEqual([
      ['set', 'fillStyle', '#54301a'],
      ['set', 'font', '800 7px "Maltline UI", system-ui, sans-serif'],
      ['set', 'textAlign', 'center'],
      ['set', 'textBaseline', 'middle'],
      ['fillText', 'V', 0, 0.5],
      ['set', 'textAlign', 'left'],
      ['set', 'textBaseline', 'alphabetic'],
      ['set', 'fillStyle', 'rgba(255, 255, 255, 0.5)'],
    ]);
    expectBalancedState(commands);
  });

  it('adds the outgoing silhouette before the ordinary rotated/scaled cup', () => {
    const { context, commands } = commandRecorder();
    drawMaltlineCup(context, 100, 200, 'strawberry', 1.4, 0.125, true);

    expect(commands.slice(0, 14)).toEqual([
      ['save'],
      ['translate', 100, 200],
      ['rotate', 0.125],
      ['scale', 1.4, 1.4],
      ['set', 'fillStyle', MALTLINE_VISUAL_THEME.outgoingShake.shadow],
      ['beginPath'],
      ['roundRect', -10, -29, 20, 43, 7],
      ['fill'],
      ['set', 'strokeStyle', MALTLINE_VISUAL_THEME.outgoingShake.edge],
      ['set', 'lineWidth', 1.4],
      ['stroke'],
      ['createLinearGradient', 0, -7, 0, 7, 0],
      ['addColorStop', 0, 0, MALTLINE_VISUAL_THEME.scene.creamDim],
      ['addColorStop', 0, 0.35, '#fdf6e4'],
    ]);
    expect(commands).toContainEqual(['fillText', 'S', 0, 0.5]);
    expectBalancedState(commands);
  });

  it.each(['vanilla', 'chocolate', 'strawberry'] as const)(
    'draws direct %s soft serve with exact tiers and theme colors',
    (flavor: FlavorId) => {
      const { context, commands } = commandRecorder();
      drawMaltlineSoftServe(context, 8, 9, flavor, 0.82);

      expect(commands.slice(0, 3)).toEqual([
        ['save'],
        ['translate', 8, 9],
        ['scale', 0.82, 0.82],
      ]);
      expect(commands.filter(([method]) => method === 'arc')).toEqual([
        ['arc', 0, 2, 6.5, 0, Math.PI * 2],
        ['arc', 0, -3, 5, 0, Math.PI * 2],
        ['arc', 0, -7.5, 3.5, 0, Math.PI * 2],
        ['arc', 0, -10.5, 2, 0, Math.PI * 2],
        ['arc', -1.5, -7, 2.2, 0, Math.PI * 2],
        ['arc', -2, 1, 3.4, 0, Math.PI * 2],
        ['arc', 2.5, 0.5, 3.2, 0, Math.PI * 2],
      ]);
      expect(commands.filter(([method, property]) => method === 'set' && property === 'fillStyle'))
        .toEqual([
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].base],
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].base],
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].base],
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].base],
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].light],
          ['set', 'fillStyle', MALTLINE_VISUAL_THEME.flavors[flavor].dark],
        ]);
      expectBalancedState(commands);
    },
  );

  it('keeps ordinary and emphasized jar transcripts distinct and exact', () => {
    const ordinary = commandRecorder();
    drawMaltlineJar(ordinary.context, 10, 20, 0.85);
    const emphasized = commandRecorder();
    drawMaltlineJar(emphasized.context, 10, 20, 1.55, true);

    expect(ordinary.commands.slice(0, 7)).toEqual([
      ['save'],
      ['translate', 10, 20],
      ['scale', 0.85, 0.85],
      ['createLinearGradient', 0, -7, 0, 7, 0],
      ['addColorStop', 0, 0, 'rgba(207, 216, 212, 0.55)'],
      ['addColorStop', 0, 0.4, 'rgba(240, 246, 244, 0.35)'],
      ['addColorStop', 0, 1, 'rgba(180, 196, 190, 0.55)'],
    ]);
    expect(emphasized.commands.slice(0, 12)).toEqual([
      ['save'],
      ['translate', 10, 20],
      ['scale', 1.55, 1.55],
      ['set', 'fillStyle', 'rgba(7, 26, 20, 0.82)'],
      ['beginPath'],
      ['roundRect', -10.5, -16, 21, 31, 7],
      ['fill'],
      ['createLinearGradient', 0, -7, 0, 7, 0],
      ['addColorStop', 0, 0, MALTLINE_VISUAL_THEME.returnJar.body],
      ['addColorStop', 0, 0.4, '#f0f6f4'],
      ['addColorStop', 0, 1, '#b4c4be'],
      ['set', 'fillStyle', 'gradient:0'],
    ]);
    expect(ordinary.commands).toContainEqual(['set', 'lineWidth', 1.4]);
    expect(emphasized.commands).toContainEqual(['set', 'lineWidth', 1.8]);
    expect(ordinary.commands).toContainEqual(['set', 'fillStyle', '#cfd8d4']);
    expect(emphasized.commands).toContainEqual([
      'set', 'fillStyle', MALTLINE_VISUAL_THEME.returnJar.rim,
    ]);
    expectBalancedState(ordinary.commands);
    expectBalancedState(emphasized.commands);
  });

  it('does not overwrite caller globalAlpha around any vessel painter', () => {
    for (const draw of [
      (ctx: CanvasRenderingContext2D) => drawMaltlineSoftServe(ctx, 0, 0, 'vanilla', 1),
      (ctx: CanvasRenderingContext2D) => drawMaltlineCup(ctx, 0, 0, 'chocolate', 1),
      (ctx: CanvasRenderingContext2D) => drawMaltlineJar(ctx, 0, 0, 1, true),
    ]) {
      const { context, commands } = commandRecorder();
      context.globalAlpha = 0.37;
      draw(context);
      expect(context.globalAlpha).toBe(0.37);
      expect(commands.filter((command) => command[0] === 'set' && command[1] === 'globalAlpha'))
        .toEqual([['set', 'globalAlpha', 0.37]]);
      expectBalancedState(commands);
    }
  });
});
