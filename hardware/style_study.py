"""Style study — 4 distinct design wells, each pushed to its local optimum.

The hood/neck consult settled the mechanics (neck 80, slim hood) but raised
the identity question: modern-slim vs retro/CRT. Each variant here is a
different WELL, not an interpolation:

  S1-modern      D-neck80 consult winner: slim hood, tapered neck 80
  S2-crt-deep    authentic CRT cues: near-vertical face (10 deg), deep neck
                 (130), tall hood, proud bezel frame, 4:3 masked window
  S3-crt-slim    CRT hint on the slim skeleton: tilt 12, neck 100, bezel,
                 4:3 window
  S4-retro-full  the original cream-direction: full-depth neck, bezel,
                 4:3 window, baseline hood

CRT variants mask the 3:2 panel to a 4:3 window (253x190 inside the same
glass area; games render 4:3 into it) and carry a 12 mm proud bezel ring.

Run:  hardware/.venv/bin/python hardware/style_study.py
Out:  hardware/out/style/<label>_{side,iso,front}.png +
      out/style_study{,_iso,_front}.png
"""

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt

from cabinet import OUT_DIR, PARAMS, build_cabinet, side_profile
from render import render_parts

CREAM = (0.87, 0.85, 0.80)
STYLE_DIR = OUT_DIR / "style"

_CRT_WINDOW = {
    "glass_opening_w": 253.0,      # 4:3 mask inside the same panel
    "glass_opening_h": 190.0,
    "bezel_width": 12.0,
    "bezel_proud": 3.0,
    "reveal_offset": 16.0,         # reveal ring frames the bezel, not the glass
}
_S1 = {
    "marquee_height": 56.0,
    "marquee_overhang": 48.0,
    "nameplate_h": 36.0,
    "magnet_inset_z": 10.0,
    "hood_speaker_offset": 24.0,
    "neck_depth": 80.0,
}
VARIANTS = [
    ("S1-modern", _S1, "consult winner: slim hood 56/48, neck 80"),
    (
        "S2-crt-deep",
        {
            "display_tilt_deg": 10.0,
            "neck_depth": 130.0,
            "marquee_height": 80.0,
            "marquee_overhang": 64.0,
            **_CRT_WINDOW,
        },
        "CRT: tilt 10, neck 130, hood 80/64, bezel + 4:3",
    ),
    (
        "S3-crt-slim",
        {
            "display_tilt_deg": 12.0,
            "neck_depth": 100.0,
            "marquee_height": 68.0,
            "marquee_overhang": 56.0,
            **_CRT_WINDOW,
        },
        "CRT hint on the slim skeleton: tilt 12, neck 100",
    ),
    (
        "S4-retro-full",
        {
            "display_tilt_deg": 10.0,
            **_CRT_WINDOW,
        },
        "full-depth retro (cream direction), bezel + 4:3",
    ),
]

VIEWS = {"side": (0, 180, None), "iso": (25, -60, None), "front": (0, -90, None)}


def main():
    STYLE_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for label, overrides, note in VARIANTS:
        p = {**PARAMS, **overrides}
        solid = build_cabinet(p)
        assert solid.is_valid and len(solid.solids()) == 1, f"{label}: invalid"
        render_parts([(solid, CREAM)], STYLE_DIR, prefix=label, size=500,
                     views=VIEWS)
        _, _, info = side_profile(p)
        tiles.append((label, note, info["back_top_z"]))
        print(f"{label}: H {info['back_top_z']:.0f} mm")

    for view in ("side", "iso", "front"):
        fig, axes = plt.subplots(1, 4, figsize=(24, 7))
        for ax, (label, note, height) in zip(axes.flat, tiles):
            ax.imshow(mpimg.imread(STYLE_DIR / f"{label}_{view}.png"))
            ax.set_title(f"{label}\n{note}")
            ax.axis("off")
        fig.tight_layout()
        out = OUT_DIR / f"style_study_{view}.png"
        fig.savefig(out, dpi=140)
        print(f"sheet: {out}")


if __name__ == "__main__":
    main()
