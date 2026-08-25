"""Pack the exported print parts onto Bambu Lab H2D build plates.

Imports the print-oriented STEP exports from out/parts/ (already rotated and
dropped to z=0 by parts.py), shelf-packs them onto 350x320mm H2D plates
(single-nozzle build area), and renders each plate in 3D plus a labeled 2D
packing map. Reports per-part dims/volume and the largest part.

Run from repo root:  hardware/.venv/bin/python hardware/plate_layout.py
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

from build123d import import_step, Pos, Box

from render import render_parts

HERE = Path(__file__).parent
PARTS_DIR = HERE / "out" / "parts"
OUT_DIR = HERE / "out"

# --- plate + packing parameters -------------------------------------------
PLATE_W = 350.0     # H2D single-nozzle build width (X), mm
PLATE_D = 320.0     # H2D build depth (Y), mm
PLATE_H = 325.0     # H2D build height (Z), mm
EDGE_MARGIN = 4.0   # keep parts this far from the plate rim (340 mm parts
                    # on a 350 plate leave just 5 mm/side — full-bed print)
GAP = 10.0          # part-to-part clearance

# per-part colors (extended tab20-ish palette, 0..1)
PALETTE = [
    (0.78, 0.48, 0.16), (0.36, 0.60, 0.80), (0.55, 0.75, 0.35),
    (0.80, 0.40, 0.38), (0.62, 0.52, 0.74), (0.45, 0.70, 0.68),
    (0.85, 0.65, 0.30), (0.50, 0.62, 0.40), (0.72, 0.44, 0.55),
    (0.42, 0.55, 0.75), (0.80, 0.72, 0.45), (0.55, 0.50, 0.42),
    (0.66, 0.78, 0.55), (0.75, 0.55, 0.35), (0.50, 0.68, 0.78),
]

PART_NAMES = None  # resolved from the exported STEPs in load_parts()


def load_parts():
    parts = {}
    names = sorted(p.stem for p in PARTS_DIR.glob("*.step"))
    assert names, f"no exported parts in {PARTS_DIR} — run parts.py first"
    global PART_NAMES
    PART_NAMES = names
    for name in names:
        shape = import_step(str(PARTS_DIR / f"{name}.step"))
        bb = shape.bounding_box()
        parts[name] = {
            "shape": shape,
            "w": bb.max.X - bb.min.X,
            "d": bb.max.Y - bb.min.Y,
            "h": bb.max.Z - bb.min.Z,
            "vol": shape.volume,  # mm^3, solid volume
            "min": (bb.min.X, bb.min.Y, bb.min.Z),
        }
    return parts


def shelf_pack(parts, order):
    """Greedy shelf packing. Returns list of plates; each plate is a list of
    (name, x, y, rotated) with x,y = min corner of the bbox on the plate."""
    plates = []  # each: {"items": [...], "shelves": [{"y":.., "h":.., "x":..}]}

    for name in order:
        p = parts[name]
        placed = False
        for plate in plates:
            for shelf in plate["shelves"]:
                for rot in (False, True):
                    w = p["d"] if rot else p["w"]
                    d = p["w"] if rot else p["d"]
                    if (shelf["x"] + w <= PLATE_W - EDGE_MARGIN
                            and d <= shelf["h"]):
                        plate["items"].append((name, shelf["x"], shelf["y"], rot))
                        shelf["x"] += w + GAP
                        placed = True
                        break
                if placed:
                    break
            if placed:
                break
            # open a new shelf on this plate
            y_next = EDGE_MARGIN + sum(s["h"] + GAP for s in plate["shelves"])
            for rot in (False, True):
                w = p["d"] if rot else p["w"]
                d = p["w"] if rot else p["d"]
                if (EDGE_MARGIN + w <= PLATE_W - EDGE_MARGIN
                        and y_next + d <= PLATE_D - EDGE_MARGIN):
                    plate["shelves"].append(
                        {"y": y_next, "h": d, "x": EDGE_MARGIN + w + GAP})
                    plate["items"].append((name, EDGE_MARGIN, y_next, rot))
                    placed = True
                    break
            if placed:
                break
        if not placed:
            w, d = p["w"], p["d"]
            rot = False
            if w > PLATE_W - 2 * EDGE_MARGIN and d <= PLATE_W - 2 * EDGE_MARGIN:
                w, d, rot = d, w, True
            assert w <= PLATE_W - 2 * EDGE_MARGIN and d <= PLATE_D - 2 * EDGE_MARGIN, \
                f"{name} ({w:.0f}x{d:.0f}) does not fit the plate at all"
            plates.append({
                "items": [(name, EDGE_MARGIN, EDGE_MARGIN, rot)],
                "shelves": [{"y": EDGE_MARGIN, "h": d,
                             "x": EDGE_MARGIN + w + GAP}],
            })
    return plates


def best_pack(parts):
    """Maximal-rectangles packing: parts sorted big-first, each placed into
    the free rectangle with the least leftover long side; free rects are
    re-split around every placement. New plate when nothing fits."""
    plates = []  # each: {"items": [...], "free": [(x, y, w, d), ...]}
    order = sorted(parts, key=lambda n: -parts[n]["w"] * parts[n]["d"])

    for name in order:
        p = parts[name]
        best = None  # (waste, plate, rect_idx, rot, w, d)
        for plate in plates:
            for ri, (fx, fy, fw, fd) in enumerate(plate["free"]):
                for rot in (False, True):
                    w = p["d"] if rot else p["w"]
                    d = p["w"] if rot else p["d"]
                    if w <= fw and d <= fd:
                        waste = min(fw - w, fd - d)
                        if best is None or waste < best[0]:
                            best = (waste, plate, ri, rot, w, d)
        if best is None:
            plate = {"items": [], "free": [
                (EDGE_MARGIN, EDGE_MARGIN,
                 PLATE_W - 2 * EDGE_MARGIN, PLATE_D - 2 * EDGE_MARGIN)]}
            plates.append(plate)
            ri, rot = 0, False
            w, d = p["w"], p["d"]
            if w > PLATE_W - 2 * EDGE_MARGIN:
                w, d, rot = d, w, True
            assert w <= PLATE_W - 2 * EDGE_MARGIN and d <= PLATE_D - 2 * EDGE_MARGIN, \
                f"{name} ({w:.0f}x{d:.0f}) does not fit the plate at all"
        else:
            _, plate, ri, rot, w, d = best

        fx, fy = plate["free"][ri][0], plate["free"][ri][1]
        plate["items"].append((name, fx, fy, rot))
        # split every free rect that intersects the placed bbox
        placed = (fx, fy, fx + w + GAP, fy + d + GAP)
        new_free = []
        for (rx, ry, rw, rd) in plate["free"]:
            ix0, iy0 = max(rx, placed[0]), max(ry, placed[1])
            ix1, iy1 = min(rx + rw, placed[2]), min(ry + rd, placed[3])
            if ix0 >= ix1 or iy0 >= iy1:
                new_free.append((rx, ry, rw, rd))
                continue
            # up to 4 rects around the intersection
            if ry < iy0:
                new_free.append((rx, ry, rw, iy0 - ry))
            if iy1 < ry + rd:
                new_free.append((rx, iy1, rw, ry + rd - iy1))
            if rx < ix0:
                new_free.append((rx, iy0, ix0 - rx, iy1 - iy0))
            if ix1 < rx + rw:
                new_free.append((ix1, iy0, rx + rw - ix1, iy1 - iy0))
        # prune rects fully contained in another
        pruned = []
        for i2, a in enumerate(new_free):
            contained = False
            for j2, b in enumerate(new_free):
                if i2 != j2 and (a[0] >= b[0] and a[1] >= b[1]
                                 and a[0] + a[2] <= b[0] + b[2]
                                 and a[1] + a[3] <= b[1] + b[3]):
                    contained = True
                    break
            if not contained and a[2] > 1 and a[3] > 1:
                pruned.append(a)
        plate["free"] = pruned
    return plates


def main():
    parts = load_parts()

    print(f"{'part':12s} {'footprint':>12s} {'height':>7s} {'volume':>9s}")
    for name in PART_NAMES:
        p = parts[name]
        print(f"{name:12s} {p['w']:5.0f} x {p['d']:<5.0f} {p['h']:6.0f}mm "
              f"{p['vol'] / 1000:8.0f}cm3")
    biggest_fp = max(PART_NAMES, key=lambda n: parts[n]["w"] * parts[n]["d"])
    tallest = max(PART_NAMES, key=lambda n: parts[n]["h"])
    heaviest = max(PART_NAMES, key=lambda n: parts[n]["vol"])
    total_vol = sum(parts[n]["vol"] for n in PART_NAMES)
    print(f"\nbiggest footprint: {biggest_fp} "
          f"({parts[biggest_fp]['w']:.0f} x {parts[biggest_fp]['d']:.0f} mm)")
    print(f"tallest:           {tallest} ({parts[tallest]['h']:.0f} mm, "
          f"plate allows {PLATE_H:.0f})")
    print(f"largest volume:    {heaviest} ({parts[heaviest]['vol']/1000:.0f} cm3)")
    print(f"total solid volume: {total_vol/1000:.0f} cm3 "
          f"(~{total_vol/1000*1.27:.0f} g PETG at 100% infill; expect "
          f"~35-50% of that with real walls/infill)")

    plates = best_pack(parts)

    # sanity: no two placed bboxes may overlap (GAP already included above)
    for i, plate in enumerate(plates, 1):
        boxes = []
        for name, x, y, rot in plate["items"]:
            p = parts[name]
            w = p["d"] if rot else p["w"]
            d = p["w"] if rot else p["d"]
            boxes.append((name, x, y, x + w, y + d))
        for a in range(len(boxes)):
            for b in range(a + 1, len(boxes)):
                na, ax0, ay0, ax1, ay1 = boxes[a]
                nb, bx0, by0, bx1, by1 = boxes[b]
                if ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1:
                    raise RuntimeError(
                        f"plate {i}: {na} overlaps {nb}")
    print("packing sanity: no overlaps")
    print(f"\nplates needed: {len(plates)}")
    for i, plate in enumerate(plates, 1):
        used = 0.0
        for name, x, y, rot in plate["items"]:
            p = parts[name]
            w = p["d"] if rot else p["w"]
            d = p["w"] if rot else p["d"]
            used += w * d
        names = ", ".join(n + (" (rot)" if r else "")
                          for n, _, _, r in plate["items"])
        print(f"  plate {i}: {names}")
        print(f"    footprint coverage: {used / (PLATE_W * PLATE_D) * 100:.0f}%")

    # --- 3D renders, one top + iso per plate -------------------------------
    color_of = {n: PALETTE[i % len(PALETTE)] for i, n in enumerate(PART_NAMES)}
    plate_color = (0.25, 0.26, 0.28)
    for i, plate in enumerate(plates, 1):
        scene = [(Pos(PLATE_W / 2, PLATE_D / 2, -0.8)
                  * Box(PLATE_W, PLATE_D, 1.6), plate_color)]
        for name, x, y, rot in plate["items"]:
            p = parts[name]
            s = p["shape"]
            if rot:
                from build123d import Rot
                c = (p["min"][0] + p["w"] / 2, p["min"][1] + p["d"] / 2, 0)
                s = Pos(c) * Rot(0, 0, 90) * Pos(-c[0], -c[1], 0) * s
                w, d = p["d"], p["w"]
            else:
                w, d = p["w"], p["d"]
            bb = s.bounding_box()
            s = Pos(x - bb.min.X, y - bb.min.Y, 0) * s
            scene.append((s, color_of[name]))
        render_parts(scene, OUT_DIR, prefix=f"plate{i}",
                     views={"top": (89.9, -90, None), "iso": (35, -60, None)})

    # --- labeled 2D packing map --------------------------------------------
    ncols = len(plates)
    fig, axes = plt.subplots(1, ncols, figsize=(5.2 * ncols, 5.4),
                             squeeze=False)
    for i, (ax, plate) in enumerate(zip(axes[0], plates), 1):
        ax.add_patch(mpatches.Rectangle((0, 0), PLATE_W, PLATE_D,
                                        fc="#2a2b2e", ec="white", lw=1.5))
        ax.add_patch(mpatches.Rectangle(
            (EDGE_MARGIN, EDGE_MARGIN), PLATE_W - 2 * EDGE_MARGIN,
            PLATE_D - 2 * EDGE_MARGIN, fill=False, ec="#888888", ls="--",
            lw=0.8))
        for name, x, y, rot in plate["items"]:
            p = parts[name]
            w = p["d"] if rot else p["w"]
            d = p["w"] if rot else p["d"]
            c = color_of[name]
            ax.add_patch(mpatches.Rectangle((x, y), w, d, fc=c, ec="black",
                                            lw=0.8, alpha=0.95))
            ax.text(x + w / 2, y + d / 2,
                    f"{name}\n{w:.0f}x{d:.0f}", ha="center", va="center",
                    fontsize=8, color="black", weight="bold")
        ax.set_xlim(-8, PLATE_W + 8)
        ax.set_ylim(-8, PLATE_D + 8)
        ax.set_aspect("equal")
        ax.set_title(f"plate {i}  (H2D {PLATE_W:.0f}x{PLATE_D:.0f} mm)",
                     fontsize=11)
        ax.set_xticks(range(0, int(PLATE_W) + 1, 50))
        ax.set_yticks(range(0, int(PLATE_D) + 1, 50))
        ax.tick_params(labelsize=7)
    fig.suptitle("ArcadeBench print plates — Bambu H2D (350x320), "
                 f"{len(plates)} plate(s)", fontsize=13)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "plates_map.png", dpi=140)
    print(f"\nrenders: plate*_top/iso.png + plates_map.png in {OUT_DIR}")


if __name__ == "__main__":
    main()
