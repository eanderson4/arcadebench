# ArcadeBench Finish Study — Heritage Pop

**Direction:** heritage-pop — bold arcade heritage with pop.

## Design rationale

The shell carries the entire statement: a deep vermilion-signal-orange powder-coat
(~RAL 2004, pushed slightly redder than pure traffic orange) that reads as confident
arcade heritage without tipping into toy territory. The near-black PETG funnel trim
ring and black anodized control plate form one continuous dark mass, so the CRT
bezel stays the visual anchor and the deck reads as an instrument panel rather than
a separate slab. On the deck, a strict hierarchy: amber-yellow primary buttons do
the shouting, cream secondaries support them, and the graphite option buttons and
black ball-top joystick recede. The cream anodized nameplate is the heritage nod —
it bookends the cream secondary buttons, lightens the hood, and keeps the dark
nameplate alternative (tried in v2) from turning the top of the machine into a void.

## Final palette

| Element | Description | Hex (sRGB) | Linear RGB |
|---|---|---|---|
| shell | Vermilion signal-orange powder-coat | #E03112 | 0.72, 0.055, 0.004 |
| crt_bezel | Near-black PETG funnel trim | #1A1A1F | 0.03, 0.03, 0.035 |
| control_plate | Black anodized deck plate | #232328 | 0.06, 0.06, 0.07 |
| nameplate_insert | Cream anodized hood nameplate | #EEE3D1 | 0.88, 0.84, 0.76 |
| primary_p1_0 / primary_p1_1 | Amber-yellow primary buttons | #FFC400 | 1.0, 0.561, 0.003 |
| secondary_p1_0 / secondary_p1_1 | Cream secondary buttons | #F0E6D4 | 0.93, 0.90, 0.82 |
| option_sel / option_start | Graphite option buttons | #3B3B45 | 0.13, 0.13, 0.15 |
| joystick_p1 | Black ball-top joystick | #1D1D22 | 0.05, 0.05, 0.06 |

Unlisted components (feet, PSU brick, internals) left at manifest defaults.

## Exact --set flags

```
--set shell=0.72,0.055,0.004 \
--set crt_bezel=0.03,0.03,0.035 \
--set control_plate=0.06,0.06,0.07 \
--set nameplate_insert=0.88,0.84,0.76 \
--set primary_p1_0=1.0,0.561,0.003 \
--set primary_p1_1=1.0,0.561,0.003 \
--set secondary_p1_0=0.93,0.90,0.82 \
--set secondary_p1_1=0.93,0.90,0.82 \
--set option_sel=0.13,0.13,0.15 \
--set option_start=0.13,0.13,0.15 \
--set joystick_p1=0.05,0.05,0.06
```

## Iteration notes

- v1: RAL 2004 shell + mid-gray nameplate. Shell was slightly too bright/toy-like;
  the silver-gray nameplate read as unfinished primer.
- v2: deepened shell toward vermilion, graphite nameplate, lifted option buttons off
  the black plate (they were invisible in v1). Graphite nameplate was safe but made
  the hood a dark void.
- v3: cream nameplate — final. Echoes the cream-machine lineage and the cream
  secondary buttons, balancing a light accent at the top against the dark bezel mass.
