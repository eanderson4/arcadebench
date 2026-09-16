# Leaderboard versioning and history

Status: adopted product policy. Scheduled rollover and archive browsing are
tracked in [issue #24](https://github.com/eanderson4/arcadebench/issues/24) and
must ship together before monthly seasons are enabled.

ArcadeBench preserves the meaning of a high score. Scores compete only with
runs produced under comparable game and scoring rules.

## Two kinds of rollover

ArcadeBench uses both rules versions and competition seasons:

- A **new rules version** is required when a release changes what scores mean.
- A **new season** can refresh a leaderboard while keeping the same rules
  version. The default cadence for a game's main arcade board is monthly once
  scheduled rollover is enabled. Weekly boards are reserved for featured
  events or games with enough activity to keep them useful.

The season label is visible on both current and historical boards. A rules
change can close a season early.

## Rules-version policy

A game opens a new leaderboard version when a release changes anything that
can materially affect rank, including:

- scoring or tie-break rules;
- stage content, timing, physics, difficulty, or progression;
- controls or fixes that make existing scores meaningfully easier or harder;
- replay verification or ranking rules that change which runs qualify.

Visual, accessibility, copy, and reliability changes may keep the current
leaderboard when they do not affect competitive results. The game maintainer
documents that decision in the release.

## What happens to the completed board

When a new version or season opens:

1. The previous board closes to new runs.
2. Its final standings become a permanent, read-only historical leaderboard.
3. The archive keeps its game title, version or season name, board and mode,
   final order, callsigns, score summaries, and submission dates.
4. The new board starts empty. Scores are never copied,
   rescaled, or merged across incompatible versions.
5. Current and historical boards remain clearly labeled and viewable from the
   game's leaderboard. Archive browsing is a release requirement for scheduled
   rollover.

Public score history and private replay retention are separate. Score summaries
remain in the historical leaderboard. Full replays follow the Privacy Promise:
qualifying Top 50 replays are saved privately, while ordinary proofs expire.

## Platform contract

The immutable board identity is:

`game + game version + authority + ranking-policy version + season + board + context`

Rollover archives the active season, preserves its board entries, opens the new
season, and verifies both the current board and historical view. A rules change
also registers the new authority or game version. An archived board never
accepts a new challenge or score. Scheduled monthly rollover should be an
idempotent platform operation rather than a game-specific database edit.
