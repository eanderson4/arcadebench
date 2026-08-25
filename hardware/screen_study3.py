"""Screen/width study round 3 — SINGLE PLAYER pivot.

1P control cluster (stick-left standard):
  buttons reach  +113  (4x OBSF-24 cols at 15+28i, bezel 28)
  stick reaches  -97.5 (JLF plate 95 wide, center -50)
  => hardware span 210.5 mm; cabinet width = span + 2 x margin

Panel candidates (premium focus):
  - 13.5" 3:2 3004x2000 IPS (Surface-class kit, ~267 PPI) — near-square,
    4:3 content pillarboxes into ~15 mm side bars, no OLED burn-in risk
  - 13.3" 16:9 OLED (true blacks, but 4:3 games use only 220x165 of it,
    and static arcade HUDs are a burn-in risk)
  - 15" 4:3 industrial 1024x768 (authentic, but 82 PPI and mediocre contrast)

Run:  hardware/.venv/bin/python hardware/screen_study3.py
Out:  hardware/out/screen_study3.png
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle

from cabinet import PARAMS

COS15 = math.cos(math.radians(PARAMS["display_tilt_deg"]))
DECK_H = PARAMS["control_deck_height"]
DECK_D = PARAMS["control_deck_depth"]
HOOD_H = 90.0
FACE_MARGIN = 20.0

CREAM = "#ded9cf"
GLASS = "#20242a"
ACTIVE = "#4c5866"
HOOD = "#c9c3b7"
DECK = "#d5cfc3"
RED = "#c0392b"
WHITE = "#f5f2ea"
STICK = "#8f8a80"

# (label, cabinet W, active w,h, glass w,h, note)
OPTIONS = [
    ("A — 340w, 13.5\" 3:2 hi-DPI IPS", 340, 285.0, 190.0, 300, 205,
     "3004x2000 Surface-class + HDMI kit, ~$100-150"),
    ("B — 340w, 13.3\" 16:9 OLED", 340, 293.7, 165.2, 300, 185,
     "true blacks; burn-in risk on static HUDs, ~$200+"),
    ("C — 350w, 15\" 4:3 industrial", 350, 304.2, 228.2, 315, 240,
     "1024x768, 82 PPI — authentic but low-fi, $80-120"),
    ("D — 320w, 12.1\" 4:3 (cheap 1P)", 320, 245.8, 184.3, 260, 200,
     "current panel, budget path, $70-110"),
]


def draw_deck_plan(ax, w):
    y0 = -DECK_D - 30
    ax.add_patch(Rectangle((-w / 2, y0), w, DECK_D, fc=DECK, ec="k", lw=1))
    cx = 0.0  # single centered cluster
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
    ax.annotate("deck plan (1P controls to scale)", (0, y0 - 12),
                ha="center", fontsize=8, color="#666666")
    return y0


def draw_option(ax, label, w, aw, ah, gw, gh, note):
    face_l = gh + 2 * FACE_MARGIN
    h_total = DECK_H + face_l * COS15 + HOOD_H
    ax.add_patch(Rectangle((-w / 2, 0), w, DECK_H, fc=CREAM, ec="k", lw=1))
    ax.add_patch(Rectangle((-w / 2, DECK_H), w, face_l, fc=CREAM, ec="k", lw=1))
    ax.add_patch(Rectangle((-w / 2, DECK_H + face_l), w, HOOD_H,
                           fc=HOOD, ec="k", lw=1))
    gz = DECK_H + (face_l - gh) / 2
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
    ax.set_title(
        f"{label}\n{note}\n"
        f"fill {aw / w:.0%}  |  mask bars {bars:.1f} mm  |  H ~ {h_total:.0f} mm",
        fontsize=9,
    )
    ax.set_xlim(-290, 290)
    ax.set_ylim(y_deck - 30, DECK_H + 290 + HOOD_H + 25)
    ax.set_aspect("equal")
    ax.axis("off")


def main():
    fig, axes = plt.subplots(2, 2, figsize=(16, 13))
    for ax, (label, w, aw, ah, gw, gh, note) in zip(axes.flat, OPTIONS):
        draw_option(ax, label, w, aw, ah, gw, gh, note)
    fig.tight_layout()
    out = Path(__file__).parent / "out" / "screen_study3.png"
    fig.savefig(out, dpi=100)
    print(f"sheet: {out}")
    for label, w, aw, ah, gw, gh, note in OPTIONS:
        margin = (w - 210.5) / 2
        print(f"{label:38s} fill {aw / w:5.1%}  bars {(gw - aw) / 2:5.1f} mm"
              f"  deck edge margin {margin:4.0f} mm")


if __name__ == "__main__":
    main()
