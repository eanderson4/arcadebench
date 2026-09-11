# Maltline ranked edge admission

Date: 2026-09-11

Status: the in-Worker admission layer is implemented and locally verified.
Public ranked launch still requires the deployment checks and capacity run below.

## What this layer guarantees

Every supported Maltline API route is classified before anonymous-session
creation. Unsupported methods, unknown routes, and cross-origin writes fail
before consuming an admission token. The supported routes then use these
independent key classes through the required
`MALTLINE_ADMISSION_RATE_LIMITER` binding:

| Key class | Routes | Work protected |
| --- | --- | --- |
| `ranked-write` | `POST /runs`, `POST /leaderboards/arcade` | Session insertion, request-body reads, challenge lookup, proof execution, moderation, score writes, and proof retention |
| `board-read` | `GET /leaderboards/arcade` | Season and leaderboard D1 reads |
| `proof-read` | `GET`/`HEAD /replays/:scoreId` | Score lookup, R2 read/materialization, UTF-8 sizing, and SHA-256 integrity verification |

The production binding target is 60 calls per 60 seconds for each HMAC-derived
network/key-class pair. `GET` and `HEAD` proof requests share one class, as do
run creation and score submission. Because Cloudflare Rate Limiting bindings
are permissive, eventually consistent, and scoped to the serving Cloudflare
location, 60 is an operating target rather than an exact global maximum. The
existing per-session Rate Limiting binding and atomic D1 minute windows remain
secondary controls.

Admission rejection is `429`, `Cache-Control: no-store`, and `Retry-After: 60`.
No anonymous cookie is issued. A missing binding, binding fault, weak/missing
key secret, or unavailable trusted network address fails closed with `503`.
Every HEAD error is bodyless while retaining the same status and headers as its
GET counterpart.

## Identity and privacy boundary

Direct Cloudflare ingress supplies `CF-Connecting-IP`. Maltline validates its
bounded address-shaped form, lowercases it, and HMACs it with the deployment's
cookie-signing secret before it reaches the limiter. Raw network addresses are
not placed in limiter keys, application storage, responses, or logs.

This is intentionally coarse abuse control, not player identity:

- A household, school, office, carrier NAT, or privacy relay can share a
  counter, so the ceiling must remain tolerant and be tuned from observed
  traffic.
- Address changes and distributed clients can obtain other counters. The layer
  bounds easy cookie rotation; it does not establish one-human-one-entry or
  globally stop copied-proof board crowding.
- Rotating the signing secret also rotates admission keys for at most the
  current one-minute window.
- The `Remove visitor IP headers` Managed Transform must remain disabled for
  these routes. Same-zone Worker subrequests need an explicit review because
  Cloudflare documents different `CF-Connecting-IP` semantics for Worker
  subrequests. Authenticated service-to-service traffic needs its own trusted
  identity path rather than a forged header or public-route exception.

References: [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/),
and [WAF rate limiting characteristics](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/).

## Edge/WAF launch requirement

The binding only runs after the Worker starts and cannot supply a global exact
counter. Before enabling public ranked traffic, inspect the actual zone plan and
deploy an account-controlled WAF/rate-limiting policy for the Maltline API
prefix. At minimum, the policy must:

1. Match the exact Maltline host, path, and allowed method combinations.
2. Count by source IP at the edge, including malformed requests that never
   reach the Worker; include `cf.colo.id` when creating a rule through the API.
3. Apply a NAT-tolerant sustained ceiling, beginning with observation/logging
   where the plan supports it. Candidate ten-minute starting ceilings are 300
   run requests, 60 submissions, 600 board reads, and 300 proof reads per source
   address; these are hypotheses, not shipped configuration.
4. Enforce request-body size and bot/challenge escalation before repeated
   verifier work. Which characteristics and actions are available is
   plan-dependent; do not claim JA4, Bot Management, NAT-aware identity, or
   advanced counting without confirming the deployed account.
5. Expose 429/503 counts and route class in Workers/WAF observability without
   logging network addresses, cookies, callsigns, or proof bodies.

No WAF rule is created by this repository change. Applying one changes external
zone state and requires the production account owner to inspect existing rules
and permissions first.

## Production-equivalent capacity run

Use a staging Worker with production-equivalent D1, R2, AI moderation behavior,
bindings, compatibility date, and plan. Do not run this against the public
leaderboard.

1. Send the valid 1,445,121-byte segmented proof through the full HTTP route,
   not directly through the verifier. Record cold and warm results.
2. Exercise concurrency 1, 2, 4, and 8 for worst-case admitted submissions and
   full retained-proof GETs. Include mixed GET/HEAD proof traffic and rejected
   oversized bodies.
3. Record Worker CPU time, wall time, memory, D1 reads/writes, R2 reads/writes,
   moderation calls/cache hits, response bytes, 429/503 rate, and p50/p95/p99
   latency. Confirm an admission rejection produces zero downstream operations.
4. Choose separate write/read bindings if measurements require different
   ceilings. Pin `limits.cpu_ms` only after the deployed plan and worst-case CPU
   measurements are known.
5. Repeat from more than one geographic location. This characterizes
   per-location behavior; it does not manufacture a global-counter guarantee.

Public-ranked exit evidence is complete only when the applied WAF policy,
trusted-header check, production binding inventory, alerting, and capacity
results are recorded with date, deployment/version identity, and operator.
