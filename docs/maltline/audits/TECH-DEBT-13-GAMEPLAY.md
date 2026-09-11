# Maltline Technical-Debt Audit 13 — Gameplay and Evidence Architecture

**Date:** 2026-09-11
**Scope:** Settled P0-52 source-provenance hardening, P0-53 numeric-lives
presentation, generation-2 gameplay, prospective tuning/recovery evidence, and
the remaining human-decision boundary. Product code and tests were read only.

## Verdict

There is **no P0 gameplay, proof, authority, or release blocker**. P0-52 and
P0-53 are accepted. The registered generation-2 game remains the only ranked
campaign, and the evidence does not justify changing its engine, rules,
scoring, lives, campaign, or proof protocol now.

The highest-value bounded follow-up is not a gameplay change: P0-54 should
apply P0-52's exact source-closure policy to the older P1-08 portable envelope
before that artifact is revised or used for a new current-source claim. The
current P1-08 graph contains no bare workspace import, so this is prospective
evidence-integrity debt rather than invalidation of its existing fixed payload.

Human evidence remains the gating work for the 5–15-minute objective, the
Stage 8 relief decision, and the carried-lives score policy. Automated models
can continue to support experiment design, but must not be promoted into human
preference, comprehension, fatigue, or recovery claims.

| Severity | Count | Classification |
| --- | ---: | --- |
| P0 | 0 | No current gameplay, ranked-authority, proof, or release blocker. |
| P1 | 4 | One bounded evidence-boundary repair and three retained human/product-decision gates. |
| P2 | 2 | One optimized-run regression gate and one fixture-metadata truth repair. |

## Accepted changes

### P0-52 — P102 provenance now fails closed

The P102 walker now has one explicit external allowlist and otherwise rejects
bare package/workspace aliases. It covers imports, re-exports, import-equals,
import-type nodes, local module declarations, runtime loaders, dynamic import,
triple-slash references, and AMD directives
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:50-57,200-286`). Local
files are realpathed, kept inside the repository, and bounded to 256 files and
4 MiB before entering the manifest (`:289-347`). The only viewer dependency is
the input adapter; proof, competition, platform, human-lab, and production-root
closures remain prohibited (`:305-314`).

The strict tests cover workspace roots/subpaths, re-exports, import-equals,
import types, package and TypeScript path aliases, loader variants, references,
AMD, ordinary calls, legacy parsing, and the public CLI
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:343-399,
468-583`). Current-source verification remains the default
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:635-638`).

The compatibility claim is honest:

- the historical EXP-078 schema-1 envelope remains 533,781 bytes at
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`
  with integrity
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`,
  and is accepted only with `verifyCurrentSource: false`;
- the current producer source/build identities are
  `9dfa303bd5974f4c2ea9761c2c9cb03c52c39e5b910169997f3d45ff94e71d67`
  and
  `16a87515d640ebaabd6b173e91e14946dbbdb1c23d2cd032f54a98161091d31f`;
- the current formatted envelope is 533,781 bytes at
  `947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64`
  with integrity
  `ed3e6b18bb7905f35d2a6b68d17d7894ac28ddee9416f54fe614561843e70b97`;
- the 19-file kernel, controller registry, experiment fingerprint, result,
  payload bytes/hash, and actual 2,736,116-step work ledger are unchanged.

The tool is reachable through only the offline package script
(`games/maltline/package.json:21-24`), not the production verifier leaf
(`games/maltline/src/verifier.ts:1-16`). The Worker bundle audit confirms that
experiment/telemetry/viewer source is absent from the Worker. This closes
P0-52 without revising any ranked identity.

### P0-53 — the lives resource is now explicit without changing rules

The HUD displays a state-derived `LIVES N` chip as the primary cue and only one
subdued shake as secondary cabinet art while lives remain above zero
(`games/maltline/src/viewer/renderer.ts:1498-1522`). It does not derive lives
from effects or icons. Canvas tests pin exact 0/1/2/4 text and geometry in both
motion modes (`games/maltline/tests/renderer-presentation.test.ts:361-395`),
and browser evidence covers zero-life game over, one-life Stage 7 at 1280 and
700, reduced motion, intermediate lives, and the four-life first-pour state
(`games/maltline/tests/visual/maltline.visual.spec.ts:1704-1740`). Title and
instruction copy still truthfully explain four lives and all three loss causes
(`games/maltline/src/viewer/gameplay-flow.ts:63-89`).

The human-lab artifact remains schema 3 but accepts only participant-visible
revision 11 (`games/maltline/src/experiments/human-lab-session.ts:22-25,
554-618`); tests explicitly reject revision 10 (`games/maltline/tests/
human-lab-session.test.ts:452-482`). No score, life-loss rule, campaign,
authority, proof, or replay state changed. P0-53 does not need reopening.

## P1 findings

### TD13-G01 — The older P1-08 envelope still has the dependency gap P0-52 closed

**Owner:** P0-54. **Current artifact blocker:** no. **Blocker before another
P1-08 current-source revision:** yes.

P102 now applies an exact allowlist and rejects every unreviewed bare
specifier. The separate P108 walker still records only specifiers beginning
with `.` or `/`; all other static imports, re-exports, and import-equals
specifiers fall through without rejection
(`games/maltline/tools/p1-08-artifact-envelope.ts:298-321`). Its tests cover
unresolved relative imports, dynamic import, symlink escape, build-input
escape, and graph caps, but not workspace/package/path aliases, import types,
runtime loaders, references, AMD, or module augmentation
(`games/maltline/tests/p1-08-artifact-envelope.test.ts:275-325`).

The current P108 closure has no `@arcadebench/*` import, so its retained fixed
payload is not shown false by this review. The debt is architectural: two
portable Maltline evidence formats now encode materially different meanings of
"source closure," and the older one can repeat the exact omission P0-52 fixed.

**Bounded exit:** under P0-54, extract or parameterize one testable static
source-graph policy with per-artifact entry, allowed external set, allowed
viewer leaves, and file/byte caps. Apply it to P108 and retain all P102
adversarial cases. Prove legacy P108 bytes remain archival-only under explicit
non-current verification; issue new source/build/envelope identities while
leaving its payload/result/controller/work facts unchanged. Do not expose the
walker in production or treat the hardening as tuning evidence.

### TD13-G02 — The available human lab cannot decide the Stage 8 relief candidate

**Owners:** P1-02, P1-08, P1-10. **Blocks:** candidate promotion, not the
generation-2 game.

The current lab comparison consists only of Stages 4–7
(`games/maltline/src/experiments/human-lab-session.ts:519-547,694-736`). Its D
candidate changes Stage 5 resource cadence and Stage 7 count/cadence/speed
(`games/maltline/src/experiments/p1-08-candidates.ts:57-89`), and the debrief
states that exact scope (`games/maltline/src/viewer/human-lab.ts:1125-1136`).
P102 instead changes only Stage 8 from 132 to 138 ticks. Consequently, no
existing A/D participant artifact can establish preference, readability, or
recovery for the P102 candidate.

The deterministic result remains useful: delayed wins improve 31/33 to 33/33,
adapter-delayed wins improve 30/33 to 33/33, and competent mean crowd/open
demand falls while novice runs never reach Stage 8
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:216-235`). That
is a sensitivity boundary, not a promotion vote.

**Acceptance:** if Stage 8 relief is still a candidate after the current A/D
study, pre-register a separate blinded Stage 8 comparison or a full-run study
that actually exposes both 132 and 138. Capture stage reach, completion,
pressure/fairness, hardest decision, loss cause, return-jar experience,
recovery, fatigue, and preference. Do not silently repurpose EXP-049 A/D
artifacts or change generation 2 first.

### TD13-G03 — The 5–15-minute success criterion still lacks successful-human wall time

**Owners:** P1-02 and the existing human/device evidence work. **Blocks:**
closing P1-02; no current release blocker.

The product criterion is a complete fresh human run normally lasting 5–15
minutes (`docs/maltline/TASKS.md:8-17`). The README correctly limits its
6.0–6.2-minute claim to deterministic active model time before menus and
transitions (`games/maltline/README.md:8-12`). The shortened lab explicitly
covers mid-campaign Stages 4–7 and warns that its 15–20-minute appointment must
not close full-game duration (`docs/maltline/audits/P1-08-HUMAN-LAB-UX.md:
201-212`). P0-52 and P0-53 add no human completion distribution.

**Acceptance:** collect successful eight-stage wall-clock and active-tick
durations for predeclared first-time and informed strata. Record failed
attempts, stage reach, restarts, card/countdown/manual dwell, interruptions,
and voluntary stops separately. Do not merge short losses into the successful
completion distribution or infer human time from deterministic ticks.

### TD13-G04 — Carried-lives scoring remains coherent but undecided

**Owners:** P1-04 and P1-10. **Blocks:** a scoring/rules promotion; no engine
correctness or generation-2 blocker.

The authoritative engine remains internally consistent: first fulfillment
scores and advances the chain, rescue scores zero, catches award only their
eligible bonus, life loss resets the chain, and stage clear awards 250 points
per currently carried life (`games/maltline/src/core/engine.ts:279-307,
324-386`). EXP-059 retains two budget-preserving prospective policies and the
current policy without registering any of them
(`games/maltline/src/experiments/p1-04-recovery-experiment.ts:29-64,
399-463`). P102's structural later-fulfillment and cascade measurements do not
answer whether a player understands or prefers the continuing score cost of an
early lost life.

**Acceptance:** use actual loss explanations and score-belief responses to
decide whether carried lives should tax later stage bonuses. Keep arrival
pacing constant during that comparison. If policy changes, version rules,
authority, proof expectations, score goldens, and competition registration as
a distinct decision; do not infer it from the Stage 8 arrival experiment.

## P2 findings

### TD13-G05 — Prefix equivalence is reviewed but still not a checked-in oracle

**Owner:** P0-54. **Blocker:** no for retained EXP-078; required before
changing its prefix optimization or citing a revised optimized artifact.

P102 truthfully distinguishes 264 logical outcomes from 132 executed and 132
reused prefixes. Reuse consists of cloned/frozen run totals and loss counters;
each executed stage gets a fresh controller and engine
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:462-556,
708-744`). Tests prove paired prefix value equality and non-aliasing
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:175-214`), while
the all-fresh equivalence run remains independent audit evidence rather than a
committed regression gate.

**Bounded exit:** add the queued full-campaign oracle for all 132 profile/seed
pairs. Compare control and candidate stage reach/status, total ticks,
score/lives/loss reasons, and every Stage 8 observation against the optimized
artifact. Run it in a bounded slow/focused gate without raising semantic tick
limits or blanket timeouts. Any future prefix, controller-lifetime, seed, or
carry change must pass this oracle before pins move.

### TD13-G06 — Zero-life fixture metadata claims a color the renderer omits

**Owner:** P2-02 visual-evidence maintenance. **Runtime/P0-53 blocker:** no.

The renderer draws the strawberry cup only when `state.lives > 0`
(`games/maltline/src/viewer/renderer.ts:1517-1521`). Fixture metadata always
lists the strawberry base color for the lives region, including the game-over
fixture at zero lives (`games/maltline/src/viewer/visual-fixtures.ts:1075-1086`).
The browser matrix includes game over but asserts only region geometry, not
state-dependent color truth (`games/maltline/tests/visual/
maltline.visual.spec.ts:1704-1740`). Pixels and player copy are correct; the
machine-readable evidence is slightly overstated.

**Bounded exit:** make the metadata color list conditional on the same
state-derived cup-presence rule, and test zero excludes strawberry while a
positive-life fixture includes it. This is metadata/test-only and requires no
golden, renderer, lab-revision, or P0-53 status change.

## Recommended order

1. Complete P0-55 with the other independent review slices; do not reopen
   P0-52/P0-53 or generation 2.
2. Under P0-54, converge the P108 source-closure policy and commit the all-fresh
   P102 prefix oracle. Preserve all historical payload bytes explicitly.
3. Correct the zero-life visual metadata alongside future P2-02 evidence work.
4. Collect the already-scoped human evidence. Only that evidence should decide
   Stage 8 relief, full-run duration, or scoring policy.

## Evidence run independently

- `npm test --workspace=@arcadebench/maltline -- --run tests/renderer-presentation.test.ts tests/presentation-copy.test.ts tests/viewer-session.test.ts tests/human-lab-session.test.ts tests/p1-02-stage8-relief-experiment.test.ts` — **5 files, 69 tests passed**.
- `npm test --workspace=@arcadebench/maltline` — **46 files, 678 tests passed** with default parallelism.
- `npm run build --workspace=@arcadebench/maltline` — passed; Vite transformed **44 production modules**.
- `npm run test:worker-bundle` — **4/4 passed**.
- `npm run --silent relief:p1-02 --workspace=@arcadebench/maltline` twice — byte-identical one-document JSON, **533,781 bytes**, SHA-256 **`947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64`**.
- `git diff --check` — passed during the P0-52 acceptance check.
