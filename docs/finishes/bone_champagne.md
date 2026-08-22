# Finish Study — "Bone & Brass" (premium-minimal)

**Direction:** premium-minimal — Teenage-Engineering-adjacent restraint. A warm bone
powder-coat body, a black CRT funnel and matching black control plate as the two visual
anchors, fully achromatic controls, and exactly one accent: a brushed brass anodized
nameplate on the hood.

## Design rationale

The CRT bezel is the natural focal point of this cabinet, so the palette is built to
serve it: a deep, near-black bezel and funnel against a warm bone shell gives the display
maximum "sunken CRT" depth. The control deck repeats the bezel's black as an anodized
plate, creating a two-anchor rhythm (screen above, hands below) and letting the cream
buttons read as clean ivory punctuations — button hierarchy is carried by size and
position, not color. All controls stay achromatic; the single warm metallic moment is the
brushed-brass nameplate, placed where a badge belongs, echoing the shell's warmth without
competing with it. Nothing is pure white or pure black: the shell is a creamy bone, the
blacks are warm off-blacks, which keeps the object feeling like a premium appliance
rather than a plastic toy.

## Final palette

| Element | Description | sRGB hex | Linear RGB |
|---|---|---|---|
| Shell (powder-coat) | Warm bone cream | `#E6DBC4` | 0.7969, 0.7155, 0.5605 |
| CRT bezel / funnel (PETG) | Warm near-black | `#17171A` | 0.0050, 0.0050, 0.0066 |
| Nameplate insert (anodized) | Brushed brass / deep champagne | `#BFA277` | 0.5295, 0.3686, 0.1870 |
| Control plate (anodized dark) | Warm off-black | `#1F1E1C` | 0.0097, 0.0090, 0.0078 |
| Primary buttons ×2 | Ivory cream | `#EAE1CE` | 0.8277, 0.7593, 0.6253 |
| Secondary buttons ×2 | Ivory cream | `#EAE1CE` | 0.8277, 0.7593, 0.6253 |
| Option buttons (sel/start) | Ivory cream | `#EAE1CE` | 0.8277, 0.7593, 0.6253 |
| Joystick (ball + shaft) | Warm charcoal | `#232221` | 0.0127, 0.0119, 0.0111 |

Everything not listed (retainer frame, PSU brick, feet, speakers, internals) is left at
manifest defaults — all dark/neutral parts that don't appear in the color story.

## Exact --set flags

```
--set shell=0.7969,0.7155,0.5605 \
--set crt_bezel=0.005,0.005,0.0066 \
--set nameplate_insert=0.5295,0.3686,0.187 \
--set control_plate=0.0097,0.009,0.0078 \
--set primary_p1_0=0.8277,0.7593,0.6253 \
--set primary_p1_1=0.8277,0.7593,0.6253 \
--set secondary_p1_0=0.8277,0.7593,0.6253 \
--set secondary_p1_1=0.8277,0.7593,0.6253 \
--set option_sel=0.8277,0.7593,0.6253 \
--set option_start=0.8277,0.7593,0.6253 \
--set joystick_p1=0.0127,0.0119,0.0111
```

## Iteration notes

- **v1:** Charcoal buttons on a charcoal plate vanished — the deck had no legibility.
  Champagne nameplate at `#C9AE85` read flat mustard against the pale shell.
- **v2:** Inverted the deck (black plate, cream buttons) — immediately better, and the
  black plate echoed the bezel. But the lightened nameplate (`#D8C4A6`) went too pale and
  disappeared into the hood. Shell deepened from `#EBE3D3` to `#E6DBC4` so the cream
  actually reads warm under studio lighting.
- **v3 (final):** Nameplate split the difference at `#BFA277` brushed brass — present,
  warm, clearly metallic jewelry against the bone hood without shouting.
