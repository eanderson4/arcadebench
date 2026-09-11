# ArcadeBench Finish Study — Midnight Modern

## Direction

**midnight-modern**: matte graphite/near-black powder-coated chassis, dark
anodized metal accents, monochrome controls with exactly one electric accent
color — a signal orange reserved exclusively for the two primary buttons.

## Design rationale

The chassis is a single, quiet mass: a cool graphite powder coat
(~#27292D) that stays visibly "painted metal" rather than void-black, so the
forms and fillets still read under studio light. Against it, the CRT funnel
bezel is pushed to a deeper PETG black (~#151517), making the screen surround
the visual anchor — the eye lands on the display first, as it should on a
machine whose whole job is the screen. The control deck is a dark gunmetal
anodized plate, one step lighter than the shell, so the deck boundary is
legible without introducing a new hue. Controls run in a strict value
hierarchy — black joystick, dark-gray option buttons, mid-gray secondaries —
so the single electric-orange primary pair functions as an unambiguous
"press here" focal point; restraint everywhere else is what makes the accent
feel premium rather than toy-like. The hood nameplate is a neutral anodized
badge (~#80838A), a quiet metallic signature instead of a second accent —
an earlier iteration with an orange nameplate read loud and competed with
the primaries.

## Final palette

| Element | Component | Description | sRGB hex | Linear rgb (as passed) |
|---|---|---|---|---|
| Chassis shell | `shell` (powdercoat) | Matte graphite, cool near-black | #27292D | 0.016, 0.018, 0.022 |
| CRT funnel bezel | `crt_bezel` (petg) | Deep black, visual anchor | #151517 | 0.004, 0.004, 0.005 |
| Bezel retainer frame | `retainer_frame` (petg) | Black, one step above bezel | #222225 | 0.012, 0.012, 0.014 |
| Control deck plate | `control_plate` (anodized_dark) | Gunmetal; effective ~#5E5E63 after preset's ×0.35 tint | #757575* | 0.32, 0.32, 0.36 |
| Hood nameplate insert | `nameplate_insert` (anodized) | Neutral anodized badge, brushed-metal look | #80838A | 0.22, 0.23, 0.26 |
| Primary buttons (2) | `primary_p1_0`, `primary_p1_1` (plastic) | **Signal orange — the one electric accent** | #FF5900 | 1.0, 0.10, 0.0 |
| Secondary buttons (2) | `secondary_p1_0`, `secondary_p1_1` (plastic) | Mid gray, clear second tier | #9C9EA2 | 0.34, 0.35, 0.37 |
| Option buttons (2) | `option_sel`, `option_start` (plastic) | Dark gray, recessive | #59595E | 0.10, 0.10, 0.11 |
| Joystick | `joystick_p1` (plastic) | Near-black | #2B2B2D | 0.02, 0.02, 0.022 |
| PSU brick | `psu_brick` (plastic) | Near-black | #2B2B2D | 0.02, 0.02, 0.022 |
| Spine rails + top bracket | `spine_rail_l/r`, `top_bracket` (anodized) | Dark anodized, de-chromed | #595961 | 0.10, 0.10, 0.12 |
| Power switch | `power_switch` (metal) | Dimmed steel | #94949A | 0.30, 0.30, 0.33 |
| Feet (4) | `foot_0..3` (rubber) | Black rubber (manifest default) | #1D1D1D | 0.05, 0.05, 0.05 |
| Speaker grilles | `speaker_l/r` (fabric) | Black fabric (manifest default) | — | unchanged |

\* `control_plate` uses the `anodized_dark` preset, which multiplies the
passed color by 0.35; 0.32,0.32,0.36 renders as an effective linear
0.112,0.112,0.126 (~#5E5E63).

Unchanged internals (PCBs, display panel, clear polycarb sheet) keep their
manifest defaults; they are not visible in exterior views.

## Exact render command (final)

```
blender -b --python hardware/studio_scene.py -- \
  --manifest hardware/out/studio/manifest.json \
  --outdir hardware/out/study_midnight_modern --prefix midnight_modern_final \
  --views hero,display,side --size 1100 --engine CYCLES --samples 64 \
  --set shell=0.016,0.018,0.022 \
  --set crt_bezel=0.004,0.004,0.005 \
  --set retainer_frame=0.012,0.012,0.014 \
  --set control_plate=0.32,0.32,0.36 \
  --set nameplate_insert=0.22,0.23,0.26 \
  --set primary_p1_0=1.0,0.10,0.0 \
  --set primary_p1_1=1.0,0.10,0.0 \
  --set secondary_p1_0=0.34,0.35,0.37 \
  --set secondary_p1_1=0.34,0.35,0.37 \
  --set option_sel=0.10,0.10,0.11 \
  --set option_start=0.10,0.10,0.11 \
  --set joystick_p1=0.02,0.02,0.022 \
  --set psu_brick=0.02,0.02,0.022 \
  --set spine_rail_l=0.10,0.10,0.12 \
  --set spine_rail_r=0.10,0.10,0.12 \
  --set top_bracket=0.10,0.10,0.12 \
  --set power_switch=0.30,0.30,0.33
```

## Iteration notes

- **v1**: orange also on the nameplate insert → too much accent mass, read
  toy-like and pulled focus from the controls. Bezel/shell values too close;
  control plate invisible against the shell.
- **v2**: nameplate to neutral anodized, bezel deepened to 0.004, secondaries
  cooled to mid gray → hierarchy worked; deck plate still blended into shell.
- **v3**: control plate raised to effective ~#5E5E63 gunmetal → deck boundary
  legible in hero and deck views; confirmed as final.
