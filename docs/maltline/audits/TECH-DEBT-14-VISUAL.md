# Maltline TD-14 visual, accessibility, and release audit

Date: 2026-09-11
Scope: settled P0-57/P0-58 tree
Mode: read-only source, evidence, task-ledger, and focused-test review

## Verdict

P0-57 and P0-58 should remain closed. The schema-2 visual manifest now makes
all 49 reviewed PNG identities machine-authoritative before Playwright launches,
the renderer and fixture metadata share the same frozen HUD rectangles, and
zero-life evidence no longer claims a cup color that is absent from the frame.
The exact pixels, semantic lives output, human-lab revision-11 boundary, and
production/lab isolation remain coherent. P0-58's exact Node declaration also
removes the prior floating-major CI runtime from the visual runner.

There is **no P0 or P1 visual, accessibility, evidence, or release blocker**.
P0-59 correctly captures the only already-known defensive contract gap. One
additional P2 metadata assertion should be folded into that same bounded task:
the manifest records Playwright's Chromium revision, but the browser test does
not currently bind that number to the installed Playwright browser registry.
The values match today, so this is drift prevention rather than invalidation of
the accepted images.

## Accepted current contracts

### Image identity and pixels

- `games/maltline/tests/visual/baseline-manifest.json:1-210` is schema 2 and
  contains a lexicographically sorted 49-entry `{name, sha256}` ledger plus the
  ordered-raw aggregate. The manifest is 7,107 bytes at SHA-256
  `dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`.
- `baseline-contract.ts:70-134` rejects wrong structure, schema, count, names,
  digest syntax, duplicates, and ordering. Lines 137-172 reconcile the actual
  PNG inventory, every individual file digest, and the aggregate raw bytes.
  `playwright.config.ts:1-9` invokes that check while loading the configuration,
  before test discovery can launch a browser.
- Independent recomputation found 49 PNGs totaling 14,096,256 bytes and the
  unchanged ordered-raw SHA-256
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
  This matches both the manifest and
  `games/maltline/tests/visual/README.md:191-193`.
- The current Stage 7 desktop/minimum-width, reduced-motion, ready, and jar-miss
  hashes in `docs/maltline/VISUAL-DIRECTION.md:263-273` independently match their
  schema-2 ledger entries. Older schema-1 manifest hashes in dated experiment
  and audit records are historical identities, not current documentation drift.
- The already-completed 146/146 exact Playwright run establishes that P0-57 did
  not change a reviewed PNG. This audit intentionally did not repeat that full
  gate.

### HUD geometry and metadata truth

- `renderer-layout.ts:27-44` owns deeply frozen `hudOrders` and `hudLives`
  rectangles. Their exact 8px intrinsic separation and 12px right edge are
  pinned in `renderer-layout.test.ts:17-35`.
- `renderer.ts:1498-1537` paints both HUD roles from those rectangles rather
  than local coordinates. `renderer-presentation.test.ts:362-407` checks the
  resulting Canvas transcript for lives 0/1/2/4 in normal and reduced motion,
  including the absent zero-life cup.
- `visual-fixtures.ts:1075-1091` reports the exact same two rectangles. Its
  strawberry token is conditional on positive lives. The browser matrix at
  `maltline.visual.spec.ts:1710-1751` checks the shared rectangles, positive and
  zero-life color truth, and CSS-scaled separation at 1280px and 700px.
- These are presentation/evidence changes only. Numeric lives semantics remain
  state-derived outside Canvas; focused `viewer-session` checks passed. No DOM,
  focus, live-region, copy, gameplay, proof, or ranked behavior changed.

### Human-lab and release boundaries

- `human-lab-session.ts:22-25,554-565` accepts only schema 3 / experiment
  revision 11. `human-lab-session.test.ts:450-482` explicitly rejects prior
  revisions through 10, and `docs/maltline/HUMAN-LAB.md:58-70` describes the
  same current contract. Pixel-neutral P0-57 is therefore correct not to advance
  participant provenance.
- `human-lab-boundary.test.ts:83-145` proves the production Vite graph excludes
  experiments, testing, lab, and fixture modules and separately constrains the
  dev-only lab graph. The focused boundary test passed on this tree.
- `.node-version` contains exact `22.19.0`; both CI setup steps use
  `node-version-file` (`.github/workflows/ci-cd.yml:26-30,108-113`). CI installs
  the locked Playwright browser and runs the full exact Maltline suite before
  upload (`ci-cd.yml:57-71`). P0-58 made this runtime selection stricter without
  changing viewer or lab behavior.

## Findings

### TDV14-01 — The screenshot collection/path API still has a defensive gap

**Priority:** P2 evidence hardening. **Runtime/release blocker:** no.
**Mapped task:** P0-59, already queued.

`baseline-contract.ts:94-109` establishes only `Array.isArray`, length bounds,
and mapped entry validation. It does not deliberately reject a sparse array,
extra array keys/symbols, or accessor-backed elements before iteration.
`baseline-contract.ts:142-168` rejects symlink PNG entries and the lowercase
filename grammar at lines 6-8 blocks ordinary traversal, but the focused tests
at `visual-baseline-contract.test.ts:53-107` do not exercise a symlinked
baseline directory or explicit traversal input. The production caller imports
a checked-in JSON file, so none of these exotic values can occur in the current
release path; the accepted manifest and images remain valid.

**Bounded repair and exit tests:** complete P0-59 without changing the manifest
or PNGs. Require `screenshots` to be a dense, plain data array with only `length`
and indexed enumerable data descriptors. Add sparse, extra-key, symbol,
accessor, traversal/absolute-name, PNG-symlink, and baseline-directory-symlink
adversaries. Resolve/realpath the directory once and prove every admitted file
stays below it. Preserve the current manifest SHA-256, all 49 per-file digests,
and the ordered-raw aggregate. Do not turn this trusted test-data parser into a
general archive or upload parser.

### TDV14-02 — `playwrightRevision` is recorded but not machine-bound

**Priority:** P2 evidence metadata. **Pixel/release blocker:** no.
**Recommended mapping:** add to P0-59's focused baseline-contract exit.

The manifest records Chrome for Testing `153.0.8010.12`, Chromium revision
`1243`, and Playwright `1.63.0` (`baseline-manifest.json:3-11`). The live browser
test verifies browser version, project, platform, and declared package versions
at `maltline.visual.spec.ts:150-155`, but never checks
`baselineManifest.browser.playwrightRevision`. Direct inspection of the
installed `playwright-core/browsers.json` shows that revision `1243`, browser
version `153.0.8010.12`, and title `Chrome for Testing` all match today. A future
manual edit could nevertheless leave the revision field false while every
current test passes.

**Bounded repair and exit test:** in a Node-side contract test, resolve the
executing/installed `playwright-core` browser registry and require its Chromium
revision, browser version, and title to equal the manifest tuple. Retain the
existing live `browser.version()` assertion. Add a forged-revision adversary.
This needs no screenshot, CSS, renderer, or human-lab change.

### TDV14-03 — The exact Linux baseline is fail-safe, not host-image portable

**Priority:** P2 CI maintainability. **Release blocker:** no.

The manifest records only `platform: "linux"`, while CI uses the moving
`ubuntu-latest` runner (`ci-cd.yml:18`) and installs the exact Playwright browser
at run time. Maltline controls the important raster inputs: browser version is
asserted, Noto Sans is bundled, DPR/locale/timezone/color profile/motion are
fixed, GPU use is disabled, and comparison allows zero differing pixels
(`playwright.config.ts:18-43`). A future host-image raster change will therefore
fail closed, but reproducing that failure may require discovering which GitHub
runner image produced it.

**Bounded recommendation:** do not reopen P0-57 or create parallel platform
goldens. If CI raster churn occurs, first pin an explicit Ubuntu runner release
and record that generation environment beside the existing browser/font
metadata; retain the exact Linux-only gate. A digest-pinned container is a later
option only if the explicit runner still proves unstable. No autonomous pixel
repin is justified by the present green evidence.

## Task mapping and recommended order

1. Keep P0-57 and P0-58 **done**. Their EXP-085 and EXP-084 identities and exit
   evidence agree with source and focused checks.
2. Complete queued P0-59 as one nonvisual contract tranche, including
   TDV14-01 and the small installed-browser-revision assertion from TDV14-02.
   The exit condition is unchanged manifest/PNG identity and focused unit/list
   checks; a 146-image rerun is appropriate only as the final integration gate.
3. Treat TDV14-03 as conditional CI maintenance, not a new release blocker.
   It becomes actionable upon an unexplained host-dependent exact failure.
4. Do not advance human-lab revision 11, add a Stage 8 pressure golden, or infer
   cabinet-distance comprehension from this evidence work. Those remain
   separate participant/gameplay decisions.

## Focused checks run

```sh
npm exec --workspace=@arcadebench/maltline -- vitest run \
  tests/visual-baseline-contract.test.ts \
  tests/renderer-layout.test.ts tests/renderer-presentation.test.ts \
  tests/human-lab-boundary.test.ts tests/human-lab-session.test.ts
# 5 files, 52 tests passed

npm exec --workspace=@arcadebench/maltline -- vitest run \
  tests/viewer-session.test.ts tests/viewer-boundary.test.ts
# 2 files, 12 tests passed

sha256sum games/maltline/tests/visual/baseline-manifest.json
find games/maltline/tests/visual/baselines/chromium-system -maxdepth 1 \
  -type f -name '*.png' -printf '%f\\n' | LC_ALL=C sort | \
  while IFS= read -r file; do
    cat "games/maltline/tests/visual/baselines/chromium-system/$file"
  done | sha256sum
```

All 64 focused tests passed. Hash and documentation comparisons matched. This
audit changed no product source, tests, task/experiment logs, manifest, or PNG.
