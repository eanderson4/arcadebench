# Homepage rollout — 2026-09-15

The public root now serves the two-game launcher. Both `/partition/` and
`/maltline/` load. Today's two-button Maltline changes remain a local playtest;
the published game assets came from the previously verified main build.

## Deployment identity and scope

- Main source: `ee673f0022a41d84c9ddb3d69b3216548c00d715`.
- Static artifact: `arcadebench-site` from GitHub Actions run `34862407608`.
- Initial launcher Worker version: `1c152e8f-af32-459b-b0b1-7592b83aca38`.
- Previous version: `059375e7-4857-488b-bd7e-c618bf255638`.
- Existing deployed Partition module retained byte-for-byte, SHA-256
  `a17f0caf8bb1e863b985f5d2e0119e79e82e321e17bb164dd5f9792422db9bf1`.

The deployment uses a small routing wrapper around that existing module.
Legacy root Partition query URLs redirect to `/partition/`, preserving replay
share links. The existing canonical-host redirect, platform handlers, database
bindings, secrets, and scheduled maintenance remain in place. No database
migrations were applied. Maltline API routes return a no-store 503 before any
backend access; the catalog labels Maltline an unranked prototype.

The prepared source/config/assets and local smoke script are retained at
`/tmp/arcadebench-homepage-preserve-backend-20260915/`. This is a temporary
release directory, not the default repository deployment configuration.
Do not assume production is running the new Maltline backend from main.

GitHub verification passed, but its deployment job skipped because the
Cloudflare account/token secrets are absent. This release used the existing
local Wrangler authentication and `--keep-vars`. Automatic production rollout
still needs deliberate configuration and the documented ranked-launch gates.

## Verification

- Wrangler dry run and local workerd route/asset checks passed.
- Local browser: launcher → Maltline → instructions → stage → playing →
  completed shake, with rankings closed.
- Live root and both game pages returned 200; desktop and 390px launcher
  layouts had no horizontal overflow or missing first-party assets.
- Live `www` returned 308 to the apex; legacy replay query returned 302 to
  `/partition/` with its query intact; platform health returned 200.
- Live Maltline leaderboard returned the intentional 503.
- Cloudflare injected an optional analytics beacon into browser responses;
  the existing Content Security Policy blocked it. It did not prevent the
  launcher or games from loading; the policy was not loosened.

For the local gameplay revision, `npm run check` passed all workspace builds
and 874 tests. Six additional splash browser checks passed. Historical visual
goldens have not been regenerated for the new local design.

## Reviewed catalog update

Catalog revision version: `2a42e9b9-c938-4eef-b002-af9fc541827e`.
Rollback target for this update: `1c152e8f-af32-459b-b0b1-7592b83aca38`.

The catalog now uses a neutral library layout, “Choose your game.”, and two
960×540 gameplay previews. Implementation used `claude-deepseek`; an independent
review and browser verification followed. See [review evidence](CATALOG-REVIEW-2026-09-15.md).

This release replaces `index.html`, `arcade.css`, `404.html`, and `_headers`,
and adds `covers/partition.png` and `covers/maltline.png`. Every other previous
asset and backend module matched the pre-update SHA-256 inventory before deploy.
Today's local Maltline mechanics and splash remain local. No migrations ran.

Public verification passed at 320, 390, 700, and 1280px. Both game pages, privacy,
terms, and health return 200; both covers match the reviewed bytes and PNG/cache
headers. Legacy replay-query redirects and www canonicalization work; Maltline
rankings remain closed (503). Live screenshots are in
`/tmp/arcadebench-catalog-live-{320,390,700,1280}.png`.

## Brand, mission, About, and game route update

Current production version: `1b112359-fc13-4976-983b-d1ba28c4dc80`.
Rollback target: `2a42e9b9-c938-4eef-b002-af9fc541827e`.

The catalog now uses the Open Play brand system: bench-A mark, stacked wordmark,
self-hosted Noto Sans, warm paper surfaces, and blue actions. Public copy leads
with free early-arcade play and the no-ads/microtransactions/loot-boxes promise.
`/about/` explains the mission and closes with the Math vs Vibes credit.

Game entry pages now live at `/games/partition/` and `/games/maltline/`.
Exact old game-page and `/src/viewer` redirects preserve query strings; root
Partition query links and existing replay shares reach the new Partition route.
The original deployed game JavaScript, CSS, fonts, license URLs, and backend
module remain byte-identical. Only the two preserved game HTML files moved,
with their canonical and Open Graph URLs updated. The wrapper's root-forward
target changed; its existing backend/cron delegation and closed Maltline API
policy remain. No migrations ran. Local Maltline mechanics are still unshipped.

Build and routing validation passed, including a local Cloudflare candidate
with every legacy GET/HEAD redirect, query preservation, unchanged game-asset
hashes, four homepage/About viewport checks, and both game-entry clicks.
See [brand review evidence](BRAND-REVIEW-2026-09-15.md) for the complete result.

## Community and information page update

Production version: `f5714065-6db2-4016-84f6-b39e58df0fc9`.
Rollback target: `1b112359-fc13-4976-983b-d1ba28c4dc80`.

Privacy and Terms now use the ArcadeBench theme. About replaces its game list
with community support and a contributor section featuring Eric Anderson's
Math vs Vibes caricature. The closing Math vs Vibes attribution remains.

Seven static assets changed or were added; every other production asset and
backend module matched the preceding release inventory. No migrations ran.
See [review evidence](COMMUNITY-PAGES-REVIEW-2026-09-15.md).

## Policy copy cleanup

Production version: `5e69035b-ca11-4512-91cf-9f0bb93580b8`. Removed the operator SMS sections from Privacy and Terms, the “Short enough to read” tagline, and “The plain deal” prefix. Effective dates remain. Only the two policy pages and their stylesheet changed; site build/smoke and desktop/mobile browser checks passed.
