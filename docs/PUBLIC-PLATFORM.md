# Public platform services

ArcadeBench should feel accountless by default. Games remain independent and
consume the public `@arcadebench/sdk` in the same way a mobile game consumes a
platform service for leaderboards or social state.

The production implementation lives in `apps/platform`. Cloudflare D1 owns
seasons, one-time challenges, scores, votes, replay metadata, moderation cache,
and exact per-session rate windows. R2 owns immutable replay/proof bytes.
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
5. The server hashes the accepted replay for deduplication and immutable proof
   identity, then consumes the challenge.

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

Games and levels share the same `social.vote` contract. An anonymous session can
set one value (`-1`, `0`, or `1`) per subject, with server-side rate limits and
idempotent updates. Anonymous votes are inherently susceptible to determined
Sybil abuse, so discovery should rank by a confidence-weighted score and retain
the ability to quarantine suspicious bursts rather than treating raw totals as
ground truth.

The catalog can use this signal for community favorites and candidate benchmark
fields. Curated benchmark collections remain versioned editorial artifacts,
not an automatic consequence of vote count.
