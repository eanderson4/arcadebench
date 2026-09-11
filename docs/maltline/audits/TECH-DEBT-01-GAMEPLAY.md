# TD-01 — Gameplay, Scoring, and Telemetry Technical-Debt Review

**Review date:** 2026-09-10
**Scope:** the combined Maltline engine, fulfillment-aware scoring/resolution,
rich replay and input-only proof where they consume those contracts, campaign
telemetry/reference controller, and presentation code where it interprets the
new events/state.
**Method:** source and test review plus a fresh full test/build/telemetry run. No
product code was changed during this review.

## Current evidence

```text
npm test --workspace=@arcadebench/maltline
  6 files, 50 tests passed

npm run build --workspace=@arcadebench/maltline
  TypeScript and Vite build passed

npm run telemetry --workspace=@arcadebench/maltline
  won 8/8; 14,120 ticks; 235.333 active seconds; score 25,930
  108 fulfilled / 108 resolved; 3 lives; no loss events
```

The new core policy is internally coherent on its covered path:

- a customer can produce at most two `served` actions;
- only the first action and its corresponding caught jar award points;
- the first late service may requeue and the second forces exit;
- `resolved === exited + walkouts` under normal engine construction;
- fatal processing clamps lives and stops later entity/phase resolution;
- terminal engine input and step calls are immutable;
- telemetry reproduces the audit's canonical campaign result.

Passing tests do not yet make this a safe tuning baseline. Four contract issues
should be addressed before campaign numbers are changed, because they can make
human feedback or telemetry evidence misleading.

## Must fix before campaign tuning

### TDG-01 — Presentation still contradicts authoritative scoring and resolution

**Severity:** P0 for human tuning
**Evidence:** `renderer.ts:174-183`, `renderer.ts:1322-1330`,
`main.ts:91-100`

The engine now emits explicit `event.points`, including zero for a permitted
re-service and its second jar. The renderer ignores those values:

- every `jar_caught` shows `+25`, including a zero-point repeat jar;
- every `served` event reconstructs points from final state streak and shows a
  positive award, including a zero-point re-service;
- the HUD computes remaining customers as `customerCount - exited`, so a
  walkout remains as a phantom “IN LINE” customer even though `resolved`
  advanced;
- stage clear always says “Line served” even when one or more customers walked
  out.

This is more than visual polish. Human tests would teach a scoring rule that is
false and report a queue count inconsistent with the terminal rule. Tuning
decisions based on those sessions would be contaminated.

**Recommended repair:** make presentation consume authoritative event/state
semantics only. Use `event.points`, omit or relabel zero-point popups, compute
remaining as `customerCount - resolved`, and make the clear copy distinguish a
perfect line from a survived line. Add presentation tests for first service,
re-service, first/repeat jar, nonfatal final walkout, and terminal loss.

### TDG-02 — Scenario/run configuration is neither complete-validated nor immutable

**Severity:** P0 for reproducibility and verifier safety
**Evidence:** `engine.ts:68-84`, `engine.ts:142-158`, `engine.ts:179-213`,
`proof.ts:181-205`, `campaign-telemetry.ts:122-145`

The engine checks only `lanes >= 1` and a nonempty station array. It assumes all
other values are finite, correctly ranged, and operational after fixed-point
quantization. Examples currently admitted include:

- fractional/huge lane counts, zero repeat cadence, negative jar counts, and
  negative customer/timer counts;
- zero/nonfinite tick rates, positions, or speeds;
- a positive movement speed below `1 / FIXED_SCALE`, which rounds to zero and
  makes an entity permanently stationary;
- resume thresholds outside `[0, 1]`;
- noninteger/unsafe seeds, lives, and carried scores.

The proof layer validates campaign IDs and initial run scalars, but not trusted
scenario fields. “Trusted” should mean selected by the server, not exempt from
startup validation: a bad deployment can otherwise generate NaN state, hang
until a proof limit, or produce JSON `null` for nonfinite telemetry seconds.

The engine also retains the caller's mutable `scenario` object. Numeric movement
values are copied into fixed-point fields, while stations, counts, intervals,
timers, and input cadence are read from the original object during ticks. An
external caller—or a custom telemetry controller receiving the same object—can
therefore change only part of the rules mid-stage. That breaks the documented
“same scenario + inputs” determinism contract.

**Recommended repair:** create one `validateAndNormalizeMaltlineScenario`
boundary used by engine construction, campaign catalog validation, telemetry,
and proof context validation. Require finite safe integers where appropriate,
positive effective fixed-point motion, bounded lane/station/customer/resource
counts, and valid thresholds. Clone/freeze stations and store a private normalized
scenario snapshot; expose a deep-readonly copy if callers need it. Apply an
equivalent explicit policy to `RunContext` instead of mixing verifier rejection
with engine-side silent clamping.

Also settle the existing contract discrepancy before tuning: comments say spawn
cadence accelerates per customer **served**, while `engine.ts:210-213` uses the
number **spawned**. Rename the knobs/documentation if the authored schedule is
intentional, or change the implementation and version the protocol if
performance-driven acceleration is intended.

### TDG-03 — Telemetry output is repeatable but not self-identifying evidence

**Severity:** P0 before logged balance experiments rely on artifacts
**Evidence:** `campaign-telemetry.ts:17-94`, `campaign-telemetry.ts:187-228`,
`reactive-controller.ts:4-26`

The JSON has a schema version and a free string controller ID, but no gameplay
protocol/engine generation or campaign configuration fingerprint. Two reports
from different campaign parameters can both claim schema `1` and controller
`reactive-current-state-v1`. The API also accepts `controller` and `controllerId`
independently, so a custom function can be labeled as the canonical controller.
Changing the reference controller implementation does not require changing its
ID.

That is adequate for a local smoke command, but weak evidence for an append-only
experiment history: an old JSON artifact cannot prove which rules and decision
policy produced it.

**Recommended repair:** pass controllers as an inseparable `{ id, decide }`
definition; include a gameplay generation plus deterministic canonical encoding
or digest of every scenario field; and bump the controller ID whenever policy
changes. Record active simulation seconds explicitly. Human wall-clock duration
also includes seven inter-stage delays and the final victory delay, so do not use
the current `campaign.seconds` as an unlabeled 5–15-minute run duration.

The reference controller itself has edge cases that will surface as soon as
tuning creates late rescues:

- each existing slide independently “reserves” the nearest matching customer,
  so duplicate slides can reserve the same customer rather than successive
  customers (`reactive-controller.ts:29-38`);
- it ignores a slide that has passed a drinking customer even though engine
  collision rules can let that slide catch the customer on its resume tick;
- if the customer that motivated a blend walks out, a now-orphaned held flavor
  can block all further production when no matching customer remains;
- custom controllers can mutate the shared scenario object as described above.

These do not affect the current perfect canonical trace. Fix them or explicitly
classify the bot as a narrow baseline before using its failure as evidence that a
tuned stage is unwinnable.

### TDG-04 — Core invariants are sampled, not systematically proven

**Severity:** P1 before broad parameter experimentation
**Evidence:** `scoring-resolution.test.ts:55-78`,
`scoring-resolution.test.ts:166-245`, `engine.test.ts:152-174`

Jar conservation has one messy scripted test, and the new score test checks one
late-service path. Missing trace-wide assertions include:

```text
resolved === exited + walkouts
0 <= fulfilled <= spawned <= customerCount
fulfilled <= serviceActions <= 2 * fulfilled
0 <= lives <= starting lives
streak <= fulfilled
one firstFulfillment event and one eligible catch bonus per customer at most
score is a safe integer and equals carried score + event point/bonus ledger
all entity IDs are unique and references point to a spawned customer
jar inventory equals pool - destroyed jars throughout every reachable tick
terminal snapshot remains byte-identical for every terminal cause
```

Four fatal-order tests reach into TypeScript-private fields through an
`EngineInternals` cast and construct states that public play cannot produce:
zero-customer stages containing jars, jars for unspawned customers, and a
chocolate slide in a one-station vanilla scenario. Those tests are useful probes
of loop short-circuiting, but they are brittle against harmless field refactors
and do not prove that reachable simultaneous events behave correctly.

**Recommended repair:** retain the regressions until replacements exist, then
prefer deterministic legal-input traces. If a simultaneous state is genuinely
unreachable through public input, extract a small pure ordered-resolution
function with an explicit validated input and test that, rather than mutating a
class's private storage. Add seeded property/model tests that run all canonical
stages plus bounded generated scenarios and assert the invariants after every
tick. Add per-customer event-ledger checks, not only final aggregate checks.

The exact canonical telemetry assertions are intentionally useful as a baseline
approval gate, but they will fail on every legitimate tuning change. Keep them
separate from invariant tests and update their fixture only alongside an
experiment-log decision; otherwise developers will either fear tuning or
casually rewrite the baseline.

## Fix before leaderboard/verifier integration

These do not prevent local campaign tuning once the items above are resolved,
but should block a production scoring path.

### TDG-05 — Score policy and finite bounds are implicit

**Evidence:** `engine.ts:20-24`, `engine.ts:275-301`, `engine.ts:319-335`

Scoring constants and arithmetic are private engine details. The only “maximum”
test is the one-customer 875-point example. No pure policy computes a finite
stage/campaign ceiling, no test proves every canonical stage stays below it, and
the proof accepts an initial safe-integer score with no headroom for subsequent
addition. `Number.MAX_SAFE_INTEGER` is valid context but immediately produces an
unsafe score.

Move scoring into a versioned pure policy or emit a uniform authoritative score
delta event. Expose/test maximum score gain from customer count, starting lives,
and the one-requeue rule; validate addition headroom; and ensure the leaderboard
ordering does not reward `serviceActions` (which intentionally increases on a
zero-point rescue).

The `catchBonusEligible` bit is currently copied from customer to jar to carry
this score policy across phases. That is correct, but it couples entity schema to
one reward rule. A named fulfillment/service ordinal or a score-award token would
make the invariant easier to understand and version.

### TDG-06 — Proof summaries lag the new resolution contract

**Evidence:** `proof.ts:40-62`, `proof.ts:299-335`

The verifier exports fulfilled/service-action/walkout totals but omits `resolved`
and `exited`, even though those counters now define stage/HUD semantics. Add them
or document which values are deliberately excluded. Cross-test proof summaries
against telemetry produced from the same input trace so three consumers do not
silently define “progress” differently.

Proof context must use the shared scenario validator from TDG-02. Rich replay v2
parsing (`replay.ts:27-40`) remains only a shallow top-level cast; that is
acceptable for a clearly labeled local artifact, but any viewer/import path must
rebuild and compare the final state rather than trust parsed nested data.

### TDG-07 — Verifier execution allocates two full snapshots per input tick

**Evidence:** `proof.ts:278-291`, `engine.ts:92-120`, `engine.ts:123-137`

The proof loop calls `engine.snapshot()` to test status, then `engine.step()`
creates another full snapshot that the verifier discards. Snapshotting clones all
customers, slides, jars, washing entries, player, and input. The hard 60,000-tick
limit bounds the problem, and current entity counts are tiny, so this is not yet
a measured bottleneck. Before exposing the endpoint, benchmark worst-allowed
proofs and retain the previous step result/status rather than taking the extra
snapshot. Do not optimize normal engine allocations until profiling shows need.

## Refactor before the related feature tranche

### TDG-08 — Campaign progression is duplicated across three consumers

Viewer, telemetry, and proof each independently implement stage order, carried
lives/score, stop-on-loss, and completed-run detection. Later work on extra
lives, stage bonuses, between-stage recovery, or campaign variants will require
three coordinated edits.

Introduce a small core campaign/session policy before changing lives or
progression. It should own only deterministic progression—not timers, DOM, or
proof parsing—and should be usable by viewer, telemetry, and verifier. Until
then, add a shared contract test showing the same stage inputs yield the same
carried context and completion summary in all paths.

### TDG-09 — Public naming is accurate but cognitively dense

`fulfilled` is both a per-customer boolean and a stage count; `exited` means a
successful served departure, while `resolved` includes exits and walkouts;
`serviceActions` includes a zero-point rescue. These meanings are defensible and
documented in `types.ts`, but every manually authored `MaltlineState` fixture now
needs scoring-transient fields such as `catchBonusEligible`.

Before adding more customer types, consider grouped state:

```text
customers: { spawned, fulfilled, walkedOut, exited, resolved, serviceActions }
```

or use consistently suffixed counter names. Add shared state/customer fixture
builders so proof, scoring, renderer, and visual tests do not drift whenever the
protocol grows. Treat any shape change as a replay-generation change.

## Safe to defer

- The reference controller sorts small arrays every tick and the engine rebuilds
  entity arrays every phase. Current telemetry completes quickly and peak live
  customer count is four; optimize only after larger campaigns are profiled.
- Telemetry's schema/types are exported from the main package entry point. A
  separate analysis-only export could reduce public surface later, but current
  bundling tree-shakes it and there is no demonstrated cost.
- `maxLiveCustomers`, `maxLaneLoad`, and `ticksAtZeroJars` are valid descriptive
  metrics, though they are not yet direct measures of actionable backlog or
  player blockage. Add `maxMarchingLaneLoad`, order response latency, serve
  position, and genuinely blocked-on-jar ticks when the first balance experiment
  needs them rather than proliferating speculative metrics now.
- Failure loops duplicate short-circuit/slice logic across customers, slides,
  and jars. It is readable at current size. Consolidate only if another
  score/life-affecting phase is introduced.

## Recommended debt-clearing order

1. Align HUD, popups, and stage-clear language to event points and `resolved`.
2. Add shared scenario/run validation and make engine configuration immutable;
   settle spawned-vs-served acceleration semantics.
3. Bind telemetry controller identity and add campaign/gameplay provenance.
4. Add invariant/property tests and replace private-state fatal tests where a
   legal or pure-function test is possible.
5. Run the first campaign tuning experiment.
6. Before leaderboard integration, centralize score bounds, align proof summary
   counters, and benchmark worst-case verification.
7. Before changing life/progression rules, introduce a shared deterministic
   campaign policy.

This review finds no reason to discard the current engine or telemetry design.
The debt is concentrated at boundaries: configuration entering the engine,
authoritative state leaving it for presentation/proof, and evidence metadata
leaving telemetry. Clearing those boundaries now will make later feel/balance
work substantially cheaper and more trustworthy.
