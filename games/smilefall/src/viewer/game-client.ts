/** Smilefall consumes the shared ArcadeBench protocol without a game-local fork. */
export { createArcadeBenchGameClient as createSmilefallGameClient } from '@arcadebench/sdk';
export type {
  ArcadeGameClient as SmilefallGameClient,
  FeedbackSubjectRef as FeedbackSubject,
  FeedbackSummary,
  FeedbackSetRequest,
  NormalizedEntry as NormalizedScoreEntry,
  NormalizedSubmission,
  NormalizedPublication as ScorePublication,
  PublicationRequest as SubmissionPublicationPolicy,
} from '@arcadebench/sdk';

import type { FeedbackSetRequest, NormalizedBoard } from '@arcadebench/sdk';

export type GameVote = FeedbackSetRequest['vote'];
export type GameFilterValue = NormalizedBoard['context'][string];
