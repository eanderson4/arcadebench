# Partition leaderboard contract

Partition exposes two human-play scoreboards:

- **Arcade run** — deepest stage reached, completed-run status, elapsed
  simulation time, then partition count.
- **Individual field** — completed attempts first, elapsed simulation time,
  partition count, and stabilized fraction. Incomplete attempts rank by
  stabilized fraction before time.

Difficulty presets are separate boards. A score recorded on Easy never ranks
against Medium, Hard, or Impossible.

Production uses the same-origin ArcadeBench API automatically. Local Vite
development uses local storage and labels the board **Local preview · this
device** unless `VITE_ARCADEBENCH_API_URL=/api/v1` points it at a Worker dev
server. `VITE_ARCADEBENCH_API_URL=local` explicitly forces the local adapter.

## Public HTTP surface

The shared client uses:

```text
POST /api/v1/games/partition/runs
GET /api/v1/games/partition/leaderboards/arcade?filter.difficulty=medium&limit=25
GET /api/v1/games/partition/leaderboards/level?filter.difficulty=hard&filter.levelId=archipelago&limit=25

POST /api/v1/games/partition/leaderboards/arcade
Content-Type: application/json

{
  "gameVersion": "0.1.0",
  "runId": "run_...",
  "playerName": "SPARK PILOT",
  "score": { "scope": "arcade", "difficulty": "medium", "...": "..." },
  "proof": { "replays": ["<Partition replay objects>"] }
}
```

Successful reads return `{ "entries": [...] }`. A successful write returns
`{ "entry": {...} }`. Rejections return a non-2xx status and
`{ "error": "public-safe explanation" }`.

The submitted `score` is a display hint, not authority. The server must:

1. Apply request-size, origin, and rate limits.
2. Parse every replay with the supported generation schema.
3. Re-simulate every tick and require the recorded final state to match.
4. Require the authored stage IDs, order, seed policy, and difficulty preset.
5. Derive stages reached/cleared, elapsed ticks, stabilized fraction, and
   `trace_completed` partition count from those verified replays.
6. Compare the derived score with the hint and store only the derived values.
7. Store the replay proof in R2 for five days and its hash beside the permanent
   score summary. Delete the full proof automatically after expiry.

Ordered/filterable score queries fit Cloudflare D1 better than KV. R2 is a good
fit for replay bytes. KV can still cache small top-score responses.

## Callsign moderation

The browser performs immediate normalization and rejects empty, overlong,
link-like, unsupported-character, and known unsafe names. This improves the
form experience but is not a security boundary.

The write handler repeats those deterministic checks. A small language model
can then classify names that pass them using a strict single-category result.
The server derives allow/reject from that category so the model cannot return
contradictory fields:

```json
{
  "category": "hate"
}
```

The review prompt should ask only whether the short callsign is suitable for a
general-audience public arcade. It should detect spacing/character evasions,
hateful or sexual language, targeted harassment, impersonation, and personal
information. The model never decides or receives score values. Reject on an
invalid model response, keep a hashed audit record, expose a takedown path, and
allow names to be re-reviewed when moderation policy changes.

An LLM review reduces obvious abuse but does not replace rate limits, reporting,
manual takedowns, or a server-side denylist.

## Minimal relational shape

```sql
CREATE TABLE partition_scores (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('arcade', 'level')),
  player_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  level_id TEXT,
  level_number INTEGER,
  stage_reached INTEGER,
  stages_cleared INTEGER,
  completed INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  partitions INTEGER NOT NULL,
  captured_fraction REAL,
  replay_object_key TEXT NOT NULL,
  proof_sha256 TEXT NOT NULL,
  proof_expires_at TEXT NOT NULL,
  proof_deleted_at TEXT,
  moderation_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX partition_arcade_rank
  ON partition_scores (difficulty, stage_reached DESC, completed DESC, elapsed_ms ASC)
  WHERE scope = 'arcade' AND moderation_state = 'approved';

CREATE INDEX partition_level_rank
  ON partition_scores (difficulty, level_id, completed DESC, elapsed_ms ASC)
  WHERE scope = 'level' AND moderation_state = 'approved';
```
