# TD-10 verification and security audit

Date: 2026-09-11

Scope: the settled EXP-062/063 tree, including Maltline proof admission and
canonicalization, retained-envelope playback, replay scrubber lifecycle,
competition client/controller/panel identity, platform Worker/D1/R2 retention,
P3-14 resource evidence, and production/lab build boundaries. Product source
was reviewed read-only; this report is the only audit change.

## Verdict

No score-authority, retained-proof integrity, replay-coordinate, stale-UI, or
build-graph correctness defect was found. The authoritative path still accepts
inputs only, resolves the frozen campaign, derives every ranked field by engine
execution, stores the exact canonical envelope under a server-derived key, and
re-verifies retained bytes before constructing the private playback cursor
(`games/maltline/src/core/proof.ts:502-652,743-826`;
`apps/platform/src/maltline-worker.ts:590-679`;
`games/maltline/src/core/playback.ts:365-379`). EXP-062/063 did not weaken those
boundaries.

**Public ranked launch still has one availability/cost and leaderboard-abuse
blocker: TD10-S1 / active task P3-14.** Session-keyed throttles can be reset with
a new cookie, retained-proof reads bypass admission entirely, and the repository
does not yet contain production-equivalent CPU/memory/concurrency evidence.
This is not a way to forge a score: it is a way to make the Worker repeatedly do
valid expensive work and, because the fixed proof is intentionally reusable
across nonces, fill the board with independently admitted copies.

TD10-V2 is a required migration design before generation 3, not a generation-2
launch blocker. TD10-A3, C4, and B5 are bounded assurance or defense-in-depth
debt. The highest-value next tranche is the edge-admission refactor specified
under TD10-S1.

## Threat model and preserved invariants

The attacker may send arbitrary JSON within the HTTP ceiling, split equivalent
inputs into one record per tick, replay a known valid proof under many minted
challenges, rotate or omit cookies, race submissions, probe public score IDs,
interrupt D1/R2 operations, corrupt retained bytes, and deliver stale browser
promises. D1, R2, WebCrypto, and the deployed Cloudflare edge remain trusted
services, but transient failures and interleavings are in scope. A challenge
nonce is only a submission binding; it is not gameplay entropy, freshness, or
proof of a human (`games/maltline/src/core/proof.ts:127-141`;
`games/maltline/tests/authority.test.ts:327-338`).

The following invariants hold in the reviewed tree:

- The public verifier receives an unknown proof plus server challenge. Proof
  fields cannot select scenarios, seeds, initial lives/score, events, or final
  state. Exact keys, ordered stages, terminality, continuation, 60,000-run/tick
  caps, and canonical RLE are enforced before an envelope is retained
  (`games/maltline/src/core/proof.ts:197-362,462-652`).
- Authority configuration includes rules, RNG, schemas, campaign, initial run,
  and ranking policy; it is deeply frozen and SHA-256 checked at the async
  verification boundary (`games/maltline/src/core/authority.ts:54-67,99-170`).
- Retained playback accepts only an unknown envelope, repeats the authoritative
  verification, indexes RLE without per-tick expansion, includes unique
  stage-start frames, and refuses an implicit cross-stage step
  (`games/maltline/src/core/playback.ts:138-159,193-245,279-379`). Frames and
  exposed state are deeply frozen; cursor state is private and the instance is
  non-extensible (`games/maltline/src/core/playback.ts:81-89,248-263`).
- Before showing reproduced inputs, the controller compares all eleven derived
  summary fields with the strict leaderboard row. Abort and generation guards
  cover board, challenge, submit, and inspection replacement
  (`games/maltline/src/viewer/competition-controller.ts:303-332,346-411,
  414-465,475-584`).
- Same-detail preservation is keyed by exact `entry.id` plus
  `playback.verification.sha256`, and is a no-op only while the active scrubber
  remains connected and contained. Every other transition destroys it
  (`games/maltline/src/viewer/competition-panel.ts:125-140,603-673,682-688`).
  This is sound under the D1 trigger that makes score identity and derived
  fields immutable (`apps/platform/migrations/0003_maltline_generation_2.sql:
  230-242`).
- Replay seeks remain stage-local. Slider bursts coalesce, continuous playback
  processes at most 32 ticks per RAF and keeps only 1.4 seconds of presentation
  history, and live motion changes cancel pending work and rebuild the committed
  verified frame (`games/maltline/src/viewer/replay-scrubber.ts:397-458,
  490-523,593-645,684-691`).
- Challenge consumption and pending-score insertion use one D1 batch, which the
  current D1 API documents as transactional. Pending upload ownership uses a
  D1 CAS lease; R2 create is conditional; only exact hash/bytes can promote a
  row; and ready/failed are terminal (`apps/platform/src/maltline-worker.ts:
  342-511,514-588,682-765`; `apps/platform/migrations/
  0003_maltline_generation_2.sql:159-180,250-256`).

## Severity-ranked findings

### TD10-S1 — Expensive admission is cookie-rotatable and does not cover proof reads

Severity: **high, public-launch blocker; availability, cost, and board-abuse
security, not score correctness**

Both configured rate-limit bindings are invoked with `session.id`. A missing or
invalid cookie creates a new D1 session before rate limiting, so discarding the
cookie produces a fresh key and allowance (`apps/platform/src/session.ts:
25-50,60-80`). Submit does apply the expensive limiter before the 1.6 MB body
read and verifier, which is useful defense in depth, but it is still session
scoped (`apps/platform/src/maltline-worker.ts:590-611`). Begin-run has the same
rotation property (`apps/platform/src/maltline-worker.ts:142-184`). Public replay
GET/HEAD is routed before origin, session, or any limiter and performs D1, R2,
body materialization, UTF-8 sizing, and SHA-256 for every successful request
(`apps/platform/src/maltline-worker.ts:282-325,767-791`).

Concrete counterexample: repeatedly omit `ab_session`, mint a challenge, submit
the same known valid generation-2 win input proof, and discard the returned
cookie. Each request obtains a new session key; the nonce changes only the
envelope hash, while proof and derived result remain valid by design. The same
caller can also repeatedly GET one visible score ID and force an uncached
D1/R2/hash path. Moderation is reached after valid verification, so rotating
sessions can amplify that external service too (`apps/platform/src/
maltline-worker.ts:618-648`). No forged score is admitted, but a valid-proof
flood can consume CPU/storage/moderation and crowd the board.

The Wrangler file configures 120/minute and 12/minute bindings but no explicit
`limits.cpu_ms` (`wrangler.jsonc:41-60`). The workerd environment does not
instantiate either binding, so no test executes the limiter branch
(`apps/platform/vitest.config.ts:9-21`; `apps/platform/tests/env.d.ts:3-15`).
The verifier budget suite explicitly says its byte ceilings are not request or
latency promises; it directly verifies a 1,445,121-byte segmented object rather
than sending it through the HTTP/session/admission/R2 route
(`apps/platform/tests/maltline-verifier-budget.test.ts:26-31,102-115`).

Current Cloudflare documentation reinforces why configuration and deployed
measurement matter: Workers have 128 MB per isolate and plan-dependent CPU
limits, while one isolate may handle concurrent requests
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
Rate Limiting bindings are per supplied key, local to a Cloudflare location,
and intentionally eventually consistent rather than exact accounting
([Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).

Bounded fix and exit tests:

1. Introduce one small `admitMaltlineExpensiveRequest` boundary called before
   anonymous-session creation, request-body reading, proof execution, D1/R2
   replay reads, and moderation. Keep the session/D1 window as defense in depth.
   The primary key/policy must be deployment-controlled and not reset merely by
   deleting `ab_session`; because anonymous users have no stable account ID,
   document the NAT/privacy tradeoff of any network-derived key and combine the
   Worker hook with an edge/WAF policy as appropriate.
2. Make the production binding/policy presence explicit and observable. Add
   injected limiter bindings to workerd tests. Rotating/absent cookies must
   share the primary budget, and rejection must occur before a body-stream pull,
   D1 session insert, verifier call, R2 operation, or moderation call.
3. Cover both submit and hot replay GET/HEAD, including 404/410 probes. Preserve
   exact-retry recovery without granting unlimited new-proof work.
4. Send the 1,445,121-byte valid segmented proof through the actual route, then
   run bounded cold/warm concurrency in a production-equivalent deployment.
   Record CPU, memory, D1/R2 operations, moderation calls, rejection rate, and a
   sustainable admission ceiling. Pin an explicit Wrangler CPU limit only after
   the deployed plan and measurements are known.

### TD10-V2 — The registry/storage schema retains versions, but runtime verification is generation-2-only

Severity: **medium future rollout blocker; not a current generation-2 defect**

D1 persists authority, ruleset, campaign, proof, and envelope versions, which
is the right historical shape (`apps/platform/migrations/
0003_maltline_generation_2.sql:15-43,87-180`). Runtime dispatch is nevertheless
compiled around one literal set of constants and one registry entry. Authority
types and proof normalization require the current ruleset/generation;
`normalizeAuthorityIdentity` rejects other versions
(`games/maltline/src/core/authority.ts:32-52,99-127`;
`games/maltline/src/core/proof.ts:669-713`). The browser accepts exactly the
generation-2 season/authority/envelope (`games/maltline/src/viewer/
competition-client.ts:189-252`), and the Worker uses one static storage context
(`apps/platform/src/maltline-leaderboard.ts:6-20`).

Concrete rollout failure: if generation 3 replaces these literals while a
generation-2 score is still inside its five-day proof window, replay GET may
still return its bytes, but the new browser cannot verify them. A stranded
generation-2 pending submission or exact retry would also fail the new current
challenge identity before it could repair retention (`apps/platform/src/
maltline-worker.ts:114-139,199-216`).

Before generation 3, retain immutable v2 and v3 authorities/verifiers and
dispatch by the complete stored identity. Add a rollover test with an archived
v2 season and active v3 season: no new v2 admission, exact pending-v2 retry and
reconciliation follow the chosen policy, retained v2 playback works until its
recorded expiry, v3 uses new hashes, and neither version can verify the other's
proof/envelope. Do not solve this by weakening exact version checks.

### TD10-A3 — Remaining D1/R2 concurrency and fault evidence is narrower than the state machine

Severity: **medium-low assurance debt; no demonstrated unsafe state**

Current workerd coverage is strong: it composes loss and full-win proofs,
checks exact retry repair, collision failure, identical concurrent admission,
lease-vs-reconciler CAS, archived-season atomicity, retention, body-read failure,
and an already-open read racing deletion (`apps/platform/tests/
maltline-worker.integration.test.ts:236-322,352-473,475-643,645-762`). The
conditional R2 put also matches the current documented API behavior: a failed
condition returns `null`
([R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)).

Three useful interleavings remain unpinned:

- two different valid proofs/callsigns race for one challenge; the D1 uniqueness
  and `assertStoredSubmissionMatches` should admit one and reject the other, but
  only identical requests currently share a barrier;
- R2 stores the exact object and then reports a failure; the recovery branch
  should read and recognize it; and
- R2 succeeds but the final pending-to-ready D1 call throws or loses its CAS;
  the row should remain recoverable and reconciliation should promote it.

Add deterministic barriers/fault adapters for those cases. Assert one immutable
D1 score, one exact object, winner-consistent callsign/hash, loser 409, no
terminal-state regression, and idempotent repeated reconciliation. Also specify
that concurrent exact retry may return `[200, 201]` or `[201, 202]`; 202 remains
an in-progress response, not proof loss (`apps/platform/src/maltline-worker.ts:
358-367,427-511,650-679`).

### TD10-C4 — Generic canonical JSON has a depth cap but no width/node/byte cap

Severity: **low defense-in-depth API debt; production transport is bounded**

Canonical JSON rejects accessors, cycles, symbols, exotic prototypes,
non-finite numbers, and depth over 64, but it does not bound total members,
nodes, string bytes, or output bytes (`games/maltline/src/core/fingerprint.ts:
14-91`). Retained verification strictly validates the outer envelope and proof,
then canonicalizes the caller's entire retained object before comparing it; the
caller-supplied summary is not first normalized as an exact bounded summary
object (`games/maltline/src/core/proof.ts:781-815`). A direct local caller can
therefore attach a very wide summary and make the exported core API sort and
serialize it before rejection.

The production browser caps streamed responses at 128 KiB and the Worker stores
at most 75 KiB, so this is not a network-reachable unbounded allocation in the
reviewed route (`games/maltline/src/viewer/competition-client.ts:17-18,
399-458`; `apps/platform/src/maltline-worker.ts:31,310-325,618-620`). A bounded
cleanup is to exact-normalize the retained summary before canonicalization and
optionally give the generic serializer an explicit node/output-byte budget.
Test a one-over member/string budget and confirm malformed summaries reject
before engine replay or canonical sorting. Keep the existing transport caps.

### TD10-B5 — Isolation is well tested, but the deploy command does not execute the strongest artifact scan

Severity: **low release-process defense in depth**

The Vite graph test is strong: production imports no experiment, testing, or
visual-fixture module, while the lab has an exact experiment allowlist and a
graph-wide network/storage scan (`games/maltline/tests/
human-lab-boundary.test.ts:79-138`). The built-site smoke scans both package and
assembled dist trees for lab filenames/sentinels and checks both lab URLs return
404 (`games/maltline/tools/built-site-smoke.mjs:8-17,38-49,92-105`).

However, `npm run deploy:site` runs build/assembly and Wrangler directly; it
does not invoke that smoke (`package.json:14-20`). The assembler's inline scan
only looks for the `visual-fixtures` string and would not itself catch a future
Vite multi-entry/config regression that emitted a human-lab chunk
(`scripts/build-site.mjs:53-63`). CI presently runs the smoke, so this is not an
observed leak. Reuse the same lab filename/sentinel scan in assembly or make the
deploy command run the non-browser artifact portion. Add a test fixture with a
lab-named or sentinel-bearing asset and require assembly to fail closed.

## Verified non-findings

- **Competition identity:** `entry.id + playback.verification.sha256` is the
  correct current preservation key. The no-op additionally requires a connected,
  contained scrubber. Fresh same-identity state preserves DOM/canvas/cursor/
  speed/focus/details/scroll/status; changed ID, digest, kind, Back, close, and
  destroy tear down. Replacement resets scroll/focus and announces once
  (`games/maltline/tests/visual/competition-panel.visual.spec.ts:219-403`).
- **Motion lifecycle:** a real preference change pauses at the committed tick,
  cancels RAF and pending range work, ignores stale callbacks, restores the
  range, preserves focus, rebuilds once, matches a direct render in the new
  mode, and unsubscribes. An explicit renderer mode installs no browser listener
  (`games/maltline/tests/replay-scrubber.test.ts:535-712`;
  `games/maltline/tests/visual/competition-panel.visual.spec.ts:405-439`).
- **R2 retention:** inspection checks D1 terminal state/expiry before R2 and
  hashes the bounded bytes before returning them. Cleanup selects only terminal
  ready/failed rows. A read already holding the exact object may complete while
  deletion finishes; otherwise the result is bounded failure/410, not substituted
  proof data (`apps/platform/src/maltline-worker.ts:282-325,744-765`).
- **Canonicalization and ceilings:** the server-owned generation-2 authority is
  well inside ranked scenario limits, proof collection/tick limits are checked,
  one-over shapes reject, and alternate adjacent RLE segmentation produces the
  same canonical envelope. The 1.6 MB raw request and 75 KiB retained limits are
  deliberately different boundaries, not interchangeable promises.
- **Partition isolation:** Maltline routing is namespaced before the existing
  Partition routes and its migration is additive (`apps/platform/src/
  worker.ts:531-564`; `apps/platform/migrations/
  0003_maltline_generation_2.sql:1-13`). No reviewed P2-17/P2-18 change touched
  proof, authority, competition client/controller, Worker, migration, or storage
  protocol.

## Independent validation

Run from the repository root on 2026-09-11:

```text
npm test --workspace games/maltline -- --run \
  tests/proof.test.ts tests/playback.test.ts \
  tests/competition-client.test.ts tests/competition-controller.test.ts \
  tests/human-lab-boundary.test.ts tests/viewer-boundary.test.ts
```

Result: **6 files, 119/119 tests passed** in 946 ms.

```text
npm test --workspace apps/platform -- --run \
  tests/http.test.ts tests/maltline-verifier-budget.test.ts \
  tests/maltline-data-model.test.ts tests/maltline-worker.integration.test.ts
```

Result: **4 files, 38/38 tests passed** in 1.43 s in the Workers pool.

```text
npm run test:visual --workspace games/maltline -- --grep \
  "same verified detail|verified identity changes|different inspection kind|live reduced-motion changes"
```

Result: **5/5 Playwright tests passed** in 2.6 s. These are functional browser
checks, not low-end-device performance evidence.

## External evidence still required

The repository cannot establish the deployed Workers plan, an explicit CPU
limit, actual WAF/bot/admission rules, rate-binding presence or effectiveness
across Cloudflare locations, production D1/R2 latency/failure rates, cold-start
and concurrent memory/CPU, or sustainable moderation/storage cost. Obtain those
from a production-equivalent deployment with logs/metrics and adversarial load;
local workerd wall time is not deployed CPU time.

Likewise, deterministic proof verification establishes only that retained inputs
reproduce a result. It does not establish who generated them, that they were
played after the challenge, or that a human played. Static proof secrecy must
not be an anti-cheat assumption. Real target-device replay responsiveness,
screen-reader/focus behavior, reduced-motion comfort, comprehension of frame
language, and participant evidence remain device/human work (including P4-04),
not conclusions of these unit, workerd, or headless-browser gates.
