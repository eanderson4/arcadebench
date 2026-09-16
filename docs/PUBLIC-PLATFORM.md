# Public platform services

ArcadeBench should feel accountless by default. Games remain independent and
consume the public `@arcadebench/sdk` in the same way a mobile game consumes a
platform service for leaderboards or social state.

The production implementation lives in `apps/platform`. Cloudflare D1 owns
seasons, one-time challenges, scores, votes, replay metadata, moderation cache,
and exact per-session rate windows. Shared tables own authoritative entries,
rank snapshots, activity, and private feedback. R2 holds temporary proofs and
private qualifying archives. See [SDK integration](ARCADE-SDK.md).
Workers AI reviews callsign cache misses. Cloudflare's edge rate-limit binding
adds a fast outer guard; D1 remains the exact per-session limit.

## Anonymous sessions and verified scores

The browser receives a short-lived, signed, HttpOnly anonymous session cookie.
Starting a ranked attempt asks the platform for a one-time run challenge bound
to the game version, board, seed, difficulty, and expiry. On submission:

1. The game sends the run identifier, callsign, claimed result, and replay.
2. The server checks that the challenge is unused and unexpired.
3. A game-owned verifier rebuilds the authored scenario from the bound seed and
   deterministically replays the input stream.
4. The server computes the canonical score and ignores conflicting client
   totals.
5. The server hashes the accepted replay for immutable proof identity, stores
   a pending private object, then atomically consumes the challenge and records
   eligibility, rank, retention, and any qualifying activity event. New Top 50
   proofs are retained privately; other proofs expire after five days. Public
   score summaries and proof hashes remain after ordinary proof deletion.

A SHA-256 digest detects changed bytes but does not prove an honest client: a
client that fabricates data can also calculate a new digest. The one-time
challenge and server-side replay verification provide the meaningful checks.
No-login play also cannot prove that a player is human; human and model boards
must describe what evidence they verify instead of claiming impossible identity
assurance.

Partition velocities are quantized at the game-protocol boundary because
ECMAScript permits tiny cross-runtime differences in transcendental functions.
This keeps authored browser and edge scenarios byte-stable without changing
fixed-point engine physics.

## Privacy and retention

ArcadeBench does not use gameplay, replays, prompts, or controller artifacts to
train AI. New-policy Top 50 proofs remain private without scheduled expiration,
even after displacement. Social-media use requires separate per-run consent.
Other proofs and explicit shared replay links expire after five days; legacy
submissions retain their old deadlines. Scheduled cleanup handles temporary
archives and private notes; R2 lifecycle also covers legacy expiring prefixes. The
[plain-language privacy promise](PRIVACY.md) is part of the production contract.

## Callsign moderation

No submitted name appears publicly before moderation.

1. Normalize Unicode with NFKC, enforce length/character rules, reject links,
   controls, invisibles, obvious banned terms, and common leetspeak locally.
2. Hash the normalized moderation input together with the moderation-policy
   version and check the Cloudflare cache.
3. On a cache miss, ask a small fast model for a strict allow/reject result and
   reason code. Reject malformed or uncertain model output.
4. Cache the decision. Accepted display names are stored with scores; rejected
   raw strings need not be retained.
5. Rate-limit attempts per anonymous session and network to prevent probing and
   moderation-cost abuse.

Local checks are a fast user experience and cost filter. The Worker repeats
them and owns the authoritative model decision; a modified browser cannot skip
moderation.

## Votes and discovery

Games register subject kinds/IDs and named feedback channels through the v2
`feedback.get/set` contract. An anonymous session can set one value (`-1`, `0`,
or `1`) per subject/channel, with server-side rate limits and idempotent updates.
An optional private operator note expires 90 days after its last explicit
update; vote-only updates preserve its deadline. Own-note reads are session-bound
and no-store. No public comments are exposed. The v1 Partition vote API remains
a compatibility view over the same default-channel votes. Anonymous votes are inherently susceptible to determined
Sybil abuse, so discovery should rank by a confidence-weighted score and retain
the ability to quarantine suspicious bursts rather than treating raw totals as
ground truth.

The catalog can use this signal for community favorites and candidate benchmark
fields. Curated benchmark collections remain versioned editorial artifacts,
not an automatic consequence of vote count.
