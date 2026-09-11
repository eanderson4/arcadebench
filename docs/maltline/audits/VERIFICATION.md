# Maltline Replay and Leaderboard Verification Audit

Date: 2026-09-10

Scope: deterministic engine, input model, replay artifact, scoring, and public
platform integration

Baseline: `maltline-polish` at `9058307`; no product code changed by this audit

## Executive decision

Do **not** accept the current `MaltlineReplay` shape as ranked proof yet. The
simulation has a sound deterministic nucleus, but the artifact is a browser-side
recording helper rather than a hostile-input protocol. It carries two values an
attacker must never be allowed to author—the complete scenario and starting
`RunContext`—and Maltline has no server verifier, game/ruleset version, challenge
binding, run-continuity validation, resource ceiling, or platform route.

The safest first ranked protocol is smaller than the current artifact: submit
only a versioned, bounded input stream for each stage. The server should select
the campaign and all score-affecting parameters from a one-time challenge,
derive every stage's starting lives and score from the previous verified stage,
re-simulate to a terminal state, and derive the leaderboard row. Recorded events,
scenarios, starting score, and final state are redundant and should not be
authority-bearing proof fields.

Replay verification can guarantee that a score is reachable under a pinned
ruleset from a particular input stream. It cannot prove that the inputs came
from an unaided human: a modified client or bot can produce a completely valid
proof. “Not hackable” should therefore mean no client can invent a score, alter
rules, skip stages, reuse a challenge, or exhaust verifier resources—not that a
public web client can distinguish human play from automation.

## Evidence from the current tree

- `MaltlineEngine` advances in a fixed tick order and converts movement values
  to integer fixed-point units. Its RNG uses stable 32-bit integer operations.
  No wall clock or renderer randomness enters the core.
- The current seven Maltline tests pass, including one identical-input replay
  reconstruction and one jar-conservation script. The focused run on this audit
  was `1` file / `7` tests passed in `120 ms`.
- `MaltlineReplay` version 1 embeds `scenario`, client-provided `run`, every
  input, every event, and `finalState`. `replayMaltline` generates an artifact
  but there is no parser or verifier for untrusted JSON.
- The browser exposes completed stage artifacts on
  `window.__maltlineReplays`. It has no ranked challenge, submission, replay
  upload, playback parser, or leaderboard adapter.
- The public platform is Partition-specific: its package depends only on
  `@arcadebench/partition`; routes, game constants, score schema, migrations,
  health response, and static build are all hard-coded around Partition.
- Partition already provides useful controls: server-issued, session-bound,
  expiring, single-use run challenges; exact-key and bounded-number parsing;
  authoritative replay; score derivation; request and rate limits; canonical
  proof hashing; D1 uniqueness; R2 proof retention; and integration tests.

## Threat model

### Assets and trust boundary

The authoritative assets are leaderboard order, score summaries, the mapping
from score to reproducible proof hash, season/ruleset identity, one-time
challenge state, and service availability. Everything received from the browser
is attacker-controlled, including TypeScript-shaped objects, event arrays,
scenario values, tick numbers, claimed score, display name, headers, timing, and
submission order. Client-side validation and hidden JavaScript state are UX,
not a security boundary.

### Relevant attackers

1. A casual editor changes JSON score, lives, events, scenario speed, or seed.
2. A protocol-aware attacker constructs a valid-looking replay with skipped or
   reordered stages, a favorable start context, post-terminal inputs, or an old
   engine generation.
3. A bot plays or searches the deterministic game and submits a valid proof.
4. A resource attacker submits large, deeply nested, high-tick, or high-entity
   payloads, including concurrent submissions against one challenge.
5. An accidental compatibility mismatch replays an old artifact under new
   scoring, tick order, campaign data, or JavaScript/runtime behavior.

### Security properties to require

- **Reachability:** each accepted summary is derived from exactly one bounded
  execution of a supported immutable ruleset.
- **Challenge binding:** the proof uses the game, campaign/board, seed policy,
  and rules version selected by the server for that challenge.
- **Run continuity:** stage order and the carried lives/score cannot be authored
  or reset by the client.
- **Terminal completeness:** a score represents a finished loss or a completed
  campaign, never a favorable running prefix.
- **Single use:** one challenge can create at most one score, including under a
  concurrent double submit.
- **Canonical identity:** the retained hash covers the server-canonical proof,
  game ID, and exact game/ruleset version—not ambiguous raw JSON.
- **Bounded cost:** bytes, decoded records, ticks, stages, entities, and verifier
  CPU are capped before or during replay.
- **Fail closed:** unknown generations, extra fields, non-finite/non-integral
  numbers, missing stages, unsupported inputs, and storage/transaction failures
  do not create a leaderboard entry.

## Prioritized findings

### P0 — Block ranked launch

#### V-001: Scenario and starting score are client-authorable

`MaltlineReplay` includes the full `scenario` and `run`; `MaltlineEngine` accepts
the run's score and lives without validation. A naive “replay and compare final
state” endpoint would happily verify a replay beginning with an enormous score
or lives count, or one using zero/slow customers, instant blending, a favorable
seed, a false tick rate, or other altered parameters.

Required fix: construct scenarios from a server-pinned campaign/ruleset and
derive the first context as `{ score: 0, lives: authoredLives }`. Derive every
later context from the previous verified terminal state. Prefer omitting both
fields from ranked proofs. If they remain in a public artifact, compare every
field to the authoritative value and never feed the submitted object directly
to the engine.

#### V-002: There is no untrusted replay verifier or Maltline platform path

`replayMaltline` is a generator, not a validator: it does not parse hostile JSON,
bound length, enforce exact keys, sanitize input, verify recorded ticks/events,
or compare a submitted final state. The platform cannot import Maltline and its
API prefix and D1 score shape are Partition-specific.

Required fix: implement a Maltline verifier in the platform package and route it
through a game registry or a clearly isolated Maltline handler. Add the package
dependency, season entry, score columns/JSON summary appropriate to Maltline,
challenge context, leaderboard query/ranking, proof storage, replay sharing,
and Worker integration tests before exposing submission UI.

#### V-003: Score optimization is currently unbounded and rewards stalling

There is no engine tick/time limit. A customer served at `x <
resumeExitThreshold` resumes marching at the same or smaller `x`, so that
customer can never later satisfy the exit threshold. It can, however, be served
again for another 100–200 points. With enough jars cycling through return and
wash, a skilled or automated player can keep such a customer drinking and farm
repeat-service points; the current replay format has no tick ceiling. Even if a
verifier adds a 15-minute cap, a highest-score board may make deliberate
last-customer farming the optimal strategy rather than fast counter service.

Required product decision before freezing scoring: make the scoring objective
finite and aligned with fun. Options include a hard authoritative shift timer,
points only for finite authored orders/unique progress, customer push-back that
eventually exits, a declining repeat value, or completion/time as a higher
ranking key than score. Then prove a maximum score under the tick/entity bounds.
Do not treat a replay verifier as a cure for a valid but degenerate strategy.

#### V-004: Ruleset identity and compatibility policy are absent

Replay `version: 1` identifies a shape only. Maltline has no exported game ID or
game version and no frozen definition covering tick order, constants, RNG,
campaign data, scoring, or stage-transition semantics. A future balance edit
could silently change the meaning of an old proof.

Required fix: define separate `MALTLINE_GAME_ID`, immutable `GAME_VERSION` (or
ruleset hash), `REPLAY_PROTOCOL_VERSION`, and `CAMPAIGN_VERSION`. An active
season pins all of them. Dispatch verification by supported generation; never
run old input under the newest engine. Any score-affecting or simulation change
starts a new game version/season unless an explicit golden-replay compatibility
suite proves byte-for-byte equivalence.

### P1 — Required hardening

#### V-005: Campaign continuity is not represented as a verified invariant

Each stage replay is independent and includes its own context. An attacker could
skip a hard stage, reorder stages, submit a winning prefix, reset lives, or carry
an invented score. The browser's `stageReplays` array also persists across
`startRun()`, so restarting currently mixes old and new run artifacts if that
array is later submitted unchanged.

Required fix: the verifier owns the expected ordered stage index. Every stage
except the last must end `won`; the next begins with exactly the previous final
`lives` and `score`; a non-complete run must end `lost`; and a completed run must
contain every stage and end with the final stage `won`. Clear client replay
buffers on every new challenge/run. A stage ID is an assertion checked against
the expected stage, not a selector.

#### V-006: Engine constructors and inputs accept invalid runtime values

TypeScript types disappear at the network boundary. The engine checks only that
lanes and stations are nonempty. It will accept fractional/out-of-range input,
non-integer/negative durations, unsafe run values, duplicate/unknown stations,
and non-finite or extreme numeric scenario fields. The `readonly scenario`
property is only compile-time readonly; the referenced object can be mutated
after engine construction while many fields are read on later ticks.

Required fix: sanitize outside the engine and add defensive construction
invariants inside it. Clone/freeze a normalized authoritative scenario. Ranked
input accepts exact keys, `stationDir`/`laneDir` in `{-1,0,1}`, and actual
booleans for `blend`/`serve`. All counters, contexts, durations, seeds, and fixed
point values must be finite bounded safe integers after normalization. Use
integer fixed-point fields in the frozen ruleset rather than converting protocol
floats at construction time.

#### V-007: Terminal-tick loss semantics permit life underflow and scoring after death

`loseLife` sets `status = lost`, but the current tick continues through remaining
customers, slides, and jars. Multiple failures can decrement lives below zero;
a later jar catch on the same tick can still add score. This is deterministic,
but it is a poor invariant and makes score semantics/order dependence harder to
reason about.

Required fix: choose and document terminal-tick semantics. The simplest secure
contract clamps lives at zero and stops score-affecting simulation immediately
after the fatal event (or deliberately completes the tick but forbids further
life/score changes). Add collision-order golden tests and assert `lives >= 0`.

#### V-008: The browser clock drops fractional elapsed time

Each animation frame assigns `owed = dtMs`; it does not retain an accumulator
between frames. Frames slightly shorter than 16.67 ms generate no tick and lose
that time, making simulation rate dependent on refresh cadence. Visibility also
pauses simulation. The replay remains internally deterministic, but leaderboard
“elapsed time” derived only from ticks is not comparable to wall time and can be
slowed for easier reaction.

Required fix: use a persistent fixed-step accumulator with an explicit maximum
backlog policy and test 60/90/120/144 Hz schedules. Decide whether ranked play
may pause on blur/hidden. Store challenge creation time and reject proofs whose
simulated duration exceeds available server wall time plus a small, documented
scheduling allowance; this catches impossible speed-up, though not bots or slow
play. Use simulation ticks—not client timestamps—for score derivation.

### P2 — Important protocol quality

#### V-009: The current replay is redundant and mutation-prone

Events and final state can be regenerated from inputs, but embedding them
increases upload and comparison cost. The generator returns `scenario` and
`run` by reference rather than cloning them, so later mutation changes artifact
contents. Snapshot also omits hidden continuation state such as RNG position and
`nextId`; it is an outcome record, not a resumable checkpoint.

Required fix: use input-only canonical ranked proofs. If rich public replay
artifacts remain, deep-clone at creation and regenerate frames for playback.
Never support save/continue from `MaltlineState`; the product requirement forbids
saving, and it is not a complete engine checkpoint.

#### V-010: Challenge seed policy needs a fairness decision

Partition issues a random seed per attempt, which frustrates precomputed exact
inputs but can compare players on materially different random fields. Maltline's
lane/flavor schedule affects difficulty and scoring, while its current eight
stage seeds are fixed.

Required fix: choose explicitly. A shared season/daily gameplay seed gives equal
boards; a one-time nonce still prevents replaying one accepted challenge but not
precomputed strategy. Per-attempt gameplay seeds reduce replay reuse but need a
generator with tested difficulty/score equivalence or separate seed boards.
Server replay proves rules compliance either way; it does not prove human play.

#### V-011: Partition controls should be generalized, not copied blindly

Partition's server verifier is strict and valuable, but its 36,000-tick cap is
only 10 minutes at 60 Hz, below Maltline's 15-minute target. It accepts full
event/final-state arrays and an embedded scenario because that is Partition's
published shape. Its platform router, score fields, migrations, and health
payload are game-specific. Proof bytes are written to R2 before challenge
consumption, so a failed/racing submission may leave an orphan object for
cleanup even though it cannot create two scores.

Required fix: extract shared request/session/rate-limit/canonical-hash/retention
building blocks, while giving Maltline its own verifier and score schema. Add an
orphan-proof cleanup strategy or stage storage after the D1 claim with explicit
failure recovery.

## Required invariants

These should be executable assertions in property tests and/or in the verifier.

### Protocol and challenge

1. The request game ID, game version, replay version, campaign version, board,
   and challenge record all agree exactly.
2. The challenge belongs to the signed anonymous session, is active, unexpired,
   and unconsumed; database uniqueness makes consumption atomic.
3. Unknown or extra fields reject in the server protocol. The public viewer may
   be more tolerant, but its parser is not the authority.
4. The server reconstructs and canonicalizes accepted data before hashing. Raw
   property order, negative zero, duplicate JSON-key behavior, or omitted
   optional fields cannot create two proof identities for one execution.

### Input and tick stream

1. Every expanded tick has exactly one canonical input with both direction
   values in `{-1,0,1}` and both action values boolean.
2. Expanded tick numbers are implicit or contiguous from 1. Zero-length runs,
   gaps, duplicates, reordering, and records after terminal state reject.
3. Total stages, encoded runs, expanded ticks per stage, and total expanded ticks
   never exceed constants checked during streaming expansion.
4. Serve remains a false-to-true edge action; holding it cannot emit repeated
   shakes. Station/lane repeat behavior on exact cadence boundaries has golden
   tests, including simultaneous/opposite key normalization in the browser.

### Engine state

1. Same frozen scenario + server-derived run context + same inputs produces the
   same per-tick events and final state in Node tests and the Worker runtime.
2. `0 <= lives <= authoredInitialLives`; fatal resolution cannot underflow.
3. Player lane/station and every entity lane/flavor/phase remain in authored
   bounds; positions, timers, IDs, counts, score, and streak remain safe integers.
4. Jar conservation is explicit: available + blending/held + outbound slides +
   customer-held jars + returns + washing + destroyed equals the stage pool.
   “Destroyed” is verifier-derived, never submitted.
5. Spawn count is monotonic and at most authored `customerCount`; entity count is
   bounded by an authored/proven maximum; IDs are unique and monotonic.
6. Once terminal, no tick, score, life, entity, or RNG state changes.
7. Renderer `Math.random`, frame rate, audio, focus, DOM, and wall clock never
   affect authoritative state.

### Stage and run

1. Stage 1 begins at server-authored lives and score zero.
2. Stage `n+1` exists only if stage `n` won, uses the next authored scenario,
   and begins with exactly stage `n` final lives/score.
3. A loss terminates the run. A win on the final authored stage completes it.
   No other proof prefix is rankable.
4. No save, resume, checkpoint, level selection, or restart can join two ranked
   challenge executions. Restart obtains a fresh challenge and empty replay.

### Score

1. Score is computed only inside the pinned engine. Claimed score is either
   omitted or must exactly equal the derived display summary.
2. Every score delta maps to one verified event and pinned formula; no score
   changes after terminal. Current formulas are serve `100 + 10 *
   min(priorStreak, 10)`, jar catch `25`, and stage clear `250 * lives`.
3. The leaderboard comparator is total and server-side, with stable tie-breaks.
   It must encode the chosen product objective (progress/completion, score,
   and/or elapsed ticks) and have matching client and database tests.
4. A finite maximum score and minimum/maximum terminal duration are proven for
   every ranked ruleset under the replay limits.

## Recommended ranked proof and verifier

Because Maltline version 1 is not public, replace it before freezing rather than
preserving unnecessary fields. One suitable wire shape is:

```json
{
  "protocolVersion": 1,
  "gameVersion": "0.1.0-ranked.1",
  "campaignVersion": 1,
  "stages": [
    {
      "stageId": "maltline-01-first-pour",
      "inputRuns": [
        { "ticks": 30, "stationDir": 0, "laneDir": 0, "blend": false, "serve": false },
        { "ticks": 46, "stationDir": 0, "laneDir": 0, "blend": true, "serve": false }
      ]
    }
  ]
}
```

The run/challenge ID stays in the submission envelope. `stageId` is useful for
diagnostics but is checked against the expected index. Events, final states,
scenario objects, seeds, starting contexts, and score deltas are omitted.
Run-length encoding reduces the common held/idle stream without complicating
determinism. The verifier expands it incrementally; it never allocates an array
of every tick.

Verifier sequence:

1. Enforce origin, decoded-body size, content type/encoding policy, anonymous
   session, and expensive-action rate limit.
2. Load the active season and one-time challenge by `(runId, sessionId)`. Check
   game/board/version/campaign, expiry, and unconsumed state.
3. Strictly parse the flat proof with exact keys, bounded strings/arrays, finite
   safe integers, real booleans, and canonical direction values.
4. Resolve the authoritative ordered campaign and seed policy from the
   challenge. Clone/freeze normalized integer scenarios.
5. Initialize `{ lives: authoredLives, score: 0 }`. For each expected stage,
   incrementally expand input runs, apply one sanitized input, and step one tick.
   Reject limits as soon as crossed and reject any encoded input remaining after
   the terminal tick.
6. Require the stage/run terminal conditions and continuity invariants above.
   Derive score, stage reached/cleared, completion, lives, service/catch/miss
   statistics, and elapsed ticks only from reconstructed state/events.
7. Compare a claimed UI summary if retained, then build a fresh canonical proof
   from sanitized input runs. Hash a wrapper containing game ID, exact game
   version, campaign version, challenge gameplay seed/board, and proof.
8. Atomically claim the challenge and insert only the derived leaderboard row.
   Store the proof with bounded retention and recover/clean orphaned objects on
   partial failure. Return a server-shaped entry.

For public playback, regenerate states/events from the same canonical input
proof. An independent replay inspector should show the proof hash and exact
ruleset. Never use the viewer's permissive parser as the ranked verifier.

## Bounded-resource requirements

Values must be tuned after campaign telemetry, but limits need to exist before
the endpoint. For the stated 15-minute maximum at 60 Hz, use these initial design
targets rather than Partition's 36,000-tick limit:

| Resource | Initial ceiling / rule |
| --- | --- |
| Expanded run ticks | 54,000 exact target; allow at most 60,000 only if transition/cadence evidence requires headroom |
| Stage count | Exactly the authored progression prefix; currently at most 8 |
| Expanded stage ticks | Authored per-stage ceiling, with an absolute ceiling no higher than total ticks |
| RLE records | At most total ticks; reject zero/negative counts and merge adjacent identical inputs when canonicalizing |
| Request bytes | Measure real 99th percentile after RLE; start near 1 MiB and reject unsupported content encodings or enforce decoded size |
| Strings | IDs/version fields <= 128 bytes; callsign uses the existing stricter policy |
| Numbers | Finite safe integers in explicit ranges; seed normalized to uint32; no client-authored movement floats |
| Entities | Proven from the authoritative scenario (customers, jar pool, slides/returns/wash); assert per tick |
| CPU | Benchmark a worst-case 60,000-tick adversarial proof in the Worker test pool and set a regression budget from deployed limits |
| Submission rate | Reuse both edge and exact D1 per-session expensive limits; monitor global CPU/error rates too |
| Retention | Reuse five-day proof expiry and permanent canonical SHA-256 summary unless policy changes |

Also reject a simulated duration impossible since the server's challenge
creation time (with small network/scheduler slack), cap challenge lifetime, and
avoid logging raw replay bodies or callsigns. Byte limits alone are insufficient:
verification loops must enforce decoded tick/run counts as they go.

## Adversarial and regression test matrix

### Schema and authority rejection

- Modified claimed score, final score, lives, streak, status, event, event order,
  tick, or scenario cannot affect acceptance; omitted authority fields are best.
- Submitted initial score/lives, scenario speed/timing, station list, jar pool,
  customer count, stage seed, or tick rate reject or are impossible to express.
- Unknown/extra keys at every nesting level; nulls; strings in numeric/boolean
  fields; fractional directions; values outside `{-1,0,1}`; unsafe integers;
  `1e309`; and negative zero normalization/rejection.
- Unsupported replay/game/campaign version and valid proof under an older/newer
  ruleset reject deterministically.

### Tick and terminal rejection

- Empty proof; zero/negative/overflow RLE count; missing, duplicate, gapped, or
  reordered stages; too many stages/runs/ticks; post-terminal inputs.
- A running final prefix, a won stage followed by the wrong stage, a lost stage
  followed by anything, a skipped stage, and a final-stage win missing earlier
  stages.
- Held serve fires once until release; exact blend completion edge; station and
  lane repeats at cadence boundaries; conflicting browser keys normalize to
  idle; blur/visibility clears controls without phantom input.

### Tamper, replay, and concurrency

- Wrong game/board/season/seed context; expired challenge; another session's
  challenge; already consumed challenge; copied proof with a fresh challenge
  whose gameplay context differs.
- Two concurrent valid submissions for one challenge yield exactly one score and
  one consumed challenge. Storage failure, moderation failure, and D1 failure do
  not create a visible partial score; orphan objects are eventually removed.
- Canonically equivalent JSON property orders hash identically after sanitize;
  a one-input change produces a different hash.

### Resource abuse

- Payload one byte over limit, extreme shallow arrays, deep nesting, thousands
  of tiny RLE runs, one huge run count, and a proof that reaches the tick limit
  without terminating.
- Worst-case simultaneous customers/slides/jars and maximum per-tick events stay
  within entity/memory assertions. Verification runtime has a recorded budget in
  both Node and the Workers test pool.
- Recorded event/final-state bombs are impossible in the minimal proof schema.

### Engine properties and golden vectors

- Identical inputs produce identical per-tick event digests and final-state hash
  across repeated runs and supported Node/Worker runtimes.
- Golden replays cover all event types and boundary collisions: serve/customer,
  shake/door, jar/counter, drink completion, wash completion, spawn, fatal loss,
  and stage clear on the same tick.
- Property tests assert jar conservation, unique IDs, entity bounds, score-event
  accounting, lives bounds, spawn monotonicity, terminal immutability, and stage
  continuity over many seeded valid input streams.
- Mutating the source scenario after engine construction cannot change results.
- A deterministic campaign telemetry bot establishes every stage's terminal
  duration and score bounds and detects the repeat-customer farming strategy.
- Browser cadence tests feed equal elapsed time in 60/90/120/144 Hz frame chunks
  and require equal tick counts, inputs, and final states.

## Partition reuse map

Reuse or extract:

- `apps/platform/src/http.ts`: `readJson`, `requiredObject`, bounded parsing
  pattern, same-origin enforcement, and public-safe errors.
- `apps/platform/src/session.ts`: HMAC anonymous sessions and the two-layer rate
  limit. Keep in mind that a session is abuse friction, not player identity.
- `apps/platform/src/partition-verifier.ts`: exact-key discipline, finite/bounded
  numeric helpers, authoritative per-tick stepping, terminal-tick rejection,
  scenario mismatch diagnostics, and derived-score comparison.
- `apps/platform/src/crypto.ts`: canonical reconstruction/stringification and
  SHA-256/HMAC helpers. Hash only sanitized server-canonical data.
- `apps/platform/src/worker.ts` and migrations: active season/version gating,
  challenge expiry/single use, D1 rank queries, R2 metadata, proof retention,
  cleanup, cache headers, and server-shaped responses.
- Partition's verifier and Worker integration tests as templates for tamper,
  terminal continuation, server-authored challenge binding, unsupported fields,
  rate limits, session cookies, replay publication, and retention cleanup.

Adapt rather than reuse unchanged:

- Replace Partition's full replay with Maltline's bounded input-only/RLE proof.
- Set Maltline limits from a measured 5–15 minute campaign, not Partition's
  36,000 ticks and 8 MiB score body by default.
- Define Maltline score/rank columns and summary. Partition's `partitions`,
  stabilized fraction, and difficulty boards are not generic.
- Resolve seed fairness and Maltline stage carry semantics explicitly.
- Generalize hard-coded `/api/v1/games/partition`, health metadata, package
  dependencies, build output, season bootstrap, replay redirect, and vote IDs.

## Implementation gates

1. Resolve repeat-customer/stalling score incentives, terminal-tick semantics,
   leaderboard comparator, maximum run duration, and gameplay seed fairness.
2. Freeze and export the initial ranked game/campaign/replay versions plus
   integer-normalized immutable scenarios.
3. Add engine invariant, input-edge, golden replay, property, campaign bound,
   and browser cadence tests.
4. Implement the input-only canonical recorder/parser and authoritative
   headless verifier with measured byte/tick/CPU limits.
5. Generalize the platform, add Maltline migrations/routes/client adapter, and
   prove challenge, concurrency, persistence, and retention behavior in Worker
   integration tests.
6. Run a technical-debt review after the engine/protocol tranche and again after
   platform integration. Ranked launch remains blocked until all P0/P1 findings
   have tests and the frozen generation reproduces golden proofs exactly.
