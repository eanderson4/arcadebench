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
