"""ArcadeBench panelized decomposition — the cabinet as flat panels + cleats.

Same outer profile as the monocoque (cabinet.side_profile), decomposed into:
  - 2 side plates carrying the full rounded silhouette
  - 8 flat wrap panels: bottom, back, top, marquee, lip (hood floor),
    face (window), deck (controls), nose fascia
  - 8 corner cleat gussets with M3 insert pilots on both panel faces

This is both the flat-pack print path and the sheet-aluminum path (the wrap
panels are the brake/flat patterns; the cleats become bent flanges/rivnuts).

Run:  hardware/.venv/bin/python hardware/panels.py
Out:  hardware/out/panels/*.step|.stl + out/panels_exploded.png +
      out/panels_flat.png + fit report vs the print bed
"""

import math
from pathlib import Path

from build123d import (
    Axis,
    Box,
    BuildLine,
    BuildSketch,
    Cylinder,
    Plane,
    Polyline,
    Pos,
    Rot,
    export_step,
    export_stl,
    extrude,
    fillet,
    make_face,
)

from cabinet import OUT_DIR, PARAMS as CAB, side_profile
from render import render_parts

PANELS_DIR = OUT_DIR / "panels"

PP = {
    "panel_thickness": 3.0,        # == wall; panels span between side plates
    "cleat_land": 25.0,            # mm cleat face length along each panel
    "cleat_depth": 15.0,           # mm cleat wedge depth into the interior
    "cleat_max_span": 60.0,        # clamp for very convex corners
    "insert_hole_dia": 4.2,        # M3 heat-set insert pilot
    "insert_hole_depth": 7.0,
    "screw_hole_dia": 3.4,         # M3 clearance through panels/side plates
    "screw_x": (80.0, 200.0),      # +/- x positions for panel screws
    "print_bed": 360.0,
    # --- stock options for the mass report ---------------------------------
    "alu_thickness": 2.0,          # mm 5052-H32 sheet (bend r ~= thickness)
    "alu_density": 2.70e-3,        # g/mm^3
    "print_density": 1.27e-3,      # g/mm^3 PETG
}

# panel names in profile order (vertex i -> vertex i+1)
PANEL_NAMES = ["bottom", "back", "top", "marquee", "lip", "face", "deck", "nose"]


def unit(v):
    return (v[0] / math.hypot(*v), v[1] / math.hypot(*v))


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

    # screw clearances near both ends, matching the cleat pilots
    for sx in (-1, 1):
        for fx in PP["screw_x"]:
            for ey in (-1, 1):
                hole(sx * fx, ey * (half - PP["cleat_land"] / 2), PP["screw_hole_dia"])

    if name == "deck":
        # local y=0 is the segment midpoint; deck layout is measured from the
        # FRONT edge (vertex B), so local_y = layout_y - half
        half_gap = p["player_spacing"] / 2
        for player in range(p["players"]):
            cluster_x = -half_gap + player * p["player_spacing"]
            jx = cluster_x + p["joystick_offset_x"]
            hole(jx, p["joystick_offset_y"] - half, p["joystick_shaft_hole_dia"])
            for sx in (-1, 1):
                for sy in (-1, 1):
                    hole(
                        jx + sx * p["jlf_mount_spacing_x"] / 2,
                        p["joystick_offset_y"] + sy * p["jlf_mount_spacing_y"] / 2 - half,
                        p["jlf_mount_hole_dia"],
                    )
            for i in range(p["secondary_count"]):
                hole(
                    cluster_x + p["button_grid_offset_x"] + i * p["secondary_pitch"],
                    p["secondary_row_y"] - half,
                    p["secondary_hole_dia"],
                )
            for i in range(p["primary_count"]):
                hole(
                    cluster_x + p["button_grid_offset_x"]
                    + p["secondary_pitch"] * 1.5 + (i - 0.5) * p["primary_pitch"],
                    p["primary_row_y"] - half,
                    p["primary_hole_dia"],
                )
        for sx in (-1, 1):
            hole(sx * p["option_offset_x"], p["option_offset_y"] - half,
                 p["option_hole_dia"])

    elif name == "face":
        # window, centered on the face, rounded corners
        cutter = Pos(0, 0, 0) * Box(p["glass_opening_w"], p["glass_opening_h"], cut_h)
        short = cutter.edges().filter_by(lambda ed: ed.length < cut_h + 1)
        panel -= cutter.fillet(p["window_corner_radius"], short)

    elif name == "lip":
        # hood floor: speaker slots firing down at the player; the lip panel
        # carries the exposed strip (chin -> face top)
        for sx2 in (-1, 1):
            gx = sx2 * p["hood_speaker_spacing"] / 2
            for i in range(p["hood_speaker_rows"]):
                # slots run across X, rows along the floor; the slot center
                # is hood_speaker_offset from the chin = -half + offset
                ly = -half + p["hood_speaker_offset"] + (
                    i - (p["hood_speaker_rows"] - 1) / 2
                ) * p["hood_speaker_pitch"]
                panel -= Pos(gx, ly, 0) * Box(
                    p["hood_speaker_slot_len"], p["hood_speaker_slot_w"], cut_h
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

    elif name == "bottom":
        fx = p["cabinet_width"] / 2 - 40.0
        for sx in (-1, 1):
            for fy in (40.0, p["cabinet_depth_base"] - 40.0):
                hole(sx * fx, fy - half, 4.5)  # foot screw, M4 clearance

    return panel


def make_panel(name, a, b, length, e, n_in):
    t = PP["panel_thickness"]
    w = CAB["cabinet_width"] - 2 * t
    panel = Box(w, length, t)
    panel = panel_features(name, panel, length)
    return place_panel(panel, a, b, e, n_in, t)


def line_intersect(p1, d1, p2, d2):
    """Intersection of lines p1+t*d1, p2+s*d2 (2D, y/z tuples)."""
    det = d1[0] * (-d2[1]) - (-d2[0]) * d1[1]
    if abs(det) < 1e-9:
        return None
    rhs = (p2[0] - p1[0], p2[1] - p1[1])
    t = (rhs[0] * (-d2[1]) - (-d2[0]) * rhs[1]) / det
    return (p1[0] + t * d1[0], p1[1] + t * d1[1])


def make_cleat(v, seg_in, seg_out):
    """Corner gusset at vertex v. Cross-section (YZ): wedge between the two
    panels' inner surfaces, reaching cleat_depth into the interior."""
    t = PP["panel_thickness"]
    land = PP["cleat_land"]
    depth = PP["cleat_depth"]
    _, _, _, e1, n1 = seg_in   # e1 points INTO v
    _, _, _, e2, n2 = seg_out  # e2 points OUT of v

    o1 = (v[0] + n1[0] * t, v[1] + n1[1] * t)  # inner line origins
    o2 = (v[0] + n2[0] * t, v[1] + n2[1] * t)
    a = (o1[0] - e1[0] * land, o1[1] - e1[1] * land)
    b = (o2[0] + e2[0] * land, o2[1] + e2[1] * land)
    x = line_intersect(o1, e1, o2, e2)
    if x is None or math.hypot(x[0] - v[0], x[1] - v[1]) > PP["cleat_max_span"]:
        bis = unit((n1[0] + n2[0], n1[1] + n2[1]))
        x = (v[0] + bis[0] * (t + depth), v[1] + bis[1] * (t + depth))
    g = (x[0] + unit((n1[0] + n2[0], n1[1] + n2[1]))[0] * depth,
         x[1] + unit((n1[0] + n2[0], n1[1] + n2[1]))[1] * depth)

    w_half = (CAB["cabinet_width"] - 2 * t) / 2
    with BuildSketch(Plane.YZ) as sk:
        with BuildLine():
            Polyline([a, x, b, g], close=True)
        make_face()
    cleat = extrude(sk.sketch, amount=w_half, both=True)

    # insert pilots on both panel faces, along the face normals
    for e, n, sgn in ((e1, n1, -1), (e2, n2, 1)):
        fc = (o1[0] - e1[0] * land / 2, o1[1] - e1[1] * land / 2) if sgn < 0 else (
            o2[0] + e2[0] * land / 2, o2[1] + e2[1] * land / 2
        )
        # pilot center: half a depth into the cleat along the inward normal
        pc = (fc[0] + n[0] * PP["insert_hole_depth"] / 2,
              fc[1] + n[1] * PP["insert_hole_depth"] / 2)
        ang = math.degrees(math.atan2(n[1], n[0])) - 90  # cylinder Z -> normal
        for fx in PP["screw_x"]:
            for sx in (-1, 1):
                cleat -= Pos(sx * fx, pc[0], pc[1]) * Rot(ang, 0, 0) * Cylinder(
                    radius=PP["insert_hole_dia"] / 2,
                    height=PP["insert_hole_depth"] + 1,
                )

    # end-bolt pilots along X at the wedge centroid (into side plates)
    cy = (a[0] + x[0] + b[0] + g[0]) / 4
    cz = (a[1] + x[1] + b[1] + g[1]) / 4
    for sx in (-1, 1):
        cleat -= Pos(sx * (w_half - PP["insert_hole_depth"] / 2 + 0.5), cy, cz) * Rot(
            0, 90, 0
        ) * Cylinder(
            radius=PP["insert_hole_dia"] / 2, height=PP["insert_hole_depth"] + 1
        )
    return cleat, (cy, cz)


def make_side_plate(profile, radii, cleat_bolt_pts, side):
    """Full rounded silhouette plate, 3 mm, with clearance holes for the
    cleat end bolts."""
    t = PP["panel_thickness"]
    with BuildSketch(Plane.YZ) as sk:
        with BuildLine():
            Polyline(profile, close=True)
        make_face()
        for idx, radius in radii.items():
            if radius is None:
                continue
            y, z = profile[idx]
            vtx = sk.vertices().filter_by(
                lambda v, y=y, z=z: abs(v.Y - y) < 1.0 and abs(v.Z - z) < 1.0
            )
            fillet(vtx, radius=radius)
    plate = extrude(sk.sketch, amount=t / 2, both=True)
    for cy, cz in cleat_bolt_pts:
        plate -= Pos(0, cy, cz) * Rot(0, 90, 0) * Cylinder(
            radius=PP["screw_hole_dia"] / 2, height=t + 2
        )
    x_off = CAB["cabinet_width"] / 2 - t / 2
    return Pos(side * x_off, 0, 0) * plate


def main():
    PANELS_DIR.mkdir(parents=True, exist_ok=True)
    profile, radii, info = side_profile(CAB)
    segs = seg_data(profile)
    t = PP["panel_thickness"]

    parts = {}
    panel_shapes = {}
    for i, name in enumerate(PANEL_NAMES):
        a, b, length, e, n_in = segs[i]
        panel = make_panel(name, a, b, length, e, n_in)
        parts[f"panel_{name}"] = panel
        panel_shapes[name] = (panel, n_in)

    cleat_pts = []
    n = len(profile)
    for i in range(n):
        cleat, ctr = make_cleat(profile[i], segs[i - 1], segs[i])
        parts[f"cleat_{i}"] = cleat
        cleat_pts.append(ctr)

    for side, sname in ((-1, "l"), (1, "r")):
        parts[f"side_{sname}"] = make_side_plate(profile, radii, cleat_pts, side)

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
    print("\nmass estimate (panels + sides only, no cleats/hardware):")
    total_alu = total_petg = 0.0
    for name, part in parts.items():
        if name.startswith("cleat"):
            continue
        area_m2 = part.area / 1e6 / 2  # area counts both faces; use one side
        alu_g = (
            part.volume / PP["panel_thickness"]
        ) * PP["alu_thickness"] * PP["alu_density"]
        petg_g = part.volume * PP["print_density"]
        total_alu += alu_g
        total_petg += petg_g
        print(f"  {name:14s} area {area_m2 * 1e4:7.0f} cm^2  alu {alu_g:6.0f} g  petg {petg_g:6.0f} g")
    print(f"  {'TOTAL':14s} {'':19s} alu {total_alu:6.0f} g  petg {total_petg:6.0f} g")

    # exploded: panels/cleats pushed along their normals, sides out in X
    exploded = []
    for i, name in enumerate(PANEL_NAMES):
        a, b, length, e, n_in = segs[i]
        off = 45
        exploded.append((
            Pos(-n_in[0] * off, -n_in[1] * off, 0) * parts[f"panel_{name}"]
            if False else Pos(0, -n_in[0] * off, -n_in[1] * off) * parts[f"panel_{name}"],
            (0.87, 0.85, 0.80),
        ))
    for i in range(n):
        exploded.append((parts[f"cleat_{i}"], (0.55, 0.53, 0.50)))
    exploded.append((Pos(-60, 0, 0) * parts["side_l"], (0.80, 0.77, 0.72)))
    exploded.append((Pos(60, 0, 0) * parts["side_r"], (0.80, 0.77, 0.72)))
    render_parts(
        exploded, OUT_DIR, prefix="panels_exploded", size=1200,
        views={"iso": (25, -60, None)},
    )
    print(f"exported {len(parts)} parts + exploded to {PANELS_DIR}")


if __name__ == "__main__":
    main()
