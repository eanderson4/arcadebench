"""ArcadeBench fit check — intersect every placed component with the shell.

Renders can hide clearance regressions (a speaker magnet kissing the hood
floor looks fine until you section it). This intersects each placed
component from assembly.place_components() with the enclosure solid and
reports the overlap volume per component; exits nonzero if any exceeds
the threshold.

Intentional embeds (nameplate in its recess, button threads through
holes) are expected to read ~0; anything larger is a real collision.

Run:  hardware/.venv/bin/python hardware/fit_check.py
"""

import sys

from assembly import place_components
from cabinet import build_cabinet

THRESH = 1.0  # mm^3 per component


def main():
    shell = build_cabinet()
    _, _, groups = place_components()
    worst, bad = 0.0, []
    for name, shapes in groups:
        vol = 0.0
        for s in shapes:
            inter = shell & s
            if inter is not None:
                vol += sum(x.volume for x in inter.solids())
        worst = max(worst, vol)
        flag = "  <-- COLLISION" if vol > THRESH else ""
        print(f"  {name:20s} {vol:10.3f} mm^3{flag}")
        if vol > THRESH:
            bad.append(name)
    print(f"max component overlap: {worst:.3f} mm^3 (threshold {THRESH})")
    if bad:
        print(f"FAIL: {len(bad)} component(s) intersect the shell: {bad}")
        sys.exit(1)
    print("fit check OK")


if __name__ == "__main__":
    main()
