"""ArcadeBench display-stack detail renders — CRT bezel + mounting stack.

Close-up views of the printed CRT bezel alone, an exploded view of the
full display stack (PC window -> bezel -> shell wall/doubler -> panel ->
retainer), and assembled cross-sections through the stack center so the
throat profile, friction pocket, and clamp sandwich read clearly.

Everything is rendered in the display-face local frame (X across,
Y through-wall into the cabinet, Z up-slope) — same convention as
assembly.py, so offsets match the assembled placement exactly.

Run:  hardware/.venv/bin/python hardware/display_detail.py
Out:  hardware/out/bezel_*.png, display_stack_*.png
"""

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon

from build123d import Box, Pos, Rot

import components as comp
from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet
from parts import BEZEL, RET, crt_bezel, retainer_frame
from render import render_parts

# --- stack offsets along the face normal (Y), matching assembly.py -------
# iter 34 CRT dish: trim ring proud on the face -> 12 mm dish -> tray floor
# (aperture) -> PC window -> panel -> retainer.
WALL = CAB["wall"]
RECESS = CAB["display_recess"]
FLOOR_IN = RECESS + WALL                    # tray floor inner face (15)
DOUBLER = CAB["doubler_thickness"]
STACK0 = FLOOR_IN + DOUBLER - 0.5           # doubler outer face (18.5)
GAP = 0.5  # LAYOUT["panel_gap"]
PANEL_T = CAB["panel_thickness"]
PC_T = CAB["polycarb_thickness"]
PC_OFF = STACK0 + PC_T / 2
PANEL_OFF = STACK0 + PC_T + GAP + PANEL_T / 2
FRAME_OFF = STACK0 + PC_T + GAP + PANEL_T
PC_W = CAB["polycarb_w"]
PC_H = CAB["polycarb_h"]

# shell patch around the dish, sliced from the REAL cabinet solid
PATCH_MARGIN = 14.0  # mm beyond the trim-ring flange
PATCH_W = BEZEL["flange_w"] + 2 * PATCH_MARGIN
PATCH_H = BEZEL["flange_h"] + 2 * PATCH_MARGIN
PATCH_T = FLOOR_IN + DOUBLER + 8

EXPLODE = 22.0  # mm gap between stack layers in the exploded view

CREAM = (0.87, 0.85, 0.80)
BEZEL_BLACK = (0.05, 0.05, 0.06)
PC_TINT = (0.72, 0.80, 0.84)
RETAINER_GRAY = (0.30, 0.30, 0.33)


def shell_patch():
    """Dish region of the real cabinet (pocket + tray floor + aperture +
    doubler + mounts), sliced in the face frame."""
    solid = build_cabinet()
    cutter = Pos(0, (PATCH_T - 4) / 2, 0) * Box(PATCH_W, PATCH_T, PATCH_H)
    patch = solid & cutter
    if patch is None or len(patch.solids()) != 1:
        raise RuntimeError("shell patch slice failed")
    return patch


def stack_parts(exploded):
    """[(shape, color)] of the 5-layer stack in face-local coords."""
    _, panel_parts, _ = comp.display_panel()
    # display_panel frame: X across, Z up, Y thickness — rotate into the
    # face frame (Z up-slope) like assembly does via Rot(-90... ) — here the
    # panel's own axes already match (X across, Y through-wall, Z up).
    layers = [
        # (parts, y_assembled — shapes are modeled at the frame origin)
        ([(Box(PC_W, PC_T, PC_H), PC_TINT)], PC_OFF),
        ([(Rot(90, 0, 0) * crt_bezel(), BEZEL_BLACK)], 0.0),
        ([(shell_patch(), CREAM)], 0.0),  # sliced in place
        ([(s, c) for s, c in panel_parts], PANEL_OFF),
        ([(Rot(-90, 0, 0) * retainer_frame(), RETAINER_GRAY)], FRAME_OFF),
    ]
    out = []
    n = len(layers)
    for i, (shapes, y0) in enumerate(layers):
        dy = (i - (n - 1) / 2) * EXPLODE if exploded else 0.0
        out.extend((Pos(0, y0 + dy, 0) * s, c) for s, c in shapes)
    return out


def draw_section():
    """Annotated cross-section of the stack at x=0 (Y = depth through the
    wall, Z = up-slope), blueprint style matching drawing.py."""
    DIM, REF = "0.45", "0.70"
    wall, dbl = WALL, DOUBLER
    b = BEZEL
    fl_t = b["flange_t"]                     # flange thickness (proud)
    fl_z = b["flange_h"] / 2                 # flange half-height
    tt_z = b["throat_top_h"] / 2             # funnel opening half-height
    tb_z = b["throat_bot_h"] / 2             # funnel bottom half-height
    td = b["throat_depth"]
    dish_z = CAB["recess_h"] / 2             # dish half-height
    plate_z = (CAB["recess_h"] + 14.0) / 2   # tray floor plate half-height
    win_z = CAB["glass_opening_h"] / 2       # aperture half-height
    patch_z = PATCH_H / 2
    dbl_z = win_z + CAB["doubler_margin"]
    panel_z = CAB["panel_outline_h"] / 2
    ret_o = panel_z + CAB["retainer_boss_offset"] + RET["frame_edge"]
    ret_i = panel_z - RET["frame_bearing"]
    fin = FLOOR_IN
    pc_y = (PC_OFF - PC_T / 2, PC_OFF + PC_T / 2)
    panel_y = (PANEL_OFF - PANEL_T / 2, PANEL_OFF + PANEL_T / 2)
    ret_y = (FRAME_OFF, FRAME_OFF + RET["frame_thickness"])

    def poly(pts, **kw):
        ax.add_patch(MplPolygon(pts, **kw))
        ax.add_patch(MplPolygon([(y, -z) for y, z in pts], **kw))

    fig, ax = plt.subplots(figsize=(11, 9))
    style = {"closed": True, "lw": 1.2, "edgecolor": "0.15", "zorder": 3}
    # trim ring + funnel insert (flange proud, funnel narrows into the dish)
    poly([(-fl_t, tt_z), (td, tb_z), (td, fl_z), (-fl_t, fl_z)],
         facecolor="0.25", **style)
    # face wall ring around the dish (0..wall, |z| > dish)
    poly([(0, dish_z), (wall, dish_z), (wall, patch_z), (0, patch_z)],
         facecolor="0.93", **style)
    # tray floor plate (recess..floor_in, aperture..plate edge)
    poly([(RECESS, win_z), (fin, win_z), (fin, plate_z), (RECESS, plate_z)],
         facecolor="0.93", **style)
    # doubler behind the floor
    dy0 = fin + dbl / 2 - 0.5 - dbl / 2
    poly([(dy0, win_z), (dy0 + dbl, win_z), (dy0 + dbl, dbl_z),
          (dy0, dbl_z)], facecolor="0.85", **style)
    # PC window clamped behind the floor
    ax.add_patch(MplPolygon(
        [(pc_y[0], -PC_H / 2), (pc_y[1], -PC_H / 2),
         (pc_y[1], PC_H / 2), (pc_y[0], PC_H / 2)],
        facecolor="0.80", hatch="///", **style))
    # panel
    ax.add_patch(MplPolygon(
        [(panel_y[0], -panel_z), (panel_y[1], -panel_z),
         (panel_y[1], panel_z), (panel_y[0], panel_z)],
        facecolor="0.55", **style))
    ax.plot([panel_y[0] - 0.3, panel_y[0] - 0.3],
            [-win_z + 1, win_z - 1], color="0.30", lw=2.5, zorder=4)
    # retainer rails
    poly([(ret_y[0], ret_i), (ret_y[1], ret_i), (ret_y[1], ret_o),
          (ret_y[0], ret_o)], facecolor="0.45", **style)

    # labels (leader lines to the right)
    labels = [
        ("trim ring + funnel (PETG)\n2.5 proud, narrows 298x198 -> 257x194",
         (td / 2, 100), (34, 92)),
        ("dish 12 deep in the face", (RECESS / 2, 113), (34, 125)),
        ("tray floor 3 + doubler 4\naperture 253x190 (4:3)",
         ((RECESS + fin) / 2, -99), (34, -95)),
        ("PC window 2.5 (clamped)", (sum(pc_y) / 2, 0), (34, -35)),
        ("13.5 panel (296x206x5)", (sum(panel_y) / 2, -60), (34, -60)),
        ("retainer frame 3 (M3 csk)", (sum(ret_y) / 2, 105), (34, 30)),
    ]
    for text, xy, xytext in labels:
        ax.annotate(text, xy=xy, xytext=xytext, fontsize=9, color="0.20",
                    ha="left", va="center",
                    arrowprops={"arrowstyle": "-", "color": DIM, "lw": 0.7})
    # total depth dim (flange front to retainer rear)
    ax.annotate("", xy=(-fl_t, -126), xytext=(ret_y[1], -126),
                arrowprops={"arrowstyle": "<->", "color": "0.30", "lw": 1.0})
    ax.text((ret_y[1] - fl_t) / 2, -131,
            f"stack depth {ret_y[1] + fl_t:.1f} "
            f"(screen {PANEL_OFF - PANEL_T / 2:.1f} behind the face)",
            fontsize=10, color="0.30", ha="center", va="top")

    ax.set_aspect("equal")
    ax.set_xlim(-30, 105)
    ax.set_ylim(-140, 140)
    ax.set_xlabel("depth through wall (mm, viewer at left)")
    ax.set_ylabel("up-slope (mm)")
    ax.set_title("Display stack cross-section at cabinet centerline")
    ax.grid(True, color=REF, lw=0.3, alpha=0.5)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "display_stack_drawing.png", dpi=160)
    plt.close(fig)


def main():
    bezel = crt_bezel()
    bb = bezel.bounding_box()
    print(
        f"bezel: {bb.max.X - bb.min.X:.1f} x {bb.max.Y - bb.min.Y:.1f} x "
        f"{bb.max.Z - bb.min.Z:.1f} mm  valid={bezel.is_valid}"
    )
    print(
        f"  funnel {BEZEL['throat_top_w']:.0f}x{BEZEL['throat_top_h']:.0f} "
        f"(flange) -> {BEZEL['throat_bot_w']:.0f}x{BEZEL['throat_bot_h']:.0f} "
        f"over {BEZEL['throat_depth']:.0f}; flange {BEZEL['flange_w']:.0f}x"
        f"{BEZEL['flange_h']:.0f}x{BEZEL['flange_t']:.1f} proud"
    )

    # 1. bezel alone, all sides (low front-quarter shows the throat funnel)
    render_parts(
        [(bezel, BEZEL_BLACK)], OUT_DIR, prefix="bezel", size=1200,
        views={
            "front": (0, -90, None),     # mask opening / pocket side
            "front_low": (16, -55, None),
            "rear": (0, 90, None),       # seat + M3 insert pilots
            "iso_rear": (22, 125, None),
            "side": (0, 180, None),      # throat profile
        },
    )

    # 2. exploded stack — explode axis is Y, so shoot from near +-X to
    # spread the layers across the frame
    render_parts(
        stack_parts(exploded=True), OUT_DIR, prefix="display_stack_exploded",
        size=1200,
        views={
            "iso": (18, 155, None),
            "iso_back": (18, -155, None),
            "side": (0, 180, None),
        },
    )

    # 3. assembled stack, sectioned through the center (x <= 0 half)
    render_parts(
        stack_parts(exploded=False), OUT_DIR, prefix="display_stack", size=1200,
        views={
            "section_iso": (15, -35, 0.0),
            "section_side": (0, 180, 0.0),
            "iso": (25, -60, None),
        },
    )
    # 4. annotated cross-section drawing
    draw_section()
    print(f"display detail renders -> {OUT_DIR}")


if __name__ == "__main__":
    main()
