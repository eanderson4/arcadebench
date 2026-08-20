"""ArcadeBench studio export — placed world-coordinate meshes + material
manifest for the Blender photoreal renderer (studio_scene.py).

Reuses assembly.place_components() so the studio scene matches the
engineering renders exactly, plus the polycarbonate window (which the
z-buffer previews skip — here it gets a real transmission material).

Run:  hardware/.venv/bin/python hardware/studio_export.py
Out:  hardware/out/studio/<nn>_<name>.stl + manifest.json
"""

import json

from build123d import Box, Pos, export_stl

import assembly
from cabinet import OUT_DIR, PARAMS as CAB
from parts import BEZEL

STUDIO_DIR = OUT_DIR / "studio"

# material preset per component name (fallback "plastic"); colors come from
# the assembly item RGBs
PRESETS = {
    "shell": "powdercoat",
    "crt_bezel": "petg",
    "polycarb_sheet": "pc_clear",
    "display_panel": "lcd",
    "retainer_frame": "petg",
    "nameplate_insert": "anodized",
    "control_plate": "anodized_dark",
    "joystick_p1": "plastic",
    "joystick_p2": "plastic",
    "sbc": "pcb",
    "encoder": "pcb",
    "amp": "pcb",
    "buck": "pcb",
    "driver_board": "pcb",
    "spine_rail_l": "anodized",
    "spine_rail_r": "anodized",
    "top_bracket": "anodized",
    "speaker_l": "fabric",
    "speaker_r": "fabric",
    "power_switch": "metal",
    "dc_jack": "plastic",
    "usbc_passthrough": "plastic",
    "psu_brick": "plastic",
    "foot_0": "rubber",
    "foot_1": "rubber",
    "foot_2": "rubber",
    "foot_3": "rubber",
}


def preset_for(name):
    if name in PRESETS:
        return PRESETS[name]
    for prefix in ("primary", "secondary", "option"):
        if name.startswith(prefix):
            return "plastic"
    return "plastic"


def main():
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    shell = assembly.build_cabinet()
    items, records, groups = assembly.place_components()
    color_of = {id(s): c for s, c in items}

    # the PC window the z-buffer previews skip (display stack formulas)
    pc_t = CAB["polycarb_thickness"]
    pc_w = (BEZEL["seat_w"] + 2 * BEZEL["border"]) - 2 * BEZEL["pocket_inset"]
    pc_h = (BEZEL["seat_h"] + 2 * BEZEL["border"]) - 2 * BEZEL["pocket_inset"]
    pc_off = -(BEZEL["depth"] - (pc_t + 0.2) / 2)
    face = assembly.display_face_plane()
    pc = face * Pos(0, pc_off, 0) * Box(pc_w, pc_t, pc_h)

    entries = [("shell", [(shell, assembly.CREAM)])]
    for name, shapes in groups:
        entries.append(
            (name, [(s, color_of.get(id(s), (0.5, 0.5, 0.5))) for s in shapes])
        )
    entries.append(("polycarb_sheet", [(pc, (0.72, 0.80, 0.84))]))

    manifest = []
    idx = 0
    for name, shapes in entries:
        for shape, color in shapes:
            fname = f"{idx:02d}_{name}.stl"
            try:
                export_stl(shape, str(STUDIO_DIR / fname),
                           tolerance=0.05, angular_tolerance=0.15)
            except TypeError:
                export_stl(shape, str(STUDIO_DIR / fname))
            manifest.append({
                "file": fname,
                "name": name,
                "preset": preset_for(name),
                "color": [round(c, 4) for c in color],
            })
            idx += 1

    (STUDIO_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # view definitions (elev/azim like render.py; target/scale optional).
    # display close-up: aimed at the screen center from the player's side
    import math
    t = math.radians(CAB["display_tilt_deg"])
    u_ctr = CAB["screen_center_frac"] * CAB["display_face_length"]
    ctr_y = CAB["control_deck_depth"] + u_ctr * math.sin(t)
    ctr_z = CAB["control_deck_height"] + u_ctr * math.cos(t)
    views = {
        "hero": {"elev": 18, "azim": -38},
        "iso": {"elev": 25, "azim": -60},
        "front": {"elev": 0, "azim": -90},
        "side": {"elev": 0, "azim": 180},
        "rear": {"elev": 10, "azim": 75},
        "display": {"elev": 12, "azim": -75,
                    "target": [0, ctr_y / 1000, ctr_z / 1000],
                    "scale": 430},
        "deck": {"elev": 55, "azim": -90,
                 "target": [0, 0.12, CAB["control_deck_height"] / 1000],
                 "scale": 400},
    }
    (STUDIO_DIR / "views.json").write_text(json.dumps(views, indent=2))
    print(f"exported {len(manifest)} meshes + manifest to {STUDIO_DIR}")


if __name__ == "__main__":
    main()
