# ArcadeBench brand design system

Status: implemented with `claude-deepseek`, independently reviewed, and published
on 2026-09-15. See [release and review evidence](BRAND-REVIEW-2026-09-15.md).
Direction: **Open Play** — early arcade instruction panels and public
recreation signage. Approachable and graphic, quiet around vivid gameplay.

This document is the rule set. The reviewable visual reference is
[`docs/brand/index.html`](brand/index.html), an internal guide that loads the
shipping stylesheets by relative path so its specimens cannot drift from what
is published. That guide is not a route, is not assembled into `dist/site`, and
is not part of the site contract.

## What this brand is and is not

ArcadeBench is a free public arcade. It is not a neon arcade, not a literal
cabinet, and not a skin for any one game. The identity comes from a single
drawn mark, a tight two-row wordmark, one saturated blue, and the willingness
to stay quiet while gameplay artwork does the talking.

The identity is deliberately **recognizable but not loud**. Everything a
visitor reads — headings, premises, controls, availability — sits on warm
neutral paper. The mark, the play buttons, and nothing else carry colour.

Rules that follow from the direction:

- No neon, no glow, no scanlines, no simulated cabinet, no wooden shelves, no
  brass frames, no paper grain.
- No per-game palette in the shell. Game identity lives inside the 16:9 art
  window and stops at its edge.
- No invented institution, founding date, award, or popularity claim. The only
  promise the site makes is the footer statement about ads, microtransactions,
  and loot boxes.
- No replay, AI, or determinism marketing in the catalog. Those are platform
  details, not the pitch.

## The mark

The mark is **the bench A**: a top slab, two legs, and an extended crossbar.
It reads as a bench and, secondarily, as an A. It is a single solid silhouette —
no badge box, no shadow, no container, no outline stroke.

Authored on a **24×24 grid**:

| Part | Rectangle `x, y, w, h` |
| --- | --- |
| Top slab | `4, 2, 16, 4` |
| Left leg | `4, 6, 4, 16` |
| Right leg | `16, 6, 4, 16` |
| Crossbar (extended) | `2, 12, 20, 4` |

The slab and both legs share the `y = 6` edge, so they are one closed path:

```
M4 2H20V22H16V6H8V22H4Z
```

The crossbar is a second subpath and overlaps the legs. Both are filled in one
`<path>`, so the mark renders as the union of the parts with no seams:

```
M4 2H20V22H16V6H8V22H4Z M2 12H22V16H2Z
```

The shipped file is [`deploy/brand/mark.svg`](../deploy/brand/mark.svg), drawn
in arcade blue. That same file is the catalog favicon at `/brand/mark.svg`. The
catalog intentionally does **not** replace `/favicon.svg`, which remains the
shared icon for the game routes.

**Placement.** The mark appears in three places and no more:

1. The masthead, at 32px, decorative, next to the wordmark.
2. Next to the footer promise, at 15px, in arcade blue — the brand's claim
   about itself, marked with the brand.
3. As the catalog favicon.

Minimum size is 24px for anything a person reads; below that it is a favicon
and carries no meaning on its own. Do not rotate, outline, gradient, or
recolour the mark toward a game's palette. Colourways are limited to the
shipping blue, `--ab-paper` on the dark plate, and a single-colour ink or
currentColor reproduction.

## The wordmark

`ARCADE` stacked over `BENCH`, in `ArcadeBench Sans` 800, upper-cased at 13px
with `line-height: 1.06`, sitting directly right of the mark.

The two rows are balanced by **tracking, not size**: `ARCADE` at `0.05em` and
`BENCH` at `0.15em`, because BENCH carries wider letters than ARCADE. Both rows
then occupy about the same width and the block reads as a square.

The link always carries `aria-label="ArcadeBench"` and the visible lettering is
`aria-hidden`. The accessible name is the plain product name, so stacking and
upper-casing the lettering costs nothing to a screen reader, and the decorative
mark is never a second, differently named link target.

An optional **FREE PLAY** descriptor sits after the stack behind a 1px rule,
at 10px/600 with `0.16em` tracking, and appears at **900px and above only**.
It describes the arcade truthfully; it is not an institution or a claim.

## The double rule

The mark's crossbar reappears as a **double rule**: two hairlines with a 3px
gap, drawn by `.ab-crossbar-rule` under the masthead. It is the only ornament
in the system. It is used **once per page at most** — never on cards, panels,
sections, or the footer.

## Colour

Every token is prefixed `--ab-`. Ratios are measured against paper `#F4F1E7`.

| Token | Hex | Contrast | Use |
| --- | --- | --- | --- |
| `--ab-paper` | `#F4F1E7` | — | Page background |
| `--ab-surface` | `#FFFEF9` | — | Cards, panels |
| `--ab-ink` | `#252824` | 13.2:1 | All primary text, focus ring |
| `--ab-ink-soft` | `#45483F` | 8.3:1 | Card premises |
| `--ab-ink-muted` | `#5F625B` | 5.5:1 | Secondary text, supporting detail |
| `--ab-blue` | `#2749A5` | 7.2:1 | The mark and the play actions |
| `--ab-blue-strong` | `#1E3A86` | 9.0:1 | Hover and press only |
| `--ab-red` | `#BF432E` | 4.6:1 | Fault states only |
| `--ab-rule` | `#D4D2C8` | 1.3:1 | Dividers — never text |
| `--ab-rule-strong` | `#B0AEA4` | 2.0:1 | Secondary button borders |
| `--ab-plate` | `#0D1417` | — | Letterbox behind 16:9 art |
| `--ab-focus` | `#252824` | 13.2:1 | Focus ring |
| `--ab-on-blue` | `#F4F1E7` | 7.2:1 on blue | Text on blue |

Discipline:

- **Blue is concentrated**, not distributed. It belongs to the mark and the
  play actions. It is not a heading colour, a link colour, a border colour, or
  a background wash.
- **Red is scarce.** At 4.6:1 it is the thinnest margin in the palette, so it is
  held to fault labels at 13px/600 or larger. Today that means the 404 route
  label and nothing else. It is never body copy and never an icon carrying
  meaning alone.
- **Rule and plate are never text colours.**
- **Large surfaces stay neutral.** A screen that is mostly blue is wrong.
- Muted text on paper must clear 4.5:1. Do not lighten `--ab-ink-muted` without
  re-measuring.

## Typography

One family: **`ArcadeBench Sans`**, which is Noto Sans self-hosted at three
real weights — 400, 600, and 800. The name is catalog-owned so it cannot
collide with a host-installed face of the same family.

- Body is **400**. Utility (actions, labels, navigation) is **600**. Titles are
  **800**.
- Only those three weights ship. There is no synthetic bolding and no 700 file,
  so nothing may ask for a weight that does not exist.
- `font-synthesis: none` is set on `:root` to make a missing weight fail
  visibly rather than silently faux-bold.
- Body copy is 15–16px. Nothing readable is smaller than 12px, and 12px is
  reserved for upper-cased labels.

Where the fonts live and why:

| Detail | Value |
| --- | --- |
| Family source | `@fontsource/noto-sans`, already installed and pinned |
| Files | `noto-sans-latin-{400,600,800}-normal.woff2` |
| Served from | `/brand/fonts/`, addressed relatively as `fonts/…` from `brand.css` |
| Declared in | `deploy/brand/brand.css`, three explicit `@font-face` rules |
| `font-display` | `swap` |
| `local()` | **Never.** A host-installed face must not be able to substitute |
| Licence | SIL Open Font License 1.1, shipped at `/brand/noto-sans-OFL-1.1.txt` |

The relative font URLs are deliberate: the same `brand.css` resolves
`fonts/…` to `/brand/fonts/…` when served from the site root and to
`deploy/brand/fonts/…` when the internal guide opens it from disk.

No game font, game font path, or game stylesheet is changed by any of this.
The games keep their own typography inside their own routes.

## Spacing, radii, layout

- **Spacing** is a 4px scale: `--ab-space-1` = 4px through `--ab-space-7` = 48px.
- **Radii** are restrained: `--ab-radius` = **6px** for cards, panels, and
  buttons; `--ab-radius-sm` = 4px for small inline hover backgrounds.
- **Content width** is `--ab-content` = 1120px, centred with generous margins.
- **Targets** are at least `--ab-target` = 44px in both dimensions.
- **Rules** are 1px hairlines. Borders are fine; shadows are not used.
- **Corners** are never larger than 6px in the shell.

## Components

**Game card.** A 16:9 artwork window above a body of title (800), premise
(400), at most two supporting details, and a play action pinned to the bottom.
The card surface is neutral. The only brand colour on it is the play button.
The markup is semantic and has not changed: `.game-card`, `.game-card__art`,
`.game-card__body`, `.game-card__title`, `.game-card__premise`,
`.game-card__meta`, `.game-card__play`.

**Play action (primary).** Arcade blue fill, `--ab-on-blue` text, a 2px border
in the same blue, 6px radius, 46px minimum height. Hover and press move to
`--ab-blue-strong`. The trailing arrow nudges 3px on hover and does not move
under `prefers-reduced-motion`.

**Secondary action.** Surface fill, `--ab-rule-strong` border, ink text. Hover
lifts the border to ink. Used by the 404 recovery links.

**Focus.** Every focusable element gets a **3px ink ring at a 3px offset**.
The offset matters: it puts the ring on paper next to a blue button rather than
on top of blue, which is why ink and not blue. Focus is never removed and never
restyled per component.

**Motion.** No new animation. Existing hover transitions are 130ms and are
disabled entirely under `prefers-reduced-motion: reduce`. Nothing in the shell
has an entrance animation, autoplay, or decorative movement.

## Gameplay art boundaries

The artwork is the game's, not the brand's. Within the catalog:

- Previews must be **real gameplay frames** from the shipped games. A still
  image is enough; no autoplay is required.
- Previews are **not** recoloured to match the palette, **not** placed inside a
  shared illustrated cabinet, **not** cropped into a brand frame, and **not**
  replaced by a logo, product illustration, or title card.
- Each preview carries a short plain-language caption that completes the idea
  without explaining every rule, scoped to `.game-card__art img`.
- Controls and availability in the card copy must be **truthful**. An unranked
  prototype says so.
- A third visually different game must be able to join the layout without a
  redesign. If it cannot, the shell has taken on a game's identity.

## Voice

Plain, warm, and specific. Second person for actions ("Choose your game.",
"Play Partition"). No exclamation marks, no hype, no invented institutions, no
founding claims, no ratings or popularity. Availability language tracks real
project status. The footer statement is the whole promise:

> No ads. No microtransactions. No loot boxes. Just games.

## Files

| Path | Role |
| --- | --- |
| `deploy/brand/brand.css` | Fonts, tokens, mark lockup, crossbar rule |
| `deploy/brand/mark.svg` | The mark; also the catalog favicon |
| `deploy/brand/fonts/*.woff2` | Noto Sans 400 / 600 / 800 |
| `deploy/brand/noto-sans-OFL-1.1.txt` | Font licence |
| `deploy/arcade.css` | Catalog layout and components, on the tokens |
| `deploy/index.html`, `deploy/404.html` | Link `brand.css` before `arcade.css` |
| `docs/brand/index.html` | Internal visual guide (not published) |
| `scripts/site-contract.mjs` | Exact allowlist of shipped brand assets |
