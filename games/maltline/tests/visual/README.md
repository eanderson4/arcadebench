# Maltline visual baselines

These screenshots are deliberate product evidence, not disposable test output.
The fixture page renders authored game states directly through
`MaltlineRenderer`; it never enters the live game loop or mutates a score.
Production and fixture entries both mount `src/viewer/shell.ts` and load the
same verified font definitions from `src/viewer/fonts.ts`. Their HTML files now
contain only intentionally different document metadata and entry scripts.
Fixture query handling, authored states, deterministic presentation controls,
and motion overrides remain isolated in `visual-fixtures.ts` and
`visual-fixtures.css`; the production build test rejects the fixture runtime
marker if that boundary is crossed.

From the repository root:

```sh
npx playwright install chromium
npm run test:visual --workspace=@arcadebench/maltline
npm run test:visual:update --workspace=@arcadebench/maltline
```

Use the update command only after inspecting the diff and confirming the visual
change is intentional. Pixel comparison is exact (`maxDiffPixels: 0`). The
geometry tests cover a 1024×768 laptop and the exact 699/700px support
transition. At widths below 700px the
shared shell now hides the unreadably scaled canvas and presents a designed,
accessible keyboard/wider-window message; its 390×844 portrait rendering is a
checked-in golden. Production checks also verify that the transition stops
engine ticks and hidden draws, clears held input, and resumes from a fresh clock
anchor; hitch/background eligibility, font fallback, scoped input, focus, and
ARIA/live status run alongside the pixel suite.

The checked-in baselines are pinned by `baseline-manifest.json` and recorded on
Linux with:

- Playwright's Chrome for Testing `153.0.8010.12` (Chromium revision 1243);
- Playwright Test `1.63.0`;
- Noto Sans `5.3.0` Latin weights 400, 600, 700, and 800, bundled for both
  production and fixture under the `Maltline UI` family so host font discovery
  cannot change DOM or canvas text;
- UTC, `en-US`, sRGB, DPR 1, reduced motion, fixed presentation time, and
  seeded presentation randomness.

The exact suite rejects a browser version, project, platform, dependency, or
PNG inventory that differs from the manifest before accepting the visual gate.
Browser upgrades may change rasterization and must be reviewed as dependency
changes.

## Baseline history

The Second Shift progression keeps Stage 3 to two flavors across three lanes,
introduces Strawberry on Stage 4, and adds a reviewed arcade chase intermission
before Stage 5. Short desktop sizing now budgets wrapped controls, the ranking
notice, and the visible Shift Board header, eliminating page scroll at 700×500
and 1024×600. The comparison study explicitly starts each replacement survey
at its top, while the live board identifies the current Second Shift season.
Those two intentional screenshot changes produce a 49-image ordered raw-PNG
SHA-256 of
`f0f5e7e2dfb9c7d216d1e143e6a2a62a14fdf0d00b71c6cb6ef5a3a7210e2b2b`.

The customer-gait pass replaces the symmetric sliding pose with a distance-driven
contact/pass cycle. Incoming and departing customers now alternate a planted
foot and lifted passing foot, separate their front and rear legs, soften their
shadow and torso bob, and keep a restrained arm counter-swing. Departing
customers turn fully toward the door while their music-note overlay remains
unmirrored. Normal and reduced-motion frames were reviewed at desktop and 700px.
The 49-image ledger's ordered raw-PNG SHA-256 is
`40162db2a93d9333be0e92ba46f1e7ee3a41c089d1051f24905b0c508f73e4ba`.

The September 15 room-perspective pass replaces the flat playfield and bottom
status bar with the approved Maltline shop interior. A rear wall, side walls,
customer doors, serving counters with floor supports, and the left preparation
counter now share one perspective system. Clean cups sit on the counter and
the selected blender carries its own large fill/ready status, keeping inventory
and preparation inside the scene. The full 49-image ledger pins the reviewed
room across desktop, 700px, replay, overlay, and human-lab states; its ordered
raw-PNG SHA-256 is `3d9531f4b81e2147715b5755f111919e73d0d15d14ef87907ed1a3c66563c01c`.

The September 15 cabinet update deliberately refreshes the reviewed gameplay,
overlay, retained-proof, and human-lab screenshots for the machines beside the
bartender, the expanded lanes, and the two-button control copy. It also replaces
the title card with the illustrated Start Game splash. All changed captures were
reviewed as expected/current/difference triplets at desktop and minimum width;
the manifest continues to pin every PNG and the concatenated image digest.
The renderer update does not change the frozen generation-two proof fixtures.

The P0-16 parity update regenerated eight gameplay baselines after production
and fixtures were moved to the same bundled font definitions. The changed
pixels are confined to text that previously requested weight 600 while the
fixture supplied the 400 file; the title baseline was unchanged. The complete
nine-image set was inspected as a montage after regeneration.

EXP-022 deliberately regenerated the desktop set for the new operational
hierarchy and added `no-clean-jars`, `reduced-motion`,
`stage-clear-walkout`, and `unsupported-portrait` coverage. Review confirmed
that the left rail no longer collides with the player, action and jar states
remain readable at a glance, V/C/S cues survive without color, stage-clear
copy names walkouts honestly, and the portrait gate is visually complete.

The TD-02 viewer-correctness tranche preserved every existing baseline byte for
byte and added `keyboard-focus.png`. That fixture deliberately focuses the game
root and records the three-pixel strawberry focus boundary around the stage;
review confirmed that the boundary is clear without obscuring the HUD, canvas,
or footer controls.

The P1-01/P1-05 first-run flow added deterministic `instructions`, `stage-card`,
`countdown`, `game-over`, and `victory` desktop baselines. It deliberately
regenerated `title` for its concise objective/failure copy and
`stage-clear-walkout` for its explicit advance/restart action. A seven-card
montage was inspected at full source resolution: headings, body copy, control
rows, stage facts, countdown numeral, terminal outcomes, and focus-safe card
bounds are all legible without obscuring the persistent footer controls. All
non-overlay gameplay, focus, and unsupported-device baseline hashes remained
unchanged.

The TD-03 viewer-truth pass deliberately regenerated all seventeen desktop
baselines plus `keyboard-focus.png` because the persistent footer now says
`F / ENTER — slide held shake`. The title, instruction, and Stage 1 card also
clarify that return jars are caught automatically by facing their window; no
catch key is implied. `countdown` changed only through the shared footer, while
the later-stage life-copy correction has no current Stage 8 card golden. The
390×844 unsupported-device baseline remained byte-identical because its footer
is hidden. Review of both a full 19-image contact sheet and a full-size
four-card copy montage found no clipping or hierarchy regression.

TD-04 moved the visual gate from an ambient system Chrome 143 installation to
Playwright's pinned Chrome for Testing 153. All 19 PNGs were intentionally
regenerated for small browser text-raster differences; no authored layout,
copy, art, or fixture state changed in that migration. A full contact sheet was
inspected after the 40-test update run and retained the approved hierarchy,
focus boundary, entity legibility, overlay fit, and portrait composition.

EXP-045 added a fifth proof column to the live Shift Board and a retained-proof
inspection detail. The updated eligible and accepted panels plus the new
`competition-inspected.png` and `competition-ranked-390.png` baselines were
reviewed at source resolution. The compact inspect actions remain visible
without horizontal scrolling at 390px; the detail view clearly separates the
locally reproduced outcome, player-readable stage timing, and optional SHA-256
fingerprint from the server-returned standings.

P3-05 deliberately regenerated only `competition-inspected.png` for the local,
deterministic replay scrubber. Review at 1280×720 confirmed that the retained
frame preserves Maltline's canvas art direction and that replay controls follow
the frame in the scroll order. Focused geometry checks at 700×600 and 390×720
keep the full frame, transport, seek controls, summaries, and collapsed proof
facts inside the sheet without horizontal overflow; reduced-motion and
canvas-unavailable paths retain the same semantic controls and proof facts.

P2-18 makes exact replay stepping player-readable without changing the internal
tick cursor: tick zero is visibly Frame 1, adjacent frame steps always change
the displayed and semantic ordinal, and elapsed m:ss is explicitly labelled
game time. `competition-inspected-controls-700.png` pins the scrolled 700×600
control surface at Frame 2 with the Next frame focus treatment, speed, factual
station summary, recent-event surface, and collapsed proof details all visible.

P1-08 added four explicitly synthetic pressure-envelope fixtures without
changing the existing generation-2 control images: one each for Lunch Rush,
Jar Shortage, Thick Shakes, and Happy Hour. They are renderer stress evidence,
not claims about a recorded run; fixture metadata records that provenance and
checks jar conservation, scenario identity, entity bounds, and identity-color
pixels. The Stage 5 envelope uses two washing and two returning jars—the full
four-jar pool—so it deliberately leaves the player empty while both no-clean
cues are visible. Four 1280×720 goldens plus one 700×720 Happy Hour golden cover
the stage-specific pressure mechanics and minimum supported gameplay scale;
1024×768 remains parametric containment evidence rather than a redundant exact
image.

EXP-057 deliberately strengthens returning jars and the jar-economy gauge.
Return jars now retain an opaque empty silhouette and static leftward trail;
their final approach distinguishes the selected `CATCH` lane from a numbered
window the player must move to. The gauge prioritizes `CLEAN`, then accounts
for `WASH` and `IN PLAY`. New exact frames cover Stage 5, Stage 7, and the
zero-clean state at 700px; an isolated 700px return-window frame covers both
selected and unselected approaches. Isolated desktop frames for first serve,
jar catch, and shake launch, together with fixture event/age metadata and the
integrated game-over fixture, close the deterministic feedback-state matrix.
All changed replay, human-lab, focus, and gameplay images were reviewed at
source resolution before the 42-image manifest was accepted.

The next P2-02 tranche keeps `counter-after-dark-v1` while strengthening
customer/order ownership and outgoing-shake direction. Order tickets now use a
neutral outer keyline and deterministic leader, with top-lane tickets clamped
below the HUD. Outgoing shakes use a filled, outlined silhouette and persistent
rightward chevrons, including reduced motion; return jars retain their opposing
leftward language. A new synthetic Stage 4 collision corridor and a Stage 4
pressure frame bring the exact 700px gameplay set to six states. Fixture
contracts separately identify order tickets, leaders, shake bodies, shake
trails, and return jars; they also enforce lifecycle accounting, unique bounded
IDs, and full jar conservation. The 44-image contact sheet and every changed
source-resolution frame were reviewed before acceptance. These are
deterministic visibility and separation results, not a claim of human
cabinet-distance comprehension.

The station-state truth pass adds two validated synthetic/unranked Stage 6
twins at 700px: `stage-6-station-tool-split-700.png` and
`stage-6-station-tool-split-reduced-700.png`. Both hold the same coherent state
with Chocolate selected and Strawberry processing at 50%; exact metadata pins
the selected tab, processing frame/meter, action chip/badge, jar conservation,
lifecycle accounting, unique IDs, and CSS-scaled cue sizes. The renderer-wide
station controls were deliberately repinned wherever the canvas is visible;
overlay-only and unsupported-device images stayed byte-identical. The manifest
now contains 49 exact images, including a desktop split-state control. The
meter uses an exact continuous bottom-up fill with fixed fifth dividers: 50%
occupies exactly half rather than rounding up to three illuminated bands.
Full-color, grayscale, and 25% inspections of the twins confirm the neutral
selection and amber processing cues remain separate without motion. Human-lab
artifact revision 12 marks the later cabinet hierarchy, contrast, and crisp-overlay
presentation pass and supersedes revision 11; revision 11 marked the visible
numeric `LIVES N` role, while revision 10 marked the truthful `CHAIN N` HUD exposure,
and revision 9 had already superseded revision 8 for the station-state repair.

The HUD truth pass replaces the multiplier-looking `STREAK ×N` with the exact
first-fulfillment chain `CHAIN N`; authoritative point popups remain unchanged.
Seventeen existing gameplay controls changed only inside the chain chip. Stage
7 at 1280/700 and the paired Stage 4 traffic-corridor 700 normal/reduced frames
were reviewed at source resolution and in grayscale. Browser measurement also
pins `CHAIN 2`, `CHAIN 10`, `CHAIN 11`, and `CHAIN 31` inside the existing 92px
canvas chip at both supported widths. No fixture or manifest inventory changed.

The numeric-lives truth pass makes `LIVES N` the HUD's primary life indicator
and retains one subdued cup as secondary cabinet art while lives remain. Exact
Canvas transcripts cover 0, 1, 2, and 4 lives in normal and reduced motion;
browser geometry pins separation from stage, `ORDERS LEFT`, and the canvas edge
at desktop and 700px. Forty-one existing images changed wherever the shared HUD
canvas is visible, including the zero-life game-over background, the four-life
first-pour state, Stage 7 at 1280/700, and paired Stage 4 traffic normal/reduced
controls. Those frames were reviewed at source resolution and in a desaturated
25% montage. The manifest inventory remains 49 images; its lexicographically
ordered raw-PNG SHA-256 is
`00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
This evidence proves deterministic rendering and containment, not human
cabinet-distance comprehension.

The September playable-overhaul pass regenerated the affected frames after
the shop moved to a full-height cabinet, the counters and actors adopted one
shared perspective projection, ingredient letters became distinct symbols,
and pouring moved into the bartender's hand. Chocolate now uses a segmented
bar silhouette. Desktop geometry keeps the 16:9 playfield inside a 1280×720
viewport while using the available height. The reviewed 49-image ledger's
ordered raw-PNG SHA-256 is
`3081a3b3510661f0a631f7fd8d66d20a03d798e6a8e2c67abbcb644522aee2ef`.

The homepage-navigation pass adds a visible arrow and underline to the shared
ArcadeBench header link. Forty-three images changed only within the header
wordmark (at most 335×31 pixels); the six competition overlays and cropped
controls remain byte-identical. Desktop, minimum-width, portrait, lab, title,
and keyboard-focus variants were compared before accepting these images.
The 49-image manifest now pins ordered raw-PNG SHA-256
`05450bbb5e5d5ba81ed9221a85e2b6dcaec554b68f1e20494da917589ce806e5`.

The desktop-button pass teaches Space for button 1 and Enter for button 2.
Forty-four captures changed in the splash key labels, instruction steps,
workstation label, action prompt, and footer text. The shorter footer keycaps
recenter its contents without changing the playfield or cabinet geometry. All
44 before/after/diff images were reviewed, including reduced motion, the human
lab, and embedded replay controls; five images remain byte-identical. A human
lab countdown was recaptured to exclude unrelated status-dot animation pixels.
No workstation design preview was adopted. The 49-image ledger now pins
ordered raw-PNG SHA-256
`1085a5f410818e7f93606e5c8993e3a176c530b62fd4a86219ef64e8d4cbdd11`.
