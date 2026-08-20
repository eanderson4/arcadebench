# Palette Study: Playful Spectrum

**Direction:** playful-spectrum — friendly and kid-legible without being cheap.

## Design rationale

The cream off-white shell does the "premium consumer electronics" work: soft, warm, and quiet, so the color can live on the parts a kid actually touches. Mint is the single secondary accent, applied to both the anodized control plate and the nameplate insert so the hood and the deck rhyme — the eye travels from badge to buttons along one color. The black PETG CRT funnel stays untouched and remains the visual anchor; everything else is light, so the dark screen surround reads as the "face" of the machine. The button set is the joyful moment, kept controlled: two red primaries carry the arcade semantic (the important buttons are red, full stop), azure and amber secondaries give contrasting but candy-toned support, and the option buttons recede in charcoal so the hierarchy is legible at a glance. Saturating the mint on the anodized parts had to be done by over-brightening the base color — the metallic reflection of the gray studio environment otherwise pulls it to murky green (see iteration learnings below).

## Final palette

| Element | Description | Hex (sRGB intent) | Linear RGB used |
|---|---|---|---|
| shell | Warm off-white powder-coat (default, unchanged) | #EFEDE6 | 0.87, 0.85, 0.80 |
| crt_bezel | Black PETG funnel trim (default, unchanged) | #2A2A2E | 0.05, 0.05, 0.06 |
| control_plate | Mint anodized aluminum (anodized_dark preset darkens it ~1 stop; renders as a deep mint green) | #ACF9E4 | 0.42, 0.95, 0.78 |
| nameplate_insert | Matching mint anodized accent on the hood | #ACF9E4 | 0.42, 0.95, 0.78 |
| primary_p1_0 / primary_p1_1 | Arcade red primaries | #E0393E | 0.75, 0.037, 0.044 |
| secondary_p1_0 | Azure blue secondary | #2AA3DF | 0.019, 0.374, 0.745 |
| secondary_p1_1 | Amber yellow secondary | #F2A83B | 0.89, 0.40, 0.040 |
| option_sel / option_start | Charcoal option buttons, visually recessed | #282B2F | 0.017, 0.020, 0.024 |
| joystick_p1 | Default (cream ball, charcoal shaft) — left as-is; a white ball keeps the deck from getting noisy | — | — |

## Exact `--set` flags

```
--set control_plate=0.42,0.95,0.78 \
--set nameplate_insert=0.42,0.95,0.78 \
--set primary_p1_0=0.75,0.037,0.044 \
--set primary_p1_1=0.75,0.037,0.044 \
--set secondary_p1_0=0.019,0.374,0.745 \
--set secondary_p1_1=0.89,0.40,0.040 \
--set option_sel=0.017,0.020,0.024 \
--set option_start=0.017,0.020,0.024
```

## Iteration notes

- **v1:** A "correct" linear conversion of mint (#8FD9C4) rendered as near-black forest green on the `anodized_dark` control plate — metallic presets darken dramatically under gray studio reflections. Buttons and shell were right on the first pass.
- **v2:** Brightened plate toward sRGB >1 territory (0.55, 0.90, 0.78) and swapped the muted navy secondary for azure. Plate improved but still sage; azure was a clear win.
- **v3:** Echoed the accent on the nameplate insert — this tied hood and deck together and committed the direction. Kept.
- **v4 (final):** Lowered the red channel of the mint (0.42, 0.95, 0.78) to buy back saturation; plate reads as deep mint green, nameplate as bright mint. Locked.
