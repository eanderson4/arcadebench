# ArcadeBench Hardware Brief
## ArcadeBench Bartop Cabinet — Development Feedback
**Date:** August 19, 2026  
**Subject:** ArcadeBench 1P Bartop Hardware, Materials, and Production Strategy  
**Status:** Draft — Pre-Prototype Phase

---

## 1. Executive Summary

The ArcadeBench bartop is a 340 × 340 × 441 mm single-player tabletop arcade cabinet built around a 13.5″ 3:2 hi-DPI display (3004×2000, ~267 PPI). It is positioned as a premium, handmade artisan hardware product (~$1,200) housing a collection of independent indie games with offline-first capability and optional online leaderboard sync.

Two build paths exist from a shared parametric model: a 3D-printed prototype path (360 mm bed, hidden M3 inserts) and an 18-piece 2 mm 5052 sheet-aluminum flat-pack target path (~3.2 kg). This brief consolidates hardware recommendations, material analysis, and production strategy for the sheet-metal path, plus software and product-concept guidance.

---

## 2. Material Selection

### 2.1 Primary Structure: 5052-H32 Sheet Aluminum
**Recommendation:** Use 2 mm 5052-H32 for the main shell.

**Why 5052:**
- Excellent formability and bendability for flat-pack brake-bending
- Good corrosion resistance; appropriate for indoor furniture-grade product
- Weldable and laser-cut friendly
- Cost-effective for small-batch production

**Critical Limitation:** 5052 is a wrought magnesium-alloy and **does not anodize well for color**. Type II decorative anodizing on 5052 produces a mottled, grey-ish finish with poor dye absorption. It is suitable only for clear/natural anodizing, not the vibrant colors shown in early renderings.

### 2.2 Faceplate: 6061-T6 Aluminum
**Recommendation:** Use a separate 3 mm 6061-T6 faceplate for the control panel.

**Why 6061:**
- Heat-treatable alloy with excellent anodizing characteristics
- Takes Type II decorative dyes uniformly (electric blue, emerald, magenta, etc.)
- Provides rigid joystick mounting without a separate sub-plate
- Can be waterjet or CNC machined flat, then anodized

This hybrid approach (5052 body + 6061 faceplate) gives structural formability and premium color finish without fighting material limitations.

### 2.3 Window: Polycarbonate (PC)
**Specification:** 2–3 mm polycarbonate, not acrylic.

**Requirements:**
- Anti-glare (AG) or matte coating specified
- Second-surface UV-cured mask print (black border, logo, or bezel graphics)
- First-surface print will abrade; second-surface is protected
- Mask density must be fully opaque to hide LCD frame and mounting hardware

### 2.4 Fasteners & Inserts
- **Rivnuts (rivet nuts)** in 5052 panels for M3/M4 machine screws
- **Hidden M3 heat-set inserts** for any 3D-printed prototype components
- No self-tapping screws into 2 mm sheet metal — will strip under joystick load

---

## 3. Finishing Strategy

Given small-batch production (~5 units initially) and 5052's anodizing limitations, the following finishes are recommended in priority order:

### 3.1 Powder Coat (Recommended for Body)
- **Pros:** Unlimited color range (metallics, textures, gloss levels); durable; thicker film than anodizing; hides laser-cut edge grain; small-batch friendly at local shops
- **Cons:** ~2–4 mil thickness (vs. 0.5–1 mil anodizing); adds slight dimensional build-up
- **Cost estimate:** $40–$80 per shell with small-batch surcharges
- **Opportunity:** Laser-etch the ArcadeBench logo into the powder coat at the cutting stage for integrated branding

### 3.2 Cerakote (DIY/Artisan Option)
- **Pros:** Thin ceramic-polymer film (~0.5–1 mil); massive color catalog; can be applied in a garage with a toaster oven and $200 kit; very durable; works well on 5052
- **Cons:** Labor-intensive; requires surface prep and masking discipline
- **Best for:** Founder/kid builds where the finish process is part of the product story

### 3.3 Brushed + Clear Coat
- **Pros:** Cheapest option; raw, intentional, Dieter Rams aesthetic; 1970s arcade vibe
- **Process:** Scotch-Brite 5052 in one direction, then apply 2K automotive clear coat
- **Best for:** Prototypes or a "raw aluminum" limited edition

### 3.4 Anodizing (Faceplate Only)
- Reserve Type II decorative anodizing for the **6061-T6 faceplate**
- Specify 6061-T6 alloy to the anodizer for uniform dye absorption
- Account for ~0.00025" dimensional growth per side in CAD tolerances
- Mask all threaded holes and bearing surfaces before anodizing

---

## 4. Chassis Architecture: Minimal Spine-and-Ribs

**Revised approach:** The chassis is not a full structural cage. The **side panels are the primary structure**; the chassis only mounts equipment. This reduces weight, part count, and assembly complexity.

### 4.1 Chassis Components (Minimal)

| Component | Function | Material | Est. Weight |
|-----------|----------|----------|-------------|
| **Bottom spine** | Mounts compute, PSU, amp, joystick sub-plate | 1.5 mm aluminum angle rails or 3 mm PETG | 100–200 g |
| **Top bracket** | Mounts display driver, hood attachment | 1.5 mm aluminum L-bracket or PETG | 50–100 g |
| **Display bezel** | CRT-style recess, PC window seat, mask border | 3D-printed PETG (black) | 150–250 g |
| **Total chassis** | | | **~300–550 g** |

### 4.2 Bottom Spine
- Two parallel aluminum angle rails (20×20 mm, 1.5 mm) running front-to-back
- Cross-brackets where compute and PSU mount
- Joystick sub-plate bridges the front of the rails
- Rails bolt to side panels through bottom edge flanges, or sit on a return flange
- Alternative: 3D-printed PETG spine for dev units; switch to aluminum for production

### 4.3 Top Bracket
- Simple L-bracket or U-channel across the top rear
- Mounts display driver board
- Hood bolts to the top front
- Display itself mounts to the **faceplate or bezel**, not the top bracket

### 4.4 Display Bezel (3D-Printed CRT Effect)

**Purpose:** Creates recessed depth and CRT aesthetic that flat LCDs lack.

**Stack-up (front to back):**
```
[PC Window] ← sits on bezel ledge
[3D-Printed Bezel] ← creates recess, curved inner transition, holds window
[LCD Panel] ← mounted to faceplate behind bezel
[6061 Faceplate / Chassis]
```

**Bezel Design Requirements:**
- **Recess depth:** 15–25 mm — screen sits back from front plane, creates shadow and depth
- **Curved inner transition:** Radius or fillet from bezel face down to LCD — mimics CRT glass curve
- **Overhang lip:** PC window rests on top, clamped or magnetically held
- **Mask border:** Printed matte black; blocks LCD edges and diffusers
- **Optional scanline texture:** Very fine horizontal line pattern on bezel face — subtle, sells CRT vibe under PC window
- **Rounded corners:** Slight radius on opening corners (CRTs were not sharp rectangles)

**Material:** Black PETG (easiest, no painting needed). If too glossy, sand to matte and hit with matte black rattle-can.

**Weight impact:** ~150–250 g — negligible.

### 4.5 Side Panels as Structure
- 2 mm 5052 with formed ribs or return flanges provides all vertical and torsional rigidity
- No additional vertical supports needed
- Chassis simply keeps internal components from shifting

### 4.6 Panel Attachment (Revised)

| Panel | Attachment | Rationale |
|-------|------------|-----------|
| **Front faceplate (6061)** | Countersunk M3 screws into chassis/rails | High-wear surface, carries display load |
| **Side panels (5052)** | Magnetic snap-on or hidden screws | Structural; may need removal for service |
| **Rear panel** | Magnetic or 2–4 hidden screws | Service access to compute and wiring |
| **Hood (5052)** | Bolted to top bracket | Doesn't need frequent removal |
| **PC window** | Rests on bezel lip, magnetically retained or light friction fit | Easy removal for display service |

### 4.7 Joystick Mounting
- Sanwa JLF bolts directly to 3 mm 6061 faceplate — no sub-plate needed
- Faceplate is rigid enough to prevent flex and cracking
- If faceplate is thinner, add a 4–6 mm 6061 or steel sub-plate behind it

### 4.8 Speaker & Ventilation
- Down-firing speaker slots in the 90° hood as designed
- Passive ventilation sufficient for browser-based 2D games on Pi 5 or x86 thin client
- Optional: small rear vent cutout if future games demand more compute

### 4.9 Magnetic Nameplate
- Neodymium disc magnets press-fit into hood or faceplate
- Nameplate: thin steel or nickel-plated sheet, powder-coated to match
- Keep magnets away from speaker cone path
- Swappable per-game or generic ArcadeBench plate

### 4.10 Display Tilt
- 15° tilt as specified — validate via cardboard mockup before metal cutting
- Cardboard mockup build time: ~30 minutes with kids

---

## 5. Compute & Electronics

### 5.1 Recommended Platform: Used x86 Thin Client
**Examples:** Lenovo M90n, HP t640, Dell Wyse 5070  
**Why:**
- $60–$100 used cost
- x86 architecture = trivial Linux/Chrome deployment, no ARM quirks
- Adequate GPU for 2D WebGL/Canvas at 3004×2000
- VESA mountable inside cabinet
- Bulletproof browser performance for Partition and future games

**Alternative:** Raspberry Pi 5 (8 GB) if smaller footprint and GPIO access are desired. Acceptable but requires more debugging time.

### 5.2 Power & Audio
- **Power supply:** 65W PD or barrel-jack adapter; route through rear panel with strain relief
- **Amplifier + speakers:** 2× 3W or 2× 5W full-range drivers in down-firing configuration
- **Wiring:** Keep harnesses serviceable; use JST connectors or screw terminals for field repair

### 5.3 Offline-First Architecture
- Local Node.js stack runs the game engine and viewer (localhost kiosk)
- Deterministic replay files stored locally (SQLite or flat-file)
- Optional Wi-Fi sync to arcadebench.org for leaderboard submission
- No account creation required; privacy-preserving by default

---

## 6. Production Workflow

### Phase 1: Validation (Now)
- Cardboard mockup with family to validate ergonomics, button spacing, screen angle
- Iterate control layout with real play sessions across game genres

### Phase 2: Dev Cabinet (Game 2–3)
- One "golden master" built from plywood or 3D-printed parts
- 3D-printed PETG bezel tested for CRT recess depth and curve
- Daily driver for game development and hardware refinement
- Confirm thermal performance, speaker acoustics, and cable routing

### Phase 3: Production Prototype (Game 4)
- Laser-cut and brake-bent 5052 flat-pack
- Aluminum angle spine-and-ribs chassis
- Powder-coated or Cerakoted body
- 6061 faceplate anodized
- 3D-printed CRT bezel in black PETG
- Photographed for pre-order marketing

### Phase 4: Limited Run (Game 5)
- Build 3–5 units
- Hand-finished, signed, and documented
- Listed at ~$1,200 as handmade artisan hardware

### BOM Sanity Check (per unit, approximate)
| Component | Est. Cost |
|-----------|-----------|
| 13.5″ 3:2 hi-DPI panel | $180–$280 |
| Display driver | $40–$60 |
| Sanwa JLF + 6 buttons | $60–$80 |
| 2 mm 5052 sheet (½ sheet) | $30–$50 |
| 6061 faceplate | $15–$25 |
| Aluminum angle chassis (rails + bracket) | $10–$20 |
| 3D-printed bezel (PETG) | $5–$10 |
| x86 thin client / Pi 5 | $60–$150 |
| Amp + speakers + wiring | $40–$60 |
| Power supply | $25–$40 |
| PC window + mask | $30–$50 |
| Finish (powder/cerakote) | $40–$80 |
| **Total BOM** | **~$535–$905** |

At $1,200 retail, margin covers labor, scrapped parts, and the handmade premium.

---

## 7. Software & Product Concept

### 7.1 Platform Positioning
ArcadeBench is not a RetroPie clone. It is a **first-party platform** for inspectable, benchmarkable indie arcade games with a unique LLM-compatibility layer. The hardware is an appliance for that platform — a premium object that signals intentionality and craft.

### 7.2 Game Collection Strategy
Five games before hardware launch:

1. **Partition** (territory-capture, vector-arcade aesthetic) — validates core loop
2. **Tapper** (rhythm/timing, one-button) — tests button durability and tactile feel
3. **Plane shooter** (directional + fire) — validates joystick precision and rapid-fire comfort
4. **Gauntlet-style dungeon crawler** — validates full 6-button layout and complex input spacing; opportunity for deterministic AI companion offline, LLM companion online
5. **Kid's concept** (smiley-bucket physics + asteroid avoidance) — charm factor; simple rules with leaderboard depth

Each game maintains independent art direction. The cabinet itself — aluminum, Sanwa click, 15° tilt, magnetic nameplate, CRT bezel — provides the unifying brand experience.

### 7.3 Visual Cohesion Across Games
- **Boot shell:** Visually neutral, dark, clean. Let game art dominate.
- **Bezel mask:** Generous black mask around LCD accommodates different safe zones and aspect ratios without visual breakage.
- **Nameplate:** Swappable per-game or generic ArcadeBench plate.

### 7.4 CRT Effect (Software Toggle)
**App-level CRT post-processing effect, toggleable per game or globally.**

Since the hardware uses a recessed bezel to create physical CRT depth, the software effect complements rather than replaces it:

- **Scanlines:** Subtle horizontal line overlay at native pixel density (not true scanlines at 267 PPI, but a texture that reads as "tube")
- **Curvature:** Slight barrel distortion at screen edges — subtle, not gimmicky
- **Vignette:** Soft darkening at corners, mimicking CRT edge falloff
- **Phosphor glow:** Slight bloom on bright elements; color-bleed between adjacent pixels
- **Toggle:** On/off in game settings; some games may enforce it for aesthetic consistency

**Implementation:** CSS/Canvas post-processing filter stack, or lightweight WebGL shader. Performance cost negligible on x86 thin client or Pi 5 for 2D games.

**Why toggleable:** Not all games suit CRT effects. Partition's clean vector aesthetic may read better crisp; Tapper or the plane shooter may feel more authentic with it on. Player choice respects the indie-collection framing.

### 7.5 Offline vs. Online AI Companion (Gauntlet)
- **Offline:** Deterministic behavior-tree or rules-based AI companion using the same controller SDK interface
- **Online:** LLM-powered companion via cloud endpoint; same controller slot, swapped backend
- **Leaderboards:** Separate categories for "human solo," "human + deterministic AI," and "human + LLM"
- The deterministic AI is the known-good baseline; the LLM is the experimental upgrade

### 7.6 Privacy & Offline-First Ethos
- Works without internet out of the box — plug in at Christmas, play immediately
- No ads, no player data sold, no gameplay used for AI training
- Complete replay payloads expire after 5 days; verified summaries and hashes remain
- Immutable protocol generations ensure deterministic, inspectable results

### 7.7 The "Math vs Vibes" Ethos
Hardware must reflect the project's values: clean geometry, visible intentionality, no RGB gamer excess. The 90° hood, magnetic nameplate, precise 15° tilt, and CRT bezel already communicate this. The finish — whether powder coat, Cerakote, or brushed aluminum — should reinforce a sense of permanence and care.

### 7.8 The Family Story
This is a founder-and-kids project. The hardware build process (cardboard mockups, 3D-printed bezels, Cerakote in the garage, final assembly) is part of the product narrative. Document it. A $1,200 handmade cabinet signed by the builder and tested by an 8- and 10-year-old is a stronger story than an anonymous factory product.

---

## 8. Open Questions

1. **Gauntlet AI scope:** Single-player deterministic companion, or LLM co-op online only? Confirm before game design locks.
2. **Compute finalization:** Confirm thin client vs. Pi 5 after thermal and boot-time testing in the dev cabinet.
3. **Finish selection:** Powder coat (outsourced, consistent) vs. Cerakote (DIY, story-rich) — decide before Phase 3.
4. **CRT bezel depth:** Validate 15 mm vs. 25 mm recess via 3D-printed prototype — too shallow reads as flat; too deep obscures viewing angle.
5. **Joystick layout lock:** Validate 2×30mm + 4×24mm + start/select spacing across all five game concepts via cardboard mockup.
6. **Rear-panel I/O:** How much access to USB/HDMI/power is exposed vs. hidden? A clean rear panel matters for the "premium appliance" feel.
7. **PC window retention:** Magnetic, friction-fit, or light gasket? Must be secure but removable for display service.

---

*End of Brief — Revision 2*
