# TD-01: Maltline Verification Foundation Review

Date: 2026-09-10

Scope: the current input-only proof, rich replay generation/parser, verifier,
and their engine/campaign dependencies after EXP-010/EXP-011

Disposition: review only; no code changed

## Verdict

The input-only design is the right trust boundary. A submitted proof cannot
directly choose a scenario, seed, starting lives/score, event stream, final
state, or claimed outcome. Strict exact-key parsing, per-value type checks,
ordered stage matching, terminal enforcement, server-derived continuity,
run-length canonicalization, and hard run/tick ceilings are all materially
stronger than the original rich replay as a ranked artifact.

It is not ready to connect to a public score endpoint. Two core issues must be
fixed first:

1. **An accepted proof has no ruleset/campaign identity.** Proof `version: 1`
   versions only the JSON shape. The same canonical proof bytes can produce a
   different score if engine behavior or a scenario changes while stage IDs stay
   the same.
2. **“Trusted context” is insufficiently validated and insufficiently pinned.**
   Only campaign length/IDs and the initial run's integer shape are checked.
   Invalid or extreme scenario values can produce trivial wins, unsafe numeric
   results, generic exceptions, excessive allocation, or superlinear work.

The platform tranche should begin only after those are addressed. Request-size,
challenge, hash-envelope, transaction, and Worker CPU controls must land with
the endpoint; they cannot be proven by this core function alone.

## Evidence gathered

- Inspected `src/core/proof.ts`, `replay.ts`, `types.ts`, `engine.ts`,
  `campaign.ts`, all proof tests, and the current campaign telemetry tests.
- Re-ran the focused proof suite: **1 file / 21 tests passed in 107 ms**.
- On Node 22.19.0, a 60,000-tick nonterminal proof with 20 resident customers
  took approximately **45.95 ms** inside the verifier. The same tick count split
  into 60,000 alternating RLE records took approximately **72.19 ms**. These are
  local indicative measurements, not a Workers CPU guarantee.
- A worst-shape 60,000-record JSON proof is approximately **4,020,075 bytes
  (3.83 MiB)** before the score-submission envelope.
- A context with `customerCount: 0` passed context validation and produced a
  one-tick stage win/bonus. A context with `lanes: 0` escaped as a generic engine
  `Error`. An initial run using `Number.MAX_SAFE_INTEGER` for both lives and score
  was accepted and produced an unsafe derived score (`Number.isSafeInteger`
  false). These are server-configuration attacks/defects, not fields the current
  client proof can send, but they disprove the stronger claim that the verifier
  is safe for arbitrary supplied context.

## What is already sound

### Trust boundary

- The proof schema contains only a protocol version, ordered stage assertions,
  and per-tick controls encoded as runs.
- `requiredExactObject` rejects missing and extra enumerable JSON keys at proof,
  stage, and input-run levels.
- Directions are restricted to `-1`, `0`, or `1`; actions must be actual
  booleans; run lengths must be positive bounded safe integers.
- Scenario, seed, initial context, events, final state, and score are not proof
  fields. Attempts to inject them are rejected as unknown keys.

### Execution and continuity

- The engine is reconstructed for each expected server stage.
- Stage IDs are assertions against the expected ordered index, not selectors.
- Lives and score carry from the preceding reconstructed final state.
- Input after terminal, a nonterminal final prefix, continuation after loss, and
  a winning-but-incomplete campaign prefix reject.
- A losing terminal prefix is valid as a completed arcade attempt; a final-stage
  win marks a complete campaign.

### Canonicalization and limits

- Negative zero is normalized to zero and adjacent identical input runs merge.
- Raw RLE record count is bounded before record traversal; expanded per-stage
  and run tick counts are bounded during verification.
- The canonical output is reconstructed from sanitized values, so raw property
  order and alternate RLE segmentation need not affect its later canonical JSON
  hash.

These properties should be preserved through refactoring.

## Must fix before platform integration

### M1 — Bind proof execution to an immutable ruleset and campaign generation

Severity: critical

`MALTLINE_PROOF_VERSION` identifies only the wire schema. Rich replay version 2
identifies its fulfillment-aware state/event shape, but neither value pins:

- engine tick order and collision semantics;
- scoring constants and terminal behavior;
- RNG algorithm;
- campaign scenario values and stage order;
- fixed-point scale/conversion behavior; or
- input edge/repeat semantics.

Because `stageId` is the only campaign assertion, changing stage data in place
under the same IDs lets identical canonical proof bytes verify to a different
summary. Hashing only `verified.proof` would therefore create an ambiguous proof
identity.

Required change:

- Export a game ID and immutable ruleset/game version distinct from proof schema
  and rich replay versions.
- Give the ordered campaign an explicit generation/version or canonical content
  digest.
- Make the active server season/challenge pin game version, campaign generation,
  board, and any gameplay seed policy.
- Dispatch to a verifier implementation by supported ruleset version; never run
  an old challenge under the latest imported engine.
- Hash a server-canonical envelope containing game ID, ruleset version,
  campaign generation/digest, challenge gameplay context, and canonical proof.
- Add golden proof -> summary/hash vectors that must remain stable within a
  generation. Any behavior-changing engine/campaign edit requires a new one.

The client need not be authoritative for these fields. They may be present in
the submission envelope as assertions, but the server challenge decides them.

### M2 — Fully validate and normalize verifier context

Severity: high

`validateContext` currently checks only campaign size, unique bounded IDs, and
positive/safe initial lives plus nonnegative/safe score. It does not validate any
other scenario field. The engine constructor checks only nonempty lanes and
stations, and scenario objects remain structurally mutable.

Consequences demonstrated or directly reachable from trusted misconfiguration:

- `customerCount: 0` yields a trivial one-tick win and life bonus.
- zero/fractional/negative movement or cadence values create malformed or
  nonterminating behavior until the proof cap.
- a huge `lanes` value reaches `new Array(lanes)` during spawning and can exhaust
  memory before tick limits help.
- huge customer/entity bounds can make each tick increasingly expensive.
- extreme initial lives/score can make score arithmetic exceed safe integers.
- malformed scenarios can throw ordinary `Error`/`RangeError`, bypassing the
  verifier's domain-error classification.

Required change:

- Prefer resolving a registered frozen campaign by `{rulesetVersion,
  campaignVersion}` inside a narrow trusted adapter rather than accepting an
  arbitrary scenario array from application code.
- At minimum, normalize and validate every scenario field: exact shape; bounded
  strings; integer tick rate, lanes, stations, pool, timers, counts, repeat
  cadences, seed; supported unique flavors; positive bounded fixed-point speeds;
  threshold range; and explicit entity/score bounds.
- Convert score-affecting movement values to canonical fixed-point integers in
  the generation, rather than leaving floats as authoritative context.
- Bound initial lives and score so all reachable state/score arithmetic remains
  safe-integer. A full ranked run should normally require authored initial lives
  and score zero.
- Clone and deep-freeze normalized scenarios/campaigns. The exported mutable
  `MALTLINE_CAMPAIGN` must not be the live season authority.
- Treat invalid trusted configuration as a deployment/configuration failure,
  not a client 400, while guaranteeing it cannot create a score.

### M3 — Define the canonical hash contract at integration time

Severity: high

The core correctly returns sanitized/merged proof data but does not serialize or
hash it. That separation is reasonable, yet the platform must not hash the raw
request or the bare proof. Bare proof identity omits its execution context; raw
JSON preserves irrelevant property/RLE differences and duplicate-key parser
semantics.

Required platform contract:

1. Strictly parse and verify.
2. Build a fresh envelope from server IDs/context plus `verified.proof`.
3. Canonically serialize that envelope.
4. Hash/store those exact canonical bytes.
5. Store only `verified.summary`-derived leaderboard values.

Add tests proving property-order and split/merged RLE variants hash identically,
while a one-tick input or any pinned generation/seed difference changes the
hash.

### M4 — Add transport and computational abuse boundaries with the endpoint

Severity: high

Core tick/run ceilings do not bound bytes before JSON decoding, HTTP content
encoding, nesting outside the accepted shape, request frequency, or concurrent
CPU. The 60,000-record legal worst shape is already about 3.83 MiB. Local Node
verification measured ~46–72 ms for adversarial 60,000-tick shapes before Worker
request parsing, canonical serialization, hashing, moderation, and storage.

Required platform controls:

- enforce declared and decoded body-byte limits before verification;
- reject unsupported content encodings or prove decoded-byte enforcement;
- retain the 60,000 expanded-tick hard cap, but derive a lower legitimate RLE
  record distribution from human/browser traces and decide whether 60,000 raw
  runs is necessary;
- benchmark worst legal single-run, maximum-record, and maximum-entity proofs in
  the Workers test pool and deployed environment;
- set CPU/request/rate-limit budgets from those measurements;
- reuse the expensive endpoint edge limiter plus exact per-session D1 limiter;
- constrain concurrent submission and make one challenge atomically consumable;
- observe rejection reason and CPU histograms without logging replay bodies.

Do not lower the expanded tick cap below the measured 5–15 minute product target
just to meet a CPU budget. Optimize snapshots/engine execution or proof encoding
if needed.

### M5 — Remove avoidable per-tick snapshot work or prove it affordable

Severity: medium-high

The verifier calls `engine.snapshot()` to check terminal state before every
step. `engine.step()` then always constructs and returns another full snapshot.
With current campaign entity counts this was tolerable locally, but it doubles
snapshot cloning on the hottest path and ties verifier cost to all future state
fields/entities.

Required before public exposure: keep the last returned state/status locally so
the pre-step snapshot is not repeated, or add a minimal engine status/step API.
Then remeasure worst legal proofs. A performance regression test should cover the
actual Worker runtime; a loose local wall-clock assertion is insufficient.

### M6 — Prove current authored campaign compatibility end to end

Severity: medium-high

Proof tests use tiny artificial scenarios with values the future context
validator should reject or restrict (`blendTicks: 1`, speeds of 100, etc.). This
is useful for focused logic but does not show that the real campaign recorder,
RLE encoder, verifier, score summary, and stage continuity agree.

Required change:

- Capture the checked-in reactive controller's current eight-stage canonical
  input stream.
- Encode and verify it against the actual normalized ranked campaign.
- Assert current known totals (14,120 ticks, eight wins, 25,930 score, three
  lives, 108 fulfilled/service actions) or their intentionally superseding
  generation values.
- Verify an actual campaign idle loss and one mistake/life-carry run.
- Store compact golden digests so behavior drift is visible without checking in
  huge expanded fixtures.

This bridges the current separate telemetry and synthetic proof suites.

## Must land during platform integration

These are not defects the core verifier can solve alone, but the public route is
unsafe without them:

1. A same-origin write policy, HMAC session, server-issued expiring challenge,
   active season/version check, and expensive rate limits.
2. Challenge binding to game/campaign/board/seed context and server creation
   time. Reject expired, foreign-session, mismatched, and reused challenges.
3. Exact comparison of any client display-summary hint to `verified.summary`, or
   omit the hint. Never persist submitted score fields.
4. Atomic challenge consumption and score insertion under concurrent double
   submission; explicit recovery/cleanup for proof-object storage failures and
   orphans.
5. Canonical proof envelope hash, bounded R2 retention, permanent summary/hash,
   and cleanup integration tests.
6. Ranking semantics and a total server/database comparator. Score, progress,
   completion, and tick time need stable tie-breaks.
7. If simulated duration is used competitively, derive it from verified
   per-stage ticks and pinned tick rates. `totalTicks` alone becomes ambiguous if
   future stages use different tick rates.

## Test claims that are currently too broad

The 21 green proof tests demonstrate the named cases for synthetic in-memory
objects. They do **not** yet establish “secure leaderboard verification.” In
particular:

- No test binds a proof to a game/ruleset/campaign generation or canonical hash.
- No test verifies the actual eight-stage campaign through the proof API.
- Context tests cover only empty/duplicate campaigns and zero lives; they do not
  cover malformed or resource-hostile scenario fields, unsafe derived score, or
  mutable campaign drift.
- Limit tests use stricter injected limits and one 60,001-tick run, but do not
  exercise the exact 60,000 boundaries, total ticks across stages, 60,000 raw
  records, decoded request bytes, or Worker CPU.
- There is no randomized/property test over RLE segmentation equivalence,
  canonical idempotence, or expanded-input equivalence.
- There is no fuzz corpus for nested type substitutions, `NaN`, exponent-created
  infinity from JSON, duplicate JSON keys, prototype-like keys, or parser/body
  failures. Some cannot affect canonical meaning after strict parse, but should
  be documented and tested at the transport boundary.
- Error tests mostly assert message regexes. Stable typed rejection codes would
  support platform mapping and reduce brittle coupling to prose.
- The “client-authored authority fields” test proves extra-key rejection, not
  challenge/season binding.
- The rich replay round-trip proves only top-level presence and version. It does
  not validate tick contiguity, inputs, scenario, recorded events, final state,
  or resource limits.

Recommended additions after M1/M2:

- property test that expanding a canonical proof equals the original input
  sequence and every legal segmentation canonicalizes identically;
- property test that canonicalizing accepted proof twice is idempotent;
- generation/hash golden vectors;
- actual campaign win/loss proof vectors;
- full scenario/context rejection table and safe-integer score assertions;
- exact-boundary and one-over tests for bytes, runs, stage ticks, total ticks,
  stages, entities, strings, and challenge lifetime;
- Worker integration tests for concurrency, rate limits, retention, storage
  failure, and public-safe errors.

## Rich replay debt

Rich replay version 2 was correctly bumped because customer/jar state and served
events changed. It must remain separate from ranked proof version 1.

However, `parseMaltlineReplay` is a permissive local shape cast. It verifies only
that the value is an object with version 2 and truthy scenario/run/final state
plus an array of ticks. It does not reconstruct the engine or bound/sanitize any
field. The name can invite misuse.

Disposition:

- **Before public replay upload/sharing:** implement strict rich-artifact
  validation and authoritative reconstruction, or publish the canonical ranked
  input proof and regenerate frames from it. Never pass this parser's result to
  public playback/storage as “verified.”
- **Deferred while it stays local/debug-only:** rename/document it as an unsafe
  local decoder, reject trailing terminal inputs rather than silently truncating
  them in `replayMaltline`, and add event/final-state reconstruction tests.
- Rich replay artifacts also need ruleset identity. An embedded scenario
  preserves parameter values but not historical engine semantics.

## Other deferred debt

### D1 — Error taxonomy

`MaltlineProofError` has no stable code or structured path. Introduce internal
codes such as `schema`, `limit`, `stage_order`, `nonterminal`, and
`post_terminal`; map them to public-safe platform messages. Avoid exposing
trusted configuration internals to clients.

### D2 — Canonical encoder limits

`encodeMaltlineInputRuns` validates individual typed inputs but does not bound
the source array or resulting run count. It can therefore construct an artifact
the verifier later rejects. Give the browser recorder the challenge's limits and
fail early with a clear “run no longer rankable” state.

At runtime an object masquerading as `MaltlineInput` can also override the
encoder's initial `ticks: 1` because the input spread comes afterward. The
verifier still catches/bounds the result, so this is not an authority bypass;
putting `ticks: 1` last would make the helper's intent exact.

### D3 — Returned object mutability

The verified canonical proof/summary are fresh objects but mutable. Platform
code could accidentally alter them between verification, hashing, and storage.
Deep-freeze or serialize immediately at the trust-boundary return.

### D4 — Input-only proof is not human attestation

A bot can generate a completely valid proof. Challenge randomness and wall-time
sanity can raise automation cost but do not prove human origin. Describe ranked
scores as rules-verified, not human-attested, unless a separate cabinet/device
attestation model is introduced.

### D5 — Fixed-point protocol cleanup

The engine converts floating scenario speeds/thresholds with `Math.round`.
JavaScript behavior is stable for current values, but explicit integer
fixed-point generation fields simplify cross-runtime/cross-language replay,
validation, hashing, and audit. Migrate at a ruleset boundary, not silently.

## Exit gates for TD-01

Platform integration may proceed when:

- [ ] game/ruleset and campaign generations are immutable, challenge-pinned,
  verifier-dispatched, and included in the canonical proof identity;
- [ ] full scenario and initial-run validation proves entity, numeric, score,
  allocation, and tick-cost bounds;
- [ ] actual campaign win/loss proofs pass stable golden summaries/digests;
- [ ] worst legal proof bytes and Worker CPU are measured and accepted or limits
  and implementation are revised;
- [ ] the endpoint design includes body/rate/concurrency/challenge/storage
  controls and stores only server-derived score values; and
- [ ] documentation and tests stop treating the permissive rich replay parser as
  an authoritative validator.

The remaining deferred items should be scheduled before public replay sharing
or the first ranked season freeze, as noted above.
