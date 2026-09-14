# TD-06 — Browser competition gameplay follow-up

**Review date:** 2026-09-10
**Scope:** browser competition controller, panel, ranked-proof recorder, and
`main.ts` attempt/stage/terminal lifecycle after the TD6-G01/G02 repairs. This
report is the only file changed by the final recheck.

## Verdict

No browser-ranked gameplay or proof-lifecycle release blocker remains from this
audit.

All four originally reported defects are repaired. In particular, a Stage 8
winning proof survives R on the intermediate `cleared` screen, asynchronous
preflight failure updates the public overall eligibility snapshot without
waiting for another animation frame, callsigns survive board rerenders, and an
invalidated proof cannot be submitted. Final-stage copy now describes the real
ranked-review behavior.

The complete eight-stage browser trace still passes the public verifier. The
only residual item is maintenance-level: the controller's transition matrix is
covered mainly through broad browser tests rather than focused state tests.

## Recheck of the original findings

### 1. Terminal restart could silently destroy the in-memory proof — repaired

`protectsTerminalResult()` identifies an unsubmitted terminal result
(`games/maltline/src/viewer/competition-controller.ts:453-457`). The global R
branch checks it before every restart, independent of screen
(`games/maltline/src/viewer/main.ts:353-360`), so it covers `gameover`, `victory`,
and Stage 8 `cleared`. Game-over and victory Enter remain protected at
`games/maltline/src/viewer/main.ts:393-400`.

The full-campaign browser test stops on final `cleared`, presses R, observes the
ranked form, closes it, and confirms that the screen and eligible proof are
unchanged before advancing to victory
(`games/maltline/tests/visual/maltline.visual.spec.ts:565-592`). That test passed
in this recheck. A deliberate discard remains available inside the panel
(`games/maltline/src/viewer/competition-panel.ts:161-166,313-314,328-346`).

The former copy mismatch is also repaired. `finishStage()` passes both
`finalStage` and `rankedResultProtected`
(`games/maltline/src/viewer/main.ts:261-274`), and the presentation now says
“final result” plus either “review ranked run” or “restart” as appropriate
(`games/maltline/src/viewer/gameplay-flow.ts:133-154`). Unit coverage checks the
ranked and unranked final variants
(`games/maltline/tests/gameplay-flow.test.ts:66-86`).

### 2. Failed ranked preflight continued to claim recording/eligible — repaired

The failed challenge branch sets challenge `unavailable`, proof `ineligible`,
stores the reason, and irreversibly invalidates the recorder
(`games/maltline/src/viewer/competition-controller.ts:407-417`). Recorder entry
points remain gated on that reason (`:419-431`), and the trigger becomes a
visible disabled practice marker during live play (`:209-221`).

The controller now notifies its owner after publishing competition state
(`games/maltline/src/viewer/competition-controller.ts:191-207`). `main.ts` binds
that callback to immediate viewer-status publication
(`games/maltline/src/viewer/main.ts:45-52`), where top-level `rankEligible` is
composed from timing and competition eligibility (`:90-111`). Initial controller
construction suppresses notification until assignment is complete
(`games/maltline/src/viewer/competition-controller.ts:364-370`), avoiding a
temporal-dead-zone callback.

The deferred-preflight browser test now observes `competition.proof =
'ineligible'` and `rankEligible = false` immediately after the promise resolves,
without advancing the manual animation-frame clock
(`games/maltline/tests/visual/maltline.visual.spec.ts:466-499`). It passed in this
recheck.

### 3. Leaderboard refresh erased an in-progress callsign — repaired

The panel reports every edit to the controller, which retains it in the eligible
submission state and restores it after asynchronous rerenders
(`games/maltline/src/viewer/competition-panel.ts:283-312` and
`games/maltline/src/viewer/competition-controller.ts:180-189`). The browser test
delays the first board response and proves both the standings rerender and a
later moderation 400 preserve the edit
(`games/maltline/tests/visual/maltline.visual.spec.ts:323-385`).

### 4. Invalidation retained a stale proof and submission did not gate it — repaired

Invalidation clears `terminalProof`
(`games/maltline/src/viewer/competition-controller.ts:436-445`). Submission
requires a proof, no invalidation reason, and a proof state that is neither
ineligible nor submitted (`:310-318`). The interruption browser case reaches a
practice result with no submit control and zero submission requests
(`games/maltline/tests/visual/maltline.visual.spec.ts:419-463`).

## Genuine residual debt

### TD6-G03 — Lifecycle invariants lack focused controller-state tests

**Severity:** P2 maintenance debt; not a release blocker.

`games/maltline/tests/competition-controller.test.ts` covers service admission,
memory-only source constraints, and pure submission-error classification, but
not the controller's complete `startAttempt`/challenge/stage/terminal/
invalidate/submission/restart transition matrix. The Playwright coverage is now
strong and verifies the important composed behavior, but focused tests would
localize future asynchronous lifecycle failures faster and cover stale promise
completion more economically.

**Bounded follow-up:** add a DOM-backed controller fixture with a deferred fake
client. Cover stale challenge, board, and submit completion after restart;
preflight success/failure before and after terminal; invalidation; transient
retry; accepted submission; explicit discard; and notification ordering. Keep
the full-campaign browser regression as the authoritative integration check.

**Acceptance:** every transition yields one coherent controller snapshot;
superseded async work cannot mutate the current attempt; notification callbacks
observe initialized state and cannot recurse; identical retry retains the same
proof and callsign; terminal discard alone starts a fresh attempt.

## Evidence rerun

```text
npm test --workspace @arcadebench/maltline -- --run \
  tests/gameplay-flow.test.ts tests/competition-controller.test.ts \
  tests/ranked-proof-recorder.test.ts
  3 files, 22 tests passed

npm run test:visual --workspace @arcadebench/maltline -- --grep \
  "ranked preflight failure|complete eight-stage viewer campaign"
  2 tests passed
```

## Disposition

TD6-G01 and TD6-G02 are closed. TD6-G03 can be scheduled as test-architecture
hardening; it does not block ranked browser play, proof correctness, or the next
human-playtest pass.
