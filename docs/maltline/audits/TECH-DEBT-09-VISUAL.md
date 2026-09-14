# Maltline station and environment visual review 09

**Date:** 2026-09-11
**Scope:** current `counter-after-dark-v1` gameplay renderer, theme tokens,
deterministic visual fixtures, and pinned 1280×720 and 700×720 gameplay
frames. This was a read-only audit; this report is the only change.

## Verdict

The current counter, customer, order, outgoing-shake, return-jar, and ambient
hierarchy is coherent enough to preserve. Recent pressure fixtures give useful
exact evidence at the supported 700px minimum, including a normal/reduced pair
for opposing shake and jar traffic. No broad environment repaint is justified
by the present evidence.

One bounded defect should be fixed before more ornamental polish: the station
bank can visually assign an in-progress blend to the wrong flavor machine after
the player changes station, and its state indicators become too small at
700px. This is presentation truth and minimum-width readability debt, not a
campaign, rules, score, proof, or replay defect.

| ID | Severity | Closure class | Finding |
| --- | --- | --- | --- |
| TDV9-01 | P1 presentation truth | Fix before the next participant run | Selection and processing are conflated, so moving stations during a blend can animate the newly selected machine rather than the machine for `player.blending`. |
| TDV9-02 | P1 minimum-width readability | Fix in the same bounded tranche | The status line, cabinet labels, and progress bar shrink below useful cabinet-distance sizes at 700px; idle chocolate status text also misses the 4.5:1 small-text contrast target. |
| TDV9-03 | P3 environmental polish | Defer | Counter material, lamp warmth, doors, and empty-stage negative space could be refined, but they do not currently obscure the tested traffic identities and changing them would broaden pixel churn without evidence of a gameplay gain. |

## TDV9-01 — Selected station and active blend can disagree

**Severity:** P1 presentation truth.

The engine applies a station movement before blend continuation and retains the
flavor captured when blending began (`src/core/engine.ts:143-165`). A player can
therefore start strawberry, continue holding blend, and move selection to
chocolate. The resulting truthful state is `station = chocolate` and
`blending = strawberry`.

The action status reads the stored blend flavor and would say `BLENDING S`
(`src/viewer/renderer.ts:1189-1207`). The cabinet painter instead defines
`blending` as `active && state.player.blending !== null`
(`src/viewer/renderer.ts:1233-1248`) and paints its hopper, stream, and progress
using that cabinet's `art` (`src/viewer/renderer.ts:1297-1342,1363-1403`). It
therefore shows the selected chocolate cabinet processing while the status
says strawberry. None of the current fixtures separates selected flavor from
blending or held flavor: the Stage 6 pressure fixture selects and blends
strawberry, while the Stage 7 pressure fixture selects and holds strawberry
(`src/viewer/visual-fixtures.ts:518-590`).

The repair should model three distinct presentation facts:

1. **Selected station:** persistent cream bracket/top tab and a large `V`, `C`,
   or `S` cue on `state.player.station`.
2. **Processing station/tool:** progress, stream, and processing keyline on the
   station matching `state.player.blending`, independent of selection.
3. **Held tool:** the held shake remains with the worker and in the action
   status. It must not make the newly selected cabinet look ready, because
   `player.holding` can also differ from the selected station.

In `drawStationBank`, compute selected and processing station indices once and
pass separate `selected` and `processing` flags to `drawMachine`. Current
authored campaigns have one station per flavor
(`src/core/campaign-source.ts:32-124`); the implementation should nevertheless
make its uniqueness assumption explicit rather than silently choosing every
matching duplicate if that constraint is ever relaxed.

## TDV9-02 — Operational state is undersized at 700px

**Severity:** P1 minimum-width readability.

The internal canvas is 960×540. The shell is `min(980px, 96vw)` and the canvas
is displayed at `width: 100%` (`src/viewer/style.css:29-34,115-127`). At a
700px viewport the reviewed frame spans x=14..686, exactly 672 CSS pixels, so
the canvas scale is `672 / 960 = 0.7`. The corresponding authored and displayed
measurements are:

| Element | Authored canvas size | 700px displayed size | 1280px displayed size at the 980px shell |
| --- | ---: | ---: | ---: |
| Cabinet | 74×96px | 51.8×67.2px | 75.5×98px |
| Cabinet/flavor-key text | 8px | 5.6px | 8.2px |
| Action-status text | 10px | 7px | 10.2px |
| Action-status pill | 244×25px | 170.8×17.5px | 249.1×25.5px |
| Blend-progress track | 50×7px | 35×4.9px | 51×7.1px |

Those source sizes are at `renderer.ts:1156-1186,1213-1228,1233-1248,
1320-1342`. At 700px the reviewed Stage 4 and Stage 7 frames still make the
selected cabinet discoverable through the cream outline and static chevron,
but reading the flavor-key labels, action sentence, or blend amount from
cabinet distance is substantially harder than recognizing the lane traffic.
The issue is magnified by `image-rendering: pixelated` during downscaling
(`style.css:122-127`).

The idle chocolate action state uses chocolate `light` (`#a06a38`) as both
border and 10px text (`visual-theme.ts:47-51`; `renderer.ts:1194-1228`). Against
the status panel's source RGB `#05140e`, the contrast ratio is approximately
4.15:1; compositing the 94%-opaque panel over the dark station floor leaves it
approximately 4.1:1. That is below the 4.5:1 target for normal text, and the
displayed text is only 7px at minimum width. Ready, blending, blocked, cream,
and cream-dim tokens have materially stronger contrast on the same dark
surface.

Reduced motion is not the cause, but it exposes the weakness. The selection
chevron becomes static rather than disappearing (`renderer.ts:1404-1414`),
which is good. The blend wave, steam drift, and indicator pulse stop, leaving
the 35×4.9px displayed progress track and small status text as the primary
processing evidence (`renderer.ts:1305-1318,1331-1355,1396-1403`). The existing
reduced-motion desktop fixture covers blending, while the new reduced 700px
collision fixture covers traffic but is idle at the station bank. There is no
reduced 700px exact frame for a split selected/processing state.

## Why the environment repaint is deferred

The current draw order puts wall, lamps, counters, and doors behind customers,
outgoing shakes, and return jars (`renderer.ts:305-318`). The broad wooden
counters are visually dominant, but active-lane cream lips and dashed frames
remain structural rather than color-only (`renderer.ts:488-550`). Customer
tickets have a neutral keyline and owner leader, and the normal and reduced
Stage 4 collision-corridor fixtures protect customer, shake body/trail, and
return-jar identities at 700px
(`tests/visual/maltline.visual.spec.ts:1415-1602`). The Stage 4 and Stage 7
pressure frames also preserve three occupied order lanes and same-lane traffic
under the current ambient treatment.

The lamp cones and warm door spills are drawn before actors
(`renderer.ts:434-485,563-615`), so their salience does not erase actor pixels.
The large negative space between counters and machines in early stages helps
separate service traffic from preparation state; filling it with decor would
create a new occlusion risk. These observations support visual containment and
identity, not a claim that humans have proven the art comprehensible. Any later
ambient or material pass should follow observed playtest difficulty rather
than precede it.

The bounded station repair should therefore leave wall, awning, lamp, counter,
door, customer, order, shake, jar, jar-gauge, CSS shell dimensions, and canvas
resolution unchanged.

## Bounded implementation plan

### Theme

Extend `MALTLINE_VISUAL_THEME` without changing the
`counter-after-dark-v1` direction ID. Add a frozen semantic `station` group for
the dark status panel, cream primary state text, selected keyline/tab,
processing keyline, progress track/fill, and inactive edge. Flavor colors stay
as flavor accents and `V/C/S` identity; they should no longer be the sole color
of small status text.

Unit acceptance:

- status text versus status panel is at least 4.5:1;
- selected and processing structural keys are at least 3:1 against their
  immediate surfaces;
- `V/C/S` remains present for selection, processing/held flavor, order, and
  shake identity; and
- the direction ID and unrelated customer/traffic tokens do not change.

### Renderer

- Separate `selected` from `processing` in `drawMachine`.
- Keep a persistent cream selection bracket and replace/supplement the small
  floating arrow with a compact top tab containing a downward shape plus a
  16px-or-larger authored `V/C/S` cue. At 0.7 scale that yields at least 11.2px.
- Put progress, stream, and processing keyline only on the actual blend-flavor
  machine. Use a segmented track at least 12 authored pixels high (8.4px at
  700) so reduced motion retains a useful non-animated measure.
- Shorten the action strings enough to raise the primary text to at least 14
  authored pixels (9.8px at 700), keep the text cream, and use the state/flavor
  token on a leading icon and border: for example `C SELECTED · HOLD SPACE`,
  `S BLENDING · 50%`, `S READY · F / ENTER`, and `NO CLEAN JARS · CATCH
  RETURN`.
- Keep held flavor on the existing worker cup plus the action icon. If the cup
  silhouette needs emphasis at 700, add a dark backing/keyline without moving
  it to the selected cabinet.

This does not require CSS scaling or canvas-resolution changes and should not
alter renderer time, RNG, presentation lifecycle, engine state, input, audio,
or semantic overlay behavior.

## Fixture and acceptance plan

Add one coherent Stage 6 state shared by two deterministic fixtures. Derive it
from `stage-6-thick-shakes-pressure`, retain its customer and jar conservation,
set `player.station` to chocolate while retaining
`player.blending = strawberry`, and use 50% progress. This state is reachable
because station movement and blend continuation are independent in the engine.

- `stage-6-station-tool-split`: normal motion, exact at 1280×720 and
  700×720.
- `stage-6-station-tool-split-reduced`: the same state, time, and seed with
  `reducedMotion: true`, exact at 700×720.

This is three new images. Existing affected desktop and 700px goldens should be
updated only when the shared station painter legitimately changes their
pixels. Preserve existing pressure/collision states and provenance.

Required non-pixel assertions:

- selected station is index 1 / chocolate while processing flavor is
  strawberry at exactly 50%; the action text says `BLENDING S`, not C;
- the selected-frame region is centered on chocolate, while the processing
  keyline, stream, and progress regions are centered on strawberry;
- selected cue, processing cue, action status, progress, held-tool (when
  present), jar gauge, customers, slides, and jars remain within the authored
  canvas and visible after applying the CSS scale;
- the new fixture preserves full jar conservation, lifecycle equations,
  unique bounded entity IDs, and pressure provenance;
- the reduced twin has `data-motion-mode="reduced"`, identical logical
  metadata, no motion-only dependency, and the same selected/processing
  separation;
- 700px has no horizontal overflow and the controls remain within 720px;
- targeted command-recorder tests show identical selected/processing geometry
  for repeated draws with the same state/time/seed; and
- source-resolution and grayscale inspection confirms that selection,
  processing, and held state remain distinguishable without flavor hue.

The exact runner and manifest must remain pinned to the current browser/font
contract. Do not weaken existing token-pixel thresholds or replace exact
screenshots with looser percentages.

## Ranked and human-lab boundaries

The repair is presentation-only. Ranked authority, campaign generation,
ruleset, proof schema, verifier, replay inputs, score, lives, and competition
submission must remain byte-for-byte behaviorally unchanged. Production exact
goldens should be deliberately repinned and inspected, but this visual repair
does not itself justify a proof or campaign generation bump.

The development-only human lab imports and constructs the same
`MaltlineRenderer` (`src/viewer/human-lab.ts:37,254-260`) and therefore exposes
participants to this repair. Its current artifacts are strict experiment
revision 8 (`src/experiments/human-lab-session.ts:25,557-564`; browser
expectation at `tests/visual/human-lab.visual.spec.ts:630-633`). If the renderer
repair lands before participant collection begins or before more participants
are added, bump the lab experiment revision to **9**, make strict validation
reject revision 8, and update the browser/unit artifact expectations. This
prevents old and repaired visual exposure from being silently pooled. If any
revision-8 human data already exists, retain it as a separate exposure cohort;
do not rewrite or merge it into revision 9.

Candidate transforms, assignment/blinding, consent, observations, timing,
download, no-network isolation, and synthetic test-driver labeling remain out
of scope. The new fixture may expose flavor names because it is developer
visual evidence; ordinary human-lab DOM/ARIA must continue hiding A/D identity
before debrief.

## Evidence reviewed and commands run

Source review covered `renderer.ts`, `visual-theme.ts`, `style.css`,
`visual-fixtures.ts`, `maltline.visual.spec.ts`, `engine.ts`, and
`campaign-source.ts`. The following pinned images were inspected at native
resolution:

- `first-pour-idle.png`, `blend-half.png`, `ready.png`, and
  `no-clean-jars.png` at 1280×720;
- Stage 4 and Stage 7 pressure at both 1280×720 and 700×720;
- `reduced-motion.png` at 1280×720; and
- `stage-4-traffic-corridor-reduced-700.png` at 700×720.

Commands/checks:

```sh
rg -n "function draw|drawStation|station|counter|lane|cabinet|ambient|selected|flavor|tool|reducedMotion|motion" \
  games/maltline/src/viewer/renderer.ts \
  games/maltline/src/viewer/visual-theme.ts \
  games/maltline/src/viewer/style.css \
  games/maltline/src/viewer/visual-fixtures.ts \
  games/maltline/tests/visual/maltline.visual.spec.ts

identify games/maltline/tests/visual/baselines/chromium-system/{first-pour-idle,blend-half,ready,no-clean-jars,reduced-motion,stage-4-lunch-rush-pressure,stage-7-happy-hour-pressure,stage-4-lunch-rush-pressure-700,stage-7-happy-hour-pressure-700,stage-4-traffic-corridor-reduced-700}.png

npm run test:visual --workspace=@arcadebench/maltline -- --grep \
  "visual baseline runner|desktop (blend-half|ready|reduced-motion)$|minimum-width (stage-4-lunch-rush-pressure|stage-7-happy-hour-pressure|stage-4-traffic-corridor-reduced) remains exact"
```

The focused pinned-browser gate passed **7/7**. A local WCAG relative-luminance
calculation produced the reported 4.15:1 source-token contrast for `#a06a38`
against `#05140e`. No baseline or product file was modified by this review.
