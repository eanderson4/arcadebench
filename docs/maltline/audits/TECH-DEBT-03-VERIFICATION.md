# TD-03: Maltline verification, platform, and audio safety review

Date: 2026-09-10

Scope: immutable generation-2 authority, proof envelope v2, canonical verifier
facade, static proof vectors, prospective Worker integration, and the hardened
offline audio acquisition scaffold/proposal

Disposition: adversarial review only. No product, Worker, task log, experiment
log, viewer, sitemap, or audio implementation was changed.

## Executive verdict

Maltline's core verification boundary is materially stronger than at TD-02. A
ranked caller can now use one public `verifyAndHashMaltlineProof` operation that
resolves a registered authority, derives the complete summary from engine
execution, canonicalizes adjacent equivalent RLE runs, constructs an envelope
that names the configuration SHA-256, and returns a deeply frozen envelope and
hash. The package root no longer exposes the structural verified-result hasher
or generic context verifier. The shared canonical serializer rejects
non-finite numbers, exotic objects, accessors, symbols, cycles, sparse/extended
arrays, and excessive depth. Static win, idle-loss, and one-mistake vectors are
independent of the reactive controller and pin proof and envelope hashes.

This is a credible **core primitive**, but it is not yet a public ranked system.
There are four verification/platform blockers:

1. the runtime registry trusts a hand-written digest rather than verifying that
   digest against its live frozen configuration;
2. the challenge `seed` still changes only the envelope hash, not gameplay, so
   a valid proof is transferable to every fresh challenge;
3. no Maltline Worker challenge, transport, rate-limit, error, persistence, or
   retention path exists; and
4. current proof limits and the existing Partition HTTP reader have not been
   turned into a measured Worker byte/CPU/concurrency budget.

The audio CLI remains offline by default and no candidate assets exist. Its
normal CLI path validates an exact plan, requires two execution gates, reserves
all candidates before requesting, performs one sequential request per asset,
journals acquisition before normalization, and never automatically retries.
Two issues should still block the first paid invocation: the exported execution
primitive can bypass plan validation when called directly, and preflight does
not reject symlinked staging/asset directories. Runtime Ogg decode validation
and crash-recovery ergonomics must be completed before any candidate is
promoted into product assets.

## Release decision

- **Block public Maltline leaderboard/Worker integration** on V1 through V5.
- **Block the first paid audio request** on A1 and A2.
- **Block audio asset promotion into the game** on A3 plus human rights,
  sublicensing-setting, listening, loudness, peak, and loop review.
- V6 through V11 and A4 through A7 are bounded cleanup or launch-discipline
  work, except where a finding explicitly becomes blocking after the first
  retained public score.
- Local silent play, local deterministic tests, offline audio dry-run, and the
  proposal review can continue.

## Validation baseline

The following read-only checks were run against this tree:

- `npm test -- --run` in `games/maltline`: **17 files, 270 tests passed**;
- `npm run build` in `games/maltline`: TypeScript and Vite build passed;
- `node --check games/maltline/tools/audio-production.mjs`: passed;
- `git diff --check`: passed; and
- `artifacts/maltline-audio/`: absent.

The JSON plan embedded in `AUDIO-BATCH-01.md` was parsed and passed to
`validatePlan` offline. It failed at the intentional
`commercialRightsBasis` placeholder, before an executable plan hash or any
network action. The document contains eight candidates, while its separate
approval template retains zero/placeholder ceilings.

A local Node 22 diagnostic expanded the static successful proof to one record
per tick. The accepted proof contained 21,662 input records and 1,445,121 JSON
bytes; `verifyAndHashMaltlineProof` completed in one measured run in about
54.77 ms and emitted 58,473 canonical envelope bytes. This is a useful sizing
point, not a Workers CPU guarantee: it excludes HTTP decoding, concurrent
requests, moderation, D1, R2, logging, and production isolate startup.

## Threat model and trust boundaries

Treat as hostile:

- every score body byte, proof field, array shape, input run, player name,
  content header, and repeated/concurrent submission;
- browser-generated `runId`, season, board, authority, digest, and seed values
  when echoed back to the server;
- compressed, missing-length, fragmented, deeply nested, and oversized HTTP
  input; and
- any claim that a proof demonstrates human or post-challenge play. A valid
  deterministic input stream can be generated, copied, or replayed by a bot.

Treat as trusted only after validation:

- the authority selected from a server-owned active-season record;
- the exact initial run and ordered campaign inside that authority;
- verifier-derived summary/ranking values;
- a session-bound, unexpired, atomically unconsumed challenge loaded from D1;
- canonical envelope bytes produced by the facade; and
- for audio, an operator-controlled validated plan, plan-bound approval,
  credential, clean staging root, and human rights/spend decision.

The configuration digest is an identity, not authentication. The proof SHA-256
detects byte changes but does not prove who played, when they played, or that
stored bytes came from the verifier. Those properties must come from server
challenge ownership, atomic persistence, access control, and retention policy.

## What is now sound

These properties are supported by code and tests and should be preserved:

- The authority copies and normalizes authored campaign data before freezing it
  (`games/maltline/src/core/authority.ts:77-99,107-114`). Mutation of the
  exported authored campaign after authority construction cannot alter the live
  registered scenarios.
- The configuration document includes game, ruleset, campaign generation,
  scenario/proof schemas, RNG identity/version, full rules manifest, ordered
  normalized campaign, exact initial run, and ranking policy
  (`games/maltline/src/core/authority.ts:54-70`).
- The facade resolves the exact four-field authority identity and builds its
  verifier context from the registry, not the submitted proof
  (`games/maltline/src/core/proof.ts:664-700,735-753`).
- The proof parser copies enumerable data properties, rejects symbols and
  exotic prototypes, bounds arrays/runs/ticks, rejects terminal continuation,
  requires a terminal outcome, and derives summary fields from engine state
  (`games/maltline/src/core/proof.ts:185-250,490-639`).
- The envelope v2 authority member carries the pinned configuration digest and
  the returned result is deeply frozen (`games/maltline/src/core/proof.ts:703-729,750-753`).
- Canonical JSON is one shared, explicit implementation for core identities and
  rejects unsafe runtime values (`games/maltline/src/core/fingerprint.ts:14-110`).
- Root exports include the safe facade but omit the generic verifier and former
  envelope/hash constructors (`games/maltline/src/index.ts:8-30`; guarded by
  `games/maltline/tests/authority.test.ts:314-320`).
- Static proofs are compact encoded literals that import only proof types, not
  the campaign, engine, or controller
  (`games/maltline/tests/fixtures/generation-2-proofs.ts:1-64`). Their canonical
  proof hashes, summaries, stage ticks, and envelope hashes are pinned
  (`games/maltline/tests/authority.test.ts:163-244`).
- Audio paid-path tests use injected fetch/filesystem/runner/time behavior and
  cover approval changes, expiry, concurrency, transport faults, decode faults,
  post-response failures, resumption, hash tampering, and credential secrecy
  (`games/maltline/tests/audio-production.test.ts:344-835`).

## Verification and platform release blockers

### V1 — The registry does not authenticate its live configuration digest

Severity: **critical before platform integration**

Evidence:

- The digest is a hand-written string
  (`games/maltline/src/core/authority.ts:102-105`).
- Production constructs the authority by passing that string into the same
  test-oriented factory that accepts any string
  (`games/maltline/src/core/authority.ts:73-100,107-110`).
- Registry resolution compares the submitted identity only to that retained
  string; it never recomputes SHA-256 over the live authority
  (`games/maltline/src/core/authority.ts:122-130`).
- The facade resolves and immediately simulates without a digest self-check
  (`games/maltline/src/core/proof.ts:739-749`).
- A test recomputes the digest (`games/maltline/tests/authority.test.ts:82-85`),
  but `npm run build` does not run the test suite. A deploy that skips tests, or
  a bad conflict resolution that updates the campaign/rules and not the literal,
  can therefore emit envelopes that claim the old digest while executing a new
  configuration.

Bounded fix:

1. Separate the test fixture constructor from production registration.
2. During registry initialization or the first facade call, canonicalize the
   live authority configuration and verify its SHA-256 against the pin. Cache
   only the successful promise/object in module scope; the facade is already
   async and WebCrypto works in Node and Workers.
3. Treat mismatch as a server configuration failure, never a client 4xx.
4. Add a build/release check as defense in depth, but do not make CI discipline
   the only runtime invariant.

Acceptance tests:

- An injected registry entry whose campaign, rules, RNG, initial run, schema, or
  ranking policy differs from its digest fails before engine construction.
- A matching registered authority verifies repeatedly without rehashing per
  request.
- A production build or Worker startup test fails on a stale digest literal.

### V2 — Challenge `seed` is a nonce-shaped field with no gameplay effect

Severity: **high; product/security decision required before ranked launch**

Evidence:

- A server challenge contains `seed` (`games/maltline/src/core/proof.ts:126-136`).
- The facade uses only the registered campaign and initial run to simulate; the
  challenge is not passed to the engine (`games/maltline/src/core/proof.ts:739-749`).
- The seed is copied only into the retained envelope
  (`games/maltline/src/core/proof.ts:720-725`).
- Scenario RNG seeds are fixed inside the registered campaign configuration.
- Tests prove a changed challenge seed changes the envelope hash
  (`games/maltline/tests/authority.test.ts:246-278`); they do not and cannot show
  that a proof valid for seed A fails simulation under seed B.

Risk: the static golden—or any solver-produced proof—can be submitted for every
fresh challenge. A session-bound one-use challenge can stop duplicate submission
of one `runId`, but it cannot establish post-challenge play or resist proof
precomputation. Calling this field a gameplay seed would overstate security.

Bounded decision/fix:

- **Fixed fair campaign:** rename `seed` to `nonce` in the server challenge and
  next envelope wire version, explicitly state that proofs are transferable,
  and rely on expiry, session binding, one-use consumption, rate limits, and bot
  policy. This does not require proof v2 because proof interpretation is
  unchanged.
- **Seeded campaign:** put a deterministic server-seed derivation policy in the
  authority configuration, derive all stage RNG inputs from it, tune across a
  measured seed sample, and reject proof A under challenge B during replay.
  This changes simulation authority and requires deliberate ruleset/campaign
  versioning and new goldens.

Acceptance tests must match the chosen claim. In either design, foreign-session,
expired, reused, and two concurrent submissions of one challenge must fail
atomically.

### V3 — The facade accepts a server challenge, but no server owns one yet

Severity: **high; release blocker**

Evidence:

- `verifyAndHashMaltlineProof` correctly names its second input as a server
  challenge, but it is runtime `unknown` and validates only shape/registered
  identity (`games/maltline/src/core/proof.ts:685-700,735-743`). Core code cannot
  prove that the run, season, board, and authority came from D1 rather than the
  score body.
- The current platform imports only Partition and hard-codes Partition's API
  prefix and verifier (`apps/platform/src/worker.ts:1-16,525-552`).
- Existing Partition challenge lookup demonstrates session, board, version,
  consumed, and expiry checks (`apps/platform/src/worker.ts:228-243`), but its
  stored row has no Maltline authority/configuration digest.

Exact Worker boundary required:

1. Begin-run resolves the active Maltline season to one verified registered
   authority and stores its complete identity/digest beside the session-owned
   challenge. The browser may receive that identity, but cannot select it.
2. Submission accepts only `runId`, callsign, and proof from the client. Load the
   challenge by `{runId, sessionId}`, check active/allowed season, board,
   authority, expiry, and unconsumed state, then construct
   `MaltlineServerChallenge` from that row.
3. Pass that server object and only the raw proof to the facade. Never copy
   client score, lives, stage progress, authority, season, or seed into the
   authoritative call or score row.
4. Map `MaltlineProofError` to a stable sanitized 4xx. Registry/digest mismatch,
   engine invariant failure, crypto failure, and persistence failure are
   monitored 5xx conditions.

Acceptance tests must include client authority/season/seed injection, a changed
database digest, foreign session, closed season, expiry, reuse, concurrency, and
an assertion that every persisted ranking field equals the facade envelope
summary.

### V4 — Core bounds are not a Worker transport or CPU budget

Severity: **high; release blocker**

Evidence:

- Core protocol caps allow 60,000 raw input records, 60,000 ticks per stage, and
  60,000 total expanded ticks (`games/maltline/src/core/proof.ts:31-34`).
- Proof arrays allocate an expected-key `Set` and a copied array before replay
  (`games/maltline/src/core/proof.ts:227-250`).
- The facade serializes the full envelope once, then `sha256Canonical`
  serializes it a second time (`games/maltline/src/core/proof.ts:750-753`;
  `games/maltline/src/core/fingerprint.ts:104-109`).
- Existing platform `readJson` checks declared length, then materializes the
  entire `request.text()` before checking decoded bytes
  (`apps/platform/src/http.ts:18-30`). Its Partition score cap is 8 MiB
  (`apps/platform/src/worker.ts:14-18`), not a Maltline measurement.
- The 1.45 MiB/21,662-record local diagnostic took about 54.77 ms for the facade
  alone. The normal static winning proof is roughly 58 KiB, showing that
  pathological segmentation is much larger than legitimate canonical RLE.

Bounded fix:

1. Measure browser-produced Maltline proofs at normal, mistake-heavy, and slow
   valid play, plus one-record-per-tick and one-over-limit adversarial inputs in
   the actual Workers test pool.
2. Set separate declared-body, decoded-body, input-record, expanded-tick, wall
   time/CPU, and concurrent expensive-request budgets. Do not inherit
   Partition's 8 MiB value.
3. Reject unsupported content encodings and oversized declared bodies before
   reading. If unknown/chunked bodies are accepted, read a bounded stream rather
   than calling `request.text()` first.
4. Hash the already-produced canonical UTF-8 bytes rather than canonicalizing
   twice. Consider returning bytes/string according to the storage boundary so
   the Worker does not retain redundant body, object, and canonical copies.
5. Apply the existing edge/D1 expensive rate-limit pattern before parsing and
   verifying (`apps/platform/src/session.ts:60-80`).

Acceptance tests: exact byte/tick/run boundaries and one-over, chunked and
declared-length bodies, unsupported encodings, fragmented-but-valid RLE,
concurrent worst cases, and a generous but explicit Workers CPU regression
budget. A limit failure must not moderate a name, touch R2, or consume a
challenge.

### V5 — Existing platform storage and ranking cannot represent Maltline safely

Severity: **high; release blocker**

Evidence:

- `run_challenges` requires Partition difficulty and stores no authority digest,
  ruleset, proof schema, or envelope version
  (`apps/platform/migrations/0001_public_platform.sql:25-39`).
- `scores` requires Partition elapsed/partition fields and has no Maltline score,
  lives, total ticks, fulfillment, resolved, or exited columns
  (`apps/platform/migrations/0001_public_platform.sql:52-76`).
- Maltline's authority declares a ranking order, but it is data only and lacks a
  deterministic final tie-break (`games/maltline/src/core/authority.ts:21-30`).
- Partition stores R2 proof bytes before atomically consuming the challenge and
  inserting D1 score state (`apps/platform/src/worker.ts:263-324`). Two racing
  submissions or a D1 failure can leave an object that no database cleanup query
  can discover.

Bounded fix:

- Add Maltline-compatible challenge/score columns or game-specific tables. Pin
  authority digest and protocol versions in both the season/challenge lineage
  and retained envelope metadata.
- Translate `MALTLINE_RANKING_POLICY` into one reviewed SQL total order and append
  stable `created_at`/`id` tie-breakers. Add matching indexes and query tests.
- Persist exactly the facade's canonical bytes and SHA-256. Store only
  verifier-derived score/lives/progress/ticks/counters.
- Design R2/D1 recovery before copying Partition's write order: deterministic
  object keys, pending/final state, conditional writes, and/or an orphan ledger
  that scheduled cleanup can enumerate. Concurrent submissions must yield one
  score and no undiscoverable object.
- Decide proof retention and score survivability together; a retained score must
  say whether its proof is available, expired, or deliberately deleted.

Acceptance: failure injection at every R2/D1/moderation boundary; exactly one
consumed challenge and score under concurrency; exact byte/hash equality among
facade output, R2 body, metadata, and D1; deterministic leaderboard ordering;
and cleanup of every orphan/final proof state.

## Paid audio blockers

### A1 — Direct execution bypasses plan validation and path-safe asset IDs

Severity: **high before any paid execution**

Evidence:

- The CLI validates parsed JSON before authorization and execution
  (`games/maltline/tools/audio-production.mjs:976-1007`).
- `executeApprovedPlan` is separately exported. It validates the structural
  authorization and approval budget, but does not call `validatePlan`
  (`games/maltline/tools/audio-production.mjs:911-930`).
- Its plan hash and budget functions operate directly on the supplied object
  (`games/maltline/tools/audio-production.mjs:172-190,273-301`).
- Asset IDs flow into `join(stagingRoot, asset.id)` and every output filename
  (`games/maltline/tools/audio-production.mjs:339-351`). A direct caller can
  therefore bypass the CLI's lowercase naming regex and supply traversal or
  malformed request fields while constructing a matching structural approval.
- Offline tests call the direct function only with previously normalized plans;
  there is no rejection test for a raw direct-call plan
  (`games/maltline/tests/audio-production.test.ts:446-835`).

Bounded fix: make `executeApprovedPlan` re-run `validatePlan` using its execution
clock before authorization/preflight, and use only that returned frozen copy.
Recompute the plan hash/budget against the normalized copy. Alternatively keep
one exported CLI operation and make the injected executor module-private, but
tests still need a safe seam.

Acceptance: direct calls with extra keys, invalid IDs, `..`, separators,
accessors, stale terms, unsupported event/model/format, too many assets, and
changed post-authorization objects all fail before tools, filesystem mutation,
or fetch.

### A2 — Reservation does not reject symlinked staging paths

Severity: **high before a credential-bearing operator runs the tool**

Evidence:

- Asset paths are joined beneath a nominal staging root
  (`games/maltline/tools/audio-production.mjs:339-351`).
- Reservation calls recursive `mkdir`, then writes an exclusive lock
  (`games/maltline/tools/audio-production.mjs:826-842`).
- Existing target checks use `lstat` on final candidate paths
  (`games/maltline/tools/audio-production.mjs:354-362,858-871`), but no code
  resolves the real staging root or rejects symlinked root/asset-directory path
  components. `mkdir({recursive:true})` succeeds through an existing symlink.

Risk: a malicious or stale workspace symlink can redirect lock, journal, source,
and normalized output writes outside `artifacts/maltline-audio`, contradicting
the documented containment claim. `wx` prevents overwrite of an existing final
file but does not restore containment.

Bounded fix: establish/create the staging root, resolve its real path, reject
symlinks for the root and every asset directory component, and verify every
resolved parent remains beneath that root before locks or preflight. Continue to
use exclusive final writes/hard links.

Acceptance: symlinked staging root, asset directory, parent swap, traversal ID,
existing special file, and concurrent reservation tests fail before fetch and
leave all out-of-root canaries unchanged.

## Required before audio promotion

### A3 — Runtime Ogg output is hashed but never decoded/probed

Severity: **medium-high; asset-promotion blocker**

Evidence:

- Normalization runs ffmpeg for the WAV and Ogg outputs, then probes only the
  work master (`games/maltline/tools/audio-production.mjs:541-566`).
- Both work files are read and hashed into the manifest
  (`games/maltline/tools/audio-production.mjs:689-712,633-636`), but a hash proves
  identity, not that the Ogg is valid Opus, mono, 48 kHz, complete, or duration
  matched.
- Tests' fake runner writes arbitrary `test-opus` bytes for the runtime and still
  reaches `completed` (`games/maltline/tests/audio-production.test.ts:130-147`).

Bounded fix: ffprobe both master and runtime before `normalization_ready`; require
codec/sample rate/channels, finite duration, stream count, and a small master vs
runtime duration tolerance. Record both probes. Bound output file sizes before
reading them into memory.

Acceptance: truncated/empty/wrong-codec/wrong-rate/multi-stream Ogg, duration
drift, and oversized ffmpeg output fail while preserving the paid source and a
resumable journal.

## Verification/versioning debt and cleanup

### V6 — Acceptance/resource policy is outside the authority digest

Severity: **medium-high; fix before promising long-term reproducibility**

The authority digest includes ranking policy but not the ranked scenario
ceilings or proof record/tick limits. Those live separately in
`proof.ts` (`games/maltline/src/core/proof.ts:31-54,311-408`) and the facade uses
their defaults. Lowering a limit can make a formerly acceptable canonical proof
fail while the authority digest stays unchanged; raising it changes attack
surface under the same identity.

Add a frozen verification-policy identifier and exact limits to the authority
configuration, or explicitly version acceptance policy in the envelope/season.
The Worker may enforce tighter deployment transport limits, but the distinction
between wire validity, registered verification policy, and deployment budget
must be named and tested.

### V7 — The registry is not yet a historical verifier registry

Severity: **medium-high now; release blocker after the first retained score**

The registry contains only generation 2 (`games/maltline/src/core/authority.ts:112-114`),
while proof types and verifier checks are compiled against only the current
ruleset/campaign constants (`games/maltline/src/core/proof.ts:66-70,461-463,501-506`).
Adding an older data entry later would not restore its older engine behavior.

Before launch, state that experimental generations are unsupported. At first
public acceptance, commit to one of two policies:

- retain an executable verifier/authority dispatch implementation for every
  proof retained or score subject to audit; or
- expire/delete proofs and associated audit claims before removing their
  verifier, with explicit UI/database state.

Add a retained-envelope parser that validates envelope v2, recomputes its hash,
resolves the historical authority, reruns its proof, and compares every summary
field. Test old/current dispatch before introducing generation 3.

### V8 — The digest identifies declared rules, not all engine semantics

Severity: **medium-high process debt**

`MALTLINE_RULES` captures scoring constants, fixed scale, initial delay, requeue
count, and high-level tick order (`games/maltline/src/core/rules.ts:9-28`). The
engine also contains score-affecting semantics that are not data in that
manifest—for example exactly two RNG draws, crowded-lane threshold `2`, target
selection order, collision inequalities, and early terminal sequencing
(`games/maltline/src/core/engine.ts:126-140,182-217,220-386`). Changing such code
without bumping the ruleset leaves the configuration digest unchanged.

The three static fixtures are valuable independent tripwires, not a code hash or
complete semantic proof. Preserve targeted engine tests for every life-loss,
requeue, collision/tie, RNG, input-edge, stage-carry, and terminal-order path.
Add a release check requiring an explicit ruleset decision whenever engine,
input normalization, scenario quantization, or RNG implementation changes. A
ruleset bump must retain the former verifier if its proofs remain auditable.

### V9 — Ranking policy is declarative and not a total order

Severity: **medium; Worker prerequisite already covered by V5**

The authority ranks completed, stage reached, score, total ticks, and fulfilled
(`games/maltline/src/core/authority.ts:21-30`). Multiple runs can tie on all five.
No comparator or SQL assertion proves that platform queries follow this order.

Specify whether completion or stage progress is primary, add stable final
`createdAt` then `id` tie-breaks, implement one reusable comparator/order
definition, and test TypeScript ordering against D1 results and indexes on a
tie-heavy fixture set.

### V10 — Canonical JSON is hardened but breadth-unbounded as a public utility

Severity: **medium-low cleanup**

Depth, type, prototype, symbol, accessor, and cycle handling are strong
(`games/maltline/src/core/fingerprint.ts:22-83`). Arrays allocate an index-key
set and serialized item list proportional to caller-provided breadth
(`games/maltline/src/core/fingerprint.ts:46-62`), and plain objects have no
node/key/string/byte cap. Facade values are already constrained by proof and
challenge bounds, so this is not a current verifier bypass. The root nevertheless
exports the generic serializer/hash (`games/maltline/src/index.ts:3`).

Document it as requiring a caller-owned resource boundary or accept optional
node/string/output caps. Test exact depth and breadth limits. Avoid using it on
raw Worker request data before the proof parser.

### V11 — Public server surface and static fixtures can be tightened

Severity: **low cleanup**

- The package exports only root (`games/maltline/package.json:7-9`), which keeps
  the generic `verifyMaltlineProofWithContextForTesting` off supported package
  imports. Monorepo relative imports can still reach it in
  `games/maltline/src/core/proof.ts:490`. Move it to an internal/test module or
  enforce a lint/import boundary before Worker code lands.
- Root also exports mutable authored campaign data, raw engine utilities, and
  telemetry (`games/maltline/src/index.ts:1-7,31-34`). Authority snapshotting
  prevents mutation from altering registered generation 2, but a dedicated
  `./server` export would reduce Worker bundle and misuse surface.
- Static proof objects are only shallow-frozen and are decoded by executable
  fixture code (`games/maltline/tests/fixtures/generation-2-proofs.ts:22-64`).
  Their expected canonical hashes catch semantic changes, and they do not import
  the controller, so independence is adequate. Deep-freeze them and optionally
  retain canonical JSON/raw encoded SHA values to reduce order-dependent test
  mutation and simplify archival inspection.
- Challenge identifiers accept any nonempty string up to 128 characters
  (`games/maltline/src/core/proof.ts:657-661`). Server-generated values make this
  low risk; still use explicit ASCII ID formats at issuance/storage boundaries.

## Audio debt and cleanup

### A4 — Crash safety is fail-closed on rebilling but not automatically repairable

Severity: **medium**

The paid response lifecycle appends `response_received`, writes the source, then
appends `acquired` (`games/maltline/tools/audio-production.mjs:641-678`). A crash
or append failure in either gap can leave a billed request with no resumable
`acquired` record, or a source file whose journal refuses recovery. This is
safer than retrying: resume explicitly refuses any request without an acquired
record (`games/maltline/tools/audio-production.mjs:765-790`), and the docs require
manual reconciliation (`docs/maltline/AUDIO.md:378-390`).

Before scaling beyond a small supervised batch, add a read-only reconciliation
command that reports request/source/journal state without fetching, can salvage
only a hash-verified source under explicit operator approval, and never silently
turns `request_started` into retry permission. Add abrupt-stop/partial-final-line
tests. Consider checksummed journal records and fsync/atomic rename where host
support permits.

### A5 — Multi-asset resume cannot continue an unrequested tail

Severity: **medium-low operational debt**

All journals are reserved before the first fetch (`games/maltline/tools/audio-production.mjs:826-904`).
If asset 1 completes and asset 2 fails before acquisition—or approval expires
before asset 2—`--resume` accepts asset 1 but refuses asset 2 because it has no
`acquired` record (`games/maltline/tools/audio-production.mjs:765-780`). This
prevents accidental rebilling but strands the remainder of the plan.

Keep the first paid batch small. Later add explicit per-asset approval/attempt
state or a command that creates a new plan/version for never-requested assets
without colliding with old journals. Test expiry and failure at each asset
boundary with exact fetch counts.

### A6 — Tool subprocesses and derivative sizes are not bounded

Severity: **medium-low**

The provider request has a 60-second abort and 16 MiB streamed response cap
(`games/maltline/tools/audio-production.mjs:35-37,438-500`). `ffmpeg`/`ffprobe`
subprocesses have no timeout or stdout/stderr cap
(`games/maltline/tools/audio-production.mjs:321-337`), and normalized work files
are read whole before any size check (`games/maltline/tools/audio-production.mjs:689-703`).
These do not cause another paid request and the source remains journaled, but a
bad tool/file can hang or exhaust a workstation process. Add subprocess time and
output caps plus derivative byte ceilings before unattended bulk use.

### A7 — Proposal is safely non-executable, but owner evidence is external

Severity: **informational until approval**

`AUDIO-BATCH-01.md` deliberately limits the diagnostic batch to four cue
families, two candidates each, 6.0 requested seconds, and a conservative 120
credits (`docs/maltline/AUDIO-BATCH-01.md:17-74`). It defines blind review and
clear rejection thresholds (`docs/maltline/AUDIO-BATCH-01.md:76-145`) and leaves
rights/date/hash/expiry/ceilings invalid (`docs/maltline/AUDIO-BATCH-01.md:147-306`).

The operator still must personally confirm current paid-plan commercial rights,
format entitlement, current terms/pricing, prompt rights, and the account's
sublicensing/opt-out setting. The plan/manifest schema records paid-subscription
basis and review date, but not the sublicensing setting itself
(`games/maltline/tools/audio-production.mjs:193-270,597-638`). If that decision
must be auditable later, add a non-secret decision/evidence reference or signed
release checklist field; do not put account secrets or invoices in the public
manifest.

Also reconcile the filename documentation before promotion: `AUDIO.md` shows
`<event>_vNNN_<variant>` (`docs/maltline/AUDIO.md:237-249`), while the validator
and Batch 01 use `<event>_<variant>_vNNN`
(`games/maltline/tools/audio-production.mjs:232-240`;
`docs/maltline/AUDIO-BATCH-01.md:40-49`). The tool is internally consistent, but
the release naming convention is not.

## Recommended order of work

1. **V1:** make registry digest verification fail closed at runtime/startup.
2. **V2:** decide and document fixed-campaign nonce versus gameplay seed.
3. **V3/V4/V5:** design the Maltline Worker boundary, migrations, bounded body
   reader, Worker-runtime CPU tests, atomic challenge/persistence flow, and total
   ranking order together.
4. **V6/V7/V8:** bind acceptance policy, declare prelaunch generation support,
   and establish the first public ruleset-retention/release discipline.
5. **A1/A2:** validate the direct executor boundary and enforce real-path
   containment before any paid call.
6. **A3:** validate and bound runtime derivatives before any asset promotion.
7. **A4-A7/V9-V11:** finish recovery, documentation, public-surface, and fixture
   cleanup without blocking local gameplay.

## Claims the current tree can and cannot support

Supported now:

- A strict input-only proof can be replayed against the copied/frozen
  generation-2 campaign, and all retained score/progress fields come from the
  engine.
- Equivalent adjacent RLE segmentation and object key order produce one
  canonical envelope/hash.
- The envelope names a configuration digest and the checked-in configuration
  currently matches its golden digest in tests.
- Static generation-2 win, loss, and one-walkout/life-carry inputs reproduce
  pinned summaries and hashes independently of the controller.
- The documented audio CLI is dry-run by default and offline tests show its
  normal paid path is plan-bound, bounded, sequential, no-retry, and recoverable
  after journaled acquisition.

Not supported yet:

- that a deployed registry can never run with a stale/mislabelled digest;
- that the challenge seed affects gameplay or proves post-challenge human play;
- that Maltline has a session-bound, one-use, resource-bounded, atomically
  persisted public leaderboard path;
- that current Node timings fit Workers limits under hostile concurrency;
- that every retained public proof remains verifiable after a future ruleset or
  campaign ships; or
- that paid audio execution or any candidate's commercial rights, sublicensing
  status, final loudness/peak, loop quality, and runtime decode have been
  approved.
