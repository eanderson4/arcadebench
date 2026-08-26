"""ArcadeBench hybrid build — plywood sides + flat panels, printed curves.

A third build path next to the full-print fb split (parts.py) and the
sheet-aluminum flat-pack (panels.py): the structure and the flat wrap runs
are CUT WOOD (Baltic birch, jigsaw/CNC from the exported DXF templates) and
only the parts that need curves or precision are 3D printed.

  WOOD 12 mm:  side_l, side_r   — full cheek-profile silhouette (proud of
                                  the front matter, like the printed cheeks),
                                  side-vent gills, cleat pilot drill-marks
  WOOD 6 mm:   bottom, back, taper, neck, top — flat wrap runs (back keeps
                                  the I/O row + service hatch cutout)
  PRINT 3 mm:  nose, deck, face, marquee, lip — the precision/visible panels
  PRINT:       bezel, retainer, hatch_cover (unchanged from parts.py) +
               60 corner cleats (L-brackets: wood screws into the side,
               M3 heat-set insert under the panel)

Joinery: printed L-cleats at 3 stations per panel end (the same stations
the metal flat-pack's flanges use). No glue, fully reversible, identical
fastener pattern for wood and printed panels.

Display stack in hybrid v1: the face panel is FLAT (no 12 mm dish), so the
CRT bezel bonds to the face with VHB tape, the PC window bonds behind the
window, and the panel clamps with foam tape; the printed retainer is still
exported (mechanical anchor pads are a v1.1 item).

Run:  hardware/.venv/bin/python hardware/hybrid.py
Out:  hardware/out/hybrid/print/*.stl|step (bed-flat STL, placed STEP)
      hardware/out/hybrid/wood/*.step|dxf   (1:1 cut templates)
      hardware/out/hybrid/hybrid_*.png      (assembled + exploded renders)
"""

import math

from build123d import (
    Box,
    BuildLine,
    BuildSketch,
    Circle,
    Cylinder,
    Locations,
    Mode,
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
from build123d.exporters import ExportDXF

from assembly import LAYOUT, display_face_plane
from cabinet import OUT_DIR, PARAMS as CAB, cheek_profile, side_profile
import components as comp
import panels
from panels import PP, panel_names, seg_data
from parts import crt_bezel, hatch_cover, print_oriented, retainer_frame
from render import render_parts

HYB_DIR = OUT_DIR / "hybrid"

HYB = {
    "wood_side_t": 12.0,         # Baltic birch sides (the structure)
    "wood_panel_t": 6.0,         # ply flat wrap panels
    "print_t": 3.0,              # printed wrap panels (== monocoque wall)
    "panel_inset": 0.5,          # panel end reveal from the wood inner face
    "wood_panels": ("bottom", "back", "taper", "neck", "top"),
    "print_panels": ("nose", "deck", "face", "marquee", "lip"),
    # --- cleats (printed L-brackets) --------------------------------------
    "cleat_leg": 18.0,           # mm each leg reaches from the corner
    "cleat_len": 24.0,           # mm along the profile segment
    "cleat_t": 4.5,              # leg thickness
    "cleat_insert_dia": 4.2,     # M3 short heat-set insert pilot
    "cleat_screw_dia": 4.0,      # 3.5 mm wood-screw clearance through the leg
    "side_pilot_dia": 2.0,       # drill-guide marks through the wood sides
    # --- cost model ---------------------------------------------------------
    # Craftcloud quote 2026-08-25: $339.14 for the fb set, 3,061,014 mm^3.
    # Bureau pricing isn't linear in volume — treat the estimate as +/-30%.
    "ref_quote_usd": 339.14,
    "ref_volume_mm3": 3061014.0,
    "birch_density": 0.68e-3,    # g/mm^3 Baltic birch
}

WOOD_COLOR = (0.76, 0.62, 0.44)
PRINT_COLOR = (0.24, 0.24, 0.27)


def panel_t(name):
    return HYB["wood_panel_t"] if name in HYB["wood_panels"] else HYB["print_t"]


def x_face():
    """|x| of the wood side inner face."""
    return CAB["cabinet_width"] / 2 - HYB["wood_side_t"]


def panel_width():
    return CAB["cabinet_width"] - 2 * HYB["wood_side_t"] - 2 * HYB["panel_inset"]


def stations(length):
    half = length / 2
    inset = PP["screw_end_inset"]
    return (-half + inset, 0.0, half - inset)


def cleat_x():
    """|x| of the cleat panel-leg center (screw axis through the panel)."""
    return x_face() - HYB["cleat_leg"] / 2


# --- wood panels (one sketch feeds both the 3D part and the DXF) ------------

def wood_panel_sketch(name, length):
    """Flat cut pattern: outline + cleat screw holes + feature holes.

    Sketch frame: X across the cabinet, Y along the profile segment
    (A -> B) — the same mapping panel_features() uses, so wood and printed
    panel holes coincide."""
    p = CAB
    w, half = panel_width(), length / 2
    with BuildSketch() as sk:
        Rectangle(w, length)
        for sx in (-1, 1):
            for st in stations(length):
                with Locations((sx * cleat_x(), st)):
                    Circle(PP["screw_hole_dia"] / 2, mode=Mode.SUBTRACT)
        if name == "bottom":
            fx = p["cabinet_width"] / 2 - 40.0
            for sx in (-1, 1):
                for fy in (40.0, p["cabinet_depth_base"] - 40.0):
                    with Locations((sx * fx, fy - half)):
                        Circle(4.5 / 2, mode=Mode.SUBTRACT)  # foot screw, M4
        elif name == "back":
            # layout z measured from the bottom; local y = z - half
            def zh(z_world):
                return z_world - half

            for key, dia in (("power_switch_xz", "power_switch_hole_dia"),
                             ("dc_jack_xz", "dc_jack_hole_dia")):
                with Locations((p[key][0], zh(p[key][1]))):
                    Circle(p[dia] / 2, mode=Mode.SUBTRACT)
            with Locations((p["usbc_xz"][0], zh(p["usbc_xz"][1]))):
                Rectangle(p["usbc_slot_w"], p["usbc_slot_h"],
                          mode=Mode.SUBTRACT)
            for ax in p["admin_button_xs"]:
                with Locations((ax, zh(p["admin_button_z"]))):
                    Circle(p["admin_button_hole_dia"] / 2, mode=Mode.SUBTRACT)
            hw, hh = p["hatch_w"], p["hatch_h"]
            with Locations((0, zh(p["hatch_z"]))):
                Rectangle(hw, hh, mode=Mode.SUBTRACT)
            bi = p["hatch_boss_offset"]
            for sx in (-1, 1):
                for sz in (-1, 1):
                    with Locations((sx * (hw / 2 + bi),
                                    zh(p["hatch_z"]) + sz * (hh / 2 + bi))):
                        Circle(PP["screw_hole_dia"] / 2, mode=Mode.SUBTRACT)
    return sk


def make_wood_panel(name, a, b, length, e, n_in):
    sk = wood_panel_sketch(name, length)
    t = HYB["wood_panel_t"]
    panel = extrude(sk.sketch, amount=t / 2, both=True)
    return sk, panels.place_panel(panel, a, b, e, n_in, t)


# --- wood sides ---------------------------------------------------------------

def make_wood_side(side, segs, names):
    """12 mm cheek-profile side plate: vent gills + cleat pilot drill-marks.

    Built on Plane.YZ (profile (y,z) -> sketch (X,Y)) so the solid lands in
    world orientation; the same sketch face exports to DXF as the 1:1 cut
    template (the pilot holes double as drill guides)."""
    p = CAB
    t = HYB["wood_side_t"]
    pts, radii = cheek_profile(p)
    _, _, info = side_profile(p)
    with BuildSketch(Plane.YZ) as sk:
        with BuildLine():
            Polyline(pts, close=True)
        make_face()
        for idx, radius in radii.items():
            if radius is None:
                continue
            y, z = pts[idx]
            vtx = sk.vertices().filter_by(
                lambda v, y=y, z=z: abs(v.X - y) < 1.0 and abs(v.Y - z) < 1.0
            )
            fillet(vtx, radius=radius)
        # side-vent gills (same raked hood-zone positions as the shell)
        tilt = math.radians(p["display_tilt_deg"])
        sin_t, cos_t = math.sin(tilt), math.cos(tilt)
        vc_y = info["mrq_y"] + cos_t * p["side_vent_center_u"]
        vc_z = info["mrq_z"] - sin_t * p["side_vent_center_u"]
        svl, svw = p["side_vent_slot_len"], p["side_vent_slot_w"]
        for i in range(p["side_vent_count"]):
            drop = p["side_vent_drop"] + i * p["side_vent_pitch"]
            vy = vc_y - sin_t * drop
            vz = vc_z - cos_t * drop
            with Locations(Pos(vy, vz) * Rot(0, 0, -p["display_tilt_deg"])):
                Rectangle(svl - svw, svw, mode=Mode.SUBTRACT)
                for sy in (-1, 1):
                    with Locations((0, sy * (svl - svw) / 2)):
                        Circle(svw / 2, mode=Mode.SUBTRACT)
        # cleat pilot drill-marks, at the cleat wood-screw positions
        for i, name in enumerate(names):
            a, b, length, e, n_in = segs[i]
            tp = panel_t(name)
            for off in stations(length):
                for d in (tp + 5.0, tp + 13.0):
                    py = (a[0] + b[0]) / 2 + e[0] * off + n_in[0] * d
                    pz = (a[1] + b[1]) / 2 + e[1] * off + n_in[1] * d
                    with Locations((py, pz)):
                        Circle(HYB["side_pilot_dia"] / 2, mode=Mode.SUBTRACT)
    plate = extrude(sk.sketch, amount=t / 2, both=True)
    return sk, Pos(side * (x_face() + t / 2), 0, 0) * plate


# --- printed wrap panels -------------------------------------------------------

def make_print_panel(name, a, b, length, e, n_in):
    """3 mm wrap panel spanning between the wood sides; features from
    panels.panel_features with the screw stations moved onto the cleats."""
    t = HYB["print_t"]
    w = panel_width()
    saved = dict(PP)
    try:
        PP["panel_thickness"] = t
        # panel_features puts screw clearances on the (metal) flange
        # centerline; redirect them onto the cleat panel-leg centerline
        PP["flange_width"] = 2 * (CAB["cabinet_width"] / 2 - t - cleat_x())
        local = Box(w, length, t)
        local = panels.panel_features(name, local, length)
    finally:
        PP.clear()
        PP.update(saved)
    return local, panels.place_panel(local, a, b, e, n_in, t)


# --- cleats ---------------------------------------------------------------------

def make_cleat(t_panel, side):
    """L-bracket at one panel screw station: side leg wood-screws to the
    wood side (through-holes), panel leg carries a blind M3 insert pilot.

    Local frame: X = world X (signed inward per side), Y along the segment
    (station at y=0), Z along the inward normal with z=0 on the profile
    line. Placed with the same Rot/Pos convention as place_panel."""
    ct, leg, ln = HYB["cleat_t"], HYB["cleat_leg"], HYB["cleat_len"]
    xf = x_face()
    cleat = Pos(side * (xf - ct / 2), 0, t_panel + leg / 2) * Box(ct, ln, leg)
    cleat += Pos(side * (xf - leg / 2), 0, t_panel + ct / 2) * Box(leg, ln, ct)
    # M3 short-insert pilot in the panel leg (blind, opens toward the panel)
    depth = ct - 0.3
    cleat -= Pos(side * cleat_x(), 0, t_panel + ct - depth / 2 + 0.05) * Cylinder(
        HYB["cleat_insert_dia"] / 2, depth + 0.1
    )
    # 2 wood-screw clearances through the side leg
    for z in (t_panel + 5.0, t_panel + 13.0):
        cleat -= Pos(side * (xf - ct / 2), 0, z) * Rot(0, 90, 0) * Cylinder(
            HYB["cleat_screw_dia"] / 2, ct + 2
        )
    return cleat


def place_cleat(cleat, a, b, e, off):
    """off is center-relative (like the panel holes): 0 = segment midpoint."""
    theta = math.degrees(math.atan2(e[1], e[0]))
    sy = (a[0] + b[0]) / 2 + e[0] * off
    sz = (a[1] + b[1]) / 2 + e[1] * off
    return Pos(0, sy, sz) * Rot(theta, 0, 0) * cleat


# --- main ------------------------------------------------------------------------

def main():
    (HYB_DIR / "print").mkdir(parents=True, exist_ok=True)
    (HYB_DIR / "wood").mkdir(parents=True, exist_ok=True)
    profile, _, info = side_profile(CAB)
    segs = seg_data(profile)
    names = panel_names(profile)

    wood_parts, print_parts = {}, {}
    panel_segs = {}  # name -> (a, b, length, e, n_in) for cleats/exploded
    side_sks = {}

    for i, name in enumerate(names):
        a, b, length, e, n_in = segs[i]
        panel_segs[name] = (a, b, length, e, n_in)
        if name in HYB["wood_panels"]:
            sk, placed = make_wood_panel(name, a, b, length, e, n_in)
            wood_parts[f"panel_{name}"] = placed
            dxf = ExportDXF()
            dxf.add_shape(sk.face())
            dxf.write(str(HYB_DIR / "wood" / f"panel_{name}.dxf"))
            export_step(placed, str(HYB_DIR / "wood" / f"panel_{name}.step"))
        else:
            local, placed = make_print_panel(name, a, b, length, e, n_in)
            print_parts[f"panel_{name}"] = placed
            export_step(placed, str(HYB_DIR / "print" / f"panel_{name}.step"))
            flat = Pos(0, 0, HYB["print_t"] / 2) * local
            export_stl(flat, str(HYB_DIR / "print" / f"panel_{name}.stl"))

    for side, sname in ((-1, "l"), (1, "r")):
        sk, plate = make_wood_side(side, segs, names)
        side_sks[sname] = sk
        wood_parts[f"side_{sname}"] = plate
        dxf = ExportDXF()
        dxf.add_shape(sk.face())
        dxf.write(str(HYB_DIR / "wood" / f"side_{sname}.dxf"))
        export_step(plate, str(HYB_DIR / "wood" / f"side_{sname}.step"))

    # cleats: one geometry per (panel thickness, side); 3 stations/segment
    cleats = []
    cleat_geos = {}
    for i, name in enumerate(names):
        a, b, length, e, n_in = segs[i]
        tp = panel_t(name)
        for side in (-1, 1):
            key = (tp, side)
            if key not in cleat_geos:
                cleat_geos[key] = make_cleat(tp, side)
            for off in stations(length):
                cleats.append(place_cleat(cleat_geos[key], a, b, e, off))
    for (tp, side), geo in cleat_geos.items():
        tag = f"p{tp:.0f}_{'r' if side > 0 else 'l'}"
        export_step(geo, str(HYB_DIR / "print" / f"cleat_{tag}.step"))
        export_stl(geo, str(HYB_DIR / "print" / f"cleat_{tag}.stl"))

    # unchanged printed parts from the fb build
    extras = {
        "bezel": crt_bezel(),
        "retainer": retainer_frame(),
        "hatch_cover": hatch_cover(),
    }
    for name, part in extras.items():
        export_step(part, str(HYB_DIR / "print" / f"{name}.step"))
        export_stl(print_oriented(name, part),
                   str(HYB_DIR / "print" / f"{name}.stl"))

    # --- validity + fit report ---------------------------------------------
    print(f"{'part':16s} {'valid':6s} dims (mm)")
    for name, part in {**wood_parts, **print_parts, **extras}.items():
        ok = part.is_valid and len(part.solids()) == 1
        bb = part.bounding_box()
        dims = [bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z]
        print(f"{name:16s} {str(ok):6s} {dims[0]:6.1f}x{dims[1]:6.1f}x{dims[2]:5.1f}")
        if not ok:
            raise RuntimeError(f"{name} failed validity")

    # --- cost + material report ---------------------------------------------
    cleat_vol = sum(g.volume for g in cleat_geos.values())
    n_cleats = len(cleats)
    per_cleat = {k: v.volume for k, v in cleat_geos.items()}
    cleat_total = sum(
        per_cleat[(panel_t(n), s)] * 3
        for n in names for s in (-1, 1)
    )
    print_vols = {n: pt.volume for n, pt in print_parts.items()}
    print_vols.update({n: pt.volume for n, pt in extras.items()})
    print_total = sum(print_vols.values()) + cleat_total
    est = print_total / HYB["ref_volume_mm3"] * HYB["ref_quote_usd"]
    print(f"\nprint volume: {print_total / 1e3:.0f} cm^3 "
          f"(fb set: {HYB['ref_volume_mm3'] / 1e3:.0f} cm^3)")
    for n, v in print_vols.items():
        print(f"  {n:16s} {v / 1e3:8.1f} cm^3")
    print(f"  cleats x{n_cleats:<9d} {cleat_total / 1e3:8.1f} cm^3")
    print(f"  PETG mass ~{print_total * 1.27e-3:.0f} g solid "
          f"(~{print_total * 1.27e-3 * 0.45:.0f} g at bureau infill)")
    print(f"  rough bureau estimate: ${est:.0f} "
          f"(scaled from the $339 Craftcloud fb quote; +/-30%)")

    side_area = side_sks["l"].face().area
    wood_panel_area = sum(
        wood_panel_sketch(n, panel_segs[n][2]).face().area
        for n in HYB["wood_panels"]
    )
    side_mass = 2 * side_area * HYB["wood_side_t"] * HYB["birch_density"]
    panel_mass = wood_panel_area * HYB["wood_panel_t"] * HYB["birch_density"]
    print(f"\nwood: sides 2x {side_area / 1e2:.0f} cm^2 @12 mm "
          f"({side_mass:.0f} g), panels {wood_panel_area / 1e2:.0f} cm^2 "
          f"@6 mm ({panel_mass:.0f} g)")
    print(f"      total wood ~{(side_mass + panel_mass) / 1000:.2f} kg "
          f"(+ fasteners; fb print path ~2.1 kg PETG)")

    # --- renders --------------------------------------------------------------
    face = display_face_plane()
    stack0 = HYB["print_t"]  # flat face panel: no dish in the hybrid
    _, panel_parts, _ = comp.display_panel()
    panel_off = (stack0 + CAB["polycarb_thickness"] + LAYOUT["panel_gap"]
                 + CAB["panel_thickness"] / 2)
    frame_off = (stack0 + CAB["polycarb_thickness"] + LAYOUT["panel_gap"]
                 + CAB["panel_thickness"])
    hatch = Pos(0, CAB["cabinet_depth_base"] + 0.2, CAB["hatch_z"]) * Rot(
        90, 0, 0) * extras["hatch_cover"]

    assembled = [(pt, WOOD_COLOR) for pt in wood_parts.values()]
    assembled += [(pt, PRINT_COLOR) for pt in print_parts.values()]
    assembled += [(c, (0.55, 0.55, 0.58)) for c in cleats]
    assembled += [
        (face * Rot(90, 0, 0) * extras["bezel"], (0.05, 0.05, 0.06)),
        (face * Pos(0, frame_off, 0) * Rot(-90, 0, 0) * extras["retainer"],
         (0.30, 0.30, 0.33)),
        (hatch, PRINT_COLOR),
    ]
    assembled += [(face * Pos(0, panel_off, 0) * s, c) for s, c in panel_parts]
    render_parts(assembled, HYB_DIR, prefix="hybrid_assembled", size=1200,
                 views={"front": (0, -90, None), "side": (0, 180, None),
                        "iso": (25, -60, None)})

    exploded = []
    off = 45
    for name, pt in wood_parts.items():
        if name.startswith("side_"):
            sx = -60 if name.endswith("_l") else 60
            exploded.append((Pos(sx, 0, 0) * pt, WOOD_COLOR))
        else:
            _, _, _, _, n_in = panel_segs[name.removeprefix("panel_")]
            exploded.append(
                (Pos(0, -n_in[0] * off, -n_in[1] * off) * pt, WOOD_COLOR))
    for name, pt in print_parts.items():
        _, _, _, _, n_in = panel_segs[name.removeprefix("panel_")]
        exploded.append(
            (Pos(0, -n_in[0] * off, -n_in[1] * off) * pt, PRINT_COLOR))
    render_parts(exploded, HYB_DIR, prefix="hybrid_exploded", size=1200,
                 views={"iso": (25, -60, None)})
    print(f"\nexported to {HYB_DIR}")


if __name__ == "__main__":
    main()
