"""Marquee screen mockup: shell + 11.3" bar LCD + attract-loop glow.

Renders what the marquee display looks like in place — the screen is NOT
part of the exported shell (cabinet.py only cuts the window/pocket). If the
look is approved, the panel/retainer gets modeled properly in parts.py and
added to assembly.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build123d import Box, Plane, Pos, Text, extrude, mirror

from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet, side_profile
from render import render_parts

CREAM = (0.87, 0.85, 0.80)
PANEL_DARK = (0.06, 0.06, 0.08)
GLOW_BLUE = (0.10, 0.25, 0.65)
TEXT_CYAN = (0.55, 0.95, 1.0)


def main():
    p = dict(CAB)
    assert p["marquee_screen"], "PARAMS marquee_screen must be on"
    shell = build_cabinet(p)
    _, _, info = side_profile(p)
    sin_t, cos_t = info["sin_t"], info["cos_t"]
    chin_y, chin_z = info["chin_y"], info["chin_z"]
    mrq_y, mrq_z = info["mrq_y"], info["mrq_z"]
    mface = Plane(
        origin=(0, (chin_y + mrq_y) / 2, (chin_z + mrq_z) / 2),
        x_dir=(1, 0, 0),
        z_dir=(0, -cos_t, sin_t),  # outward normal (see cabinet.py)
    )
    wall = p["wall"]

    # mface frame: X = across, Y = up-slope, Z = outward normal (negative =
    # into the shell). Panel body: flush behind the face, in the hood.
    panel = mface * Pos(
        0, 0, -(wall + p["mq_panel_thickness"] / 2 + 0.2)
    ) * Box(p["mq_outline_w"], p["mq_outline_h"], p["mq_panel_thickness"])
    # lit face: recessed just behind the aperture rim, reads through window
    glow = mface * Pos(0, 0, -1.2) * Box(
        p["mq_active_w"], p["mq_active_h"], 0.8
    )
    parts = [(shell, CREAM), (panel, PANEL_DARK), (glow, GLOW_BLUE)]

    try:  # attract-loop wordmark; skip silently if no usable font
        # mirror about local YZ: the z-buffer renderer's front/iso views
        # flip +x to screen-left, so pre-mirror the text to read correctly
        wordmark = extrude(Text("ARCADEBENCH", font_size=20), amount=0.5)
        txt = mface * Pos(0, 0, -0.9) * mirror(wordmark, about=Plane.YZ)
        parts.append((txt, TEXT_CYAN))
    except Exception as exc:  # noqa: BLE001 - font availability varies
        print(f"  ! text skipped: {exc}")

    render_parts(
        parts,
        OUT_DIR,
        prefix="marquee_mockup",
        size=1400,
        views={
            "front": (0, -90, None),
            "iso": (25, -60, None),
            # head-on to the tilted marquee face
            "marquee": (p["display_tilt_deg"], -90, None),
        },
    )
    print(f"rendered marquee mockups to {OUT_DIR}")


if __name__ == "__main__":
    main()
