# TD-04: Maltline verifier, platform, and audio containment review

Date: 2026-09-10

Scope: the settled EXP-036/037 tree, specifically envelope-v3 nonce claims,
generation-2 authority self-checking, the test-only proof-vector subpath,
workerd resource evidence, streamed JSON transport, the missing Maltline
Worker/D1/R2 boundary, and audio A1/A2 containment with A3 pending. This was a
read-only product review; only this report was added. No remote calls were made.

## Verdict

The core verifier is suitable to integrate behind a server-owned challenge.
Envelope v3 describes the fixed-campaign policy honestly, the registered
authority is deeply frozen and hash-checked before replay, and static win,
loss, mistake, canonical-RLE, and adversarial segmentation vectors execute in
workerd. None of that is a public leaderboard yet.

Ranked Maltline remains blocked on a game-specific server boundary, D1 schema
and total ranking order, a recoverable D1/R2 submission state machine, true
concurrent-submission tests, and a final composed transport/CPU/admission
budget. The existing Worker is deliberately Partition-only. Reusing its
R2-before-D1 write order without a recovery design would create orphan objects
on a losing race or failed database commit.

Audio A1 and A2 are materially contained for a small supervised acquisition:
the direct executor revalidates and snapshots the approved plan, checks real
paths repeatedly, reserves exclusive locks before fetch, persists acquisition
history, and refuses automatic rebilling. Audio A3 still blocks promotion:
the generated runtime Ogg is hashed but is not decoded/probed or size-bounded.
Owner rights/spend approval also remains external and mandatory.

### Release blockers

1. **TD4-V1:** no server-owned Maltline challenge or submission route.
2. **TD4-V2:** no Maltline D1 schema, authority/version retention, or exact SQL
   ranking order.
3. **TD4-V3:** no recoverable, race-tested D1/R2 one-use submission state
   machine.
4. **TD4-V4:** workerd evidence is not yet composed with the streamed body
   reader and a production CPU/concurrency/admission budget.
5. **TD4-A3:** runtime Ogg validation remains a blocker only for promoting audio
   assets, not for a deliberately silent build or core verification.

The fixed-campaign policy is a product constraint rather than a hidden defect:
the same proof can be submitted against any fresh nonce. Ranked launch is
acceptable only if product/security copy does not claim proof-of-human,
post-challenge play, or gameplay freshness.

## Evidence rerun

- `npm test -- --run tests/authority.test.ts tests/proof.test.ts tests/audio-production.test.ts`
  from `games/maltline`: **3 files, 137 tests passed**.
- `npm test -- --run tests/http.test.ts tests/maltline-verifier-budget.test.ts tests/worker.integration.test.ts`
  from `apps/platform`: **3 files, 23 tests passed** in the configured Workers
  pool.
- `artifacts/maltline-audio/`: **absent** after the checks.

These counts are evidence from this review, not a replacement for the full
workspace build/test gate.

## Controls that are sound now

### Envelope v3 and nonce semantics

The public challenge type calls the unsigned 32-bit value `nonce` and states
that it does not affect gameplay, establish proof freshness, or prove human
play (`games/maltline/src/core/proof.ts:126-139`). Challenge normalization
requires exactly `runId`, `seasonId`, `boardId`, `nonce`, and `authority`, and
rejects the old `seed` shape and unsupported authority identity
(`games/maltline/src/core/proof.ts:668-704`). The retained envelope copies that
server context and version 3 explicitly (`games/maltline/src/core/proof.ts:717-732`).

Tests prove that changing a nonce leaves the canonical proof and derived
summary equal while changing the retained hash, and that missing, legacy,
fractional, negative, string, boolean, and over-uint32 nonce values reject
(`games/maltline/tests/authority.test.ts:276-338`). The protocol document makes
proof transferability and the separate platform obligations explicit
(`docs/maltline/PROOF-PROTOCOL.md:1-23`). These are the correct claims for the
chosen fixed campaign.

### Frozen authority and cached self-check

The generation-2 authority owns the normalized campaign, exact initial run,
rules/RNG/schema identifiers, ranking policy, and pinned configuration SHA-256
(`games/maltline/src/core/authority.ts:21-107`). Tests recursively check that
the authority and public campaign alias are frozen and mutation-resistant, and
recompute the pinned digest (`games/maltline/tests/authority.test.ts:48-127`).

The facade resolves only a registered identity, then awaits the authority
configuration check before replay (`games/maltline/src/core/proof.ts:735-757`).
The check caches a promise in a `WeakMap` keyed by the immutable authority
object (`games/maltline/src/core/authority.ts:137-170`). Concurrent first calls
therefore share the same check; a mismatch or hash failure stays fail-closed for
that isolate rather than falling back to unchecked execution. Workerd proof
tests exercise the real public facade and WebCrypto path.

No correctness blocker was found in this cache. Operationally, a transient
WebCrypto failure also remains cached until isolate replacement, and health
does not currently expose authority readiness. Before launch, initialize or
await the same promise from the Maltline server boundary and map a configuration
failure to a generic 503 plus an observable internal diagnostic. Do not clear
or retry a digest mismatch inside a request.

### Strict proof and workerd shape evidence

The proof layer caps total input records, per-stage ticks, and total ticks at
60,000 and applies tighter ranked scenario policy before replay
(`games/maltline/src/core/proof.ts:29-54,315-353,470-492`). It parses exact
objects, safe integers, plain prototypes, dense arrays, and normalized inputs
before authoritative execution (`games/maltline/src/core/proof.ts:189-313,
500-643`). Outcomes and rank fields are derived from the engine; clients cannot
supply score, lives, events, scenarios, or final state.

The Workers-pool budget test records these current serialized sizes
(`apps/platform/tests/maltline-verifier-budget.test.ts:61-115`):

| Shape | Input bytes | Canonical envelope bytes |
| --- | ---: | ---: |
| generation-2 win | 58,016 | 58,525 |
| generation-2 loss | 187 | 684 |
| generation-2 mistake | 60,064 | 60,573 |
| win split to one record per tick | 1,445,121 | 58,525 after canonicalization |

CI regression ceilings are 75,000 bytes for canonical input/envelope and
1,600,000 bytes for the segmented input. Tests also allocate exact 60,000-run,
stage-tick, and total-tick shapes and distinguish them from one-over rejection
(`apps/platform/tests/maltline-verifier-budget.test.ts:117-166`). The exact
limit cases intentionally fail later terminal semantics; they prove passage
through the resource gate, not the existence of a semantically valid 60,000-
tick campaign proof.

These are useful compatibility and allocation regressions. The comments
correctly avoid presenting them as HTTP limits or latency promises
(`apps/platform/tests/maltline-verifier-budget.test.ts:26-31`).

### Streamed JSON transport

`readJson` rejects invalid limits, compressed encodings, bad or oversized
declared lengths, the first streamed byte over the cap, invalid UTF-8, and
malformed JSON (`apps/platform/src/http.ts:18-68`). Focused Workers-pool tests
cover exact-limit chunking, early declared rejection without consuming the
body, encoding rejection, invalid lengths, invalid UTF-8, and malformed/empty
JSON (`apps/platform/tests/http.test.ts:29-100`). This closes the previous
unbounded `request.text()` transport problem.

The reader still retains all chunks, copies them into one byte array, decodes a
full string, and then materializes the parsed object. That is bounded memory
amplification, not streaming JSON parsing. It is safe only when each route uses
a deliberately chosen cap. It also does not currently enforce an
`application/json` media type, and an exceptional `reader.cancel()` could mask
the intended 413 (`apps/platform/src/http.ts:22-47`). Those are bounded cleanup
items once the Maltline route limit is fixed.

## Ranked platform blockers

### TD4-V1 — Maltline challenge authority does not exist server-side

Severity: **critical, ranked-release blocker**

The Worker imports Partition only, hardcodes `/api/v1/games/partition`, and
returns Partition's version from health (`apps/platform/src/worker.ts:1-18,
557-576`). Active season lookup, run context, and issued challenge are also
Partition-specific; the challenge stores and returns a gameplay `seed`
(`apps/platform/src/worker.ts:101-165`). The only end-to-end integration test
targets that Partition route and reconstructs its seeded field
(`apps/platform/tests/worker.integration.test.ts:15-102`).

`@arcadebench/maltline` is now a platform dependency, but the production Worker
does not import or call its facade (`apps/platform/package.json:14-17`). The
workerd test's challenge constant is trusted test data, not a minted/stored
challenge (`apps/platform/tests/maltline-verifier-budget.test.ts:18-24`).

Bounded implementation and acceptance:

- Add a game-dispatched Maltline arcade route without changing Partition wire
  behavior.
- On issuance, load the active Maltline season and store server-generated
  `runId`, `nonce`, exact authority identity/configuration digest, board, session,
  creation, and expiry. Return only the client-needed challenge fields.
- On submission, accept `runId`, callsign, and input-only proof. Load all
  challenge/authority fields from D1 and construct `MaltlineServerChallenge`
  server-side. Reject client-authored score, summary, authority, nonce, season,
  or final state as unknown fields.
- Integration tests must cover wrong session, missing/expired/consumed run,
  board/version/authority mismatch, client context injection, and the same
  static proof succeeding under two different server nonces with different
  envelope hashes by design.

### TD4-V2 — D1 cannot yet represent or rank Maltline exactly

Severity: **critical, ranked-release blocker**

The only active season row is Partition. `run_challenges` requires Partition
difficulty/seed fields, and `scores` requires Partition-specific elapsed,
partition, field, and capture columns (`apps/platform/migrations/0001_public_platform.sql:9-39,
52-86`). Existing arcade SQL ranks `stage_reached`, `completed`, elapsed time,
and partitions (`apps/platform/src/worker.ts:185-225`). Maltline authority ranks
`completed DESC`, `stageReached DESC`, `score DESC`, `totalTicks ASC`, then
`fulfilled DESC` (`games/maltline/src/core/authority.ts:21-30`).

Bounded implementation and acceptance:

- Add forward-only Maltline-compatible migration(s); do not reinterpret the
  Partition seed as a nonce or overwrite retained Partition rows.
- Persist game ID, ruleset, campaign generation, configuration digest, proof
  version, envelope version, nonce, and all derived ranking fields needed to
  audit a row. Store no client score.
- Define one stable final tie-break (`created_at`, then ID) after the authority
  order. Create a matching D1 index and query.
- Generate tie-heavy rows and prove a TypeScript comparator implementing the
  frozen ranking policy returns the same order as D1, including completed vs
  incomplete, equal-stage score, tick, fulfilled, and exact ties.
- State the verifier-retention rule: every visible/retained season keeps its
  authority/verifier version, or its score/proof retention ends before code is
  removed.

### TD4-V3 — R2 and D1 need a recoverable one-use state machine

Severity: **critical, ranked-release blocker**

The current Partition path verifies, moderates, writes a new R2 object, and only
then attempts the D1 consume-and-score batch (`apps/platform/src/worker.ts:246-324`).
The database predicates and unique `scores.run_id` are useful one-use guards,
but R2 is outside that transaction. Two concurrent submissions can both spend
verification/moderation work and write distinct objects before one loses the
D1 compare-and-set. A D1 failure after `REPLAYS.put` has the same orphan risk.
Cleanup enumerates D1-backed objects, so an object with no score row has no
normal retention path (`apps/platform/src/worker.ts:346-384`). The current
integration test retries only after the first request completed; it does not
race two requests (`apps/platform/tests/worker.integration.test.ts:91-102`).

Do not copy that ordering into Maltline without an explicit saga. Use a
deterministic object key and D1 states such as pending/ready/failed, or equivalent
compare-and-set plus compensation/reconciliation. Leaderboard queries must show
only ready rows. The design must make retries idempotent without allowing a
different proof to replace a consumed challenge.

Acceptance tests in workerd with D1/R2:

- Release two simultaneous valid submissions for one run from a barrier. Exactly
  one becomes ready, the challenge is consumed once, one score exists, and one
  canonical envelope object exists.
- Race two different valid proof bodies for one run; the loser cannot replace
  the retained winner.
- Inject failure before/after D1 claim, during R2 put, and before/after final D1
  transition. Every case is retryable or reconcilable according to the state
  machine and leaves no permanently invisible object.
- Verify stored R2 bytes equal the facade's `canonicalJson`, R2/D1 SHA values
  equal the facade's `sha256`, metadata identifies envelope v3 and authority
  digest, and no client body is retained as authority.
- Run cleanup/reconciliation twice to prove idempotence.

### TD4-V4 — HTTP, verifier, and concurrency budgets are not composed

Severity: **high, ranked-release blocker**

The verifier budget test invokes JavaScript objects directly. The transport
tests use tiny JSON values. No test streams the 1,445,121-byte segmented proof
through `readJson`, validates it through the public facade, persists it, and
observes the result in one Worker request. The existing `MAX_SCORE_BYTES` is an
8 MiB Partition route constant, while the 1.6 MB number is expressly only a CI
fixture ceiling (`apps/platform/src/worker.ts:14-18`;
`apps/platform/tests/maltline-verifier-budget.test.ts:26-31`).

There is also no production CPU promise or concurrent verifier-load result. A
Vitest duration is wall time for a local test run, not a Workers CPU budget.
The proof protocol can allocate 60,000 raw records and execute at most 60,000
ticks; the current exact-bound tests cover validation order but do not force
60,000 engine ticks before termination.

Bounded implementation and acceptance:

- Choose an explicit Maltline request-byte cap that admits supported canonical
  and deliberately supported segmented proofs. If the transport cap is tighter
  than the core protocol, document it as platform policy and test exact/one-over
  behavior for declared and chunked bodies.
- Send canonical win/loss/mistake and segmented win through the real endpoint,
  in multiple chunk schedules, and assert the same derived summary/hash as the
  direct facade. Include malformed UTF-8, compression, unknown fields, and a
  large valid JSON body that is semantically rejected.
- Measure cold and warm canonical, segmented, maximum-breadth, and maximum-tick
  rejection on the selected production Workers plan/configuration. Record CPU,
  wall, and peak-memory evidence; set the production admission/rate limit below
  the verified capacity. Keep CI thresholds generous and semantic rather than
  adding a flaky millisecond assertion.
- Apply the expensive rate limiter before body materialization and verification,
  as the Partition submission path already does (`apps/platform/src/worker.ts:252-258`;
  `apps/platform/src/session.ts:60-79`). Add parallel requests across distinct
  sessions to validate the configured limiter and system behavior under load.

## Non-blocking verifier and transport cleanup

### TD4-C1 — Authority readiness is request-lazy

Severity: **low operational cleanup**

The self-check is correct and fail-closed, but the first known-authority request
pays/observes it. Add a deployment/startup smoke that awaits the registered
configuration digest and an internal readiness signal. Preserve the cached
rejection and generic external error. A test should replace the digest only in
a test authority and prove zero engine execution; no production reset hook is
needed.

### TD4-C2 — The test subpath is hygiene, not a security boundary

Severity: **low cleanup**

`@arcadebench/maltline/testing` is an explicit supported package subpath that
exports the three vectors and protocol caps, while a workerd assertion confirms
they are absent from the production root (`games/maltline/package.json:7-10`;
`games/maltline/src/testing/index.ts:1-11`;
`apps/platform/tests/maltline-verifier-budget.test.ts:168-173`). This keeps
accidental root imports down, but anyone with repository/package access can
still import the subpath. That is not a vulnerability: under the fixed campaign,
proofs are intentionally precomputable and nonce is not proof-of-human.

The exported fixture objects are only top-level frozen; their nested stages and
runs remain mutable (`games/maltline/src/testing/generation-2-proofs.ts:22-64`).
Current tests clone before mutation and pin raw proof hashes, so this is not a
verification bypass. Deep-freeze the vectors or return fresh decoded copies to
prevent order-dependent tests. Optionally add an import rule preventing
`@arcadebench/maltline/testing` from production source files.

### TD4-C3 — Canonicalization duplicates bounded work

Severity: **low cleanup**

The facade canonicalizes the envelope once for the returned bytes and again
inside `sha256Canonical` (`games/maltline/src/core/proof.ts:754-757`;
`games/maltline/src/core/fingerprint.ts:104-109`). Current envelopes are small
after RLE canonicalization, so this is not a blocker. A future internal helper
may hash the already-produced UTF-8 bytes, with a test proving byte/hash identity.
Do not weaken the hardened canonical serializer or expose a caller-supplied
“canonical” string as trusted input.

### TD4-C4 — `readJson` needs route-level media and memory policy

Severity: **medium-low cleanup after V4's cap is chosen**

Require an accepted JSON content type for the Maltline write route, make reader
cancellation best-effort so it cannot mask the intended 413, and document the
bounded multiple in-memory representations. Exact-limit tests should include a
lying smaller `Content-Length`, mixed-case/parameterized media types, cancellation
failure, and large multibyte UTF-8 split across chunks. Actual streamed bytes,
not character count or declared length, remain authoritative.

## Audio containment and remaining gate

### TD4-A1/A2 — Direct execution and filesystem/spend containment are closed

Severity: **closed for a small supervised acquisition; retain regression tests**

`executeApprovedPlan` now validates the raw plan again, validates exact approval
against the normalized snapshot, establishes a real non-symlink staging root,
preflights tools/paths, and reserves every asset before processing
(`games/maltline/tools/audio-production.mjs:407-495,1015-1153`). It repeatedly
checks lexical and real-path containment around writes and promotions and uses
exclusive creation/link operations (`games/maltline/tools/audio-production.mjs:388-477,
717-735,1035-1095`). This is appropriate containment for a supervised tool
running in a trusted local account; it is not a claim of safety against a hostile
same-user process racing every filesystem syscall.

Tests reject malformed direct plans and post-approval mutation before side
effects, snapshot mutation after invocation, symlinked ancestors/asset parents,
parent swaps, special files, existing targets, and concurrent duplicate
execution with at most one fetch (`games/maltline/tests/audio-production.test.ts:530-733`).

The journal records reservation/plan/approval/request/rights before fetch,
records response identity/hash and acquired source before normalization, and
allows resume only from an acquired hash-matched source
(`games/maltline/tools/audio-production.mjs:797-836,936-977,1015-1115`). Offline
fault tests cover decode, normalization, output promotion, manifest write,
pre-acquisition failure, changed plan, completed resume, and source/output
tampering without a second fetch (`games/maltline/tests/audio-production.test.ts:781-983`).
Timeout, content-type, encoding, declared/streamed size, truncation, MP3 magic,
and source decode failures are also covered without retry
(`games/maltline/tools/audio-production.mjs:576-683,797-836`;
`games/maltline/tests/audio-production.test.ts:735-811`).

### TD4-A3 — Runtime Ogg is still not validated before promotion

Severity: **high for audio promotion; not a silent-build/verifier blocker**

Normalization runs ffmpeg for the WAV master and Ogg runtime candidate, but
ffprobe is called only on the master (`games/maltline/tools/audio-production.mjs:685-715`).
The manifest then hashes both files and promotion trusts those hashes
(`games/maltline/tools/audio-production.mjs:753-794,878-912`). A hash establishes
identity, not that the Ogg decodes, is Opus/48 kHz/mono, has sane duration, or is
bounded in size. Current runner tests can therefore return arbitrary runtime
bytes and still reach `completed`.

Before any candidate moves into product assets:

- enforce explicit maximum master/runtime derivative sizes before reading them
  wholesale;
- ffprobe/decode both work outputs and require WAV PCM s24le 48 kHz mono and Ogg
  Opus 48 kHz mono with finite, positive, duration-tolerant bounds;
- record distinct source/master/runtime probe results and byte measurements in
  the manifest;
- reject missing, empty, truncated, wrong-codec/container/rate/channel, excessive
  duration, and oversized derivatives before `normalization_ready` or promotion;
- add offline resume tests proving a bad runtime never promotes and correction
  never refetches the acquired source.

Subprocess timeout/output caps and checksummed/fsynced crash recovery remain
medium operational debt before unattended bulk generation. They do not create
an automatic rebill today. The first request also remains gated on the owner's
actual paid-plan rights, current terms/sublicensing decision, exact plan hash,
short-lived spend ceilings, and human invocation; the repository cannot attest
to those facts.

## Recommended order

1. Freeze the public claim: fixed campaign, transferable proofs, nonce only as
   submission binding; no proof-of-human language.
2. Add Maltline season/challenge migrations and server-only challenge assembly
   with retained authority/version identity.
3. Compose `readJson` and the public facade behind an explicit Maltline body cap,
   error mapping, expensive rate limit, and startup authority check.
4. Implement the recoverable D1/R2 one-use saga and adversarial concurrent/fault
   integration tests before exposing score writes.
5. Implement and cross-check the exact authority ranking order/index, stable
   tie-breaks, retention, and cleanup/reconciliation.
6. Measure the deployed Workers plan under canonical, segmented, boundary, and
   concurrent load; then lock request/admission/CPU policy.
7. Separately close audio A3 and obtain owner approval before acquiring or
   promoting sound. Audio work must remain outside deterministic simulation.

## Claims the current evidence supports

- Generation-2 proofs deterministically derive score/lives/progress from a
  frozen, digest-checked authority in Node and workerd.
- Envelope v3 binds retained bytes to server context, including nonce.
- Canonical and one-record-per-tick RLE segmentations verify identically within
  the measured Workers-pool shapes.
- `readJson` enforces a caller-supplied decoded-byte cap and rejects compressed
  input.
- Audio direct execution, spend reservation, path containment, and fail-closed
  no-rebill recovery have substantial offline test coverage.

## Claims the current evidence does not support

- Any public Maltline leaderboard, challenge issuance, atomic consumption,
  ranking query, proof retention, or recovery path exists.
- Nonce proves fresh gameplay, post-challenge play, uniqueness by itself, or a
  human player.
- The 1.6 MB CI fixture ceiling is a production HTTP, CPU, or concurrency limit.
- The test-only subpath conceals proofs or prevents solver reuse.
- Runtime Ogg derivatives are decodable/release-ready, or paid/commercial rights
  have been approved.
