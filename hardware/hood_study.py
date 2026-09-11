"""Hood study — 6 hood proportion variants on the current cabinet.

Consult-8 response: all three reviewers called the hood top-heavy. Each
variant builds the full solid (real fillets/features) and renders side +
front-iso views, tiled into one sheet with hood depth/height annotations.

Constraints respected per variant: the nameplate must fit the marquee face
(h -> nameplate_h/magnet_inset_z) and the speaker slots must fit the hood
floor depth (overhang -> hood_speaker_offset).

Run:  hardware/.venv/bin/python hardware/hood_study.py
Out:  hardware/out/hood/<label>_{side,iso}.png + hardware/out/hood_study.png
"""

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt

from cabinet import OUT_DIR, PARAMS, build_cabinet, side_profile
from render import render_parts

CREAM = (0.87, 0.85, 0.80)
HOOD_DIR = OUT_DIR / "hood"

# Each variant: (label, param overrides, note)
# Round 2: hood x neck matrix. The neck taper (neck_depth) slims the display
# column behind the screen; hood depth shrinks with it (cap = overhang +
# neck_depth). 60 mm is about the floor for the down-firing speakers
# (~52 mm mounting depth + wall).
_D = {
    "marquee_height": 56.0,
    "marquee_overhang": 48.0,
    "nameplate_h": 36.0,
    "magnet_inset_z": 10.0,
    "hood_speaker_offset": 24.0,
}
VARIANTS = [
    ("A-neckfull", {}, "baseline hood (h68/ov58), full-depth neck"),
    ("A-neck80", {"neck_depth": 80.0}, "baseline hood, neck 80"),
    ("A-neck60", {"neck_depth": 60.0}, "baseline hood, neck 60"),
    ("D-neckfull", _D, "slim hood (h56/ov48), full-depth neck"),
    ("D-neck80", {**_D, "neck_depth": 80.0}, "slim hood, neck 80"),
    ("D-neck60", {**_D, "neck_depth": 60.0}, "slim hood, neck 60"),
]


def main():
    HOOD_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for label, overrides, note in VARIANTS:
        p = {**PARAMS, **overrides}
        solid = build_cabinet(p)
        assert solid.is_valid and len(solid.solids()) == 1, f"{label}: invalid"
        render_parts(
            [(solid, CREAM)], HOOD_DIR, prefix=label, size=500,
            views={"side": (0, 180, None), "iso": (25, -60, None)},
        )
        _, _, info = side_profile(p)
        nd = p.get("neck_depth")
        # hood cap length: overhang + depth behind the face
        cap = p["marquee_overhang"] + (
            nd if nd is not None
            else (info["back_y"] - info["face_top_y"]) / info["cos_t"]
        )
        tiles.append((label, note, cap, info["back_top_z"]))
        print(f"{label}: hood cap {cap:.0f} mm, H {info['back_top_z']:.0f} mm")

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    for ax, (label, note, cap, height) in zip(axes.flat, tiles):
        ax.imshow(mpimg.imread(HOOD_DIR / f"{label}_side.png"))
        ax.set_title(f"{label}\n{note}\ncap {cap:.0f} mm, H {height:.0f} mm")
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "hood_study.png", dpi=140)

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    for ax, (label, note, cap, height) in zip(axes.flat, tiles):
        ax.imshow(mpimg.imread(HOOD_DIR / f"{label}_iso.png"))
        ax.set_title(f"{label}\n{note}")
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "hood_study_iso.png", dpi=140)

    # zoomed sheet: hood + neck region, where the variants actually differ
    from PIL import Image

    crop = (40, 0, 500, 320)
    fig, axes = plt.subplots(2, 3, figsize=(18, 8))
    for ax, (label, note, cap, height) in zip(axes.flat, tiles):
        img = Image.open(HOOD_DIR / f"{label}_side.png").crop(crop)
        ax.imshow(img.resize((img.width * 2, img.height * 2), Image.LANCZOS))
        ax.set_title(f"{label}\n{note}")
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "hood_study_zoom.png", dpi=140)
    print(f"sheets: hood_study.png, hood_study_iso.png, hood_study_zoom.png")


if __name__ == "__main__":
    main()
