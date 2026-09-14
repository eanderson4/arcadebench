# ArcadeBench site visual fixtures

This suite exercises the assembled, production-shaped `dist/site` artifact.
It is intentionally independent of either game's development fixture entry.

The seven exact images cover the launcher at 1280×720, 700×600, 390×720, and
320×568; its 700px keyboard-focus state; and the custom 404 at 1280×720 and
390×720. The manifest pins the browser, platform, Playwright version, complete
screenshot inventory, and each PNG's SHA-256 digest.

Run the exact suite with:

```sh
npm run test:visual:site
```

Update launcher images deliberately with:

```sh
npx playwright test --config=playwright.site.config.ts --update-snapshots
```

Review every changed PNG at its native resolution before accepting it. The
suite also checks semantic hierarchy, focus order, responsive containment,
minimum targets, reduced motion, forced colors, permanent game routes, and the
custom 404 recovery surface. Its cache assertions follow authored `_headers`
pathname matching: a direct `/404.html` request is `no-store`, while an
arbitrary or hidden-control pathname served with that page uses the default
`public, max-age=0, must-revalidate` policy.

P0-48 remains open: launcher typography currently resolves the host-installed
Inter face rather than a repository-owned font file. The exact suite detects a
different raster, but its baselines are not portable across hosts until the font
bytes or the complete visual runtime image are pinned. Do not mask text to make
that mismatch pass.
