import type { RollSignalCourse } from '../core/types';

export type RollSignalMechanic =
  | 'momentum'
  | 'brace'
  | 'rails'
  | 'checkpoints'
  | 'switchbacks'
  | 'slick'
  | 'wind'
  | 'conveyor'
  | 'moving-obstacles'
  | 'relay-gates';

export interface CourseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CatalogValidationResult extends CourseValidationResult {
  courseResults: Record<string, CourseValidationResult>;
}

export interface RollSignalCourseMetadata {
  mechanics: readonly RollSignalMechanic[];
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface AuthoredRollSignalCourse extends RollSignalCourse {
  metadata: RollSignalCourseMetadata;
}
