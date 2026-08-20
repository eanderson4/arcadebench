"""ArcadeBench dimensioned drawings — blueprint-style views from PARAMS.

Built for the cardboard-mockup workflow:
  - drawing_side.png: the side profile = the side-plate cut pattern, with
    overall dims, per-segment lengths, key angles, and a vertex coordinate
    table (origin at the blank's front-bottom corner)
  - drawing_front.png: display-face layout (bezel / mask window / shell
    opening / nameplate) + control-deck layout (every hole, dims from the
    front edge and the centerline)

Run:  hardware/.venv/bin/python hardware/drawing.py
Out:  hardware/out/drawing_side.png + drawing_front.png
"""

import math

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch

from cabinet import OUT_DIR, PARAMS as P, cheek_profile, side_profile
from parts import BEZEL

CUT = "0.15"      # cut line
DIM = "0.45"      # dimension lines
REF = "0.70"      # reference / hidden


def dim(ax, p1, p2, off, text=None, fs=9, decimals=0):
    """Dimension line p1->p2, offset along the left normal by off mm."""
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    q1 = (p1[0] + nx * off, p1[1] + ny * off)
    q2 = (p2[0] + nx * off, p2[1] + ny * off)
    ext = 2 if off >= 0 else -2
    for p, q in ((p1, q1), (p2, q2)):
        ax.plot([p[0], q[0] + nx * ext], [p[1], q[1] + ny * ext],
                color=DIM, lw=0.6, zorder=2)
    ax.annotate("", xy=q1, xytext=q2,
                arrowprops={"arrowstyle": "<->", "color": DIM, "lw": 0.9})
    label = text if text is not None else f"{length:.{decimals}f}"
    ax.text((q1[0] + q2[0]) / 2 + nx * 6, (q1[1] + q2[1]) / 2 + ny * 6,
            label, fontsize=fs, color=DIM, ha="center", va="center",
            rotation=math.degrees(math.atan2(dy, dx)) if abs(dy) > abs(dx)
            else 0)


def seg_label(ax, a, b, n_in, off, text, fs=8):
    """Length label along segment a->b, offset along outward normal -n_in."""
    mx, my = (a[0] + b[0]) / 2 - n_in[0] * off, (a[1] + b[1]) / 2 - n_in[1] * off
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    if ang > 90:
        ang -= 180
    elif ang < -90:
        ang += 180
    ax.text(mx, my, text, fontsize=fs, color=DIM, ha="center", va="center",
            rotation=ang)


def draw_side():
    profile, radii, info = side_profile(P)
    cheek, cheek_radii = cheek_profile(P)
    from panels import seg_data, panel_names

    fig, ax = plt.subplots(figsize=(13, 11))

    # cheek (cut line, solid) + base profile (reference, dashed)
    cy = [v[0] for v in cheek] + [cheek[0][0]]
    cz = [v[1] for v in cheek] + [cheek[0][1]]
    ax.plot(cy, cz, color=CUT, lw=1.8, zorder=3)
    py = [v[0] for v in profile] + [profile[0][0]]
    pz = [v[1] for v in profile] + [profile[0][1]]
    ax.plot(py, pz, color=REF, lw=0.9, ls=(0, (4, 3)), zorder=2)

    # overall dims: depth along the bottom, height at the right
    y_min = min(v[0] for v in cheek)
    z_max = max(v[1] for v in cheek)
    dim(ax, (y_min, 0), (P["cabinet_depth_base"], 0), -22,
        f"blank depth {P['cabinet_depth_base'] + abs(y_min):.0f} "
        f"(nose radii pull the extreme in ~2 mm)")
    # true height max is the marquee top, not above the back wall —
    # dimension it at the right with an extension line from the peak
    i_peak = max(range(len(cheek)), key=lambda i: cheek[i][1])
    peak = cheek[i_peak]
    ax.plot([peak[0], P["cabinet_depth_base"] + 34], [peak[1], peak[1]],
            color=DIM, lw=0.6, ls=(0, (2, 2)))
    dim(ax, (P["cabinet_depth_base"] + 30, 0),
        (P["cabinet_depth_base"] + 30, z_max), 0, f"overall height {z_max:.0f}")
    # deck + nose heights at the front
    seam = (info["seam_y"], info["seam_z"])
    dim(ax, (0, 0), (0, profile[-1][1]), -20, f"nose {profile[-1][1]:.0f}")
    dim(ax, seam, (seam[0], 0), 14, f"deck ht {info['seam_z']:.0f}")

    # per-segment lengths on the base profile
    segs = seg_data(profile)
    names = panel_names(profile)
    for name, (a, b, length, e, n_in) in zip(names, segs):
        seg_label(ax, a, b, n_in, 9, f"{name} {length:.0f}")

    # angle callouts
    ax.annotate(
        f"display tilt {P['display_tilt_deg']:.0f}\u00b0 from vertical",
        xy=(seam[0] + 40, seam[1] + 180), xytext=(30, 330),
        fontsize=9, color=DIM,
        arrowprops={"arrowstyle": "->", "color": DIM, "lw": 0.7})
    ax.annotate(
        f"deck slope {P['control_deck_slope_deg']:.0f}\u00b0",
        xy=(80, info["deck_z"](80) + 3), xytext=(40, 130),
        fontsize=9, color=DIM,
        arrowprops={"arrowstyle": "->", "color": DIM, "lw": 0.7})
    ax.annotate(
        f"nose undercut {P['nose_undercut_deg']:.0f}\u00b0",
        xy=(4, 40), xytext=(60, 30),
        fontsize=9, color=DIM,
        arrowprops={"arrowstyle": "->", "color": DIM, "lw": 0.7})

    # vertex table for the cheek (cut) profile, origin at blank front-bottom
    lines = ["side-plate vertices (mm from blank front-bottom):"]
    for i, (vy, vz) in enumerate(cheek):
        r = cheek_radii.get(i)
        r_txt = f"  R{r:.0f}" if r else ""
        lines.append(f"V{i}  ({vy - y_min:6.1f}, {vz:6.1f}){r_txt}")
    ax.text(1.02, 0.98, "\n".join(lines), transform=ax.transAxes,
            fontsize=9, family="monospace", va="top",
            bbox={"facecolor": "0.97", "edgecolor": "0.8"})

    ax.set_title("ArcadeBench bartop — side cut pattern (iter 33) — mm, "
                 "solid = side plate, dashed = inner wrap line", fontsize=11)
    ax.set_xlabel("y: front -> back (mm)")
    ax.set_ylabel("z: height (mm)")
    ax.set_aspect("equal")
    ax.grid(True, lw=0.3, color="0.9")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "drawing_side.png", dpi=150)
    plt.close(fig)


def rrect(ax, w, h, r, cx=0, cy=0, **kw):
    ax.add_patch(FancyBboxPatch((cx - w / 2, cy - h / 2), w, h,
                                boxstyle=f"round,pad=0,rounding_size={r}",
                                fill=False, **kw))


def draw_front():
    fig, (axf, axd) = plt.subplots(1, 2, figsize=(16, 9))

    # --- display face (local frame: x across, z up-slope from the seam) ---
    u_ctr = P["screen_center_frac"] * P["display_face_length"]
    face_w = P["cabinet_width"] - 2 * P["cheek_thickness"]
    rrect(axf, face_w, P["display_face_length"], 0, cy=P["display_face_length"] / 2,
          edgecolor=REF, lw=0.9, linestyle=(0, (4, 3)))
    ow = BEZEL["seat_w"] + 2 * BEZEL["border"]
    oh = BEZEL["seat_h"] + 2 * BEZEL["border"]
    rrect(axf, ow, oh, BEZEL["outer_corner_r"], cy=u_ctr,
          edgecolor=CUT, lw=1.8)
    rrect(axf, BEZEL["mask_w"], BEZEL["mask_h"], BEZEL["mask_corner_r"],
          cy=u_ctr, edgecolor=CUT, lw=1.4)
    rrect(axf, P["glass_opening_w"], P["glass_opening_h"],
          P["window_corner_radius"], cy=u_ctr, edgecolor=REF, lw=0.9,
          linestyle=(0, (4, 3)))
    for mx, mz in ((-P["bezel_mount_x"], 0), (P["bezel_mount_x"], 0),
                   (0, -P["bezel_mount_z"]), (0, P["bezel_mount_z"])):
        axf.add_patch(Circle((mx, u_ctr + mz), 1.7, fill=False,
                             edgecolor=REF, lw=0.8))
    # nameplate on the marquee face (above the face top)
    rrect(axf, P["nameplate_w"], P["nameplate_h"], 3.5,
          cy=P["display_face_length"] + 20 + P["nameplate_h"] / 2,
          edgecolor=CUT, lw=1.2)
    axf.text(0, P["display_face_length"] + 20 + P["nameplate_h"] + 4,
             "nameplate (on the marquee face)", fontsize=8, color=DIM,
             ha="center")

    dim(axf, (-ow / 2, u_ctr - oh / 2), (ow / 2, u_ctr - oh / 2), -16,
        f"bezel {ow:.0f}")
    dim(axf, (-ow / 2, u_ctr - oh / 2), (-ow / 2, u_ctr + oh / 2), -16,
        f"{oh:.0f}")
    dim(axf, (-BEZEL["mask_w"] / 2, u_ctr + oh / 2),
        (BEZEL["mask_w"] / 2, u_ctr + oh / 2), 14,
        f"mask window {BEZEL['mask_w']:.0f} (4:3)")
    dim(axf, (BEZEL["mask_w"] / 2, u_ctr - BEZEL["mask_h"] / 2),
        (BEZEL["mask_w"] / 2, u_ctr + BEZEL["mask_h"] / 2), 12,
        f"{BEZEL['mask_h']:.0f}")
    dim(axf, (0, 0), (0, u_ctr), 190,
        f"screen center {u_ctr:.0f} up the face")
    dim(axf, (-face_w / 2, -18), (face_w / 2, -18), 0,
        f"face width {face_w:.0f} between the cheeks")
    axf.set_title("display face — x across, z up-slope from the deck seam (mm)",
                  fontsize=10)
    axf.set_aspect("equal")
    axf.grid(True, lw=0.3, color="0.9")
    axf.axhline(0, color=REF, lw=0.6)
    axf.axvline(0, color=REF, lw=0.6)

    # --- control deck (x across, y from the FRONT edge) --------------------
    deck_d = P["control_deck_depth"]
    axd.add_patch(plt.Rectangle((-170, 0), 340, deck_d, fill=False,
                                edgecolor=REF, lw=0.9, linestyle=(0, (4, 3))))
    pw, pd = P["control_plate_w"], P["control_plate_d"]
    cy = P["control_plate_center_y"]
    rrect(axd, pw, pd, P["control_plate_radius"], cx=P["cluster_offset_x"],
          cy=cy, edgecolor=CUT, lw=1.2)

    cx = P["cluster_offset_x"]
    jx, jy = cx + P["joystick_offset_x"], P["joystick_offset_y"]
    axd.add_patch(Circle((jx, jy), P["joystick_shaft_hole_dia"] / 2,
                         fill=False, edgecolor=CUT, lw=1.4))
    for sx in (-1, 1):
        for sy in (-1, 1):
            axd.add_patch(Circle(
                (jx + sx * P["jlf_mount_spacing_x"] / 2,
                 jy + sy * P["jlf_mount_spacing_y"] / 2),
                P["jlf_mount_hole_dia"] / 2, fill=False, edgecolor=CUT,
                lw=0.9))
    sec_center = P["button_grid_offset_x"] \
        + P["secondary_pitch"] * (P["secondary_count"] - 1) / 2
    cols = [cx + sec_center + (i - (P["primary_count"] - 1) / 2)
            * P["primary_pitch"] for i in range(P["primary_count"])]
    for bx in cols:
        axd.add_patch(Circle((bx, P["primary_row_y"]),
                             P["primary_hole_dia"] / 2, fill=False,
                             edgecolor=CUT, lw=1.4))
        axd.add_patch(Circle((bx, P["primary_row_y"]),
                             P["primary_recess_dia"] / 2, fill=False,
                             edgecolor=REF, lw=0.8, linestyle=(0, (3, 2))))
        axd.add_patch(Circle((bx, P["secondary_row_y"]),
                             P["secondary_hole_dia"] / 2, fill=False,
                             edgecolor=CUT, lw=1.2))
    for sx in (-1, 1):
        axd.add_patch(Circle((sx * P["option_offset_x"], P["option_offset_y"]),
                             P["option_hole_dia"] / 2, fill=False,
                             edgecolor=CUT, lw=1.2))

    # dims: pitch above the grid + cabinet width; everything else in a
    # spec block below the deck (inline dims crowded the cluster)
    dim(axd, (cols[0], P["secondary_row_y"]), (cols[1], P["secondary_row_y"]),
        20, f"pitch {P['primary_pitch']:.0f}")
    axd.annotate(
        f"start/select \u00d824 at (\u00b1{P['option_offset_x']:.0f}, "
        f"{P['option_offset_y']:.0f})",
        xy=(P["option_offset_x"], P["option_offset_y"]), xytext=(60, 148),
        fontsize=8, color=DIM,
        arrowprops={"arrowstyle": "->", "color": DIM, "lw": 0.7})
    dim(axd, (-170, deck_d + 8), (170, deck_d + 8), 0, "cabinet width 340")
    spec = "\n".join([
        "deck spec (mm, y from the front edge along the 8\u00b0 slope):",
        f"  rows:  primaries y={P['primary_row_y']:.0f}   secondaries "
        f"y={P['secondary_row_y']:.0f}   start/select y={P['option_offset_y']:.0f}"
        f"   stick y={P['joystick_offset_y']:.0f}",
        f"  cols:  {cols[0]:.0f} / {cols[1]:.0f} (pitch "
        f"{P['primary_pitch']:.0f})   stick x={jx:.0f}   "
        f"stick \u2192 first column {cols[0] - jx:.0f}",
        f"  holes: stick \u00d8{P['joystick_shaft_hole_dia']:.0f}   JLF "
        f"slots \u00d8{P['jlf_mount_hole_dia']} on "
        f"{P['jlf_mount_spacing_x']:.0f}\u00d7{P['jlf_mount_spacing_y']:.0f}"
        f"   primaries \u00d830 in \u00d8{P['primary_recess_dia']:.0f} wells"
        f"   secondaries/options \u00d824",
        f"  plate: {pw:.0f}\u00d7{pd:.0f} centered ({P['cluster_offset_x']:.0f}"
        f", {P['control_plate_center_y']:.0f})",
    ])
    axd.text(-170, -40, spec, fontsize=8, family="monospace", color=DIM,
             va="top")
    axd.set_title("control deck — x across, y from the front edge (mm)",
                  fontsize=10)
    axd.set_aspect("equal")
    axd.grid(True, lw=0.3, color="0.9")
    axd.axvline(0, color=REF, lw=0.6)

    fig.suptitle("ArcadeBench bartop — face + deck layout (iter 33) — mm",
                 fontsize=11)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "drawing_front.png", dpi=150)
    plt.close(fig)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    draw_side()
    draw_front()
    print(f"exported drawings to {OUT_DIR}")


if __name__ == "__main__":
    main()
