# Maltline Technical-Debt Audit 11 — Launcher Visual Evidence

**Date:** 2026-09-11
**Scope:** Settled P4-01 launcher and 404 styling, responsive/focus goldens,
accessibility checks, CSP execution, and screenshot portability. This review was
read-only.

## Verdict

P4-01 should remain closed. The reviewed 1280×720, 700×600, 390×720, and
320×568 launcher frames are contained and coherent; the 700px frame keeps both
actions and the footer above the fold, the 390px frame shows both complete
cards, and the 320px frame exposes the start of the second cabinet without
horizontal overflow. Exact focus, reduced-motion, and forced-color checks pass.

## Findings

1. **Pin typography evidence.** The launcher selects host-installed Inter while
   the baseline manifest pins browser, Playwright, and platform but not font
   bytes or Linux image. Use a site-owned licensed font with a checked hash and
   `document.fonts.ready`, or pin the visual environment and verify its font
   file before screenshots. Do not mask text in comparisons.
2. **Commit cross-game CSP execution.** The server and `_headers` share one exact
   CSP and root screenshots execute under it. Add no-golden runtime loads of
   both games; manual Chromium probes currently pass without console, page, or
   request failures.
3. **Add bounded 404 evidence.** Capture exact 1280 and 390 recovery frames,
   plus parametric 320/700 containment, 44px targets, keyboard order, and focus.
4. **Cover the structural boundary.** Add a non-pixel 699px case beside the
   existing exact 700/390 branches. A 699px golden is unnecessary.
5. **Keep the stylesheet cohesive for now.** Its code-native glyphs and three
   responsive layers remain legible. Split only when another shared site surface
   creates a concrete ownership need; otherwise an extra stylesheet broadens
   resource and CSP contracts without reducing risk.

The host-font concern can cause a future CI false failure, but the current
reviewed images and product behavior are not defective.
