"""Build variants — one shared platform, variants as parameter overlays.

Industry pattern (platform + 150% BOM): interfaces and mounting points are
shared across builds; a variant is a dict of deltas applied on top of
cabinet.PARAMS — including envelope deltas (e.g. the marquee-screen build
wears a taller hood than the slim base). The base model is the empty
overlay, so it can never rot — it exercises the same code path on every run.

    python cabinet.py                          # base model (nameplate marquee)
    python cabinet.py --variant print-marquee  # upgraded marquee-screen build

When a variant needs real part/assembly differences (retainer frame, panel
in the BOM), gate them on the resolved params (e.g. p["marquee_screen"])
inside parts.py / assembly.py — never fork the scripts.
"""

from cabinet import PARAMS

VARIANTS = {
    # Base print build: magnetic nameplate inlay in the marquee face.
    "print-base": {},
    # Premium option: 11.3" 1920x440 bar LCD (ET113BA01-T class) behind a
    # window in the marquee face — attract loop / per-game art / ticker.
    # The screen needs a taller hood (flat band = height - 20 after the R10
    # blends); the base hood is too short for the 59.1 mm window.
    "print-marquee": {
        "marquee_screen": True,
        "marquee_height": 84.0,
    },
    # Planned: "hybrid-wood" (plywood cheeks + printed front matter, see
    # hybrid.py), "aluminum" (sheet brake-bent panels, see panels.py).
    # Display study: 14" 2.8K OLED (ATNA40YK04, 2880x1800 90Hz, 242 PPI,
    # 500 nits, DCI-P3). Outline 305.0x196.2x3.2 — 5mm wider than the 3:2
    # dish, so the whole cabinet widens 340 -> 350 to keep the clamp stack
    # proportions. 16:10 full-bleed aperture (no 4:3 mask). Bare panel is
    # US-stocked (Bliss Computers et al.); HDMI driver board is the
    # China-marketplace line. OLED burn-in managed in software (idle
    # screensaver, pixel orbiting, brightness cap — the platform controls
    # the whole stack).
    "oled-14": {
        "cabinet_width": 350.0,
        "panel_outline_w": 305.0,    # ATNA40YK04 module outline (1688 datasheet
        "panel_outline_h": 196.3,    #   listing) — confirm on arrival
        "panel_thickness": 3.2,
        "panel_active_w": 301.8,
        "panel_active_h": 188.6,
        "recess_w": 309.0,           # outline + 4 (same rule as the 3:2 dish)
        "recess_h": 190.0,           # outline - 6 (floor captures 3mm top/bot)
        "glass_opening_w": 299.0,    # recess - 10: near-full-bleed 16:10
        "glass_opening_h": 180.0,
        "polycarb_w": 321.0,         # opening + 11/side (same rule)
        "polycarb_h": 202.0,
    },
}

DEFAULT_VARIANT = "print-base"


def get_params(name=DEFAULT_VARIANT):
    """cabinet.PARAMS with the variant's deltas applied."""
    if name not in VARIANTS:
        raise ValueError(
            f"unknown variant {name!r}; choices: {sorted(VARIANTS)}"
        )
    p = dict(PARAMS)
    p.update(VARIANTS[name])
    return p
