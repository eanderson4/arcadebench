# Maltline Technical-Debt Audit 10 — Gameplay Presentation

**Date:** 2026-09-11
**Scope:** Settled EXP-062/063 tree: game-feel presentation architecture,
retained replay semantics and lifecycle, renderer effect/painter seams, scenario
authority, runtime complexity, and test maintainability.
**Method:** Read-only source review plus focused unit evidence. This report is
the only file created by the audit.

## Verdict

No P0/P1 gameplay, generation-2 authority, proof, replay-fidelity, or pixel
defect was found. EXP-062/063 close their intended work: replay frames are
stage-local views over exact integer ticks, playback cannot cross a stage
automatically, live motion-preference changes rebuild the same committed frame,
and same-proof panel publications preserve the active replay.

P2-11 should remain active. The 1,834-line renderer still combines transient
effect reduction, all Canvas painters, orchestration, scenario binding, and HUD
copy. That is bounded maintainability debt, not justification for a broad
rewrite or a generation-3 rules change. The highest-value next step is an exact,
pixel-neutral extraction of the transient effect store described below.

Human feel remains an evidence gap rather than technical debt: automated
models, semantic assertions, and goldens cannot determine whether Stage 4–7
pressure, recovery, score motivation, or the selected/processing/held hierarchy
feel good to people.

## Closed behavior verified

- Replay resolves scenarios only from the verified envelope's registered
  authority and checks stage IDs (`replay-scrubber.ts:201-210`). Its player
  ordinal is a display-only `stageTick + 1` of `stage.ticks + 1`; the cursor,
  range, one-frame buttons, and five-second controls retain integer tick
  semantics (`replay-scrubber.ts:144-151,358-394,526-540,615-618`).
- Stage playback stops at the terminal tick and requires explicit stage
  selection (`replay-scrubber.ts:474-524,544-568`). Single-stage loss guidance
  now says `Replay complete`; multi-stage proofs may direct the player to
  another stage (`replay-scrubber.ts:354-356,380-384,474-486`).
- Replay action facts consume the same selected/processing/held/blocked policy
  as live Canvas and semantic status (`station-action-presentation.ts:29-96`,
  `renderer.ts:1149-1204`, `semantic-status.ts:10-24`,
  `replay-scrubber.ts:155-176`).
- Motion changes stop animation and pending range work, reconstruct the exact
  stage/tick under the new preference, and unsubscribe on destroy
  (`replay-scrubber.ts:187-199,629-645,684-691`). Same verified entry ID plus
  verified SHA takes a DOM no-op path; replacement proof identity tears down and
  resets accessibly (`competition-panel.ts:124-140,603-673`).

Fresh focused evidence:

```text
npm test -w @arcadebench/maltline -- \
  renderer-layout.test.ts renderer-presentation.test.ts \
  station-action-presentation.test.ts viewer-session.test.ts \
  replay-scrubber.test.ts

5 files passed; 58 tests passed.
```

EXP-063 records the settled full gate as 676 repository unit tests, all builds,
142 Maltline Playwright checks, and the 49-image exact manifest. Its
manifest-ordered raw-image SHA-256 is
`1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.

## Findings

### TD10-G01 — Live and replay event language has two independent policies

**Severity:** P2 semantic-maintainability debt. No current false score or loss
result was reproduced.

Live announcements select and phrase game-over, life-loss, clear, service,
catch, and ready events in `semantic-status.ts:33-86`. Replay independently
selects and phrases every event in `replay-scrubber.ts:91-141`. The policies
already differ in priority and vocabulary: live play names a walkout loss as a
customer reaching the counter, while replay calls it a customer walkout; live
service uses `Repeat rescue`, while replay constructs `[flavor] rescue served`.
Some difference is appropriate because replay also needs durable recent-event
copy with lane/flavor detail, but the shared facts and precedence are not owned
once.

This is not a replay-trust defect. Both paths consume authoritative event
points/reasons, fatal replay completion includes the terminal event, and tests
cover zero-point repeat service. The risk is future drift when a new event or
wording is added to only one exhaustive switch.

**Bounded fix:** introduce a pure `event-presentation.ts` policy returning
structured facts and a priority (`kind`, cause, lane, flavor, points,
first-fulfillment, lives, bonus). Keep separate live-announcement and
replay-recent renderers over that policy so context-specific detail remains
possible. Preserve current strings in the extraction tranche.

**Exit tests:** one table containing every `GameEvent` variant and simultaneous
fatal/clear/life batches must prove shared event selection and facts; live and
replay snapshots must retain their exact current text; zero-point rescue/catch
and all three life-loss causes must remain explicit; proof, authority, and image
hashes must be unchanged.

### TD10-G02 — Transient feedback state and every painter remain one lifecycle

**Severity:** P2 P2-11 architecture debt. Not a runtime or pixel defect today.

`MaltlineRenderer` owns mutable particles, popups, flashes, failure callouts,
shake state, random/time/motion dependencies, and scenario binding
(`renderer.ts:133-156`). `pushEvents` performs event reduction and geometric
projection (`renderer.ts:200-251`), `update` mutates and expires those effects
(`renderer.ts:300-325`), and the same class then paints scene, actors,
projectiles, stations, effects, and HUD in a fixed order
(`renderer.ts:327-359,363-1825`). Callers must separately reset effects and bind
the next scenario; production and lab do this correctly
(`main.ts:160-172`, `human-lab.ts:572-587`), but the public class makes that
ordering a convention.

The current implementation is well defended: repeated draw is effect/RNG
neutral, update partitioning is deterministic, TTL boundaries are pinned, and
reset returns the same command stream as a fresh renderer
(`renderer-presentation.test.ts:196-231,328-386,456-499`). The issue is change
blast radius: modifying a feedback lifetime, geometry projection, or leaf
painter requires editing and reasoning about the same large class.

**Bounded fix:** extract only a private `MaltlineRendererEffects` store. Move the
effect records, event-to-effect reduction, random consumption, `advance`, and
`reset` into it. Pass the already-bound layout/scenario and post-tick state into
event ingestion; expose read-only effect collections to the existing painter
methods. Do not move Canvas methods, reorder draws, alter the public renderer
API, or combine this with environment/station pixel work.

**Exit tests:** pin random call count/order for each event batch; retain the
existing every-event, 0/479/480/899/900/1399/1400 ms, partitioned-update,
repeated-draw, reduced-motion, reset, and stage-rebind matrices; compare exact
Canvas command transcripts for representative idle/service/catch/each-loss
states; all 49 PNG bytes and their aggregate hash must remain exact. Core,
campaign, proof, telemetry, and human-lab artifact identities must not change.

### TD10-G03 — Renderer scenario admission uses a frozen-shape heuristic and
state identity stops at `scenarioId`

**Severity:** P2 authority-boundary debt, explicitly safe for current
generation 2.

Core scenario admission validates and clones every field
(`scenario.ts:75-187`). The viewer layout boundary instead treats a frozen
object with frozen stations as normalized (`renderer-layout.ts:57-62`), and
draw/event ingestion can compare state only with the bound scenario's string ID
(`renderer.ts:159-185`). A hand-forged frozen object can therefore pass the
layout's admission heuristic, and two hypothetical scenarios sharing an ID
cannot be distinguished from state alone.

All current runtime callers are safe: production and lab bind `engine.scenario`,
replay binds the registered authority objects, and fixtures bind authored
campaign scenarios (`main.ts:165-170`, `human-lab.ts:577-584`,
`replay-scrubber.ts:201-210,426-445`, `visual-fixtures.ts:1224-1239`). Current A/D
candidate changes also do not alter viewer geometry. This is not a reason to add
presentation data to proof hashes or mutate `MaltlineState`.

**Bounded fix:** after the effects extraction, replace the freeze heuristic with
a reusable core-owned normalized-scenario assertion/brand or normalize once at
the viewer admission edge. Document that an engine state proves only the
scenario ID and that the caller owns exact object pairing. A stronger same-ID
runtime proof should wait for a future authority design rather than widening
generation-2 state.

**Exit tests:** forged frozen scenarios with missing, extra, accessor, invalid
lane/station/length, and non-finite fields must fail before Canvas, RNG, or
effect mutation; authored normalized objects must preserve reference identity;
failed replacement must retain the prior valid binding; source tests must keep
production, lab, replay, and fixture callers on their authoritative scenario
objects.

### TD10-G04 — Visual truth tests duplicate painter geometry and raw coordinates

**Severity:** P2 test-brittleness debt. Current goldens remain authoritative.

The scenario/layout extraction removed one set of lane/station formulas, but
fixture metadata still independently projects customers, tickets, slides, jars,
return targets, and the player (`visual-fixtures.ts:895-1019`). Renderer tests
also hard-code station rectangle coordinates such as `463` and
`742.333...` even though the layout object owns those rectangles
(`renderer-presentation.test.ts:549-655`; `renderer-layout.ts:71-103`). An
intentional painter/layout change can therefore require synchronized edits to
renderer code, metadata, command assertions, and PNGs; an accidental shared
mistake can make semantic region evidence look self-confirming.

This is not evidence that current images are wrong. Exact PNG comparison and
independent state-conservation assertions provide strong coverage. It is a
warning against moving multiple painter families at once.

**Bounded fix:** derive test expectations from `MaltlineRendererLayout` now,
while retaining a small set of explicit layout contract numbers in
`renderer-layout.test.ts`. Later extract pure entity projection helpers one
family at a time and let both its painter and fixture metadata consume them.

**Exit tests:** station truth tests must reference `layout.stations[index]`
rather than duplicate decimals; deliberately perturbing a region expectation
must fail independently of the painter; visible-region bounds must still contain
the exact painted object in normal/reduced 700 and desktop fixtures; PNG bytes
remain unchanged for a refactor-only tranche.

### TD10-G05 — Replay's deterministic presentation reconstruction has an
unmeasured high-refresh cost

**Severity:** P2/P4 performance risk; defer the pass/fail decision to P4-04.

Replay deliberately creates a renderer for each draw and replays a bounded
1.4-second frame ring through event ingestion and `update`
(`replay-scrubber.ts:236-244,397-447`). At generation 2's 60 ticks/second that
is at most 84 history updates per paint. The RAF path redraws even when a
high-refresh callback advances zero game ticks (`replay-scrubber.ts:489-524`).
The bound makes behavior finite and cold-seek/drag coalescing tests are strong,
but a 120/144 Hz target can perform identical reconstruction and Canvas work
between adjacent game states.

No supported-device frame miss was measured in this audit, and local desktop
timings must not be promoted to cabinet evidence. Avoid speculative caching that
could break presentation-history determinism.

**Bounded measurement/exit:** instrument renderer constructions, history frames,
Canvas draws, long tasks, seek latency, and input-to-paint time at 60/120/144 Hz
on P4-04 target devices for sustained 1x/4x/8x playback and range dragging. If
needed, skip Canvas reconstruction only on RAF callbacks with zero advanced
ticks and no presentation/lifecycle change. Prove the next painted command
stream, committed frame, event history, announcements, and normal/reduced
goldens remain identical.

## Deferred human evidence, not a code blocker

The following cannot be closed by renderer decomposition or more deterministic
fixtures:

- whether real players finish within the desired 5–15 minutes across experience
  strata (P1-02/P1-10/P4-03);
- whether Stage 4–7 pressure creates useful choices rather than fatigue
  (P1-08);
- whether early life loss, rescue, and the current carried-life score bonus feel
  fair and understandable (P1-04);
- whether the station/action hierarchy and failure feedback are readable under
  actual keyboard/cabinet play rather than paused storyboard inspection
  (P2-02/P4-03);
- whether retained replay verification, cold seek, drag, and long playback meet
  low-end device budgets (P4-04).

Do not use the refactor proposed here to tune rules, values, campaign scenarios,
copy, or pixels. Human findings should drive those changes in separate,
explicitly versioned experiments.

## Recommended order

1. Extract the transient effect store only (TD10-G02), preserving every byte of
   visual evidence and every generation-2 artifact.
2. Consolidate event facts without changing current context-specific strings
   (TD10-G01).
3. Remove coordinate duplication one painter family at a time (TD10-G04), then
   extract leaf painters behind the existing draw order.
4. Harden viewer scenario admission when a reusable normalized-scenario boundary
   is available (TD10-G03); do not alter engine/proof state for it.
5. Measure before optimizing replay reconstruction (TD10-G05/P4-04), and keep
   gameplay tuning dependent on real participant evidence.
