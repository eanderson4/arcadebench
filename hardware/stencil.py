"""ArcadeBench paper stencils — tile 1:1 DXF cut templates onto printer pages.

Reads hybrid-build DXFs (exported by hybrid.py: side plates or flat wrap
panels) and emits tiled PDF pages at true 1:1 scale: print at "Actual size /
100%", trim, align the registration crosshairs in the page overlaps, tape,
trace onto wood, cut. Scale-check bars and cut notes ride on the empty strip
at the top of the uppermost row (or rotated along the right edge for tall
parts like the neck). A side plate spans 2x2 Letter pages; the flat panels
span 2 (or 2x2 for bottom).

Cut geometry is drawn bold black; every hole up to Ø24 also gets a center
drill crosshair. Panel stencils label which neighbor panel meets each short
end (the DXF frame is centered — without the labels the cutout positions
mirror if the panel gets flipped).

Run:  hardware/.venv/bin/python hardware/stencil.py [--dxf PATH ...] [--paper letter|a4]
      one --dxf  -> <dxf dir>/<part>_stencil_<paper>.pdf
      many --dxf -> <dxf dir>/panels_stencil_<paper>.pdf (parts appended in
                    order; page numbering restarts per part)
"""

import argparse
import math
from datetime import datetime
from pathlib import Path

import ezdxf
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Circle as CirclePatch
from matplotlib.patches import Rectangle as RectPatch

PAPERS = {"letter": (8.5 * 25.4, 11 * 25.4), "a4": (210.0, 297.0)}
CROSS_MAX_R = 12.0  # mm; holes up to this radius get a center drill cross

HERE = Path(__file__).parent
DEF_DXF = HERE / "out" / "hybrid" / "wood" / "side_l.dxf"

CUT_LW = 1.3       # pt, bold cut lines
MARK = "0.25"      # registration/content-mark gray

# Per-part stencil text. ends = neighbor panel at the -Y / +Y short end
# (sketch frame: Y runs segment A -> B, so -Y meets the previous panel).
PARTS = {
    "side_l": dict(
        title="side panel", material="12 mm Baltic birch plywood",
        features="Ø2 crosshairs = cleat pilot guides. Vent slots: "
                 "starter-drill inside the slot, then jigsaw."),
    "panel_bottom": dict(
        title="bottom panel", material="6 mm Baltic birch plywood",
        features="Ø4.5 holes = foot screws; Ø3.4 = cleat screws.",
        ends=("nose", "back")),
    "panel_back": dict(
        title="back panel", material="6 mm Baltic birch plywood",
        features="Cutouts: power switch, DC jack, USB-C, admin buttons, "
                 "service hatch + boss holes.",
        ends=("bottom", "taper")),
    "panel_taper": dict(
        title="taper panel", material="6 mm Baltic birch plywood",
        features="Ø3.4 holes = cleat screws.", ends=("back", "neck")),
    "panel_neck": dict(
        title="neck panel", material="6 mm Baltic birch plywood",
        features="Ø3.4 holes = cleat screws.", ends=("taper", "top")),
    "panel_top": dict(
        title="top panel", material="6 mm Baltic birch plywood",
        features="Ø3.4 holes = cleat screws.", ends=("neck", "marquee")),
}


def load_entities(path):
    """DXF -> flat list of ('line'|'arc'|'circle', ...) in mm."""
    msp = ezdxf.readfile(path).modelspace()
    ents = []
    for e in msp:
        t = e.dxftype()
        if t == "LINE":
            ents.append(("line", e.dxf.start.x, e.dxf.start.y,
                         e.dxf.end.x, e.dxf.end.y))
        elif t == "ARC":
            ents.append(("arc", e.dxf.center.x, e.dxf.center.y, e.dxf.radius,
                         math.radians(e.dxf.start_angle),
                         math.radians(e.dxf.end_angle)))
        elif t == "CIRCLE":
            ents.append(("circle", e.dxf.center.x, e.dxf.center.y,
                         e.dxf.radius))
        elif t == "LWPOLYLINE":
            pts = list(e.get_points())
            if any(p[4] != 0 for p in pts):
                raise SystemExit(f"{path}: LWPOLYLINE with bulge — "
                                 "extend stencil.py")
            for i in range(len(pts) - 1):
                ents.append(("line", pts[i][0], pts[i][1],
                             pts[i + 1][0], pts[i + 1][1]))
            if e.closed:
                ents.append(("line", pts[-1][0], pts[-1][1],
                             pts[0][0], pts[0][1]))
        else:
            raise SystemExit(f"{path}: unsupported entity {t} — "
                             "extend stencil.py")
    return ents


def bbox(ents):
    xs, ys = [], []
    for e in ents:
        if e[0] == "line":
            xs += [e[1], e[3]]
            ys += [e[2], e[4]]
        else:  # arc/circle: full-circle bounds (fine for padding)
            xs += [e[1] - e[3], e[1] + e[3]]
            ys += [e[2] - e[3], e[2] + e[3]]
    return min(xs), min(ys), max(xs), max(ys)


def draw_entities(ax, ents, tx, ty, s=1.0, cut_lw=CUT_LW):
    """Draw cut geometry with x' = tx + s*x (mm coords throughout)."""
    for e in ents:
        if e[0] == "line":
            ax.plot([tx + s * e[1], tx + s * e[3]],
                    [ty + s * e[2], ty + s * e[4]],
                    color="k", lw=cut_lw, solid_capstyle="round", zorder=3)
        elif e[0] == "arc":
            _, cx, cy, r, a0, a1 = e
            sweep = (a1 - a0) % (2 * math.pi) or 2 * math.pi
            n = max(6, int(math.degrees(sweep) / 4))
            angs = [a0 + sweep * i / n for i in range(n + 1)]
            ax.plot([tx + s * (cx + r * math.cos(a)) for a in angs],
                    [ty + s * (cy + r * math.sin(a)) for a in angs],
                    color="k", lw=cut_lw, solid_capstyle="round", zorder=3)
        else:
            _, cx, cy, r = e
            x, y = tx + s * cx, ty + s * cy
            ax.add_patch(CirclePatch((x, y), s * r, fill=False, ec="k",
                                     lw=cut_lw if r > CROSS_MAX_R else 0.7,
                                     zorder=3))
            if r <= CROSS_MAX_R:
                d = s * (r + 3.0)  # center crosshair for the drill press
                ax.plot([x - d, x + d], [y, y], color="k", lw=0.5, zorder=3)
                ax.plot([x, x], [y - d, y + d], color="k", lw=0.5, zorder=3)


def new_page(w, h):
    """Figure filling the whole sheet, 1 data unit = 1 mm. Do NOT use
    bbox_inches='tight' — the axes box must span the page for true scale."""
    fig = plt.figure(figsize=(w / 25.4, h / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.axis("off")
    return fig, ax


def node_label(i, j):
    return f"{chr(65 + j)}{i}"  # A0.. bottom row, B0.. next, like a grid


def corner_name(c, r, cols, rows):
    parts = []
    if rows > 1:
        parts.append("top" if r == rows - 1 else
                     "bottom" if r == 0 else f"row {r + 1}")
    if cols > 1:
        parts.append("left" if c == 0 else
                     "right" if c == cols - 1 else f"col {c + 1}")
    return "-".join(parts) if parts else "single page"


def scale_bar(ax, x, y, length, label):
    """Outline scale bar with 10 mm ticks, for print-scale verification."""
    ax.add_patch(RectPatch((x, y), length, 6, fill=False, ec="k", lw=1.0))
    for t in range(1, int(length / 10)):
        ax.plot([x + t * 10, x + t * 10], [y, y + 2], color="k", lw=0.5)
    ax.text(x + length / 2, y + 9, label, fontsize=7, ha="center",
            color="0.2")


def cut_sheet_page(pdf, w, h):
    """Append the shop cut sheet: every wood panel's cut size + hole
    layout as numbers, so the rectangle panels don't need templates."""
    fig, ax = new_page(w, h)
    ax.text(15, h - 18, "ArcadeBench — wood cut sheet (hybrid build)",
            fontsize=13, fontweight="bold", va="center")
    notes = [
        "All flat panels: 6 mm Baltic birch plywood, 315 mm wide.  "
        "Side panel: 12 mm — full silhouette, use side_l_stencil_letter.pdf.",
        "Cleat holes: Ø3.4 mm (3.5 drill OK), 8.5 mm in from each long "
        "edge, in pairs across the panel.",
        "Positions are measured from the panel's FINAL edges; ±1 mm is "
        "fine everywhere (M3 screws into heat-set inserts).",
    ]
    for k, line in enumerate(notes):
        ax.text(15, h - 26 - k * 4.6, line, fontsize=7.5, va="center",
                color="0.2")
    hy = h - 45
    for x, txt in ((15, "panel"), (50, "cut to (mm)"),
                   (90, "holes (mm)")):
        ax.text(x, hy, txt, fontsize=8, fontweight="bold", va="center")
    ax.plot([15, w - 15], [hy - 2.5, hy - 2.5], color="k", lw=0.8)
    groups = [
        ("taper", "315 x 63.5",
         ["1 pair at center (~32)"]),
        ("neck", "315 x 245.9",
         ["3 pairs: 20 from each end + center (~123)"]),
        ("top", "315 x 143.0",
         ["3 pairs: 20 from each end + center (71.5)"]),
        ("bottom", "315 x 321.5",
         ["cleat pairs: 20 from each end + center (~161)",
          "feet: 4x Ø4.5, 27.5 from each side edge;",
          "33.5 from the NOSE end / 28 from the back end —",
          "mark the nose end before drilling"]),
        ("back", "315 x 120",
         ["cut from the 2-page template (this PDF): L-shaped",
          "hatch + USB-C opening, Ø19 power, Ø11 DC, 10x Ø3.4;",
          "NOT left/right symmetric — trace, don't measure"]),
    ]
    y = hy - 8
    for name, size, lines in groups:
        ax.text(15, y, name, fontsize=8.5, fontweight="bold", va="center")
        ax.text(50, y, size, fontsize=8.5, va="center")
        for k, line in enumerate(lines):
            ax.text(90, y - k * 4.6, line, fontsize=8, va="center")
        y -= len(lines) * 4.6 + 3.5
        ax.plot([15, w - 15], [y + 1.5, y + 1.5], color="0.75", lw=0.4)
    ax.text(15, y - 4, "source: hardware/out/hybrid/wood/*.dxf "
            "(hardware/.venv/bin/python hardware/hybrid.py)",
            fontsize=6.5, color="0.45", va="center")
    pdf.savefig(fig)
    plt.close(fig)


def render_part(pdf, dxf, args):
    """Append one part's tiled pages to an open PdfPages. Returns a
    (stem, pages, cols, rows) summary."""
    stem = dxf.stem
    part = PARTS.get(stem) or dict(
        title=stem.replace("_", " "),
        material="6 mm Baltic birch plywood"
        if stem.startswith("panel_") else "plywood",
        features="")

    W, H = PAPERS[args.paper]
    ents = load_entities(dxf)
    gx0, gy0, gx1, gy1 = bbox(ents)
    ox0, oy0 = gx0 - args.pad, gy0 - args.pad
    span_w, span_h = gx1 - gx0 + 2 * args.pad, gy1 - gy0 + 2 * args.pad
    cw, ch = W - 2 * args.margin, H - 2 * args.margin  # tile content zone
    step_w, step_h = cw - args.overlap, ch - args.overlap
    if step_w < 20 or step_h < 20:
        raise SystemExit("overlap too large for this paper size")
    cols = 1 if span_w <= cw else math.ceil((span_w - cw) / step_w) + 1
    rows = 1 if span_h <= ch else math.ceil((span_h - ch) / step_h) + 1
    n_pages = cols * rows
    # empty strip height at the top of the uppermost row (notes live there)
    slack = ch + (rows - 1) * step_h - span_h

    def page_no(c, r):
        return 1 + r * cols + c  # bottom row first

    for r in range(rows):
        for c in range(cols):
            fig, ax = new_page(W, H)
            wx0 = ox0 + c * step_w - args.margin
            wy0 = oy0 + r * step_h - args.margin
            draw_entities(ax, ents, -wx0, -wy0)
            ax.add_patch(RectPatch((args.margin, args.margin), cw, ch,
                                   fill=False, ec=MARK, lw=0.4,
                                   ls=(0, (4, 3)), zorder=2))
            for i in (c, c + 1):
                for j in (r, r + 1):
                    nx = ox0 + i * step_w - wx0
                    ny = oy0 + j * step_h - wy0
                    ax.add_patch(CirclePatch((nx, ny), 3.5, fill=False,
                                             ec=MARK, lw=0.5, zorder=4))
                    ax.plot([nx - 5, nx + 5], [ny, ny], color=MARK,
                            lw=0.5, zorder=4)
                    ax.plot([nx, nx], [ny - 5, ny + 5], color=MARK,
                            lw=0.5, zorder=4)
                    ax.text(nx + (5.5 if i == c else -5.5),
                            ny + (5.5 if j == r else -5.5),
                            node_label(i, j), fontsize=6, color=MARK,
                            ha="left" if i == c else "right",
                            va="bottom" if j == r else "top", zorder=4)
            # panel orientation: which neighbor meets each short end
            ends = part.get("ends")
            if ends:
                ex = gx0 + 25  # near the left end: stays inside one tile
                for gy, nb, va in ((gy0 + 3.2, ends[0], "bottom"),
                                   (gy1 - 3.2, ends[1], "top")):
                    ax.text(ex - wx0, gy - wy0,
                            f"meets: {nb} panel", fontsize=6,
                            color="0.3", ha="left", va=va, zorder=4,
                            bbox=dict(facecolor="white",
                                      edgecolor="none", pad=0.3))
            ax.text(args.margin, H - args.margin / 2,
                    f"ArcadeBench {part['title']} stencil — "
                    f"p{page_no(c, r)}/{n_pages} "
                    f"({corner_name(c, r, cols, rows)}) — scale 1:1, "
                    f"print at 100%",
                    fontsize=6.5, color="0.3", va="center",
                    bbox=dict(facecolor="white", edgecolor="none",
                              pad=0.3))
            # Notes + scale check + assembly map, rendered ONCE per part
            # on whichever free strip it leaves: above it on the top-left
            # page, else rotated along the right edge of the last column
            # (tall parts like the neck leave no slack at the top).
            blk = [
                f"ArcadeBench — {part['title']} stencil (1:1)",
                f"1x {part['title']}, {part['material']}. All black "
                "lines are cut lines; drill crosshair-marked holes "
                "first.",
                part["features"],
                f"Overall {gx1 - gx0:.0f} x {gy1 - gy0:.0f} mm. Ease "
                "outside edges with a router or sandpaper after "
                "cutting.",
                "PRINT at 100% / \"Actual size\" — never \"fit to "
                "page\". Verify the 100 mm bar.",
                "TAPE: trim along a dashed line, overlap the next "
                "page, align matching crosshairs (same label), tape.",
                "Page order: left-to-right, bottom-to-top (map). Cut "
                "the outer outline last.",
            ]
            blk = [ln for ln in blk if ln]
            slack_w = cw + (cols - 1) * step_w - span_w
            if r == rows - 1 and c == 0 and slack > 30:
                ny0 = gy1 + 2 - wy0  # strip bottom in page coords
                for k, line in enumerate(blk):
                    ax.text(args.margin + 2,
                            ny0 + slack - 8 - k * 4.6, line,
                            fontsize=8, va="center", color="0.1",
                            bbox=dict(facecolor="white",
                                      edgecolor="none", pad=0.2))
                bar_y = ny0 + slack - (8 + len(blk) * 4.6 + 14)
                if bar_y > ny0 + 4:  # keep clear of the geometry
                    scale_bar(ax, args.margin + 2, bar_y, 100,
                              "100 mm — measure to verify scale")
                mx0 = args.margin + 2 + 115
                my0 = bar_y
                for rr in range(rows):
                    for cc in range(cols):
                        ax.add_patch(RectPatch(
                            (mx0 + cc * 12, my0 + rr * 12), 12, 12,
                            fill=False, ec="0.4", lw=0.6))
                        ax.text(mx0 + (cc + 0.5) * 12,
                                my0 + (rr + 0.5) * 12,
                                f"p{page_no(cc, rr)}", fontsize=5,
                                ha="center", va="center", color="0.3")
                ax.text(mx0, my0 - 4, "assembly order", fontsize=6,
                        color="0.35")
            elif r == 0 and c == cols - 1 and slack_w > 30:
                sx0 = gx1 + 4 - wx0  # strip left edge in page coords
                for k, line in enumerate(blk):
                    ax.text(sx0 + k * 4.6, args.margin + 2, line,
                            fontsize=8, rotation=90,
                            rotation_mode="anchor", ha="left",
                            va="bottom", color="0.1",
                            bbox=dict(facecolor="white",
                                      edgecolor="none", pad=0.2))
                bar_x = sx0 + len(blk) * 4.6 + 4
                if bar_x + 6 < args.margin + cw:
                    ax.add_patch(RectPatch(
                        (bar_x, args.margin + 2), 6, 100,
                        fill=False, ec="k", lw=1.0))
                    for t in range(1, 10):
                        ax.plot([bar_x, bar_x + 2],
                                [args.margin + 2 + t * 10] * 2,
                                color="k", lw=0.5)
                    ax.text(bar_x + 9, args.margin + 52,
                            "100 mm — verify scale", fontsize=7,
                            rotation=90, rotation_mode="anchor",
                            ha="center", va="bottom", color="0.2")
            pdf.savefig(fig)
            plt.close(fig)

    return stem, n_pages, cols, rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--paper", choices=sorted(PAPERS), default="letter")
    ap.add_argument("--dxf", type=Path, nargs="+", default=[DEF_DXF],
                    help="template(s) to render, in PDF order")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--margin", type=float, default=10.0,
                    help="mm page margin kept clear of tile content")
    ap.add_argument("--overlap", type=float, default=20.0,
                    help="mm of geometry repeated on adjacent tiles")
    ap.add_argument("--pad", type=float, default=2.0,
                    help="mm of empty space around the template bbox")
    ap.add_argument("--cutsheet", action="store_true",
                    help="append the wood cut sheet (all panel dimensions "
                    "as numbers) as the last page")
    args = ap.parse_args()

    for dxf in args.dxf:
        if not dxf.exists():
            raise SystemExit(
                f"{dxf} not found — export the template first:\n"
                "  hardware/.venv/bin/python hardware/hybrid.py")
    if args.margin < 5 or args.overlap < 5:
        raise SystemExit("margin and overlap must both be >= 5 mm")

    if args.out:
        out = args.out
    elif len(args.dxf) == 1:
        out = args.dxf[0].with_name(
            f"{args.dxf[0].stem}_stencil_{args.paper}.pdf")
    else:
        out = args.dxf[0].with_name(f"panels_stencil_{args.paper}.pdf")

    with PdfPages(out) as pdf:
        meta = pdf.infodict()
        meta["Title"] = "ArcadeBench wood stencils (1:1)"
        meta["CreationDate"] = datetime.now()
        total = 0
        for dxf in args.dxf:
            stem, n, cols, rows = render_part(pdf, dxf, args)
            total += n
            print(f"  {stem:14s} {n} page(s) ({cols}x{rows})")
        if args.cutsheet:
            cut_sheet_page(pdf, *PAPERS[args.paper])
            total += 1
            print(f"  {'cut sheet':14s} 1 page(s)")
    print(f"{out}  ({total} pages, {args.paper})")


if __name__ == "__main__":
    main()
