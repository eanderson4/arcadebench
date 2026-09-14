# TD-07 — Retained-proof inspection gameplay/product audit

**Review date:** 2026-09-10
**Scope:** Shift Board retained-proof inspection, its trust and player-facing
language, interaction with terminal submission, and arcade pacing. Product code
was reviewed read-only; this report is the only file added.

## Verdict

Retained-proof inspection is technically meaningful: the browser downloads the
input-only retained envelope, resolves the registered authority, replays every
tick, re-derives the outcome, requires the retained summary to match, and hashes
the canonical envelope. It does not trust a browser-authored score and does not
advance or alter the active game.

The current inspection surface is not yet clear enough for a public trust
feature. The main blocker is retention mismatch: proof bytes expire after five
days, but every permanent leaderboard entry always advertises an active Inspect
action, after which an expired proof produces a generic retry loop. A second
high-priority interaction issue places the loading/result card after the full
leaderboard while returning focus to the row button; on a ten-entry board the
feedback can be outside the viewport.

No defect found here changes score, lives, recorded inputs, proof eligibility,
or terminal submission state. Inspection is restricted to already paused/safe
screens, so it does not lengthen verified tick time. Its product debt concerns
availability honesty, the scope of trust claims, responsiveness, and the extra
friction around an otherwise quick arcade loop.

## What is sound

- The public client calls `verifyAndHashMaltlineProofEnvelope`, not a display-
  only JSON parser (`games/maltline/src/viewer/competition-client.ts:505-525`).
  That boundary reconstructs the canonical envelope from replayed inputs and
  requires the supplied authority, challenge, proof, and summary to match
  (`games/maltline/src/core/proof.ts:760-805`).
- The Worker serves only `ready`, unexpired retained objects and checks object
  size and SHA-256 against the database before returning bytes
  (`apps/platform/src/maltline-worker.ts:275-318`).
- Inspection has its own abort controller and generation. Replacement requests,
  restarts, and destruction cannot let stale success or failure overwrite the
  current view (`games/maltline/src/viewer/competition-controller.ts:325-369,
  433-451,532-540`). Browser tests cover replacement success/failure and stale
  attempt work (`games/maltline/tests/visual/competition-controller.visual.spec.ts`).
- Inspection state is separate from `terminalProof`, `terminalScore`, and
  submission state (`games/maltline/src/viewer/competition-controller.ts:184-197,
  371-422`). The callsign-preservation path remains intact when any panel
  rerender occurs.
- The Shift Board opens only on safe flow screens, makes the gameplay shell
  inert, and never steps the engine (`games/maltline/src/viewer/competition-controller.ts:21-29,
  314-323`; `games/maltline/src/viewer/main.ts:347-400`). Browsing or inspection
  therefore adds optional wall time only, not ranked ticks.

## Prioritized findings

### TD7-G01 — Expired proofs remain advertised as inspectable and retryable

**Severity:** P1 public-product blocker for retained inspection; not a ranking
or proof-integrity blocker.

Retained proof bytes expire after five days
(`apps/platform/src/maltline-worker.ts:29,514`). Ranked score rows persist after
retention cleanup. The leaderboard query returns every `ready` score without a
proof-availability or expiry field
(`apps/platform/src/maltline-worker.ts:252-272`), and the panel unconditionally
renders Inspect for every returned entry
(`games/maltline/src/viewer/competition-panel.ts:227-267`).

After cleanup or expiry, the proof endpoint correctly returns 410
(`apps/platform/src/maltline-worker.ts:283-302`). The controller collapses that
terminal condition together with transient storage/network failures into “could
not be replayed” (`games/maltline/src/viewer/competition-controller.ts:358-366`),
and the panel always offers “Retry proof inspection”
(`games/maltline/src/viewer/competition-panel.ts:293-307`). An old top-ten board
can consequently present ten Inspect buttons that can never succeed and invite
futile retries.

**Bounded fix:** include authoritative `proofAvailable` and, if useful,
`proofExpiresAt` in each leaderboard entry. Render unavailable rows as “Proof
window ended” without an action. Preserve retry only for timeout/429/5xx; map
404/410 to a terminal unavailable inspection state. Alternatively, retain proof
bytes for as long as a score is publicly presented as inspectable.

**Acceptance:** list a ready score before and after retention cleanup. Before
expiry, Inspect replays it. After expiry, the board remains ranked but exposes
no actionable inspection and no retry loop. Simulated 503 remains retryable.

### TD7-G02 — Inspection feedback can appear offscreen while focus stays on the row

**Severity:** P1 interaction/clarity; not a gameplay-state blocker.

The panel renders the complete standings first, then inspection, then the
player's terminal submission (`games/maltline/src/viewer/competition-panel.ts:499-528`).
During loading and completion it reconstructs the DOM and restores focus to the
same row's Inspect button (`:499-533`). It neither expands an inline region nor
scrolls/focuses the inspection heading. With the production limit of ten entries
(`games/maltline/src/viewer/competition-controller.ts:31,282-311`), a top-row
click can put “Replaying…” and the result below the viewport. It looks like the
button did nothing, and an eligible player's submission form is pushed still
farther down.

Current controller inspection coverage uses a one-row board, while the panel
fixture uses four entries. Tests assert that result text exists in the dialog,
not that the loading/result region is visible or associated with the initiating
button (`games/maltline/tests/visual/competition-controller.visual.spec.ts:12-30`;
`games/maltline/tests/visual/competition-panel.visual.spec.ts:25-52`).

**Bounded fix:** render inspection inline under the selected row, or replace the
table with a detail view that has an explicit Back to board action. At minimum,
give Inspect `aria-controls`/`aria-expanded`, move focus or scroll to a focusable
result heading, and mark the selected control busy/disabled while loading.

**Acceptance:** at 700×600 with ten rows, inspect ranks 1 and 10 using keyboard
and pointer. Loading, success, expiry, and retry feedback must be visible and
programmatically associated without manual searching; closing must still
restore focus. An unsubmitted terminal form must remain easy to reach.

### TD7-G03 — Local verification does not independently bind the proof to the named entrant

**Severity:** P1 trust-language correction; server behavior is sound.

The browser independently proves that a retained input sequence produces its
claimed outcome under the registered campaign. It does not independently prove
that the sequence belongs to the callsign selected in the leaderboard. The
controller supplies callsign and expected score from the board, accepts the
loaded envelope if only `summary.score` matches, then labels the result with that
callsign (`games/maltline/src/viewer/competition-controller.ts:325-357`). A
same-score swapped envelope would pass this client-side association check even
if lives, stages, ticks, or counters differed.

The honest same-origin Worker binds score ID to the correct database object, so
this is not a demonstrated server mix-up. It is a mismatch between the local
evidence and the wording “independently replayed and verified” attached to a
named player (`games/maltline/src/viewer/competition-panel.ts:277-338`). The
browser still trusts the server for score-ID/callsign/object association.

**Bounded fix:** first tighten the claim: “This browser replayed the retained
inputs and reproduced the listed result.” Pass the full listed summary into the
inspection request and compare score, lives, completion, stages, ticks, and
counters. If independent entry binding is a product requirement, publish an
entry-bound digest/identity in the leaderboard response and verify that exact
binding; do not imply a hash alone proves authorship or human play.

**Acceptance:** substitute an otherwise valid retained envelope with the same
score but different stage/tick/life summary; inspection must reject it. Copy
must distinguish local gameplay reproduction, server-backed entry association,
and claims the system does not establish (identity, humanity, or ownership).

### TD7-G04 — Tick IDs and an unanchored digest are technical, not useful arcade feedback

**Severity:** P2 product clarity.

The success card reports total ticks, machine stage IDs, per-stage ticks, and a
full SHA-256 digest (`games/maltline/src/viewer/competition-panel.ts:309-338`).
For a player, “21,662 ticks” is less legible than about 6:01 of active game time,
and IDs such as `maltline-08-closing-time` are less clear than authored stage
names. The digest is not shown anywhere else for comparison and has no label
explaining that it fingerprints the canonical proof envelope. It can therefore
look like a generic security seal rather than a value with a concrete use.

The card also calls a failed prefix “N stages cleared” but does not plainly say
where the run ended. It omits the already-derived fulfillment/walkout counters,
which are more useful for understanding a Maltline performance than raw ticks.

**Bounded fix:** lead with authored stage names, stage reached, score, lives, and
active simulation time formatted as minutes/seconds. Label that duration as
tick-derived active time, not wall-clock elapsed time. Add a concise service/
walkout summary. Move the full digest under a “Proof fingerprint” disclosure or
omit it until there is a copy/compare target.

**Acceptance:** a player can answer “how far, how long in active play, and what
went wrong?” without knowing tick cadence or reading an ID/hash. Technical
details remain accessible for advanced inspection without dominating the card.

### TD7-G05 — Local replay has no browser responsiveness budget

**Severity:** P2 measure before optimizing; low current pacing risk.

`verifyAndHashMaltlineProofEnvelope()` replays the proof synchronously on the
main thread before its asynchronous hash completes. Existing proof coverage
allows up to two seconds for the normal 21,662-tick verifier
(`games/maltline/tests/proof.test.ts:428-452`), which is a correctness regression
ceiling, not a UI frame budget.

An audit diagnostic on this machine replayed and hashed the 58,508-byte canonical
winning envelope ten times at 16.35–33.98 ms (18.96 ms mean). That is already
roughly one desktop frame and is not evidence for lower-powered supported
devices. The operation occurs only inside a modal on a safe/paused screen, so it
cannot alter ranked pacing or proof data, but a long task can make the loading
state stutter.

**Bounded fix:** measure fetch, parse, replay, hash, long-task duration, and input
latency on representative minimum hardware. Keep the current simple path if it
stays below the chosen responsiveness threshold. Otherwise move verification to
a Worker or provide bounded yielding without changing proof semantics.

**Acceptance:** a canonical win and maximum retained envelope remain responsive
at the 700px supported boundary and on the slow-device profile. Add a browser
long-task/interaction budget rather than tightening the generous core verifier
test.

## Terminal-flow and pacing assessment

Inspection is optional and does not compromise the protected terminal result.
It uses state separate from the player's submission, replacement requests are
generation guarded, and a fresh attempt aborts inspection. The player's edited
callsign is controller-owned, so inspection rerenders do not erase it. These
properties should be preserved.

The remaining pacing cost is navigational: a player who opens the board after a
loss or victory sees standings, optional inspection, and their submission form
in one long sheet. TD7-G02/G04 should reduce this search cost. Inspection should
stay off the live-play screen; no gameplay benefit justifies adding network or
local replay work to active ticks.

## Evidence rerun

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/competition-client.test.ts tests/competition-controller.test.ts \
  tests/authority.test.ts
  3 files, 79 tests passed

npm run test:visual --workspace @arcadebench/maltline -- \
  tests/visual/competition-controller.visual.spec.ts \
  tests/visual/competition-panel.visual.spec.ts
  16 tests passed
```

The first visual-test attempt encountered the shared development port while
another process owned it; the settled retry passed all 16 cases. No product file
was changed.

## Recommended order

1. Fix availability honesty and terminal-vs-retry handling (TD7-G01).
2. Make inspection feedback immediately visible and associated (TD7-G02).
3. Narrow and strengthen trust claims/binding checks (TD7-G03).
4. Translate technical proof data into player-readable performance (TD7-G04).
5. Measure browser replay responsiveness before choosing a worker refactor
   (TD7-G05).

## Repair verification

**Recheck date:** 2026-09-10
**Current verdict:** TD7-G01 through TD7-G04 are closed. TD7-G05 remains P2
measurement debt. No retained-inspection gameplay, ranking-integrity, proof, or
release blocker remains from this audit.

- **TD7-G01 — closed.** The leaderboard query derives `proofAvailable` from
  retention state and expiry, and exposes it on every entry
  (`apps/platform/src/maltline-worker.ts:236-278`). The client strictly parses
  the flag, unavailable rows render `Window ended` with no Inspect action, and a
  404/410 reached during an inspection permanently changes that displayed row
  to unavailable with no retry; transient failures retain Retry
  (`games/maltline/src/viewer/competition-controller.ts:346-407`;
  `games/maltline/src/viewer/competition-panel.ts:277-292,329-350`). Platform
  integration coverage verifies that retention cleanup preserves the ranked
  entry while changing `proofAvailable` to false, and browser coverage verifies
  both the non-retryable expired path and retryable transient path.
- **TD7-G02 — closed.** Selecting a proof now replaces standings/submission
  content with a dedicated detail view, moves focus to its `PROOF CHECK`
  heading, and `Back to board` restores the initiating Inspect control
  (`games/maltline/src/viewer/competition-panel.ts:305-317,580-597`). The browser
  test exercises both rank 1 and rank 10 at 700x600 and asserts detail visibility
  and focus restoration
  (`games/maltline/tests/visual/competition-controller.visual.spec.ts:33-57`).
  Expiry and retry states use the same immediately focused detail view.
- **TD7-G03 — closed for the stated trust-language defect.** Inspection now
  compares every listed result field—score, lives, stage reached/cleared,
  completion, total ticks, and all service-resolution counters—before showing
  success (`games/maltline/src/viewer/competition-controller.ts:355-385`). A
  same-score/different-outcome proof is rejected by browser coverage. Player
  copy now accurately says that this browser replayed retained inputs and
  reproduced the listed result; it does not claim that the browser independently
  established entrant identity or human authorship
  (`games/maltline/src/viewer/competition-panel.ts:357-392`). Server-backed
  score-ID/callsign association remains an intentional trust boundary, not a
  residual local-verification claim.
- **TD7-G04 — closed for campaign generation 2.** The primary result uses
  score, outcome, lives, `M:SS` active time, authored stage names, stage reached,
  served customers, and walkouts. The SHA-256 value is demoted beneath a
  `Proof fingerprint` disclosure and explicitly identified as the canonical
  envelope digest (`games/maltline/src/viewer/competition-panel.ts:354-390`).
  The generation-2 authority has a uniform 60 Hz cadence, matching the current
  active-time formatter; a future authority with mixed cadence would need to
  carry explicit elapsed-time data rather than reuse that formatter unchanged.
- **TD7-G05 — residual P2 cleanup.** Verification is still synchronous on the
  browser main thread through replay, and the only explicit runtime ceiling
  remains the core test's generous 2,000 ms bound
  (`games/maltline/tests/proof.test.ts:428-452`). No representative slow-device
  browser long-task or interaction-latency budget was found. The historical
  desktop measurement remains reassuring but does not satisfy the original
  acceptance criterion. Keep the simple path until measurement shows a problem;
  add the browser budget before considering a Worker or cooperative yielding.

Exact focused checks run on the repaired tree:

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/competition-client.test.ts tests/competition-controller.test.ts \
  tests/proof.test.ts
  3 files, 103 tests passed

npm test --workspace @arcadebench/platform -- --run \
  tests/maltline-worker.integration.test.ts
  1 file, 10 tests passed

npm run test:visual --workspace @arcadebench/maltline -- \
  tests/visual/competition-controller.visual.spec.ts \
  tests/visual/competition-panel.visual.spec.ts
  20 tests passed
```

Only this audit report was changed during repair verification.
