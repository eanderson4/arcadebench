"""Render the component catalog: one PNG per part plus a labeled contact sheet.

Usage:
    hardware/.venv/bin/python hardware/catalog_preview.py

Outputs to hardware/out/catalog/:
    <name>.png   iso render of each component
    _sheet.png   4x4 labeled contact sheet
Also prints a one-line size summary per component (bounding box, mm).
"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))

import components
from render import render_parts

OUT_DIR = Path(__file__).resolve().parent / "out" / "catalog"
ISO_ONLY = {"iso": (25, -60, None)}


def build_all():
    """Build every component once; return list of (name, parts, dims)."""
    return [builder() for builder in components.CATALOG]


def bbox_of(parts):
    """Overall bounding box of a list of (shape, color) parts."""
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for shape, _ in parts:
        bb = shape.bounding_box()
        for i, (lo, hi) in enumerate(zip(bb.min, bb.max)):
            mins[i] = min(mins[i], lo)
            maxs[i] = max(maxs[i], hi)
    return tuple(hi - lo for lo, hi in zip(mins, maxs))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    catalog = build_all()

    png_paths = []
    for name, parts, dims in catalog:
        render_parts(parts, OUT_DIR, prefix=name, views=ISO_ONLY)
        src = OUT_DIR / f"{name}_iso.png"
        dst = OUT_DIR / f"{name}.png"
        src.replace(dst)
        png_paths.append(dst)
        w, d, h = bbox_of(parts)
        print(f"{name:20s} {w:7.1f} x {d:7.1f} x {h:7.1f} mm  (X x Y x Z)")

    # Contact sheet: labeled grid of the individual renders.
    ncols = 4
    nrows = (len(png_paths) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(16, 10))
    for ax in axes.flat:
        ax.axis("off")
    for ax, path in zip(axes.flat, png_paths):
        ax.imshow(mpimg.imread(path))
        ax.set_title(path.stem, fontsize=11)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "_sheet.png", dpi=150)
    plt.close(fig)
    print(f"sheet -> {OUT_DIR / '_sheet.png'}")


if __name__ == "__main__":
    main()
