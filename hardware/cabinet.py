"""ArcadeBench bartop cabinet — parametric enclosure (Build123d 0.11).

v0.5: monocoque shell from a side-profile sketch (extrude + hollow) with
rounded silhouette corners and a marquee overhang; display window with
polycarbonate rabbet and inner doubler; control-deck cutouts (12 x 30 mm
buttons, 2 x 24 mm start/select, 2 x Sanwa JLF mounts); internal ribs.

Splits into printable parts, fastener bosses, feet, vents, speaker cavity,
and rear jacks are v1+.

Run:  hardware/.venv/bin/python hardware/cabinet.py
Out:  STEP + STL + PNG previews (front/side/top/iso, orthographic) in
      hardware/out/
"""

import math
from pathlib import Path

from build123d import (
    Axis,
    Box,
    BuildLine,
    BuildPart,
    BuildSketch,
    Cylinder,
    Plane,
    Polyline,
    Pos,
    Rectangle,
    Rot,
    Cone,
    export_step,
    export_stl,
    extrude,
    fillet,
    make_face,
)

PARAMS = {
    # --- envelope -------------------------------------------------------
    "cabinet_width": 340.0,        # mm, X; 1P cluster span 210 + margins
    "cabinet_depth_base": 340.0,   # mm, Y; base footprint depth
    "wall": 3.0,                   # mm shell wall
    "seam_fillet": 20.0,           # mm 3D blend at the deck/face seam edge
    "lip_blend": 10.0,             # mm 3D fillet under the marquee lip
    "corner_fillet": 12.0,         # mm 3D fillet on vertical outer corners
    # --- side cheeks (side plates proud of the nose fascia) ---------------
    "cheek_thickness": 8.0,        # mm; outer face flush with shell sides
    "cheek_front_overhang": 8.0,   # mm uniform buffer around the front matter
    "cheek_edge_fillet": 3.2,      # mm 3D round on both plate perimeters
    "cheek_seam_blend": 8.0,       # mm 2D blend where cheek lip meets the face
    "hole_chamfer": 0.4,           # mm 45 deg break on deck control hole rims
    # --- control deck ---------------------------------------------------
    "control_deck_depth": 155.0,   # mm, Y; interface span 139 + ~10% buffer
    "control_deck_height": 100.0,  # mm, Z; deck surface height at the seam
    "control_deck_slope_deg": 8.0, # deck slopes down toward the front
    # --- display deck + marquee ------------------------------------------
    # S3-crt-slim identity (style study, unanimous consult pick): CRT cues
    # on a slim skeleton — near-vertical face, tapered neck, proud bezel,
    # 4:3 masked window
    "display_tilt_deg": 12.0,      # from vertical, leaning back
    "display_face_length": 245.0,  # mm along slope, seam -> face top
    # hood is a rectangular box: floor/top PERPENDICULAR to the display
    # face, marquee face PARALLEL to it — all brake bends 90 deg
    "marquee_height": 63.0,        # mm, chin -> marquee top, parallel to face
    "marquee_overhang": 56.0,      # mm chin forward of face top, perp. to face
    # --- neck (display column behind the screen) --------------------------
    # neck_depth: perpendicular distance from the display face to the neck
    # back line (parallel to the face, so the hood/top bends stay 90 deg).
    # None = full-depth vertical back (whole cabinet cabinet_depth_base deep).
    # When set, the back wall rises vertically to back_taper_z, then tapers
    # in a straight run to the neck line at neck_join_z.
    "neck_depth": 100.0,           # mm; consults: don't exceed ~100
    "back_taper_z": 120.0,         # mm; just above the deck/seam zone
    "neck_join_z": 140.0,          # mm where the taper meets the neck line
    "r_back_taper": 25.0,          # mm 2D radius on both taper corners
                                   # (consults: soften the base/neck shoulder)
    # --- hood speakers (slots in the hood floor, firing down) -------------
    "hood_speaker_spacing": 200.0, # mm between grille centers (x)
    "hood_speaker_offset": 32.0,   # mm from the chin along the hood floor;
                                   # + 2 mm gasket lift = zero shell overlap
                                   # (speaker_scan.py, iter 31)
    "hood_speaker_slot_len": 48.0, # overall, incl. the radiused ends
    "hood_speaker_slot_w": 4.0,
    "hood_speaker_pitch": 9.0,
    "hood_speaker_rows": 4,
    # --- marquee nameplate (magnetic swappable inlay) ---------------------
    "nameplate_w": 200.0,
    "nameplate_h": 48.0,
    "nameplate_recess": 1.5,       # mm pocket depth in the marquee face
    "magnet_dia": 6.2,             # 6x2.5 mm disc magnets, corner pockets
    "magnet_depth": 2.5,
    "magnet_inset_x": 90.0,        # +/- from center
    "magnet_inset_z": 14.0,        # +/- from nameplate center
    # --- chin datum groove (shadow line under the hood) -------------------
    "chin_groove_width": 3.0,      # mm along-slope groove height
    "chin_groove_depth": 1.0,
    "chin_groove_drop": 5.5,       # mm groove center below the face top
                                   # (hugs the chin; stays clear of the
                                   # reveal ring around the 4:3 window)
    # --- side vents (gill slots through both cheeks, hood zone) -----------
    # raked parallel to the hood cap — the CRT top-vent read, on the sides
    "side_vent_count": 3,
    "side_vent_slot_len": 110.0,   # mm along the cap direction (capsule);
                                   # cap run is overhang+neck = 156, so 110 leaves
                                   # a healthy ~23 mm buffer at each end
    "side_vent_slot_w": 4.0,
    "side_vent_pitch": 12.0,       # stacking from the cap toward the floor
    "side_vent_center_u": 78.0,    # mm from the marquee top along the cap (centered)
    "side_vent_drop": 10.0,        # mm from the cap to the TOP slot center
    # --- silhouette corner radii (2D profile) ----------------------------
    "r_nose_bottom": 22.4,         # iter 25: silhouette radii scaled to 70%
    "r_nose_top": 23.8,            # (iter 24's full radii read too soft)
    "r_back_bottom": 7.0,
    "r_back_top": 15.4,
    "r_marquee_top": 10.0,         # iter 26: crisper hood cap (reference look)
    "r_marquee_chin": 10.0,
    "nose_undercut_deg": 4.0,      # nose face leans back toward the bottom
    # --- screen (13.5" 3:2 3004x2000 hi-DPI IPS + HDMI driver board) --------
    "panel_outline_w": 296.0,      # mm module outline — confirm on arrival
    "panel_outline_h": 206.0,
    "panel_thickness": 5.0,        # slim laptop-class panel (driver board separate)
    "panel_active_w": 285.0,       # mm active area
    "panel_active_h": 190.0,
    # iter 34 CRT dish: the face gets a 12 mm recessed tray; the tray FLOOR
    # carries the 4:3 aperture and the glass/panel clamp behind it, so the
    # screen sits at the bottom of the recess like a real tube. The printed
    # bezel is a thin trim ring + funnel insert (parts.py), ~2.5 mm proud.
    "display_recess": 12.0,        # mm tray depth into the face
    "recess_w": 300.0,             # tray opening (the printed funnel's
    "recess_h": 200.0,             #   flange covers the raw rim)
    "recess_corner_r": 14.0,
    "glass_opening_w": 253.0,      # tray-floor aperture = the 4:3 mask
    "glass_opening_h": 190.0,      #   (games render exactly into this)
    "window_corner_radius": 10.0,  # mm rounded corners on the aperture
    "polycarb_thickness": 2.5,     # PC window clamped behind the tray floor
    "polycarb_w": 275.0,           # covers the aperture + 11 mm/side
    "polycarb_h": 208.0,
    "doubler_thickness": 4.0,      # mm inner reinforcement around aperture
    "doubler_margin": 12.0,        # mm doubler beyond the aperture
    "screen_center_frac": 0.515,   # screen center along display face: keeps
                                   #   the dish + flange inside the flat band
                                   #   (seam blend R20 .. chin blend R10)
    # --- CRT trim ring mount (black M3 CSK from the FRONT, into insert
    #     pads on the inner wall — visible screws, honest trim detail) ------
    "bezel_mount_x": 154.0,        # 4 mounts at (+-x, +-z), squeezed between
    "bezel_mount_z": 55.0,         #   the dish edge and the flange edge
    "bezel_mount_hole_dia": 3.4,   # M3 clearance
    "bezel_mount_pad": 12.0,       # mm dia insert pad on the inner wall
    "bezel_mount_pad_depth": 5.0,  # wall 3 + pad 5 = 8 >= insert pilot 7 + 1
    "bezel_pilot_dia": 4.2,        # M3 heat-set insert pilot
    "bezel_pilot_depth": 7.0,
    # reveal ring + proud bezel ring: REMOVED iter 32 — the 18 mm printed
    # CRT bezel (parts.py) covers both; its outer edge casts the shadow line
    "reveal_offset": 0.0,          # 0 = off (guarded below)
    "reveal_width": 2.5,
    "reveal_depth": 1.2,
    "bezel_width": 0.0,            # 0 = off; superseded by the printed bezel
    "bezel_proud": 3.0,
    # --- display retainer (clamp frame bosses standing off the tray floor) -
    "retainer_boss_offset": 6.0,   # mm boss centers beyond the panel outline
    "retainer_boss_dia": 10.0,     # mm standoff diameter
    "retainer_boss_depth": 12.0,   # tray doubler (18.5) to panel rear (26.5)
    "retainer_pilot_dia": 4.2,     # M3 heat-set insert pilot (parts.py spec)
    "retainer_pilot_depth": 7.0,
    # --- fascia -----------------------------------------------------------
    # (the plinth groove was removed in iter 20: the proud cheek edges do
    # its visual job now, and it notched the cheek fronts)
    # --- controls -------------------------------------------------------
    "players": 1,
    "cluster_offset_x": -8.0,      # recenters the asymmetric cluster (stick-left)
    "primary_hole_dia": 30.0,      # 2 primaries/player: Sanwa OBSF-30
    "secondary_hole_dia": 24.0,    # 2 secondaries/player: Sanwa OBSF-24
    "primary_count": 2,
    "secondary_count": 2,          # iter 33: 2+2 grid (was 4 secondaries) —
                                   #   the game roster is stick + 1-2 buttons
    "primary_pitch": 44.0,         # mm between primaries (front row); the
                                   #   Ø40 wells keep 4 mm rim gaps at 44
    "secondary_pitch": 44.0,       # aligned 2x2 grid: same pitch both rows
    "primary_row_y": 68.0,         # front row (closest to the player); wells
                                   #   (Ø40) keep 4 mm margin inside the plate
    "secondary_row_y": 94.0,
    "primary_recess_dia": 40.0,    # shallow well: tactile "primary" indicator
    "primary_recess_depth": 0.8,   # below the control plate floor
    # --- control plate inlay (recessed zone under the whole cluster) ------
    "control_plate_w": 240.0,
    "control_plate_d": 96.0,       # mm along the deck (y); front edge stays
    "control_plate_center_y": 91.0,#   clear of the r_nose_top roll (~y=40)
    "control_plate_recess": 1.0,   # mm; deck 3 -> 2.0 effective (OBSF snap range)
    "control_plate_radius": 4.0,
    "option_hole_dia": 24.0,       # Sanwa OBSF-24 start/select
    "joystick_shaft_hole_dia": 24.0,
    "jlf_mount_spacing_x": 84.0,   # JLF-P1 plate slots (verified drawing)
    "jlf_mount_spacing_y": 40.0,
    "jlf_mount_hole_dia": 5.5,     # M5 clearance for plate slots
    "player_spacing": 230.0,       # mm between player cluster centers
    "joystick_offset_x": -50.0,    # stick left of button cluster
    "joystick_offset_y": 67.0,     # from deck front edge (40 mm wrist rest)
    "button_grid_offset_x": 30.0,  # first secondary column rel. cluster ctr
                                   #   (iter 33: +15 keeps hand clearance
                                   #   from the stick with the 2-wide grid)
    "option_offset_x": 25.0,       # start/select straddle cabinet center
    "option_offset_y": 120.0,
    # --- rear I/O + speaker grilles (BOM-driven) ---------------------------
    "power_switch_hole_dia": 19.0,  # Bulgin MPI002 class
    "power_switch_xz": (130.0, 40.0),  # single rear I/O row at z=40
    "dc_jack_hole_dia": 11.0,
    "dc_jack_xz": (-130.0, 40.0),
    "usbc_slot_w": 30.0,
    "usbc_slot_h": 14.0,
    "usbc_xz": (-95.0, 40.0),
    # --- LED admin buttons (rear row: exit/pause/select etc.) -------------
    "admin_button_hole_dia": 12.2, # 12 mm LED pushbuttons
    "admin_button_xs": (-40.0, 0.0, 40.0),
    "admin_button_z": 40.0,        # same rear I/O row
    # --- rear service hatch (SBC/USB access) -------------------------------
    "hatch_w": 170.0,
    "hatch_h": 90.0,
    "hatch_z": 60.0,               # center height (rear wall, below taper)
    "hatch_boss_offset": 8.0,      # screw bosses OUTSIDE the opening edge
                                   # (inside = the cut leaves them floating)
    "hatch_boss_size": 10.0,       # mm boss cross-section
    "hatch_boss_depth": 6.0,       # mm boss protrusion into the cavity
    "hatch_screw_pilot_dia": 4.2,  # M3 heat-set insert pilot
    # --- structure ------------------------------------------------------
    "rib_thickness": 3.0,
    "rib_offset_x": 145.0,         # fore-aft webs at +/- x (clear of controls)
    "rib_front_margin": 25.0,      # clear of front wall
    "rib_rear_margin": 25.0,       # clear of seam zone
}

OUT_DIR = Path(__file__).parent / "out"
HISTORY_DIR = OUT_DIR / "history"


def side_profile(p):
    """Compute the YZ side-profile polygon + corner radii from params.

    Returns (profile, radii, info): profile is [(y, z), ...] front of
    cabinet at y=0; radii maps vertex index -> radius or None; info carries
    derived landmarks (seam, face top, chin, marquee top, deck_z fn).
    """
    t = math.radians(p["display_tilt_deg"])
    sin_t, cos_t = math.sin(t), math.cos(t)

    seam_y = p["control_deck_depth"]
    seam_z = p["control_deck_height"]
    nose_z = seam_z - math.tan(math.radians(p["control_deck_slope_deg"])) * seam_y
    # bottom of the nose face recedes (undercut): adds visual depth, lifts
    # the front of the machine off the table visually
    nose_undercut = math.tan(math.radians(p["nose_undercut_deg"])) * nose_z

    def deck_z(y):
        """Outer deck surface height at distance y from the front edge."""
        return nose_z + (seam_z - nose_z) * (y / seam_y)

    face_top_y = seam_y + p["display_face_length"] * sin_t
    face_top_z = seam_z + p["display_face_length"] * cos_t
    # hood box: floor/top perpendicular to the display face, marquee face
    # parallel to it. u = unit vector perpendicular to the face, toward the
    # back-down direction; the chin is offset forward from the face top.
    face_dir = (sin_t, cos_t)     # up-slope along the display face
    u = (cos_t, -sin_t)           # perpendicular, back-down
    chin_y = face_top_y - u[0] * p["marquee_overhang"]
    chin_z = face_top_z - u[1] * p["marquee_overhang"]
    mrq_y = chin_y + face_dir[0] * p["marquee_height"]
    mrq_z = chin_z + face_dir[1] * p["marquee_height"]
    back_y = p["cabinet_depth_base"]
    nd = p.get("neck_depth")
    if nd is None:
        # full-depth back: top cap runs parallel to the hood floor until it
        # meets the vertical back wall
        back_top_z = mrq_z + u[1] * (back_y - mrq_y) / u[0]
        # (y, z) points; corner radii per vertex index (None = stay sharp)
        profile = [
            (nose_undercut, 0.0),
            (back_y, 0.0),
            (back_y, back_top_z),
            (mrq_y, mrq_z),
            (chin_y, chin_z),
            (face_top_y, face_top_z),  # underside of the marquee lip (reflex)
            (seam_y, seam_z),
            (0.0, nose_z),
        ]
        radii = {
            0: p["r_nose_bottom"],
            1: p["r_back_bottom"],
            2: p["r_back_top"],
            3: p["r_marquee_top"],
            4: p["r_marquee_chin"],
            5: None,  # lip underside: reflex corner
            6: None,  # seam: reflex corner, filleted in 3D below
            7: p["r_nose_top"],
        }
    else:
        # tapered neck: hood back sits on the neck line (parallel to the
        # display face, neck_depth behind it); the back wall tapers from
        # (back_y, back_taper_z) up to the neck line at neck_join_z
        hood_back = (
            mrq_y + u[0] * (p["marquee_overhang"] + nd),
            mrq_z + u[1] * (p["marquee_overhang"] + nd),
        )
        s_join = (hood_back[1] - p["neck_join_z"]) / cos_t
        neck_join = (hood_back[0] - s_join * sin_t, p["neck_join_z"])
        assert neck_join[0] < back_y, "neck line must sit ahead of the back wall"
        assert p["back_taper_z"] < p["neck_join_z"] < hood_back[1]
        profile = [
            (nose_undercut, 0.0),
            (back_y, 0.0),
            (back_y, p["back_taper_z"]),
            neck_join,
            hood_back,
            (mrq_y, mrq_z),
            (chin_y, chin_z),
            (face_top_y, face_top_z),  # underside of the marquee lip (reflex)
            (seam_y, seam_z),
            (0.0, nose_z),
        ]
        radii = {
            0: p["r_nose_bottom"],
            1: p["r_back_bottom"],
            2: p["r_back_taper"],
            3: p["r_back_taper"],
            4: p["r_back_top"],
            5: p["r_marquee_top"],
            6: p["r_marquee_chin"],
            7: None,  # lip underside: reflex corner
            8: None,  # seam: reflex corner, filleted in 3D below
            9: p["r_nose_top"],
        }
    info = {
        "sin_t": sin_t,
        "cos_t": cos_t,
        "seam_y": seam_y,
        "seam_z": seam_z,
        "face_top_y": face_top_y,
        "face_top_z": face_top_z,
        "chin_y": chin_y,
        "chin_z": chin_z,
        "mrq_y": mrq_y,
        "mrq_z": mrq_z,
        "back_y": back_y,
        # overall height = hood back corner (top cap end) either way
        "back_top_z": back_top_z if nd is None else hood_back[1],
        "deck_z": deck_z,
    }
    return profile, radii, info


def _line_intersect(p1, d1, p2, d2):
    """Intersection of lines p1+t*d1, p2+s*d2 (2D, y/z tuples)."""
    det = d1[0] * (-d2[1]) - (-d2[0]) * d1[1]
    rhs = (p2[0] - p1[0], p2[1] - p1[1])
    t = (rhs[0] * (-d2[1]) - (-d2[0]) * rhs[1]) / det
    return (p1[0] + t * d1[0], p1[1] + t * d1[1])


def cheek_profile(p):
    """Side-cheek / side-plate outline: the base silhouette with the front
    contour offset outward by cheek_front_overhang — a uniform engineered
    buffer around the front matter.

    The deck edge offsets along its outward normal (the cheeks stand proud
    of the deck surface, so the controls sit in a shallow tray) and the
    nose face offsets straight forward; the nose corner radii grow by the
    offset, keeping the buffer width constant around the corners. Returns
    (profile, radii) in the same format as side_profile().
    """
    profile, radii, info = side_profile(p)
    ov = p["cheek_front_overhang"]
    if ov <= 0:
        return profile, dict(radii)

    # seam/nose_top are always the last two vertices; the rear profile
    # (vertical back or tapered neck) passes through untouched
    seam, nose_top = profile[-2], profile[-1]
    nose_bot = profile[0]
    d_len = math.hypot(nose_top[0] - seam[0], nose_top[1] - seam[1])
    d = ((nose_top[0] - seam[0]) / d_len, (nose_top[1] - seam[1]) / d_len)
    n = (-d[1], d[0])  # deck outward normal (up); deck runs seam -> nose
    if n[1] < 0:
        n = (-n[0], -n[1])
    off_seam = (seam[0] + n[0] * ov, seam[1] + n[1] * ov)
    # offset deck edge meets the display-face edge just past the seam
    v_seam = _line_intersect(off_seam, d, seam, (info["sin_t"], info["cos_t"]))
    # nose edge (possibly undercut) offsets along its own outward normal;
    # the cheek front corners are where that offset line meets the bottom
    # edge and the offset deck edge
    nd_len = math.hypot(nose_top[0] - nose_bot[0], nose_top[1] - nose_bot[1])
    nd = ((nose_top[0] - nose_bot[0]) / nd_len,
          (nose_top[1] - nose_bot[1]) / nd_len)
    nn = (-nd[1], nd[0])  # nose outward normal (forward)
    if nn[0] > 0:
        nn = (-nn[0], -nn[1])
    off_nose = (nose_bot[0] + nn[0] * ov, nose_bot[1] + nn[1] * ov)
    v_bot = _line_intersect(off_nose, nd, (0.0, 0.0), (1.0, 0.0))
    v_nose = _line_intersect(off_seam, d, off_nose, nd)

    new_profile = [v_bot] + profile[1:-2] + [v_seam, v_nose]
    n_new = len(new_profile)
    new_radii = dict(radii)
    new_radii[0] = p["r_nose_bottom"] + ov
    new_radii[n_new - 2] = p["cheek_seam_blend"]  # blend the lip/face kink
    new_radii[n_new - 1] = p["r_nose_top"] + ov
    return new_profile, new_radii


def _rounded_cutter(plane, y_ctr, w, d, h, r):
    """Box built on a face frame with its in-plane corners filleted.

    The through-wall edges are always the short ones (d << w, h), so a
    length filter finds them without any frame math.
    """
    cutter = plane * Pos(0, y_ctr, 0) * Box(w, d, h)
    short_edges = cutter.edges().filter_by(lambda e: e.length < d + 1)
    return cutter.fillet(r, short_edges)


def build_cabinet(p=None):
    p = p or PARAMS
    profile, radii, info = side_profile(p)
    sin_t, cos_t = info["sin_t"], info["cos_t"]
    seam_y, seam_z = info["seam_y"], info["seam_z"]
    face_top_y, face_top_z = info["face_top_y"], info["face_top_z"]
    chin_y, chin_z = info["chin_y"], info["chin_z"]
    mrq_y, mrq_z = info["mrq_y"], info["mrq_z"]
    deck_z = info["deck_z"]

    with BuildPart() as bp:
        with BuildSketch(Plane.YZ) as sk:
            with BuildLine():
                Polyline(profile, close=True)
            make_face()
            for idx, radius in radii.items():
                if radius is None:
                    continue
                y, z = profile[idx]
                # Plane.YZ maps profile (y, z) to world (X=y, Y=z, Z=0) —
                # matching v.Y/v.Z here silently matched nothing for every
                # corner except (0, 0) (all sketch vertices have Z=0)
                vtx = sk.vertices().filter_by(
                    lambda v, y=y, z=z: abs(v.X - y) < 1.0 and abs(v.Y - z) < 1.0
                )
                fillet(vtx, radius=radius)
        extrude(amount=p["cabinet_width"] / 2, both=True)
    solid = bp.part

    # round the deck/face seam (reflex edge), lip underside, and vertical
    # outer corners; then hollow inward
    seam_edges = solid.edges().filter_by(Axis.X).filter_by(
        lambda e: abs(e.center().Y - seam_y) < 1.0 and abs(e.center().Z - seam_z) < 1.0
    )
    solid = solid.fillet(p["seam_fillet"], seam_edges)
    lip_edges = solid.edges().filter_by(Axis.X).filter_by(
        lambda e: abs(e.center().Y - face_top_y) < 1.0 and abs(e.center().Z - face_top_z) < 1.0
    )
    try:
        solid = solid.fillet(p["lip_blend"], lip_edges)
    except Exception as exc:
        print(f"  ! lip blend fillet skipped: {exc}")
    vert_edges = solid.edges().filter_by(Axis.Z).filter_by(
        lambda e: abs(abs(e.center().X) - p["cabinet_width"] / 2) < 1.0
    )
    try:
        solid = solid.fillet(p["corner_fillet"], vert_edges)
    except Exception as exc:
        print(f"  ! vertical corner fillet skipped: {exc}")
    solid = solid.hollow([], -p["wall"])

    # --- side cheeks: full-silhouette plates proud of the front matter ----
    # Sheet-metal side-plate look: the cheeks overhang the nose fascia and
    # stand proud of the deck surface by a uniform buffer (cheek_profile),
    # so the front of the machine reads framed with an even, precise gap.
    # Outer face flush with the shell sides, embedded 1 mm into the wall.
    ct = p["cheek_thickness"]
    cheek_pts, cheek_radii = cheek_profile(p)
    for sx in (-1, 1):
        with BuildSketch(Plane.YZ) as csk:
            with BuildLine():
                Polyline(cheek_pts, close=True)
            make_face()
            for idx, radius in cheek_radii.items():
                if radius is None:
                    continue
                y, z = cheek_pts[idx]
                vtx = csk.vertices().filter_by(
                    lambda v, y=y, z=z: abs(v.X - y) < 1.0 and abs(v.Y - z) < 1.0
                )
                fillet(vtx, radius=radius)
        cheek = Pos(sx * (p["cabinet_width"] / 2 - ct / 2), 0, 0) * extrude(
            csk.sketch, amount=ct / 2, both=True
        )
        # machined-frame read: round BOTH plate perimeter loops — the outer
        # face edge and the inner edge that frames the recessed front
        half_w = p["cabinet_width"] / 2
        perimeter = cheek.edges().filter_by(
            lambda e: abs(abs(e.center().X) - half_w) < 0.6
            or abs(abs(e.center().X) - (half_w - ct)) < 0.6
        )
        try:
            cheek = cheek.fillet(p["cheek_edge_fillet"], perimeter)
        except Exception as exc:
            print(f"  ! cheek edge fillet skipped: {exc}")
        solid += cheek

    wall = p["wall"]

    # --- display window --------------------------------------------------
    u_ctr = p["screen_center_frac"] * p["display_face_length"]
    ctr_y = seam_y + u_ctr * sin_t
    ctr_z = seam_z + u_ctr * cos_t
    # local frame on the display face: X across cabinet, Z up-slope,
    # local +Y points into the cabinet
    face = Plane(
        origin=(0, ctr_y, ctr_z), x_dir=(1, 0, 0), z_dir=(0, sin_t, cos_t)
    )

    open_w = p["glass_opening_w"]
    open_h = p["glass_opening_h"]
    recess = p["display_recess"]
    floor_in = recess + wall          # inner face of the tray floor

    # CRT dish: the shell is a hollow 3 mm wall, so the tray is BUILT, not
    # carved — cut the dish opening through the face wall, then fuse a tub
    # whose outer flange overlaps the wall's inner face (0.5 mm embed) and
    # whose floor sits `recess` mm deep. Tub exterior is left square (hidden
    # behind the trim ring); the interior void keeps rounded corners.
    solid -= _rounded_cutter(
        face, wall / 2, p["recess_w"], wall + 2, p["recess_h"],
        p["recess_corner_r"],
    )
    tub = face * Pos(0, (wall - 0.5 + floor_in) / 2, 0) * Box(
        p["recess_w"] + 14.0, floor_in - wall + 0.5, p["recess_h"] + 14.0,
    )
    tub -= _rounded_cutter(
        face, (wall - 0.5 + recess) / 2,
        p["recess_w"], recess - wall + 0.5, p["recess_h"], 8.0,
    )
    solid += tub

    # inner doubler plate behind the tray floor, embedded 0.5 mm
    solid += face * Pos(0, floor_in + p["doubler_thickness"] / 2 - 0.5, 0) * Box(
        open_w + 2 * p["doubler_margin"],
        p["doubler_thickness"],
        open_h + 2 * p["doubler_margin"],
    )

    # aperture through-cut (tray floor + doubler), corners rounded
    solid -= _rounded_cutter(
        face, recess + wall / 2 + p["doubler_thickness"] / 2,
        open_w, wall + p["doubler_thickness"] + 2, open_h,
        p["window_corner_radius"],
    )

    # trim-ring mounts: 4 M3 clearances at (+-bmx, +-bmz) through the face
    # wall OUTSIDE the dish; insert pads on the inner wall (they land in
    # the tub wall, which adds depth) take heat-set inserts; black M3 CSK
    # screws from the front — visible trim detail
    bmx, bmz = p["bezel_mount_x"], p["bezel_mount_z"]
    pad_r, pad_d = p["bezel_mount_pad"] / 2, p["bezel_mount_pad_depth"]
    for sx6 in (-1, 1):
        for sz6 in (-1, 1):
            bx, bz = sx6 * bmx, sz6 * bmz
            solid -= face * Pos(bx, wall / 2, bz) * Cylinder(
                radius=p["bezel_mount_hole_dia"] / 2,
                height=wall + 2,
                rotation=(90, 0, 0),
            )
            solid += face * Pos(bx, wall + pad_d / 2, bz) * Cylinder(
                radius=pad_r, height=pad_d, rotation=(90, 0, 0)
            )
            solid -= face * Pos(
                bx, wall + pad_d - p["bezel_pilot_depth"] / 2, bz
            ) * Cylinder(
                radius=p["bezel_pilot_dia"] / 2,
                height=p["bezel_pilot_depth"] + 1,
                rotation=(90, 0, 0),
            )

    # shallow perimeter reveal ring around the window (visual frame);
    # 0 = off (the printed CRT bezel's edge is the shadow line now)
    rev, rw, rd = p["reveal_offset"], p["reveal_width"], p["reveal_depth"]
    if rev > 0:
        ring_y_ctr = rd / 2 - 0.2  # groove spans y -0.2 .. rd+0.2
        ring_outer = _rounded_cutter(
            face, ring_y_ctr,
            open_w + 2 * (rev + rw), rd + 0.4, open_h + 2 * (rev + rw),
            p["window_corner_radius"] + rev + rw,
        )
        ring_inner = _rounded_cutter(
            face, ring_y_ctr,
            open_w + 2 * rev, rd + 2.4, open_h + 2 * rev,
            p["window_corner_radius"] + rev,
        )
        solid -= ring_outer - ring_inner

    # proud bezel ring around the window (CRT cue); sits ON the face,
    # embedded 0.5 mm so it always fuses. For the sheet-metal path this
    # becomes a separate frame part, not a bend.
    bw = p["bezel_width"]
    if bw > 0:
        proud = p["bezel_proud"]
        bezel_outer = _rounded_cutter(
            face, (0.5 - proud) / 2,
            open_w + 2 * bw, proud + 0.5, open_h + 2 * bw,
            p["window_corner_radius"] + bw,
        )
        bezel_inner = _rounded_cutter(
            face, (0.5 - proud) / 2,
            open_w - 2, proud + 2.5, open_h - 2,
            p["window_corner_radius"],
        )
        solid += bezel_outer - bezel_inner

    # display retainer bosses: 4 standoffs just outside the panel outline,
    # standing off the tray floor; M3 heat-set-insert pilots take the
    # clamp-frame screws (the frame part lives in parts.py). Pilots open at
    # the boss tip.
    rb_off = p["retainer_boss_offset"]
    rb_d, rb_r = p["retainer_boss_depth"], p["retainer_boss_dia"] / 2
    rb_y = floor_in + rb_d / 2 - 0.5  # embeds 0.5 into the floor plate
    pilot_y = floor_in + rb_d - 0.5 - p["retainer_pilot_depth"] / 2
    for sx5 in (-1, 1):
        for sz5 in (-1, 1):
            bx = sx5 * (p["panel_outline_w"] / 2 + rb_off)
            bz = sz5 * (p["panel_outline_h"] / 2 + rb_off)
            solid += face * Pos(bx, rb_y, bz) * Cylinder(
                radius=rb_r, height=rb_d, rotation=(90, 0, 0)
            )
            solid -= face * Pos(bx, pilot_y, bz) * Cylinder(
                radius=p["retainer_pilot_dia"] / 2,
                height=p["retainer_pilot_depth"] + 1,
                rotation=(90, 0, 0),
            )

    # chin datum groove: shadow line on the display face just under the
    # hood chin, separating marquee and display zones. Width stops short
    # of the cheeks so their silhouette edges stay clean (matches the
    # flat-pack path, where the groove lives on the face panel only).
    gw, gd = p["chin_groove_width"], p["chin_groove_depth"]
    solid -= face * Pos(
        0, gd / 2 - 0.2, p["display_face_length"] - p["chin_groove_drop"]
    ) * Box(p["cabinet_width"] - 2 * p["cheek_thickness"] - 4, gd + 0.4, gw)

    # --- rear I/O cutouts (through the back wall) --------------------------
    back_y = p["cabinet_depth_base"]
    sx, sz = p["power_switch_xz"]
    solid -= Pos(sx, back_y, sz) * Rot(90, 0, 0) * Cylinder(
        radius=p["power_switch_hole_dia"] / 2, height=wall + 4
    )
    jx, jz = p["dc_jack_xz"]
    solid -= Pos(jx, back_y, jz) * Rot(90, 0, 0) * Cylinder(
        radius=p["dc_jack_hole_dia"] / 2, height=wall + 4
    )
    ux, uz = p["usbc_xz"]
    solid -= Pos(ux, back_y, uz) * Box(p["usbc_slot_w"], wall + 4, p["usbc_slot_h"])

    # LED admin buttons on the same rear row
    for ax in p["admin_button_xs"]:
        solid -= Pos(ax, back_y, p["admin_button_z"]) * Rot(90, 0, 0) * Cylinder(
            radius=p["admin_button_hole_dia"] / 2, height=wall + 4
        )

    # rear service hatch + corner screw bosses (M3 insert pilots)
    hw, hh, hz = p["hatch_w"], p["hatch_h"], p["hatch_z"]
    solid -= Pos(0, back_y, hz) * Box(hw, wall + 4, hh)
    bi, bs = p["hatch_boss_offset"], p["hatch_boss_size"]
    bd = p["hatch_boss_depth"]
    boss_y = back_y - wall - bd / 2 + 0.5  # embeds 0.5 into the inner wall
    for sx4 in (-1, 1):
        for sz4 in (-1, 1):
            bx = sx4 * (hw / 2 + bi)
            bz = hz + sz4 * (hh / 2 + bi)
            solid += Pos(bx, boss_y, bz) * Box(bs, bd, bs)
            solid -= Pos(bx, boss_y, bz) * Rot(90, 0, 0) * Cylinder(
                radius=p["hatch_screw_pilot_dia"] / 2,
                height=bd + p["hatch_screw_pilot_dia"],
            )

    # --- hood floor speaker grilles (down-firing at the player) -----------
    # frame on the hood floor: X across, local Y into the cabinet (up-slope)
    floor_dir = (cos_t, -sin_t)  # perpendicular to the face, back-down
    fp_y = chin_y + floor_dir[0] * p["hood_speaker_offset"]
    fp_z = chin_z + floor_dir[1] * p["hood_speaker_offset"]
    floor_plane = Plane(origin=(0, fp_y, fp_z), x_dir=(1, 0, 0), z_dir=(0, -cos_t, sin_t))
    sl, sw = p["hood_speaker_slot_len"], p["hood_speaker_slot_w"]
    for sx2 in (-1, 1):
        gx = sx2 * p["hood_speaker_spacing"] / 2
        for i in range(p["hood_speaker_rows"]):
            z_r = (i - (p["hood_speaker_rows"] - 1) / 2) * p["hood_speaker_pitch"]
            # capsule slot: bar + round end caps (radiused ends read finished,
            # and match what a laser/punch actually produces)
            solid -= floor_plane * Pos(gx, wall / 2, z_r) * Box(
                sl - sw, wall + 2, sw
            )
            for sx3 in (-1, 1):
                solid -= floor_plane * Pos(
                    gx + sx3 * (sl - sw) / 2, wall / 2, z_r
                ) * Rot(90, 0, 0) * Cylinder(radius=sw / 2, height=wall + 2)

    # --- side vents: raked gill capsules through both cheeks, hood zone ---
    # Slots run parallel to the hood cap (the CRT top-vent read, on the
    # side plates), stacked from just under the cap toward the hood floor.
    svw, svl = p["side_vent_slot_w"], p["side_vent_slot_len"]
    half_w = p["cabinet_width"] / 2
    u_dir = (cos_t, -sin_t)  # along the hood cap, toward the back
    vc_y = mrq_y + u_dir[0] * p["side_vent_center_u"]
    vc_z = mrq_z + u_dir[1] * p["side_vent_center_u"]
    tilt_deg = p["display_tilt_deg"]
    for sx in (-1, 1):
        xc = sx * (half_w - p["cheek_thickness"] / 2)
        for i in range(p["side_vent_count"]):
            # stack from just under the cap down toward the hood floor
            drop = p["side_vent_drop"] + i * p["side_vent_pitch"]
            vy = vc_y - sin_t * drop
            vz = vc_z - cos_t * drop
            slot = Pos(xc, vy, vz) * Rot(-tilt_deg, 0, 0)
            solid -= slot * Box(p["cheek_thickness"] + 6, svl - svw, svw)
            for sy3 in (-1, 1):
                solid -= slot * Pos(0, sy3 * (svl - svw) / 2, 0) * Rot(
                    0, 90, 0
                ) * Cylinder(radius=svw / 2, height=p["cheek_thickness"] + 6)

    # --- marquee nameplate recess + magnet pockets ------------------------
    mface = Plane(
        origin=(0, (chin_y + mrq_y) / 2, (chin_z + mrq_z) / 2),
        x_dir=(1, 0, 0),
        z_dir=(0, sin_t, cos_t),  # marquee face is parallel to the display face
    )
    rec = p["nameplate_recess"]
    # plain box cutter: the recess is only ~2 mm deep, so the rounded-cutter
    # edge fillet has no material to bite into (corners stay square)
    solid -= mface * Pos(0, rec / 2, 0) * Box(
        p["nameplate_w"], rec + 0.4, p["nameplate_h"]
    )
    for sx in (-1, 1):
        for sz in (-1, 1):
            solid -= mface * Pos(
                sx * p["magnet_inset_x"], p["magnet_depth"] / 2, sz * p["magnet_inset_z"]
            ) * Rot(-90, 0, 0) * Cylinder(
                radius=p["magnet_dia"] / 2, height=p["magnet_depth"] + 0.4
            )

    # --- control deck cutouts (vertical holes through the sloped deck) ---
    cut_h = wall + 4

    # control plate inlay: shallow slope-aligned recess under the whole
    # cluster (future swappable plate seat). Sketch+extrude because a box
    # corner fillet can't exceed the thin cutter's depth.
    s_slope = math.radians(p["control_deck_slope_deg"])
    nrm = (0.0, -math.sin(s_slope), math.cos(s_slope))  # deck outward normal
    cy_plate = p["control_plate_center_y"]
    lift = 0.2
    plate_plane = Plane(
        origin=(0, cy_plate + lift * nrm[1], deck_z(cy_plate) + lift * nrm[2]),
        x_dir=(1, 0, 0),
        z_dir=nrm,
    )
    with BuildSketch(plate_plane) as plate_sk:
        Rectangle(p["control_plate_w"], p["control_plate_d"])
        fillet(plate_sk.vertices(), radius=p["control_plate_radius"])
    solid -= extrude(
        plate_sk.sketch, amount=-(lift + p["control_plate_recess"] + 0.2)
    )

    deck_holes = []  # (x, y, dia) of visible control holes, for rim chamfers
    s_deg = p["control_deck_slope_deg"]  # holes cut square to the sloped deck
    for player in range(p["players"]):
        cluster_x = (player - (p["players"] - 1) / 2) * p["player_spacing"] \
            + p["cluster_offset_x"]

        # joystick: shaft hole + 4x plate mounting holes
        jx = cluster_x + p["joystick_offset_x"]
        jy = p["joystick_offset_y"]
        solid -= Pos(jx, jy, deck_z(jy)) * Rot(s_deg, 0, 0) * Cylinder(
            radius=p["joystick_shaft_hole_dia"] / 2, height=cut_h
        )
        deck_holes.append((jx, jy, p["joystick_shaft_hole_dia"] / 2))
        for sx in (-1, 1):
            for sy in (-1, 1):
                my = jy + sy * p["jlf_mount_spacing_y"] / 2
                solid -= Pos(
                    jx + sx * p["jlf_mount_spacing_x"] / 2,
                    my,
                    deck_z(my),
                ) * Rot(s_deg, 0, 0) * Cylinder(
                    radius=p["jlf_mount_hole_dia"] / 2, height=cut_h
                )

        # buttons: front row = 2 primaries (Ø30, recessed well), back row =
        # 2 secondaries (Ø24); primaries centered under the secondary span
        sec_center = p["button_grid_offset_x"] \
            + p["secondary_pitch"] * (p["secondary_count"] - 1) / 2
        for i in range(p["secondary_count"]):
            bx = cluster_x + p["button_grid_offset_x"] + i * p["secondary_pitch"]
            by = p["secondary_row_y"]
            solid -= Pos(bx, by, deck_z(by)) * Rot(s_deg, 0, 0) * Cylinder(
                radius=p["secondary_hole_dia"] / 2, height=cut_h
            )
            deck_holes.append((bx, by, p["secondary_hole_dia"] / 2))
        for i in range(p["primary_count"]):
            bx = cluster_x + sec_center \
                + (i - (p["primary_count"] - 1) / 2) * p["primary_pitch"]
            by = p["primary_row_y"]
            solid -= Pos(bx, by, deck_z(by)) * Rot(s_deg, 0, 0) * Cylinder(
                radius=p["primary_hole_dia"] / 2, height=cut_h
            )
            deck_holes.append((bx, by, p["primary_recess_dia"] / 2))
            # tactile recess well around each primary (below the plate floor)
            rd = p["primary_recess_depth"] + p["control_plate_recess"]
            solid -= Pos(bx, by, deck_z(by)) * Rot(s_deg, 0, 0) * Pos(
                0, 0, -rd / 2 + 0.1
            ) * Cylinder(
                radius=p["primary_recess_dia"] / 2, height=rd + 0.2
            )

    # start / select
    for sx in (-1, 1):
        oy = p["option_offset_y"]
        solid -= Pos(
            sx * p["option_offset_x"], oy, deck_z(oy)
        ) * Rot(s_deg, 0, 0) * Cylinder(
            radius=p["option_hole_dia"] / 2, height=cut_h
        )
        deck_holes.append(
            (sx * p["option_offset_x"], oy, p["option_hole_dia"] / 2)
        )

    # --- hole rim chamfers: 45 deg break on every visible control hole ---
    # Done with cone cutters aligned to the deck normal (edge selection on
    # the sloped-deck rims is unreliable — OCC splits them into arcs).
    # Primaries chamfer the visible Ø40 well rim, not the Ø30 through-hole.
    cham = p["hole_chamfer"]
    rec = p["control_plate_recess"]
    for hx, hy, hr in deck_holes:
        floor_pt = (hx, hy + rec * math.sin(s_slope),
                    deck_z(hy) - rec * math.cos(s_slope))
        frame = Plane(origin=floor_pt, x_dir=(1, 0, 0), z_dir=nrm)
        solid -= frame * Pos(0, 0, 0.2 - cham / 2) * Cone(
            bottom_radius=hr, top_radius=hr + cham + 0.4, height=cham + 0.4
        )

    # --- ribs -------------------------------------------------------------
    rib_z_top = deck_z(p["rib_front_margin"]) - wall  # stay under the deck
    rib_h = rib_z_top - wall
    rib_depth = p["control_deck_depth"] - p["rib_front_margin"] - p["rib_rear_margin"]
    for sx in (-1, 1):
        solid += Pos(
            sx * p["rib_offset_x"],
            p["rib_front_margin"] + rib_depth / 2,
            wall + rib_h / 2,
        ) * Box(p["rib_thickness"], rib_depth, rib_h)

    return solid


def render_views(part, size=1000):
    """Orthographic front/side/top/iso/section PNGs (shared renderer)."""
    from render import render_parts

    render_parts([(part, (0.87, 0.85, 0.80))], OUT_DIR, size=size)


def archive_run(part):
    """Copy this run's previews + params/stats to out/history/iter-NNN/.

    STEP/STL are deliberately not archived — they regenerate from PARAMS;
    meta.json keeps the full parameter snapshot for each iteration.
    """
    import json
    import shutil
    from datetime import datetime

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(HISTORY_DIR.glob("iter-*"))
    n = int(existing[-1].name.split("-")[1]) + 1 if existing else 1
    dest = HISTORY_DIR / f"iter-{n:03d}"
    dest.mkdir()
    for f in sorted(OUT_DIR.glob("view_*.png")):
        shutil.copy2(f, dest / f.name)
    bbox = part.bounding_box()
    meta = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "valid": part.is_valid,
        "solids": len(part.solids()),
        "bbox_mm": [
            round(bbox.max.X - bbox.min.X, 1),
            round(bbox.max.Y - bbox.min.Y, 1),
            round(bbox.max.Z - bbox.min.Z, 1),
        ],
        "volume_cm3": round(part.volume / 1000, 1),
        "params": PARAMS,
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2))
    return dest.name


def main():
    OUT_DIR.mkdir(exist_ok=True)
    part = build_cabinet()
    print(f"solid valid: {part.is_valid}, solids: {len(part.solids())}")
    bbox = part.bounding_box()
    print(
        f"bounding box: {bbox.max.X - bbox.min.X:.1f} x "
        f"{bbox.max.Y - bbox.min.Y:.1f} x {bbox.max.Z - bbox.min.Z:.1f} mm"
    )
    print(f"volume: {part.volume / 1000:.0f} cm^3")

    export_step(part, str(OUT_DIR / "bartop.step"))
    export_stl(part, str(OUT_DIR / "bartop.stl"))
    print(f"exported STEP + STL to {OUT_DIR}")

    render_views(part)
    print(f"exported previews to {OUT_DIR}")

    name = archive_run(part)
    print(f"archived run to {HISTORY_DIR / name}")


if __name__ == "__main__":
    main()
