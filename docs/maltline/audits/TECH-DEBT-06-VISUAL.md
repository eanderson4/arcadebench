# Maltline visual/accessibility technical-debt review 06

**Date:** 2026-09-10
**Scope:** repaired live Shift Board integration in the shell, viewer entry,
competition controller/panel, shared CSS, and Playwright evidence. This was a
read-only product review; only this report was created.

## Verdict

The five issues from the prior integration review are repaired. The Shift Board
now behaves as a real modal sibling of the inert game shell, preserves and
restores focus, owns keyboard input, exposes an intelligible trigger, announces
async states outside their busy subregions, marks the player's row in text for
assistive technology, and has exact visual coverage for the live trigger plus
eligible, accepted, and browse-only panels. The delayed Practice Run disclosure
also preserves playfield geometry at the minimum supported width. No genuine
accessibility or visual debt remains in the reviewed path.

## Repaired findings

| Prior finding | Current evidence | Status |
| --- | --- | --- |
| Public trigger and panel had no pixel protection | The manifest now inventories `ranked-title-trigger.png`, `competition-eligible.png`, `competition-accepted-700.png`, and `competition-live-empty-390.png` (`tests/visual/baseline-manifest.json:14-27`). Exact assertions live at `maltline.visual.spec.ts:261-283` and `competition-panel.visual.spec.ts:127-133`. | **Repaired** |
| `aria-busy` could suppress the panel's live status | Busy state is scoped to the changing standings or submission section (`competition-panel.ts:169-184,317-326`), while the polite status remains outside those sections (`competition-panel.ts:134-140`). The browser test explicitly rejects busy state on the dialog (`competition-panel.visual.spec.ts:31-34`). | **Repaired** |
| Reopening announced retained content immediately before loading | Opening now assigns loading before its first render and tells the request path that loading was already rendered (`competition-controller.ts:265-305`). | **Repaired** |
| Trigger purpose/dialog behavior was opaque | The controller supplies `aria-haspopup="dialog"`, `aria-controls`, `aria-expanded`, and the accessible name “Open Shift Board leaderboard” (`competition-controller.ts:207-220,362-365`). The live-shell test exercises those semantics (`maltline.visual.spec.ts:260-267`). | **Repaired** |
| Current-player highlighting was color-only | The callsign cell now appends the hidden text “(your run)” when selected (`competition-panel.ts:222-232`), with browser coverage at `competition-panel.visual.spec.ts:76-84`. | **Repaired** |
| Below-700 behavior was accidental/undefined | Browse-only access is now deliberate and tested in both the live viewer and component fixture (`maltline.visual.spec.ts:271-283`; `competition-panel.visual.spec.ts:136-144`). Gameplay remains unavailable while the board remains readable, and the live 390px composition now has an exact baseline. | **Repaired** |
| Delayed Practice Run disclosure shifted the 700px playfield | The preflight-failure browser test records `.stage-wrap` before releasing the delayed response and requires the same top coordinate after the disabled Practice Run control appears (`maltline.visual.spec.ts:466-500`). | **Repaired** |

The modal boundary itself remains sound: the controller makes the shell inert
and hidden from the accessibility tree only while the separately mounted panel
is open, then reverses those attributes before panel focus restoration
(`competition-controller.ts:256-262,297-305`; `competition-panel.ts:405-438`).
The live terminal test verifies inert entry, canonical server-returned copy,
submission retry, and overlay focus restoration (`maltline.visual.spec.ts:361-416`).


## Visual inspection

All four competition baselines were inspected at full source resolution:

- `ranked-title-trigger.png` (1280×720, SHA-256
  `db4d8c8f3ce83495cccc9418f5f9410d64bd80b92e09fe1f0a7e121fd5a2e5bf`):
  the trigger is discoverable and no longer overlaps or crowds the tagline,
  title card, or footer.
- `competition-eligible.png` (1280×720, SHA-256
  `c2507f19692b559223a6863d4d48b71223c803f96675c7f72a26df2f8ff532ef`):
  board hierarchy, safe callsign truncation, eligible status, input, primary
  submit action, and explicit discard action fit without clipping.
- `competition-accepted-700.png` (700×600, SHA-256
  `76c294d4bebfdc18ce44399c6e233bf4b0335adc89670a98693a7043f82b2edb`):
  the 420px sheet fits the minimum supported viewport; the highlighted row and
  accepted result remain legible and the full content fits vertically.
- `competition-live-empty-390.png` (390×720, SHA-256
  `12243ceb4521a24f12219b01b5584fb154022b7cd69bf6c732a1d882135fe7bb`):
  the browse-only sheet, wrapped heading, refresh action, and empty-board card
  remain readable without clipping or horizontal overflow over the dimmed
  unsupported-game surface.

The frames retain Maltline's dark-green shop identity, strawberry focus/accent
language, tabular score hierarchy, and subdued secondary actions. No overlap,
unreadable scaling, or accidental gameplay exposure was found.

## Residual debt

No genuine residual visual or accessibility debt was reproduced in the live
Shift Board integration reviewed here. Broader renderer, flow-controller, font,
and site-assembly concerns outside this panel recheck are intentionally not
relisted as Shift Board findings.

## Evidence rerun

- Focused Playwright recheck: **10/10 passed**, covering every panel render state,
  busy/status semantics, hostile callsign text handling, current-player text,
  focus trap and restoration, retry/discard callbacks, reduced motion, 700px
  geometry stability through delayed preflight failure, browse-only 390px
  geometry, live trigger, exact PNGs, and the full terminal submission
  integration.
- The four checked-in PNGs are distinct, have the expected dimensions, and
  are present in the pinned baseline inventory.
- Live modal inspection confirmed two body siblings: the game shell was
  `inert` and `aria-hidden="true"`; the panel was non-inert and
  `aria-hidden="false"`; focus was on the dialog; the 700px sheet bounds were
  x=280..700 with no document overflow.
