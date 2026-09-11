"""Screen-size study — front-elevation comparison of panel options.

2D annotated sheet (fast, no OCC): face width 530, hood band, deck — with
glass/mask area and active area drawn to scale for each candidate panel.

Run:  hardware/.venv/bin/python hardware/screen_study.py
Out:  hardware/out/screen_study.png
"""

import math

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

from cabinet import PARAMS

COS15 = math.cos(math.radians(PARAMS["display_tilt_deg"]))

FACE_W = PARAMS["cabinet_width"]
FACE_L = PARAMS["display_face_length"]   # along slope; ~vertical in elevation
MARGIN = 10.0                            # min glass-to-face-edge margin
HOOD_H = 90.0
DECK_H = 100.0

# (label, active w×h, glass w×h, price note)
OPTIONS = [
    ("A — 9.7\" 4:3 (current)", 196.6, 147.5, 380, 180,
     "2048×1536 IPS retina, $40–60 kits"),
    ("B — 12.1\" 4:3", 245.8, 184.3, 400, 205,
     "1024×768 industrial + HDMI board, $70–110"),
    ("C — 13.3\" 16:9", 293.7, 165.2, 420, 190,
     "1080p IPS HDMI kits everywhere, $50–70"),
    ("D — 15\" 4:3 (max)", 304.0, 228.0, 440, 250,
     "1024×768 industrial, 12 V, heavy, $80–120"),
    ("E — 11.6\" 16:9", 256.0, 144.0, 400, 180,
     "1080p laptop-class, $45–65"),
]

CREAM = "#ded9cf"
GLASS = "#20242a"
ACTIVE = "#4c5866"
HOOD = "#c9c3b7"


def draw_option(ax, label, aw, ah, gw, gh, note):
    # face length needed for the glass + margins; height impact
    face_l = max(FACE_L, gh + 2 * MARGIN + 36)  # 36 = doubler allowance
    h_total = DECK_H + face_l * COS15 + HOOD_H
    face_l_draw = face_l  # elevation ≈ slope length (cos handled in total)

    ax.add_patch(Rectangle((0, 0), FACE_W, DECK_H, fc=CREAM, ec="k", lw=1))
    ax.add_patch(
        Rectangle((0, DECK_H), FACE_W, face_l_draw, fc=CREAM, ec="k", lw=1)
    )
    ax.add_patch(
        Rectangle((0, DECK_H + face_l_draw), FACE_W, HOOD_H, fc=HOOD, ec="k", lw=1)
    )
    gx = (FACE_W - gw) / 2
    gz = DECK_H + (face_l_draw - gh) / 2
    ax.add_patch(
        FancyBboxPatch((gx, gz), gw, gh, boxstyle="round,pad=0,rounding_size=10",
                       fc=GLASS, ec="none")
    )
    ax.add_patch(
        Rectangle(((FACE_W - aw) / 2, gz + (gh - ah) / 2), aw, ah,
                  fc=ACTIVE, ec="w", lw=1)
    )
    ax.annotate(f"glass {gw:.0f}×{gh:.0f}", (FACE_W / 2, gz + gh + 6),
                ha="center", fontsize=9)
    ax.annotate(f"active {aw:.0f}×{ah:.0f}", (FACE_W / 2, gz + (gh - ah) / 2 + ah / 2 - 4),
                ha="center", fontsize=9, color="w")
    ax.set_title(
        f"{label}\n{note}\ncabinet H ≈ {h_total:.0f} mm (face {face_l:.0f} mm)",
        fontsize=10,
    )
    ax.set_xlim(-20, FACE_W + 20)
    ax.set_ylim(-20, DECK_H + 300 + HOOD_H + 20)
    ax.set_aspect("equal")
    ax.axis("off")


def main():
    fig, axes = plt.subplots(2, 3, figsize=(20, 12))
    for ax, (label, aw, ah, gw, gh, note) in zip(axes.flat, OPTIONS):
        draw_option(ax, label, aw, ah, gw, gh, note)
    axes.flat[-1].axis("off")
    fig.tight_layout()
    fig.savefig(OUT := __import__("pathlib").Path(__file__).parent / "out" / "screen_study.png", dpi=110)
    print(f"sheet: {OUT}")


if __name__ == "__main__":
    main()
