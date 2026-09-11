# Internal Parts — Consolidated Sourcing Plan

Researched 2026-08-25. Goal: buy the whole internal BOM from **4 suppliers**
(+1 optional), with the bulk consolidated on **Mouser + Focus Attack**.
Prices are single-unit estimates from supplier listings; confirm at order time.

## Supplier 1 — Mouser (mouser.com) — electronics backbone

One cart covers nearly all electronics + hardware inserts:

| BOM item | Part | Est. |
|---|---|---|
| Encoder | Espressif ESP32-S3-DevKitC-1-N8R8 (in stock) | $15 |
| Amp | Adafruit 3006 MAX98357A I2S 3W mono breakout (Mouser stocks Adafruit) | $5 |
| PSU | Mean Well GST90A19-P1M 90W 19V desktop brick, 5.5×2.5 plug | $25–35 |
| Power switch | Bulgin MPI005 series 19mm stainless vandal-resistant, LED ring (48 in stock) — premium pick; E-Switch/Amazon clones if $39 stings | $39 |
| DC input jack | Panel-mount 5.5×2.1/2.5 barrel (CUI/Cliff) | $3–6 |
| USB-C service port | Bulgin/Cliff USB-C panel feedthrough | $8–15 |
| Heat-set inserts | SI/PEM M3 heat-stake threaded inserts ($0.36–0.43 ea, 10k+ in stock) + M4 | $15 |
| Feet | 3M Bumpon rubber feet | $6 |
| Misc | JST-XH connectors, crimps, hookup wire, buck converter (if board needs 12V) | $15 |

## Supplier 2 — Focus Attack (focusattack.com) — all controls

(Paradise Arcade Shop is an equally complete alternate — JLF $28.95, OBSF-30 $3.25.)

| BOM item | Part | Est. |
|---|---|---|
| Joystick ×1 | Sanwa JLF-TP-8YT (incl. TP-MA PCB + JLF-P1 plate) | $29 |
| Primary buttons ×2 | Sanwa OBSF-30 | $6 |
| Start/Select ×2 | Sanwa OBSF-30 or OBSF-24 | $5–6 |
| Wiring | 5-pin JLF harness, 4.8mm quick disconnects, 22AWG | $15 |
| Spares | Extra microswitches, 1 extra OBSF-30 | $8 |

Open decision still pending: Sanwa vs sealed-industrial buttons (bar
durability). Default build above is Sanwa.

## Supplier 3 — DFRobot (dfrobot.com) — compute

| BOM item | Part | Est. |
|---|---|---|
| SBC | LattePanda Mu — N100, 8GB LPDDR5, 64GB eMMC ($179) or Eval Kit with carrier ($229) | $179–229 |

- Pending: verify Mu + carrier envelope fits the base layout in the model.
- ODROID H4+/N305 remains the alternate but was out of stock at Hardkernel.
- RAM/storage: Mu is onboard 8GB + eMMC (no SODIMM/NVMe needed to boot;
  NVMe via carrier if wanted).

## Supplier 4 — Amazon — display + sheet sundries

| BOM item | Part | Est. |
|---|---|---|
| Display | VSDISPLAY 8" 1024×768 IPS (HJ080IA-01E) + HDMI controller board | $80–120 |
| Cover window | 2.5–3mm polycarbonate sheet, cut to size | $15 |
| Sealing | Adhesive EPDM/neoprene foam strip 2–3mm | $10 |
| Wiring | 22AWG silicone wire spool (if not covered by Focus Attack) | $12 |
| Storage (opt.) | 256GB NVMe | $30 |

## Optional 5 — Parts Express (parts-express.com) — premium audio

| BOM item | Part | Est. |
|---|---|---|
| Speaker ×1–2 | Dayton Audio ND65-4 2.5" aluminum-cone full-range 4Ω ($31.99); budget alt CE48-4 2" ($7.99) | $8–32 |

Skip this cart by substituting a PUI/Visaton driver from the Mouser order if
audio quality isn't the priority — keeps it to 4 suppliers.

## Coverage summary

- **Mouser + Focus Attack alone cover ~70% of line items** (everything except
  compute, display, sheet goods).
- Total carts: 4 (5 with Parts Express). Estimated all-in: **~$450–600**
  matching the earlier BOM envelope.
- Sourcing order stays as planned: (1) display + compute first — they set
  mounting dims; (2) controls second — datasheet dims for cutouts;
  (3) Mouser/Amazon commodity carts whenever.

## Open decisions before ordering

1. Sanwa vs sealed-industrial buttons (feel vs bar-proofing).
2. LattePanda Mu vs waiting for N305 stock.
3. Power switch: Bulgin $39 premium vs $10 Amazon clone (hole is currently
   modeled 19mm — Bulgin MPI005 fits; clone may be 16 or 19).
4. Speaker: Dayton ND65-4 (Parts Express) vs Mouser-carried driver.
