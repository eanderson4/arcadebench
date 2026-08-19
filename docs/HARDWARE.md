# Hardware: the ArcadeBench bartop cabinet

ArcadeBench is software first, but it deserves a physical home. This document
tracks the design of a tabletop ("bartop") arcade cabinet enclosure sized for
the platform: 3D-printable in parts today, convertible to sheet aluminum
later. Everything here is public and safe to share.

## Design directions under evaluation

Reference concepts live in [`hardware/references/`](../hardware/references/):

- **Cream / rounded** — soft radiused shell, light body, marquee overhang with
  vent slots, accent stripe under the screen.
- **Benchmark instrument** — gray lab-instrument look: VU meter in the marquee,
  side-panel schematic, knurled feet, exposed fasteners.
- **Phosphor** — dark monolithic shell, backlit marquee, amber-terminal mood,
  clean unbroken rear silhouette.

The parametric model is style-neutral; edge treatment, marquee shape, and
accent features are parameters, so any of these directions can be dialed in
without restructuring the model.

## Envelope and layout

- Two-player control deck: 2 × Sanwa JLF joysticks, 12 × 30 mm action buttons
  (6 per player), 2 × 24 mm start/select.
- 8″ 4:3 LCD behind a 2.5 mm polycarbonate window, display deck tilted back
  ~18–20° from vertical.
- Wall thickness 3 mm, internal ribs, fastener bosses accessible from the
  underside, no upward-facing shell seams.
- Shell splits into 2–3 printable parts joined by hidden M3 heat-set inserts.

## Bill of materials

The full internal-parts BOM with subsystem picks, prices, sourcing order, and
order-status tracking lives in [HARDWARE-BOM.md](HARDWARE-BOM.md). BOM items
that constrain the enclosure geometry (power switch, jacks, speaker cavity,
vents, feet, board standoffs) are called out there and mirrored as CAD
parameters.

## Verified component dimensions

| Component | Dimension | Source |
| --- | --- | --- |
| Sanwa JLF-P1 mounting plate | 95 × 53 × 1.6 mm | [Focus Attack](https://support.focusattack.com/hc/en-us/articles/360015744451-Sanwa-JLF-P1-Mounting-Plate-Measurements) |
| JLF plate-to-panel mounting slots | 84 × 40 mm rectangle (slotted, ~Ø5 mm hardware) | [plate drawing](../hardware/references/jlf-p1-plate.jpg) |
| JLF shaft panel hole | 24 mm | [arcadecontrols forum](http://forum.arcadecontrols.com/index.php?topic=144036.0) |
| Sanwa OBSF-30 button hole | 30 mm (snap-in, panel 2–5 mm thick) | [Qanba](https://www.qanba.com/products/sanwa-obsf-30) |
| 8″ 4:3 HDMI IPS kit (Pimoroni PIM372 class) | 174 × 136 × 3 mm outline, ~162 × 121.5 mm active, 1024×768, 350 nit | [PiShop](https://www.pishop.us/product/hdmi-8-ips-lcd-screen-kit-1024x768/) |
| M3 heat-set insert (ruthex class) | 4.6 mm OD × 5.7 mm long → 4.0–4.2 mm printed hole | [CNC Kitchen](https://www.cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts) |

## Development workflow

The enclosure is parametric code, not hand-drawn CAD:

- Python + [Build123d](https://github.com/gumyr/build123d) in
  `hardware/.venv`; every dimension is a named entry in the `PARAMS` dict at
  the top of [`hardware/cabinet.py`](../hardware/cabinet.py).
- `hardware/.venv/bin/python hardware/cabinet.py` exports STEP + STL plus
  orthographic front/side/top/iso PNG previews to `hardware/out/` for review
  without opening CAD.
- Changes are made by editing parameters or structure and re-running.

Status: **v0 builds clean** (valid solid, 560 × 340 × 347 mm, ~2.5 kg shell).
Monocoque shell with display window + polycarb rabbet + inner doubler, all
control cutouts, and two internal ribs. Not yet split into printable parts;
fastener bosses, feet, vents, speaker cavity, and rear jacks are next.
