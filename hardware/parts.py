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

from build123d import (
    Box,
    BuildPart,
    BuildSketch,
    Cone,
    Cylinder,
    Mode,
    Pos,
    RectangleRounded,
    Rot,
    export_step,
    export_stl,
    extrude,
)

from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet, side_profile
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
    # horizontal-seam joint positions (x, y) — on the wall ring at that z.
    # y="rear"/"front" = auto: derived from the profile's wall at the seam
    # height (the neck taper moves the rear wall, the tilt moves the face;
    # static y values end up floating in the cavity). Side entries stay
    # static; blocks embed ~0.5 mm into the wall (coplanar fuses produce
    # invalid solids).
    "deck_seam_joints": [(-160.5, 250), (160.5, 250), (-145, "rear"),
                         (145, "rear"), (-145, "front"), (145, "front")],
    "hood_seam_joints": [(-160.5, 275), (160.5, 275), (-145, "rear"),
                         (145, "rear"), (-145, "front"), (145, "front")],
    # vertical-seam joint positions (y, z); y=None = auto (rear wall at z)
    # (used only when split_vertical is on; names must NOT collide with the
    # horizontal-seam lists above)
    "base_v_seam_joints": [(120, 9.5), (190, 9.5), (260, 9.5)],   # into floor
    "mid_v_seam_joints": [(None, 150), (None, 205), (None, 260)],
    "hood_v_seam_joints": [(None, 340), (None, 370), (None, 395)],
}

# --- display retainer clamp frame (printed part) --------------------------
RET = {
    "frame_thickness": 3.0,
    "frame_bearing": 8.0,        # mm the frame presses on the panel border
    "frame_edge": 5.5,           # mm frame material beyond the boss centers
    "frame_corner_r": 8.0,
    "opening_corner_r": 6.0,
    "screw_hole_dia": 3.4,       # M3 clearance
    "countersink_dia": 6.4,      # M3 flat-head, 90 deg
    "countersink_depth": 1.8,
    "cable_notch_w": 50.0,       # panel cable exit through the bottom rail
}


def _wall_y(z, pick):
    """Outermost profile-edge y crossing height z; pick=max for the rear
    wall, min for the front (display face)."""
    profile, _, _ = side_profile(CAB)
    best = None
    n = len(profile)
    for i in range(n):
        a, b = profile[i], profile[(i + 1) % n]
        if a[1] == b[1] or (a[1] - z) * (b[1] - z) > 0:
            continue
        t = (z - a[1]) / (b[1] - a[1])
        y = a[0] + t * (b[0] - a[0])
        if best is None or (pick is max and y > best) or (pick is min and y < best):
            best = y
    if best is None:
        raise ValueError(f"no wall at z={z}")
    return best


def rear_joint_y(z):
    """Y for a seam-joint block fusing into the rear wall at height z:
    in past the wall and half a block, embedding ~0.5 mm (the neck taper
    moves the rear wall; static y values end up in air)."""
    return _wall_y(z, max) - CAB["wall"] - SPLIT["joint_block"] / 2 + 0.5


def front_joint_y(z):
    """Same against the front (display-face) wall — the face y at a given
    z moves with display_tilt_deg."""
    return _wall_y(z, min) + CAB["wall"] + SPLIT["joint_block"] / 2 - 0.5


def _resolve(positions, z=None):
    """Fill in auto entries: "rear"/"front" derive y from the wall at the
    seam z (horizontal seams) or the joint's own z (vertical seams)."""
    out = []
    for a, b in positions:
        if z is not None:  # horizontal seam, (x, y)
            y = (rear_joint_y(z) if b == "rear"
                 else front_joint_y(z) if b == "front" else b)
            out.append((a, y))
        else:              # vertical seam, (y, z)
            y = rear_joint_y(b) if a is None else a
            out.append((y, b))
    return out


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

    base, mid = h_seam_joints(base, mid, zd, _resolve(p["deck_seam_joints"], zd))
    mid, hood = h_seam_joints(mid, hood, zh, _resolve(p["hood_seam_joints"], zh))

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
            left, right = v_seam_joints(left, right, _resolve(v_joints[name]))
            parts[f"{name}_l"] = left
            parts[f"{name}_r"] = right
        else:
            parts[name] = layer
    return parts


def retainer_frame():
    """Clamp frame holding the display panel against the polycarb rabbet.

    Screws (M3 flat-head, countersunk on the rear face) drive through the
    corner holes into the heat-set inserts in the shell's retainer bosses.
    Print orientation: flat on the bed, sketch in XY (X across, Y up-slope),
    thickness +Z. The cable notch sits on the +Y rail, which maps to the
    physical bottom when mounted with Rot(-90, 0, 0) in the face frame.
    """
    p = CAB
    ow = p["panel_outline_w"] + 2 * (p["retainer_boss_offset"] + RET["frame_edge"])
    oh = p["panel_outline_h"] + 2 * (p["retainer_boss_offset"] + RET["frame_edge"])
    iw = p["panel_outline_w"] - 2 * RET["frame_bearing"]
    ih = p["panel_outline_h"] - 2 * RET["frame_bearing"]
    t = RET["frame_thickness"]
    hx = p["panel_outline_w"] / 2 + p["retainer_boss_offset"]
    hy = p["panel_outline_h"] / 2 + p["retainer_boss_offset"]
    with BuildPart() as bp:
        with BuildSketch():
            RectangleRounded(ow, oh, RET["frame_corner_r"])
            RectangleRounded(iw, ih, RET["opening_corner_r"], mode=Mode.SUBTRACT)
        extrude(amount=t)
    frame = bp.part
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * hx, sy * hy
            frame -= Pos(cx, cy, t / 2) * Cylinder(
                radius=RET["screw_hole_dia"] / 2, height=t + 2
            )
            frame -= Pos(cx, cy, t - RET["countersink_depth"] / 2 + 0.1) * Cone(
                bottom_radius=RET["screw_hole_dia"] / 2,
                top_radius=RET["countersink_dia"] / 2,
                height=RET["countersink_depth"] + 0.2,
            )
    # cable notch through the +Y rail
    rail_c = (ih + oh) / 4
    frame -= Pos(0, rail_c, t / 2) * Box(
        RET["cable_notch_w"], (oh - ih) / 2 + 2, t + 2
    )
    return frame


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
        valid = part.is_valid
        bodies = len(part.solids())
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        fits = all(d <= bed for d in dims)
        print(
            f"{name:8s} valid={valid} bodies={bodies}  dims={dims[0]:.0f}x"
            f"{dims[1]:.0f}x{dims[2]:.0f} mm  fits {bed:.0f} bed: {fits}"
        )
        if not valid or bodies != 1:
            raise RuntimeError(f"part {name}: valid={valid}, bodies={bodies}")
        export_step(part, str(PARTS_DIR / f"{name}.step"))
        export_stl(part, str(PARTS_DIR / f"{name}.stl"))

    check_collisions(parts)

    # display retainer clamp frame (independent printed part)
    frame = retainer_frame()
    f_valid, f_bodies = frame.is_valid, len(frame.solids())
    print(f"retainer valid={f_valid} bodies={f_bodies}")
    if not f_valid or f_bodies != 1:
        raise RuntimeError(f"retainer frame: valid={f_valid}, bodies={f_bodies}")
    export_step(frame, str(PARTS_DIR / "retainer_frame.step"))
    export_stl(frame, str(PARTS_DIR / "retainer_frame.stl"))

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
    print(f"exported {len(parts)} parts + retainer frame + exploded to {PARTS_DIR}")


if __name__ == "__main__":
    main()
