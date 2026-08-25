"""ArcadeBench part splitter — turns the monocoque shell into buildable parts.

Split scheme (all parametric):
  - 3 horizontal layers: BASE (0..split_z_deck), MID (deck..split_z_hood),
    HOOD (split_z_hood..top)
  - optional vertical split at x=0 => 6 parts that fit a 360 mm bed
    (full-width parts need a >=530 mm machine or the sheet-metal path)
  - optional front/back split of the base at y=split_y_base => 8 parts that
    fit a 256 mm bed (Bambu/Prusa class): base quarters ~170x180x125,
    mid/hood halves ~170x185x175. Prototype path: PETG anywhere.

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
    Locations,
    Mode,
    Plane,
    Pos,
    RectangleRounded,
    Rot,
    Sphere,
    export_step,
    export_stl,
    extrude,
    loft,
)

from cabinet import (
    OUT_DIR,
    PARAMS as CAB,
    build_cabinet,
    deck_screw_points,
    side_profile,
)
from render import render_parts

PARTS_DIR = OUT_DIR / "parts"

SPLIT = {
    "split_vertical": True,        # x=0 split: halves fit modest beds
    "split_base_y": True,          # front/back split of the base layer =>
                                   # 8 parts, all fit a 256 mm bed
    "split_y_base": 190.0,         # base front|rear seam (clear of the ribs,
                                   # which end ~25 mm behind the control deck)
    "split_z_deck": 125.0,         # base | face-column seam (clear of the
                                   # R20 seam blend; 105 left a wall sliver)
    "split_z_hood": 300.0,         # face-column | hood seam (below the chin and
                                   # the hood floor / back-wall junction ~304)
    "print_bed": 256.0,            # mm, for the fit check (Bambu/Prusa class)
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
    # invalid solids). Front entries sit at |x|=162: the CRT dish (iter 34)
    # removes the face wall for |x|<154 around the screen, and the funnel
    # insert's walls reach |x|~145 at the seam heights.
    "deck_seam_joints": [(-160.5, 250), (160.5, 250), (-145, "rear"),
                         (145, "rear"), (-162, "front"), (162, "front")],
    "hood_seam_joints": [(-160.5, 275), (160.5, 275), (-145, "rear"),
                         (145, "rear"), (-162, "front"), (162, "front")],
    # vertical-seam joint positions (y, z); y=None = auto (rear wall at z)
    # (used only when split_vertical is on; names must NOT collide with the
    # horizontal-seam lists above). Base entries must stay clear of
    # split_y_base so the F/B seam never slices a block.
    "base_v_seam_joints": [(90, 9.5), (150, 9.5), (240, 9.5), (300, 9.5)],
    "mid_v_seam_joints": [(None, 150), (None, 205), (None, 260)],
    "hood_v_seam_joints": [(None, 340), (None, 370), (None, 395)],
    # base front/back seam at y=split_y_base: (|x|, z) positions, mirrored
    # per L/R half. z=9.5 blocks fuse into the floor, x=160.5 blocks embed
    # 0.5 mm into the side walls. Screws drive from the rear (hatch access)
    # into inserts in the front quarters.
    "base_y_seam_joints": [(30, 9.5), (90, 9.5), (160.5, 60), (160.5, 110)],
}

# --- CRT funnel insert + trim ring (printed part, black PETG) --------------
# Iter 34: the old proud 18 mm bezel read inverted vs real CRTs (their frame
# protrudes a few mm and the funnel NARROWS inward to the glass). Now the
# shell face carries a 12 mm dished tray (cabinet.py) and this part is a
# thin trim ring whose funnel wall drops into the dish toward the 4:3
# aperture in the tray floor. Black M3 CSK screws through the flange into
# heat-set inserts in the shell's inner-wall pads.
BEZEL = {
    "flange_w": 316.0,         # trim ring: covers the 300x200 dish rim and
    "flange_h": 210.0,         #   stays inside the face's flat band
    "flange_r": 16.0,
    "flange_t": 2.5,           # proud on the face (the "small protrusion")
    "throat_top_w": 298.0,     # funnel opening at the flange (1 mm/side
    "throat_top_h": 198.0,     #   clearance to the dish walls)
    "throat_top_r": 12.0,
    "throat_bot_w": 257.0,     # funnel bottom — just over the 253x190 floor
    "throat_bot_h": 194.0,     #   aperture so the floor edge stays hidden
    "throat_bot_r": 10.0,
    "throat_depth": 11.0,      # into the 12 mm dish (1 mm floor clearance)
    "throat_wall": 2.0,
    "rim_fillet": 0.8,         # round on the visible flange rims
    "mount_hole_dia": 3.4,     # M3 clearance through the flange
    "countersink_dia": 6.4,    # M3 flat-head, 90 deg, on the FRONT face
    "countersink_depth": 1.8,
}


def crt_bezel():
    """CRT funnel insert: trim ring + inward-narrowing funnel, black PETG.

    Drops into the shell's dished tray from the front; the flange stands
    ~2.5 mm proud on the face and the funnel narrows toward the tray-floor
    aperture, so the screen reads sunk behind a CRT frame. Frame: sketch in
    XY (X across, Y up-slope), +Z toward the viewer; the flange rear (z=0)
    sits flush on the shell face and the funnel extends to z=-throat_depth.
    Mounted in assembly with face * Rot(90, 0, 0).
    """
    p = CAB
    b = BEZEL
    with BuildPart() as bp:
        # trim ring: flange plate minus the funnel opening
        with BuildSketch():
            RectangleRounded(b["flange_w"], b["flange_h"], b["flange_r"])
            RectangleRounded(
                b["throat_top_w"], b["throat_top_h"], b["throat_top_r"],
                mode=Mode.SUBTRACT,
            )
        extrude(amount=b["flange_t"])
        # funnel wall: outer loft minus inner loft, going into the dish.
        # Top sketches sit 0.5 mm INSIDE the flange plate and the outer top
        # is 1 mm oversize, so the funnel fuses to the flange (coplanar
        # contact would split the part into two bodies).
        with BuildSketch(Plane.XY.offset(0.5)):
            RectangleRounded(b["throat_top_w"] + 1.0, b["throat_top_h"] + 1.0,
                             b["throat_top_r"] + 0.5)
        with BuildSketch(Plane.XY.offset(-b["throat_depth"])):
            RectangleRounded(
                b["throat_bot_w"] + 2 * b["throat_wall"],
                b["throat_bot_h"] + 2 * b["throat_wall"],
                b["throat_bot_r"] + b["throat_wall"],
            )
        loft()
        with BuildSketch(Plane.XY.offset(0.5)):
            RectangleRounded(
                b["throat_top_w"] - 2 * b["throat_wall"],
                b["throat_top_h"] - 2 * b["throat_wall"],
                b["throat_top_r"],
            )
        with BuildSketch(Plane.XY.offset(-b["throat_depth"])):
            RectangleRounded(b["throat_bot_w"], b["throat_bot_h"],
                             b["throat_bot_r"])
        loft(mode=Mode.SUBTRACT)
    bezel = bp.part
    # round the visible front rims (outer flange edge + opening edge)
    ft = b["flange_t"]
    rim = bezel.edges().filter_by(
        lambda e: abs(e.center().Z - ft) < 0.6
        and (abs(e.center().X) > 140.0 or abs(e.center().Y) > 95.0)
    )
    try:
        bezel = bezel.fillet(b["rim_fillet"], rim)
    except Exception as exc:
        print(f"  ! bezel rim fillet skipped: {exc}")
    # M3 clearance + countersink through the flange (front face), 4 corners
    for mx, my in ((-p["bezel_mount_x"], -p["bezel_mount_z"]),
                   (-p["bezel_mount_x"], p["bezel_mount_z"]),
                   (p["bezel_mount_x"], -p["bezel_mount_z"]),
                   (p["bezel_mount_x"], p["bezel_mount_z"])):
        bezel -= Pos(mx, my, ft / 2) * Cylinder(
            radius=b["mount_hole_dia"] / 2, height=ft + 2
        )
        bezel -= Pos(mx, my, ft - b["countersink_depth"] / 2 + 0.1) * Cone(
            bottom_radius=b["mount_hole_dia"] / 2,
            top_radius=b["countersink_dia"] / 2,
            height=b["countersink_depth"] + 0.2,
        )
    return bezel



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


def _probe_mat(solid, x, y, z):
    inter = solid & Pos(x, y, z) * Sphere(0.05)
    return bool(inter) and sum(s.volume for s in inter.solids()) > 0


def _wall_face_y(solid, x, z, pick):
    """Inner-face y of the rear (pick=max) or front (pick=min) wall at
    (x, z): profile estimate refined by probing the real solid. Slanted-corner
    blends (neck, chin) pull the actual wall in a couple mm from the polyline
    offset, which floated joint blocks when split_vertical was enabled."""
    est = _wall_y(z, pick) + (-CAB["wall"] if pick is max else CAB["wall"])
    rng = [est - 4.0 + i * 0.5 for i in range(17)]
    if pick is min:  # front wall: scan from the cavity (higher y) downward
        rng = rng[::-1]
    prev = False
    for y in rng:
        hit = _probe_mat(solid, x, y, z)
        if hit and not prev:
            return y
        prev = hit
    return est  # fallback; the bodies==1 check catches a floating block


def rear_joint_y(solid, x, z):
    """Seam-joint block center y fusing 0.5 mm into the rear wall at (x, z)."""
    return _wall_face_y(solid, x, z, max) + 0.5 - SPLIT["joint_block"] / 2


def front_joint_y(solid, x, z):
    """Same against the front (display-face) wall."""
    return _wall_face_y(solid, x, z, min) - 0.5 + SPLIT["joint_block"] / 2


def _resolve(positions, solid, z=None):
    """Fill in auto entries: "rear"/"front" (horizontal seams) or None
    (vertical seams) derive y from the probed wall face."""
    out = []
    for a, b in positions:
        if z is not None:  # horizontal seam, (x, y)
            y = (rear_joint_y(solid, a, z) if b == "rear"
                 else front_joint_y(solid, a, z) if b == "front" else b)
            out.append((a, y))
        else:              # vertical seam, (y, z)
            y = rear_joint_y(solid, 0, b) if a is None else a
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


def y_seam_joints(front, back, y_split, positions):
    """Boss-block joints across the y=y_split seam of the base, screws
    horizontal along Y: front part gets the heat-set-insert pilot, back part
    the clearance hole (screws driven from the rear hatch opening).
    positions are (x, z) with signed x (call once per L/R half)."""
    p = SPLIT
    b, d = p["joint_block"], p["joint_depth"]
    for x, z in positions:
        front += Pos(x, y_split - d / 2, z) * Box(b, d, b)
        back += Pos(x, y_split + d / 2, z) * Box(b, d, b)
        front -= Pos(x, y_split - p["insert_hole_depth"] / 2, z) * Rot(
            90, 0, 0
        ) * Cylinder(radius=p["insert_hole_dia"] / 2,
                     height=p["insert_hole_depth"])
        back -= Pos(x, y_split + d / 2, z) * Rot(90, 0, 0) * Cylinder(
            radius=p["screw_hole_dia"] / 2, height=d + 2
        )
    return front, back


def y_slice_box(y0, y1):
    return Pos(0, (y0 + y1) / 2, 200) * Box(
        CAB["cabinet_width"] + 100, y1 - y0, 600
    )


def build_parts():
    p = SPLIT
    solid = build_cabinet()
    zd, zh = p["split_z_deck"], p["split_z_hood"]
    w = CAB["cabinet_width"] / 2

    base = solid & slice_box(-10, zd, -w - 50, w + 50)
    mid = solid & slice_box(zd, zh, -w - 50, w + 50)
    hood = solid & slice_box(zh, CAB["cabinet_depth_base"] + 500, -w - 50, w + 50)

    base, mid = h_seam_joints(
        base, mid, zd, _resolve(p["deck_seam_joints"], solid, zd))
    mid, hood = h_seam_joints(
        mid, hood, zh, _resolve(p["hood_seam_joints"], solid, zh))

    layers = [("base", base), ("mid", mid), ("hood", hood)]
    v_joints = {
        "base": p["base_v_seam_joints"],
        "mid": p["mid_v_seam_joints"],
        "hood": p["hood_v_seam_joints"],
    }

    parts = {}
    yb = p["split_y_base"]
    depth = CAB["cabinet_depth_base"]
    for name, layer in layers:
        if p["split_vertical"]:
            left = layer & slice_box(-50, 500, -w - 50, 0)
            right = layer & slice_box(-50, 500, 0, w + 50)
            left, right = v_seam_joints(left, right, _resolve(v_joints[name], solid))
            halves = [("l", -1, left), ("r", 1, right)]
        else:
            halves = [("", 0, layer)]
        for tag, sx, half in halves:
            suffix = f"_{tag}" if tag else ""
            if name == "base" and p["split_base_y"]:
                front = half & y_slice_box(-50, yb)
                back = half & y_slice_box(yb, depth + 50)
                front, back = y_seam_joints(
                    front, back, yb,
                    [(sx * ax, z) for ax, z in p["base_y_seam_joints"]],
                )
                parts[f"base_f{suffix}"] = front
                parts[f"base_b{suffix}"] = back
            else:
                parts[f"{name}{suffix}"] = half
    return parts, solid


# Print orientation per part (None = as modeled, floor/bed face already
# down). Exports are rotated into print orientation and dropped to z=0;
# assembly/exploded renders keep model orientation. Verified by
# printability.py: bed contact up, steep overhangs ~0.
ORIENT = {
    # base/mid parts print upright as modeled: the dish floor faces up,
    # its walls are <=15 deg overhangs, the tub exterior is hidden.
    "hood_l": (Rot(-78, 0, 0), "back wall down (wall leans 12 deg; one "
                               "hidden attic ceiling sags harmlessly)"),
    "hood_r": (Rot(-78, 0, 0), "back wall down (wall leans 12 deg; one "
                               "hidden attic ceiling sags harmlessly)"),
    "deck_l": (Rot(180, 0, 0), "show face down"),
    "deck_r": (Rot(180, 0, 0), "show face down"),
    "bezel_l": (Rot(180, 0, 0), "flange face down (visible funnel prints "
                                "up-facing; outer cone 25 deg overhang)"),
    "bezel_r": (Rot(180, 0, 0), "flange face down (visible funnel prints "
                                "up-facing; outer cone 25 deg overhang)"),
}


def _split_lr(part, clearance=0.2):
    """Split a too-wide flat part at x=0 for the 256 bed (butt seam, total
    gap = clearance). Each half keeps its own 2 corner mount screws."""
    bb = part.bounding_box()
    w = bb.max.X - bb.min.X + 20
    h = bb.max.Y - bb.min.Y + 20
    z0, z1 = bb.min.Z - 5, bb.max.Z + 5
    c = clearance / 2
    left = part & Pos(-w / 2 - c, 0, (z0 + z1) / 2) * Box(w, h, z1 - z0)
    right = part & Pos(w / 2 + c, 0, (z0 + z1) / 2) * Box(w, h, z1 - z0)
    return left, right


def print_oriented(name, part):
    entry = ORIENT.get(name)
    o = entry[0] * part if entry else part
    bb = o.bounding_box()
    return Pos(0, 0, -bb.min.Z) * o


# --- swappable deck panel (printed part, show face DOWN on the bed) ------
# Drops into the shell's deck opening (cabinet.py iter 36): flat skin with
# a waffle-rib underside so it prints perfectly flat and still spans the
# opening rigidly. Alternate control layouts = reprint this one flat part.
DP = {
    "clearance": 0.3,          # per-side fit clearance in the opening
    "thickness": 2.9,          # skin (3 mm seat - 0.1 flush clearance)
    "rib_h": 8.0,              # waffle rib height under the skin
    "rib_t": 3.0,
    "rib_pitch": 45.0,
    "rib_edge": 12.0,          # ribs stay this far inside the panel rim
    "mount_hole_dia": 3.4,     # M3 clearance
    "countersink_dia": 6.4,    # M3 flat-head, 90 deg, on the show face
    "countersink_depth": 1.6,
    "jlf_keepout": 55.0,       # half-width of the JLF plate rib keep-out
    "hole_keepout": 5.0,       # ribs stay this far from control hole rims
}


def _deck_frame():
    """(cos_s, cy, u_half, x0) of the deck opening's in-plane frame."""
    p = CAB
    cos_s = math.cos(math.radians(p["control_deck_slope_deg"]))
    y0, y1 = p["deck_panel_y0"], p["deck_panel_y1"]
    return cos_s, (y0 + y1) / 2, (y1 - y0) / (2 * cos_s), p["deck_panel_x"]


def _control_holes():
    """(x, u, r, kind) of every control hole in deck-panel local coords
    (x = world x, u = in-plane y along the deck). kind: 'plain' or 'well'."""
    p = CAB
    cos_s, cy, _, _ = _deck_frame()

    def u(y_world):
        return (y_world - cy) / cos_s

    holes = []
    for player in range(p["players"]):
        cluster_x = (player - (p["players"] - 1) / 2) * p["player_spacing"] \
            + p["cluster_offset_x"]
        jx, jy = cluster_x + p["joystick_offset_x"], p["joystick_offset_y"]
        holes.append((jx, u(jy), p["joystick_shaft_hole_dia"] / 2, "plain"))
        for sx in (-1, 1):
            for sy in (-1, 1):
                my = jy + sy * p["jlf_mount_spacing_y"] / 2
                holes.append((jx + sx * p["jlf_mount_spacing_x"] / 2,
                              u(my), p["jlf_mount_hole_dia"] / 2, "plain"))
        sec_center = p["button_grid_offset_x"] \
            + p["secondary_pitch"] * (p["secondary_count"] - 1) / 2
        for i in range(p["secondary_count"]):
            bx = cluster_x + p["button_grid_offset_x"] + i * p["secondary_pitch"]
            holes.append((bx, u(p["secondary_row_y"]),
                          p["secondary_hole_dia"] / 2, "plain"))
        for i in range(p["primary_count"]):
            bx = cluster_x + sec_center \
                + (i - (p["primary_count"] - 1) / 2) * p["primary_pitch"]
            holes.append((bx, u(p["primary_row_y"]),
                          p["primary_hole_dia"] / 2, "well"))
    for sx in (-1, 1):
        holes.append((sx * p["option_offset_x"], u(p["option_offset_y"]),
                      p["option_hole_dia"] / 2, "plain"))
    return holes


def deck_panel(side):
    """One deck half ('l'/'r'): skin + waffle ribs, skin top at local z=0.

    All controls of the 1P cluster live on deck_r / deck_l per the param
    layout; the seam at x=0 splits the panel so each half prints flat."""
    p = CAB
    d = DP
    clr, t = d["clearance"], d["thickness"]
    cos_s, cy, u_half, x0 = _deck_frame()
    xa = clr if side == "r" else -x0 + clr
    xb = x0 - clr if side == "r" else -clr
    xc, xw = (xa + xb) / 2, xb - xa
    uh = u_half - clr

    with BuildPart() as bp:
        with BuildSketch():
            with Locations((xc, 0)):
                RectangleRounded(xw, 2 * uh, p["deck_panel_radius"])
        extrude(amount=-t)  # skin: z in [-t, 0], show face at z=0

    panel = bp.part
    rh, rt = d["rib_h"], d["rib_t"]
    re_ = d["rib_edge"]
    rib_z = -t - rh / 2 + 0.5
    ribs = None

    def _add_rib(box):
        nonlocal ribs
        ribs = box if ribs is None else ribs + box

    # waffle grid: ribs along u at each x station, ribs along x at each u
    xs = []
    xv = xa + re_ + d["rib_pitch"] / 2
    while xv < xb - re_:
        xs.append(xv)
        xv += d["rib_pitch"]
    us = []
    uv = -uh + re_ + d["rib_pitch"] / 2
    while uv < uh - re_:
        us.append(uv)
        uv += d["rib_pitch"]
    for xv2 in xs:
        _add_rib(Pos(xv2, 0, rib_z) * Box(rt, 2 * (uh - re_), rh))
    for uv2 in us:
        _add_rib(Pos(xc, uv2, rib_z) * Box(xw - 2 * re_, rt, rh))

    # rib keep-outs: control holes + the JLF plate/nut zone
    holes = _control_holes()
    for hx, hu, hr, kind in holes:
        if not (xa - 1 < hx < xb + 1):
            continue
        ribs -= Pos(hx, hu, rib_z) * Cylinder(
            radius=hr + d["hole_keepout"], height=rh + 3
        )
    jx = p["cluster_offset_x"] + p["joystick_offset_x"]
    ju = (p["joystick_offset_y"] - cy) / cos_s
    ribs -= Pos(jx, ju, rib_z) * Box(2 * d["jlf_keepout"], 80.0, rh + 3)
    panel += ribs

    # control holes through the skin (+ wells and rim chamfers on top)
    cham = p["hole_chamfer"]
    for hx, hu, hr, kind in holes:
        if not (xa - 1 < hx < xb + 1):
            continue
        panel -= Pos(hx, hu, -t / 2) * Cylinder(radius=hr, height=t + 2)
        if kind == "well":
            wr = p["primary_recess_dia"] / 2
            wd = p["primary_recess_depth"]
            panel -= Pos(hx, hu, -wd / 2 + 0.1) * Cylinder(
                radius=wr, height=wd + 0.2
            )
            panel -= Pos(hx, hu, 0.2 - cham / 2) * Cone(
                bottom_radius=wr, top_radius=wr + cham + 0.4,
                height=cham + 0.4,
            )
        else:
            panel -= Pos(hx, hu, 0.2 - cham / 2) * Cone(
                bottom_radius=hr, top_radius=hr + cham + 0.4,
                height=cham + 0.4,
            )

    # M3 clearance + countersink at the shell's screw bosses
    for sx2, sy2 in deck_screw_points(p):
        if not (xa - 1 < sx2 < xb + 1):
            continue
        u2 = (sy2 - cy) / cos_s
        panel -= Pos(sx2, u2, -t / 2) * Cylinder(
            radius=d["mount_hole_dia"] / 2, height=t + 2
        )
        panel -= Pos(sx2, u2, -d["countersink_depth"] / 2 + 0.1) * Cone(
            bottom_radius=d["mount_hole_dia"] / 2,
            top_radius=d["countersink_dia"] / 2,
            height=d["countersink_depth"] + 0.2,
        )
    return panel


def hatch_cover():
    """Rear service-hatch door: flat plate, 4x M3 CSK into the shell's
    hatch bosses. Print flat; countersinks on the outer (+Z) face."""
    p = CAB
    hw, hh = p["hatch_w"], p["hatch_h"]
    bi = p["hatch_boss_offset"]
    w = hw + 2 * (bi + 6.0)
    h = hh + 2 * (bi + 6.0)
    hx, hy = hw / 2 + bi, hh / 2 + bi
    with BuildPart() as bp:
        with BuildSketch():
            RectangleRounded(w, h, 4.0)
        extrude(amount=2.5)
    cover = bp.part
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx2, cy2 = sx * hx, sy * hy
            cover -= Pos(cx2, cy2, 1.25) * Cylinder(radius=1.7, height=4.5)
            cover -= Pos(cx2, cy2, 2.5 - 0.8) * Cone(
                bottom_radius=1.7, top_radius=3.2, height=1.9
            )
    return cover


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
    for stale in list(PARTS_DIR.glob("*.step")) + list(PARTS_DIR.glob("*.stl")):
        stale.unlink()  # drop exports from older split schemes
    parts, solid = build_parts()

    bed = SPLIT["print_bed"]
    for name, part in parts.items():
        valid = part.is_valid
        bodies = len(part.solids())
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        fits = all(d <= bed for d in dims)
        note = ORIENT.get(name, (None, "as modeled"))[1]
        print(
            f"{name:8s} valid={valid} bodies={bodies}  dims={dims[0]:.0f}x"
            f"{dims[1]:.0f}x{dims[2]:.0f} mm  fits {bed:.0f} bed: {fits}"
            f"  [{note}]"
        )
        if not valid or bodies != 1:
            raise RuntimeError(f"part {name}: valid={valid}, bodies={bodies}")
        oriented = print_oriented(name, part)
        export_step(oriented, str(PARTS_DIR / f"{name}.step"))
        export_stl(oriented, str(PARTS_DIR / f"{name}.stl"))

    check_collisions(parts)

    # independent printed parts: retainer + bezel (both split L/R for the
    # bed — butt seam, 2 corner screws per half), deck panels, hatch cover
    ret_l, ret_r = _split_lr(retainer_frame())
    bez_l, bez_r = _split_lr(crt_bezel())
    extras = {
        "retainer_l": ret_l,
        "retainer_r": ret_r,
        "bezel_l": bez_l,
        "bezel_r": bez_r,
        "deck_l": deck_panel("l"),
        "deck_r": deck_panel("r"),
        "hatch_cover": hatch_cover(),
    }
    for name, part in extras.items():
        valid, bodies = part.is_valid, len(part.solids())
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        fits = all(d <= bed for d in dims)
        note = ORIENT.get(name, (None, "as modeled"))[1]
        print(f"{name} valid={valid} bodies={bodies}  dims={dims[0]:.0f}x"
              f"{dims[1]:.0f}x{dims[2]:.0f}  fits: {fits}  [{note}]")
        if not valid or bodies != 1:
            raise RuntimeError(f"{name}: valid={valid}, bodies={bodies}")
        oriented = print_oriented(name, part)
        export_step(oriented, str(PARTS_DIR / f"{name}.step"))
        export_stl(oriented, str(PARTS_DIR / f"{name}.stl"))

    # deck panels must clear the shell opening (0.3 mm/side by design)
    for side in ("l", "r"):
        panel = extras[f"deck_{side}"]
        _, _, info = side_profile(CAB)
        cos_s, cy, _, _ = _deck_frame()
        s_slope = math.radians(CAB["control_deck_slope_deg"])
        deck_plane = Plane(
            origin=(0, cy, info["deck_z"](cy)),
            x_dir=(1, 0, 0),
            z_dir=(0, -math.sin(s_slope), math.cos(s_slope)),
        )
        inter = solid & (deck_plane * panel)
        vol = sum(s.volume for s in inter.solids()) if inter else 0.0
        flag = "  <-- COLLISION" if vol > 1.0 else ""
        print(f"deck_{side} x shell: {vol:.3f} mm^3{flag}")

    # exploded view: layers separated in Z, halves in X, base quarters in Y
    shades = [(0.87, 0.85, 0.80), (0.80, 0.77, 0.72), (0.72, 0.69, 0.64)]
    order = {"base": 0, "mid": 1, "hood": 2}
    exploded = []
    for name, part in parts.items():
        layer_i = order[name.split("_")[0]]
        dx = -60 if name.endswith("_l") else (60 if name.endswith("_r") else 0)
        dy = -70 if "_f_" in name else (70 if "_b_" in name else 0)
        dz = 70 * layer_i
        exploded.append((Pos(dx, dy, dz) * part, shades[layer_i]))
    # deck panels hover over their opening
    _, _, info = side_profile(CAB)
    cos_s, cy, _, _ = _deck_frame()
    s_slope = math.radians(CAB["control_deck_slope_deg"])
    deck_plane = Plane(
        origin=(0, cy, info["deck_z"](cy)),
        x_dir=(1, 0, 0),
        z_dir=(0, -math.sin(s_slope), math.cos(s_slope)),
    )
    for side, panel in (("l", extras["deck_l"]), ("r", extras["deck_r"])):
        dx = -60 if side == "l" else 60
        exploded.append(
            (Pos(dx, 0, 50) * deck_plane * panel, (0.30, 0.30, 0.33))
        )
    render_parts(
        exploded, OUT_DIR, prefix="exploded", size=1200,
        views={"iso": (25, -60, None), "front": (0, -90, None)},
    )
    print(f"exported {len(parts)} shell parts + {len(extras)} extras"
          f" + exploded to {PARTS_DIR}")


if __name__ == "__main__":
    main()
