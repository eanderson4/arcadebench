# ArcadeBench game SDK

`@arcadebench/sdk` provides a versioned, same-origin interface to shared
leaderboards, private replay retention, and community feedback. It contains no
credentials or game engine. Games keep their own rendering and scoring rules;
the platform verifies proofs through registered server adapters and owns ranking.

## Game client (v2)

```ts
import { createArcadeBenchGameClient } from '@arcadebench/sdk';

const arcade = createArcadeBenchGameClient({
  gameId: 'partition',
  gameVersion: '0.1.0', // use the game's exported version constant
});
const run = await arcade.runs.begin({
  boardId: 'level',
  context: { levelId: 'event-horizon', difficulty: 'hard' },
});
const submitted = await arcade.leaderboards.submit({
  boardId: 'level',
  runId: run.id,
  playerName: 'SPARK',
  score: partitionScore,
  proof: { replays: partitionReplays },
  publication: { policyVersion: 'top50-social-v1', socialMedia: false },
});
// submitted.entry contains identity, board metadata, and the verified result.
// submitted.publication contains rankAtSubmission, replaySaved, and expiresAt.

const feedback = await arcade.feedback.set({
  subject: { kind: 'level', id: 'event-horizon' },
  channel: 'overall',
  vote: 1,
  note: 'The final corner felt too tight.',
});
```

The Privacy Promise explains replay retention: a replay qualifying for its
board's Top 50 is kept privately even after displacement, while other new
proofs expire after five days. Game score forms stay concise. The social
checkbox starts unchecked for every run and affects only permission to publish
social-media clips. It never affects ranking, retention, or the public activity
event. There is no training permission.

`leaderboards.list<NormalizedEntry<MyResult>>({boardId, filters, limit, cursor})`
returns normalized entries. Context/filter values are strings; each adapter
registers accepted keys and validates their values. Omitted list limit is 25;
the server caps it at 50. Begin a challenge before ranked gameplay; late or
expired challenges cannot upgrade an unranked run.

Feedback subjects and channels are game-owned and registered on the server.
Votes are -1, 0 (clear), or +1. An omitted note preserves the existing note and
its expiry; empty text clears it. A note update starts a 90-day deadline. Notes
are private to maintainers and the originating anonymous session; public
aggregates expose only counts. There is no public comment system. Clearing the
browser's cookie loses access to that session's feedback.

`replays.publish` is an optional adapter capability for explicitly shared replay
links with a five-day lifetime. It does not expose private leaderboard archives.
Maltline currently supports ranked proof submission, not this sharing capability.

## Platform client

```ts
import { createArcadeBenchPlatformClient } from '@arcadebench/sdk';
const platform = createArcadeBenchPlatformClient();
const page = await platform.activity.list({ limit: 8 });
```

One session-free `/api/v2/activity` read returns new verified Top 50 events across
registered games. Display metadata and leaderboard links come from the server;
the homepage does not merge separate game leaderboards. Historical scores count
in ranking but are not presented as new activity. Event placement is the rank
when submitted, not a claim about current placement.

Scoring or gameplay changes that affect comparability must open a new
leaderboard version. The completed version closes to submissions and remains
available as a read-only historical board with its final standings. See the
[leaderboard versioning policy](LEADERBOARD-VERSIONING.md).

Games may also open a fresh season without changing rules. ArcadeBench's
default for a main arcade board is monthly once scheduled rollover is enabled;
specialized boards can use a longer cadence. Clients read the active season
from the server and never manufacture season IDs.

## Adding a game

Implement `GameAdapter` in `apps/platform/src/shared/types.ts`, register it in
`shared/registry.ts`, and seed a versioned season. The adapter defines board
contexts, replay verification, immutable authority, ascending numeric rank
components, challenges, and optional feedback subjects. Common transactions own
eligibility, rank snapshots, publication, events, and replay cleanup. Partition's
legacy score projection is a compatibility bridge; new games use the common
entry insertion helper directly. Maltline's `cabinet-2` adapter is an example.

The original `createArcadeBenchClient` remains available for v1 callers. New
integrations use the v2 factories; v1 submission does not silently opt into the
new retention policy. See [ecosystem architecture](PLATFORM-ECOSYSTEM-PLAN.md)
and [release plan](PLATFORM-RELEASE-PLAN.md).

## Browser-local player page (planned)

A future “Your arcade” page can show games played and references to public
scores from local storage. It must clearly say it is browser-local, offer a
clear-data action, and never treat storage as authoritative identity or score
proof. Accounts, cloud saves, and cross-device identity are outside this release.
