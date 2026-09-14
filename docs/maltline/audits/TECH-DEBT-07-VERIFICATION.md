# TD-07: Competition protocol and retained-proof verification audit

Date: 2026-09-10

Scope: the settled P3-18/P3-19 error and stale-operation changes, the public
retained-proof route, the browser competition client/controller, and the
composed client-to-Worker/D1/R2 tests. This was a read-only product-code review;
this file is the only change made by the audit.

## Verdict

No score-authority or proof-integrity correctness blocker was found. A submitted
body still contributes only callsign, run ID, and input proof; the Worker derives
the ranked summary through the registered authority
(`apps/platform/src/maltline-worker.ts:578-665`). A retained object is selected
through an immutable D1 key/hash, bounded, hashed before delivery, and served
only from `ready` state (`apps/platform/src/maltline-worker.ts:275-319`). The
browser then strictly reconstructs the canonical envelope and replays its inputs
locally (`games/maltline/src/viewer/competition-client.ts:505-526`;
`games/maltline/src/core/proof.ts:760-799`). R2 corruption therefore fails
closed rather than becoming a displayed verified result.

P3-18 is exact for its current two-code scope. The Worker emits distinct
`maltline_callsign_rejected` and `maltline_proof_invalid` codes only with HTTP
400 (`apps/platform/src/maltline-worker.ts:23-26,597-615`), while the root error
handler preserves Partition's pre-existing uncoded `{error}` shape
(`apps/platform/src/worker.ts:588-600`). The client rejects unknown codes,
extra fields, and wrong code/status pairs
(`games/maltline/src/viewer/competition-client.ts:324-345`). Only the explicit
callsign code reopens editing; other 4xx responses permanently invalidate the
attempt, while 429, 5xx, network, timeout, and ambiguous-response failures retain
the proof for idempotent retry
(`games/maltline/src/viewer/competition-controller.ts:118-164`).

P3-19's replacement barriers are also sound. Challenge, board, submission, and
inspection operations are aborted and guarded by the applicable generation
before state mutation (`games/maltline/src/viewer/competition-controller.ts:282-312,
325-369,371-423,432-481,531-542`). The non-cooperative browser harness resolves
obsolete success and failure results after their replacements, including proof
inspection (`games/maltline/tests/visual/competition-controller.visual.spec.ts:32-159`).
No stale result can change a replacement attempt's challenge, proof eligibility,
accepted submission, standings, or inspected proof.

One availability/cost control remains a public-launch blocker. The other items
below are bounded contract/assurance debt; none permits an unverified score to
rank.

## Findings

### TD7-S1 — Public proof inspection is an uncached D1 + R2 + hash amplifier

Severity: **high for public launch; availability/cost security, not score
correctness**

Leaderboard responses publicly disclose valid score IDs. Every unauthenticated
GET for one of those IDs performs a D1 lookup, an R2 read, full-body materialize,
UTF-8 sizing, and SHA-256 before returning as much as 75,000 bytes
(`apps/platform/src/maltline-worker.ts:275-318`). The replay branch runs before
same-origin/session creation and all rate limiting
(`apps/platform/src/maltline-worker.ts:752-763`), and its response is explicitly
`private, no-store` (`apps/platform/src/maltline-worker.ts:311-318`). An attacker
can therefore repeatedly request a visible top score and force origin work on
every request. The 75 KB object bound limits each operation but not request
count.

This extends the already-open P3-14 non-session-rotatable edge-admission work to
inspection reads. Before enabling public ranked traffic:

- apply a non-cookie-rotatable edge/WAF rate policy to retained-proof reads and
  submissions;
- decide whether public immutable proof bytes can use a short, expiry-bounded
  shared cache/ETag after the Worker integrity check; and
- capacity-test repeated hot-score reads as well as maximum verification
  submissions in production-equivalent Workers/R2 conditions.

Acceptance: rotating or omitting `ab_session` cannot evade the edge control; a
hot-object test demonstrates a documented ceiling on D1/R2/CPU work; 404/410
probing cannot be amplified more cheaply than successful reads; and valid proof
bytes/hash remain unchanged.

### TD7-V1 — The board cannot express that a retained proof has expired

Severity: **medium; public verification-contract debt**

Proof retention intentionally deletes bytes without deleting the immutable
ranked score (`apps/platform/src/maltline-worker.ts:729-749`). The leaderboard
continues selecting every `ready` row without considering `proof_expires_at` or
`proof_deleted_at`, and its entry omits proof availability
(`apps/platform/src/maltline-worker.ts:232-272`). The panel consequently renders
an Inspect action for every row (`games/maltline/src/viewer/competition-panel.ts:241-265`),
although the route permanently returns 410 after expiry or cleanup
(`apps/platform/src/maltline-worker.ts:283-302`). Historic results remain
authoritative, but the UI overstates their current inspectability.

Choose and version one explicit policy before describing every board score as
inspectable: expose strictly parsed `proofAvailable`/`proofExpiresAt` fields and
disable or relabel expired inspection, retain proof for the full active season,
or remove/archive scores when their proof expires. Test the boundary immediately
before, at, and after expiry and after a deletion-with-D1-mark retry.

### TD7-V2 — Local replay checks only the board score, not the complete row

Severity: **medium-low; independent-audit assurance**

The leaderboard client strictly parses lives, progress, ticks, and all customer
counters (`games/maltline/src/viewer/competition-client.ts:251-285`), but
`boardEntries` discards everything except score and stages cleared and the
Inspect callback passes only ID, callsign, and score
(`games/maltline/src/viewer/competition-controller.ts:104-115`;
`games/maltline/src/viewer/competition-panel.ts:50-57,255-263`). After local
replay, the controller compares only `summary.score` before announcing
“LOCALLY REPLAYED” (`games/maltline/src/viewer/competition-controller.ts:325-357`).

Concrete counterexample: a malformed/corrupted leaderboard response with the
right score but different `lives`, `stagesCleared`, `completed`, `totalTicks`, or
counters passes the client schema and the inspection linkage check. The proof
itself is valid and the Worker/D1 path prevents this during normal operation, so
this is not a ranking exploit; it means the browser's independent-verification
claim does not prove that the complete displayed board row matches the retained
proof.

Pass the full parsed entry into inspection and compare every verifier-derived
summary field. For stronger public linkage, expose the committed proof SHA-256
with the row and compare it to the locally reconstructed digest. Add a test that
keeps score equal while changing each other derived field and requires the
inspection to fail closed.

### TD7-E1 — Permanent replay absence is presented as retryable

Severity: **low; status-handling debt**

The server deliberately distinguishes not-found (404), expired/deleted (410),
integrity failure (503), and storage failure (503)
(`apps/platform/src/maltline-worker.ts:280-309`). The client preserves those
statuses in `MaltlineCompetitionApiError`
(`games/maltline/src/viewer/competition-client.ts:109-118,557-603`), but the
controller discards the distinction and always renders “Try again while it is
available” plus a retry action (`games/maltline/src/viewer/competition-controller.ts:358-366`;
`games/maltline/src/viewer/competition-panel.ts:293-307`). A 404/410 retry cannot
recover under the current retention model.

Map 404/410 to a terminal `unavailable` inspection state without a retry button;
retain retry for 429, 5xx, timeout, network, and abort-safe transient failures.
Add exact controller tests for 404, 410, 429, 503, protocol failure, and network
failure. No new machine error code is required for this distinction.

## R2 and concurrency assessment

The D1/R2 state machine remains safe under the reviewed races:

- pending upload ownership is a D1 compare-and-swap lease; a stale reconciler
  cannot fail a newly heartbeated retry
  (`apps/platform/src/maltline-worker.ts:358-402,415-480,667-727`);
- cleanup selects only terminal `ready`/`failed` rows, so it cannot delete an
  in-flight pending upload (`apps/platform/src/maltline-worker.ts:729-749`);
- inspection checks D1 state/expiry before R2 and checks the R2 bytes against the
  D1 SHA-256 before returning them (`apps/platform/src/maltline-worker.ts:283-318`);
  a cleanup racing between those operations yields either the already-opened
  valid body or a closed 410, not attacker-selected bytes; and
- deterministic, authority-derived object keys plus conditional create and exact
  byte/hash comparison prevent retry overwrite and collision substitution
  (`apps/platform/src/maltline-leaderboard.ts:149-162`;
  `apps/platform/src/maltline-worker.ts:404-480`).

Existing workerd coverage exercises exact retry repair, stale-reconciler lease
loss, object collision, corruption-on-read, and terminal cleanup
(`apps/platform/tests/maltline-worker.integration.test.ts:244-605`). A final
bounded assurance test should race retained GET/HEAD against cleanup and accept
only 200 with exact canonical bytes/hash or 410, and inject a body-read failure
to require a bounded no-leak 5xx. This is test debt, not evidence of a current
state-machine defect.

## Composed-test assessment

The composed workerd test now drives the production browser client through the
real Worker, D1 schema, verifier, R2 retention, local replay verifier, and
leaderboard parser (`apps/platform/tests/maltline-worker.integration.test.ts:110-214`).
That closes the former client/Worker contract seam. The browser stale-operation
suite deliberately uses a non-cooperative injected service, which is the right
adversarial model for generation guards. A future end-to-end gate may join the
real controller and workerd service in one browser run, but the current split
already protects the security-relevant boundaries and is not a release blocker.

## Priority order

1. **Before public ranked launch:** close TD7-S1 together with the remaining
   P3-14 edge-abuse and production-capacity gate.
2. **Before claiming all leaderboard proofs are inspectable:** choose and expose
   the TD7-V1 retention/availability contract.
3. **Before calling inspection a full row-level independent audit:** compare the
   complete derived summary and, preferably, its public digest (TD7-V2).
4. **Cleanup:** distinguish terminal replay absence from transient inspection
   failures and add the focused cleanup/read race tests (TD7-E1).

## Repair verification — 2026-09-10

Verdict: the repaired tree closes TD7-V1, TD7-V2, and TD7-E1 without weakening
the authoritative proof path. No protocol, score-authority, R2-integrity, or
stale-async correctness blocker remains. TD7-S1 remains the one public-launch
blocker and is explicitly retained under P3-14.

- **TD7-S1 remains open.** A public replay GET still precedes session/rate-limit
  handling and performs D1 lookup, uncached R2 read, byte materialization, and
  SHA-256 (`apps/platform/src/maltline-worker.ts:282-325,767-779`). Current task
  and experiment records correctly keep non-cookie-rotatable proof-read control
  and production-equivalent read/submit capacity open; no code-only claim closes
  this deployment boundary.
- **TD7-V1 is closed.** The leaderboard now derives `proofAvailable` from
  authoritative expiry/deletion state and emits it on every score
  (`apps/platform/src/maltline-worker.ts:83-85,236-279`). The browser requires an
  exact boolean (`games/maltline/src/viewer/competition-client.ts:21-37,253-287`),
  and the panel replaces Inspect with `Window ended` when false
  (`games/maltline/src/viewer/competition-panel.ts:264-292`). The workerd
  retention case proves the ranked score survives while availability becomes
  false and GET returns 410
  (`apps/platform/tests/maltline-worker.integration.test.ts:565-608`).
- **TD7-V2 is closed at the finding's required scope.** Inspection now carries
  the full parsed row and compares every verifier-derived summary field before
  entering `verified` (`games/maltline/src/viewer/competition-controller.ts:106-128,
  346-385`). A same-score/different-ticks browser case fails closed
  (`games/maltline/tests/visual/competition-controller.visual.spec.ts:123-139`).
  Publishing the D1 proof digest with each board row remains optional stronger
  linkage, not a correctness requirement: the Worker already checks those R2
  bytes against the immutable D1 digest and the browser displays its independently
  reconstructed digest.
- **TD7-E1 is closed.** Typed 404/410 responses now become a terminal
  `unavailable` state, update the in-memory row's availability, and offer no
  retry; transient failures retain retry
  (`games/maltline/src/viewer/competition-controller.ts:386-407`;
  `games/maltline/src/viewer/competition-panel.ts:329-352`). Browser cases cover
  both policies (`games/maltline/tests/visual/competition-controller.visual.spec.ts:88-121`).
- **Stale inspection closure is strengthened.** Closing or dismissing proof
  detail aborts the request and increments its generation
  (`games/maltline/src/viewer/competition-controller.ts:205-222,291-301`). Both
  non-cooperative success and failure after close/reopen are rejected
  (`games/maltline/tests/visual/competition-controller.visual.spec.ts:59-86`).

Residual cleanup: `docs/maltline/PROOF-PROTOCOL.md:47-54` still says the browser
compares only score and uses the former `LOCALLY REPLAYED` label. The current
contract compares the complete derived summary and renders `INPUTS REPRODUCED`;
the guide should be corrected in its next documentation pass. The previously
recommended GET/HEAD-versus-cleanup barrier and injected R2 body-read-failure
tests also remain assurance debt, not evidence of a state-machine defect.

Focused checks run against the repaired shared tree:

- `npm test --workspace @arcadebench/maltline -- --run tests/competition-client.test.ts tests/competition-controller.test.ts`
  — **2 files, 61 tests passed**.
- `npm test --workspace @arcadebench/platform -- --run tests/maltline-worker.integration.test.ts`
  — **1 file, 10 tests passed** in the Workers runtime.
- `npm run test:visual --workspace @arcadebench/maltline -- tests/visual/competition-controller.visual.spec.ts`
  — **13 Playwright tests passed**, including availability, complete-summary
  mismatch, transient/terminal errors, and non-cooperative stale completions.
  The first launch encountered the suite's fixed port already in use and ran no
  tests; the unchanged command passed after that shared Vite process exited.

**Superseding documentation note.** The documentation residual recorded above
is now closed. `docs/maltline/PROOF-PROTOCOL.md:40-60` matches the implemented
contract: bounded ready/unexpired hash-checked GET/HEAD transport; strict local
canonical replay; equality of every verifier-derived summary field; the
`INPUTS REPRODUCED` claim with explicit identity/human-play limitation;
authoritative `proofAvailable`; terminal 404/410 handling; and transient retry.
This narrow recheck changed no product or test file and required no additional
test execution. TD7-S1 and the two R2 race/fault assurance tests remain as
previously recorded.

**Superseding R2-assurance note.** The two test residuals in the preceding note
are now closed. The injected object proxy makes `R2ObjectBody.text()` fail after
a successful get and proves the public boundary returns only the generic bounded
500 envelope (`apps/platform/tests/maltline-worker.integration.test.ts:175-197,
665-682`). The captured-read helper snapshots the exact object body, blocks the
route while terminal retention deletes R2 and records deletion, then releases
that already-open read; the response must still be 200 with the expected
canonical bytes and D1-bound SHA-256, while a subsequent R2 get is absent
(`apps/platform/tests/maltline-worker.integration.test.ts:199-227,684-707`).
This accurately covers the two permitted sides of the inspected cleanup race
without changing product behavior. Recheck:
`npm test --workspace @arcadebench/platform -- --run tests/maltline-worker.integration.test.ts`
— **1 file, 11 tests passed**. TD7-S1 remains the sole TD-07 launch blocker.
