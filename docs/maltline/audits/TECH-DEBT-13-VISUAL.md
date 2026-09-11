# Maltline TD-13 visual, accessibility, and release audit

Date: 2026-09-11
Scope: settled tree after P0-53 and P0-52 provenance work
Mode: read-only product/baseline inspection plus focused automated checks

## Verdict

P0-53 is runtime-complete. `LIVES N` is now the primary visible life role,
`CHAIN N` truthfully names the aggregate first-fulfillment chain, authoritative
event point popups remain separate, and the non-Canvas status exposes equivalent
numeric lives and chain information without making the continuously changing
status a live region. Human-lab schema 3 accepts only experiment revision 11,
the lab and fixture graphs remain absent from production, and the release font,
license, privacy, route, and exact-browser gates remain present.

There is **no P0 visual, accessibility, isolation, or release blocker** and no
reason to reopen P0-53. One P1 documentation-evidence defect should be repaired
before the visual-direction recipe is cited again. Two P2 evidence/layout
cleanups are bounded and pixel-neutral. Cabinet-distance comprehension remains
a human/device validation question; the current pixels prove deterministic
output and containment, not comprehension.

## Current evidence and closed contracts

- `games/maltline/src/viewer/renderer.ts:1467-1523` renders score, optional
  `CHAIN N`, stage, `ORDERS LEFT`, and `LIVES N` as distinct HUD roles. The
  lives chip is 120×24 internal pixels at x=828 and retains only one subdued
  cup when lives are nonzero.
- `games/maltline/src/viewer/semantic-status.ts:12-27` uses the shared
  `activeChainText` policy and state-derived singular/plural life count.
  `#game-status` is `aria-live="off"`; discrete engine outcomes use the
  deduplicated polite event node instead (`shell.ts:80-82` and
  `semantic-status.ts:30-98`). This gives parity without per-tick announcement
  spam.
- `games/maltline/tests/renderer-presentation.test.ts:260-353` proves point
  popups use `event.points`, zero-point rescues stay honest, CHAIN is not
  reconstructed per event, and `STREAK`/`×` do not return. Lines 361-397 pin
  `LIVES 0/1/2/4`, secondary-cup count, HUD coordinates, and normal/reduced
  intrinsic identity.
- `games/maltline/tests/viewer-session.test.ts:72-128` pins semantic CHAIN,
  lives, orders, actions, and jar economy, including 0/1/2/4 life grammar.
- `games/maltline/tests/visual/maltline.visual.spec.ts:1684-1740` checks CHAIN
  width at 1280/700 and the lives region at game-over zero, Stage 7 one,
  reduced-motion two, Stage 4 normal/reduced three, and early-run four. Exact
  images cover the same production Canvas behind overlays, replay, and the
  dev-only lab.
- Native inspection of `stage-7-happy-hour-pressure-700.png` found the CHAIN,
  stage, orders, and lives roles separated in the top rail. In `game-over.png`,
  the Canvas is correctly blurred and accessibility-hidden while the foreground
  dialog states `OUT OF LIVES`, names the terminal cause, and owns focus; the
  obscured HUD is not relied on as terminal semantics.
- The exact inventory is 49 PNGs. The current manifest SHA-256 is
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`;
  concatenating lexicographically ordered raw PNG bytes yields
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`,
  matching `games/maltline/tests/visual/README.md:191-193`.
- `games/maltline/src/experiments/human-lab-session.ts:22-25,557-565` emits and
  accepts only schema 3 / revision 11. The explicit revision-10 rejection is at
  `games/maltline/tests/human-lab-session.test.ts:478-482`; both browser artifact
  expectations also pin 11. Historical revision-10 statements in older audit
  and experiment records are historical evidence, not active-contract drift.
- `games/maltline/tests/human-lab-boundary.test.ts:71-145` builds and inspects
  both Vite graphs: production rejects experiments, testing, lab, and fixture
  modules; the lab rejects proof, competition, public barrels, dynamic loading,
  network, APIs, and persistent storage. The assembled-site smoke separately
  returns 404 for both known human-lab paths.
- `games/maltline/tests/release-disclosures.test.ts:56-260` pins the four bundled
  Noto Sans files, exact OFL notice, only reviewed inline favicon, production
  module graph privacy claims, and non-inlined media policy. CI runs unit/build,
  assembled-site/Worker checks, the pinned browser, all exact Maltline pixels,
  and the Maltline route smoke (`.github/workflows/ci-cd.yml:46-65`).

## Findings

### TDV13-01 — Three visual-direction control hashes are stale

**Priority:** P1 evidence integrity. **Runtime/release blocker:** no.
**Documentation claim blocker:** yes.

The Stage 7 hashes updated by P0-53 are correct, but the same acceptance recipe
still calls three older digests current at
`docs/maltline/VISUAL-DIRECTION.md:268-273`. All three images intentionally
changed when `LIVES N` was added:

| Control | Documented SHA-256 | Current SHA-256 |
| --- | --- | --- |
| `reduced-motion.png` | `775424947ff31f734850e8d50403f76e5b98db40cd8398885d170a41d2bd17eb` | `6bfd44f62f2ab5ab0fb7b6e30977aa24c3b6771c4ef751d434910a2e8d8ec594` |
| `ready.png` | `38cde586dfde23d34c773076be1d2bc648cacbe9782d0b491b7135a9696cbdaa` | `56caf63ebe1309a9ac53520f6633d3d680ad6d811f51711d2cdacc9cce35f5ae` |
| `jar-miss.png` | `c2a3d7530de0003c43cda2a984cf77acab2b90876914802cce5ac2401c74eecc` | `ee17903de9fab23eb25a0b24c96d83ccc5f458362381d9953030929fae18c75e` |

The two representative Stage 7 rows are current:
`ca2e3213bd418bfccad358531ea3b50f94e4b53c974d3e776d405afb6faa6dd9`
at 1280 and
`e1cd2b6f098ced3561464da5eb8deb618ceb32efe13ef3bed7b45673d258d6c7`
at 700.

**Bounded repair:** update only the three stale documentation values after an
exact focused run for those controls. Do not regenerate any PNG. Acceptance is
the three filesystem SHA-256 values above, unchanged 49-image raw digest, exact
focused Playwright pass, and `git diff --check`.

### TDV13-02 — The baseline manifest pins inventory and toolchain, not image identity

**Priority:** P2 evidence maintainability. **Release blocker:** no.

`games/maltline/tests/visual/baseline-manifest.json:1-62` records browser,
Playwright, font package, and filenames. The inventory test at
`maltline.visual.spec.ts:142-170` confirms those fields and the directory list,
but neither the individual PNG digests nor the ordered raw digest are part of
that machine-checked contract. The only current aggregate image digest lives in
prose in the visual README. Playwright exact comparison protects product pixels
against the checked-in files, but cannot prove that a deliberate baseline update
also refreshed every external hash claim. TDV13-01 is direct evidence of this
maintenance gap.

**Bounded repair:** evolve the manifest to a schema that stores a sorted
`{name, sha256}` ledger and one ordered-raw aggregate, then recompute both in the
inventory test. Keep browser/font metadata and exact screenshots unchanged.
Avoid placing the manifest's own hash inside itself. A malformed digest, changed
PNG byte, missing/extra filename, and unsorted ledger should each fail a focused
Node/unit check before Playwright starts. Documentation may cite the manifest
field instead of maintaining an unverified second value.

### TDV13-03 — The new lives geometry duplicates renderer coordinates outside layout authority

**Priority:** P2 pixel-neutral cleanup. **Runtime blocker:** no.

The prior layout extraction centralized scenario-sensitive and shared fixed
geometry in `renderer-layout.ts`, but the new lives rectangle is independently
specified in the painter (`renderer.ts:1508-1520`) and fixture metadata
(`visual-fixtures.ts:1075-1085`). The browser check then asserts the duplicated
literal `{x:828,y:11,width:120,height:24}` and raw orders endpoint
(`maltline.visual.spec.ts:1721-1734`). Canvas transcripts and exact PNGs make the
current pixels safe, but future HUD adjustments require three coordinated
edits and can make fixture-reported geometry disagree with the painter.

**Bounded repair:** add frozen `hudOrders` and `hudLives` rectangles to
`MALTLINE_RENDERER_FRAME`; have the renderer, fixture metadata, transcript test,
and browser separation calculation consume those exact objects. Keep score and
CHAIN painting in place and do not extract a HUD painter in the same tranche.
Acceptance is deep-frozen endpoint/spacing tests, renderer transcript identity,
fixture equality to the exported rectangles, the full 49-image exact pass, and
an unchanged ordered-raw digest.

## Deferred validation, not implementation debt

- The 700px image and geometry evidence shows deterministic containment and
  redundant labels. It does not establish glance speed, cabinet-distance
  comprehension, or whether one subdued cup is the best secondary motif. Those
  questions belong in the revision-11 human lab or a reference-device session,
  not another speculative pixel pass.
- Stage 8 pressure/tuning evidence remains separate from this visual truth
  repair. A Stage 8 exact pressure golden is warranted only when a specific
  authored candidate changes visible density or presentation; no current LIVES
  or CHAIN defect requires one.
- Exact Linux/Chrome/font baselines are intentionally platform-specific. Current
  CI installs that pinned browser and bundled font. Cross-platform goldens would
  add churn without strengthening the shipped Linux release gate.

## Checks run

```sh
npm exec --workspace=@arcadebench/maltline -- vitest run \
  tests/renderer-presentation.test.ts tests/viewer-session.test.ts \
  tests/human-lab-session.test.ts tests/human-lab-boundary.test.ts \
  tests/viewer-boundary.test.ts tests/release-disclosures.test.ts
# 6 files, 59 tests passed

npx playwright test --config=playwright.config.ts \
  tests/visual/maltline.visual.spec.ts \
  --grep "truthful chain|numeric lives|production entry loads"
# 3 tests passed

sha256sum games/maltline/tests/visual/baselines/chromium-system/{reduced-motion,ready,jar-miss,stage-7-happy-hour-pressure,stage-7-happy-hour-pressure-700}.png
find games/maltline/tests/visual/baselines/chromium-system -maxdepth 1 \
  -type f -name '*.png' -printf '%f\\n' | LC_ALL=C sort | \
  while IFS= read -r file; do cat "games/maltline/tests/visual/baselines/chromium-system/$file"; done | sha256sum
git diff --check
```

Focused unit, browser, and diff checks passed. No product source, test, manifest,
or baseline was modified by this audit.
