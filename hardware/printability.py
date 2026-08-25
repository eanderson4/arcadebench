"""FDM printability audit for the exported parts.

Reads every *.step in hardware/out/parts/ (already print-oriented and
dropped to z=0 by parts.py's ORIENT table) and reports, per part:

  - bed contact area (mesh triangles at z < 1 mm facing down)
  - overhang area by severity: moderate (45-60 deg from vertical) and
    steep (>60 deg — prints poorly without supports)
  - bbox and height (stability: tall parts need contact area)

Triangles come from shape.tessellate(), so curved surfaces are handled.
WARN thresholds are heuristics for PETG on a 0.4 nozzle; review in context
(small steep patches on non-cosmetic undersides are usually fine).

Run:  hardware/.venv/bin/python hardware/printability.py
"""

from pathlib import Path

from build123d import Vector, import_step

PARTS_DIR = Path(__file__).parent / "out" / "parts"

CONTACT_Z = 1.0        # mm; triangles under this height count as bed contact
OVERHANG_MIN_Z = 2.0   # down-facing triangles below this are bed/contact,
                       # not overhangs
# overhang angle from vertical = asin(|nz|) for down-facing normals:
# wall = 0 deg, flat ceiling = 90 deg
MODERATE = 0.707       # sin 45: nz below this = overhang steeper than 45 deg
STEEP = 0.866          # sin 60: nz below this = steeper than 60 deg
WARN_STEEP_MM2 = 400.0
WARN_MODERATE_MM2 = 800.0
WARN_CONTACT_MM2 = 2500.0   # below this, recommend a brim


def audit(path):
    part = import_step(str(path))
    verts, tris = part.tessellate(0.2)
    contact = moderate = steep = 0.0
    for a, b, c in tris:
        va, vb, vc = Vector(verts[a]), Vector(verts[b]), Vector(verts[c])
        n = (vb - va).cross(vc - va)
        area = n.length / 2
        if area < 1e-9:
            continue
        nz = n.normalized().Z
        z = (va.Z + vb.Z + vc.Z) / 3
        if nz < -MODERATE and z > OVERHANG_MIN_Z:
            if nz < -STEEP:
                steep += area
            else:
                moderate += area
        if nz < -0.5 and z < CONTACT_Z:
            contact += area
    bb = part.bounding_box()
    dims = (bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z)
    return dims, contact, moderate, steep


def main():
    print(f"{'part':15s} {'dims (mm)':>20s} {'contact':>9s} {'45-60':>8s} "
          f"{'>60':>8s}  flags")
    worst = 0
    for path in sorted(PARTS_DIR.glob("*.step")):
        dims, contact, moderate, steep = audit(path)
        flags = []
        if steep > WARN_STEEP_MM2:
            flags.append(f"STEEP {steep:.0f}")
        if moderate > WARN_MODERATE_MM2:
            flags.append(f"MOD {moderate:.0f}")
        if contact < WARN_CONTACT_MM2:
            flags.append(f"BRIM (contact {contact:.0f})")
        worst = max(worst, steep)
        print(
            f"{path.stem:15s} "
            f"{dims[0]:6.0f} x{dims[1]:6.0f} x{dims[2]:6.0f} "
            f"{contact:9.0f} {moderate:8.0f} {steep:8.0f}  "
            f"{' '.join(flags) if flags else 'ok'}"
        )
    print(f"\nmax steep (>60 deg) overhang across all parts: {worst:.0f} mm^2"
          f" (target ~0)")


if __name__ == "__main__":
    main()
