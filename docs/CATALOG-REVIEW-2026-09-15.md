# Catalog review — 2026-09-15

The neutral catalog with gameplay previews is implemented and published at
https://arcadebench.org/. `claude-deepseek` implemented the catalog and review
fixes in an isolated checkout. The supervising agent and an independent review
agent assessed the diff and rendered pages before integration and deployment.

## Findings resolved

- Removed unsupported gamepad claims: Partition supports keyboard/touch;
  Maltline lists keyboard.
- Scoped the keyboard focus test to Primary navigation, avoiding the duplicate
  Source link in the footer.
- Changed the 404 page's missing-cabinet wording to missing-page wording.
- Removed a cover helper that relied on an undeclared transitive dependency.
  The committed images need no generation dependency during build.
- Corrected provenance: Partition is a gameplay capture; Maltline is an authored
  renderer fixture representing gameplay. See [cover provenance](CATALOG-COVER-PROVENANCE.md).

No unresolved blocking code findings remained in the catalog scope.

## Validation

- `npm run build:site` and `npm run test:site`: passed in the implementation
  checkout and again after integration (26 files, 630,312 bytes).
- `npx playwright test --config=playwright.site.config.ts`: 19 passed.
  Seven reviewed visual baselines and their manifest hashes were updated.
- `npm run test:site:wrangler-local`: passed, including both PNG assets.
- Independent browser checks at 320, 390, 700, and 1280px passed locally and
  publicly: both gameplay covers decoded, links were present, controls met
  minimum target sizes, and no horizontal overflow or first-party HTTP/page
  errors occurred. Keyboard order and forced-color behavior are covered by the
  site suite.
- Production wrapper smoke passed; all existing game/backend bytes were
  preserved for this catalog-only release. Both game routes and existing
  replay/canonical redirects were verified publicly.
- `git diff --check`: passed.

## Limits

The existing exact-pixel suite still depends on host-installed Inter fonts;
its documented P0-48 portability limitation remains. The Maltline preview uses
current local artwork, while production gameplay remains the prior verified
build. Source gameplay captures are temporary; the committed PNGs are the
maintained catalog assets. No new gameplay or backend changes were released.
