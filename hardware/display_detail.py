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
WALL = CAB["wall"]
DOUBLER = CAB["doubler_thickness"]
GAP = 0.5  # LAYOUT["panel_gap"]
PANEL_T = CAB["panel_thickness"]
PANEL_OFF = WALL + DOUBLER + GAP + PANEL_T / 2
FRAME_OFF = WALL + DOUBLER + GAP + PANEL_T
PC_T = CAB["polycarb_thickness"]
PC_OFF = -(BEZEL["depth"] - (PC_T + 0.2) / 2)

# PC window sheet: nominal pocket size minus the per-side clearance
PC_W = (BEZEL["seat_w"] + 2 * BEZEL["border"]) - 2 * BEZEL["pocket_inset"]
PC_H = (BEZEL["seat_h"] + 2 * BEZEL["border"]) - 2 * BEZEL["pocket_inset"]

# shell patch around the window, sliced from the REAL cabinet solid
PATCH_MARGIN = 14.0  # mm beyond the bezel outer ring
PATCH_W = BEZEL["seat_w"] + 2 * BEZEL["border"] + 2 * PATCH_MARGIN
PATCH_H = BEZEL["seat_h"] + 2 * BEZEL["border"] + 2 * PATCH_MARGIN

EXPLODE = 22.0  # mm gap between stack layers in the exploded view

CREAM = (0.87, 0.85, 0.80)
BEZEL_BLACK = (0.05, 0.05, 0.06)
PC_TINT = (0.72, 0.80, 0.84)
RETAINER_GRAY = (0.30, 0.30, 0.33)


def shell_patch():
    """Window region of the real cabinet wall+doubler, sliced in the face
    frame: authentic window cut, rounded corners, bezel mount holes."""
    solid = build_cabinet()
    cutter = Pos(0, (WALL + DOUBLER) / 2, 0) * Box(
        PATCH_W, WALL + DOUBLER + 8, PATCH_H
    )
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
        # (parts, y_offset_assembled)
        ([(Pos(0, 0, 0) * Box(PC_W, PC_T, PC_H), PC_TINT)], PC_OFF),
        ([(Rot(90, 0, 0) * crt_bezel(), BEZEL_BLACK)], 0.0),
        ([(shell_patch(), CREAM)], (WALL + DOUBLER) / 2),
        ([(s, c) for s, c in panel_parts], PANEL_OFF),
        ([(Rot(-90, 0, 0) * retainer_frame(), RETAINER_GRAY)], FRAME_OFF),
    ]
    out = []
    n = len(layers)
    for i, (shapes, y0) in enumerate(layers):
        dy = (i - (n - 1) / 2) * EXPLODE if exploded else 0.0
        out.extend((Pos(0, dy, 0) * s, c) for s, c in shapes)
    return out


def draw_section():
    """Annotated cross-section of the stack at x=0 (Y = depth through the
    wall, Z = up-slope), blueprint style matching drawing.py."""
    DIM, REF = "0.45", "0.70"
    wall, dbl = WALL, DOUBLER
    bz_d = BEZEL["depth"]
    pd = CAB["polycarb_thickness"] + 0.2          # pocket depth
    pocket_z = PC_H / 2                            # pocket half-height
    outer_z = (BEZEL["seat_h"] + 2 * BEZEL["border"]) / 2
    throat_f = BEZEL["mask_h"] / 2 + (BEZEL["seat_h"] - BEZEL["mask_h"]) / 2 * (
        pd / bz_d)                                 # opening where pocket ends
    throat_r = BEZEL["seat_h"] / 2
    win_z = CAB["glass_opening_h"] / 2
    patch_z = PATCH_H / 2
    dbl_z = win_z + CAB["doubler_margin"]
    panel_z = CAB["panel_outline_h"] / 2
    ret_o = panel_z + CAB["retainer_boss_offset"] + RET["frame_edge"]
    ret_i = panel_z - RET["frame_bearing"]
    pc_y = (PC_OFF - PC_T / 2, PC_OFF + PC_T / 2)
    panel_y = (PANEL_OFF - PANEL_T / 2, PANEL_OFF + PANEL_T / 2)
    ret_y = (FRAME_OFF, FRAME_OFF + RET["frame_thickness"])

    def rail(y0, y1, z_in0, z_in1, z_out, **kw):
        """Top+bottom rail polygons of a frame section (z_in varies y0->y1)."""
        pts_t = [(y0, z_in0), (y1, z_in1), (y1, z_out), (y0, z_out)]
        pts_b = [(y, -z) for y, z in pts_t]
        return [MplPolygon(pts_t, **kw), MplPolygon(pts_b, **kw)]

    fig, ax = plt.subplots(figsize=(11, 9))
    style = {"closed": True, "lw": 1.2, "edgecolor": "0.15", "zorder": 3}
    # bezel: pocket step at the front, then the flared throat
    for poly in [
        MplPolygon([(-bz_d, pocket_z), (-bz_d + pd, pocket_z),
                    (-bz_d + pd, throat_f), (0, throat_r),
                    (0, outer_z), (-bz_d, outer_z)],
                   facecolor="0.25", **style),
        MplPolygon([(y, -z) for y, z in
                    [(-bz_d, pocket_z), (-bz_d + pd, pocket_z),
                     (-bz_d + pd, throat_f), (0, throat_r),
                     (0, outer_z), (-bz_d, outer_z)]],
                   facecolor="0.25", **style),
    ]:
        ax.add_patch(poly)
    # PC window in the pocket
    ax.add_patch(MplPolygon(
        [(pc_y[0], -pocket_z), (pc_y[1], -pocket_z),
         (pc_y[1], pocket_z), (pc_y[0], pocket_z)],
        facecolor="0.80", hatch="///", **style))
    # shell wall + doubler (window opening at +-win_z)
    ax.add_patch(MplPolygon(
        [(0, win_z), (wall, win_z), (wall, patch_z), (0, patch_z)],
        facecolor="0.93", **style))
    ax.add_patch(MplPolygon(
        [(0, -win_z), (wall, -win_z), (wall, -patch_z), (0, -patch_z)],
        facecolor="0.93", **style))
    dy0 = wall + dbl / 2 - 0.5 - dbl / 2
    for sz in (1, -1):
        ax.add_patch(MplPolygon(
            [(dy0, sz * win_z), (dy0 + dbl, sz * win_z),
             (dy0 + dbl, sz * dbl_z), (dy0, sz * dbl_z)],
            facecolor="0.85", **style))
    # panel (glass; active area marked)
    ax.add_patch(MplPolygon(
        [(panel_y[0], -panel_z), (panel_y[1], -panel_z),
         (panel_y[1], panel_z), (panel_y[0], panel_z)],
        facecolor="0.55", **style))
    ax.plot([panel_y[0] - 0.3, panel_y[0] - 0.3],
            [-CAB["glass_opening_h"] / 2 + 1, CAB["glass_opening_h"] / 2 - 1],
            color="0.30", lw=2.5, zorder=4)
    # retainer rails
    for poly in rail(ret_y[0], ret_y[1], ret_i, ret_i, ret_o,
                     facecolor="0.45", **style):
        ax.add_patch(poly)

    # labels (leader lines to the right)
    labels = [
        ("PC window 2.5 (friction pocket)", (sum(pc_y) / 2, 0), (26, 60)),
        ("CRT bezel (PETG) - throat 253x190\n-> 289x195, 18 deep", (-9, 101), (26, 95)),
        ("shell wall 3 + doubler 4", (wall / 2, 113), (26, 125)),
        ("13.5 panel (296x206x5)", (sum(panel_y) / 2, -60), (26, -60)),
        ("retainer frame 3 (M3 csk)", (sum(ret_y) / 2, 100), (26, 30)),
    ]
    for text, xy, xytext in labels:
        ax.annotate(text, xy=xy, xytext=xytext, fontsize=9, color="0.20",
                    ha="left", va="center",
                    arrowprops={"arrowstyle": "-", "color": DIM, "lw": 0.7})
    # depth dims: per-layer thicknesses are in the labels; only the total
    ax.annotate("", xy=(-bz_d, -126), xytext=(ret_y[1], -126),
                arrowprops={"arrowstyle": "<->", "color": "0.30", "lw": 1.0})
    ax.text((ret_y[1] - bz_d) / 2, -131, f"stack depth {ret_y[1] + bz_d:.1f}",
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
        f"  throat {BEZEL['mask_w']:.0f}x{BEZEL['mask_h']:.0f} (front) -> "
        f"{BEZEL['seat_w']:.0f}x{BEZEL['seat_h']:.0f} (seat), "
        f"depth {BEZEL['depth']:.0f}; pocket {PC_W:.1f}x{PC_H:.1f}x{PC_T + 0.2:.1f}"
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
