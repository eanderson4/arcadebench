# Shared platform release plan

Status: implementation and local review in progress, September 15, 2026.
This document is a release procedure, not a deployment record.

## Scope

The shared v2 service supplies authoritative leaderboards, Top 50 activity,
private qualifying replay retention, optional social-media permission, and
registered community feedback. Partition and Maltline's current two-button
`cabinet-2` game use it. Maltline's new left-side machines and title screen ship
with its new integration. Old Maltline generation-2 routes remain closed.
The browser-local player page is documented for a later step.

## Production baseline

Read-only inspection on September 15 found Worker version
`5e69035b-ca11-4512-91cf-9f0bb93580b8`, D1 `arcadebench-platform`
(`a1ae74c7-6583-4599-a626-4b6660199a65`), and migrations 0001 and 0002 applied.
**0003_maltline_generation_2.sql was not applied.** Recheck before release.

R2 `arcadebench-replays` expires `shares/` and `proofs/` after five days.
The global rule only aborts incomplete multipart uploads after seven days.
New-policy objects use `archives/`, outside expiring prefixes; scheduled
cleanup is therefore mandatory. Cron remains `17 * * * *`.

The old source-independent release is preserved at
`/tmp/arcadebench-homepage-preserve-backend-20260915/`. Its retained backend hash is
`a17f0caf8bb1e863b985f5d2e0119e79e82e321e17bb164dd5f9792422db9bf1`.
It is useful for baseline comparison, but cannot clean new archives or notes.

## Maintained production entry

Production must reject legacy Maltline v1 routes before sessions, reads, or
storage, while allowing the independently verified v2 cabinet adapter.
Scheduled dispatch calls `runScheduledMaintenance(env,
{legacyMaltlineEnabled:false})`. The ordinary worker remains available to tests
of the frozen generation-2 protocol; production must not query its absent tables.

Keep common replay cleanup, 90-day note cleanup, and legacy Partition/share
cleanup running even with `SHARED_PLATFORM_ENABLED=false`. Run independent
maintenance tasks despite another task's failure, then report failures.

Keep existing D1/R2 identities, signing secret, domains, compatibility date,
observability, cron, and API/expensive rate limiters. Maltline ranked writes use
the existing named admission limiter before session creation, keyed by a
one-way network-address digest so new cookies cannot bypass it. Never log raw
network addresses or proof/note bodies. Deploy with `--keep-vars`.

## Migration selection

Production migration discovery must contain byte-identical 0001, 0002, 0004,
0005, and 0006, excluding unreleased 0003. The dedicated production migration
directory uses verified byte-identical regular copies of the maintained SQL
files. Wrangler 4.124.0 skips symlinks during migration discovery; preparation
and CI must enforce the allowlist and equality before migration commands. CI and ordinary production
commands must use the same selection, so a later deploy cannot accidentally
apply 0003. Keep normal `d1_migrations` bookkeeping; never mark skipped SQL as
applied or rewrite an already-applied migration.

0004 installs common tables and compatibility projection triggers and backfills
Partition scores/votes atomically. It depends only on 0001/0002. Historical
scores keep their identity/order/retention and create no activity or consent.
New v1 inserts continue projecting; new v2 Partition inserts have one owner:
the legacy detail insert and its projection trigger.

0005 seeds the independent Maltline `cabinet-1` season, named First Shift. It
activates only when no active Maltline season exists; installations already
running generation 2 retain that authority until explicitly migrated. Production
has no generation-2 season. Migration 0006 then archives cabinet-1 and opens
`cabinet-2`, Second Shift, with the revised Stage 3 progression. Existing
generation-2 installations retain their active authority. Older cabinet proofs
remain verifiable against their immutable authority.
Rehearse both schema histories locally and validate their activation outcomes.

## Retention and transaction review

The common transaction consumes the immutable challenge, inserts an eligible
verified entry, calculates rank, snapshots permission/retention, emits an event
only for Top 50, and finalizes the replay. Season/version/context and object
state are rechecked inside SQL; a lost challenge or cleanup race cannot rank.

Pending registry rows precede R2 writes. Finalization requires a successful
upload; uncertain commits must not trigger speculative deletion. Cleanup claims
objects before deletion and retries failures. Review late upload/deletion races
explicitly. Qualified objects keep no deadline even after displacement; other
proofs retain five days. Compatibility score cleanup must never delete the
same qualified archive through a legacy expiry field.

Note expiry is 90 days after the last explicit note update. Vote-only writes
preserve notes and their deadline. Only the originating session may read its
note; responses are no-store. No note appears in public aggregates/activity,
logs, AI calls, or a public operator endpoint.

## Release checks and sequence

1. Review proofs, migration parity, rank 50/51 boundaries, stale-season and
   cleanup races, consent independence, note isolation/expiry, and two real
   adapters plus a synthetic game through the common query.
2. Run workspace builds/tests, assembled-site smoke, browser functional tests,
   and deliberately reviewed visual baselines. Inspect both score forms and
   default unchecked/reset behavior, unavailable states, mobile scrolling,
   keyboard controls, old redirects, replay links, and public legal pages.
3. Dry-run the maintained production entry. Rehearse its exact migrations on
   local D1 with only 0001/0002 initially installed. Verify closed legacy
   Maltline methods and scheduled maintenance without generation-2 tables.
4. Assemble a candidate static inventory and record source changes,
   migration/Worker/assets hashes, and baseline version. Confirm that a reload
   resolves the current content-hashed assets. Prepare the maintenance-preserving
   rollback described below.
5. Recheck live version, migration history, bindings, and R2 lifecycle. Record
   the D1 recovery point. List pending migrations with the production config;
   only 0004/0005/0006 should be pending.
6. Apply reviewed migrations through Wrangler's normal bookkeeping. Verify
   legacy/common row and ordering parity while old production still runs.
7. Deploy reviewed Worker/assets together with `--keep-vars`.
8. Read-only live checks: health, old/new boards, activity, canonical and legacy
   routes, static hashes, and unavailable legacy Maltline APIs. Do not seed
   fabricated public high scores to make the feed look busy.
9. Record actual version, migration history, test outcomes, and rollback identity.

## Rollback

Leave additive schema and projection triggers installed. Do not restore an old
DB snapshot after accepting scores; that would discard concurrent player data.
Disable v2 with `SHARED_PLATFORM_ENABLED=false` using the maintained production
entry, retaining correct privacy copy and new hashed assets. Legacy Partition
continues operating and projecting scores; common retention/note cleanup and
legacy Maltline gates remain active. Both new clients must show unavailable
service without silently changing the player's retention choice.

A plain rollback to the old Worker is insufficient after new archives or notes
exist, because it lacks their complete cleanup. If cleanup itself is faulty,
repair that job while retaining records; never blanket-delete archives or
remove lifecycle rules globally.
