# TD-05: Maltline verification and platform post-EXP-040 review

Date: 2026-09-10

Scope: the post-EXP-040 Maltline ranked challenge and submission path, public
verifier facade, D1 challenge/score state, deterministic R2 proof retention,
reconciliation and retention jobs, bounded JSON transport, season admission,
rate limiting, and preservation of Partition behavior. This review was
read-only apart from adding this report.

## Verdict

No correctness blocker remains in the current challenge/submission and D1/R2
saga tranche.

The server reconstructs challenge authority from D1, derives all ranked values
through the public Maltline verifier, atomically admits one score per run,
retains an exact canonical envelope at a deterministic key without overwrite,
and exposes only `ready` rows. Pending-row revisions prevent stale
reconciliation from failing an active upload, and retention now operates only
on terminal rows. Season closure participates in the same atomic admission
operation, so an archived campaign cannot admit a new score after a preceding
availability check.

This verdict is deliberately narrower than a production-launch approval. The
residual work below strengthens adversarial evidence, specifies retry response
semantics, and limits abuse across disposable anonymous sessions. None is a
demonstrated score-integrity or proof-retention failure in the current tree.

## Reviewed boundaries

- Maltline routing and scheduled integration:
  `apps/platform/src/worker.ts:531-535,588-630`.
- Challenge issuance, authoritative submission, D1 admission, R2 retention,
  reconciliation, and cleanup:
  `apps/platform/src/maltline-worker.ts:86-200,263-601,603-708`.
- Maltline-specific forward-only schema and invariants:
  `apps/platform/migrations/0003_maltline_generation_2.sql:15-255`.
- Streamed request bounds:
  `apps/platform/src/http.ts:18-68`.
- Anonymous session and rate-limit keys:
  `apps/platform/src/session.ts:37-80` and `wrangler.jsonc:41-57`.
- Public authority-backed verifier facade:
  `games/maltline/src/core/proof.ts:689-757` and
  `games/maltline/src/core/authority.ts:137-170`.
- Workers-runtime and route evidence:
  `apps/platform/tests/http.test.ts`,
  `apps/platform/tests/maltline-verifier-budget.test.ts`, and
  `apps/platform/tests/maltline-worker.integration.test.ts`.

## Issues found and fixed during EXP-040

### 1. Pending identical retries did not actively repair retention

Earlier behavior returned the durable pending result without retrying the R2
write. An exact client retry now validates the immutable stored submission,
attempts conditional retention again, reloads the row, and returns its current
state (`apps/platform/src/maltline-worker.ts:425-441,554-587`). A transient R2
failure therefore leaves a durable pending score and a later identical request
can promote that same score to `ready`; the integration test covers the exact
repair (`apps/platform/tests/maltline-worker.integration.test.ts:251-293`).

### 2. Canonical retained bytes needed a pre-reservation ceiling

The HTTP body was already bounded at 1,600,000 bytes, but the verifier's
canonical envelope also needed an independent retention bound before the D1
claim. The route now measures canonical UTF-8 and rejects anything above 75,000
bytes before moderation, challenge consumption, score insertion, or R2 write
(`apps/platform/src/maltline-worker.ts:21-27,520-548`). This composes the
transport limit with the retained-object budget instead of assuming input RLE
will always canonicalize small enough.

### 3. R2 identity and recovery evidence was incomplete

Conditional `put` now uses the deterministic authority/version/run key, a
no-overwrite precondition, expected SHA-256, private JSON metadata, and explicit
authority/proof/envelope metadata. A failed or racing put reads the existing
object and accepts it only when exact canonical bytes and the derived hash
match; a conclusive mismatch moves the pending row to terminal failure
(`apps/platform/src/maltline-worker.ts:346-422`). This preserves idempotence
without permitting a different object to replace a consumed run.

### 4. Reconciliation could race an in-flight retry

A stale reconciler could previously observe a missing object while a retry was
uploading it and mark the row failed. Uploaders now claim the pending revision
by compare-and-set before touching R2. Ready and failed transitions require the
same expected revision (`apps/platform/src/maltline-worker.ts:300-344,
357-422`). Reconciliation carries the revision selected with each stale row and
its terminal transition loses harmlessly if a retry has refreshed it
(`apps/platform/src/maltline-worker.ts:603-662`).

The barrier test exercises the critical ordering: reconciliation selects a
stale pending row and blocks on a missing-object read; an exact retry refreshes
the revision and blocks during `put`; the stale failure CAS loses; the retry
then stores the object and reaches `ready`
(`apps/platform/tests/maltline-worker.integration.test.ts:345-398`).

### 5. Retention could overlap pending proof acquisition

Cleanup is now restricted to terminal `ready` and `failed` rows. Pending rows
remain owned by retry/reconciliation and cannot have their object removed while
an upload is in progress (`apps/platform/src/maltline-worker.ts:665-685`). The
retention test confirms that canonical proof bytes expire while the immutable
ranked result remains (`apps/platform/tests/maltline-worker.integration.test.ts:449-483`).

### 6. Season closure needed to be atomic with score admission

A separate active-season read was insufficient because the season could be
archived before challenge consumption. The conditional challenge update inside
the D1 batch now includes an `EXISTS` predicate for the exact active season; the
score insert selects only the challenge consumed by that candidate score ID
(`apps/platform/src/maltline-worker.ts:444-517`). The migration's matching-
challenge trigger additionally binds every duplicated protocol field
(`apps/platform/migrations/0003_maltline_generation_2.sql:204-228`). A focused
test proves an archived season admits no new row
(`apps/platform/tests/maltline-worker.integration.test.ts:400-419`).

### 7. Scheduled Maltline failure could suppress unrelated maintenance

Maltline reconciliation, Maltline retention, Partition retention, and database
expiry now run as isolated steps. All steps are attempted before failures are
aggregated and surfaced (`apps/platform/src/worker.ts:599-630`). Expired,
unconsumed Maltline challenges are pruned with existing database expiry work
(`apps/platform/src/worker.ts:617-627`). This preserves Partition cleanup even
when a Maltline binding or object operation fails.

### 8. Concurrency and collision behavior needed sharper assertions

The current route test requires one initial `201`, permits the concurrent exact
request to observe either `200` or `202`, and proves exactly one score row ends
`ready` (`apps/platform/tests/maltline-worker.integration.test.ts:230-249`). A
pre-existing different object at the deterministic key produces a terminal
`object_collision` rather than overwrite
(`apps/platform/tests/maltline-worker.integration.test.ts:421-432`). These
tests, together with the revision barrier above, close the concrete corruption
and stale-failure counterexamples found during the review.

## Final invariant check

The current implementation maintains these required invariants:

1. Challenge identity, nonce, authority digest, campaign/rules versions, season,
   and board are loaded from server state rather than accepted from the proof.
2. Exactly one score row can consume a run; verified/ranking fields are derived
   before the atomic D1 claim and become immutable in schema.
3. A different proof or player identity cannot turn an existing consumed run
   into an idempotent retry.
4. Only exact canonical bytes matching the verifier hash can make a proof
   `ready`; R2 collision never overwrites.
5. `pending` is the only nonterminal state. `ready` and `failed` cannot move
   backward and only `ready` ranks.
6. Reconciliation can transition only the exact pending revision it inspected;
   an active retry invalidates that revision before R2 work.
7. Retention does not select pending rows and therefore does not race proof
   acquisition. Deleting retained bytes does not erase the ranked result.
8. A new admission requires the exact season to remain active inside the D1
   batch. Previously consumed exact retries remain independently recoverable.
9. Request bytes, proof records/ticks, canonical retained bytes, reconciliation
   batches, and cleanup batches are all explicitly bounded.
10. Maltline dispatch and maintenance are additive and isolated from existing
    Partition routes and cleanup.

## Residual launch hardening

### L1 — Barrier-test two different valid proofs for one run

Priority: high assurance; not a known correctness defect.

Race two semantically valid static proofs against one challenge with a barrier
around admission. Acceptance: one request owns the consumed score ID; the loser
returns conflict; exactly one score and one deterministic R2 object exist; the
object bytes/hash and all derived fields match the winning proof. This makes the
different-proof branch as explicit as the current identical-retry test.

### L2 — Complete ambiguous R2/final-CAS fault coverage

Priority: high assurance; not a known correctness defect.

Add injected cases where `put` stores exact bytes and then throws, and where R2
succeeds but the final ready CAS is forced to lose or fail. Acceptance: the
first path recognizes the exact existing object; the latter leaves a recoverable
pending row and reconciliation promotes it. Also run reconciliation twice and
prove idempotent terminal state and object identity.

### L3 — Specify concurrent exact-retry `202` semantics

Priority: API-contract decision.

The implementation may return `202` when another exact request currently owns
the pending revision (`apps/platform/src/maltline-worker.ts:357-374,590-594`).
Document `202` as a retryable/in-progress response and have the client poll or
resubmit, or introduce a stronger exclusive-wait contract if product requires
both concurrent callers to return terminal success. Do not assert an exact
`[200, 201]` pair unless a barrier test proves that stronger contract; current
safe behavior permits `[201, 202]`.

### L4 — Add a non-session-rotatable edge abuse control and CPU capacity gate

Priority: production-launch blocker for cost/availability, not score integrity.

The expensive limiter and D1 fallback are keyed by anonymous session ID
(`apps/platform/src/session.ts:60-80`). A caller can discard its cookie, create
a new anonymous session, and regain the per-session verification allowance.
Before enabling ranked writes publicly, place an additional rate/admission
control before anonymous-session creation using an edge identity that cannot be
reset merely by rotating the cookie. Keep the session limiter as defense in
depth and do not describe the control, nonce, or proof as proof-of-human.

Run the composed 1,445,121-byte adversarial segmentation through the actual
route under production-equivalent Workers limits, including concurrent cold and
warm requests. Set an explicit sustainable admission rate from observed CPU,
wall time, memory, D1, R2, and moderation cost. Acceptance requires overload to
reject before body parsing and proof execution, while normal exact retries
remain recoverable.

## Evidence at handoff

The settled focused integration file passed **8/8 tests**, including the exact
retry repair, reconciliation outcomes, lease/CAS barrier, archived-season
admission, collision, request cap, and terminal retention cases. The complete
platform suite passed 47/47 and the platform build passed. These are local
Workers-pool results; production-equivalent capacity evidence remains required
before deployment.
