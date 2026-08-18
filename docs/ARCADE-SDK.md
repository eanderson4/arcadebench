# ArcadeBench game SDK

`@arcadebench/sdk` is the small public bridge between independent games and
ArcadeBench platform services. It deliberately does not contain a game engine,
renderer, scoring rules, or privileged credential.

Each game owns its complete experience and treats score and replay proof as
opaque game-defined values:

```ts
import { createArcadeBenchClient } from '@arcadebench/sdk';

const arcade = createArcadeBenchClient({
  gameId: 'partition',
  gameVersion: 'dev-0',
});

const run = await arcade.runs.begin({
  boardId: 'level',
  context: { levelId: 'event-horizon', difficulty: 'hard' },
});

await arcade.leaderboards.submit({
  boardId: 'level',
  runId: run.id,
  playerName: 'SPARK',
  score: partitionScore,
  proof: { replays: partitionReplays },
});

await arcade.social.vote({ kind: 'level', id: 'event-horizon' }, 1);
```

The current surface covers:

- `runs.begin` for one-time ranked challenges
- `leaderboards.list` and `leaderboards.submit`
- `replays.publish`, with a five-day default expiry request
- `social.get` and `social.vote` for games and levels

Partition consumes the shared client but retains its local leaderboard fallback
and all validation/ranking logic. The future Cloudflare service must replay and
verify submitted proof; it must never trust scores merely because they came
through the SDK.

The browser client sends same-origin cookies and an SDK version header. It does
not accept or transmit a Cloudflare API token. Platform credentials remain in
the Worker environment and the protected GitHub deployment environment.

Cloud saves and account-backed achievements can be added later without changing
game ownership. Arcade mode intentionally has no saved progression today.
