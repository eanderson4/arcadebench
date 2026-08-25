"""Colorway study — one geometry, several finished-build palettes.

Builds the shell + places components once, then re-renders the iso view
per scheme with per-part recoloring and montages them into a labeled
contact sheet (out/colorway_study.png). Roles are matched by component
group + original color, so multi-color parts (buttons, joystick) keep
their plastic/metal split.

Run:  hardware/.venv/bin/python hardware/colorway_study.py
Out:  hardware/out/colorway_study.png
"""

import math
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt

import components as comp
from assembly import CREAM, LAYOUT, place_components
from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet
from render import render_parts

# shell / control plate / primaries / secondaries / options / stick ball /
# nameplate accent
SCHEMES = {
    "cream-classic": dict(
        shell=CREAM, plate=(0.12, 0.12, 0.14), primary=comp.RED,
        secondary=comp.WHITE, option=comp.BLACK, ball=comp.WHITE,
        accent=(0.10, 0.10, 0.11),
    ),
    "graphite-red": dict(
        shell=(0.17, 0.17, 0.19), plate=(0.07, 0.07, 0.08), primary=comp.RED,
        secondary=(0.78, 0.78, 0.80), option=(0.05, 0.05, 0.06),
        ball=(0.78, 0.78, 0.80), accent=comp.RED,
    ),
    "alu-orange": dict(
        shell=(0.72, 0.73, 0.75), plate=(0.10, 0.10, 0.11),
        primary=(0.95, 0.42, 0.08), secondary=(0.87, 0.87, 0.88),
        option=(0.12, 0.12, 0.13), ball=(0.95, 0.42, 0.08),
        accent=(0.95, 0.42, 0.08),
    ),
    "sage-amber": dict(
        shell=(0.58, 0.62, 0.52), plate=(0.13, 0.12, 0.10),
        primary=(0.87, 0.55, 0.13), secondary=(0.91, 0.89, 0.81),
        option=(0.10, 0.10, 0.09), ball=(0.91, 0.89, 0.81),
        accent=(0.87, 0.55, 0.13),
    ),
    "navy-brass": dict(
        shell=(0.16, 0.21, 0.31), plate=(0.07, 0.08, 0.10),
        primary=(0.85, 0.65, 0.20), secondary=(0.82, 0.83, 0.86),
        option=(0.05, 0.05, 0.06), ball=(0.85, 0.65, 0.20),
        accent=(0.85, 0.65, 0.20),
    ),
    "snow-coral": dict(
        shell=(0.93, 0.93, 0.92), plate=(0.11, 0.11, 0.12),
        primary=(0.94, 0.35, 0.31), secondary=(0.35, 0.37, 0.40),
        option=(0.15, 0.15, 0.16), ball=(0.94, 0.35, 0.31),
        accent=(0.35, 0.37, 0.40),
    ),
}


def main():
    shell = build_cabinet()
    items, _, groups = place_components()
    gid = {id(s): name for name, shapes in groups for s in shapes}

    def recolor(scheme):
        out = [(shell, scheme["shell"])]
        for s, c in items:
            g = gid.get(id(s), "")
            nc = c
            if g == "control_plate":
                nc = scheme["plate"]
            elif g == "nameplate_insert":
                nc = scheme["accent"]
            elif g.startswith("primary") and c == comp.RED:
                nc = scheme["primary"]
            elif g.startswith("secondary") and c == comp.WHITE:
                nc = scheme["secondary"]
            elif g.startswith("option") and c == comp.BLACK:
                nc = scheme["option"]
            elif g.startswith("joystick") and c == LAYOUT["p1_color"]:
                nc = scheme["ball"]
            out.append((s, nc))
        return out

    names = list(SCHEMES)
    with tempfile.TemporaryDirectory() as td:
        for name in names:
            render_parts(
                recolor(SCHEMES[name]), Path(td), prefix=name, size=700,
                views={"iso": (25, -60, None)},
            )
            print(f"rendered {name}")

        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        for ax, name in zip(axes.flat, names):
            ax.imshow(mpimg.imread(Path(td) / f"{name}_iso.png"))
            ax.set_title(name, fontsize=16)
            ax.axis("off")
        fig.tight_layout()
        out = OUT_DIR / "colorway_study.png"
        fig.savefig(out, dpi=110)
        print(f"contact sheet -> {out}")


if __name__ == "__main__":
    main()
