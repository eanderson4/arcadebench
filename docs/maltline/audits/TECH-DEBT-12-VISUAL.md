# Maltline TD-12 visual and accessibility review

**Date:** 2026-09-11
**Scope:** Settled EXP-078 presentation, exact visual evidence, semantic status,
human-lab exposure provenance, and prospective Stage 8 relief. This is a
read-only product audit; only this report was added.

## Verdict

EXP-078's `CHAIN N` repair is accepted. It removes the false multiplier claim,
keeps authoritative point feedback unchanged, fits the existing HUD chip at the
current generation-2 maximum, has equivalent static content in normal and
reduced motion, and is bound to strict human-lab revision 10. There is no P0
visual, accessibility, ranked-proof, or study-provenance blocker.

Two genuine residuals should not be folded back into that accepted repair:

1. the style board still publishes the pre-repin Stage 7 hashes; and
2. the visible lives resource is still communicated only by small strawberry
   shake drawings, despite being a critical failure resource.

The Stage 8 `132 -> 138` experiment does not need a static golden to remain a
valid prospective telemetry artifact. A static authored frame cannot prove a
cadence change. Candidate-specific visual-density evidence becomes appropriate
before promotion, while perceived pacing and recovery remain human-study
questions.

## Priority summary

| ID | Priority | Classification | Blocks now? | Finding |
| --- | --- | --- | --- | --- |
| TDV12-01 | P1 | Evidence integrity | Blocks claiming the style-board hash table is current; does not block runtime or EXP-078 | The Stage 7 hashes in `VISUAL-DIRECTION.md` predate the accepted `CHAIN N` repin. |
| TDV12-02 | P1 | Player-facing clarity | Not an EXP-078 blocker; fix before claiming cabinet-distance lives readability | Lives are unlabeled strawberry-cup glyphs; the embedded flavor letter is about 4.7 CSS px at 700px and describes the cup, not its lives role. |
| TDV12-03 | P2 | Prospective visual evidence | Deferred until a Stage 8 candidate approaches promotion | The 49-image matrix has Stage 4-7 pressure controls but no engine-derived Stage 8 pressure sequence. |
| TDV12-04 | P2 | Terminology and comprehension | Cleanup is local; comprehension requires humans | The style board still says `streak` in two presentation-facing places, while the UI correctly says first-fulfillment `CHAIN`. The bonus relationship is intentionally not taught yet. |

## Closed acceptance: truthful chain and score feedback

### Source truth

`activeChainText` returns `CHAIN N` only above one and explicitly names the
concept as a first-fulfillment chain
(`games/maltline/src/viewer/presentation-copy.ts:12-17`). The renderer consumes
that one helper and retains the exact uncapped engine integer
(`games/maltline/src/viewer/renderer.ts:1472-1485`). The engine increments the
field only for first fulfillment, while a repeat rescue scores zero and does
not increment it (`games/maltline/src/core/engine.ts:284-305`). Life loss resets
the chain (`games/maltline/src/core/engine.ts:368-371`).

The label therefore reports a fact; it no longer promises multiplication. The
underlying additive score remains `100 + 10 * min(previous chain, 10)`
(`games/maltline/src/core/rules.ts:13-17` and
`games/maltline/src/core/engine.ts:289-296`). `CHAIN 11` and later values may
continue increasing while the score bonus is capped, but the UI makes no claim
that the count is a multiplier or bonus tier.

Serve and catch popups continue to use `event.points`, including honest zero
point rescue text (`games/maltline/src/viewer/renderer-effects.ts:165-181`). The
renderer tests pin `+100` and `+110` for two same-tick events while allowing only
one aggregate HUD `CHAIN 9`; they explicitly reject reconstructing an
event-local chain from post-tick state
(`games/maltline/tests/renderer-presentation.test.ts:421-448`). Semantic event
copy likewise says the exact awarded points and contains no chain claim
(`games/maltline/src/viewer/semantic-status.ts:59-67` and
`games/maltline/tests/viewer-session.test.ts:143-155`). This is the correct
relationship: event-local score at the event, aggregate chain in the HUD.

### Semantic and announcement behavior

The hidden current-game status includes the same `CHAIN N` fact beside score,
lives, and orders (`games/maltline/src/viewer/semantic-status.ts:12-27`). It is
an `aria-live="off"` region described by the canvas, whereas discrete events use
their separate polite live region (`games/maltline/src/viewer/shell.ts:80-82`).
Production avoids redundant DOM writes when the semantic string has not changed
(`games/maltline/src/viewer/main.ts:141-149`). Adding chain parity therefore did
not create per-frame or duplicate announcements.

This division is accepted. Do not add `CHAIN N` to every serve announcement
unless events gain an authoritative event-local chain value; the current event
union cannot truthfully assign intermediate uncapped chains to multiple serves
on one tick.

### 92px containment and motion

The chain chip is `92 x 22` canvas pixels at HUD coordinates translated to
`(126, 23)`, with an 11px bundled Noto Sans label
(`games/maltline/src/viewer/renderer.ts:1474-1484`). Generation 2's largest
stage has 31 customers (`games/maltline/src/core/campaign-source.ts:118-131`),
so `CHAIN 31` covers the reachable per-stage upper bound. Unit transcripts pin
the label anchor, chip rectangle, and identical intrinsic normal/reduced
geometry for 2, 10, 11, and 31
(`games/maltline/tests/renderer-presentation.test.ts:328-358`). The browser test
loads the real bundled font at 1280 and 700, requires all four labels to measure
at most 80px inside the 92px chip, and rejects `STREAK`/`x` language
(`games/maltline/tests/visual/maltline.visual.spec.ts:1684-1702`).

Normal motion applies only a bounded pulse; reduced motion fixes scale to one
(`games/maltline/src/viewer/renderer.ts:1474-1477`). Exact Stage 4 corridor
normal/reduced frames and Stage 7 1280/700 frames pass. Source-resolution review
found `CHAIN 4`/`CHAIN 6` contained, separated from the score and centered stage
label, and still identifiable when desaturated. This supports pixel correctness,
not cabinet-distance comprehension.

At 700px the shell is `96vw = 672px` wide over a 960px canvas
(`games/maltline/src/viewer/style.css:29-35,122-127`), an exact 0.7 scale. The
chain font is consequently about 7.7 CSS px and the chip about 64.4 x 15.4 CSS
px. The current image is readable under source-resolution inspection and has
ample geometric containment, but automated checks cannot establish comfortable
reading at physical cabinet distance. Treat that as a human/device validation
question rather than reopening the truthful-copy fix.

### Human-lab provenance

The production renderer is used in the participant-facing lab, including the
shared semantic status (`games/maltline/src/viewer/human-lab.ts:1140-1149`). The
lab now emits only schema 3 / experiment revision 10
(`games/maltline/src/experiments/human-lab-session.ts:22-25,554-565`). Unit tests
reject revision 9 (`games/maltline/tests/human-lab-session.test.ts:452-479`), and
real-engine and test-driver browser artifacts expect revision 10
(`games/maltline/tests/visual/human-lab-real-engine.visual.spec.ts:486-505` and
`games/maltline/tests/visual/human-lab.visual.spec.ts:628-640`). Documentation
also identifies revision 10 (`docs/maltline/HUMAN-LAB.md:58-68`).

This boundary is sufficient. No campaign candidate, score, proof, rank, or
generation identity changed. Existing revision-9 study artifacts remain
historical inputs and must not be normalized as revision 10.

## Findings

### TDV12-01 — Style-board hashes are stale after the intentional repin

**Priority:** P1 evidence integrity. **Runtime blocker:** no. **Documentation
claim blocker:** yes.

The representative-frame table in `docs/maltline/VISUAL-DIRECTION.md:261-266`
still records the pre-CHAIN Stage 7 digests. The current exact files are:

| Frame | Current SHA-256 |
| --- | --- |
| `stage-7-happy-hour-pressure.png` | `4cbdf4a0fbb177de113bbe0429c64f16a643177b165a638b8f4d6f5bf78129cf` |
| `stage-7-happy-hour-pressure-700.png` | `8f31e6a793e6dabbd9d6b61260c111ecc60abb1c9cfce6d5024876f2738c7dc3` |

The manifest itself is current at
`ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`,
and the ordered raw 49-PNG hash is
`73e3de37c6c87ad4df4bfe7af4989c888b4bd4d74836ace43c020bdfa0a90255`,
matching EXP-078. This is isolated documentation drift.

**Bounded exit:** replace only those two table hashes after rerunning the pinned
exact Stage 7 tests; add a small documentation/hash assertion only if the table
is intended to remain machine-authoritative. Do not repin any PNG.

### TDV12-02 — The visible lives resource has no role label

**Priority:** P1 player clarity. **EXP-078 blocker:** no. **Blocks:** a strong
claim that a first-time sighted player can read remaining lives at cabinet
distance without prior icon interpretation.

The HUD renders one strawberry shake cup per life and no visible word or number
(`games/maltline/src/viewer/renderer.ts:1508-1511`). The shared cup painter puts
the flavor cue in a 7px canvas font and draws the shake silhouette
(`games/maltline/src/viewer/renderer-vessel-painters.ts:46-118`). At the supported
700px boundary, the `.95` life-cup scale and `.7` canvas scale reduce the `S`
letter to approximately 4.7 CSS px. More importantly, `S` identifies
strawberry, not "life." With one life in the reviewed Stage 7 frame, the lone
cup can be interpreted as a flavor/product decoration rather than the last
failure resource.

The title and instruction cards explain four lives and all three loss causes
(`games/maltline/src/viewer/gameplay-flow.ts:63-89`), and the semantic status
always exposes a numeric life count (`games/maltline/src/viewer/semantic-status.ts:20-26`).
Those paths make the rule accessible but do not repair peripheral visual
recognition during pressure. The style board itself expects a reviewer to
identify "one life" without fixture metadata
(`docs/maltline/VISUAL-DIRECTION.md:239-259`), which pixels alone have not
demonstrated.

**Bounded implementation:** add a compact fixed-role `LIVES N` or `L N` readout
at the existing right HUD anchor. The shake marks may remain secondary art, but
the numeric text must be the dominant non-color cue. Do not change initial
lives, recovery, loss rules, scoring, or proof authority.

**Exit evidence:** Canvas transcripts for 0/1/2/4 lives; exact Stage 7 1280/700,
game-over zero-life, and one four-life early-stage frame; a 700 normal/reduced
pair; geometry proving separation from `ORDERS LEFT`, canvas edge, and stage
label; desaturated and 25% review; semantic text unchanged. If this renderer
change lands before additional human-lab participants, advance the strict lab
revision again because participant exposure changed.

Whether the label is recognized quickly enough remains a human/device question,
but the present absence of any visible role label is an objective defect.

### TDV12-03 — Stage 8 relief needs sequence evidence only before promotion

**Priority:** P2 prospective evidence. **Blocks current unranked EXP-078:** no.
**Blocks generation-3 promotion:** visual-density coverage should be added as
part of a promotion packet, not as evidence of fun or pacing.

The exact fixture inventory covers pressure in Stages 4-7 but no Stage 8 active
pressure surface (`games/maltline/tests/visual/maltline.visual.spec.ts:18-63` and
`games/maltline/tests/visual/baseline-manifest.json:12-61`). EXP-078 changes only
Stage 8's initial spawn interval from 132 to 138 ticks and proves the first seven
scenario fingerprints identical
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:100-112`). No
renderer, layout, or asset changes accompany it.

A hand-authored static Stage 8 image would not prove the cadence or its recovery
effect. If the candidate approaches promotion, derive frames from actual fixed
controller/seed execution and retain a short stage-local sequence or density
envelope:

- control and candidate at named fixed ticks plus each run's maximum open-order
  and opposing-traffic point;
- exact candidate 1280 and 700 frames, with a 700 reduced-motion twin using the
  same engine state;
- scenario/candidate fingerprint, tick, reachability, lifecycle equations, jar
  conservation, unique IDs, lane occupancy, and visible-region metadata;
- geometry assertions for HUD, orders, customers, outgoing shakes, returns,
  stations, and jar gauge across the whole sampled sequence.

This can establish containment and visual-density non-regression. It cannot
establish that 138 ticks feels fair, improves recovery, or meets the 5-15 minute
target. Those remain P1-02/P1-04/P1-10 human-study questions. Do not repin the
generation-2 matrix to an unpromoted candidate.

### TDV12-04 — Presentation terminology and score comprehension remain separate

**Priority:** P2 cleanup / deferred research. **Blocker:** no.

The style board's run-context and feedback lists still use `streak`
(`docs/maltline/VISUAL-DIRECTION.md:135-153,289-298`). Engine field names may
remain `streak`, but presentation guidance should say "first-fulfillment chain"
to avoid future reintroduction of multiplier language. This is a docs-only
cleanup.

The live HUD does not explain the additive bonus cap, and the instruction flow
does not teach scoring. That is no longer a false claim: `CHAIN N` is an exact
count, and each event popup states the awarded points. Whether players connect
those facts, understand why repeat rescue is zero, or expect the bonus to keep
growing after chain 11 cannot be established from screenshots. The human lab's
required score-belief response is the correct evidence source. Do not add a
formula or "bonus tier" before deciding whether such teaching is desirable and
whether it would bias the current study.

## Recommended order

1. Correct the two stale Stage 7 hashes in the style board; no pixel work.
2. Implement the bounded visible numeric lives label as the next independent HUD
   truth tranche, with a new lab revision if it precedes participants.
3. Clean up the two remaining presentation-facing `streak` terms in the style
   board.
4. Add engine-derived Stage 8 sequence/pressure evidence only when a candidate
   is selected for possible authority promotion.
5. Use human sessions, not exact PNGs, to decide score teaching, cabinet-distance
   chain readability, Stage 8 pacing, and recovery fairness.

## Checks performed

```text
npm test --workspace=@arcadebench/maltline -- --run \
  tests/presentation-copy.test.ts \
  tests/renderer-presentation.test.ts \
  tests/viewer-session.test.ts \
  tests/human-lab-session.test.ts
# 4 files / 51 tests passed

npx playwright test --config=playwright.config.ts \
  tests/visual/maltline.visual.spec.ts \
  --grep "truthful chain labels|reduced-motion fixture|desktop stage-7-happy-hour-pressure|minimum-width stage-4-traffic-corridor"
# 5/5 passed with pinned Chrome for Testing 153

sha256sum \
  games/maltline/tests/visual/baselines/chromium-system/stage-7-happy-hour-pressure.png \
  games/maltline/tests/visual/baselines/chromium-system/stage-7-happy-hour-pressure-700.png \
  games/maltline/tests/visual/baselines/chromium-system/stage-4-traffic-corridor-700.png \
  games/maltline/tests/visual/baselines/chromium-system/stage-4-traffic-corridor-reduced-700.png \
  games/maltline/tests/visual/baseline-manifest.json

find games/maltline/tests/visual/baselines/chromium-system \
  -maxdepth 1 -type f -name '*.png' -print0 | sort -z | xargs -0 cat | sha256sum
```

The Stage 7 1280/700 and Stage 4 traffic-corridor 700 normal/reduced PNGs were
also inspected at source resolution. Automated results above establish code,
semantic, geometry, and pixel contracts. Physical-size readability, score-model
comprehension, pacing, fatigue, and perceived recovery require human/device
validation and are not claimed here.
