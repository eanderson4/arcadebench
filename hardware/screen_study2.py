"""Screen/width study round 2 — tighten the width or fit a bigger screen?

Per option: front elevation (deck band + face with glass/active + hood)
AND deck plan with the control layout drawn to scale, so the width floor
set by the controls is visible next to the screen fill ratio.

Controls floor (player_spacing 230):
  P2 buttons reach  spacing/2 + 113   (4x OBSF-24 cols at 15+28i, bezel 28)
  P1 stick reaches  spacing/2 + 97.5  (JLF plate 95 wide, center -50)
  => min width = 440.5 + 2 x edge margin
  500 = 30 mm margins (current), 480 = 20 mm margins (tight floor)

Run:  hardware/.venv/bin/python hardware/screen_study2.py
Out:  hardware/out/screen_study2.png
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle

from cabinet import PARAMS

COS15 = math.cos(math.radians(PARAMS["display_tilt_deg"]))
SPACING = PARAMS["player_spacing"]
DECK_H = PARAMS["control_deck_height"]
DECK_D = PARAMS["control_deck_depth"]
HOOD_H = 90.0
FACE_MARGIN = 20.0            # glass-to-face-edge margin each side (top/bot)

CREAM = "#ded9cf"
GLASS = "#20242a"
ACTIVE = "#4c5866"
HOOD = "#c9c3b7"
DECK = "#d5cfc3"
RED = "#c0392b"
WHITE = "#f5f2ea"
STICK = "#8f8a80"

# (label, cabinet W, panel label, active w,h, glass w,h, sourcing note)
OPTIONS = [
    ("A — 500w, 12.1\" 4:3 (CURRENT)", 500, 245.8, 184.3, 300, 205,
     "1024x768 industrial + HDMI, $70-110"),
    ("B — 480w, 12.1\" 4:3, tighter glass", 480, 245.8, 184.3, 280, 200,
     "same panel, bars 27->17 mm"),
    ("C — 480w, 13.3\" 16:9", 480, 293.7, 165.2, 330, 185,
     "1080p IPS kits everywhere, $50-70"),
    ("D — 480w, 14\" 16:9", 480, 309.4, 174.1, 345, 195,
     "1080p laptop-class + HDMI, $60-80"),
    ("E — 480w, 15\" 4:3", 480, 304.2, 228.2, 340, 245,
     "1024x768 industrial, 12 V, $80-120"),
    ("F — 500w, 15\" 4:3", 500, 304.2, 228.2, 360, 250,
     "same panel, keeps 30 mm margins"),
]


def draw_deck_plan(ax, w):
    """Deck seen from above: control layout to scale. Drawn below the
    elevation, sharing the x axis (width)."""
    y0 = -DECK_D - 30
    ax.add_patch(Rectangle((-w / 2, y0), w, DECK_D, fc=DECK, ec="k", lw=1))
    for player in range(2):
        cx = -SPACING / 2 + player * SPACING
        jx = cx + PARAMS["joystick_offset_x"]
        ax.add_patch(Rectangle(
            (jx - 47.5, y0 + PARAMS["joystick_offset_y"] - 26.5), 95, 53,
            fc="none", ec=STICK, lw=1.2, ls="--"))
        ax.add_patch(Circle((jx, y0 + PARAMS["joystick_offset_y"]), 12,
                            fc=STICK, ec="k", lw=0.5))
        for i in range(4):
            ax.add_patch(Circle(
                (cx + 15 + i * 28, y0 + PARAMS["secondary_row_y"]), 12,
                fc=WHITE, ec="k", lw=0.5))
        for i in range(2):
            ax.add_patch(Circle(
                (cx + 57 + (i - 0.5) * 40, y0 + PARAMS["primary_row_y"]), 15,
                fc=RED, ec="k", lw=0.5))
    for sx in (-1, 1):
        ax.add_patch(Circle(
            (sx * PARAMS["option_offset_x"], y0 + PARAMS["option_offset_y"]),
            12, fc="#444444", ec="k", lw=0.5))
    # edge-margin guides
    for sx in (-1, 1):
        ax.plot([sx * w / 2, sx * w / 2], [y0, y0 + DECK_D], "r-", lw=0.8,
                alpha=0.6)
    ax.annotate("deck plan (controls to scale)", (0, y0 - 12),
                ha="center", fontsize=8, color="#666666")
    return y0


def draw_option(ax, label, w, aw, ah, gw, gh, note):
    face_l = gh + 2 * FACE_MARGIN
    h_total = DECK_H + face_l * COS15 + HOOD_H
    z0 = 0.0
    ax.add_patch(Rectangle((-w / 2, z0), w, DECK_H, fc=CREAM, ec="k", lw=1))
    ax.add_patch(Rectangle((-w / 2, z0 + DECK_H), w, face_l,
                           fc=CREAM, ec="k", lw=1))
    ax.add_patch(Rectangle((-w / 2, z0 + DECK_H + face_l), w, HOOD_H,
                           fc=HOOD, ec="k", lw=1))
    gz = z0 + DECK_H + (face_l - gh) / 2
    ax.add_patch(FancyBboxPatch((-gw / 2, gz), gw, gh,
                                boxstyle="round,pad=0,rounding_size=10",
                                fc=GLASS, ec="none"))
    ax.add_patch(Rectangle((-aw / 2, gz + (gh - ah) / 2), aw, ah,
                           fc=ACTIVE, ec="w", lw=1))
    ax.annotate(f"active {aw:.0f}x{ah:.0f}", (0, gz + gh / 2),
                ha="center", va="center", fontsize=9, color="w")
    ax.annotate(f"glass {gw:.0f}x{gh:.0f}", (0, gz + gh + 8),
                ha="center", fontsize=8)
    y_deck = draw_deck_plan(ax, w)
    bars = (gw - aw) / 2
    ratio = aw / w
    ax.set_title(
        f"{label}\n{note}\n"
        f"fill {ratio:.0%}  |  mask bars {bars:.0f} mm  |  H ~ {h_total:.0f} mm",
        fontsize=9,
    )
    ax.set_xlim(-290, 290)
    ax.set_ylim(y_deck - 30, DECK_H + 300 + HOOD_H + 25)
    ax.set_aspect("equal")
    ax.axis("off")


def main():
    fig, axes = plt.subplots(2, 3, figsize=(22, 13))
    for ax, (label, w, aw, ah, gw, gh, note) in zip(axes.flat, OPTIONS):
        draw_option(ax, label, w, aw, ah, gw, gh, note)
    fig.tight_layout()
    out = Path(__file__).parent / "out" / "screen_study2.png"
    fig.savefig(out, dpi=100)
    print(f"sheet: {out}")
    # width-floor table
    for label, w, aw, ah, gw, gh, note in OPTIONS:
        print(f"{label:42s} fill {aw / w:5.1%}  bars {(gw - aw) / 2:5.1f} mm")


if __name__ == "__main__":
    main()
