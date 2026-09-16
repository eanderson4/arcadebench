# ArcadeBench platform ecosystem — implementation architecture

Status: implementation plan, 2026-09-15. Supersedes the interrupted
Partition-specific activity prototype. Nothing from that prototype was deployed.

## Product decisions

- Games use one versioned ArcadeBench SDK/protocol. The homepage reads one
  global activity stream, never a browser merge of individual leaderboards.
- Game rules, verification, score meaning, and presentation remain game-owned.
- ArcadeBench owns leaderboard ordering infrastructure, publication,
  replay retention, permissions, community feedback, and activity events.
- New shared-protocol Top 50 submissions save the replay privately even after
  displacement. Other proofs, explicit replay shares, and compatibility-client
  submissions expire after five days.
- Optional social-media permission starts unchecked for each run and has no
  effect on rank, archival qualification, or on-site activity.
- No AI-training permission or use. No automatic social posting.
- Feedback means up/down voting and optional private notes, not public comments.
- A competitively meaningful rules or scoring change opens a clean leaderboard.
  The completed version becomes an immutable, viewable historical board; its
  standings are never merged into the replacement.
- Main arcade boards use labeled monthly seasons once scheduled rollover is
  enabled. Weekly seasons are for sufficiently active games or featured events;
  lower-volume and per-level boards may use longer seasons.
- Preserve Partition rankings while integrating it with the shared service.
  The user also requested Maltline integration in this build: its updated
  two-button cabinet gets a distinct authority/game version and adapter,
  independently reviewed before activation. Frozen generation 2 stays separate.

## Boundaries

Browser SDK -> common HTTP protocol -> platform services -> registered game adapter

The browser SDK never contains trusted verification or storage credentials.
The server adapter supplies:
1. Current game/version/authority and display metadata.
2. Valid board IDs and validated context (difficulty, level, mode, etc.).
3. Challenge loading/validation and replay verification.
4. A verifier-derived result and ascending numeric rank components.
5. A narrow compatibility hook for existing challenge/detail tables.
6. Valid feedback subject kinds/IDs and channels.
7. Game and board deep links.

Clients cannot supply authoritative rank components, activity events,
qualification, titles, or arbitrary public URLs. New games register an adapter;
they do not add branches to the homepage or common feed query.

## Shared leaderboard model

A board instance is identified by game, immutable authority/ranking-policy
version, season, board ID, and canonical flat context. Canonicalization sorts
keys and rejects unregistered filters. The initial v2 context values are strings;
adapters parse any game-specific numeric or boolean meaning. The stored key is canonical JSON of
[gameId, gameVersion, authorityId, rankingPolicyVersion, seasonId, boardId,
sortedFlatContext]; SQL backfill and TypeScript must produce identical bytes. One explicit board partition prevents
Easy scores from competing with Hard, or one field with another.

Use a bounded ascending numeric vector (up to eight finite components, padded
with zero), followed by created_at and entry ID. Store components as numeric
columns and index board + eligibility + components + stable ties. Do not
requantize verifier values.

Examples:
- Partition arcade: [-stageReached, -completed, elapsedMs, partitions].
- Partition field: [-won, won ? 0 : -capturedFraction, elapsedMs, partitions].
- Maltline cabinet: [-completed, -stageReached, -score, totalTicks, -fulfilled].

The shared query is authoritative for listing and Top 50 qualification.
Do not compare unrelated games' raw point values or invent a global score.

Entities:
- leaderboard_boards: canonical identity, immutable order version, metadata.
- leaderboard_entries: game-independent verified score envelope, game result
  JSON, numeric rank components, moderated name, timestamp, state.
- replay_objects: private key/hash, pending/ready state, expiry/deletion data.
- entry_publication: policy/version/time, social choice, immutable placement,
  qualification. Legacy entries have no new-policy publication.
- activity_events: versioned public achievement referencing the entry;
  unique (entry, event type), timestamp, rank snapshot. Removal/hiding of an
  entry excludes its activity too.
- feedback_notes: private text, separate from public aggregate votes.

Existing Partition tables become compatibility/detail storage. Backfill its
verified summaries with identical IDs/order; do not backfill consent, saved
replay eligibility, timestamps of achievements, or events. All new writes and
reads, including legacy-client compatibility routes, use the common service.
Do not maintain two independent ranking authorities.

## Protocol and SDK

Keep existing v1 calls compatible. Introduce an explicit v2 route/SDK surface
for new publication policy so old servers reject rather than ignore it.

New factory createArcadeBenchGameClient defaults to /api/v2 and uses the
normalized contract below. Existing createArcadeBenchClient remains v1-compatible.
New factory createArcadeBenchPlatformClient reads /api/v2/activity without a game.

Game client:
- runs.begin({boardId, context})
- leaderboards.list({boardId, filters, cursor, limit})
- leaderboards.submit({boardId, runId, playerName, score, proof, publication})
- feedback.get({subject, channel}) // same-session current vote/note, no-store
- feedback.set({subject, channel, vote, note?})

Platform client (no game required):
- activity.list({cursor?, limit?, gameId?})

Publication:
{policyVersion: "top50-social-v1", socialMedia: false}

Submitting through the score form enrolls that run in this published policy.
The checkbox controls only social-media use.
Unknown policy fields (including training), wrong versions, and non-boolean
consent are rejected. Absence on a legacy route preserves five-day retention.
The new route requires the supported publication object.

Normalized submission response:
{entry: {id, gameId, gameVersion, board, playerName, result, createdAt},
 publication: {rankAtSubmission, replaySaved, expiresAt}}

Normalized activity:
{protocolVersion: 1, entries: [{
 id, type: "leaderboard.qualified", entryId, gameId, gameTitle,
 board: {id, label, context}, playerName, rankAtSubmission, occurredAt,
 leaderboardPath
}], nextCursor?}

Titles/links come from validated server adapters. The renderer validates
same-origin /games/... links, uses textContent, and needs no per-game switch.
Activity is automatic for each new qualifying score regardless of social
permission. Show historical placement ("reached #8"), not a claim of current
rank. Bound pages, use timestamp/ID cursors, and index the global time ordering.
No public replay playback endpoint is included in this release.

## Submission transaction and storage

1. Bound/validate request, origin, session, admission and exact rate limits.
2. Resolve adapter/board/challenge; verify replay and moderate callsign.
3. Create a pending private replay record with a five-day cleanup deadline.
4. Upload verified proof successfully before making the entry eligible.
   New-policy objects use archives/, outside the live proofs/ and shares/
   five-day R2 lifecycle rules. Legacy objects retain their old prefix.
5. One D1 batch consumes the one-time challenge, inserts the eligible entry,
   compatibility detail, placement snapshot, retention decision, and one event.
   The same shared ordering calculates placement within this transaction.
6. Qualifying ready replay gets no scheduled expiry; nonqualifiers keep five
   days. Pending/failed uploads never rank or claim replaySaved.
7. Failed requests leave only pending objects/records eligible for cleanup;
   uncertain transaction outcomes must never trigger deletion of a committed
   archive. Retries cannot duplicate a score or event.

The scheduled job atomically claims expired/pending objects as deleting before
R2 deletion. Finalization must reject deleting/expired objects inside SQL so
the entire D1 batch rolls back, rather than checking changes after commit.
Deletion failures remain retryable. An orphan upload cannot silently become
an indefinite archive.
Historical rank is never recomputed on read. Test simultaneous boundary
submissions, duplicate challenges, upload/commit failures, and cleanup races.

## Flexible community feedback

Subject = {kind: string, id: string}; channel is a registered name, default
"overall". Games register supported kinds, channels and item validation.
Examples: Partition level/event-horizon/overall; another game's map/harbor/fun.
Initial scale is vote -1/0/+1. No arbitrary client schema or rating-language
framework. Additional scales can be versioned later.

One current vote/note per signed anonymous session + game + subject + channel.
This is accountless participation, not proof of one unique human.
- Public/shared response: up, down, score, viewerVote. No note text.
- Optional note: bounded to 1000 characters, explicit send/update, private to
  ArcadeBench operators. Omitted note preserves it; empty note clears it.
- Note-only feedback is allowed (vote 0); clearing a vote does not silently
  delete a note. The UI labels both actions clearly.
- No note is rendered in the activity feed, publicly listed, sent to an LLM,
  or automatically forwarded to email/Slack.
- Notes expire 90 days after the latest explicit note update. Vote-only changes
  do not extend note retention. Session-bound own-note reads are no-store; public
  aggregates never include note text. Operator retrieval uses authenticated
  database tooling, with no unprotected admin route. Cleanup deletes expired
  notes. Private feedback is not sent to AI moderation or training.

Partition uses this on its 20 levels with accessible thumbs up/down and an
optional "Leave a private note" form. Games decide layout and when to ask.
Shared service owns validation, limits, storage, isolation and privacy.
Legacy social.vote remains compatible with the default feedback channel.

## Homepage

Keep the two game cards visible. Add "Recent high scores" underneath, max eight
real achievements with board context, accurate time, and leaderboard link.
Provide distinct empty, loading, unavailable, and no-JavaScript states.
No fabricated activity, auto-rotating carousel, or required refresh loop.
A carousel can be introduced when the catalog needs it.

## Build sequence and acceptance

1. Review shared protocol/entities/adapter boundaries and freeze examples.
2. Subagent implements common SDK/backend/schema + Partition adapter and
   legacy bridge, with a synthetic second game proving generic contracts.
   Separate subagents implement the real Maltline cabinet adapter/proof and
   frontend against that same contract.
3. Separate subagent integrates catalog activity, Partition score consent and
   level feedback against that protocol.
4. Root/independent review checks transaction/rank/retention/privacy boundaries.
5. Migrate/deploy only after meaningful tests, browser checks and dry run.

Required tests: legacy ordering equivalence/backfill, boundaries 1/10/50/51,
context isolation, second-game generic registration, concurrent/duplicate
submissions, false/true social permission equivalence, malformed consent,
old-policy preservation, R2 failures, archive cleanup, private-note isolation,
feedback clear/update semantics, schema and SDK serialization, generic feed
rendering/XSS-safe names/links, mobile and keyboard forms.

## Release constraints

Use the maintained production entry and reviewed migration selection described
in [the release plan](PLATFORM-RELEASE-PLAN.md). Gate legacy Maltline v1 routes
and their maintenance independently of the new shared cabinet adapter. Exclude
unreleased migration 0003; apply reviewed 0004/0005/0006 with normal bookkeeping.
The updated Partition integration and Maltline two-button game ship together
with public policies. A reload must resolve the current content-hashed assets. Retention
and note cleanup must continue through a feature rollback. No old replay may
silently gain archival or social permission.

Deferred: accounts, public replay viewer, public comments,
social auto-posting, training, push infrastructure, general-purpose ratings.

### Migration bridge decision

The additive shared-platform migration installs a Partition AFTER INSERT
projection trigger and backfills verified scores in the same migration.
The trigger creates the board/shared entry with identical score ID, timestamp,
result and rank components; it creates no publication or event. This covers
legacy-client and rollback-era writes. For new Partition submissions, the
adapter inserts its legacy detail exactly once and lets the trigger own shared
entry insertion, then the common transaction publishes it. Other games insert
shared entries directly. Source score deletion must remove/hide the shared
entry and its event, and arrange cleanup of any retained private object.
Legacy votes project into the overall channel; old vote requests and new
feedback must have one authoritative value rather than diverging copies.

Schema migration tests must prove backfill/trigger vs TypeScript board keys,
rank vectors and all legacy board ordering. No game is allowed to write
activity directly from a browser or supply trusted placement.

## Browser-local player profile

Product direction accepted during architecture discussion; page-build timing
is being clarified separately from the shared leaderboard/feedback build.

A future /player/ page is "Your arcade", labeled "Saved in this browser · No
account". Local storage holds versioned, bounded game-play history and public
score entry references/snapshots. It does not establish a server identity.
The signed cookie continues to authorize its anonymous voting/feedback session;
a local profile ID or callsign cannot claim another score or private note.

The SDK should expose a shared local-player store with explicit recordGamePlayed
and recordSubmittedScore operations. Games record actual play starts, not page
views. Only successful server-verified submissions get verified-score records;
offline scores remain clearly labeled local/unverified. The public leaderboard
service is authoritative; local storage cannot create official scores.

- No background upload of browser play history, no cross-device synchronization.
- Clearing browser data removes the history; shared browsers share local data.
- Corrupt/old storage is validated and migrated or safely ignored; storage being
  blocked/full must never break gameplay or score submission.
- Keep a finite history; provide "Clear this browser's history" for only the
  ArcadeBench profile keys. Do not clear unrelated application data.
- Never store private replay object keys, session credentials, or feedback notes
  in the profile. Public entry IDs are references, not ownership credentials.
- Profile display is a consumer of normalized game metadata/entry contracts and
  needs no per-game score parser. Game adapters supply safe display metrics.

This supports the same ecosystem boundary without introducing account-backed
identity or an authentication redesign into the current release.
