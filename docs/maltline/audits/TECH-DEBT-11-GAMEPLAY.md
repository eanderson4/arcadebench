# Maltline Technical-Debt Audit 11 — Launcher Entry and Product Seams

**Date:** 2026-09-11
**Scope:** Settled P4-01 launcher, permanent game routes, fresh-entry behavior,
player-facing launcher copy, and retained Partition replay routing. This review
was read-only.

## Verdict

P4-01 should remain closed. The launcher gives both cabinets equal native-link
treatment, starts neither game, and creates a fresh game document on navigation.
An assembled-browser probe held Partition at its home screen and tick `0000`,
and Maltline at its title screen, tick 0, and zero recorded inputs. The Worker
still validates `/r/:id` and redirects directly to Partition Replay Lab under
`/partition/`.

## Findings

1. **Fresh entry needs one permanent cross-game assertion.** The root browser
   suite checks both game documents and their canonical identities, while the
   Maltline built-site smoke separately pins its title state. Add one non-pixel
   launcher-click test that holds Partition at home/tick `0000` and Maltline at
   title/tick 0/zero inputs. Do not make rank eligibility or API availability
   part of this static-site assertion.
2. **Launcher-wide controller copy is broader than Maltline's public support.**
   `Build a controller against the same deterministic rules` is accurate for
   the project direction but can read as a public SDK promise for both cards.
   When launcher copy next changes, prefer a claim about humans and machines
   sharing deterministic rules.
3. **Focused card descriptions can carry more of the visible constraints.** The
   link names identify game and input family, but Maltline's visible 700px
   requirement is not in the focused link description. Use title/description
   relationships rather than making the accessible name excessively long.
4. **Static facts are deliberately duplicated.** `20 authored fields` and
   `700px+` must remain static to preserve the no-JavaScript launcher. If either
   source value changes, update a test-only consistency contract rather than
   importing game runtime code.

These are bounded coverage and copy-maintenance tasks, not current product or
gameplay defects.
