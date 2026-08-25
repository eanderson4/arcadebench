# Hardware BOM and sourcing — ArcadeBench bartop

Bill of materials for the premium single-player build (1P pivot, iteration
16 — all first-party games are 1P, and 1P lets the screen fill the face).
Quantities assume the 1P unit. The Status columns turn this document into the
sourcing tracker: mark each line `listed → ordered → received` (with date).

Legend: ☐ not ordered · ◐ ordered · ☑ received

Concrete picks below were verified against vendor pages on 2026-08-18; full
detail and alternates in [`hardware/bom-research.md`](../hardware/bom-research.md).
Prices are USD, as listed at research time — re-check before ordering.

**Consolidated ordering plan (2026-08-25):** the whole BOM fits in 4 carts —
Mouser + Focus Attack cover ~70% of line items. See
[`hardware/part-suppliers.md`](../hardware/part-suppliers.md); print bureaus
for the PETG shell in [`hardware/print-suppliers.md`](../hardware/print-suppliers.md)
(fact-checked, 6/6 sources PASS).

## 1. Compute

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | SBC | ODROID H4 Ultra (Core i3-N305, $220) or H4+ (N97, $159) — **both out of stock at Hardkernel as of 2026-08**; LattePanda Mu N100 $139 (needs ~$40–60 carrier) is the in-stock fallback | $159–220 | [Hardkernel](https://www.hardkernel.com/shop/odroid-h4-ultra/), [LattePanda](https://www.lattepanda.com/lattepanda-mu) |
| ☐ | RAM | 8–16 GB SODIMM matching the board | $25–50 | Any |
| ☐ | Storage | 256 GB NVMe M.2 (Samsung 970/980-class) | $30 | Any |
| ☐ | Heatsink | Board-matched passive block; thermally couple to shell with pad + paste | $15–30 | Board vendor |
| ☐ | RTC battery | If the board needs one | $3 | Any |

> Research correction: the H4+ is **N97**, not N305 — the N305 model is the
> H4 Ultra. All candidates accept **19 V direct** (H4: 11–20 V; Mu: 9–20 V
> module / 12–20 V carrier), so no main buck is needed. Note the ODROID
> board-side jack is 5.5×**2.1** mm — match the panel jack accordingly.

## 2. Display

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | Panel | **13.5″ 3:2 3004×2000 hi-DPI IPS** (Surface-class replacement + HDMI driver kit), **~296×206×5 mm outline**, active 285×190 — ~267 PPI, no OLED burn-in risk on static HUDs | $100–150 | AliExpress / eBay ("13.5 inch 3:2 3004x2000 HDMI kit") |
| ☐ | Panel (alt) | 12.1″ 4:3 1024×768 industrial (HV121/LQ121 class), ~261×204×8 outline — budget fallback | $70–110 | AliExpress |
| ☐ | Cover glass | 2.5–3 mm polycarbonate sheet, cut to size, gasketed | $15 | McMaster, TAP Plastics, Amazon |
| ☐ | Cable | Short right-angle micro/mini-HDMI → HDMI (match panel board) | $10 | Any |

> Display history: 8″ → 9.7″ (iter 5) → 12.1″ 4:3 (iter 11) → **13.5″ 3:2
> hi-DPI (iter 16, 1P pivot, screen study 3 option A)**. First-party games
> render 3:2 native, edge to edge — no legacy-aspect constraint. CAD targets
> the ~296×206×5 mm outline class; confirm against the actual unit before
> cutting. The visible glass is 290×200 mm with a printed black mask (2.5 mm
> side bars — panel centering tolerance ±1 mm, the retainer must locate it).

## 3. Controls

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | Primary buttons ×2 | Sanwa OBSF-30, red — front row, recessed-well indicator on the deck | $7 | [Paradise Arcade](https://paradisearcadeshop.com/collections/sanwa-obsf-series), [Focus Attack](https://focusattack.com/sanwa-obsf-30mm-pushbuttons-black/) |
| ☐ | Start/select ×2 | Sanwa OBSF-24, black, ~$2.50 ea | $5 | Paradise Arcade |
| ☐ | Joystick | Sanwa JLF-TP-8YT — no shaft extension needed at a 3 mm deck (stock shaft is fine to ~4 mm) | $25 | [Focus Attack](https://focusattack.com/sanwa-jlf-tp-8yt-joystick-precursor-to-jlx-tp-8yt/) |
| ☐ | Microswitches/boots | Spares for JLF + buttons | $10 | Same |
| ☐ | Encoder | **Raspberry Pi Pico ($4) running GP2040-CE** — 1P needs one gamepad, zero firmware risk | $4 | [Raspberry Pi](https://www.raspberrypi.com/products/raspberry-pi-pico/), [GP2040-CE](https://gp2040-ce.info/) |
| ☐ | Wiring | 22 AWG silicone wire, 4.8 mm quick disconnects, JST-XH harnesses | $25 | Any |

> Encoder note: 1P made this easy — GP2040-CE enumerates one controller per
> board, which is exactly what we need now. ESP32-S3 remains the hacker
> option (native USB, keyboard mode for admin menus).

> Snap-in caveat: OBSF buttons are designed for thin metal panels; at 3 mm
> printed deck they're at the top of the grip range — test on a coupon first,
> or switch to screw-in OBSN-30.

> Layout note (iter 37): the default control assembly is **stick + 2 OBSF-30
> + start/select** — no game in the roster needs more than two buttons. A
> 2×2 grid (add 2 OBSF-24, white, ~$5) or any other layout is a swappable
> deck-panel reprint, not a shell change.

## 4. Audio

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | Amp | PAM8610 2×15 W class-D board — **max 16.5 V, feed from the 12 V buck, never the 19 V rail** | $6–9 | [Amazon](https://www.amazon.com/HiLetgo-PAM8610-Digital-Amplifier-Channel/dp/B00WSN9S4Q), AliExpress |
| ☐ | Speaker | Dayton Audio DMA58-4 2″ 4 Ω (cutout 49.8 mm, depth 31.8 mm) — 2″ max: the hood floor is only ~57 mm deep, an ND64's 64 mm frame can't fit | $14–20 | [Parts Express](https://www.parts-express.com/Dayton-Audio-DMA58-4-2-Dual-Magnet-Aluminum-Cone-Full-Range-Driver-4-Ohm-295-582) |
| ☐ | DAC | Only if the board lacks clean 3.5 mm out | $0–12 | Any |
| ☐ | Buck | 19→12 V 6 A buck — **mandatory** once the PAM8610 is in | $10 | Any |

> The MAX98357A I2S breakout is a microcontroller part — x86 SBCs don't expose
> I2S conveniently. Board 3.5 mm (or USB DAC) → PAM8610 analog amp instead.

## 5. Power

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | PSU | Mean Well GST90A19-P1M, 19 V / 90 W, 5.5×2.5 plug | $29.50 | [DigiKey](https://www.digikey.com/en/products/detail/mean-well-usa-inc/GST90A19-P1M/7703719) |
| ☐ | Input jack | Switchcraft L712RAH panel-mount, 5.5×2.5 — **not** the 2.1 mm Tensility lookalike (unless compute is ODROID: match 2.1 mm board jack) | $8–15 | [DigiKey](https://www.digikey.com/en/products/detail/switchcraft-inc/L712RAH/7219694) |
| ☐ | Switch | Bulgin MPI002 stainless LED-ring, IP66, **19 mm cutout** (premium) or APIELE 16 mm latching ring-LED, **16 mm hole** (budget ~$10) | $10–20 | [Bulgin](https://www.bulgin.com/us/products/stainless-steel-vandal-resistant-illuminated-ip66-push-button-switch-mpi002-series-12v-blue-led-ring-2-8mm-tab-termination.html), [Amazon](https://www.amazon.com/API-ELE-GQ16-1NO1NC-Ring-Switch/dp/B079FND44N) |
| — | Soft shutdown | Power button → graceful shutdown script + idle auto-suspend | free | — |

## 6. Chassis sundries

| ☐ | Part | Spec / pick | Est. | Source |
| --- | --- | --- | --- | --- |
| ☐ | Inserts + fasteners | M3 heat-set (ruthex RX-M3x5.7 class: 4.6 mm OD → **4.0–4.2 mm printed hole**), M3/M4 stainless assortment | $20 | [Amazon ruthex](https://www.amazon.com/stores/ruthex/page/59A519BF-8EDD-479D-8968-5A2149CD8DE0) |
| ☐ | Gasket | 2–3 mm adhesive EPDM/neoprene foam strip (panel sealing) | $10 | Any |
| ☐ | Feet | Rubber, tall enough for the drip-edge overhang | $8 | Any |
| ☐ | Vent grille | Laser-cut pattern in shell (free) or mesh insert | $0–5 | Any |
| ☐ | Service port | 1× USB-C panel passthrough, rear | $8 | Any |
| ☐ | Badge / serial plate | Laser-etched aluminum | $10 | Fab shop |

## 7. Spares kit (order with the first batch)

2 extra buttons, 1 extra microswitch set, 1 extra Pico, extra gasket
strip — **+$30**. Your future self at a bar install will thank you.

## Totals

- Internals: **~$460–600** (compute pick is the swing; 1P saves one JLF,
  8 buttons, one encoder vs the old 2P BOM).
- Enclosure fab on top: ~$150–300.

## Prototype print order (PETG, iteration 38 "fb" split)

The shell splits into **4 parts with a completely seamless front** — mid
and hood print whole, the base splits front/rear at mid-depth, so no seam
ever crosses the nose, deck, display surround, or marquee. Seams live on
the sides/back and at natural geometry creases. This needs a **340+ mm
bed** (Bambu H2D class or a print service). Upload the STEP files from
`hardware/out/parts/` to any print service (Craftcloud, JLC3DP, PCBWay)
or a local H2D; no drawings needed at this stage. Exports are **already
print-oriented** (rotated, dropped to the bed) — verify orientation in
the slicer matches the table, and run `hardware/printability.py` for the
overhang audit.

| Part | Dims (mm) | Print orientation | Notes |
| --- | --- | --- | --- |
| `base_f` | 340×197×125 | as modeled (floor down) | entire nose + deck front, seamless; open-top bucket |
| `base_b` | 340×150×125 | as modeled (floor down) | hatch + rear I/O |
| `mid` | 340×161×175 | as modeled (upright) | whole display surround, seamless; CRT dish walls ≤15° overhang, brim optional |
| `hood` | 340×161×111 | back wall down | whole marquee + hood, seamless; one hidden attic ceiling sags harmlessly |
| `deck` | 319×87×11 | **show face down** | the swappable control panel — waffle ribs up; alt layouts = reprint this one flat part |
| `bezel` | 316×210×14 | flange face down | one-piece CRT trim ring; visible funnel prints up-facing |
| `retainer` | 319×229×3 | flat | display panel clamp (hidden behind the face) |
| `hatch_cover` | 198×118×3 | flat | rear service door |

- **Small-bed fallback:** `split_mode: "lr"` in `hardware/parts.py`
  restores the old 8-part L/R split (all parts fit a 256 mm bed) at the
  cost of a vertical seam down every front surface.
- Material: **PETG**, 4+ walls / ~25% infill for the shell parts (insert
  bosses need meat). Black for the bezel and deck panel (or the show
  colorway); body color = prototype's choice.
- Print-service quotes for this volume (~2.75 L): expect roughly
  **$150–400** FDM.
- Fasteners: **~45× M3 heat-set inserts** (ruthex RX-M3x5.7 class,
  4.0–4.2 mm printed holes are in the parts) and **~45× M3×8–10 screws**
  (12 of them CSK flat-head for the deck panel + hatch cover). Plus
  ~12× M2.5×6 self-tappers (or foam tape) for the board pads.
- Service access: the rear hatch (4 screws) reaches the SBC/USB area;
  the deck panel (12 screws) lifts out for control swaps and reaches the
  encoder/wiring underneath.

## Sourcing order (de-risked)

1. **Display + compute first** — they set enclosure dimensions and mounting.
   Note the Hardkernel stock gap: LattePanda Mu is the in-stock path today.
2. **Controls second** — exact datasheet dims are needed before cutting the
   control deck (already locked: JLF 84×40 slots, OBSF 30/24 mm holes).
3. Everything else is commodity — order whenever.

## Open decisions before ordering

- **Compute:** H4 Ultra N305 (best, but OOS) vs H4+ N97 vs LattePanda Mu N100
  (available now, needs carrier). 19 V direct works for all.
- **Buttons:** Sanwa (beloved feel, not IP-rated) vs. sealed industrial (right
  call for a bar machine; can recover good feel with quality microswitches).
- **Power switch:** Bulgin MPI002 (19 mm hole) vs APIELE (16 mm hole) — pick
  locks the CAD cutout.

## BOM items that constrain the CAD

These must exist as parameters or features in the enclosure model:

- Power switch cutout: **16 or 19 mm** hole, reachable from inside.
- DC panel jack (5.5×2.5 or 2.1 to match compute pick) + USB-C service port
  on the rear face, clear of the split seams.
- Speaker cutout **49.8 mm** (DMA58-4) + grille slots in the hood floor
  (firing down at the player); drivers mount inside the hood.
- Vent slot pattern (marquee overhang and/or rear panel).
- Feet: bosses on the base sized to the chosen foot hardware.
- M3 insert bosses: **4.0–4.2 mm holes, ≥6 mm deep**, on 8–10 mm bosses,
  accessible from the underside.
- Panel recess/retainer sized to the **~296×206×5 mm** display class
  (confirm against the physical unit).
- Board/heatsink standoff field sized to the mini-ITX or SBC hole pattern
  (finalize after the compute pick arrives and is measured).
