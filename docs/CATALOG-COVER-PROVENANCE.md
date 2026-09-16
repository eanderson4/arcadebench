# Catalog cover provenance

The PNGs in `deploy/covers/` are reviewed runtime assets. The site build copies
them verbatim; it does not generate covers. Neither image is AI-generated.

## Partition

Partition remains the original live gameplay capture: a cyan hatched claim in
the lower-left of the dark grid with a pink anomaly above it.

- Temporary source: `/tmp/explore/p-mid-trace-3.png`, 1280×720.
- Crop: left 116, top 35, width 1049, height 590; resized to 960×540.
- Original one-off encoding used `sharp`, which is not a declared project
  dependency. That helper was removed. The source is temporary, so these bytes
  cannot be reproduced from a clean checkout alone.

## Maltline — refreshed September 15, 2026

Maltline shows the current renderer's machines to the bartender's left and
unnumbered service lanes. It uses the deterministic authored
`stage-7-happy-hour-pressure` fixture, not a recorded human run. The fixture
labels its provenance `synthetic-pressure-envelope` and validates its engine
state constraints; it is visual evidence, not a ranked proof.

Source route, with the Maltline development server running:

`/src/viewer/visual-fixtures.html?fixture=stage-7-happy-hour-pressure`

Capture procedure:

1. Chromium 153.0.8010.12 through the installed Playwright; viewport 1280×720,
   device scale 1, dark scheme, `en-US`, UTC, reduced motion. Launch flags:
   `--disable-gpu --font-render-hinting=none --force-color-profile=srgb --no-sandbox`.
2. Wait for `html[data-fixture-ready="true"]` and `document.fonts.ready`.
3. Capture the renderer's `#game` canvas, whose backing size at this viewport is
   1114×627. Draw it into a 960×540 browser canvas with image smoothing enabled
   and quality `high`, then export PNG. This excludes all surrounding shell UI.
4. Encode that capture as a 256-color PNG using Pillow 12.1.0: convert to RGB,
   quantize with `MEDIANCUT`, no dithering, save with `optimize=True`. No elements
   were added, removed, or retouched.

Temporary review evidence (not committed or required by the build):

- `/tmp/maltline-catalog-current-pressure-1280.png`: complete page capture.
- `/tmp/maltline-catalog-current-pressure-960-rgba.png`: resized canvas before palette encoding.
- `/tmp/maltline-catalog-current-pressure-metadata.json`: browser/version and fixture metadata.

There is no checked-in capture helper or promise of identical bytes across
browser versions. Regeneration requires a fresh capture and visual review.

## Final assets

Verify with `sha256sum deploy/covers/*.png`.

| Asset | Bytes | SHA256 |
| --- | --- | --- |
| `deploy/covers/partition.png` | 97058 | `0c802c75b0fa045fe748e50778f8d2d934ac6c86b93a4f53d13d4b0dc6990c91` |
| `deploy/covers/maltline.png` | 81003 | `1aaf6efa031afa3489ddb5eedea8f7013940150e390eb4fdcf7a48c0ec0cc8d4` |

Both are 960×540 palette PNGs, matching the homepage image dimensions and site tests.
