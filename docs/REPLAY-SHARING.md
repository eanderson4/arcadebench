# Replay sharing contract

Human and model runs produce the same validated JSON artifact locally. A full
replay is uploaded only when a ranked score is submitted for verification or a
user explicitly chooses to share it.

## HTTP surface

The viewer should depend on this small storage-neutral API:

```text
POST /api/v1/games/partition/replays
Content-Type: application/json

{
  "gameVersion": "0.1.0",
  "replay": "<game replay artifact>",
  "expiresInDays": 5
}

201 Created
{
  "id": "p_7M4K2Q9D",
  "gameId": "partition",
  "url": "/r/replay_7M4K2Q9D",
  "replayUrl": "/api/v1/games/partition/replays/replay_7M4K2Q9D",
  "expiresAt": "..."
}

GET /api/v1/games/partition/replays/:id
GET /r/:id
```

The publish handler must validate the replay schema, enforce a payload limit,
re-simulate it to the claimed final state, canonicalize it, and hash the exact
stored bytes. Re-publishing identical bytes may return the existing object.
Published objects are immutable; edits create a new ID.

The viewer route resolves to Replay Lab with `replayUrl` and the requested tick.
This keeps the browser independent of the storage vendor and makes shared links
work for human attempts, model runs, races, and future games.

## Cloudflare deployment shape

A Cloudflare Worker can implement the API with an R2 binding:

- Store opt-in share bytes in R2 under immutable short-ID keys below `shares/`.
- Apply five-day bucket lifecycle rules to both `shares/` and `proofs/`.
  Leaderboard proofs are temporary; only the score summary and proof hash
  remain after deletion.
- Use a short random public ID rather than exposing the content hash directly.
- Store the ID-to-object mapping and small mutable fields such as owner,
  visibility, moderation state, title, and view count in KV or another metadata
  store. KV is optional if the public ID itself is the R2 object key.
- Return short public cache headers and an ETag for replay payloads. Access ends
  at the recorded expiry even if provider lifecycle cleanup is still settling.

Upload protection belongs at the Worker boundary: rate limits, content length,
allowed protocol generations, replay verification, abuse reporting, and a
delete/takedown path. Private benchmark suites must never be accepted by the
public publisher.

## Client adapter

The eventual browser adapter only needs two operations:

```ts
interface ReplayPublisher<Replay> {
  publish(replay: Replay): Promise<{ id: string; viewerUrl: string }>;
  load(id: string): Promise<Replay>;
}
```

Local development can provide an in-memory or filesystem adapter. Production
can use Cloudflare, S3-compatible storage, or any service implementing the same
HTTP surface.
