export type Rng = () => number;

/** Stable identity for the deterministic generator used by ranked simulation. */
export const MALTLINE_RNG_ID = 'mulberry32' as const;
export const MALTLINE_RNG_VERSION = 1 as const;

export function mulberry32(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
