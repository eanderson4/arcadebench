import type { MaltlineInput } from './types';

export const MALTLINE_INPUT_KEYS = Object.freeze([
  'stationDir',
  'laneDir',
  'blend',
  'serve',
] as const);

const NORMALIZED_INPUTS = new WeakSet<object>();

/**
 * Validate and defensively copy the complete per-tick input boundary.
 * Accessors are rejected from their descriptors and are never invoked.
 */
export function normalizeMaltlineInput(
  value: unknown,
  label = 'Maltline input',
): Readonly<MaltlineInput> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (NORMALIZED_INPUTS.has(value)) return value as Readonly<MaltlineInput>;

  const keys = Reflect.ownKeys(value);
  if (keys.length !== MALTLINE_INPUT_KEYS.length
    || keys.some((key) => key !== 'stationDir'
      && key !== 'laneDir'
      && key !== 'blend'
      && key !== 'serve')) {
    throw new Error(`${label} must contain exactly: ${MALTLINE_INPUT_KEYS.join(', ')}`);
  }

  const stationDir = dataProperty(value, 'stationDir', label);
  const laneDir = dataProperty(value, 'laneDir', label);
  const blend = dataProperty(value, 'blend', label);
  const serve = dataProperty(value, 'serve', label);

  if (typeof stationDir !== 'number'
    || (stationDir !== -1 && stationDir !== 0 && stationDir !== 1)) {
    throw new Error(`${label}.stationDir must be -1, 0, or 1`);
  }
  if (typeof laneDir !== 'number' || (laneDir !== -1 && laneDir !== 0 && laneDir !== 1)) {
    throw new Error(`${label}.laneDir must be -1, 0, or 1`);
  }
  if (typeof blend !== 'boolean' || typeof serve !== 'boolean') {
    throw new Error(`${label} actions must be booleans`);
  }

  const normalized = Object.freeze({
    stationDir: stationDir === 0 ? 0 : stationDir,
    laneDir: laneDir === 0 ? 0 : laneDir,
    blend,
    serve,
  }) as Readonly<MaltlineInput>;
  NORMALIZED_INPUTS.add(normalized);
  return normalized;
}

function dataProperty(
  value: object,
  key: (typeof MALTLINE_INPUT_KEYS)[number],
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new Error(`${label}.${key} must be an enumerable data property`);
  }
  return descriptor.value;
}
