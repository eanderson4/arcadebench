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
