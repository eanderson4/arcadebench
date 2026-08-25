"""ArcadeBench panelized decomposition — the cabinet as flat panels + sides.

Same outer profile as the monocoque (cabinet.side_profile), decomposed into:
  - 2 side plates carrying the full rounded silhouette, with 90 deg return
    flanges bent in along every wrap segment — THE SIDES ARE THE STRUCTURE
    (chassis brief 4.5: 5052 sides with return flanges carry all vertical
    and torsional rigidity; the chassis only mounts equipment)
  - 10 flat wrap panels: bottom, back, taper, neck, top, marquee, lip
    (hood floor), face (window), deck (controls), nose fascia — each screws
    into M3 inserts in the side-plate flanges (no corner cleats)

This is both the flat-pack print path and the sheet-aluminum path (the wrap
panels are the brake/flat patterns; the flanges take rivnuts in metal).

Run:  hardware/.venv/bin/python hardware/panels.py
Out:  hardware/out/panels/*.step|.stl + out/panels_exploded.png +
      fit report vs the print bed + sheet-mass estimate
"""

import math
from pathlib import Path

from build123d import (
    Box,
    BuildLine,
    BuildSketch,
    Cylinder,
    GeomType,
    Plane,
    Polyline,
    Pos,
    Rectangle,
    Rot,
    export_step,
    export_stl,
    extrude,
    fillet,
    make_face,
)

from cabinet import OUT_DIR, PARAMS as CAB, cheek_profile, side_profile
from render import render_parts

PANELS_DIR = OUT_DIR / "panels"

PP = {
    "panel_thickness": 3.0,        # == wall; panels span between side plates
    "panel_inset": 1.0,            # mm panels step in from side-plate edges
                                   # (consistent dark reveal, not a flush seam)
    # --- side-plate return flanges (the structure) --------------------------
    "flange_width": 20.0,          # mm the flange returns inward (in X)
    "flange_thickness": 3.0,       # == panel thickness (2 mm in 5052)
    "flange_bend_r": 2.0,          # inside bend radius (~= stock thickness)
    "screw_end_inset": 15.0,       # panel screw stations: ends + mid-span
    "insert_hole_dia": 4.2,        # M3 heat-set insert pilot (rivnut in metal)
    "insert_hole_depth": 7.0,
    "screw_hole_dia": 3.4,         # M3 clearance through the wrap panels
    "print_bed": 360.0,
    # --- stock options for the mass report ---------------------------------
    "alu_thickness": 2.0,          # mm 5052-H32 sheet (bend r ~= thickness)
    "alu_density": 2.70e-3,        # g/mm^3
    "print_density": 1.27e-3,      # g/mm^3 PETG
}

# panel names in profile order (vertex i -> vertex i+1); the tapered-neck
# profile (10 vertices) adds "taper" + "neck" between back and top
def panel_names(profile):
    names = ["bottom", "back", "top", "marquee", "lip", "face", "deck", "nose"]
    if len(profile) == 10:
        names = names[:2] + ["taper", "neck"] + names[2:]
    assert len(names) == len(profile)
    return names


def seg_data(profile):
    """Per segment: (A, B, length, dir e, inward normal n).

    Interior side comes from the polygon winding (the centroid test fails on
    concave profiles — the centroid sits in the hood/deck notch).
    """
    area2 = 0.0
    n = len(profile)
    for i in range(n):
        y0, z0 = profile[i]
        y1, z1 = profile[(i + 1) % n]
        area2 += y0 * z1 - y1 * z0
    left_is_in = area2 > 0  # CCW polygon => interior is left of each edge

    segs = []
    for i in range(n):
        a = profile[i]
        b = profile[(i + 1) % n]
        d = (b[0] - a[0], b[1] - a[1])
        length = math.hypot(*d)
        e = (d[0] / length, d[1] / length)
        n_in = (-e[1], e[0]) if left_is_in else (e[1], -e[0])
        segs.append((a, b, length, e, n_in))
    return segs


def place_panel(local_part, a, b, e, n_in, t):
    """Panel built in local frame (X width, Y along segment, Z thickness);
    place so the OUTER surface lies on the profile line."""
    theta = math.degrees(math.atan2(e[1], e[0]))
    mid_y, mid_z = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    cy = mid_y + n_in[0] * t / 2
    cz = mid_z + n_in[1] * t / 2
    return Pos(0, cy, cz) * Rot(theta, 0, 0) * local_part


def panel_features(name, panel, length):
    """Cut each panel's features in its LOCAL frame (x width, y along the
    segment from the first vertex, centered; z through the panel)."""
    p = CAB
    t = PP["panel_thickness"]
    cut_h = t + 2
    half = length / 2

    def hole(x, y_loc, dia):
        nonlocal panel
        panel -= Pos(x, y_loc, 0) * Cylinder(radius=dia / 2, height=cut_h)

    # screw clearances into the side-plate flanges: 3 stations along the
    # panel (ends + mid-span), on the flange centerline at both x extremes
    fx = CAB["cabinet_width"] / 2 - t - PP["flange_width"] / 2
    for sx in (-1, 1):
        for ey in (-half + PP["screw_end_inset"], 0.0, half - PP["screw_end_inset"]):
            hole(sx * fx, ey, PP["screw_hole_dia"])

    if name == "deck":
        # local y=0 is the segment midpoint and local +Y maps onto the
        # segment direction seam->nose (vertex A->B), i.e. toward the FRONT;
        # deck layout is measured from the front edge, so
        # local_y = half - layout_y  (verified by point-in-solid scan)
        for player in range(p["players"]):
            cluster_x = (player - (p["players"] - 1) / 2) * p["player_spacing"] \
                + p["cluster_offset_x"]
            jx = cluster_x + p["joystick_offset_x"]
            hole(jx, half - p["joystick_offset_y"], p["joystick_shaft_hole_dia"])
            for sx in (-1, 1):
                for sy in (-1, 1):
                    hole(
                        jx + sx * p["jlf_mount_spacing_x"] / 2,
                        half - (p["joystick_offset_y"]
                                + sy * p["jlf_mount_spacing_y"] / 2),
                        p["jlf_mount_hole_dia"],
                    )
            for i in range(p["secondary_count"]):
                hole(
                    cluster_x + p["button_grid_offset_x"] + i * p["secondary_pitch"],
                    half - p["secondary_row_y"],
                    p["secondary_hole_dia"],
                )
            for i in range(p["primary_count"]):
                hole(
                    cluster_x + p["primary_center_x"]
                    + (i - (p["primary_count"] - 1) / 2) * p["primary_pitch"],
                    half - p["primary_row_y"],
                    p["primary_hole_dia"],
                )
        for sx in (-1, 1):
            hole(sx * p["option_offset_x"], half - p["option_offset_y"],
                 p["option_hole_dia"])
        # control plate recess on the outer face (local -z), rounded corners
        rec = p["control_plate_recess"]
        with BuildSketch(
            Pos(0, half - p["control_plate_center_y"], -t / 2 + rec) * Plane.XY
        ) as plate_sk:
            Rectangle(p["control_plate_w"], p["control_plate_d"])
            fillet(plate_sk.vertices(), radius=p["control_plate_radius"])
        panel -= extrude(plate_sk.sketch, amount=-(rec + 0.3))

    elif name == "face":
        # window, centered on the face, rounded corners
        cutter = Pos(0, 0, 0) * Box(p["glass_opening_w"], p["glass_opening_h"], cut_h)
        short = cutter.edges().filter_by(lambda ed: ed.length < cut_h + 1)
        panel -= cutter.fillet(p["window_corner_radius"], short)
        # chin datum groove on the outer face; the face segment runs
        # face_top -> seam, so the groove sits just past local -half
        gd, gw = p["chin_groove_depth"], p["chin_groove_width"]
        panel -= Pos(
            0, -half + p["chin_groove_drop"], -(t / 2 - gd / 2 + 0.1)
        ) * Box(p["cabinet_width"] + 1, gw, gd + 0.2)

    elif name == "lip":
        # hood floor: speaker slots firing down at the player; the lip panel
        # carries the exposed strip (chin -> face top). Capsule slots
        # (radiused ends) match the cabinet shell.
        sl, sw = p["hood_speaker_slot_len"], p["hood_speaker_slot_w"]
        for sx2 in (-1, 1):
            gx = sx2 * p["hood_speaker_spacing"] / 2
            for i in range(p["hood_speaker_rows"]):
                # slots run across X, rows along the floor; the slot center
                # is hood_speaker_offset from the chin = -half + offset
                ly = -half + p["hood_speaker_offset"] + (
                    i - (p["hood_speaker_rows"] - 1) / 2
                ) * p["hood_speaker_pitch"]
                panel -= Pos(gx, ly, 0) * Box(sl - sw, sw, cut_h)
                for sx3 in (-1, 1):
                    panel -= Pos(gx + sx3 * (sl - sw) / 2, ly, 0) * Cylinder(
                        sw / 2, cut_h
                    )

    elif name == "marquee":
        # nameplate recess + magnet pockets; local +Z maps to the INWARD normal
        # (place_panel), so outer-face features sit at negative local z
        rec = p["nameplate_recess"]
        panel -= Pos(0, 0, -(t / 2 - rec / 2 + 0.1)) * Box(
            p["nameplate_w"], p["nameplate_h"], rec + 0.2
        )
        for sx in (-1, 1):
            for sz in (-1, 1):
                panel -= Pos(
                    sx * p["magnet_inset_x"], sz * p["magnet_inset_z"],
                    -(t / 2 - p["magnet_depth"] / 2 + 0.1),
                ) * Cylinder(radius=p["magnet_dia"] / 2, height=p["magnet_depth"] + 0.2)

    elif name == "back":
        # layout z measured from the bottom; local y = z - half
        hole(p["power_switch_xz"][0], p["power_switch_xz"][1] - half,
             p["power_switch_hole_dia"])
        hole(p["dc_jack_xz"][0], p["dc_jack_xz"][1] - half, p["dc_jack_hole_dia"])
        panel -= Pos(p["usbc_xz"][0], p["usbc_xz"][1] - half, 0) * Box(
            p["usbc_slot_w"], p["usbc_slot_h"], cut_h
        )
        # LED admin buttons on the same row
        for ax in p["admin_button_xs"]:
            hole(ax, p["admin_button_z"] - half, p["admin_button_hole_dia"])
        # service hatch + door screw clearances (outside the opening edge)
        hw, hh = p["hatch_w"], p["hatch_h"]
        panel -= Pos(0, p["hatch_z"] - half, 0) * Box(hw, hh, cut_h)
        bi = p["hatch_boss_offset"]
        for sx4 in (-1, 1):
            for sz4 in (-1, 1):
                hole(sx4 * (hw / 2 + bi),
                     p["hatch_z"] + sz4 * (hh / 2 + bi) - half,
                     PP["screw_hole_dia"])

    elif name == "bottom":
        fx = p["cabinet_width"] / 2 - 40.0
        for sx in (-1, 1):
            for fy in (40.0, p["cabinet_depth_base"] - 40.0):
                hole(sx * fx, fy - half, 4.5)  # foot screw, M4 clearance

    return panel


def make_panel(name, a, b, length, e, n_in):
    t = PP["panel_thickness"]
    w = CAB["cabinet_width"] - 2 * t - 2 * PP["panel_inset"]
    panel = Box(w, length, t)
    panel = panel_features(name, panel, length)
    return place_panel(panel, a, b, e, n_in, t)


def make_side_plate(profile, radii, side, segs):
    """Full silhouette plate with 90 deg return flanges along every wrap
    segment — the sides ARE the structure (brief 4.5). The wrap panels
    rest on the flanges and screw into M3 inserts in the flange faces.

    Flanges follow the BASE profile segments (the wrap-panel lines), not
    the cheek outline: on the front matter the cheek stands proud of the
    base profile, so there the flange bends off a line inside the plate
    face. Plate corners stay SHARP by construction: the wrap panels span
    vertex to vertex, so rounding a plate corner would leave the panel
    ends overhanging. (Corner softness on a metal build is a fab-shop
    edge break, not modeled geometry.)"""
    t = PP["panel_thickness"]
    ft = PP["flange_thickness"]
    fw = PP["flange_width"]
    with BuildSketch(Plane.YZ) as sk:
        with BuildLine():
            Polyline(profile, close=True)
        make_face()
    plate = extrude(sk.sketch, amount=t / 2, both=True)

    # NOTE: the plate is built centered at X=0 and only moved to its world
    # x at the return — so flanges/pilots use plate-local x throughout.
    x_in = -side * t / 2                     # inner face (local)
    fx = -side * (t / 2 + fw / 2)            # flange centerline (local)
    bend_segs = []
    for a, b, length, e, n_in in segs:
        # flange band: just UNDER the wrap panel ([t, t+ft] along n_in)
        p1 = (a[0] + n_in[0] * t, a[1] + n_in[1] * t)
        p2 = (b[0] + n_in[0] * t, b[1] + n_in[1] * t)
        p3 = (b[0] + n_in[0] * (t + ft), b[1] + n_in[1] * (t + ft))
        p4 = (a[0] + n_in[0] * (t + ft), a[1] + n_in[1] * (t + ft))
        with BuildSketch(Plane.YZ) as fsk:
            with BuildLine():
                Polyline([p1, p2, p3, p4], close=True)
            make_face()
        # spans from 0.5 mm inside the plate to fw inward of its face
        plate += Pos(x_in - side * (fw / 2 - 0.25), 0, 0) * extrude(
            fsk.sketch, amount=(fw + 0.5) / 2, both=True
        )
        bend_segs.append((p1, p2))
        # M3 insert pilots in the flange face, matching the panel screws
        half = length / 2
        ang = math.degrees(math.atan2(n_in[1], n_in[0])) - 90  # cyl Z -> normal
        dc = t + PP["insert_hole_depth"] / 2
        for off in (-half + PP["screw_end_inset"], 0.0, half - PP["screw_end_inset"]):
            my = (a[0] + b[0]) / 2 + e[0] * off + n_in[0] * dc
            mz = (a[1] + b[1]) / 2 + e[1] * off + n_in[1] * dc
            plate -= Pos(fx, my, mz) * Rot(ang, 0, 0) * Cylinder(
                radius=PP["insert_hole_dia"] / 2,
                height=PP["insert_hole_depth"] + 1,
            )

    # round the bend lines (inside radius ~= stock thickness)
    def near_bend(edge):
        if edge.geom_type != GeomType.LINE:
            return False
        c = edge.center()
        if abs(c.X - x_in) > 0.7:
            return False
        for p1, p2 in bend_segs:
            d = (p2[0] - p1[0], p2[1] - p1[1])
            ln = math.hypot(*d)
            u = ((c.Y - p1[0]) * d[0] + (c.Z - p1[1]) * d[1]) / ln
            if u < -1 or u > ln + 1:
                continue
            py = p1[0] + d[0] * u / ln
            pz = p1[1] + d[1] * u / ln
            if math.hypot(c.Y - py, c.Z - pz) < 1.2:
                return True
        return False

    bends = plate.edges().filter_by(near_bend)
    try:
        plate = plate.fillet(PP["flange_bend_r"], bends)
    except Exception as exc:
        print(f"  ! side plate bend fillet skipped: {exc}")

    # side-vent gills (same raked hood-zone positions as the shell cheeks)
    p = CAB
    _, _, info = side_profile(p)
    t_rad = math.radians(p["display_tilt_deg"])
    sin_t, cos_t = math.sin(t_rad), math.cos(t_rad)
    vc_y = info["mrq_y"] + cos_t * p["side_vent_center_u"]
    vc_z = info["mrq_z"] - sin_t * p["side_vent_center_u"]
    svw, svl = p["side_vent_slot_w"], p["side_vent_slot_len"]
    for i in range(p["side_vent_count"]):
        drop = p["side_vent_drop"] + i * p["side_vent_pitch"]
        vy = vc_y - sin_t * drop
        vz = vc_z - cos_t * drop
        slot = Pos(0, vy, vz) * Rot(-p["display_tilt_deg"], 0, 0)
        plate -= slot * Box(t + 2, svl - svw, svw)
        for sy3 in (-1, 1):
            plate -= slot * Pos(0, sy3 * (svl - svw) / 2, 0) * Rot(
                0, 90, 0
            ) * Cylinder(radius=svw / 2, height=t + 2)
    x_off = CAB["cabinet_width"] / 2 - t / 2
    return Pos(side * x_off, 0, 0) * plate


def main():
    PANELS_DIR.mkdir(parents=True, exist_ok=True)
    profile, radii, info = side_profile(CAB)
    segs = seg_data(profile)
    names = panel_names(profile)
    # side plates carry the cheek outline: the uniform proud buffer around
    # the front matter, identical to the monocoque cheeks
    side_pts, side_radii = cheek_profile(CAB)
    t = PP["panel_thickness"]

    parts = {}
    panel_shapes = {}
    for i, name in enumerate(names):
        a, b, length, e, n_in = segs[i]
        panel = make_panel(name, a, b, length, e, n_in)
        parts[f"panel_{name}"] = panel
        panel_shapes[name] = (panel, n_in)

    for side, sname in ((-1, "l"), (1, "r")):
        parts[f"side_{sname}"] = make_side_plate(side_pts, side_radii, side, segs)

    # --- deck hole-position guard (a y-mirror bug slipped through the
    # visuals once; verify holes land at layout positions, world coords) ---
    from build123d import Vector

    deck = parts["panel_deck"]
    deck_z = info["deck_z"]
    expected, negatives = [], []
    for player in range(CAB["players"]):
        cx = (player - (CAB["players"] - 1) / 2) * CAB["player_spacing"] \
            + CAB["cluster_offset_x"]
        expected.append((cx + CAB["joystick_offset_x"], CAB["joystick_offset_y"]))
        # first primary center (primaries straddle the secondary span center)
        expected.append((
            cx + CAB["button_grid_offset_x"] + CAB["secondary_pitch"] * 1.5
            - CAB["primary_pitch"] / 2,
            CAB["primary_row_y"],
        ))
    expected.append((CAB["option_offset_x"], CAB["option_offset_y"]))
    negatives.append((0.0, 20.0))  # wrist rest: no hole
    fails = []
    for x, ly in expected + negatives:
        want = (x, ly) in expected
        got = not deck.is_inside(Vector(x, ly, deck_z(ly) - 1.5))
        if got != want:
            fails.append((x, ly, want, got))
    if fails:
        raise RuntimeError(f"deck hole guard FAILED: {fails}")
    print(f"deck hole guard: {len(expected)} holes + "
          f"{len(negatives)} negative checks OK")

    bed = PP["print_bed"]
    print(f"{'part':14s} {'valid':6s} dims (mm)                 fits {bed:.0f}")
    for name, part in parts.items():
        ok = part.is_valid and len(part.solids()) == 1
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        fits = all(d <= bed for d in dims)
        print(
            f"{name:14s} {str(ok):6s} {dims[0]:6.0f}x{dims[1]:4.0f}x{dims[2]:4.0f}"
            f"             {fits}"
        )
        export_step(part, str(PANELS_DIR / f"{name}.step"))
        export_stl(part, str(PANELS_DIR / f"{name}.stl"))

    # --- mass report: sheet area x stock thickness x density ---------------
    print("\nmass estimate (panels + sides incl. flanges, no hardware):")
    total_alu = total_petg = 0.0
    for name, part in parts.items():
        area_m2 = part.area / 1e6 / 2  # area counts both faces; use one side
        alu_g = (
            part.volume / PP["panel_thickness"]
        ) * PP["alu_thickness"] * PP["alu_density"]
        petg_g = part.volume * PP["print_density"]
        total_alu += alu_g
        total_petg += petg_g
        print(f"  {name:14s} area {area_m2 * 1e4:7.0f} cm^2  alu {alu_g:6.0f} g  petg {petg_g:6.0f} g")
    print(f"  {'TOTAL':14s} {'':19s} alu {total_alu:6.0f} g  petg {total_petg:6.0f} g")

    # exploded: panels pushed along their normals, sides out in X
    exploded = []
    for i, name in enumerate(names):
        a, b, length, e, n_in = segs[i]
        off = 45
        exploded.append((
            Pos(0, -n_in[0] * off, -n_in[1] * off) * parts[f"panel_{name}"],
            (0.87, 0.85, 0.80),
        ))
    exploded.append((Pos(-60, 0, 0) * parts["side_l"], (0.80, 0.77, 0.72)))
    exploded.append((Pos(60, 0, 0) * parts["side_r"], (0.80, 0.77, 0.72)))
    render_parts(
        exploded, OUT_DIR, prefix="panels_exploded", size=1200,
        views={"iso": (25, -60, None)},
    )
    print(f"exported {len(parts)} parts + exploded to {PANELS_DIR}")


if __name__ == "__main__":
    main()
