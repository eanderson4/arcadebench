"""Shared orthographic z-buffer renderer for build123d shapes.

Correct occlusion (numpy z-buffer), per-part flat colors, two-sided shading
so interior faces read darker. Used by cabinet.py and assembly.py.
"""

import math
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg

# name -> (elev, azim, x_max slice or None)
VIEWS = {
    "front": (0, -90, None),
    "side": (0, 180, None),
    "rear": (0, 90, None),
    "top": (89.9, -90, None),
    "iso": (25, -60, None),
    "section": (15, -25, 0.0),  # x<=0 half, camera front-right
}

LIGHT = np.array([0.4, -0.5, 0.75])
LIGHT /= np.linalg.norm(LIGHT)


def render_parts(parts, out_dir, prefix="view", size=1000, views=None):
    """Render [(shape, (r, g, b)), ...] to one PNG per view in out_dir."""
    views = views if views is not None else VIEWS
    out_dir = Path(out_dir)

    pts_list, tri_list, tri_rgb = [], [], []
    for shape, rgb in parts:
        verts, tris = shape.tessellate(tolerance=0.2)
        base = len(pts_list)
        pts_list.extend((v.X, v.Y, v.Z) for v in verts)
        tri_list.extend((t[0] + base, t[1] + base, t[2] + base) for t in tris)
        tri_rgb.extend([rgb] * len(tris))

    pts = np.array(pts_list)
    tri_idx = np.array(tri_list)
    tri_rgb = np.array(tri_rgb)

    p0 = pts[tri_idx[:, 0]]
    p1 = pts[tri_idx[:, 1]]
    p2 = pts[tri_idx[:, 2]]
    normals = np.cross(p1 - p0, p2 - p0)
    norms = np.linalg.norm(normals, axis=1)
    valid = norms > 0
    norms[norms == 0] = 1.0
    normals /= norms[:, None]
    centroids = (p0 + p1 + p2) / 3

    for name, (elev, azim, x_max) in views.items():
        el, az = math.radians(elev), math.radians(azim)
        cam = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
        up = np.array([0.0, 0.0, 1.0])
        if abs(cam @ up) > 0.99:  # top view: pick another up
            up = np.array([0.0, -1.0, 0.0])
        u = np.cross(cam, up)
        u /= np.linalg.norm(u)
        v = np.cross(u, cam)

        keep = np.ones(len(tri_idx), dtype=bool)
        if x_max is not None:
            keep &= centroids[:, 0] <= x_max
        idx = np.where(keep & valid)[0]

        pu = pts @ u
        pv = pts @ v
        pd = pts @ cam
        # fit projected bounds to the canvas with a margin
        margin = 0.06
        span_u = pu.max() - pu.min()
        span_v = pv.max() - pv.min()
        scale = (1 - 2 * margin) * size / max(span_u, span_v)
        cu = (pu - (pu.max() + pu.min()) / 2) * scale + size / 2
        cv = size / 2 - (pv - (pv.max() + pv.min()) / 2) * scale

        img = np.ones((size, size, 3))
        zbuf = np.full((size, size), -np.inf)
        for i in idx:
            xs = (cu[tri_idx[i, 0]], cu[tri_idx[i, 1]], cu[tri_idx[i, 2]])
            ys = (cv[tri_idx[i, 0]], cv[tri_idx[i, 1]], cv[tri_idx[i, 2]])
            ds = (pd[tri_idx[i, 0]], pd[tri_idx[i, 1]], pd[tri_idx[i, 2]])
            x0 = max(int(min(xs)) - 1, 0)
            x1 = min(int(max(xs)) + 2, size)
            y0 = max(int(min(ys)) - 1, 0)
            y1 = min(int(max(ys)) + 2, size)
            if x0 >= x1 or y0 >= y1:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-12:
                continue
            w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            w2 = 1 - w0 - w1
            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any():
                continue
            depth = w0 * ds[0] + w1 * ds[1] + w2 * ds[2]
            zsub = zbuf[y0:y1, x0:x1]
            hit = inside & (depth > zsub)
            if not hit.any():
                continue
            n = normals[i]
            facing = n @ cam > 0
            nn = n if facing else -n
            shade = 0.35 + 0.65 * max(0.0, nn @ LIGHT)
            if not facing:
                shade *= 0.45  # interior reads darker
            zsub[hit] = depth[hit]
            img[y0:y1, x0:x1][hit] = tri_rgb[i] * shade

        mpimg.imsave(out_dir / f"{prefix}_{name}.png", np.clip(img, 0, 1))
