import { FIXED_SCALE } from '../core/constants';
import type { RollSignalCourse, RollSignalInput, RollSignalState } from '../core/types';

export interface RollSignalReferenceController {
  input(state: RollSignalState): RollSignalInput;
  waypointIndex(): number;
}

function axisControl(delta: number, velocity: number): -1 | 0 | 1 {
  if (Math.abs(delta) < 280) {
    if (Math.abs(velocity) < 8) return 0;
    return velocity > 0 ? -1 : 1;
  }
  const toward = delta > 0 ? 1 : -1;
  if (velocity !== 0 && Math.sign(velocity) !== toward) return toward;
  const stoppingDistance = Math.trunc((velocity * velocity) / 14);
  if (Math.abs(delta) < stoppingDistance + 350) return velocity > 0 ? -1 : 1;
  return toward;
}

/** A small deterministic autopilot used as an authored-course solvability proof. */
export function createReferenceController(course: RollSignalCourse): RollSignalReferenceController {
  let index = 0;
  return {
    input(state): RollSignalInput {
      while (index < course.referenceWaypoints.length - 1) {
        const target = course.referenceWaypoints[index]!;
        const dx = target.x * FIXED_SCALE - state.position.x;
        const dy = target.y * FIXED_SCALE - state.position.y;
        if (dx * dx + dy * dy > 650 * 650) break;
        index++;
      }
      const target = course.referenceWaypoints[Math.min(index, course.referenceWaypoints.length - 1)]!;
      const dx = Math.round(target.x * FIXED_SCALE) - state.position.x;
      const dy = Math.round(target.y * FIXED_SCALE) - state.position.y;
      const speed = Math.trunc(Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2));
      const distance = Math.trunc(Math.sqrt(dx * dx + dy * dy));
      return {
        steerX: axisControl(dx, state.velocity.x),
        steerY: axisControl(dy, state.velocity.y),
        brace: distance < 2_700 || speed > 172,
      };
    },
    waypointIndex: () => index,
  };
}
