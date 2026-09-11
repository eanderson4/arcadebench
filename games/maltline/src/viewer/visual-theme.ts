import type { FlavorId } from '../core/types';

/**
 * Stable identity for the player-facing canvas treatment.
 *
 * Increment this only when a reviewed visual-direction change intentionally
 * replaces Maltline's established palette or entity language. Layout and
 * animation timings remain owned by their painters until those boundaries are
 * extracted independently.
 */
export const MALTLINE_VISUAL_DIRECTION_ID = 'counter-after-dark-v1' as const;

export interface MaltlineFlavorArt {
  readonly base: string;
  readonly dark: string;
  readonly light: string;
  readonly glow: string;
}

type ColorPair = readonly [light: string, dark: string];

function frozenPairs<const T extends readonly ColorPair[]>(pairs: T): T {
  for (const pair of pairs) Object.freeze(pair);
  return Object.freeze(pairs);
}

const scene = Object.freeze({
  wallTop: '#0e3a2c',
  wallBottom: '#07211a',
  wood: '#8a5a33',
  woodLight: '#b07a44',
  woodDark: '#5d3a20',
  cream: '#f3e9d2',
  creamDim: '#d9c8a6',
  brass: '#c9a961',
  brassDark: '#8a6f3a',
  ink: '#122822',
  steamPrefix: 'rgba(246, 231, 201,',
});

const flavorCues = Object.freeze({
  vanilla: 'V',
  chocolate: 'C',
  strawberry: 'S',
} satisfies Record<FlavorId, string>);

const flavors = Object.freeze({
  vanilla: Object.freeze({ base: '#f6e7c9', dark: '#d6b98a', light: '#fff8ea', glow: '#ffe9b8' }),
  chocolate: Object.freeze({ base: '#7a4a24', dark: '#54301a', light: '#a06a38', glow: '#c98a4a' }),
  strawberry: Object.freeze({ base: '#f28cb4', dark: '#c9557f', light: '#ffb3d0', glow: '#ff9ec4' }),
} satisfies Record<FlavorId, MaltlineFlavorArt>);

const customers = Object.freeze({
  shirts: frozenPairs([
    ['#e8b04b', '#c58a2d'],
    ['#d97742', '#b25a2e'],
    ['#8f7fb8', '#6d5f96'],
    ['#5f9ea0', '#467c7e'],
    ['#b85f75', '#96475c'],
    ['#7f9e5f', '#62804a'],
    ['#5b8bd0', '#43699f'],
  ] as const),
  hair: frozenPairs([
    ['#2b1d12', '#46301c'],
    ['#6b4726', '#8a5f36'],
    ['#1d2b12', '#33471f'],
    ['#513045', '#6f4460'],
    ['#3a3f44', '#565c63'],
  ] as const),
  skin: frozenPairs([
    ['#f0c8a0', '#d8a878'],
    ['#e9c39b', '#caa27a'],
    ['#c98e5f', '#a86f47'],
    ['#8d5a3a', '#6f452c'],
  ] as const),
});

const feedback = Object.freeze({
  ready: '#7dffa8',
  blending: '#ffd76b',
  blocked: '#ffb36b',
  urgent: '#ff6b5e',
  walkout: '#ff8b73',
  shakeMiss: '#ffd06f',
  returnMiss: '#dbe9e4',
  washing: '#9fd5ee',
});

const returnJar = Object.freeze({
  body: '#d7e8e2',
  edge: '#f3fff9',
  rim: '#dbe9e4',
  trail: '#9fd5ee',
  shadow: '#071a14',
});

const customerOrder = Object.freeze({
  ticketPanel: '#0a1c15',
  ticketKeyline: '#f3e9d2',
  ticketConnector: '#d9c8a6',
  silhouetteKeyline: '#071a14',
});

const outgoingShake = Object.freeze({
  edge: '#fff8ea',
  trail: '#ffe08a',
  shadow: '#071a14',
});

const station = Object.freeze({
  statusPanel: '#05140e',
  statusText: '#f3e9d2',
  selectedKeyline: '#f3e9d2',
  selectedTab: '#071a14',
  processing: '#ffd76b',
  blocked: '#ffb36b',
  quietIndicator: '#9fc4b2',
  progressTrack: '#122822',
  ready: '#7dffa8',
});

/**
 * Frozen semantic tokens shared by production painters and visual evidence.
 * Keeping fixture identity checks on this object prevents an art repaint from
 * silently invalidating the regions those checks are meant to recognize.
 */
export const MALTLINE_VISUAL_THEME = Object.freeze({
  directionId: MALTLINE_VISUAL_DIRECTION_ID,
  scene,
  flavorCues,
  flavors,
  customers,
  feedback,
  returnJar,
  customerOrder,
  outgoingShake,
  station,
});
