# TD-02: Maltline Verification and Audio Production Review

Date: 2026-09-10

Scope: the combined Maltline deterministic engine, input-only proof protocol,
canonical envelope/hash, generation-2 campaign, rich local replay, and offline
audio-production scaffold after EXP-022/023/024

Disposition: adversarial review only; no product or central-log code changed

## Executive verdict

The core proof parser is now a credible hostile-input boundary. It accepts only
input runs, strictly rejects unknown and malformed proof fields, normalizes
authoritative scenarios through the engine's shared validator, applies tighter
ranked resource policy, replays the engine headlessly, carries lives and score
between ordered stages, requires a terminal run, and derives every summary
field. Generation 2 also has a full-campaign deterministic result and SHA-256
expectation.

That does **not** yet make Maltline ready for a public ranked Worker. The primary
risk has moved from client-authored state into authority composition: the core
API will accept any valid campaign and initial run that an application caller
labels with the current numeric generation, while the retained proof envelope
does not contain a digest of that execution context. The challenge `seed` is
hashed but never affects Maltline simulation, and the exported envelope/hash
helpers can be called with a structurally fabricated “verified” result. These
are integration footguns that must be closed before the first public season.

The audio tool remains safe to inspect and dry-run: generation needs two gates,
the key is environment-only, output is ignored, processes do not use a shell,
and current tests make no network or paid calls. It is **not safe to execute for
paid acquisition yet**. It sends the paid request before atomically reserving
the output and records provenance only after normalization succeeds. A duplicate
or concurrent run can therefore spend credits and then fail, and a post-response
tool failure can leave paid source media without its complete receipt.

### Release decision

- **Block public ranked/platform integration** on R1 through R5 below.
- **Block any paid audio generation or asset promotion** on A1 through A3.
- The silent/local game and offline dry-run tooling are not blocked by those
  production-boundary issues.
- G1 through G4 and C1 through C5 are important debt, but are cleanup unless a
  noted acceptance gate is triggered.

## Evidence and validation baseline

The review inspected the current implementation and tests rather than relying
on the previous TD-01 conclusions. Important improvements since TD-01 include:

- a single rules manifest and explicit ruleset/campaign constants
  (`games/maltline/src/core/rules.ts:6-28`,
  `games/maltline/src/core/version.ts:5-12`);
- complete scenario/run normalization shared by engine and verifier
  (`games/maltline/src/core/scenario.ts:75-210`,
  `games/maltline/src/core/proof.ts:296-390`);
- clearly separate ranked ceilings (`games/maltline/src/core/proof.ts:28-46`);
- one initial snapshot followed by the state returned from each step, avoiding
  the former redundant pre-tick snapshots
  (`games/maltline/src/core/proof.ts:489-521`);
- derived `resolved` and `exited` totals
  (`games/maltline/src/core/proof.ts:528-576`);
- a generation-2 eight-stage verification/hash test
  (`games/maltline/tests/proof.test.ts:416-440,511-517`); and
- focused offline plan/CLI tests that inject execution and never authorize the
  real paid path (`games/maltline/tests/audio-production.test.ts:145-221`).

Read-only Node 22.19.0 diagnostics on this tree found:

- a terminal 60,000-tick, one-record proof verified in approximately 6-16 ms
  after warm-up;
- the same 60,000 ticks split into 60,000 alternating input records produced a
  3,990,104-byte proof and verified in approximately 16-26 ms; and
- verification plus canonicalization and SHA-256 of that maximum-record proof
  produced 3,990,447 canonical bytes and took approximately 87-122 ms.

These measurements show acceptable local engine behavior, not a Cloudflare
Workers CPU guarantee. They exclude HTTP decoding, moderation, D1/R2 work,
concurrent requests, and production observability.

## Ranked release blockers

### R1 — The numeric generation does not select immutable authority

Severity: **critical**

Evidence:

- `MaltlineVerifierContext` takes a caller-provided `campaign` and `initialRun`
  (`games/maltline/src/core/proof.ts:71-79`).
- Context validation checks that the supplied version numbers equal the current
  constants and that the supplied scenarios are valid, but it does not compare
  their content to a registered generation
  (`games/maltline/src/core/proof.ts:393-425`).
- Ranked policy deliberately accepts lives from 1 through 20 and initial scores
  through 10,000,000 (`games/maltline/src/core/proof.ts:367-390`), while the
  authored generation-2 campaign starts with four lives and should start at
  score zero (`games/maltline/src/core/campaign.ts:8-26`).
- The proof envelope records only numeric ruleset/campaign versions, challenge,
  proof, and derived summary; it omits a campaign/configuration digest and
  initial run (`games/maltline/src/core/proof.ts:125-133,642-650`).
- `MALTLINE_CAMPAIGN` and its nested station arrays are publicly exported mutable
  objects (`games/maltline/src/core/campaign.ts:32-132`). Normalization protects
  an engine instance after construction, but a mutation before the Worker builds
  its context changes what “campaign generation 2” means in that process.

Risk: an integration mistake or runtime mutation can verify and hash the same
input proof under a different campaign, starting score, or life budget while all
protocol versions still say generation 2. The verifier remains deterministic,
but the stored hash is not enough to reconstruct which deterministic execution
was authorized. This is a server/deployment integrity failure, not a field a
client can currently inject directly.

Bounded refactor:

1. Add a small server-side registry keyed by `{gameId, rulesetVersion,
   campaignGeneration}`. A registry entry owns one deeply frozen normalized
   campaign, exact initial run, ranking comparator, and a precomputed SHA-256
   configuration digest.
2. Make the public Worker adapter accept a registry key, not arbitrary campaign
   objects or initial state. Keep the generic context-taking core verifier only
   as an internal/test primitive if useful.
3. Define the digest over a hardened canonical document containing game ID,
   scenario schema, complete rules manifest, RNG identifier/version, ordered
   normalized scenarios, and initial run. Include this digest in the canonical
   retained envelope.
4. Freeze the authored export or publish only a factory/normalized readonly
   value so unrelated code cannot alter the live authority.

Acceptance criteria/tests:

- Same stage IDs with one scenario field changed cannot resolve under generation
  2 and fail before simulation.
- Lives 5 or score 1 cannot be selected for canonical generation 2.
- Mutating the source export cannot change the registered campaign or digest.
- Any rule, RNG, stage order/value, or initial-run change alters the digest and
  requires a new registered generation/ruleset.
- A retained envelope identifies enough immutable registry data to reproduce
  its summary without consulting current mutable exports.

### R2 — Challenge freshness is not bound to gameplay

Severity: **high**

Evidence:

- The challenge includes `seed` (`games/maltline/src/core/proof.ts:118-123`),
  and the hash changes when it changes
  (`games/maltline/tests/proof.test.ts:489-503`).
- Verification never receives or applies the challenge. It uses only the seeds
  embedded in the supplied campaign (`games/maltline/src/core/proof.ts:433-489`;
  generation-2 seeds are fixed at `games/maltline/src/core/campaign.ts:42-130`).
- `hashVerifiedMaltlineProof` merely puts the already verified result beside the
  challenge (`games/maltline/src/core/proof.ts:657-668`).

Risk: one precomputed valid input proof can be re-enveloped for every newly
issued challenge. A server-held, session-bound, one-use run ID still stops
double submission of one challenge, but the field named `seed` provides no
gameplay freshness or anti-precomputation property. That may be an acceptable
bot policy, but it must not be represented as proof that play occurred after
challenge issuance.

Bounded decision/refactor:

- If the seed is intended to affect play, derive registered scenario RNG seeds
  from a server season seed/challenge policy and include that policy/configuration
  digest in verification. Difficulty/fairness across seeds then needs telemetry.
- If Maltline deliberately uses a fixed equal campaign, rename the value to a
  nonce (or omit it), state explicitly that valid proofs are transferable across
  challenges, and rely on challenge expiry, session binding, rate limits, and
  bot policy rather than simulated randomness.

Acceptance criteria/tests:

- Document one chosen policy.
- Under a gameplay-seed policy, a proof for seed A fails for seed B during
  verification, not only after receiving a different envelope hash.
- Under a nonce policy, tests and public copy make no anti-precomputation claim;
  concurrent/reused/expired/foreign-session challenges still reject atomically.

### R3 — Public envelope/hash helpers accept fabricated authority

Severity: **high**

Evidence:

- `VerifiedMaltlineProof` is an exported structural interface
  (`games/maltline/src/core/proof.ts:110-116`).
- `createMaltlineProofEnvelope` checks only three version fields on
  `verified.proof`; it does not reverify inputs or prove that `summary` matches
  the proof (`games/maltline/src/core/proof.ts:633-650`).
- `canonicalizeMaltlineProofEnvelope` accepts any typed envelope without runtime
  validation (`games/maltline/src/core/proof.ts:653-655`).
- The local canonical serializer converts `NaN`/infinity to `null`, accepts
  non-plain object prototypes, and reports cycles via uncontrolled recursion
  (`games/maltline/src/core/proof.ts:620-630`). A hardened serializer that rejects
  nonfinite numbers, cycles, and exotic prototypes already exists at
  `games/maltline/src/core/fingerprint.ts:5-40`.
- The package root exports all of these helpers, as well as the shallow rich
  replay parser (`games/maltline/src/index.ts:1-10`).

Risk: a platform developer can accidentally hash a fabricated summary or a raw
typed-cast envelope and then persist it as “verified.” Sanitized output from
`verifyMaltlineProof` does not itself contain exotic values, so this is primarily
an API-composition hazard rather than a direct proof-parser bypass.

Bounded refactor:

- Expose one server-facing `verifyAndHashMaltlineProof(untrustedProof,
  registeredContext, serverChallenge)` facade.
- Keep the verified-result constructor opaque/private or brand it with a
  module-private symbol; do not accept a publicly constructible structural value
  at the authoritative hashing boundary.
- Consolidate on one hardened canonical JSON implementation with explicit
  finite-number, plain-object, supported-value, depth, and cycle rejection.
- If low-level helpers remain public for non-authoritative tooling, name and
  document them as unsafe for submission acceptance.

Acceptance criteria/tests:

- Fabricated summary, stages, proof version, extra envelope keys, `NaN`,
  infinity, undefined, exotic prototypes, and cycles all fail with a stable
  domain error before hashing.
- Reordered object keys and alternate adjacent RLE segmentation retain one hash.
- A one-tick input change and every server challenge/configuration identity
  change produce a different hash.
- The Worker has no code path that persists client score fields or calls a
  low-level hasher on request data.

### R4 — Legal core limits are not yet a safe Worker request budget

Severity: **high**

Evidence:

- Core hard limits allow 60,000 raw records and 60,000 expanded ticks
  (`games/maltline/src/core/proof.ts:21-26`) and enforce both during replay
  (`games/maltline/src/core/proof.ts:481-503`).
- A legal maximum-record proof is roughly 3.99 MB and local verify+hash time was
  approximately 87-122 ms in this review.
- Maltline has no platform route. The existing Partition route sets request
  limits (`apps/platform/src/worker.ts:14-18,246-258`), uses a signed anonymous
  session and expensive rate limiting (`apps/platform/src/session.ts:21-50,60-80`),
  and applies an encoded-byte check after `request.text()`
  (`apps/platform/src/http.ts:18-31`). Those controls are reusable, but the
  Partition sizes and CPU assumptions are not Maltline measurements.

Risk: expanded tick bounds prevent infinite simulation but do not constrain
transport decompression, bytes allocated before verification, request nesting,
concurrent verifier CPU, or the combined cost of canonicalization/hash,
moderation, and storage. `request.text()` still materializes the decoded body
before the byte-length fallback check unless `Content-Length` is trustworthy.

Bounded refactor:

1. Establish a Maltline decoded-body cap from measured legitimate browser RLE
   distributions. Reject unsupported content encodings and oversized declared
   bodies before decoding; use a bounded stream if compressed/unknown-length
   requests are possible.
2. Benchmark exact legal maxima for one run, 60,000 alternating runs, maximum
   ranked entities, and canonical hash in the Workers test pool and deployed
   runtime. Lower the raw-record ceiling if real input capture does not need it.
3. Reuse Partition's signed-session, same-origin, edge limiter, and D1
   rate-window concepts, with a separate expensive Maltline action/budget.
4. Bound concurrent verification per session/IP/deployment and record coarse
   rejection/latency metrics without proof bodies or keys.

Acceptance criteria/tests:

- Exact maximum bytes/runs/ticks/entities are accepted within the selected
  Worker CPU/memory budget; one-over cases reject before engine execution.
- Chunked, missing-length, misleading-length, unsupported-encoding, deeply
  nested, and concurrent request cases are covered in Worker integration tests.
- Load tests demonstrate that allowed expensive submissions cannot starve the
  route at configured rate/concurrency limits.
- Limits are server constants; client-requested `limits` never reach the public
  adapter.

### R5 — The authoritative Worker lifecycle and error boundary do not exist

Severity: **high**

Evidence:

- There are no Maltline references in `apps/platform`; current routes import
  Partition directly (`apps/platform/src/worker.ts:1-16`).
- The core throws `MaltlineProofError` for both hostile proof rejection and
  invalid caller-supplied trusted context (`games/maltline/src/core/proof.ts:141-146,
  393-425,433-449`).
- Partition demonstrates session-bound lookup, expiry and consumption checks
  (`apps/platform/src/worker.ts:228-243`), canonical proof storage before a D1
  batch (`apps/platform/src/worker.ts:263-324`), and proof retention metadata
  (`apps/platform/src/worker.ts:270-279`).

Risk: without a narrow adapter, configuration/deployment faults can be mistaken
for public 400s; client proof errors can leak internal labels; scores can be
written before all authority checks; concurrent submissions or object-store
failures can leave inconsistent state. Partition's existing write-before-D1
sequence can also leave an orphan R2 object on a race/failure, so it should be
reused deliberately rather than copied verbatim.

Bounded refactor:

- Add a game registry/isolated Maltline handler that resolves the immutable
  context, verifies and hashes in one call, and maps stable public rejection
  codes separately from configuration/infrastructure failures.
- Issue server-created, signed-session, active-season challenges that pin game,
  ruleset, campaign/config digest, board, seed/nonce policy, creation, and expiry.
- Atomically claim a challenge at most once. Persist only verifier-derived score,
  lives, progress, completion, resolved/exited/service metrics, and derived
  elapsed time; client display summaries are hints at most.
- Define compensating cleanup for orphan proof objects and failed D1 writes,
  proof retention/deletion, and retry/idempotency semantics.
- Derive elapsed time as the sum of each verified stage's ticks divided by that
  registered stage's tick rate. `totalTicks` alone becomes ambiguous if a future
  campaign uses mixed rates (`games/maltline/src/core/proof.ts:564-576`).

Acceptance criteria/tests:

- Foreign-session, inactive-season, wrong game/rules/config, expired, reused,
  and concurrent duplicate challenges fail; exactly one score can result.
- Invalid registered authority is a monitored 5xx/config failure; malformed
  proof is a stable public 4xx without stack/internal scenario detail.
- R2 failure, D1 failure, moderation failure, retry, and race tests leave either
  one complete score/proof pair or a discoverable/reaped orphan—never an
  authoritative row pointing to missing proof.
- Database ranking uses a documented total order with deterministic tie-breaks.
- Stored score fields are shown equal to independent verifier-derived values in
  end-to-end tests.

## Verification quality and versioning debt

### G1 — The “stable real-campaign proof” is generated by mutable test code

Severity: **medium-high**; must fix before treating the first public generation
as permanently reproducible

Evidence:

- `reactiveCampaignProof()` generates its input stream from the current campaign,
  current engine, and current reactive controller at test time
  (`games/maltline/tests/proof.test.ts:90-107`).
- Both the result assertions and golden hash use that dynamically produced proof
  (`games/maltline/tests/proof.test.ts:416-440,511-517`).

This catches unreviewed changes because the expected summary/hash will fail, but
it does not preserve an independent historical input vector. A controller edit
changes the proof producer; updating expectations can accidentally bless engine
or campaign drift at the same time.

Bounded refactor and acceptance:

- Commit a compact, static generation-2 RLE proof fixture or content-addressed
  artifact produced once by the controller. Assert its own byte/hash identity
  before simulation, then assert summary, per-stage ticks, and envelope hash.
- Keep the dynamic controller test separately as a tuning/solvability test.
- Add static generation-2 idle-loss and one-mistake/life-carry vectors so the
  compatibility suite is not only a perfect win path.
- A controller-only edit may change dynamic telemetry but cannot change static
  generation-2 verification expectations.

### G2 — Versioning depends on manual discipline and has no historical dispatch

Severity: **medium-high**; becomes a release blocker once a public generation
has accepted scores

Evidence:

- The ruleset version is a manually incremented number in the rules manifest,
  and the campaign generation is another manual constant
  (`games/maltline/src/core/rules.ts:9-28`,
  `games/maltline/src/core/version.ts:5-12`).
- RNG behavior is a separate implementation not represented in the rules
  manifest (`games/maltline/src/core/rng.ts:3-11`).
- The current verifier accepts only the current constants
  (`games/maltline/src/core/proof.ts:404-406,444-449`); there is no immutable
  generation-1/2 dispatch registry.
- The proof schema version and rich replay schema version correctly serve
  different purposes (`games/maltline/src/core/proof.ts:21-22`,
  `games/maltline/src/core/replay.ts:5-6`), but neither replaces an execution
  configuration identity.

Bounded refactor and acceptance:

- Introduce the registry/configuration digest from R1 and a release check that
  compares it to a committed expected value.
- Before launch, explicitly declare older experimental generations unsupported.
  After launch, preserve the verifier implementation/configuration for every
  retained public season, or define and enforce score/proof deletion before its
  verifier is removed.
- Golden vectors must fail if tick order, scoring, fixed-point behavior, RNG,
  input edges/repeat, scenario order/value, or initial state changes in place.
- `MALTLINE_PROOF_VERSION` changes only for wire-shape/interpretation changes;
  ruleset/campaign versions change for simulation authority changes.

### G3 — Current tests cover representative limits, not the exact hostile envelope

Severity: **medium**

Evidence:

- Proof limit tests mostly inject smaller caps and test one 60,001-tick record
  (`games/maltline/tests/proof.test.ts:269-288`).
- Ranked scenario tests exercise every category of tighter policy
  (`games/maltline/tests/proof.test.ts:367-414`), which is good, but not the
  cross-product/worst legal entity workload.
- The performance test checks the ordinary 21,662-tick campaign against a very
  generous two-second local threshold
  (`games/maltline/tests/proof.test.ts:416-440`).

Bounded additions:

- Exact-boundary/one-over tests for 60,000 ticks, 60,000 records, 32 stages,
  every ranked entity/timing ceiling, score headroom, identifiers, and request
  bytes.
- Property tests for arbitrary legal RLE segmentation, expand/canonicalize
  equivalence, idempotence, and negative-zero handling.
- A benchmark helper that reports ordinary and adversarial percentiles without
  a flaky tight CI assertion; enforce the real CPU threshold in Workers tests.
- A fuzz corpus for nested type substitutions, duplicate JSON keys, exponent
  overflow, prototype-like keys, and canonical serializer failures.

### G4 — The rich replay parser is intentionally shallow but publicly easy to misuse

Severity: **low cleanup**, unless rich replay upload/publication is exposed

Evidence:

- `parseMaltlineReplay` checks only top-level object/version/presence and returns
  a cast; it does not validate scenario, run, inputs, events, tick continuity,
  final state, or resources (`games/maltline/src/core/replay.ts:27-40`).
- It is exported from the package root beside the strict proof verifier
  (`games/maltline/src/index.ts:1-10`).

Acceptance:

- Keep it explicitly local/untrusted-for-ranking in names/docs, or implement a
  full bounded parser if rich replay files become public inputs.
- No Worker import or ranked path may treat a parsed rich replay as authority.

## Paid audio production blockers

These block running `--execute` and promoting generated assets. They do not
block the deterministic simulation or an intentionally silent build.

### A1 — Spend occurs before exclusive reservation

Severity: **critical for paid acquisition**

Evidence:

- The tool creates a shared directory, sends the paid request, downloads the
  response, and only then uses `writeFile(..., {flag: 'wx'})`
  (`games/maltline/tools/audio-production.mjs:170-203`).
- Assets are sequential only within one process
  (`games/maltline/tools/audio-production.mjs:296-299`); two processes are not
  serialized.
- Documentation says the tool “refuses to overwrite candidate files”
  (`docs/maltline/AUDIO.md:313-329`), which is true at write time but does not
  prevent the paid duplicate request.
- Authorization is a reusable literal environment value plus `--execute`
  (`games/maltline/tools/audio-production.mjs:286-294`), not approval bound to a
  particular plan or spend ceiling.

Risk: an existing candidate, partial earlier run, or concurrent process can be
charged before `wx` fails. A maximum valid plan permits 64 assets of up to 30
seconds (`games/maltline/tools/audio-production.mjs:84-85,113`), so a stale
approval environment can authorize a materially different and costly batch.

Bounded refactor:

1. Canonicalize/hash the validated plan and require approval of that exact hash
   plus explicit maximum assets/seconds/provider credits.
2. Preflight ffmpeg/ffprobe and every target path, then acquire an atomic
   per-plan/per-asset lock or reservation beneath staging **before** any fetch.
3. Define stale-lock inspection/recovery; never silently retry or regenerate a
   billable request.

Acceptance tests (offline with injected fakes only):

- Existing source/master/runtime/provenance or lock causes zero fetches.
- Two concurrent executions of one asset result in at most one mocked fetch.
- Changed plan hash, expired approval, or asset/duration/credit budget excess
  causes zero fetches.
- Failure releases or preserves a clearly recoverable lock according to the
  documented state machine; resume never re-bills automatically.

### A2 — Provenance is not durable across post-response failure

Severity: **high for paid acquisition/release provenance**

Evidence:

- Provider/request metadata is assembled only after normalization and hashing
  output files (`games/maltline/tools/audio-production.mjs:204-250`).
- The provenance manifest is the final file written
  (`games/maltline/tools/audio-production.mjs:251-255`).
- If ffmpeg/ffprobe fails, the paid source remains but no manifest records its
  request ID, trace ID, request body/hash, generation time, or rights
  attestation.

Bounded refactor:

- Write an atomic `pending` journal containing plan hash, asset identity,
  request identity, terms snapshot reference, and operator approval before the
  request. Immediately after a successful response, atomically persist source
  bytes plus provider response IDs/hash/status before invoking ffmpeg.
- Advance explicit states such as `reserved -> requested -> acquired ->
  normalized -> reviewed`; never overwrite history. A recovery command may
  normalize an acquired source but may not regenerate it automatically.

Acceptance tests:

- Inject response-write, ffmpeg, ffprobe, manifest-write, and process-crash
  failures. Every paid-response case leaves enough durable metadata and source
  hash to audit/recover, and none issues a second fetch on resume.
- Atomic rename/write behavior is tested; a partial manifest is never mistaken
  for a completed asset.

### A3 — Paid responses have no timeout or byte/decode boundary

Severity: **high for production tooling**

Evidence:

- `fetch` has no `AbortSignal`, deadline, or retry policy
  (`games/maltline/tools/audio-production.mjs:186-191`).
- Missing content type is accepted, any `audio/*` is accepted, and the complete
  body is buffered without a declared/streamed byte cap
  (`games/maltline/tools/audio-production.mjs:192-203`).
- Current tests replace only the high-level `executePlan`; they do not exercise
  the acquisition/normalization path
  (`games/maltline/tests/audio-production.test.ts:32-41,174-208`).

Bounded refactor:

- Inject fetch, filesystem, command runner, and clock into an execution core.
- Add one explicit timeout, maximum declared/streamed response size, strict
  expected media type, and decoder/probe validation before marking acquired.
- Do not automatically retry a billable POST. Surface request ID and recovery
  status without the credential or prompt content in routine logs.

Acceptance tests:

- Fully offline mocked tests cover timeout, abort, absent/incorrect content type,
  oversized declared and streamed bodies, empty/truncated/non-audio data, HTTP
  error, and success.
- A network tripwire fails the suite if the global network path is touched.
- Captured command arguments contain no API key and execution remains sequential
  within one locked plan.

## Audio cleanup before asset promotion

### C1 — Semantic plan validation is syntactic only

Severity: **medium**

`event` accepts any nonempty 64-character string
(`games/maltline/tools/audio-production.mjs:106-108`), and the ID regex permits
`ml_loop_*` on a one-shot or `ml_sfx_*` on a loop as long as `kind` agrees only
with the boolean flag (`games/maltline/tools/audio-production.mjs:101-119`). The
terms date validates calendar shape but can be future-dated or stale
(`games/maltline/tools/audio-production.mjs:75-83`).

Before asset promotion, use a known cue/event enum from the approved sound
matrix, enforce prefix-kind agreement, reject duplicate semantic cue/variant
assignments, and enforce a documented recency/not-in-future rights review. Tests
should cover all three mismatches.

### C2 — The manifest reports targets as if measured

Severity: **medium**

The one-pass filter targets `TP=-1`, but the manifest records
`truePeakDb: -1` while ffprobe gathers only duration/codec/rate/channels
(`games/maltline/tools/audio-production.mjs:147-167,237-244`). AUDIO.md correctly
admits this is audition normalization and requires later measurement
(`docs/maltline/AUDIO.md:367-369`). Rename target fields unambiguously and add a
measured EBU R128/true-peak report before selection; tests should reject a
release manifest that has targets but no measured results.

### C3 — Source/mastering choices are audition quality, not archival quality

Severity: **medium/low**

Only MP3 provider outputs are allowed, then decoded to WAV and encoded again to
Opus; output is forced mono (`games/maltline/tools/audio-production.mjs:24,
147-162`). This may be reasonable for tiny arcade cues but is weak for seamless
loops and does not preserve a lossless original. Before final assets, prefer a
lossless provider output if the pinned API/entitlement supports it, or record
the archival limitation. Run sample-boundary and repeated-loop click tests plus
human stereo/mono review.

### C4 — Current offline tests validate the gate, not the paid state machine

Severity: **medium**

The 31-test audio suite accurately covers plan shape/bounds and high-level CLI
authorization, but its injected `executePlan` skips all fetch, filesystem,
non-overwrite, sequential, spawn, normalization, and provenance behavior
(`games/maltline/tests/audio-production.test.ts:32-41,145-221`). Treat claims as
“offline plan and gate coverage,” not comprehensive production safety, until A1
through A3 have adapter-level offline tests.

### C5 — JavaScript tool typing is intentionally bypassed

Severity: **low cleanup**

The TypeScript suite needs `@ts-expect-error` to import the ESM script
(`games/maltline/tests/audio-production.test.ts:1-3`). A small typed core module
or checked JSDoc declarations would make injected adapter contracts visible to
the compiler without adding runtime dependencies.

## Platform boundary contract

The following sequence is the minimum safe Maltline path. It deliberately
reuses Partition's proven primitives while keeping Maltline authority specific:

1. Apply same-origin checks, signed anonymous session resolution, decoded body
   limit, and expensive rate limiting before verification.
2. Load the challenge by run ID and session; require active season, exact board,
   unexpired and unconsumed state, and a registered ruleset/campaign/config
   digest.
3. Resolve immutable Maltline authority from the server registry. Do not build
   campaign or initial run from request fields.
4. Strictly parse, verify, canonicalize, and hash through one authoritative
   facade. Treat proof rejection separately from registry/infrastructure faults.
5. Moderate the callsign independently. Never let moderation output influence
   simulation or hash identity.
6. Atomically consume the challenge and insert verifier-derived ranking fields;
   store the exact canonical envelope bytes/hash with explicit orphan and
   failure recovery.
7. Retain/decommission proof objects and historical verifier generations under
   one documented policy. Never reuse the telemetry FNV fingerprint as a
   security digest: it is explicitly non-security
   (`games/maltline/src/core/fingerprint.ts:42-49`), even though telemetry's
   campaign/config identity composition is a useful model
   (`games/maltline/src/telemetry/campaign-telemetry.ts:313-347`).

## Prioritized bounded work

1. **R1/R3:** add immutable registry + SHA-256 configuration identity and expose
   one verify-and-hash server facade.
2. **R2:** decide fixed-campaign nonce versus gameplay seed before designing the
   challenge schema or public integrity copy.
3. **R4/R5:** implement the Maltline Worker adapter with byte/CPU/rate budgets,
   stable error classes, challenge atomicity, derived ranking, and storage
   recovery tests.
4. **G1/G2:** freeze static generation-2 win/loss/mistake proof vectors and the
   supported-generation retention policy before accepting the first score.
5. **A1/A2/A3:** implement atomic spend reservation, plan-bound budget approval,
   acquisition journaling, and bounded injected network behavior before any
   operator sets the approval environment variable.
6. **G3/G4/C1-C5:** finish property/boundary coverage and cleanup when their
   related public replay or asset-promotion boundary becomes active.

## Claims this tree can and cannot support today

Supported:

- A strict input-only proof can reconstruct a terminal Maltline run under a
  supplied, normalized, bounded context and derive its score/progress.
- The current generation-2 campaign has a deterministic controller-generated
  result of 21,662 ticks, score 36,255, four lives, and 145
  fulfilled/resolved/exited customers, with the current expected envelope hash.
- Offline audio plan validation and the two execution gates work without
  exposing credentials in the tested CLI path.

Not yet supported:

- “Generation 2” alone identifies an immutable campaign/configuration.
- A challenge seed proves fresh or challenge-specific gameplay.
- Any structurally typed `VerifiedMaltlineProof` passed to the public hasher is
  authoritative.
- The 60,000-record protocol is affordable under production Worker concurrency.
- Maltline scores are session-bound, one-use, atomically stored, retained, or
  publicly rankable; no Maltline platform path exists yet.
- The audio tool is safe to use for paid generation, crash recovery, or release
  provenance merely because dry-run and gate tests pass.
