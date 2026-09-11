# Maltline Player-Model Baseline

**Date:** 2026-09-10
**Purpose:** telemetry evidence prerequisite for P1-02/P1-04; no authored
campaign parameters were changed.

## Current generation-2 baseline

This section supersedes every generation-1 result retained below for historical
traceability. It covers ruleset 2, campaign generation 2, and configuration
SHA-256
`e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`.
These raw profiles drive engine inputs directly. They remain deterministic core
stress probes, not estimates of human skill or evidence about shipped keyboard
mediation.

```text
npx tsx games/maltline/tools/player-model-comparison.ts
```

The registered campaign plus 32 deterministic seed-offset tuning variants has
comparison fingerprint `fnv1a64:dd75527c636fb0ab`. Its full formatted JSON
repeats at SHA-256
`51dbc5dfd99435426f6e90eb78b7d3159e5f4e3a3b3561240a441ca6acf1a745`.
The canonical reactive configuration fingerprint is
`fnv1a64:28ac8864373bc650`. Shadow seeds are tuning probes only; ranked
generation 2 uses one fixed registered campaign so players receive equal
difficulty.

| Profile | Canonical result | Active time | Score | Lives | Canonical losses |
| --- | --- | ---: | ---: | ---: | --- |
| Reactive | Won 8/8 | 361.033 s | 36,255 | 4 | None |
| Delayed competent | Won 8/8 | 374.283 s | 35,430 | 2 | 2 walkouts |
| Novice/error | Lost after 3 clears | 114.183 s | 7,070 | 0 | 4 shake smashes |

| Profile | Wins | Stages cleared | Attempt seconds | Score | Remaining lives | Aggregate losses |
| --- | ---: | --- | --- | --- | --- | --- |
| Reactive | 33/33 | 8 throughout | 360.600–361.033; 360.775 mean | 36,255 throughout | 4 throughout | None |
| Delayed competent | 31/33 | 7–8; 7.939 mean | 365.117–376.217; 369.629 mean | 34,555–36,255; 36,075.455 mean | 0–4; 3.515 mean | 14 walkouts, 2 jar smashes |
| Novice/error | 0/33 | 1–4; 2.485 mean | 49.617–175.383; 100.312 mean | 2,685–11,460; 6,105.303 mean | 0 throughout | 108 shake smashes, 24 jar smashes |

The clean six-minute active baseline makes the 5–15 minute target plausible,
but human wall-clock sessions remain the authority. Four lives and the expanded
late campaign separate delayed competence from deliberate repeated mistakes.
Stages 4–6 still need human observation for the measured pressure valley.
Direction and serve edges are now buffered at the viewer boundary, but human
misses still cannot be classified from raw-controller evidence. Score-breakdown
evidence should likewise precede a ruleset change to the compounding
carried-life bonus.

### Physical-intent mediation baseline

A separate versioned harness converts each controller's desired levels into
physical key transitions, then feeds the shipped `viewer-keyboard-input-v2`
adapter with its three-cadence direction delay and
`pre-step-blend-or-held-one-shot-v1` serve policy. It does not replace or
rewrite the raw evidence above.

The 33-seed artifact has comparison fingerprint
`fnv1a64:913b70f55b90ad5a` and formatted SHA-256
`2fba231bf50f2cd74c1366c72de85b16d255139baa3516a873b3cc92a8765987`.
Reactive intent wins 0/33, delayed-competent intent wins 30/33, and novice
intent wins 0/33. Emitted inputs replay byte-identically.

The reactive/delayed inversion demonstrates that these controllers' level
transitions interact materially with a physical adapter; it does not establish
that real players resemble either profile or that campaign numbers should be
changed to make the synthetic wrapper win. Use the mediated runs to select
observational scenarios, then tune only from actual control-feel and human
wall-time evidence.

## Historical generation-1 baseline (superseded)

The remainder records the evidence that motivated generation 2. Its fingerprints,
three-life results, four-life shadow, and tuning hypotheses must not be used as
the current campaign baseline.

### Reproduction

```text
npx tsx games/maltline/tools/player-model-comparison.ts
```

The checked-in comparison uses the canonical seeds plus offsets `101`, `307`,
`911`, and `2029`. Its schema-v1 comparison fingerprint is
`fnv1a64:3e9139aa1e54c617`. Runs are deterministic and the JSON is
byte-identical on repetition.

All models use current or previously observed state only. None reads the
scenario seed or predicts the spawn RNG. A new controller instance is created
for every stage so history cannot leak across stages or repeated campaigns.

## Versioned profiles

| Profile | Behavior recorded in fingerprint data |
| --- | --- |
| `reactive-current-state-v1` | Existing zero-delay reference policy |
| `delayed-competent-v1` | 2-tick reaction delay; 1 hesitation tick every 120 ticks |
| `novice-error-injection-v1` | 7-tick reaction delay; 2 hesitation ticks every 90 ticks; one deliberate wrong-lane serve every 8 observed serve opportunities |

Reaction delay is implemented as a pause before adopting a changed decision,
not as future knowledge or replaying stale world state. Novice mis-serves are
scheduled from observed serve opportunities and route a held shake to an
adjacent lane. The error schedule and all timing parameters participate in the
controller fingerprint.

These are controlled probes, not claims about human skill. In particular, the
novice's periodic error rate is intentionally legible and severe enough to test
life-loss behavior.

## Canonical campaign

| Profile | Result | Stages cleared | Active time | Score | Lives | Losses |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Reactive | Won | 8/8 | 235.333 s | 25,930 | 3 | None |
| Delayed competent | Won | 8/8 | 258.850 s | 25,930 | 3 | None |
| Novice/error | Lost | 2/8 | 80.600 s | 4,535 | 0 | 3 shake smashes |

The delayed model adds 23.517 seconds (10.0%) without changing perfect-play
score or lives on the canonical seed. That is the useful competence signal:
response friction affects duration before it necessarily becomes damage.

## Canonical plus four shadow-seed campaigns

| Profile | Wins | Stages cleared | Attempt time | Winning time | Mean score | Aggregate losses |
| --- | ---: | --- | --- | --- | ---: | --- |
| Reactive | 5/5 | 8.0 mean; 8–8 | 235.017–237.050 s; 235.583 mean | 235.583 s mean | 25,930 | None |
| Delayed competent | 4/5 | 7.8 mean; 7–8 | 255.300–259.167 s; 257.517 mean | 258.071 s mean | 25,725 | 3 walkouts, 1 jar smash |
| Novice/error | 0/5 | 1.6 mean; 1–2 | 44.100–80.600 s; 66.823 mean | — | 3,682 | 12 shake smashes, 3 jar smashes |

The only delayed-model loss reaches stage 8 before exhausting its third life.
Three other delayed runs remain perfect; one wins with two lives. Seed changes
therefore expose a real but narrow survivability boundary rather than general
controller collapse.

The novice model differs in all intended dimensions: lower progress and score,
shorter failed attempts, and a loss distribution dominated by injected serving
errors. This makes it useful for checking whether a lives change merely softens
the competent boundary or trivializes repeated mistakes.

## Four-life shadow experiment

This experiment changes only `initialRun.lives`; it does not edit the campaign.

| Profile | Wins | Mean stages | Attempt time | Mean score | Aggregate losses |
| --- | ---: | ---: | --- | ---: | --- |
| Delayed competent | 5/5 | 8.0 | 255.800–259.167 s; 257.650 mean | 27,725 | 3 walkouts, 1 jar smash |
| Novice/error | 0/5 | 2.8 | 49.700–197.100 s; 106.947 mean | 6,624 | 16 shake smashes, 4 jar smashes |

One extra life closes the delayed model's one-seed completion gap while still
failing to carry the error-injection model through the campaign. It does,
appropriately, let that model see more of the early/mid campaign.

## Initial tuning hypotheses

1. **Test four starting lives first.** The model evidence predicts a move from
   80% to 100% delayed-competent completion across this seed set without making
   repeated novice errors survivable. A human session should verify whether the
   extra life reads as welcome forgiveness or removes meaningful tension.

2. **Do not claim the 5-minute target from simulation time yet.** Successful
   model runs are 3.92–4.32 active minutes. Viewer transitions, instruction
   reading, and human hesitation may carry real elapsed time over five minutes,
   but telemetry currently excludes those. Measure wall-clock human runs before
   lengthening the campaign.

3. **If human competent wins remain under five minutes, test roughly 20–30%
   more late-campaign work rather than uniformly slower movement.** A first
   experiment should target 300–420 active seconds while preserving the early
   teaching stages. Increasing late customer counts or adding a late pressure
   phase is less likely than global speed reduction to make the opening feel
   inert. Re-run score-ceiling and controller baselines because more customers
   also change score.

4. **Treat novice results as a lower-bound stress probe.** A deterministic
   wrong serve every eight opportunities guarantees repeated life loss and is
   harsher than an unknown human error distribution. Do not tune until this
   model wins. Use it to ensure forgiveness buys additional learning time while
   preserving consequences.

## Next evidence

- Expand from four shadow seeds to at least 32 before committing campaign
  values; retain offset zero as the canonical regression case.
- Record real elapsed time separately from active simulation time.
- Compare first-session humans against the model observables: stage reached,
  reaction pauses, wrong serves, missed jars, and loss reason.
- After human calibration, version the controller parameters instead of
  rewriting v1; fingerprints make cross-experiment comparisons explicit.
