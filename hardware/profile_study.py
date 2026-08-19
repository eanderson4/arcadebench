"""Side-profile study — render silhouette variants to pick a direction.

Builds the full cabinet solid for each variant (real fillets, no shortcut
polygon) and renders side views at small size, tiled into one sheet with
head-depth + height annotations.

Run:  hardware/.venv/bin/python hardware/profile_study.py
Out:  hardware/out/profiles/<name>.png + hardware/out/profile_study.png
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt

from cabinet import OUT_DIR, PARAMS, build_cabinet, side_profile
from render import render_parts

CREAM = (0.87, 0.85, 0.80)
PROFILE_DIR = OUT_DIR / "profiles"

# Each variant: (label, param overrides, note)
# Round 3: hood face near-vertical (lean ~5–10° = 12–16 mm at h≈90),
# softer top corner — the round-2 rake (~29°) made a sharp prow.
_G = {
    "marquee_overhang": 85.0,
    "marquee_lean": 45.0,
    "marquee_height": 90.0,
    "top_cap_rise": 8.0,
    "display_tilt_deg": 15.0,
}
VARIANTS = [
    ("A-current", {}, "thin visor, head ~54 mm deep"),
    ("G-round2", _G, "round-2 trimmed hood (lean 27° — too raked)"),
    (
        "K-upright",
        {**_G, "marquee_lean": 12.0, "r_marquee_top": 20.0},
        "hood face ~8° off vertical, top R20"),
    (
        "L-upright-deep",
        {**_G, "marquee_overhang": 100.0, "marquee_lean": 15.0, "r_marquee_top": 20.0},
        "K + 15 mm deeper hood, face ~9°"),
    (
        "M-upright-deep-short-base",
        {**_G, "marquee_overhang": 100.0, "marquee_lean": 15.0,
         "r_marquee_top": 20.0, "cabinet_depth_base": 325.0},
        "L with 325 mm base"),
    (
        "N-upright-soft",
        {**_G, "marquee_overhang": 100.0, "marquee_lean": 15.0,
         "r_marquee_top": 24.0, "r_marquee_chin": 20.0},
        "L + softest hood corners (top R24, chin R20)"),
]


def head_stats(p):
    _, _, info = side_profile(p)
    head_depth = info["back_y"] - info["mrq_y"]
    height = info["back_top_z"]
    return head_depth, height


def main():
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for label, overrides, note in VARIANTS:
        p = {**PARAMS, **overrides}
        solid = build_cabinet(p)
        assert solid.is_valid and len(solid.solids()) == 1, f"{label}: invalid solid"
        render_parts(
            [(solid, CREAM)], PROFILE_DIR, prefix=label, size=500,
            views={"side": (0, 180, None)},
        )
        depth, height = head_stats(p)
        tiles.append((label, note, depth, height))
        print(f"{label}: head {depth:.0f} mm deep, {height:.0f} mm tall")

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    for ax, (label, note, depth, height) in zip(axes.flat, tiles):
        ax.imshow(mpimg.imread(PROFILE_DIR / f"{label}_side.png"))
        ax.set_title(f"{label}\n{note}\nhead {depth:.0f} mm, H {height:.0f} mm")
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "profile_study.png", dpi=140)
    print(f"sheet: {OUT_DIR / 'profile_study.png'}")


if __name__ == "__main__":
    main()
