# Maltline Technical-Debt Audit 09 — Gameplay Presentation

**Date:** 2026-09-11
**Scope:** Remaining P2-02 station/counter/environment work and the completed
pixel-neutral P2-11 station/action presentation precursor.
**Method:** Read-only gameplay/UX review of the current renderer, semantic
status, Stage 4–7 pressure fixtures, exact visual assertions, engine input
order, and the new shared presentation model. No product code, task log, or
experiment log was changed for this report.

## Verdict

There is no gameplay-simulation, proof, replay, or release blocker in this
slice. The outgoing-shake and returning-jar legs are now the strongest parts
of the `blend → hold → slide → catch` loop. Remaining P2-02 work should be a
bounded station-state truth and hierarchy pass, not a broad environment
repaint.

The pixel-neutral P2-11 precursor is successful: Canvas and semantic status
now share one immutable action precedence and exact copy boundary, including
the important distinction between selected, processing, and held flavor.
Existing pixels and text remain exact. It intentionally does not fix machine
painting, so the false-ready signal and two reachable hierarchy mismatches
below remain real P2-02 work.

## Findings

### TD9-G01 — A selected machine signals ready when blending is impossible

**Severity:** P1 player-facing friction. Fix in the next P2-02 station tranche;
not a ranked or engine blocker.

The machine's first indicator is green whenever the station is selected
(`renderer.ts:1331-1335`). It stays green when `jarsAvailable === 0`, even
though the engine cannot begin a blend. It also stays green beside the amber
processing light while a blend is active (`renderer.ts:1336-1341`). The Stage
5 zero-clean fixture visibly combines the false green lamp and bright cream
selection with the truthful amber `NO CLEAN JARS` action chip.

This conflates three different meanings: selection, ability to start, and a
completed/ready action. Under Stage 5 pressure, a player using peripheral
machine cues can reasonably hold Blend against a blocked tool.

**Bounded fix:** keep selection neutral (cream shape/outline); show the amber
blocked vocabulary when no clean jar can start; show only processing/progress
emphasis while blending; reserve green readiness for the held shake/action.
Do not change engine input behavior.

**Acceptance:** in identical selected-station states, idle, blocked,
processing, and held modes must yield distinct semantic machine states. A
blocked station must not contain the ready token. Normal and reduced-motion
700px controls must retain the same non-color distinction.

### TD9-G02 — Selected station and processing station can truthfully differ,
but the machine painter treats them as one

**Severity:** P1 presentation correctness in a reachable state. Fix with
TD9-G01; not a simulation blocker.

The engine applies station movement before continuing a held blend, while the
blend flavor itself remains fixed. Moving from Strawberry to Chocolate while
holding Blend therefore produces a valid state with selected Chocolate and
processing Strawberry (`engine.ts:139-163`). The new unit test reaches this
through real engine steps (`station-action-presentation.test.ts:7-39`).

The shared model represents it correctly as selected Chocolate,
`processingFlavor: strawberry`, and action Strawberry
(`station-action-presentation.ts:33-38,55-69`). The action chip and semantic
status now remain truthful. However, `drawMachine` still defines processing as
"selected and blending," then paints using the selected machine's `flavor`
argument (`renderer.ts:1220-1235,1284-1304,1318-1341,1350-1390`). In that
reachable state it visually pours Chocolate while the action text correctly
says Strawberry.

**Bounded fix:** independently derive selected station and processing station
from the shared model. Draw the neutral selector at `selectedStation.index`;
draw liquid/progress/stream at the unique station matching
`processingFlavor`. Do not cancel or redirect a blend in presentation code.

**Acceptance:** a real-engine selected-Chocolate/processing-Strawberry frame
must show selection only on Chocolate, processing only on Strawberry, and
Strawberry action/flavor text. Repeat with reduced motion and assert the same
static identity rather than relying on swirl animation.

### TD9-G03 — Held-shake action is correct in copy but visually subordinate to
the station

**Severity:** P1 hierarchy/arcade pacing. Fix in the same bounded tranche;
human confirmation remains necessary.

Holding correctly wins the new shared precedence and uses the held flavor even
when selection differs (`station-action-presentation.ts:40-52`). Canvas and
semantic status consume that result (`renderer.ts:1190-1218`;
`semantic-status.ts:10-24`). The player also carries a small flavored cup.

The selected machine nevertheless retains its large halo, cream outline,
green lamp, and floating chevron (`renderer.ts:1237-1246,1263-1269,
1331-1335,1391-1400`). At the 700px Stage 7 control this cabinet remains the
largest high-contrast actionable object after the next action has moved to the
player's lane and Serve key. This increases eye travel and can encourage
another station decision instead of the time-critical slide.

**Bounded fix:** retain a quieter persistent selector for the next blend, but
move readiness emphasis to the held cup/player and action chip. Preserve the
existing outgoing shake body/trail once Serve fires.

**Acceptance:** a held-flavor/selected-flavor mismatch must show the held cup
and ready vocabulary as dominant while keeping the selected station
identifiable but not ready. A subsequent launch frame must remove held state
and show the same lane/flavor on the outgoing slide.

### TD9-G04 — Environment refinement should subtract competition, not add
detail

**Severity:** P2 polish guidance. Nonblocking.

The lane field already has large glossy counters, full active-lane dashes,
lamp cones and domes, door glows, awning stripes, wall texture, and motes
(`renderer.ts:305-319,328-353,434-560`). These establish the accepted
`counter-after-dark-v1` direction, but they occupy more area than the action
objects. At 700px, the fixed 10-internal-pixel action chip text is only about
7 CSS pixels (`renderer.ts:1200-1215`), so additional ornament cannot carry
the loop's hierarchy.

Keep the active lane number, service lip, order ownership, direction trails,
and final return window. If refinement changes the background, reduce lamp,
gloss, awning, or full-perimeter contrast near gameplay silhouettes. Do not
animate the environment to compete with blend progress or approaching jars.

## Pixel-neutral precursor disposition

The new `deriveMaltlineStationActionPresentation` boundary is small, pure, and
deeply frozen (`station-action-presentation.ts:5-32,38-97`). It provides:

- one action precedence: holding, blending, blocked-no-jars, idle;
- selected station index/flavor independently from processing, held, and
  highest-precedence action flavors;
- the existing five-percent quantization;
- a semantic tone plus exact current Canvas and assistive text.

`drawActionStatus` now consumes the model without geometry or painter changes
(`renderer.ts:1190-1218`). `semanticPlayStatus` consumes the same semantic
sentence (`semantic-status.ts:10-24`). This closes the prior risk that these
two surfaces could independently drift in action priority or wording.

Focused tests cover a real-engine cross-station blend, held and selected
flavor disagreement, all precedence branches, quantization at 0/5/50/100
boundaries, invalid station selection, deterministic derivation, mutation
isolation, and nested freezing (`station-action-presentation.test.ts:7-142`).

Fresh verification performed during the precursor:

- `npx vitest run games/maltline/tests/station-action-presentation.test.ts games/maltline/tests/renderer-presentation.test.ts games/maltline/tests/viewer-session.test.ts games/maltline/tests/visual-theme.test.ts` — 34/34 passed.
- Eight existing exact desktop/700 idle, blending, ready, blocked, Stage 5,
  Stage 6, and Stage 7 screenshot controls passed without golden changes.
- `npx tsc -p games/maltline/tsconfig.json --noEmit` passed.
- `npm run build --workspace=@arcadebench/maltline` passed.
- Scoped `git diff --check` passed.

## Recommended deterministic storyboard

Add one explicitly **synthetic/unranked visual-evidence storyboard** based on a
single Stage 5–7 scenario/run context. It should never use proof, authority, or
"ranked" language. Pin both 700px full-motion and reduced-motion controls for:

1. selected/idle and selected/blocked-no-jars;
2. a blend where selected and processing flavor differ;
3. held ready where selected and held flavor differ;
4. the immediate post-Serve slide in the player's lane;
5. final return approach in the correct and incorrect player lanes.

Machine-readable assertions should prove:

- exactly one selected station, with index/flavor equal to the shared model;
- processing state only on the station matching `processingFlavor`;
- blocked never shares ready semantics, and quantized progress matches state;
- held cup/action flavor and player lane agree;
- `shake_launched` lane/flavor agree with the outgoing slide and rightward
  trail;
- `CATCH` appears if and only if player lane equals return lane, otherwise the
  correct `WINDOW n` appears;
- every frame conserves the scenario jar pool.

Pixel-token counts remain useful for containment, but they are insufficient by
themselves: current fixture metadata proves selected-station/action/jar regions
exist (`visual-fixtures.ts:954-993`) without proving their machine-state meaning.

## Remaining P2-11 work

Do not combine the next pixel-changing station pass with a broad renderer
rewrite. The safe order is:

1. have `drawMachine` consume the established model and add the storyboard
   truth assertions as the bounded P2-02 change;
2. review and pin that deliberate pixel delta;
3. later establish one authoritative scenario/layout object, then extract
   environment and station leaf painters without changing draw order;
4. defer transient-effect storage/reduction to its own evidence-backed change.

The precursor centralizes action semantics, but `renderer.ts` still owns scene,
actors, projectiles, stations, inventory, effects, and HUD; scenario geometry
is still split between stored and per-draw inputs; and fixture geometry still
re-derives layout. Those are maintainability items, not reasons to hold the
bounded station truth fix or ranked release.
