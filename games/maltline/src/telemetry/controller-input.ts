import { normalizeMaltlineInput } from '../core/input';
import type { MaltlineInput } from '../core/types';

const CONTROLLER_INPUTS: MaltlineInput[] = [];

/** Intern the 36 legal built-in controller outputs after strict normalization. */
export function maltlineControllerInput(
  stationDir: -1 | 0 | 1,
  laneDir: -1 | 0 | 1,
  blend: boolean,
  serve: boolean,
): MaltlineInput {
  if (stationDir !== -1 && stationDir !== 0 && stationDir !== 1) {
    throw new Error('controller input stationDir must be -1, 0, or 1');
  }
  if (laneDir !== -1 && laneDir !== 0 && laneDir !== 1) {
    throw new Error('controller input laneDir must be -1, 0, or 1');
  }
  if (typeof blend !== 'boolean') {
    throw new Error('controller input blend must be a boolean');
  }
  if (typeof serve !== 'boolean') {
    throw new Error('controller input serve must be a boolean');
  }
  const key = (stationDir + 1) * 12
    + (laneDir + 1) * 4
    + Number(blend) * 2
    + Number(serve);
  const cached = CONTROLLER_INPUTS[key];
  if (cached !== undefined) return cached;
  const input = normalizeMaltlineInput({ stationDir, laneDir, blend, serve }) as MaltlineInput;
  CONTROLLER_INPUTS[key] = input;
  return input;
}
