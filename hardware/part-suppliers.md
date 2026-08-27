# Internal Parts — Consolidated Sourcing Plan

Updated 2026-08-27 for the **1P hybrid build** (wood cheeks + printed front
matter — internals are identical to the full-print build). Goal: the whole
internal BOM in **4 carts** (+ local wood/finish for the hybrid cheeks).
Companion to `docs/HARDWARE-BOM.md`; prices are single-unit estimates from
supplier listings — confirm at order time.

## The 4-cart plan (recommended)

**Mouser** = quality electronics anchor · **Focus Attack** = genuine arcade
controls · **DFRobot** = compute · **AliExpress** = display kits + commodity
boards/sheet goods. Amazon and Parts Express eliminated: everything they
carried is stocked by these four.

### Cart 1 — Mouser (mouser.com) — electronics backbone (~$115)

| BOM item | Part | Est. |
|---|---|---|
| Encoder | Raspberry Pi Pico (GP2040-CE firmware) + 1 spare | $8 |
| PSU | Mean Well GST90A19-P1M 90W 19V brick, 5.5×2.5 plug | $30 |
| Power switch | Bulgin MPI002 19mm stainless LED-ring, IP66 — **CAD hole is locked at 19mm** (`power_switch_hole_dia`) | $39 |
| DC input jack | Switchcraft L712RAH panel-mount 5.5×2.5 | $8 |
| USB-C service port | Panel feedthrough, rear | $12 |
| Feet | 3M Bumpon rubber feet (Mouser stocks 3M) | $6 |
| Misc | JST-XH connectors + crimps, hookup wire | $12 |

### Cart 2 — Focus Attack (focusattack.com) — all controls (~$60)

(Paradise Arcade Shop is an equally complete alternate.)

| BOM item | Part | Est. |
|---|---|---|
| Joystick | Sanwa JLF-TP-8YT — no shaft extension at a 3mm deck | $25 |
| Primary buttons ×2 | Sanwa OBSF-30, red | $7 |
| Start/select ×2 | Sanwa OBSF-24, black | $5 |
| Alt-layout option | 2× OBSF-24 white (2×2 grid = deck reprint, buy now to save shipping) | $5 |
| Wiring | 5-pin JLF harness, 4.8mm QDs, 22AWG | $15 |
| Spares | Extra microswitches + 1 OBSF-30 | $8 |

Default is Sanwa (home/kids machine). Sealed industrial only if a bar
install becomes real — that's a deck-panel decision, not a shell change.

### Cart 3 — DFRobot (dfrobot.com) — compute (~$180–230)

| BOM item | Part | Est. |
|---|---|---|
| SBC | LattePanda Mu N100 (8GB LPDDR5, 64GB eMMC) | $139 |
| Carrier | Lite carrier (DC 12–20V in, breaks out USB/HDMI/NVMe) | $40–60 |

- ODROID H4+ (N97) / H4 Ultra (N305) remain the alternates but were out of
  stock at Hardkernel at research time — Mu is the orderable path today.
- Mu is a compute module: the carrier is mandatory, not optional.
- 19V direct from the Mean Well brick (module VIN 9–20V) — no main buck.
- TODO on arrival: measure module+carrier envelope against the base layout.

### Cart 4 — AliExpress or eBay — displays, audio, sheet goods (~$190–270)

Same sellers/goods on both marketplaces; eBay adds buyer protection. The
two display kits are the only lines locked to this channel — everything
else here can move to Amazon if you'd rather split the cart.

| BOM item | Part | Est. |
|---|---|---|
| Main display | 13.5" 3:2 3004×2000 IPS + HDMI driver kit, ~296×206×5mm outline — **confirm dims against CAD before cutting anything** | $100–150 |
| Marquee screen (premium option, `print-marquee` variant) | 11.3" 1920×440 bar LCD (ET113BA01-T class) + HDMI board, 266.4×65.0×4.6mm | $40–60 |
| Amp | PAM8610 2×15W class-D board — **max 16.5V, feed from the buck** | $5 |
| Buck | 19→12V 6A — mandatory with the PAM8610 | $10 |
| Speakers ×2 | Generic 2" full-range 4Ω (cutout ~50mm, depth ≤32mm — 2" max: hood floor is only ~57mm deep) | $10 |
| Cover window | 2.5–3mm polycarbonate sheet, cut-to-size listing | $15 |
| Sealing | Adhesive EPDM/neoprene foam strip | $8 |
| Inserts + screws | M3 heat-set (~45×, 4.6mm OD → 4.0–4.2mm hole) + M3×8–10 stainless + M2.5 self-tappers | $10 |
| HDMI | Short right-angle HDMI leads (main panel + marquee) | $8 |
| Storage (opt.) | 256GB NVMe if 64GB eMMC feels tight | $30 |

Speaker note: the premium pick was Dayton DMA58-4 (Parts Express, $14 ea).
Dropping to a generic AliExpress 2" driver is the price of cart
consolidation — fine for the prototype; upgrade later if audio matters.

## The 3-cart option (max consolidation, not recommended)

Amazon + AliExpress + DFRobot can technically cover everything — Sanwa
controls, Mean Well bricks, and Bulgin switches all appear on Amazon via
resellers. Costs: reseller markups (~15–25% on controls), genuine-Sanwa
counterfeit risk, and no specialist support. The ~$40 saved shipping isn't
worth it against Mouser + Focus Attack reliability.

## Hybrid-specific (local buy, not a cart)

- **Plywood (`hybrid.py` spec):** 12mm Baltic birch for the two structural
  side cheeks + 6mm ply for the flat wrap panels (bottom/back/taper/
  neck/top), cut to the exported DXF templates; round edges with a router
  (flat panels can't follow the rounded silhouette).
- **Finish:** sanding sealer/primer + color enamel rattle-can
  (Rust-Oleum 2X class, or Montana/Molotow for color pop) — colorway TBD
  with the colorway study. (Real Cerakote is a gun-sprayed ceramic; that's
  the premium aluminum build's finish, not wood.)

## Coverage summary

- Carts 1+2 cover all controls + power + encoder (~$175).
- Estimated all-in internals: **~$565–775** (marquee screen + NVMe are the
  swing items), enclosure fab on top (~$150–400 print; plywood + finish
  ~$60 for the hybrid).
- Sourcing order stays: (1) display + compute — they set mounting dims;
  (2) controls — datasheet dims for the deck; (3) commodity carts whenever.

## Decisions locked since last revision

- Power switch: 19mm Bulgin MPI002 class (CAD cutout fixed).
- Encoder: Pico + GP2040-CE (1P = one gamepad, zero firmware risk).
- Display: 13.5" 3:2 hi-DPI class, not the old 8" 4:3.
- Controls: 1P — 1 JLF, 2 OBSF-30, 2 OBSF-24 (alt layouts = deck reprint).

## Open decisions before ordering

1. Compute: LattePanda Mu N100 now vs waiting on ODROID N97/N305 stock.
2. Marquee screen: order with the first batch (premium variant) or defer.
