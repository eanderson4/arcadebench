/** Partition consumes the shared SDK directly; this file only gives its types local names. */
export {
  createArcadeBenchGameClient as createPartitionGameClient,
} from '@arcadebench/sdk';
export type {
  ArcadeBenchGameClientOptions as GameClientOptions,
  ArcadeGameClient as PartitionGameClient,
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
