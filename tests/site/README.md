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
minimum targets, reduced motion, forced colors, the permanent game routes under
`/games/`, the About page's statement, credit, navigation, shipped faces, and
320px containment, and the custom 404 recovery surface. Its cache assertions follow authored `_headers`
pathname matching: a direct `/404.html` request is `no-store`, while an
arbitrary or hidden-control pathname served with that page uses the default
`public, max-age=0, must-revalidate` policy.

## Typography portability

The catalog now renders in `ArcadeBench Sans`, a self-hosted Noto Sans served
from `brand/fonts/` at weights 400, 600, and 800. That removes the previous
host-installed Inter dependency (P0-48): the raster no longer depends on which
faces happen to be installed on the machine running the suite, and the exact
suite would now fail on a host where the font requests 404 rather than quietly
substituting a different face.

The baselines are still not portable across arbitrary hosts, and the manifest's
browser, platform, and Playwright pins are still what make them exact. Font
rasterization varies with the operating system's font stack, the Chromium
build's hinting and subpixel behavior, and the renderer's anti-aliasing, none of
which the repository controls. `playwright.site.config.ts` pins
`--font-render-hinting=none`, `--force-color-profile=srgb`, and a device scale
factor of 1 to narrow that variance, but the remaining differences are real.
Regenerate the baselines on the recorded platform rather than expecting a
different one to match. Do not mask text to make a mismatch pass.
