"""Scan speaker placement along the hood floor: overlap vs offset/lift."""
import math

from build123d import Cylinder, Pos, Rot

from cabinet import PARAMS as CAB, build_cabinet, side_profile

shell = build_cabinet()
wall = CAB["wall"]
t = math.radians(CAB["display_tilt_deg"])
sin_t, cos_t = math.sin(t), math.cos(t)
_, _, sinfo = side_profile(CAB)

BASKET_D, BASKET_H = 52.0, 7.0   # flange disc (the part that meets corners)
STACK_H = 22.0

print("offset  lift   flange_mm3  stack_mm3")
for off in range(22, 40, 2):
    for lift_extra in (0.0, 1.0, 2.0):
        lift = wall + lift_extra
        base_y = sinfo["chin_y"] + cos_t * off + sin_t * lift
        base_z = sinfo["chin_z"] - sin_t * off + cos_t * lift
        flange = (
            Pos(-100.0, base_y, base_z)
            * Rot(-CAB["display_tilt_deg"], 0, 0)
            * Pos(0, 0, BASKET_H / 2)
            * Cylinder(radius=BASKET_D / 2, height=BASKET_H)
        )
        stack = (
            Pos(-100.0, base_y, base_z)
            * Rot(-CAB["display_tilt_deg"], 0, 0)
            * Pos(0, 0, STACK_H / 2)
            * Cylinder(radius=BASKET_D / 2, height=STACK_H)
        )
        fi = shell & flange
        si = shell & stack
        fv = sum(s.volume for s in fi.solids()) if fi is not None else 0.0
        sv = sum(s.volume for s in si.solids()) if si is not None else 0.0
        print(f"{off:5.0f}  {lift_extra:4.1f}   {fv:9.2f}  {sv:9.2f}")
