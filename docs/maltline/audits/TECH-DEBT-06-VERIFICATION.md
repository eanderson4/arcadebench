# TD-06: Browser competition verification re-audit

Date: 2026-09-10

Scope: the repaired browser competition integration after TD-05, specifically
`competition-controller.ts`, `competition-client.ts`, `ranked-proof-recorder.ts`,
the `main.ts` lifecycle wiring, and the focused Vitest/Playwright evidence. This
review rechecked the four previously reported browser findings. No product code
was changed.

## Verdict

The four prior findings are materially repaired. No browser-side score-integrity
or proof-authority blocker remains: the browser still submits only input proof,
the platform remains authoritative for acceptance and derived score, and stale
attempt completions are guarded before they can mutate a newer attempt.

One genuine contract defect remains: HTTP status alone cannot distinguish a
callsign-rejection `400` from an invalid-proof `400`, so the controller can tell
the player to edit a callsign when the proof itself is permanently invalid.
Two additional items are bounded assurance gaps rather than demonstrated code
failures: direct stale-completion barrier tests, and one composed browser-to-real-
Worker full-campaign submission test.

## Recheck of the prior findings

### Expired retry after `202` or an ambiguous failure — resolved

The controller now applies the local challenge-expiry gate only before the
first submission attempt. It marks `submissionAttempted` before awaiting the
client, preserving exact retries after a `202` or a response whose delivery was
ambiguous (`games/maltline/src/viewer/competition-controller.ts:308-337`). The
server remains authoritative if an unconsumed challenge actually expired.

The Playwright path submits once, receives `202 pending`, advances `Date.now`
past challenge expiry, retries the same proof, and receives the terminal ready
result (`games/maltline/tests/visual/maltline.visual.spec.ts:284-413`). This is
the important consumed-retry counterexample from the prior audit.

### Server-authoritative accepted/pending display — resolved

Pending and accepted presentation now copy score and callsign from
`result.entry`, not the local terminal state or submitted text
(`games/maltline/src/viewer/competition-controller.ts:330-351`). The browser
test deliberately returns a ready score/name different from the local score and
typed callsign, then asserts that the panel displays the server values
(`games/maltline/tests/visual/maltline.visual.spec.ts:299-319,347-397`). The
request assertion also confirms that browser score and summary never enter the
submission body (`games/maltline/tests/visual/maltline.visual.spec.ts:398-412`).

### Typed error policy — repaired, with one residual ambiguity

The controller now treats `400` as editable callsign feedback, terminal non-429
4xx responses as ineligible, and 429/5xx/network failures as retryable
(`games/maltline/src/viewer/competition-controller.ts:108-152`). The panel keeps
the entered callsign editable after moderation rejection and provides an
explicit discard path for eligible, pending, and transient-error states
(`games/maltline/src/viewer/competition-panel.ts:161-167,247-348`). Focused
tests pin those categories (`games/maltline/tests/competition-controller.test.ts:48-89`),
and Playwright covers edit-after-400, pending, expired retry, and acceptance.

The remaining error-taxonomy defect is detailed under TD6-V1 below.

### Stale guards and full-campaign evidence — code resolved

Starting a new attempt aborts challenge, board, and submit requests; increments
both attempt and board generations; and clears challenge, proof, score, and
submission state (`games/maltline/src/viewer/competition-controller.ts:369-415`).
Challenge and submit completions check their controller signal and captured
attempt generation before mutation (`games/maltline/src/viewer/competition-controller.ts:330-358,
395-415`). Board completions use their own generation and are invalidated by
both refresh and attempt reset (`games/maltline/src/viewer/competition-controller.ts:265-295,
370-383`). No stale-write path survived inspection.

Terminal Enter/R now protects an eligible, pending, or retryable result by
opening the panel instead of silently starting another attempt. The panel offers
an explicit discard action that calls `startFreshRun`
(`games/maltline/src/viewer/main.ts:45-51,338-393` and
`games/maltline/src/viewer/competition-controller.ts:451-455`).

The full eight-stage Playwright path drives every generation-2 stage through the
actual viewer input/engine/recorder wiring, captures the submitted proof, and
runs it through `verifyAndHashMaltlineProof`. It asserts the exact authoritative
winning summary of 36,255 points, four lives, eight cleared stages, and 21,662
ticks (`games/maltline/tests/visual/maltline.visual.spec.ts:496-596`). This closes
the prior single-stage-only proof evidence gap.

## Genuine residual debt

### TD6-V1 — `400` does not identify callsign rejection versus invalid proof

Severity: **medium; must fix before claiming actionable submission errors**

`classifyMaltlineSubmissionFailure` treats every typed HTTP `400` as a callsign
moderation failure (`games/maltline/src/viewer/competition-controller.ts:114-129`).
The Worker also uses `400` for verifier rejection and malformed proof input. A
client/engine drift that produces an invalid proof therefore displays “edit the
callsign and try again,” but every edited-name retry resubmits the same invalid
proof. This does not let an invalid score rank; the server continues to reject
it. It does create a false recovery loop and obscures a protocol regression.

Bounded fix and acceptance:

- Add a stable, machine-readable error code to the exact API error envelope,
  with distinct values for callsign rejection and proof/contract rejection.
- Update the strict client parser and typed error to retain that code.
- Return the editable form only for the callsign code. Treat invalid proof or
  protocol context as terminal for the current attempt; keep rate-limit and
  service failures retryable.
- Test identical HTTP `400` statuses carrying the two codes and prove they
  produce different UI states. Unknown codes must fail closed.

### TD6-T1 — stale-completion guards lack direct barrier tests

Severity: **low; assurance debt**

The generation and abort checks are sound by inspection, but current controller
unit tests exercise service admission and error classification rather than the
async controller itself (`games/maltline/tests/competition-controller.test.ts:10-89`).
The Playwright gates cover board-refresh input preservation and delayed
preflight failure, not an old successful challenge or submission resolving
after explicit discard/restart.

Add two deterministic barriers:

1. Hold attempt A's challenge success, start attempt B, release A, and prove A's
   authority/run ID cannot replace B's challenge or proof state.
2. Hold attempt A's ready submission, explicitly discard/start B, release A,
   and prove A cannot set `submitted`, open/alter B's panel, or trigger an
   A-specific standings highlight.

Repeat with a rejecting stale promise so neither success nor failure can mutate
the new attempt. These tests should assert state and outgoing run IDs, not only
the absence of an uncaught browser error.

### TD6-T2 — full-campaign browser proof is not submitted through the real Worker

Severity: **low; composed-integration debt**

The eight-stage browser test correctly proves viewer-to-recorder-to-public-
verifier compatibility, but its Playwright route handler invokes the verifier
directly and returns a hand-authored accepted entry
(`games/maltline/tests/visual/maltline.visual.spec.ts:525-548`). Separately, the
platform Workers-pool suite covers the real Maltline route and D1/R2 saga, and
the verifier-budget suite covers the static win proof. The pieces are strong,
but no single test composes the browser's captured full-campaign request with
the actual Worker/session/D1/R2 path.

Before public rollout, add one non-visual composed smoke test that submits the
captured/static-equivalent winning proof through the real Worker fetch boundary.
Acceptance: cookie-bound challenge, authoritative summary, exact canonical R2
bytes/hash, one ready D1 row, and leaderboard order all match. This need not
repeat the expensive eight-stage browser animation in every CI shard.

## Evidence

- Focused Vitest command covering client, controller policy, and recorder:
  **3 files, 64 tests passed**.
- The targeted Playwright rerun could not start because its fixed development
  URL was already occupied by another concurrent workspace process. The
  relevant current test source was inspected in full; this is an environment
  collision, not a test assertion failure.
