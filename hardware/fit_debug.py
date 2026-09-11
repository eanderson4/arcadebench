"""Debug probe: where do colliding components intersect the shell?"""
from assembly import place_components
from cabinet import build_cabinet

WATCH = {"display_panel", "retainer_frame", "control_plate", "sbc",
         "speaker_l", "primary_p1_0", "secondary_p1_0"}

shell = build_cabinet()
_, _, groups = place_components()
for name, shapes in groups:
    if name not in WATCH:
        continue
    vol = 0.0
    mins = [1e9] * 3
    maxs = [-1e9] * 3
    for s in shapes:
        inter = shell & s
        if inter is None:
            continue
        for x in inter.solids():
            vol += x.volume
            bb = x.bounding_box()
            for i, (lo, hi) in enumerate(((bb.min.X, bb.max.X), (bb.min.Y, bb.max.Y), (bb.min.Z, bb.max.Z))):
                mins[i] = min(mins[i], lo)
                maxs[i] = max(maxs[i], hi)
    rng = ", ".join(f"{a:.1f}..{b:.1f}" for a, b in zip(mins, maxs))
    print(f"{name:16s} {vol:9.2f} mm^3   overlap bbox: {rng}")
