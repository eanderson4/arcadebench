# Brand, About, and routes — review evidence

Implemented with `claude-deepseek`, with separate brand, mission-copy, and route
integration passes. Independent agents reviewed brand/accessibility and route
correctness; the supervising agent reviewed the source and rendered pages.

## Result

- An original bench-A symbol, stacked ArcadeBench wordmark, blue/paper palette,
  bundled licensed fonts, reusable CSS tokens, and a [visual brand guide](brand/index.html).
- Homepage copy presents a free public arcade inspired by early arcade games.
- About explains the mission and credits Math vs Vibes.
- Canonical entries: `/games/partition/` and `/games/maltline/`.
  Old page URLs redirect with query strings preserved.
- README headings now say Partition and Maltline; public repository description
  and homepage metadata were updated on GitHub. The README update was published
  separately as `154029f1208d566354af83f66dbe570e487acb08`, preserving the newer remote Hardware
  section. The remaining implementation changes are in the working tree.

## Review corrections

- Fixed About paragraph-selector specificity so its summary and utility label
  use their intended type styles.
- Replaced an inaccurate claim that games open directly into play with a
  statement of the simple-controls goal. Games still have their start screens.
- Removed a smoke assertion expecting static-asset security headers on a
  Worker-generated redirect; the check now pins the redirect's actual contract.
- Scoped homepage navigation to Games/About and retained Source in the footer.
- Bundled three explicit font weights, replacing the catalog's host-installed
  Inter dependency. Exact raster comparisons still depend on the pinned browser
  and OS environment.

No unresolved blocking findings remained in this scope. Measured text contrast
against paper: blue 7.20:1, muted 5.49:1, optional red 4.58:1.

## Validation

- Site build and exact inventory/security/routing smoke: passed, 34 files,
  691,381 bytes.
- Site Playwright suite: 25 passed, including About at four widths and bundled
  font checks. Seven reviewed snapshots and manifest hashes refreshed.
- Platform tests: 69 passed; Maltline release-disclosure tests: 4 passed.
- Maltline built-site browser/font/license/privacy smoke: passed.
- Wrangler-local smoke: passed.
- Production-preserving candidate: all legacy GET/HEAD redirects with queries,
  new pages and slash handling, existing game asset byte hashes, health,
  intentional Maltline ranking closure, homepage/About at 320/390/700/1280px,
  and both game entry clicks passed.
- Wrapper smoke: existing replay sharing reaches the new path, cron function
  remains identical, and the old deployed backend module SHA-256 matches.
- Wrangler dry-run and deployment passed. Version:
  `1b112359-fc13-4976-983b-d1ba28c4dc80`.
- `git diff --check`: passed.

Full monorepo tests and game visual baselines were not rerun for these
catalog/route changes. Gameplay code, Vite bases, and database schemas were
outside this update; the earlier local Maltline playtest remains separate.

## Public verification

The deployed edge passed the same redirect, page, asset-hash, and browser
checks as the candidate. The www-to-apex-to-new-game-route chain preserved
its query string. Homepage and About screenshots are retained as
`/tmp/arcadebench-final-live-{home,about}-{320,390,700,1280}.png`.
