"""Onshape review export — committed STEP set in hardware/exports/.

Regenerates the reviewable geometry as STEP AP214 files Onshape imports
directly (Documents -> Import, or drag into a Part Studio):

  exports/cabinet.step       monocoque shell (single solid)
  exports/assembly.step      shell + every placed BOM component + PC window
  exports/print-parts/       the printable split (fb mode), model orientation
                             (same coordinates as assembly.step — imports
                             align at the origin)
  exports/flat-panels/       the sheet-metal flat-pack path (from panels.py)

Committed to the PR so reviewers can import without running the chain.
Re-run after any geometry change:

  hardware/.venv/bin/python hardware/export_onshape.py
"""

import math
import shutil
from pathlib import Path

from build123d import Box, Compound, Plane, Pos, export_step

import assembly
import parts as parts_mod
from cabinet import OUT_DIR, PARAMS as CAB, build_cabinet, side_profile

EXPORTS = Path(__file__).parent / "exports"


def main():
    for sub in (EXPORTS, EXPORTS / "print-parts", EXPORTS / "flat-panels"):
        sub.mkdir(parents=True, exist_ok=True)
        for stale in sub.glob("*.step"):
            stale.unlink()

    # 1. monocoque shell -------------------------------------------------
    solid = build_cabinet()
    export_step(solid, str(EXPORTS / "cabinet.step"))

    # 2. full assembly (shell + placed components + PC window) -----------
    items, _, _ = assembly.place_components()
    shapes = [solid] + [s for s, _ in items]
    pc_t = CAB["polycarb_thickness"]
    pc_off = (CAB["display_recess"] + CAB["wall"] + CAB["doubler_thickness"]
              - 0.5 + pc_t / 2)
    face = assembly.display_face_plane()
    shapes.append(face * Pos(0, pc_off, 0)
                  * Box(CAB["polycarb_w"], pc_t, CAB["polycarb_h"]))
    export_step(Compound(children=shapes), str(EXPORTS / "assembly.step"))

    # 3. printable split, model orientation ------------------------------
    shell_parts, _ = parts_mod.build_parts()
    if parts_mod.SPLIT["split_vertical"]:
        ret_l, ret_r = parts_mod._split_lr(parts_mod.retainer_frame())
        bez_l, bez_r = parts_mod._split_lr(parts_mod.crt_bezel())
        extras = {
            "retainer_l": ret_l, "retainer_r": ret_r,
            "bezel_l": bez_l, "bezel_r": bez_r,
            "deck_l": parts_mod.deck_panel("l"),
            "deck_r": parts_mod.deck_panel("r"),
            "hatch_cover": parts_mod.hatch_cover(),
        }
    else:
        extras = {
            "retainer": parts_mod.retainer_frame(),
            "bezel": parts_mod.crt_bezel(),
            "deck": parts_mod.deck_panel("full"),
            "hatch_cover": parts_mod.hatch_cover(),
        }
    # deck panels are modeled in the deck-local frame; place them so the
    # whole folder shares the assembly's coordinates
    _, _, info = side_profile(CAB)
    cos_s, cy, _, _ = parts_mod._deck_frame()
    s_slope = math.radians(CAB["control_deck_slope_deg"])
    deck_plane = Plane(
        origin=(0, cy, info["deck_z"](cy)),
        x_dir=(1, 0, 0),
        z_dir=(0, -math.sin(s_slope), math.cos(s_slope)),
    )
    for name, part in {**shell_parts, **extras}.items():
        if name.startswith("deck"):
            part = deck_plane * part
        export_step(part, str(EXPORTS / "print-parts" / f"{name}.step"))

    # 4. sheet-metal flat-pack (built by panels.py into out/panels) ------
    panels = sorted((OUT_DIR / "panels").glob("*.step"))
    assert panels, "out/panels is empty — run panels.py first"
    for f in panels:
        shutil.copy(f, EXPORTS / "flat-panels" / f.name)

    total = sum(f.stat().st_size for f in EXPORTS.rglob("*.step"))
    n = len(list(EXPORTS.rglob("*.step")))
    print(f"exported {n} STEP files ({total / 1e6:.1f} MB) to {EXPORTS}")


if __name__ == "__main__":
    main()
