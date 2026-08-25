# Bartop design notes — iteration log

The meta loop around `cabinet.py`:

1. Run `hardware/.venv/bin/python hardware/cabinet.py` → fresh `out/` previews.
   Every run auto-archives its renders + full PARAMS snapshot to
   `out/history/iter-NNN/` (STEP/STL regenerate from params, not archived).
   Iterations 1–3 predate archiving; `iter-001` = post-iteration-3 state.
2. Look at the renders (front/side/top/iso), note issues below.
3. Codex consult: `codex exec --sandbox read-only -i out/view_*.png ...`
   for external critique; append its issues to the list.
4. Pick a small concrete subset (one work unit), implement, re-run, re-render.
5. Move fixed items to Done with the iteration that fixed them.

Iteration cadence: 1 work unit, then 2, then 4 — escalating batch size as
confidence in the loop grows.

## Open issues

From v0.5 self-review (mine):

- [ ] Control-deck front face is a tall blank 100 mm slab — reads heavy;
      consider sloping the nose or recessing a plinth line
- [ ] Back panel is a full vertical slab; references soften/angle it
- [ ] Marquee chin lip reads as a hard notch from some angles
- [ ] Renderer: dark tessellation artifacts at seam/fillet corners
      (cosmetic, but they pollute every review pass)
- [ ] Renderer: holes on the deck barely read in top/iso shading;
      add edge outlines or a section view for cutout QA
- [ ] No T-molding groove / accent stripe channel (all three references
      have a stripe or trim line under the screen)

Codex consult #1 (2026-08-18, v0.5 renders, gpt-5.6-sol via `codex exec`):

1. Screen small for 560 mm body → blank bezel. (Constrained: 8″ is the BOM
   pick; would need cabinet narrowing — conflicts with 2P deck. Style the
   bezel instead. DEFER to user.)
2. Wide-box proportions → narrow to ~480–500 mm. (Same 2P constraint. DEFER.)
3. Silicone lacks the references' S-curve → 30–50 mm corner radii, R20–30
   blend at the deck→face transition. (Iteration 2 candidate.)
4. Marquee thin/wedged → 70–90 mm tall, project 20–30 mm, round leading edge
   R10–15. **(Iteration 1 work unit.)**
5. Controls crowded at outer corners → keep ≥35 mm from walls. (Partially
   misread render; P2 button edge is 25 mm from inner wall. Watch item.)
6. Controls near front edge → 55–70 mm wrist rest, optional 5–8° deck slope.
   (Misread: front row is 120 mm back. Deck slope is a real option. v2.)
7. Front fascia too tall/heavy → reduce 100 → ~80–90 mm. (Iteration 2
   candidate; check JLF body clearance ~57 mm below deck.)
8. Screen recess crude → round window corners R10–15. (Iteration 2
   candidate.)
9. Faceted faces — renderer tessellation, not geometry. (Renderer unit.)
10. Warpage risk on 3 mm monocoque → splits + ribs. (Already the v1 plan.)

Codex consult #2 (2026-08-18, iteration-1 renders):

1. Marquee still a thin visor → overhang 10→18–20 mm, chin R16–18. (Iter 3.)
2. Silhouette over-raked → tilt 18→13–15°. (Iter 3 candidate; user picked
   18 originally — keep 18 unless user says otherwise. NOTED, not applied.)
3. Seam blend R4 → R18–22. **(Iteration 2, done: R20.)**
4. Flat deck/heavy fascia → 5° deck slope, nose ≈78 mm. **(Iteration 2,
   done; nose radii also bumped to R22/R18 per #5.)**
5. Nose corners boxy → R20–25/R18–20. **(Iteration 2, done.)**
6. Screen stranded on wide face → 0.8–1 mm × 4 mm perimeter reveal, 10–12 mm
   offset from window. (Iter 3 candidate.)
7. Clusters tight to walls → player spacing 280→260. (Iter 3 candidate;
   check stick/body clearances first.)
8. Blank fascia → recessed plinth line 8 mm × 1.5–2 mm, 12–15 mm above base.
   (Iter 3 candidate.)

Codex consult #3 (2026-08-18, iteration-3 renders, verification):

**Verdict 7/10** — proportions now read convincingly against the references.

1. Section-view "self-intersections" — renderer artifact of the raw x=0 cut
   (solid validates, single watertight solid). Cosmetic; improve the section
   view later.
2. Marquee lip underside notch is abrupt → small 3D fillet on the lip
   underside edge. **(Done in iter-002: R6 lip blend.)**
3. Reveal groove edges slightly uneven — shallow-feature tessellation;
   cosmetic in renders only.
4. Ø5.5 JLF mount holes near small-feature limit — fine for FDM at 0.4 mm
   nozzle but watch it; could open to Ø6.
5. Vertical outer edges (front corners) still sharp vs references → add
   R10–15 vertical corner fillets. **(Done in iter-002: R12, all four
   vertical corners.)**

Deferred to user: display tilt 18° vs 13–15° (codex prefers shallower; 18°
was your spec). ~~screen-to-body ratio~~ → resolved by the 9.7″ upsize
(iteration 5).

Codex consult #4 (2026-08-18, iter-11 renders + exploded + reference):

1. **Critical — hood appliance-like vs target canopy.** Parked: hood was
   tuned against the measured reference sheet; trust the user's direction.
2. **Critical — apparent assembly conflicts in exploded view.** Acted:
   `check_collisions()` in parts.py intersects every seam-sharing pair and
   fails loudly on >1 mm³ overlap.
3. High — squat stance. Parked (deck depth was a deliberate user call).
4. High — side silhouette zigzag. Parked (matches the reference's gesture).
5. **High — center split crosses the control deck.** Real; structural to
   360-mm printability. USER DECISION: sand/fill seam vs big-format print
   vs aluminum path. `split_vertical` toggles it.
6. Medium — mask too wide at sides. **Done: glass 400→360 mm.**
7. Medium — control hierarchy. Mostly render shading; parked.
8. Medium — blank fascia. The laser-etched badge/serial plate lives there
   (BOM); parked.
9. Medium — corner language. Radii are uniform by construction; render
   shading artifact. Parked.
10. Medium — thin retention on vertical seams. **Done: 3 cross-bolt joints
    per layer (was 2).**

## Done

- v0 → v0.5: added marquee overhang + rounded silhouette corners
  (was "shoebox with a hood"); height 347 → 377 mm
- Iteration 1 (2026-08-18): marquee unit — 75 mm tall, 10 mm forward lip,
  15 mm lean, R12 leading edges; height → 402 mm
- Iteration 1: replaced matplotlib renderer with numpy z-buffer rasterizer
  (kills painter's-algorithm artifacts, codex #9); added x=0 section view
- Iteration 1: **bug found by truthful renders** — the marquee overhang had
  silently rotated the display-face line, so the window/rabbet/doubler frame
  missed the real face (window never cut, doubler floating disjoint). Fixed
  by keeping the display face exactly on the tilt line and making the
  overhang a separate lip vertex; doubler now embeds 0.5 mm into the wall;
  main() prints solids count as a regression guard
- Iteration 2 (2026-08-18): deck slope 5° (fascia 100→78 mm at the nose),
  nose radii R22/R18, seam blend R4→R20 (codex #3/#4/#5)
- Iteration 3 (2026-08-18): marquee overhang 10→18 mm + chin R16; player
  spacing 280→260 mm; 1 mm window perimeter reveal ring; recessed plinth
  line across the fascia (codex #1/#6/#7/#8)
- Iteration 4 (2026-08-18, archived `iter-002`): R6 lip-underside blend and
  R12 vertical corner fillets (consult #3 items 2 and 5); every run now
  auto-archives renders + PARAMS to `out/history/iter-NNN/`
- Iteration 5 (2026-08-18, archived `iter-003`): **display upsized 8″ →
  9.7″ 4:3** (LP097QX1 class, outline 210.6×166.3, active 196.6×147.5) —
  the 8″ window was stranded on the 560 mm-wide face; display face length
  235→225, screen centered (frac 0.52→0.50), doubler margin 30→20 (height
  402→393 mm). BOM updated to match. Renderer refactored into shared
  `hardware/render.py` for the upcoming assembly views.
  Watch item: side bezels still wide (2P width vs 4:3 panel) — fill with
  marquee speakers + face detailing rather than more panel.

- Iteration 6 (2026-08-18, archived `asm-001`): BOM component catalog
  (`components.py`, 16 parts, contact sheet at `out/catalog/_sheet.png`) +
  `assembly.py` — all 32 placed instances rendered with the enclosure
  (`asm_*.png`) and components-only (`guts_*.png`). Panel + polycarb sit in
  the rabbet on the face frame; controls on the deck; SBC/encoder/amp/buck/
  speakers floor-mounted; switch/jack/USB-C on the rear wall; PSU + feet
  outside. Speakers are floor-placed for now — marquee grille + mount is
  the next enclosure unit. Section view artifacts (known consult-#3 item)
  are noisier with components crossing the cut plane — cosmetic only.
- Profile study (2026-08-18, `out/profile_study.png`, 3 rounds): fixed the
  "narrow at the top" — round 1 explored hood depth (thin visor 53 mm →
  full hood 170 mm); round 2 trimmed around the full hood; round 3 fixed
  the sharp prow by making the hood face near-vertical (lean 27° → ~9°).
  Constraint discovered: at 18° tilt the face top lands at y≈320, so the
  back wall can't come past ~325 mm without the profile self-intersecting
  (variant F at 315 mm failed `make_face`).
- Iteration 8 (2026-08-18, archived `iter-005` / `asm-004`): reference  measurement pass against `references/direction-hood-sheet.jpeg` (enclosure
  only — the sheet's deck is 1P, ours stays 2P). Fixed three wrong-way
  details: hood face now RECEDES ~11° going up (`marquee_lean: -18`), top
  cap slopes DOWN toward the back (`top_cap_rise: -20`), hood repositioned
  to chin y≈130 (`marquee_overhang: 83`) — correcting the iter-7 claim that
  the hood "stayed put" (it had slid 95 mm forward with the seam). Deck
  slope 5→8° (nose 86→78 mm). Window is now the full glass/mask opening
  380×180 with R10 rounded corners + parallel reveal ring; black mask
  plate modeled in the assembly (active area cut 194.6×145.5). Speakers
  moved to down-firing in the base (bottom grille cutouts land in v1).
  Bug found by render: the flat JLF plate on the 8°-sloped deck poked
  through the surface at its front edge — seated front-edge-flush for now;
  v1 gets a flat machined pocket. Polycarb sheet dropped from renders (no
  alpha in the rasterizer; still modeled + archived).
- Iteration 9 (2026-08-18, archived `iter-007` / `asm-006`): kid-friendly
  controls — per player: **2 primaries (OBSF-30, red, front row, Ø40×1.2 mm
  tactile recess wells) + 4 secondaries (OBSF-24, white, back row)**.
  Width 560→530 mm (player spacing 240; ~500 mm is the floor for this
  layout). Bug found by the solids guard: primaries initially placed on the
  secondary 28 mm pitch → overlapping Ø30 holes + wells pinched off
  floating slivers (solids=3); fixed to 40 mm pitch centered under the
  secondary span.
- Iteration 10 (2026-08-18, `parts.py`): **shell split into buildable
  parts** — 3 horizontal layers (base / face-column / hood), optional
  vertical x=0 split (default on) → 6 parts, all valid single solids, all
  fit a 360 mm bed. Joints: boss-block pairs with M3 insert pilots
  (Ø4.2×7) + M3 clearance holes, screws hidden inside/underside. BOM
  cutouts landed: rear 19 mm power switch / DC jack / USB-C slot, bottom
  speaker grille slots (2×5). Seam lesson: the deck split must sit above
  the R20 seam blend (z=125, not 105 — slicing inside the blend left a
  dangling wall sliver). Exploded view: `out/exploded_iso.png`. Per-part
  STEP+STL in `out/parts/` for fab/Onshape import.
- Screen study (2026-08-18, `out/screen_study.png`): 5 panel options drawn
  to scale with cabinet-height impact. DECISION (user): **B — 12.1″ 4:3**.
- Iteration 12 (2026-08-18, archived `iter-010` / `asm-009`): consult #4
  actions — glass 400→360 mm (narrower mask side bars), 3 cross-bolt
  joints per vertical seam (was 2), and `check_collisions()` in parts.py:
  all 7 seam-sharing part pairs intersect at **0.000 mm³** — the exploded
  view's "apparent conflicts" were a rendering read, now verified clean.
- Iteration 13 (2026-08-18, `panels.py` + `out/panels/`): **flat-pack
  decomposition** — 8 flat panels (bottom, back, top, marquee, lip/hood
  floor, face w/ 300×205 rounded window, deck w/ all control cutouts,
  nose), 8 corner cleat gussets (M3 insert pilots both faces + end bolts
  into side plates), 2 side plates carrying the rounded silhouette. All 18
  valid single solids. Construction note: cleats carry the corner inserts;
  exterior corners rely on the side plates' rounded silhouette + a butt
  seam (chamfer V-groove). Bug fixed en route: interior-side detection for
  cleats must use polygon WINDING, not the centroid (concave profiles have
  the centroid in the notch). Also this round: marquee overhang 83→58 mm
  (user), glass 360→300 mm (bezel mask side bars ~27 mm). Caveat: panels
  are 494 mm wide — laser/CNC stock or the aluminum path; printing them
  needs an X-split + splice plates (not yet implemented). The flat deck
  eliminates the JLF sloped-pocket issue.
- Iteration 11 (2026-08-18, archived `iter-009` / `asm-008`): 12.1″ 4:3
  panel (active 245.8×184.3, ~261×204×8 outline class); cabinet shrunk to
  wrap it — width 530→500 (layout floor for the 2+4 clusters), face
  224→245, glass/mask 400×205; envelope 500×340×430 mm, 2609 cm³. Joint
  bosses re-seated for the narrower shell. Parts: 6× valid, all ≤
  250×340×125 mm — comfortably on a 360 bed. BOM: panel pick + recess/retainer
  note updated.
- Iteration 7 (2026-08-18, archived `iter-004` / `asm-002`): **deck
  shortened 250→155 mm** — control interface as designed spans 139 mm
  (stick plate front y≈103 → options back y≈242 in the old layout);
  +10% buffer ≈ 152 mm. Seam moves 95 mm toward the user; hood stays put
  (face length 224 at 15° lands on the same chin). Neck depth at mid-face
  63→156 mm. Tilt 18→15° (round-3 direction). Hood banked from variant N:
  overhang 100, lean 15 (~9°), top R24, chin R20. Compact control layout:
  40 mm wrist rest, stick y=67, buttons y=58/94, start/select y=130.
  Envelope now 560×340×414 mm, 3181 cm³.

Parallel track started: `components.py` BOM component catalog (display,
JLF sticks, OBSF buttons, ESP32 encoder, SBC, amp, buck, speaker, jacks,
switch, PSU, inserts, feet) — then an assembled render with the enclosure.
- Iteration 15 (2026-08-18, archived `iter-012` / `asm-011`+`asm-012`):
  **90° hood box** per the user's sketch (`references/sketch-hood-90deg-box.png`)
  — hood floor/top perpendicular to the display face, marquee face parallel
  to it, all brake bends 90°. `marquee_lean`/`top_cap_rise` params REMOVED;
  `marquee_overhang` (58) is now measured ⊥ face, `marquee_height` (93)
  parallel to face. Envelope grew to 500×340×441.5 mm, 2517 cm³.
  **Speakers moved into the hood**: grille slots cut through the hood floor
  (2×5 slots, 44×4, pitch 8, centered 29 mm from the chin) firing down at
  the player; the old bottom grilles are gone. Driver changed ND64-4 (2.5″,
  64 mm frame) → **2″ class (DMA58-4, 52 mm frame)** — a 64 mm frame cannot
  fit the 57 mm hood floor without breaching the chin or the rear wall;
  rear-edge clearance is now ~2 mm (watch item). BOM updated to match.
  Placement lesson: the flipped speaker stack occupies [−h, 0] below its
  placement point — mount the stack TOP one driver height above the floor
  inner surface (first attempt put the whole driver outside the shell,
  caught in asm_iso/asm_side). **Nameplate inlay**: 300×60×2 recess on the
  marquee face + 4× Ø6.2×2.5 magnet pockets (±135/±18) for a magnetic
  arcade-name plate; plain-box cutter (the rounded cutter's edge fillet
  has no material to bite at 2.4 mm thick). panels.py: lip panel carries
  the hood slots, marquee panel carries the recess/pockets — local +Z maps
  to the INWARD normal in `place_panel`, so outer-face features cut at
  NEGATIVE local z (sign bug fixed). parts.py hood split 308→300 so the
  hood floor/back-wall junction (~304) stays in the hood part. All checks
  green: shell valid, 6 parts valid + 0.000 mm³ seams, 33 components, 18
  panels valid.
- Iteration 16 (2026-08-18, archived `iter-013` / `asm-013`): **1P PIVOT +
  premium panel**. All first-party games are single-player and render 3:2
  native (no legacy-aspect constraint), so the cabinet went single-player:
  width 500→340 mm (1P cluster span 210.5 + margins), players=1 with a new
  `cluster_offset_x` (-8) recentring the asymmetric stick-left cluster.
  Panel: 12.1" 4:3 -> **13.5" 3:2 3004x2000 hi-DPI IPS** (Surface-class kit,
  ~267 PPI, no OLED burn-in risk on static HUDs) — outline ~296x206x5,
  active 285x190, glass 290x200 -> **screen fill 49% -> 84%**, mask bars
  2.5 mm (panel centring tolerance +/-1 mm — the retainer must locate it).
  Speaker spacing 300->200, nameplate 300->240, ribs 160->145, rear I/O
  reseated, polycarb overlap 8->6 / doubler margin 10->8 / reveal 11->7
  (narrow face clearances). `split_vertical` OFF — 340 mm parts fit a 360
  bed whole: 3 parts (base/mid/hood), all valid, 0.000 mm^3 seams.
  Commercial-feature audit (subagent, recroommasters/GRS/X-Arcade sources)
  landed as ideas list; adopted-so-far: none, noted for later: swappable
  deck insert, plexi over control panel, push-to-open keyboard/service
  door, LED admin buttons, IPAC-style keyboard-mode firmware.
  **Bug found:** `parts.py` SPLIT dict had a DUPLICATE KEY —
  `hood_seam_joints` defined twice (horizontal + vertical seam lists); the
  vertical one silently won, so the mid/hood seam NEVER had bosses, and
  with the vertical split off the ghost bosses (x=330) floated free ->
  4 solids, 508 mm bbox. Masked before because the x=0 split sliced the
  ghosts away. Fixed by renaming the vertical lists `*_v_seam_joints`;
  collision-check pair logic also fixed for the 3-part (unsplit) case.
  **Render note:** the mpl "front" view shows +x on image-left (mirrored vs
  a person facing the machine) — the model is stick-left correct; read
  front renders as the machine looking at YOU.
- Iteration 17 (2026-08-18, archived `iter-014..016` / `asm-014`): **consult
  #5 polish batch**. Codex review called the design "good but basic"-fixable;
  applied, one at a time: (3) marquee face 93->68 mm + nameplate 200x48x1.5
  (overhang kept at 58 — the 2" speaker frames need the 57 mm hood floor);
  cabinet height 441->417 mm. (4) full-width chin datum groove (8x1.5 mm)
  under the hood separating marquee/display zones. (5) reveal ring
  tightened to 2.5x1.2 mm shadow gap. (10) rear I/O consolidated to one
  z=40 row (power 130, usbc -95, dc -130). (6) control plate inlay:
  slope-aligned recess 240x124x1.0 R4 under the whole cluster (sketch+
  extrude — a box corner fillet can't exceed a thin cutter's depth);
  primary wells adjusted to 0.8 below the plate floor (1.2 mm web);
  options moved 130->126 to stay on the plate. (7) flat-pack seams as
  reveals: wrap panels inset 1.0 mm from the side-plate edges (panel_inset
  param). Consult verdict on construction: side-plate chassis is the
  premium path — simplify toward 3-4 folded self-registering modules
  (flanged rails, not 8 loose panels + block cleats); the 3-layer
  horizontal split stays as the prototype path only. Flange/hem anti-
  drumming notes for the sheet-metal path recorded here for the fab
  stage: 10-15 mm return flanges on deck/back/top, bonded ribs, deck
  locks the side plates together.
  **Bug found:** panels.py deck features were MIRRORED front-to-back
  (local +y maps seam->nose; layout is front-relative so local_y =
  half - layout_y). Caught by a point-in-solid scan, fixed, and the scan
  is now a permanent guard in panels.py (raises on mismatch). First guard
  run caught its own bug: the primary test point used the midpoint
  BETWEEN the two primaries — solid deck by design; use a real center.
- Iteration 18 (2026-08-18, archived `iter-017` / `asm-015`): consult #6
  follow-ups. The nameplate and control plate are now **real modeled
  parts**, not just recesses: `nameplate_insert` (198.8x46.8x1.4, R3.5,
  0.6 mm perimeter gap, 0.1 mm setback — charcoal anodized) and
  `control_plate` (238x122x0.8, R7.5, 1 mm gap, 0.2 mm setback, holes
  match the deck cutouts with primaries opened to the Ø40.2 well diameter
  so the tactile wells stay visible). Both render as distinct dark objects
  — the marquee finally reads as purposeful. Chin groove slimmed 8x1.5 ->
  3x1.0 mm, centered 9 mm below the chin (was merging into the hood
  shadow band). Added a rear ortho view to render.py so the rear I/O row
  can be reviewed. Consult #6 notes deferred/accepted: roof depth reads
  slightly slab-like in side view after the marquee shrink (accepted for
  now); material hierarchy is render-limited (per-part colors only).
- Iteration 19 (2026-08-19, archived `iter-019` / `asm-017`): **side cheeks
  + top cleanup** (user refs: cream bartop demo with side cheeks wrapping
  the front; classic bartop side-view drawing). The monocoque now grows
  two full-silhouette side cheek plates (4 mm, outer face flush with the
  shell sides, embedded 1 mm into the wall to fuse) whose front edge juts
  `cheek_front_overhang`=8 mm past the nose fascia — the front of the
  machine reads framed between two plates, matching both the reference
  look and the flat-pack path (side plates there now carry the same
  overhang; wrap panels stay on the base profile). Plinth groove cutter
  extended forward so the line wraps onto the cheek front faces; the chin
  datum groove now also wraps the cheeks (continuous shadow line around
  the whole cabinet). Envelope depth 340 -> 348 mm. Top cleanup:
  r_marquee_top 24->30, r_back_top 16->22, r_marquee_chin 16->20,
  lip_blend 6->10 — softer cap and less harsh undercut under the lip.
  Chain green: solid valid, parts 0.000 mm^3 seams, panels valid + deck
  guard OK, assembly 28 components. Watch: cheek front vertical edges are
  sharp 3D edges (2D silhouette radii only) — fine for sheet metal, may
  want a small 3D fillet for the print path.
- Iteration 20 (2026-08-19, archived `iter-020` / `asm-018`): **cheeks v2 —
  uniform engineered buffer**. User feedback: the iter-19 cheeks (nose
  points simply shifted forward) left a tapered ~1 mm sliver where the
  cheek top edge met the deck — read as sloppy tolerancing — and the old
  plinth groove notched the proud cheek fronts ("weird notch"). Rework:
  `cheek_profile()` in cabinet.py does a true parallel-curve offset of
  the whole front contour: deck edge offsets 8 mm along its outward
  normal (controls now sit in a shallow tray between raised cheek rails,
  like the cream reference), nose face offsets 8 mm straight forward,
  nose corner radii grow by the offset (R30 bottom / R26 top) so the
  buffer stays constant around the corners; the raised lip meets the
  display-face edge just past the seam (computed line intersection).
  Plinth groove REMOVED (params + cutter) — the cheek edges do its
  visual job now. Chin datum groove narrowed to 328 mm so it stops short
  of the cheeks. panels.py side plates now consume the same
  cheek_profile() — monocoque and flat-pack cannot drift apart again
  (user caught the two paths rendering different builds). Chain green:
  solid valid, 0.000 mm^3 seams, panels valid + deck guard OK, assembly
  28 components. Verified numerically: cheek nose top (-8, 85.17) vs
  deck surface 78.22 at y=0 — exactly 8 mm perpendicular.
- Iteration 21 (2026-08-19, archived `iter-022` / `asm-020`): **edge
  treatment pass** from consult #7 (Codex + Claude Sonnet — they
  converged on the same list). Applied: (a) cheek outer perimeter 3D
  fillet R2 (cheek_edge_fillet) — the plates no longer read as unfinished
  fins; (b) cheek_seam_blend R8 2D fillet where the raised cheek lip
  meets the display face — kills the side-view kink Codex flagged;
  (c) 0.4 mm 45 deg rim chamfers on all 9 visible deck holes via cone
  cutters aligned to the deck normal; primaries chamfer the Ø40 well rim
  (the visible rim), not the Ø30 through-hole. **Bug found:** edge
  SELECTION for chamfers is unreliable here — Edge.center() on a closed
  circle returns a point ON the rim (offset by the radius), not the
  circle center, and OCC splits the primary well rims into arc fragments
  (well/hole/recess three-way intersection). Cone cutters at cut time are
  deterministic; selection approach deleted. **Bug found 2:** the chamfer
  micro-faces fail OCC meshing at render tolerance 0.2 (assembly renders
  don't mesh the shape via STL export first) — render.py now falls back
  0.2 -> 1.0 per shape instead of dying. Consult items deferred/misread:
  rear "ports on one baseline" = rear I/O seen THROUGH the glass (fine);
  "hood screw holes" = nameplate magnet pockets (functional); Sonnet's
  heavy-base note deferred (structural volume); 8 mm cheek projection
  kept (uniform-buffer reading, user's call). Chain green, all guards OK.
- Iteration 22 (2026-08-19, archived `iter-023`/`iter-024` / `asm-021`):
  **softness pass** (user: "you have less rounding" vs the cream
  reference). The reference's side frame reads THICK with a full
  roundover; a 4 mm plate caps the 3D edge round at ~R2, so:
  cheek_thickness 4 -> 8 mm (outer face still flush with the shell
  sides), cheek_edge_fillet 2.8 -> 3.2 mm and now applied to BOTH
  perimeter loops — the outer edge and the inner edge that frames the
  recessed front (kills the hard 90 deg step where the cheek meets the
  nose fascia / deck tray). Silhouette radii up: r_nose_bottom 22 -> 30,
  r_nose_top 18 -> 26 (cheek radii auto-grow +8 via cheek_profile:
  R38/R34). Volume 1738 -> 2521 cm^3 across the cheek iterations (print
  path only). NOTE — path divergence: the flat-pack side plates stay
  3 mm sheet (panel_thickness) with no 3D edge rounds; for sheet metal
  that edge break is a fab-shop operation (deburr/roll), not geometry.
  Chain green, all guards OK.
- Iteration 23 (2026-08-19, archived `iter-025`/`iter-026` / `asm-023`):
  **the nose roll** (user: the rounding they wanted is the profile roll
  where the control deck turns down the vertical nose, and the side plate
  should carry the same radius — not the 3D plate-edge roundovers of
  iter 22). r_nose_top 26 -> 34, r_nose_bottom 30 -> 32; cheek corners
  auto-grow concentric via cheek_profile (+8 -> R42/R40). Cascade the
  roll forced (tangent reaches y~39 on the deck): control plate recess
  shrunk 124 -> 96 deep, center_y 81 -> 91 (spans 43..139 — clear of the
  nose roll in front and the R20 seam blend behind); primary_row_y 56 ->
  68 (Ø40 wells keep 4 mm margin inside the plate front edge);
  option_offset_y 126 -> 120. components.py control_plate dims were
  HARDCODED 238x122 (plate poked past the shrunken recess) — now derived
  from PARAMS (recess w/d - 2 mm gap, corner_r = recess + 3.5). Wrist
  rest improves to 48 mm. Chain green, all guards OK; the tessellate
  retry did not trigger this run.
- Iteration 24 (2026-08-19, archived `iter-027`): **THE FILLET BUG** —
  user caught that the nose roll "wasn't done" despite iter 23's params.
  Root cause: the 2D profile fillet vertex filter matched on v.Y/v.Z,
  but on Plane.YZ the profile (y, z) lands on world (X=y, Y=z, Z=0) —
  so EVERY sketch fillet silently no-oped except vertex (0, 0). All
  silhouette radii (nose, back, marquee corners) had never applied, in
  every iteration since the profile builder existed; the softness in
  renders came only from the 3D edge fillets. fillet([], r) no-ops
  silently — a selection guard should have caught this. Fixed the filter
  to v.X/v.Y in both the shell and cheek sketches and VERIFIED each
  corner matches exactly 1 vertex before running. The silhouette now
  shows the real radii: nose roll R34 (cheek R42), nose bottom R32
  (cheek R40), marquee corners R30/R20, back corners R10/R22; envelope
  height 417.3 -> 410.6 mm (the marquee-top fillet actually removes
  material now). panels.py side plates intentionally stay SHARP-cornered
  (dead fillet code removed + documented): wrap panels span vertex to
  vertex, so rounding plate corners would leave panel ends overhanging;
  metal-build corner softness is a fab edge break, not geometry.
- Iteration 25 (2026-08-19, archived `iter-028`): **radii backed off
  30%** (user: iter 24 read too soft). All silhouette radii x0.7:
  r_nose_top 34 -> 23.8, r_nose_bottom 32 -> 22.4, r_marquee_top 30 ->
  21, r_marquee_chin 20 -> 14, r_back_top 22 -> 15.4, r_back_bottom 10
  -> 7 (cheek corners auto-derive +8). 3D edge treatments unchanged
  (seam blend R20, lip blend R10, corner R12, cheek edge R3.2) — those
  predate the complaint. Envelope 340 x 348 x 412.6 mm. Chain green,
  all guards OK.
- Iteration 26 (2026-08-19, archived `iter-029`): **crisper hood cap +
  nose undercut** (user refs: commercial bartop spec sheet + hood
  close-up — its top edge is much crisper than our R21 roll; red-line
  markup asking for a slight negative angle at the bottom of the nose).
  r_marquee_top 21 -> 10, r_marquee_chin 14 -> 10. New param
  nose_undercut_deg = 4: the nose face leans back toward the floor
  (bottom recedes ~5.5 mm), lifting the front visually. cheek_profile
  generalized: the cheek front offsets along the TILTED nose edge's
  outward normal (was a fixed vertical line); cheek bottom-front corner
  is the intersection with the floor line. Envelope 340 x 346.5 x 415.1
  mm (undercut shortens the footprint; smaller marquee radii restore a
  little height vs iter 25). panels.py inherits the tilted nose segment
  for free (shared side_profile).
- Iteration 27 (2026-08-19, archived `iter-031`, assembly `asm-028`):
  **S3-crt-slim identity adopted** (style study: 4 wells — modern /
  crt-deep / crt-slim / retro-full; Codex + Opus + Sonnet unanimous for
  crt-slim: "premium, not nostalgic; the proud bezel is the hero
  detail"). Params: display_tilt_deg 15 -> 12, neck taper ON
  (neck_depth 100, back_taper_z 120, neck_join_z 140, r_back_taper 25 —
  the consults' "soften the shoulder" note), marquee 68/58 -> 63/56,
  window masked to 4:3 (glass 290x200 -> 253x190; games render 4:3),
  proud bezel ring ON (12 mm wide, 3 mm proud; separate frame part on
  the sheet-metal path), reveal_offset 7 -> 16 (frames the bezel), chin
  groove drop 9 -> 5.5 (was going to collide with the reveal ring at
  the new tilt). Consult-driven tactile batch in the same pass: feet
  Ø20x8 -> Ø28x10, hood speaker slots 5 -> 4 rows of capsules
  (radiused ends), 9 vertical rear vent fins z=85 (matches panels).
  Side gill vents: 5 capsule slots (44x4, pitch 10) through both
  cheeks at the neck zone (y=236, z=255) — vent the display-driver
  cavity; mirrored on the flat-pack side plates. Marquee face stays
  nameplate-only per user (no forward vents). Bug fix: parts.py seam
  joints were STATIC y positions from the full-depth/15-deg geometry —
  with the taper the rear blocks floated in air and the front blocks in
  the cavity (mid/hood had 3 bodies; the report conflated is_valid
  with solids==1). Joint Y now derives from the profile at the seam
  height (rear_joint_y / front_joint_y); the report prints valid and
  bodies separately and RAISES unless every part is a single valid
  body. Envelope 340 x 346.5 x 411.1 mm, volume 2420 cm^3. Chain
  green: parts 3x single-body, panels 22 valid (new taper + neck
  panels), assembly 28 components. Known render quirk: cabinet-only
  FRONT renders hide the window — the interior neck wall is parallel
  to the face, so it catches identical light (two-sided shading);
  geometry verified open by probes + tessellation scans; assembly
  renders show the dark panel correctly.
- Iteration 28 (2026-08-19, archived `iter-033`, assembly `asm-029`):
  **vents relocated to the hood sides + serviceability pass** (user:
  vent grilles on the side plate at the hood, raked with the hood
  angle — not forward-facing, not across the hood face). Side gills
  moved from the neck zone (horizontal, z=255) to the hood zone: 4
  raked capsules (56x4, pitch 12) parallel to the hood cap, stacked
  from 10 mm under the cap toward the floor, center 78 mm along the
  cap from the marquee top. Rear fins DELETED (hood sides + speaker
  area carry ventilation now). New: 3x LED admin button holes
  (Ø12.2) on the rear I/O row (x -40/0/+40, z=40); rear service
  hatch 170x90 at z=60 with 4 corner boss blocks (M3 heat-set
  pilots) for a screw-on door — bosses sit 8 mm OUTSIDE the opening
  edge (the first pass put them inside the opening and the new
  multi-body guard in parts.py caught the floaters immediately:
  cabinet reported solids=5). panels.py: back panel gets the hatch +
  door screw clearances, side plates get the raked vents. Envelope
  unchanged 340 x 346.5 x 411.1 mm. Chain green.
- Iteration 29 (2026-08-19, archived `iter-034`, assembly `asm-030`):
  **hood side vents widened + centered** (user: vents go more along
  the top, healthy buffer to the sides, centered, consuming the
  width of the overhang). Slots 56 -> 110 mm along the cap (cap run
  = overhang 56 + neck 100 = 156 mm, so ~23 mm buffer at each end),
  count 4 -> 3 (drops 10/22/34 under the cap; lowest slot clears
  the hood floor by ~29 mm), center stays at u=78 (midpoint of the
  cap). Envelope unchanged. Chain green.
- Iteration 30 (2026-08-19, archived `iter-035`, assembly `asm-031`):
  **display retainer** (polish batch: mechanical mounting for the
  panel stack). Shell: 4 x Ø10 x 10 mm standoff bosses on the face
  interior, centers 6 mm beyond the panel outline (±154 x ±109 mm),
  each with an M3 heat-set-insert pilot (Ø4.2 x 7) opening at the
  boss tip. New printed part in parts.py (`retainer_frame`, STEP +
  STL in out/parts/): 3 mm clamp frame, rounded corners (R8 outer /
  R6 opening), 8 mm bearing lip on the panel border, 4 x M3
  clearance holes with 90 deg countersinks on the rear face, 50 mm
  cable notch in the bottom rail. Frame outer 319 x 229 mm vs 324 mm
  between the cheeks — 2.5 mm assembly clearance per side. assembly.py
  places it behind the panel (29 components now). Chain green;
  retainer valid, 1 body. Flat-pack (panels.py) retainer path still
  TODO — sheet-metal version wants a bent angle frame, not this part.
- Iteration 31 (2026-08-19, archived `iter-036`, assembly `asm-032`):
  **fit check + collision purge**. New `fit_check.py` intersects every
  placed component with the shell and fails over 1 mm^3; first run
  flagged 14 components. Root causes + fixes: (1) display stack
  offsets in assembly.py predated the 4 mm window doubler — mask,
  panel, and retainer frame were all ~1.5 mm embedded; now keyed off
  wall+doubler. (2) control_plate was built in absolute deck coords
  AND placed via the deck plane (double transform — it sliced through
  the seam); components.py now builds it in a local plate frame.
  (3) deck holes were cut vertical while the deck slopes 8 deg and
  buttons were placed vertical — bezel rims wedged ~1.5 mm into the
  deck; holes + buttons + primary wells are all cut/seated square to
  the deck normal now. (4) SBC rear edge sat in the rear-wall corner
  fillet; moved y 290 -> 272. (5) speakers: the Ø52 basket cannot fit
  between the hood corner fillets at floor level at ANY offset
  (speaker_scan.py parametric probe) — now at offset 32 with a 2 mm
  foam-gasket lift (standard speaker sealing practice), zero overlap.
  Result: 28 components, max overlap 0.294 mm^3 (known JLF plate
  wedge on the sloped deck, by design). Bonus: the control plate now
  renders as the dark inlay it was meant to be. Chain green.
- Colorway study (2026-08-19, `out/colorway_study.png`): 6 palettes
  on the iter-31 assembly via `colorway_study.py` (role-based
  recolor: shell / control plate / primaries / secondaries / options
  / stick ball / nameplate accent; mask + screen stay near-black in
  all). Candidates: cream-classic (current), graphite-red,
  alu-orange, sage-amber, navy-brass, snow-coral. Awaiting user pick;
  the winner becomes the default colorway in assembly.py LAYOUT.
- Iteration 32 (2026-08-20, archived `iter-037`, assembly `asm-033`):
  **chassis brief pass: printed CRT bezel + minimal spine chassis +
  structural flanged sides** (feedback doc:
  `hardware/references/hardware-brief-2026-08-19.md` section 4; user
  steer: lighter-weight chassis, side plates carry the structure).
  - **CRT bezel** (brief 4.4): new printed part `crt_bezel()`
    (parts.py, STEP+STL in out/parts/). 18 mm deep black-PETG bezel
    standing proud of the face; the throat lofts from the 253x190 R12
    4:3 mask opening at the front back to a 289x195 seat that hides the
    shell window — the CRT funnel read, and the 4:3 mask cue moves from
    the glass print into the bezel. PC window drops into a front pocket
    (friction fit v1; magnet pockets deferred — brief open question 7).
    Mounts: 4 mid-edge M3 screws driven from INSIDE the cabinet through
    shell clearances (+/-148 x, +/-100.5 z, placed clear of the retainer
    corner bosses) into heat-set inserts in the bezel rear face.
    Shell changes: window cut enlarged 253x190 -> 287x192 (active + 2),
    in-shell polycarb rabbet DELETED, printed mask DELETED, proud bezel
    ring OFF (`bezel_width` 0), reveal ring OFF (`reveal_offset` 0) —
    all superseded by the bezel; doubler margin 8 -> 12 to carry the
    bezel mount holes. `screen_center_frac` 0.50 -> 0.508: centers the
    bezel in the face's flat band between the seam and lip 3D blends
    (fit_check confirms 0.000 mm^3 shell intersection).
  - **Minimal spine chassis** (brief 4.1-4.3): 2 x 20x20x1.5 aluminum
    angle rails (130 mm, y 197..327 — shortened from 140 after
    fit_check caught the rear floor fillet) bolted to the base, SBC
    rides the rail leg tops (z = wall+20); buck relocated (-60,315) ->
    (-100,262) to clear the rails. U-channel top bracket (292 mm, spans
    between the flange zones) hung under the hood cap at u=120; the
    HDMI driver board is now a separate catalog component mounted flat
    under the bracket (removed from the display_panel model).
  - **Structural side plates** (brief 4.5): panels.py corner cleats
    DELETED (10 parts gone). Side plates get 20 mm 90 deg return flanges
    bent in along ALL 10 wrap segments (base-profile lines, incl. inside
    the cheek overhang on the front matter), each flange face carrying
    M3 insert pilots at 3 stations; wrap panels get 6 matching screw
    clearances on the flange centerline (|x| = 157). Flat pack is now
    12 parts (10 wraps + 2 flanged sides), 5052 mass 3326 g total.
  - Chain green: fit_check 33 components, max overlap 0.294 mm^3 (known
    JLF plate wedge, by design); shell valid 1 body, 2328 cm^3;
    parts 3x + retainer + bezel all single-body valid; panels 12 valid.
  - Known cosmetic skips: side-plate bend-radius fillet refused by OCC
    at R2 (the bend line is still modeled sharp — a real brake bend has
    the radius for free); bezel front rim R1 applied, throat knife-edge
    unfilletable by construction (void both sides; the PC window covers
    it). Side plates are 413 mm tall -> over the 360 print bed (metal
    path only, or split for print — was already true pre-flange).
  - FLAGGED, needs a user call (not changed): brief 5.1 recommends a
    used x86 thin client (Lenovo M90n class ~179x183 mm) over the
    ODROID H4+ — that footprint does NOT fit the current floor layout
    between the rails; adopting it means re-laying out the base (or
    wall-mounting it in the neck). H4+ model stays until decided.
  - Deferred from the brief: CRT throat as a TRUE curved transition
    (v1 is a straight loft — reads fine at render scale; brief wants
    15 vs 25 mm recess validated by a printed prototype anyway); PC
    window magnet pockets; scanline texture (print/paint, not CAD).
- Iteration 33 (2026-08-20, archived `iter-038`, assembly `asm-034`):
  **2+2 button grid** (user: 6 buttons is overkill — 2 primary + 2
  secondary; the first-party roster is stick + 1-2 buttons). Secondaries
  4 -> 2, both rows now at 44 mm pitch in an aligned 2x2 grid (the Ø40
  primary wells keep 4 mm rim gaps at 44); primaries center under the
  secondary span via a generic sec_center formula in all four files
  (cabinet cutouts, control_plate, panels deck, assembly placement).
  `button_grid_offset_x` 15 -> 30 to keep hand clearance from the stick
  with the 2-wide grid (stick center to nearest button center = 58 mm).
  Note: the brief's Gauntlet concept assumed a 6-button layout — game
  design now targets 2 primaries + stick. Chain green: 31 components,
  max overlap 0.294 mm^3 (known JLF wedge), deck hole guard OK.
- Dimensioned drawings (2026-08-20): new `hardware/drawing.py` renders
  blueprint-style PNGs from the same PARAMS for the cardboard-mockup
  workflow — `out/drawing_side.png` (side-plate cut pattern: per-segment
  lengths, corner radii, angle callouts, and a vertex coordinate table
  with origin at the blank's front-bottom) and `out/drawing_front.png`
  (display-face layout: bezel/mask/shell opening/nameplate + screen
  center height; control-deck layout: every hole with a spec block).
  Overall: 340 wide x ~347 deep x 413 tall. Copied to
  docs/images/hardware/ and posted to PR #6.
- Display-stack detail renders (2026-08-20): new `hardware/display_detail.py`
  renders the CRT bezel solo (`out/bezel_*.png` — front/low/rear/side), the
  5-layer display stack exploded along the face normal
  (`display_stack_exploded_*.png`: PC window -> bezel -> shell patch sliced
  from the REAL cabinet solid -> panel -> retainer), assembled sections
  (`display_stack_section_*.png`), and an annotated blueprint cross-section
  (`display_stack_drawing.png`): throat 253x190 -> 289x195 over 18 mm, PC
  pocket 299x205x2.7, wall 3 + doubler 4, panel 5, retainer 3, stack depth
  33.5 mm total. Learning: explode along Y reads best from near +-X cameras;
  the z-buffer renderer cannot sell the black-on-black throat relief.
- Blender studio pipeline (2026-08-20): `hardware/studio_export.py` exports
  every placed component (incl. the PC window the previews skip) as
  world-coordinate STLs + a material-preset manifest (out/studio/);
  `hardware/studio_scene.py` runs headless in the system Blender 5.2
  (`blender -b --python ... -- --manifest ... --views hero,display,side`)
  with PBR presets (powdercoat w/ orange-peel bump, anodized, petg,
  pc_clear transmission, lcd, pcb, rubber, metal), 3-point softboxes,
  ortho cameras incl. display/deck close-ups, Cycles or Eevee. Finish
  studies are `--set powdercoat=r,g,b` overrides. Calibration learnings:
  area lights for a 0.4 m product scene are 25-120 W (the first pass at
  450-900 W clipped 3 stops); a Nishita sky world is HDR (sun disc ~1e3)
  and Fresnel/coated reflections of it blow out even 0.05-albedo PETG —
  flat neutral world (0.5 gray, strength 0.4) + area lights is the clean
  baseline. Export bug worth remembering: place_components() returns items
  per SHAPE but records per COMPONENT — zip() misassigns materials; use
  the groups return (per-component shapes) + an id() color lookup.
  First renders: out/studio_hero.png / studio_display.png / studio_side.png.
- Iteration 34 (2026-08-20, archived `iter-039`, assembly `asm-035`): **CRT
  dish** — the user flagged (with CRT photo refs) that real tubes have a
  small proud frame and the glass INSET at the bottom of a funnel that
  narrows inward; our iter-32 bezel was inverted (18 mm proud funnel, glass
  at the front). Reworked: the face gets a built 12 mm dished tray (the
  shell is hollow, so the tray is a fused tub: 300x200 opening cut through
  the wall, tub flange embedded 0.5 mm on the inner face, 3 mm floor at
  depth 12); the tray floor carries the 4:3 aperture (253x190 — the shell
  window cut IS the mask now); PC window (275x208) + panel clamp behind it
  (screen 21.5 mm behind the face); the printed bezel becomes a trim ring
  (316x210, 2.5 proud) with a funnel wall narrowing 298x198 -> 257x194
  into the dish. Collision forensics worth remembering: (1) the doubler's
  0.5 mm embed pokes past the tray floor — the stack must start at the
  doubler OUTER face (18.5), not the floor; (2) the flange must stay inside
  the face's ~215 mm flat band between the seam/chin 3D blends (dish
  300x200 + frac 0.515, flange 316x210, after a 322x228 pass bit both
  blends); (3) retainer bosses stop at the panel rear (12.0) so they never
  pierce the clamp frame; (4) mounts moved to 4 corner points (+/-154,
  +/-55) squeezed between the dish edge and the flange edge, black M3 CSK
  from the front into shell-side insert pads. Chain green: fit OK (max
  0.294 known JLF wedge), shell valid, 3 parts + retainer + bezel (1 body),
  12 panels. NOTE: the flat-pack sheet path (panels.py) now has a flat face
  panel with the small aperture but no dish — the sheet-metal version needs
  a formed tray part or a spacer stack; not modeled yet.
- Finish studies (2026-08-20): studio_scene.py `--set` now matches
  component names as well as presets, so whole directions are command-line
  only. Four concurrent design-specialist agents each iterated a direction
  with Eevee and delivered Cycles finals + PALETTE.md (docs/finishes/):
  A heritage-pop (vermilion shell, amber primaries), B bone-&-brass
  (premium minimal), C midnight-modern (graphite, one orange accent),
  D playful-spectrum (off-white, mint anodized accents, red/azure/amber
  buttons). Contact sheet: out/finish_study_sheet.png, copied to
  docs/images/hardware/. Learnings from the agents: metallic presets darken
  base colors ~1 stop under gray studio light (over-brighten mints/brasses);
  dark controls vanish on a dark plate — invert for legibility; creams wash
  to white unless pushed deeper than first guess.
- Iteration 35 (2026-08-24, archived `iter-040`, assembly `asm-036`):
  **prototype-print split** — the goal was parts any 256 mm bed (Bambu/Prusa
  class) can print, so the enclosure can come from a local printer or any
  cheap service instead of a large-format machine. parts.py now:
  split_vertical=True (x=0 seam, all 3 layers) + new split_base_y=True
  (base quarters at y=190, clear of the deck ribs). Result: 8 shell parts —
  base_f/b_l/r 170x197/150x125, mid_l/r 170x161x175, hood_l/r 170x161x111 —
  + retainer frame + CRT bezel; all valid, 1 body, zero seam overlap
  (21 pairs checked). Joints: same hidden boss-block scheme everywhere
  (M3 heat-set pilot one side, M3 clearance the other); the base F/B seam
  screws drive from the rear hatch into the front quarters (4 blocks/side:
  2 floor-fused at z=9.5, 2 side-wall-fused at x=+/-160.5, z=60/110).
  Bug worth remembering: enabling split_vertical exposed floating mid/hood
  joint blocks — _wall_y() reads the theoretical polyline, but the
  neck-corner blend pulls the real rear wall ~2 mm inside it, so
  profile-minus-wall placement missed the material entirely. Fix:
  _wall_face_y() probes the actual solid (0.5 mm y-scan around the profile
  estimate) and seats blocks on the probed inner face. BOM gained a
  "Prototype print order" section: part list, PETG guidance, ~50 M3
  inserts + screws fastener count. Sheet-metal path (panels.py) unchanged.
- Iteration 36 (2026-08-24, archived `iter-046`, assembly `asm-037`):
  **printability pass + swappable deck panel.** Driver: FDM DFM before the
  prototype order — the old base had a 170 mm deck-span bridge (unprintable
  without supports). Fix = the user's swappable-control-panel idea, taken
  further: the ENTIRE deck skin is now 2 separate printed parts
  (deck_l/deck_r, 159x87x11, waffle-ribbed undersides, show-face-down on
  the bed) dropped into a through opening in an open-top base; ledge ring
  + 12 M3 insert bosses support them (CSK screws from above, classic
  arcade look). Control interface is now a flat $5 reprint (alt layouts,
  keyboard tray, trackball...). Shell side: opening x +/-160, y 45..132
  (flat band between nose roll and the seam R20 tangent ~135). Layout
  moves forced by the ledges: stick y 67->71 (JLF bolts cleared the rim),
  start/select (25,120)->(100,116) wide of the cluster (bonus: kids
  fat-finger less). Ledge construction worth remembering: coplanar fuse of
  the strips SHATTERED the shell boolean (19 solids, 85 cm3) — fix is a
  two-box strip: FUSE box embedded 0.5 into intact skin outside the
  opening + SEAT box under the rim (top 0.15 below the seat plane),
  overlapping volumetrically; strips segmented around the JLF plate
  (front) and option-button bodies (rear); tilted OBSF-30 bodies sweep
  ~12 mm forward under the deck — keep ledges out of the sweep. New parts:
  hatch_cover (rear service door was missing — 170x90 hatch had bosses
  but no door), electronics floor pads for encoder/amp/buck (M2.5 pilots,
  positions moved into cabinet PARAMS as the single source of truth;
  assembly reads them). Print orientation per part is baked into the
  exports (ORIENT in parts.py, rotated + dropped to z=0): base/mid
  upright, hood back-wall-down (-78 deg, wall leans 12), deck/bezel
  show-face-down. printability.py audits every export (mesh triangle
  normals): bed contact + overhang area at >45/>60 deg. Audit lessons:
  (1) a bottom face is bed contact, not an overhang — filter z<2 mm;
  (2) overhang = asin(|nz|), NOT acos — two orientation choices
  (mid face-down, hood floor-down) looked necessary under the wrong
  formula and are actually worse; (3) remaining >60 deg flags are all
  <=14 mm cantilever ledges or hidden attic ceilings — read flags with
  cantilever length in mind. Retainer + bezel split L/R (butt seam, 2
  screws/half) — both were >256 mm. Chain green: fit OK (0.294 known JLF
  wedge), shell valid, 15 parts valid/1-body/fits-256, deck panels 0.000
  clearance vs shell, 32 components. Sheet-metal path (panels.py)
  untouched; it keeps the old control_plate inlay params.

2026-08-25 — print-plate capacity study (plate_layout.py). Imports the
  print-oriented STEP exports from out/parts/ and packs them onto Bambu
  H2D plates (350x320 mm single-nozzle area, 8 mm edge margin, 10 mm
  part gap) with a maximal-rectangles packer (shelf packing gave 7
  plates; maxrects gives 6, sanity-checked no overlaps). Renders
  plateN_top/iso.png (3D, shared z-buffer renderer) + plates_map.png
  (labeled 2D packing map). Key findings: the L/R halves of the 170 mm
  shell split can never share a row on a 350 plate (170+10+170 > 334
  usable) — that is what drives the count. Answer for Eric: 6 plates,
  ~2.75 liters solid volume (~1.2-1.7 kg PETG at real walls/infill),
  biggest single part footprint retainer_l/r 159x229 (trivial height),
  biggest solid base_f_r 392 cm3, tallest mid_l/r 175 mm. Everything
  fits an H2D with huge margin; a 256 bed (P1S/X1C/A1) also fits every
  part per parts.py, just more plates.

2026-08-25 — iter 37: basic control assembly = stick + 2 + start/select.
  secondary_count 2 -> 0: no game in the roster needs more than two
  player buttons, so the default deck panel drops the OBSF-24 back row
  (a 2x2 grid or any other layout stays a swappable deck-panel reprint,
  ~40 cm3 flat print, no shell change). Trap found: the primary pair's x
  was derived from the secondary grid (sec_center = grid_offset + pitch*
  (count-1)/2) — at count=0 that formula silently drags the primaries
  36 mm toward the stick into the JLF ball's sweep. Fix: new PARAMS
  "primary_center_x" (52 rel cluster, keeps the pair at world x 22/66)
  used by all five consumers (parts/assembly/components/panels/drawing).
  Chain green: fit OK (0.294 known JLF wedge), 30 components (was 32),
  deck panels 0.000 vs shell. BOM: secondary-button row removed, layout
  note added (2x2 = +2 OBSF-24 alt panel).

2026-08-25 — iter 38: seamless-front "fb" split (Eric: no seam in the
  most visible part of the front; back seams fine). The L/R split put a
  vertical seam down the nose, deck, display surround, and marquee — the
  exact show surfaces. Realization: on a 340+ mm bed (H2D 350 / print
  services) the L/R split is unnecessary — mid (340x161x175) and hood
  (340x161x111) print WHOLE, and the base already had the F/B machinery
  (split_y_base=190). New SPLIT["split_mode"]: "fb" (default) vs "lr"
  (256 mm beds, keeps the old 8-part split + center seams). fb parts:
  base_f, base_b, mid, hood + retainer, bezel, deck (all one-piece now),
  hatch_cover = 8 prints total. Front is 100% seamless: nose/deck =
  base_f, display surround = mid, marquee = hood; remaining seams are
  the base F/B line on the sides/bottom and the horizontal layer seams
  at natural creases (deck/face R20, chin). Details: (1) base y-seam
  joint x-positions had to mirror +/- when sx=0 (unsplit) — the old code
  collapsed them all to x=0; (2) full-width deck panel's waffle grid
  phased a rib onto the shell's internal fore-aft ribs (rib_offset_x
  +/-145): the shell rib's FLAT top (deck_z(25)-3 = z78.7) crosses the
  waffle's sloped bottoms (down to deck_z(y)-10.4) for y<78 — the lr
  halves had escaped by 0.1 mm of grid luck. Fix: universal rib slots in
  the deck panel at +/-rib_offset_x (rib_thickness+4 wide) — the shell
  ribs now key into the slots = free shear interlock. Also added
  universal rib keep-outs at deck screw-boss points (same latent class
  of bug). (3) New parts_assembled_front/side/iso renders = the seam
  proof. plate_layout.py now globs out/parts/*.step instead of a
  hardcoded list; studio_export maps deck* prefix; assembly places
  deck ("full") by mode. Chain green: fit OK (0.294 known JLF wedge),
  30 components, deck 0.000 vs shell, all 8 parts valid/fit-350.

- Repo slimming + sourcing docs (2026-08-25): STEP exports are no longer
  committed — `hardware/exports/` is gitignored and the generated CAD
  (assembly/cabinet STEP, print-parts + flat-panels STEP/STL zips) ships
  as release assets instead (`export_onshape.py` regenerates locally).
  Added `print-suppliers.md` (10 print bureaus compared for the 340 mm
  PETG parts; research-bot verified 6/6 sources) and `part-suppliers.md`
  (BOM consolidated to 4 carts: Mouser + Focus Attack ~70% of items,
  DFRobot compute, Amazon display/sundries; optional Parts Express).
