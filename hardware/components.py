"""Parametric 3D component catalog for the ArcadeBench bartop cabinet.

One builder per BOM component. Each returns:

    (name, parts, dims)

- name:  str, snake_case identifier
- parts: list of (shape, (r, g, b)) tuples for render.render_parts
- dims:  dict of every dimension used, in mm (no magic numbers)

Each builder documents its local frame (origin + axes) in its docstring.
All geometry in millimeters. Colors are floats 0-1.

Estimated dimensions (not from a datasheet) are marked with # ESTIMATED.
"""

from build123d import (
    Box,
    BuildSketch,
    Cylinder,
    Plane,
    Pos,
    Rectangle,
    Rot,
    Sphere,
    extrude,
    fillet,
)

# --- color constants (r, g, b) 0-1 -----------------------------------------
GLASS = (0.10, 0.11, 0.13)      # dark charcoal display glass
GLASS_ACTIVE = (0.20, 0.23, 0.28)  # lighter active-area face
PCB = (0.08, 0.35, 0.12)        # classic solder-mask green
PCB_BLUE = (0.10, 0.15, 0.55)
ALU = (0.75, 0.76, 0.78)        # anodized aluminium
ZINC = (0.65, 0.67, 0.70)       # zinc-plated steel
STEEL = (0.55, 0.56, 0.60)
BLACK = (0.05, 0.05, 0.05)
RED = (0.75, 0.08, 0.08)
WHITE = (0.93, 0.90, 0.82)      # cream
DARK = (0.15, 0.15, 0.17)
BRASS = (0.72, 0.53, 0.20)
POLYCARB = (0.75, 0.78, 0.80)   # translucent-look light gray
CONE_GRAY = (0.25, 0.25, 0.27)


def display_panel():
    """13.5" 3:2 hi-DPI IPS panel (3004x2000, Surface-class kit), glass only.

    Frame: origin at glass center. X = width (296), Z = height (206),
    Y = thickness. The viewable face looks toward -Y (viewer side).
    The HDMI driver board is a separate component (driver_board) — the
    chassis brief mounts it on the top bracket, not on the panel.
    """
    dims = {
        "glass_w": 296.0,
        "glass_h": 206.0,
        "glass_t": 5.0,           # slim laptop-class panel # ESTIMATED
        "active_w": 285.0,
        "active_h": 190.0,
        "active_t": 0.4,          # cosmetic face plate thickness # ESTIMATED
        "active_recess": 0.2,     # face recessed below glass surface # ESTIMATED
    }
    glass = Box(dims["glass_w"], dims["glass_t"], dims["glass_h"])
    active = Pos(
        0, -(dims["glass_t"] / 2 - dims["active_recess"] - dims["active_t"] / 2), 0
    ) * Box(dims["active_w"], dims["active_t"], dims["active_h"])
    parts = [(glass, GLASS), (active, GLASS_ACTIVE)]
    return "display_panel", parts, dims


def driver_board():
    """HDMI/eDP driver board for the 13.5" panel kit.

    Frame: origin at board center. X = 100 (across the cabinet when
    mounted on the top bracket), Y = 55, Z = 8.
    """
    dims = {
        "board_w": 100.0,
        "board_d": 55.0,
        "board_h": 8.0,           # tallest component on the board # ESTIMATED
    }
    board = Box(dims["board_w"], dims["board_d"], dims["board_h"])
    return "driver_board", [(board, PCB)], dims


def angle_rail(length=140.0, leg=20.0, t=1.5):
    """Aluminum angle rail (chassis spine member), 20x20x1.5 L-section.

    Frame: origin at the bottom face center, rail running along Y.
    Vertical leg at x ~ 0, horizontal leg extending toward -X (mirror
    with Rot(0, 0, 180) for the opposite side).
    """
    dims = {"length": length, "leg": leg, "t": t}
    vert = Pos(0, 0, leg / 2) * Box(t, length, leg)
    horiz = Pos(-(leg - t) / 2, 0, t / 2) * Box(leg, length, t)
    rail = vert + horiz
    return "angle_rail", [(rail, ALU)], dims


def u_channel(length=292.0, w=25.0, h=20.0, t=1.5):
    """Aluminum U-channel (top bracket), open side down.

    Frame: origin at the center of the TOP outer face (the face that
    bolts to the hood cap), channel running along X, body below (-Z).
    """
    dims = {"length": length, "w": w, "h": h, "t": t}
    top = Pos(0, 0, -t / 2) * Box(length, w, t)
    channel = top
    for sy in (-1, 1):
        channel += Pos(0, sy * (w - t) / 2, -h / 2) * Box(length, t, h)
    return "u_channel", [(channel, ALU)], dims


def polycarb_sheet(w=300.0, h=300.0, t=2.5):
    """Plain translucent-look polycarbonate sheet.

    Frame: origin at sheet center. X = w, Y = h, Z = thickness (t).
    """
    dims = {"w": w, "h": h, "t": t}
    sheet = Box(dims["w"], dims["h"], dims["t"])
    return "polycarb_sheet", [(sheet, POLYCARB)], dims


def joystick_jlf(ball_color=RED):
    """Sanwa JLF-TP-8YT joystick with JLF-P1 mounting plate.

    Frame: origin at mounting-plate top center (i.e. the panel underside
    when mounted from below). +Z up through the panel toward the player.
    Plate, body, shaft and ball are all centered on the Z axis.
    """
    dims = {
        "plate_w": 95.0,
        "plate_d": 53.0,
        "plate_t": 1.6,
        "body_dia": 45.0,
        "body_h": 40.0,
        "shaft_dia": 8.0,
        "shaft_h": 28.0,          # exposed length above plate top
        "ball_dia": 35.0,
        "ball_thread_depth": 8.0,  # shaft screws into ball # ESTIMATED
    }
    plate = Pos(0, 0, -dims["plate_t"] / 2) * Box(
        dims["plate_w"], dims["plate_d"], dims["plate_t"]
    )
    body = Pos(0, 0, -dims["plate_t"] - dims["body_h"] / 2) * Cylinder(
        dims["body_dia"] / 2, dims["body_h"]
    )
    shaft = Pos(0, 0, dims["shaft_h"] / 2) * Cylinder(
        dims["shaft_dia"] / 2, dims["shaft_h"]
    )
    ball_z = dims["shaft_h"] + dims["ball_dia"] / 2 - dims["ball_thread_depth"]
    ball = Pos(0, 0, ball_z) * Sphere(dims["ball_dia"] / 2)
    parts = [(plate, ZINC), (body, DARK), (shaft, STEEL), (ball, ball_color)]
    return "joystick_jlf", parts, dims


def button_obsf30(color=RED):
    """Sanwa OBSF-30 snap-in pushbutton (30 mm class).

    Frame: origin at deck (panel) surface on the button axis, +Z up.
    Bezel and plunger sit above the panel, body below it.
    """
    dims = {
        "bezel_dia": 36.5,
        "bezel_h": 3.0,
        "plunger_dia": 28.0,
        "plunger_h": 4.0,
        "plunger_base": 0.5,       # plunger starts slightly above deck # ESTIMATED
        "dome_dia": 16.0,          # spherical dome hint on plunger # ESTIMATED
        "body_dia": 30.0,
        "body_h": 25.0,
        "nub_w": 10.0,             # microswitch nub
        "nub_d": 16.0,
        "nub_h": 8.0,
    }
    bezel = Pos(0, 0, dims["bezel_h"] / 2) * Cylinder(
        dims["bezel_dia"] / 2, dims["bezel_h"]
    )
    plunger = Pos(
        0, 0, dims["plunger_base"] + dims["plunger_h"] / 2
    ) * Cylinder(dims["plunger_dia"] / 2, dims["plunger_h"])
    dome = Pos(
        0, 0, dims["plunger_base"] + dims["plunger_h"]
    ) * Sphere(dims["dome_dia"] / 2)
    body = Pos(0, 0, -dims["body_h"] / 2) * Cylinder(
        dims["body_dia"] / 2, dims["body_h"]
    )
    nub = Pos(0, 0, -dims["body_h"] - dims["nub_h"] / 2) * Box(
        dims["nub_w"], dims["nub_d"], dims["nub_h"]
    )
    parts = [
        (bezel, color),
        (plunger, color),
        (dome, color),
        (body, BLACK),
        (nub, DARK),
    ]
    return "button_obsf30", parts, dims


def button_obsf24(color=WHITE):
    """Sanwa OBSF-24 snap-in pushbutton (24 mm class).

    Frame: origin at deck (panel) surface on the button axis, +Z up.
    """
    dims = {
        "bezel_dia": 28.0,
        "bezel_h": 2.5,
        "plunger_dia": 20.0,       # ESTIMATED
        "plunger_h": 3.0,          # ESTIMATED
        "plunger_base": 0.5,       # ESTIMATED
        "body_dia": 24.0,
        "body_h": 22.0,
    }
    bezel = Pos(0, 0, dims["bezel_h"] / 2) * Cylinder(
        dims["bezel_dia"] / 2, dims["bezel_h"]
    )
    plunger = Pos(
        0, 0, dims["plunger_base"] + dims["plunger_h"] / 2
    ) * Cylinder(dims["plunger_dia"] / 2, dims["plunger_h"])
    body = Pos(0, 0, -dims["body_h"] / 2) * Cylinder(
        dims["body_dia"] / 2, dims["body_h"]
    )
    parts = [(bezel, color), (plunger, color), (body, BLACK)]
    return "button_obsf24", parts, dims


def encoder_esp32():
    """ESP32-S3 dev board (USB encoder) with USB-C connector nub.

    Frame: origin at board bottom center, +Z up. X = length (53, USB-C
    on the +X short edge), Y = width (25).
    """
    dims = {
        "board_w": 53.0,
        "board_d": 25.0,
        "board_h": 7.0,
        "usbc_w": 3.5,             # along X, sticking out # ESTIMATED
        "usbc_d": 9.0,             # ESTIMATED
        "usbc_h": 3.5,             # ESTIMATED
        "usbc_z": 2.5,             # connector center height # ESTIMATED
    }
    board = Pos(0, 0, dims["board_h"] / 2) * Box(
        dims["board_w"], dims["board_d"], dims["board_h"]
    )
    usbc = Pos(
        dims["board_w"] / 2 + dims["usbc_w"] / 2, 0, dims["usbc_z"]
    ) * Box(dims["usbc_w"], dims["usbc_d"], dims["usbc_h"])
    parts = [(board, PCB_BLUE), (usbc, STEEL)]
    return "encoder_esp32", parts, dims


def sbc():
    """ODROID H4+ class x86 SBC with passive heatsink and SO-DIMM.

    Frame: origin at board bottom center, +Z up. X = Y = 110 (square board).
    Heatsink sits on top of the board; SO-DIMM lies flat toward -Y.
    """
    dims = {
        "board_w": 110.0,
        "board_d": 110.0,
        "board_t": 1.6,
        "heatsink_w": 75.0,
        "heatsink_d": 75.0,
        "heatsink_h": 22.0,
        "sodimm_w": 68.0,
        "sodimm_d": 30.0,
        "sodimm_t": 4.0,
        "sodimm_y": -30.0,         # ESTIMATED placement toward back edge
    }
    board = Pos(0, 0, dims["board_t"] / 2) * Box(
        dims["board_w"], dims["board_d"], dims["board_t"]
    )
    heatsink = Pos(
        0, 0, dims["board_t"] + dims["heatsink_h"] / 2
    ) * Box(dims["heatsink_w"], dims["heatsink_d"], dims["heatsink_h"])
    sodimm = Pos(
        0,
        dims["sodimm_y"],
        dims["board_t"] + dims["sodimm_t"] / 2,
    ) * Box(dims["sodimm_w"], dims["sodimm_d"], dims["sodimm_t"])
    parts = [(board, PCB), (heatsink, ALU), (sodimm, DARK)]
    return "sbc", parts, dims


def amp_pam8610():
    """PAM8610 2x15W class-D amplifier board.

    Frame: origin at board bottom center, +Z up. X = 40, Y = 30.
    """
    dims = {"board_w": 40.0, "board_d": 30.0, "board_h": 8.0}
    board = Pos(0, 0, dims["board_h"] / 2) * Box(
        dims["board_w"], dims["board_d"], dims["board_h"]
    )
    return "amp_pam8610", [(board, PCB)], dims


def buck_converter():
    """LM2596-class buck converter board.

    Frame: origin at board bottom center, +Z up. X = 45, Y = 22.
    """
    dims = {"board_w": 45.0, "board_d": 22.0, "board_h": 12.0}
    board = Pos(0, 0, dims["board_h"] / 2) * Box(
        dims["board_w"], dims["board_d"], dims["board_h"]
    )
    return "buck_converter", [(board, PCB_BLUE)], dims


def speaker_2in():
    """2" full-range driver (Dayton ND50 / Visaton FRS 5 class).

    Sized down from the ND64 2.5" pick: a 64 mm frame cannot fit the 57 mm
    hood floor (it would poke past the chin and the rear wall). Frame: origin
    at magnet bottom center, +Z up toward the cone. Magnet at the bottom,
    basket/flange above it, cone hint in between.
    """
    dims = {
        "magnet_dia": 26.0,
        "magnet_h": 15.0,
        "basket_dia": 52.0,
        "basket_h": 7.0,
        "cone_dia": 40.0,
        "cone_h": 5.0,
    }
    magnet = Pos(0, 0, dims["magnet_h"] / 2) * Cylinder(
        dims["magnet_dia"] / 2, dims["magnet_h"]
    )
    basket = Pos(
        0, 0, dims["magnet_h"] + dims["basket_h"] / 2
    ) * Cylinder(dims["basket_dia"] / 2, dims["basket_h"])
    cone = Pos(
        0, 0, dims["magnet_h"] + dims["basket_h"] - dims["cone_h"] / 2
    ) * Cylinder(dims["cone_dia"] / 2, dims["cone_h"])
    parts = [(magnet, BLACK), (basket, DARK), (cone, CONE_GRAY)]
    return "speaker_2in", parts, dims


def nameplate_insert():
    """Magnetic marquee nameplate insert (charcoal anodized aluminum).

    Sits in the cabinet's 200x48x1.5 recess with a 0.6 mm perimeter gap and
    0.1 mm setback. Frame: origin at center, X width, Y height, Z thickness
    (extrude direction = through the marquee wall, handled by the caller's
    plane).
    """
    dims = {"w": 198.8, "h": 46.8, "t": 1.4, "corner_r": 3.5}
    with BuildSketch(Plane.XY) as sk:
        Rectangle(dims["w"], dims["h"])
        fillet(sk.vertices(), radius=dims["corner_r"])
    plate = extrude(sk.sketch, amount=dims["t"])
    return "nameplate_insert", [(plate, DARK)], dims


def control_plate():
    """Removable control-surface inlay (dark anodized), 0.8 mm thick.

    Sized from the deck's control_plate recess with a 1 mm perimeter gap
    and 0.2 mm setback. Frame: LOCAL to the plate — origin at the plate
    center, z 0..t (assembly seats the top face 0.2 mm below the deck
    surface via the slope-aligned deck plane); holes match the cabinet
    control cutouts relative to the plate center (primaries opened to
    the well diameter so the tactile wells stay visible).
    """
    from cabinet import PARAMS as CAB

    dims = {
        "w": CAB["control_plate_w"] - 2.0,
        "d": CAB["control_plate_d"] - 2.0,
        "t": 0.8,
        "corner_r": CAB["control_plate_radius"] + 3.5,
    }
    cy = CAB["control_plate_center_y"]
    with BuildSketch(Plane.XY) as sk:
        Rectangle(dims["w"], dims["d"])
        fillet(sk.vertices(), radius=dims["corner_r"])
    plate = extrude(sk.sketch, amount=dims["t"])
    cut_h = dims["t"] + 2

    def hole(x, y, dia):
        nonlocal plate
        plate -= Pos(x, y - cy, dims["t"] / 2) * Cylinder(radius=dia / 2, height=cut_h)

    for player in range(CAB["players"]):
        cx = (player - (CAB["players"] - 1) / 2) * CAB["player_spacing"] \
            + CAB["cluster_offset_x"]
        hole(cx + CAB["joystick_offset_x"], CAB["joystick_offset_y"], 30.0)
        for i in range(CAB["secondary_count"]):
            hole(cx + CAB["button_grid_offset_x"] + i * CAB["secondary_pitch"],
                 CAB["secondary_row_y"], CAB["secondary_hole_dia"] + 1.0)
        sec_center = CAB["button_grid_offset_x"] \
            + CAB["secondary_pitch"] * (CAB["secondary_count"] - 1) / 2
        for i in range(CAB["primary_count"]):
            hole(
                cx + sec_center
                + (i - (CAB["primary_count"] - 1) / 2) * CAB["primary_pitch"],
                CAB["primary_row_y"],
                CAB["primary_recess_dia"] + 0.4,  # reveal the tactile wells
            )
    for sx in (-1, 1):
        hole(sx * CAB["option_offset_x"], CAB["option_offset_y"],
             CAB["option_hole_dia"] + 1.0)
    return "control_plate", [(plate, DARK)], dims


def power_switch_19mm():
    """Bulgin MPI002 class 19 mm vandal-resistant pushbutton switch.

    Frame: origin at the panel outer surface on the switch axis, +Z
    pointing outward (away from the cabinet). Bezel above the surface,
    threaded body below (inside the cabinet).
    """
    dims = {
        "bezel_dia": 22.0,
        "bezel_h": 3.0,
        "body_dia": 19.0,
        "body_h": 25.0,
    }
    bezel = Pos(0, 0, dims["bezel_h"] / 2) * Cylinder(
        dims["bezel_dia"] / 2, dims["bezel_h"]
    )
    body = Pos(0, 0, -dims["body_h"] / 2) * Cylinder(
        dims["body_dia"] / 2, dims["body_h"]
    )
    parts = [(bezel, STEEL), (body, DARK)]
    return "power_switch_19mm", parts, dims


def dc_jack():
    """Panel-mount 5.5 x 2.5 mm DC barrel jack.

    Frame: origin at the panel outer surface on the jack axis, +Z
    pointing outward. Hex nut (approximated as a cylinder) outside,
    body inside the cabinet.
    """
    dims = {
        "nut_dia": 14.0,           # across-flats approximated as cylinder # ESTIMATED
        "nut_h": 4.0,
        "body_dia": 11.0,
        "body_h": 20.0,
    }
    nut = Pos(0, 0, dims["nut_h"] / 2) * Cylinder(
        dims["nut_dia"] / 2, dims["nut_h"]
    )
    body = Pos(0, 0, -dims["body_h"] / 2) * Cylinder(
        dims["body_dia"] / 2, dims["body_h"]
    )
    parts = [(nut, ZINC), (body, BLACK)]
    return "dc_jack", parts, dims


def usbc_passthrough():
    """Panel-mount USB-C passthrough coupler block.

    Frame: origin at block center. X = 30 (long axis), Y = 14, Z = 12.
    """
    dims = {"w": 30.0, "d": 14.0, "h": 12.0}
    block = Box(dims["w"], dims["d"], dims["h"])
    return "usbc_passthrough", [(block, BLACK)], dims


def psu_brick():
    """External 65W laptop-style power brick with cable stub.

    Frame: origin at brick bottom center, +Z up. X = length (108),
    Y = width (46). Cable stub exits the +X end face horizontally.
    """
    dims = {
        "brick_w": 108.0,
        "brick_d": 46.0,
        "brick_h": 30.0,
        "cable_dia": 5.0,          # ESTIMATED
        "cable_len": 30.0,         # stub length # ESTIMATED
    }
    brick = Pos(0, 0, dims["brick_h"] / 2) * Box(
        dims["brick_w"], dims["brick_d"], dims["brick_h"]
    )
    cable = Pos(
        dims["brick_w"] / 2 + dims["cable_len"] / 2, 0, dims["brick_h"] / 2
    ) * Rot(0, 90, 0) * Cylinder(dims["cable_dia"] / 2, dims["cable_len"])
    parts = [(brick, DARK), (cable, BLACK)]
    return "psu_brick", parts, dims


def heat_insert_m3():
    """M3 brass heat-set threaded insert.

    Frame: origin at the insert's top face center (flush with the part
    surface once installed), body extending along -Z into the material.
    """
    dims = {"outer_dia": 4.6, "length": 5.7}
    insert = Pos(0, 0, -dims["length"] / 2) * Cylinder(
        dims["outer_dia"] / 2, dims["length"]
    )
    return "heat_insert_m3", [(insert, BRASS)], dims


def rubber_foot():
    """Adhesive/screw rubber foot.

    Frame: origin at bottom face center (the face that touches the
    table), +Z up into the cabinet.
    """
    dims = {"dia": 28.0, "h": 10.0}
    foot = Pos(0, 0, dims["h"] / 2) * Cylinder(dims["dia"] / 2, dims["h"])
    return "rubber_foot", [(foot, BLACK)], dims


# All builders, in catalog order.
CATALOG = [
    display_panel,
    driver_board,
    polycarb_sheet,
    angle_rail,
    u_channel,
    joystick_jlf,
    button_obsf30,
    button_obsf24,
    encoder_esp32,
    sbc,
    amp_pam8610,
    buck_converter,
    speaker_2in,
    power_switch_19mm,
    dc_jack,
    usbc_passthrough,
    psu_brick,
    heat_insert_m3,
    rubber_foot,
    nameplate_insert,
    control_plate,
]
