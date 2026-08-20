"""ArcadeBench assembly — enclosure + BOM component models, assembled renders.

Places every catalog component (hardware/components.py) inside/around the
cabinet shell and renders assembled views (asm_*) plus components-only views
(guts_*). The enclosure itself is unchanged — this is a fit/richness check
ahead of the v1 structural work (mounts, retainer, cutouts).

Run:  hardware/.venv/bin/python hardware/assembly.py
Out:  hardware/out/asm_*.png, guts_*.png + out/history/asm-NNN/
"""

import json
import math
import shutil
from datetime import datetime

from build123d import Plane, Pos, Rot

import components as comp
from cabinet import HISTORY_DIR, OUT_DIR, PARAMS as CAB, build_cabinet, side_profile
from render import render_parts

CREAM = (0.87, 0.85, 0.80)

LAYOUT = {
    # --- display stack ---------------------------------------------------
    "panel_gap": 0.5,            # mm between the doubler ring and panel glass
    # --- interior boards (floor-mounted, z = wall) ------------------------
    "sbc_pos": (0.0, 272.0),     # x, y of board center; rides the spine rails
    "encoder_pos": (0.0, 110.0),
    "amp_pos": (-100.0, 300.0),
    "buck_pos": (-100.0, 262.0),  # iter 32: cleared the spine-rail zone
    # --- chassis (brief 4.1: minimal spine + top bracket; the side plates
    #     carry the structure, the chassis only mounts equipment) -----------
    "rail_spacing": 90.0,        # x between spine-rail vertical legs
    "rail_len": 130.0,           # spans y 197..327: clears the rear floor
                                 #   fillet (flat to y=330), supports the SBC
    "rail_y": 262.0,
    "rail_leg": 20.0,            # 20x20x1.5 angle; SBC rides the leg tops
    "top_bracket_u": 120.0,      # mm from the marquee top along the hood cap
    "top_bracket_len": 292.0,    # clears the side-flange zone (|x| > 147)
    # --- speakers -----------------------------------------------------------
    "speaker_height": 22.0,      # 2" driver stack height (catalog bbox)
    "speaker_gasket": 2.0,       # foam seal under the flange; also clears the
                                 # hood corner fillets (speaker_scan.py)
    # --- rear panel (outer surface y = cabinet_depth_base) ----------------
    "power_switch_xz": (130.0, 40.0),
    "dc_jack_xz": (-130.0, 40.0),
    "usbc_xz": (-95.0, 40.0),
    # --- externals ---------------------------------------------------------
    "psu_offset_y": 45.0,        # mm behind the rear wall
    "foot_inset_x": 40.0,
    "foot_inset_y": 40.0,
    # --- colorway -----------------------------------------------------------
    "p1_color": comp.WHITE,
    "p2_color": comp.RED,
    "option_color": comp.BLACK,
}


def deck_z(y):
    """Outer deck surface height at distance y from the front edge."""
    seam_y = CAB["control_deck_depth"]
    seam_z = CAB["control_deck_height"]
    nose_z = seam_z - math.tan(math.radians(CAB["control_deck_slope_deg"])) * seam_y
    return nose_z + (seam_z - nose_z) * (y / seam_y)


def display_face_plane():
    """Cabinet display-face frame: X across, Y through-wall into the
    cabinet, Z up-slope (same convention as cabinet.py)."""
    t = math.radians(CAB["display_tilt_deg"])
    sin_t, cos_t = math.sin(t), math.cos(t)
    u_ctr = CAB["screen_center_frac"] * CAB["display_face_length"]
    ctr_y = CAB["control_deck_depth"] + u_ctr * sin_t
    ctr_z = CAB["control_deck_height"] + u_ctr * cos_t
    return Plane(origin=(0, ctr_y, ctr_z), x_dir=(1, 0, 0), z_dir=(0, sin_t, cos_t))


def place_components():
    """Return (items, records, groups): items = [(shape, color)] for
    rendering, records = [{name, at}] for the archive meta, groups =
    [(name, [shape, ...])] for fit checks (shapes in world coords)."""
    items, records, groups = [], [], []

    def add(name, placed_parts, at):
        items.extend(placed_parts)
        records.append({"name": name, "at": [round(v, 1) for v in at]})
        groups.append((name, [s for s, _ in placed_parts]))

    wall = CAB["wall"]

    # --- display stack (on the tilted face frame) -------------------------
    face = display_face_plane()
    # iter 32 (chassis brief 4.4): the PC window + 4:3 mask moved OUT of the
    # shell into the printed CRT bezel; the LCD clamps against the doubler
    # ring by the retainer frame. Stack: PC window -> bezel -> shell window
    # -> panel -> retainer.
    panel_off = (
        wall + CAB["doubler_thickness"] + LAYOUT["panel_gap"]
        + CAB["panel_thickness"] / 2
    )

    _, panel_parts, _ = comp.display_panel()
    add(
        "display_panel",
        [(face * Pos(0, panel_off, 0) * s, c) for s, c in panel_parts],
        (0, panel_off, 0),
    )

    from parts import BEZEL, crt_bezel, retainer_frame

    # CRT bezel on the OUTER face: local +Z (toward the viewer) maps to the
    # face frame's -Y (outward); rear face flush with the shell
    add(
        "crt_bezel",
        [(face * Rot(90, 0, 0) * crt_bezel(), (0.05, 0.05, 0.06))],
        (0, 0.0, 0),
    )

    # PC window friction-fit in the bezel's front pocket; the sheet is
    # transparent in reality and the renderer has no alpha, so record it
    # but don't render it (it would hide the panel)
    pc_off = -(BEZEL["depth"] - (CAB["polycarb_thickness"] + 0.2) / 2)
    records.append({"name": "polycarb_sheet", "at": [0, round(pc_off, 1), 0]})

    # clamp frame pressing the panel against the doubler ring (parts.py)
    frame_off = (
        wall + CAB["doubler_thickness"] + LAYOUT["panel_gap"]
        + CAB["panel_thickness"]
    )
    add(
        "retainer_frame",
        [(face * Pos(0, frame_off, 0) * Rot(-90, 0, 0) * retainer_frame(),
          (0.30, 0.30, 0.33))],
        (0, frame_off, 0),
    )

    # --- inserts: magnetic nameplate + control plate (distinct objects) ---
    t_tilt0 = math.radians(CAB["display_tilt_deg"])
    st0, ct0 = math.sin(t_tilt0), math.cos(t_tilt0)
    _, _, np_info = side_profile(CAB)
    mface = Plane(
        origin=(
            0,
            (np_info["chin_y"] + np_info["mrq_y"]) / 2,
            (np_info["chin_z"] + np_info["mrq_z"]) / 2,
        ),
        x_dir=(1, 0, 0),
        z_dir=(0, st0, ct0),
    )
    _, np_parts, _ = comp.nameplate_insert()
    add(
        "nameplate_insert",
        [(mface * Pos(0, 0.1, 0) * Rot(-90, 0, 0) * s, c) for s, c in np_parts],
        (0, 0.1, 0),
    )

    # control plate: local-frame insert placed via the slope-aligned deck
    # plane; origin 1.0 mm below the deck surface along the normal seats the
    # plate's top face (local z = t = 0.8) at the designed 0.2 mm setback
    s_slope0 = math.radians(CAB["control_deck_slope_deg"])
    nrm = (0.0, -math.sin(s_slope0), math.cos(s_slope0))  # deck outward normal
    cy0 = CAB["control_plate_center_y"]
    cplane = Plane(
        origin=(
            0,
            cy0 + math.sin(s_slope0),
            deck_z(cy0) - math.cos(s_slope0),
        ),
        x_dir=(1, 0, 0),
        z_dir=nrm,
    )
    _, cp_parts, _ = comp.control_plate()
    add(
        "control_plate",
        [(cplane * s, c) for s, c in cp_parts],
        (0, cy0, deck_z(cy0)),
    )

    # --- control deck -------------------------------------------------------
    for player in range(CAB["players"]):
        cluster_x = (player - (CAB["players"] - 1) / 2) * CAB["player_spacing"] \
            + CAB["cluster_offset_x"]
        color = LAYOUT["p1_color"] if player == 0 else LAYOUT["p2_color"]

        # joystick: origin at plate top. The plate is flat but the deck
        # slopes, so seat the plate's FRONT edge flush with the panel
        # underside (rear edge ends up ~4 mm deep — v1 gets a flat pocket).
        jx = cluster_x + CAB["joystick_offset_x"]
        jy = CAB["joystick_offset_y"]
        _, stick_parts, stick_dims = comp.joystick_jlf(ball_color=color)
        plate_front_y = jy - stick_dims["plate_d"] / 2
        jz = deck_z(plate_front_y) - wall
        add(
            f"joystick_p{player + 1}",
            [(Pos(jx, jy, jz) * s, c) for s, c in stick_parts],
            (jx, jy, jz),
        )

        # buttons: 2 primaries (red, front row) + 2 secondaries (white);
        # seated square to the sloped deck (holes are cut the same way)
        s_seat = CAB["control_deck_slope_deg"]
        for i in range(CAB["secondary_count"]):
            bx = cluster_x + CAB["button_grid_offset_x"] + i * CAB["secondary_pitch"]
            by = CAB["secondary_row_y"]
            _, btn_parts, _ = comp.button_obsf24(color=comp.WHITE)
            add(
                f"secondary_p{player + 1}_{i}",
                [(Pos(bx, by, deck_z(by)) * Rot(s_seat, 0, 0) * s, c)
                 for s, c in btn_parts],
                (bx, by, deck_z(by)),
            )
        sec_center = CAB["button_grid_offset_x"] \
            + CAB["secondary_pitch"] * (CAB["secondary_count"] - 1) / 2
        for i in range(CAB["primary_count"]):
            bx = cluster_x + sec_center \
                + (i - (CAB["primary_count"] - 1) / 2) * CAB["primary_pitch"]
            by = CAB["primary_row_y"]
            _, btn_parts, _ = comp.button_obsf30(color=comp.RED)
            add(
                f"primary_p{player + 1}_{i}",
                [(Pos(bx, by, deck_z(by)) * Rot(s_seat, 0, 0) * s, c)
                 for s, c in btn_parts],
                (bx, by, deck_z(by)),
            )

    # start / select
    for sx in (-1, 1):
        oy = CAB["option_offset_y"]
        _, opt_parts, _ = comp.button_obsf24(color=LAYOUT["option_color"])
        add(
            f"option_{'sel' if sx < 0 else 'start'}",
            [(Pos(sx * CAB["option_offset_x"], oy, deck_z(oy))
              * Rot(CAB["control_deck_slope_deg"], 0, 0) * s, c)
             for s, c in opt_parts],
            (sx * CAB["option_offset_x"], oy, deck_z(oy)),
        )

    # --- interior boards ------------------------------------------------------
    for name, builder in (
        ("sbc", comp.sbc),
        ("encoder", comp.encoder_esp32),
        ("amp", comp.amp_pam8610),
        ("buck", comp.buck_converter),
    ):
        x, y = LAYOUT[f"{name}_pos"]
        # the SBC rides the spine-rail leg tops (brief 4.2 bottom spine)
        z0 = wall + LAYOUT["rail_leg"] if name == "sbc" else wall
        _, board_parts, _ = builder()
        add(name, [(Pos(x, y, z0) * s, c) for s, c in board_parts], (x, y, z0))

    # --- chassis: bottom spine rails (brief 4.2) ----------------------------
    for sx in (-1, 1):
        _, rail_parts, _ = comp.angle_rail(
            length=LAYOUT["rail_len"], leg=LAYOUT["rail_leg"]
        )
        place = Pos(sx * LAYOUT["rail_spacing"] / 2, LAYOUT["rail_y"], wall)
        if sx > 0:
            place = place * Rot(0, 0, 180)  # horizontal leg points outward
        add(
            f"spine_rail_{'l' if sx < 0 else 'r'}",
            [(place * s, c) for s, c in rail_parts],
            (sx * LAYOUT["rail_spacing"] / 2, LAYOUT["rail_y"], wall),
        )

    # speakers: inside the hood, cone tilted with the floor, firing down at
    # the player through the hood-floor slots. The flipped speaker stack
    # occupies [-height, 0] below its placement point along the tilted axis,
    # so place the stack TOP one height above the floor's inner surface
    # (inner normal = (sin_t, cos_t), back-up into the hood).
    t_tilt = math.radians(CAB["display_tilt_deg"])
    sin_t, cos_t = math.sin(t_tilt), math.cos(t_tilt)
    _, _, sinfo = side_profile(CAB)
    spk_off = CAB["hood_speaker_offset"]
    lift = wall + LAYOUT["speaker_gasket"] + LAYOUT["speaker_height"]
    spk_y = sinfo["chin_y"] + cos_t * spk_off + sin_t * lift
    spk_z = sinfo["chin_z"] - sin_t * spk_off + cos_t * lift
    for sx in (-1, 1):
        x = sx * CAB["hood_speaker_spacing"] / 2
        _, spk_parts, _ = comp.speaker_2in()
        add(
            f"speaker_{'l' if sx < 0 else 'r'}",
            [
                (
                    Pos(x, spk_y, spk_z)
                    * Rot(-CAB["display_tilt_deg"], 0, 0)
                    * Rot(180, 0, 0)
                    * s,
                    c,
                )
                for s, c in spk_parts
            ],
            (x, spk_y, spk_z),
        )

    # --- top bracket + display driver board (brief 4.3) -------------------
    # U-channel across the hood, top face against the cap's inner surface;
    # the driver board hangs flat against the bracket floor. Local frame:
    # Rot(-tilt) maps +Z onto the cap normal and +Y along the cap.
    u_dir = (cos_t, -sin_t)         # along the hood cap toward the back
    n_cap = (sin_t, cos_t)          # cap outward normal
    tb_u = LAYOUT["top_bracket_u"]
    tb_y = sinfo["mrq_y"] + u_dir[0] * tb_u - n_cap[0] * wall
    tb_z = sinfo["mrq_z"] + u_dir[1] * tb_u - n_cap[1] * wall
    tb_frame = Pos(0, tb_y, tb_z) * Rot(-CAB["display_tilt_deg"], 0, 0)
    _, tb_parts, tb_dims = comp.u_channel(length=LAYOUT["top_bracket_len"])
    add(
        "top_bracket",
        [(tb_frame * s, c) for s, c in tb_parts],
        (0, tb_y, tb_z),
    )
    _, db_parts, _ = comp.driver_board()
    db_drop = tb_dims["h"] + 4.0    # bracket leg height + half the board
    add(
        "driver_board",
        [(tb_frame * Pos(0, 0, -db_drop) * s, c) for s, c in db_parts],
        (0, tb_y, tb_z),
    )

    # --- rear panel (origin at outer surface, body into the cabinet) --------
    back_y = CAB["cabinet_depth_base"]
    for name, key, builder in (
        ("power_switch", "power_switch_xz", comp.power_switch_19mm),
        ("dc_jack", "dc_jack_xz", comp.dc_jack),
        ("usbc_passthrough", "usbc_xz", comp.usbc_passthrough),
    ):
        x, z = LAYOUT[key]
        _, jack_parts, _ = builder()
        add(
            name,
            [(Pos(x, back_y, z) * Rot(-90, 0, 0) * s, c) for s, c in jack_parts],
            (x, back_y, z),
        )

    # --- externals ------------------------------------------------------------
    _, psu_parts, _ = comp.psu_brick()
    psu_y = back_y + LAYOUT["psu_offset_y"]
    add("psu_brick", [(Pos(0, psu_y, 0) * s, c) for s, c in psu_parts], (0, psu_y, 0))

    fx = CAB["cabinet_width"] / 2 - LAYOUT["foot_inset_x"]
    fy = LAYOUT["foot_inset_y"]
    for i, (x, y) in enumerate(
        ((-fx, fy), (fx, fy), (-fx, back_y - fy), (fx, back_y - fy))
    ):
        _, foot_parts, foot_dims = comp.rubber_foot()
        fh = foot_dims["h"]
        add(f"foot_{i}", [(Pos(x, y, -fh) * s, c) for s, c in foot_parts], (x, y, -fh))

    return items, records, groups


def archive_run(records):
    """Copy this run's assembly renders + layout to out/history/asm-NNN/."""
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(HISTORY_DIR.glob("asm-*"))
    n = int(existing[-1].name.split("-")[1]) + 1 if existing else 1
    dest = HISTORY_DIR / f"asm-{n:03d}"
    dest.mkdir()
    for f in sorted(OUT_DIR.glob("asm_*.png")) + sorted(OUT_DIR.glob("guts_*.png")):
        shutil.copy2(f, dest / f.name)
    meta = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "components": records,
        "layout": {k: v for k, v in LAYOUT.items()},
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2, default=str))
    return dest.name


def main():
    OUT_DIR.mkdir(exist_ok=True)
    shell = build_cabinet()
    print(f"enclosure valid: {shell.is_valid}, solids: {len(shell.solids())}")

    items, records, _ = place_components()
    print(f"placed {len(records)} components")

    render_parts([(shell, CREAM)] + items, OUT_DIR, prefix="asm")
    render_parts(items, OUT_DIR, prefix="guts", views={"iso": (25, -60, None), "top": (89.9, -90, None)})
    print(f"exported assembly previews to {OUT_DIR}")

    name = archive_run(records)
    print(f"archived run to {HISTORY_DIR / name}")


if __name__ == "__main__":
    main()
