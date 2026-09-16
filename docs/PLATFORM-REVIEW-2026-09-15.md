# Shared platform implementation review — September 15, 2026

Status: implemented locally; production deployment has not changed. The live
homepage, both game pages, and health endpoint returned HTTP 200 during review.
Production remains version `5e69035b-ca11-4512-91cf-9f0bb93580b8`.

## Result

- One versioned SDK and authoritative ranking service serve Partition and
  Maltline's independent two-button `cabinet-1` authority.
- The homepage reads one generic Top 50 activity endpoint. No per-game feed
  merging, fabricated activity, or public replay file endpoint.
- New qualifying replays remain private indefinitely after displacement.
  Other proofs expire after five days. Social-media permission is explicit,
  optional, unchecked per run, and independent of rank/archive/activity.
- Registered subject/channel feedback supports votes and optional private
  notes. Partition uses it for its 20 fields. Notes expire after 90 days;
  vote-only changes preserve the deadline. No public comments or training.
- Maltline's active-row flavor machines/fill cup sit to the player's left;
  its Shift Board submits verified challenges through the shared service.
- Both games expose an ArcadeBench home link. Leaving an unfinished run
  requires confirmation; Cancel preserves play, and accepting does not trigger
  a second warning. Unstarted menus and submitted scores leave directly.
- A browser-local player page remains a documented next step, not an account
  or identity system implemented in this release.

## Review corrections

Independent implementation and review covered transaction guards, migration
compatibility, private data boundaries, game proof verification, and UI races.
The review corrected:

1. Activity and archive flags incorrectly extending beyond rank 50.
2. Challenge/season rollover changing which board qualified a score.
3. Hidden/stale boards appearing in activity.
4. Cleanup stopping when v2 HTTP was disabled.
5. Late/ambiguous uploads recreating objects after deletion; cleanup now retains
   ownership and periodically rechecks deletion tombstones.
6. Cleanup exceeding D1's 100 bind-parameter limit with 200-object batches.
7. Inherited object properties accepted as feedback subject kinds.
8. A delayed private-note save closing another field's dialog and overlapping
   vote/note writes on one field.
9. Partition re-sorting authoritative server results with different string tie
   ordering. Public results now preserve server order.
10. A concurrency test assuming historical rank snapshots must be unique.
    Later equal scores may sort ahead of earlier accepted scores; final order
    is unique, but both can correctly have qualified at rank 51 when submitted.
11. Empty activity copy claiming a first score despite preserved historical
    leaderboard entries. The empty state now describes new activity only.
12. Wrangler skipping symlink migrations. Production uses an explicit allowlist
    of byte-identical regular copies, checked/prepared by script and CI.

## Validation

- All workspace builds passed.
- Workspace unit/integration checks: SDK 14, bench-core 7, harness 2,
  Maltline 765, Partition 70, platform 144 passed (1,002 total).
- Catalog/Partition browser suite: 46 passed, including generic feed abuse/error
  states, responsive containment, keyboard entry, and private-note save races.
- Reviewed Maltline screenshot subset: 48 passed; 46 changed images were
  deliberately reviewed and the 49-image manifest remains enforced. The current
  lab matrix passed all four assignment-order/viewport cases, exercising 11
  real stages and 31,026 input ticks per case. The final full Maltline visual
  and browser suite passed all 160 tests with source files frozen.
- Worker bundle audit, local Wrangler routing/assets smoke, built-site inventory,
  and built Maltline browser/font/license/privacy smoke passed.
- Production-only Worker/schema tests passed. Fresh local Wrangler migration
  rehearsal applied 0001/0002/0004/0005 with no generation-2 schema.
- Read-only remote migration listing contains exactly pending 0004 and 0005.

## Return-to-arcade navigation review

Both games now link to `/` from their game surfaces and warn before abandoning
an unfinished run. Cancel keeps the run; accepting the explicit confirmation
does not produce a second browser warning. Unstarted menus and submitted scores
leave directly. Native reload/leave protection is also installed, and restored
pages clear any previous navigation approval.

Review corrected Maltline's clock/input handling after a canceled native dialog
so elapsed dialog time does not invalidate ranking or throw a held shake. It also
corrected a stale Partition submission response that could otherwise mark a new
run saved. Maltline's 43 changed screenshot baselines were reviewed: differences
are confined to the header link.

Final navigation validation: all 51 catalog/Partition browser tests and all 170
Maltline browser/visual tests passed, including 15 navigation cases. Both game
builds and built-site smoke passed. The refreshed local Worker returns HTTP 200
for the homepage and both games at port 8791.

## Release boundary

No remote migration or deployment was performed. Production uses the old
release until the new candidate is explicitly released. The maintained source
entry and migration allowlist are ready; Maltline's production WAF/capacity
checks in [edge admission](maltline/EDGE-ADMISSION.md) remain release work.

Use [the release plan](PLATFORM-RELEASE-PLAN.md). A maintained-source rollback
with v2 disabled must keep replay/note cleanup, privacy disclosures, and legacy
Maltline route/maintenance gates. A pre-shared-platform Worker also reads legacy
scores directly and does not honor generic-only hidden state, another reason
not to roll back to that old binary after accepting/moderating shared entries.

## Local preview

The current local Worker serves the catalog and game pages at
<http://localhost:8791/> with isolated D1/R2 state under
`/tmp/arcadebench-shared-preview-state`. Its activity and Maltline board endpoints
return real empty local lists. Gameplay is unranked on the local hostname; the
preview configuration omits remote AI moderation. No local test scores were
inserted into production. The ordinary Maltline Vite server on port 5184 was
preserved.
