"""ArcadeBench part splitter — turns the monocoque shell into buildable parts.

Split scheme (all parametric):
  - 3 horizontal layers: BASE (0..split_z_deck), MID (deck..split_z_hood),
    HOOD (split_z_hood..top)
  - optional vertical split at x=0 => 6 parts that fit a 360 mm bed
    (full-width parts need a >=530 mm machine or the sheet-metal path)

Joints: recessed boss block pairs at every seam — M3 heat-set-insert pilot
(4.2 mm x 7 mm, verified dims) in one half, M3 clearance through-hole in the
other. Screws are driven from inside / underneath: hidden when assembled.
Bosses are fused to adjacent walls/floor and kept flush with the seam plane.

Run:  hardware/.venv/bin/python hardware/parts.py
Out:  hardware/out/parts/<name>.step|.stl + exploded.png + parts sheet
"""

import math
from pathlib import Path

from build123d import Box, Cylinder, Pos, Rot, export_step, export_stl

from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet
from render import render_parts

PARTS_DIR = OUT_DIR / "parts"

SPLIT = {
    "split_vertical": False,       # 340 mm parts fit a 360 bed whole
    "split_z_deck": 125.0,         # base | face-column seam (clear of the
                                   # R20 seam blend; 105 left a wall sliver)
    "split_z_hood": 300.0,         # face-column | hood seam (below the chin and
                                   # the hood floor / back-wall junction ~304)
    "print_bed": 360.0,            # mm, for the fit check
    # --- joints -----------------------------------------------------------
    "joint_block": 14.0,           # mm boss cross-section (Y/Z or X faces)
    "joint_depth": 12.0,           # mm boss depth from the seam face
    "insert_hole_dia": 4.2,        # M3 heat-set insert pilot (4.0-4.2 spec)
    "insert_hole_depth": 7.0,
    "screw_hole_dia": 3.4,         # M3 clearance
    # horizontal-seam joint positions (x, y) — on the wall ring at that z;
    # x/y chosen to embed blocks ~0.5 mm into the adjacent wall (coplanar
    # fuses produce invalid solids)
    "deck_seam_joints": [(-160.5, 250), (160.5, 250), (-145, 330.5),
                         (145, 330.5), (-145, 163), (145, 163)],
    "hood_seam_joints": [(-160.5, 275), (160.5, 275), (-145, 332.5),
                         (145, 332.5), (-145, 218), (145, 218)],
    # vertical-seam joint positions (y, z); blocks fused to floor/back wall
    # (used only when split_vertical is on; names must NOT collide with the
    # horizontal-seam lists above)
    "base_v_seam_joints": [(120, 9.5), (190, 9.5), (260, 9.5)],   # into floor
    "mid_v_seam_joints": [(330.5, 150), (330.5, 205), (330.5, 260)],
    "hood_v_seam_joints": [(330.5, 340), (330.5, 370), (330.5, 395)],
}


def slice_box(z0, z1, x0, x1):
    return Pos((x0 + x1) / 2, CAB["cabinet_depth_base"] / 2, (z0 + z1) / 2) * Box(
        x1 - x0, CAB["cabinet_depth_base"] + 100, z1 - z0
    )


def h_seam_joints(lower, upper, z_split, positions):
    """Boss-block joints across a horizontal seam: lower part gets the M3
    clearance through-hole (screw from below/inside), upper part gets the
    heat-set-insert pilot. Blocks are flush with the seam plane."""
    p = SPLIT
    b, d = p["joint_block"], p["joint_depth"]
    for x, y in positions:
        lower += Pos(x, y, z_split - d / 2) * Box(b, b, d)
        upper += Pos(x, y, z_split + d / 2) * Box(b, b, d)
        lower -= Pos(x, y, z_split - d / 2) * Cylinder(
            radius=p["screw_hole_dia"] / 2, height=d + 2
        )
        upper -= Pos(x, y, z_split + p["insert_hole_depth"] / 2) * Cylinder(
            radius=p["insert_hole_dia"] / 2, height=p["insert_hole_depth"]
        )
    return lower, upper


def v_seam_joints(left, right, positions):
    """Boss-block joints across the x=0 vertical seam, screws horizontal:
    left part gets the clearance hole, right part the insert pilot."""
    p = SPLIT
    b, d = p["joint_block"], p["joint_depth"]
    for y, z in positions:
        left += Pos(-d / 2, y, z) * Box(d, b, b)
        right += Pos(d / 2, y, z) * Box(d, b, b)
        left -= Pos(-d / 2, y, z) * Rot(0, 90, 0) * Cylinder(
            radius=p["screw_hole_dia"] / 2, height=d + 2
        )
        right -= Pos(p["insert_hole_depth"] / 2, y, z) * Rot(0, 90, 0) * Cylinder(
            radius=p["insert_hole_dia"] / 2, height=p["insert_hole_depth"]
        )
    return left, right


def build_parts():
    p = SPLIT
    solid = build_cabinet()
    zd, zh = p["split_z_deck"], p["split_z_hood"]
    w = CAB["cabinet_width"] / 2

    base = solid & slice_box(-10, zd, -w - 50, w + 50)
    mid = solid & slice_box(zd, zh, -w - 50, w + 50)
    hood = solid & slice_box(zh, CAB["cabinet_depth_base"] + 500, -w - 50, w + 50)

    base, mid = h_seam_joints(base, mid, zd, p["deck_seam_joints"])
    mid, hood = h_seam_joints(mid, hood, zh, p["hood_seam_joints"])

    layers = [("base", base), ("mid", mid), ("hood", hood)]
    v_joints = {
        "base": p["base_v_seam_joints"],
        "mid": p["mid_v_seam_joints"],
        "hood": p["hood_v_seam_joints"],
    }

    parts = {}
    for name, layer in layers:
        if p["split_vertical"]:
            left = layer & slice_box(-50, 500, -w - 50, 0)
            right = layer & slice_box(-50, 500, 0, w + 50)
            left, right = v_seam_joints(left, right, v_joints[name])
            parts[f"{name}_l"] = left
            parts[f"{name}_r"] = right
        else:
            parts[name] = layer
    return parts


def check_collisions(parts):
    """Intersect every part pair that shares a seam; expect ~zero volume.
    (Consult #4 finding: exploded views can't prove assembly clearance.)"""
    names = list(parts)
    order = {"base": 0, "mid": 1, "hood": 2}
    worst = 0.0
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            la, lb = a.split("_")[0], b.split("_")[0]
            share_h = abs(order[la] - order[lb]) == 1  # horizontal seam
            share_v = la == lb                          # vertical seam halves
            if not (share_h or share_v):
                continue
            inter = parts[a] & parts[b]
            vol = (
                sum(s.volume for s in inter.solids())
                if inter is not None
                else 0.0
            )
            worst = max(worst, vol)
            flag = "  <-- COLLISION" if vol > 1.0 else ""
            print(f"  {a} x {b}: {vol:.3f} mm^3{flag}")
    print(f"max seam overlap: {worst:.3f} mm^3 (must be ~0)")
    return worst


def main():
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    parts = build_parts()

    bed = SPLIT["print_bed"]
    for name, part in parts.items():
        ok = part.is_valid and len(part.solids()) == 1
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        fits = all(d <= bed for d in dims)
        print(
            f"{name:8s} valid={ok}  dims={dims[0]:.0f}x{dims[1]:.0f}x"
            f"{dims[2]:.0f} mm  fits {bed:.0f} bed: {fits}"
        )
        export_step(part, str(PARTS_DIR / f"{name}.step"))
        export_stl(part, str(PARTS_DIR / f"{name}.stl"))

    check_collisions(parts)

    # exploded view: layers separated in Z, halves in X
    shades = [(0.87, 0.85, 0.80), (0.80, 0.77, 0.72), (0.72, 0.69, 0.64)]
    exploded = []
    for i, (name, part) in enumerate(parts.items()):
        layer_i = i // 2 if SPLIT["split_vertical"] else i
        dx = -60 if name.endswith("_l") else (60 if name.endswith("_r") else 0)
        dz = 70 * layer_i
        exploded.append((Pos(dx, 0, dz) * part, shades[layer_i]))
    render_parts(
        exploded, OUT_DIR, prefix="exploded", size=1200,
        views={"iso": (25, -60, None), "front": (0, -90, None)},
    )
    print(f"exported {len(parts)} parts + exploded view to {PARTS_DIR}")


if __name__ == "__main__":
    main()
