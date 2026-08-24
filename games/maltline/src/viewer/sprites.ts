/**
 * Maltline sprite pack: hand-authored pixel art as character grids over a
 * fixed palette. Sprites are rasterized once to offscreen canvases at load
 * and drawn with nearest-neighbor scaling. Customer variants reuse the same
 * grids with remapped shirt/hair colors.
 */

export const SPRITE_SCALE = 3;

const PALETTE: Record<string, string> = {
  '.': 'transparent',
  b: '#101614', // soft black outline
  o: '#1a1611', // outline brown-black
  c: '#f3e9d2', // cream
  C: '#d9c8a6', // cream shade
  f: '#fff8ea', // foam white
  g: '#1c6a50', // shack green
  G: '#12503e', // deep green
  m: '#9fc4b2', // mint highlight
  w: '#8a5a33', // wood
  W: '#6b4426', // wood dark
  k: '#cfd8d4', // steel
  K: '#8fa39c', // steel shade
  s: '#e9c39b', // skin
  S: '#caa27a', // skin shade
  p: '#f0b49a', // skin warm
  n: '#4a3520', // hair brown
  r: '#f28cb4', // strawberry
  R: '#c9557f', // strawberry dark
  v: '#f6e7c9', // vanilla
  V: '#d6b98a', // vanilla shade
  h: '#7a4a24', // chocolate
  H: '#54301a', // chocolate dark
  e: '#ff6b5e', // danger red
  y: '#ffd76b', // bulb yellow
};

export type FlavorKey = 'vanilla' | 'chocolate' | 'strawberry';

/** Remap entries applied on top of PALETTE for customer variants. */
export interface Variant {
  shirt?: string;
  shirtShade?: string;
  hair?: string;
}

const CUSTOMER_GRID = [
  '....nnnn....',
  '...nnnnnn...',
  '...nssssn...',
  '...bsbbsb...',
  '...ssssss...',
  '....Csss....',
  '..xxxxxxxx..',
  '.sxxxxxxxxs.',
  '.sxxxxxxxxx.',
  '.SxxXxxxxxS.',
  '..xxXxxxxx..',
  '..xxXxxxxx..',
  '..xxxxxxxx..',
  '...CxxxxC...',
  '...oo..oo...',
  '...oo..oo...',
  '..bbo..obb..',
  '..bb....bb..',
];

const PLAYER_GRID = [
  '...gggggg...',
  '..gggggggg..',
  '.gggggggggg.',
  '....ssss....',
  '...bsbbsb...',
  '...ssssss...',
  '....Csss....',
  '..cccccccc..',
  '.sccggggccs.',
  '.sccggggccs.',
  '.ScggggggcS.',
  '..cggggggc..',
  '..cggggggc..',
  '..cccccccc..',
  '...Cccccc...',
  '...oo..oo...',
  '...oo..oo...',
  '..bbo..obb..',
];

const CUP_GRIDS: Record<FlavorKey, string[]> = {
  vanilla: [
    '....er..',
    '...eeer.',
    '..FFEF..',
    '.FFEFFE.',
    '.vvvvvv.',
    '.cvvvvc.',
    '.cvvvvc.',
    '.cVvvVc.',
    '.cVvvVc.',
    '.cVvvVc.',
    '..cVVc..',
    '..cVVc..',
    '...cc...',
  ],
  chocolate: [
    '....er..',
    '...eeer.',
    '..FFEF..',
    '.FFEFFE.',
    '.hhhhhh.',
    '.chhhhc.',
    '.chhhhc.',
    '.cHhhHc.',
    '.cHhhHc.',
    '.cHhhHc.',
    '..cHHc..',
    '..cHHc..',
    '...cc...',
  ],
  strawberry: [
    '....er..',
    '...eeer.',
    '..FFEF..',
    '.FFEFFE.',
    '.rrrrrr.',
    '.crrrrc.',
    '.crrrrc.',
    '.cRrrRc.',
    '.cRrrRc.',
    '.cRrrRc.',
    '..cRRc..',
    '..cRRc..',
    '...cc...',
  ],
};

// Extra palette entries used by cup art (foam swirl).
PALETTE.E = '#fbe9d0';
PALETTE.F = '#fff8ea';

const JAR_GRID = [
  '.kkkkkk.',
  '.k....k.',
  '.k.f..k.',
  '.k.f..k.',
  '.k....k.',
  '.k....k.',
  '.k....k.',
  '.k....k.',
  '.k....k.',
  '..kkkk..',
  '..kKKk..',
];

const STATION_GRID = [
  '..GGGGGGGGGGGGGG..',
  '..GggggggggggggG..',
  '..GgkkgkkgkkgkgG..',
  '..GggggggggggggG..',
  '..GGGGGGGGGGGGG...',
  '...k.k.k.k.k.k....',
  '.kkkkkkkkkkkkkkkk.',
  '.kQQQQQQQQQQQQQQk.',
  '.kQff..........Qk.',
  '.kQf...........Qk.',
  '.kQ............Qk.',
  '.kQ............Qk.',
  '.kQ............Qk.',
  '.kQ............Qk.',
  '.kQQQQQQQQQQQQQQk.',
  '.kkkkkkkkkkkkkkkk.',
  '....kk......kk....',
  '...kkkk....kkkk...',
];

PALETTE.Q = '#bcd3cc'; // glass tint

const DOOR_GRID = [
  '..CCCCCCCCCC..',
  '..CwwwwwwwwC..',
  '..CwWWWWWWwC..',
  '..CwWvvvvWwC..',
  '..CwWvvvvWwC..',
  '..CwWvvvvWwC..',
  '..CwWWWWWWwC..',
  '..CwWvvvvWwC..',
  '..CwWvvvvWwC..',
  '..CwWWWWWWwC..',
  '..CwwwwwwwwC..',
  '..CwwwwwwwwC..',
  '..CwwwwwwwwC..',
  '..CwwwwwwwwC..',
  '..CwwwwwwwwC..',
  '..CwwwwwwwwC..',
  '.CCwwwwwwwwCC.',
  '.CCwwwwwwwwCC.',
  '.bbbbbbbbbbbb.',
];

const MINI_CUP_GRIDS: Record<FlavorKey, string[]> = {
  vanilla: ['..v..', '..v..', '.vvv.', '.cvc.', '.cvc.', '..c..'],
  chocolate: ['..h..', '..h..', '.hhh.', '.chc.', '.chc.', '..c..'],
  strawberry: ['..r..', '..r..', '.rrr.', '.crc.', '.crc.', '..c..'],
};

export type SpriteName =
  | 'player'
  | 'customer'
  | 'jar'
  | 'station'
  | 'door'
  | `cup-${FlavorKey}`
  | `mini-${FlavorKey}`;

const GRIDS: Record<string, string[]> = {
  player: PLAYER_GRID,
  customer: CUSTOMER_GRID,
  jar: JAR_GRID,
  station: STATION_GRID,
  door: DOOR_GRID,
  'cup-vanilla': CUP_GRIDS.vanilla,
  'cup-chocolate': CUP_GRIDS.chocolate,
  'cup-strawberry': CUP_GRIDS.strawberry,
  'mini-vanilla': MINI_CUP_GRIDS.vanilla,
  'mini-chocolate': MINI_CUP_GRIDS.chocolate,
  'mini-strawberry': MINI_CUP_GRIDS.strawberry,
};

const cache = new Map<string, HTMLCanvasElement>();

function variantKey(name: string, variant?: Variant): string {
  if (!variant) return name;
  const parts = [];
  if (variant.shirt) parts.push(variant.shirt);
  if (variant.shirtShade) parts.push(variant.shirtShade);
  if (variant.hair) parts.push(variant.hair);
  return `${name}|${parts.join('>')}`;
}

/**
 * Builds (once) and returns the rasterized sprite canvas. Pixels are 1:1;
 * draw with `SPRITE_SCALE` (or 2 for HUD/mini art) and smoothing off.
 */
export function getSprite(name: SpriteName, variant?: Variant): HTMLCanvasElement {
  const key = variantKey(name, variant);
  const cached = cache.get(key);
  if (cached) return cached;

  const grid = GRIDS[name]!;
  const height = grid.length;
  const width = Math.max(...grid.map((row) => row.length));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const overrides: Record<string, string> = {};
  if (variant?.shirt) overrides.x = variant.shirt;
  if (variant?.shirtShade) overrides.X = variant.shirtShade;
  if (variant?.hair) overrides.n = variant.hair;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const char = grid[y]![x]!;
      if (char === '.') continue;
      ctx.fillStyle = overrides[char] ?? PALETTE[char] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  cache.set(key, canvas);
  return canvas;
}

export function spriteSize(name: SpriteName): { width: number; height: number } {
  const grid = GRIDS[name]!;
  return {
    width: Math.max(...grid.map((row) => row.length)) * SPRITE_SCALE,
    height: grid.length * SPRITE_SCALE,
  };
}

/** Stable customer look from the customer id: shirt and hair pairing. */
const SHIRTS: Array<[string, string]> = [
  ['#e8b04b', '#c58a2d'],
  ['#d97742', '#b25a2e'],
  ['#8f7fb8', '#6d5f96'],
  ['#5f9ea0', '#467c7e'],
  ['#b85f75', '#96475c'],
  ['#7f9e5f', '#62804a'],
];
const HAIRS = ['#2b1d12', '#4a3520', '#6b6b6b', '#1d2b12', '#513045'];

export function customerVariant(id: number): Variant {
  return {
    shirt: SHIRTS[id % SHIRTS.length]![0],
    shirtShade: SHIRTS[id % SHIRTS.length]![1],
    hair: HAIRS[(id * 3) % HAIRS.length]!,
  };
}
