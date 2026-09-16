# ArcadeBench homepage: game catalog

Status: implemented with `claude-deepseek`, independently reviewed, and published
on 2026-09-15. See [review evidence](CATALOG-REVIEW-2026-09-15.md).

The catalog now carries the ArcadeBench brand system — the bench mark, the
stacked wordmark, and a token layer — without changing the page's hierarchy,
copy, card markup, or quiet character. The rules for that layer live in
[the brand design system](BRAND-DESIGN-SYSTEM.md); the visual reference is the
internal guide at [`docs/brand/index.html`](brand/index.html). This brief
remains the source of truth for the catalog's own concept, structure, and card
anatomy, and the two documents should not disagree.

## Concept

**A quiet independent game library, with each game bringing its own world.**

ArcadeBench is a free, public arcade collection inspired by the early arcade
era—open to everyone, and free of ads, microtransactions, and gambling-like loot
boxes. ArcadeBench is the cabinet and platform; its entries are games. The
homepage should help someone compare the games and start playing. Use generous
spacing, clear titles, restrained navigation, and prominent artwork.

The preferred direction is warm light neutral. The page's character comes from
typography and composition. Game identity lives inside the artwork. Neutral
surroundings distinguish Partition's cold geometry from Maltline's warm fountain.

## Page hierarchy and language

1. Compact masthead: ArcadeBench wordmark, with a small set of useful existing
   navigation links.
2. Main heading: **“Choose your game.”** One short supporting sentence can
   introduce ArcadeBench as a free browser arcade for everyone, inspired by the
   early arcade era, with simple controls, quick rounds, and high scores worth
   chasing. Keep the framing on public, free play; no ads, microtransactions, or
   loot boxes. Replay, AI, and determinism are supporting platform details and
   should not lead the catalog.
3. Two equally prominent game cards, immediately visible on desktop. Each has
   a recognizable image, title, brief description, and explicit play link.
4. Quiet secondary information and footer: the no ads/microtransactions/loot
   boxes statement, project links, and existing policy links, without competing
   with the games.

Call entries “games” throughout. Use **“Play Partition”** and **“Play Maltline”**
for their primary actions. Avoid cabinet numbering and “Enter Cabinet.” Keep
release or availability language tied to actual project status.

## Visual system

The catalog's visual language is the ArcadeBench brand system, expressed as
`--ab-` tokens in `deploy/brand/brand.css` and consumed by `deploy/arcade.css`.
See [the brand design system](BRAND-DESIGN-SYSTEM.md) for the full rule set and
the internal guide at [`docs/brand/index.html`](brand/index.html) for specimens.

- **Color:** warm off-white page (`--ab-paper` `#f4f1e7`), near-white card
  surfaces (`--ab-surface` `#fffef9`), charcoal text (`--ab-ink` `#252824`),
  soft gray rules (`--ab-rule` `#d4d2c8`). Arcade blue (`--ab-blue` `#2749a5`)
  is concentrated in the bench mark and the play actions, and nowhere else.
  Warm red (`--ab-red` `#bf432e`) is scarce and reserved for fault states.
  Muted secondary text is `--ab-ink-muted` `#5f625b` at 5.5:1 on paper.
- **Typography:** `ArcadeBench Sans` — self-hosted Noto Sans at real weights
  400, 600, and 800. Body 400, utility 600, titles 800. No synthetic weights.
  Keep game-specific lettering in the game artwork. Avoid global arcade
  lettering or an elaborate editorial font pairing.
- **Layout:** centered content at `--ab-content` 1120px wide; generous outer
  margins; two equal columns with approximately 24–32px between them. Keep the
  masthead and introductory text compact enough to prioritize the collection.
- **Surfaces:** fine 1px borders, `--ab-radius` 6px corners, no shadows. No
  simulated paper grain, wooden shelves, brass frames, scanlines, or full-page
  glow.
- **Interaction:** a 3px ink focus ring at a 3px offset on every focusable
  element, and restrained 130ms hover feedback that is disabled under
  `prefers-reduced-motion`. No autoplay footage or decorative movement is
  needed to communicate the direction.

## Card anatomy and art direction

Use a generous **16:9 visual window** above a simple shared information area:
game title, a one-sentence premise, at most two useful descriptors, and a play
link. Keep essential text as accessible HTML outside the image. Shared alignment
and proportions organize the catalog; the images provide its variety.

**Partition:** show the actual game's dark field, luminous cyan boundaries,
geometric divisions, vulnerable trace, and yellow anomaly dots and trails. Favor
a composed gameplay frame that communicates spatial precision.
Example premise: “Draw boundaries, claim space, and dodge the anomalies.”

**Maltline:** show the soda-fountain setting: deep green room, cream machines,
wood counters, character and customers, with strawberry accents. Use a readable gameplay frame showing the service lanes and an active order. Example
premise: “Fill shakes, serve customers, and keep the counter moving.”

**Gameplay is a requirement, not just atmosphere.** The preview must show what
players do. Partition should show a trace cutting through a field, claimed
territory, and nearby hazards. Maltline should show the bartender, customer
orders, service lanes, and a shake or returning jar in motion. Prefer composed
real gameplay frames over title screens, logos, isolated product illustrations,
or splash artwork. Keep a short plain-language caption that completes the idea
without explaining every rule. A still image is enough; no autoplay is required.

Use assets derived from each game's current visual identity. Choose crops that
retain recognizable action at card size; do not place both games inside a
matching illustrated machine, recolor them to fit the catalog, or fabricate
gameplay that players will not find inside.

## Responsive behavior

Move to one column when two cards become cramped. Preserve image proportions,
readable descriptions, comfortable touch targets, and visible play links down
to 320px. Keep navigation compact and keyboard accessible. On desktop, both
games should be easy to compare without scrolling past a large introduction.

## Scope and acceptance

Implementation covers the catalog, per-game preview assets, and relevant tests.
Preserve today's local Maltline work, existing production backend and replay
routing. Game mechanics, leaderboard policy, and deployment infrastructure
remain separate work. Search and filters can wait
until the collection warrants them; do not invent ratings or popularity claims.

The overhaul succeeds when:

- The shell reads as an independent game catalog with neutral visual character.
- Partition and Maltline are recognizable from their images before reading titles.
- Each preview communicates a player action, not merely a title or mood.
- Neither game's palette or decorative language dominates the surrounding page.
- “Choose your game” and both named play actions are clear and functional.
- Keyboard navigation, contrast, image alternatives, and mobile layouts work.
- A third visually different game could join the same layout without redesigning it.
