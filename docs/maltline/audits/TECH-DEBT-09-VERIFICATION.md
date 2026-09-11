# Maltline Technical-Debt Audit 09 — Verification and Evidence Boundaries

**Date:** 2026-09-11
**Scope:** deterministic visual-fixture provenance and conservation evidence,
production/human-lab module boundaries, and the presentation debts retained
after EXP-056–059. This report records the audit and its completed bounded
repairs. Product code, task logs, and experiment logs were not changed while
authoring it.

## Verdict

**No verification, ranked-integrity, production-isolation, or release blocker
remains in this tranche.**

The fixture runtime now distinguishes structurally engine-reachable evidence
from deliberately composed presentation-only event evidence. Every fixture
that claims reachability is checked before events are pushed or a frame is
drawn. The normal production Vite graph is generically barred from every
experiment, testing, and visual-fixture module; the development-only human lab
has an exact experiment allowlist and a graph-wide source scan for network,
API, dynamic-import, and persistent-storage escape hatches.

Two presentation concerns remain: the machine painter still conflates selected
and processing station geometry, and renderer layout authority is split between
stored and per-draw scenario inputs. They are bounded P1/P2 presentation and
maintainability debt. Neither changes engine execution, generation-2 campaign
authority, proof verification, replay, score, or leaderboard submission.

| ID | Severity | Status | Release disposition |
| --- | --- | --- | --- |
| TD9-V01 | P1 evidence truth | Closed | No blocker |
| TD9-V02 | P1 build boundary | Closed | No blocker |
| TD9-V03 | P1 presentation truth | Deferred | Fix before the next participant run; not a ranked-release blocker |
| TD9-V04 | P2 maintainability | Deferred | Non-blocking bounded refactor |

## TD9-V01 — Fixture provenance and conservation evidence

**Status: closed.**

The audit found five fixture states whose counters did not satisfy the basic
customer lifecycle equation or whose event composition could not honestly be
claimed as a reachable engine snapshot:

1. `jar-catch` had four spawned/served customers but only three resolved and no
   live customer. It now consistently records three spawned, three service
   actions, three fulfilled, and three resolved customers
   (`games/maltline/src/viewer/visual-fixtures.ts:688-704`).
2. `shake-launch` had three spawned customers but only two resolved and no live
   customer. Its spawned count is now two
   (`games/maltline/src/viewer/visual-fixtures.ts:709-723`).
3. `jar-miss` had four spawned customers against one live plus two resolved.
   Its spawned count is now three
   (`games/maltline/src/viewer/visual-fixtures.ts:773-796`).
4. `return-window` composes two `jar_returned` events and two return entities
   without the corresponding drinking customers required by the engine event
   transition. Preserving this useful event-age frame is legitimate, but it is
   now explicitly `synthetic-isolated-event`, never recorded/reachable evidence
   (`games/maltline/src/viewer/visual-fixtures.ts:728-749`).
5. The `reduced-motion` state had seven spawned customers against three live
   plus three resolved. Its spawned count is now six
   (`games/maltline/src/viewer/visual-fixtures.ts:235-253`).

The integrated `game-over` overlay/event composition is likewise explicitly
presentation-only rather than silently inheriting authored/reachable
provenance (`games/maltline/src/viewer/visual-fixtures.ts:330-342`). This is a
classification repair, not an additional counter mismatch.

The fixture contract now has a distinct `synthetic-isolated-event` provenance
and derived `engine-reachable | presentation-only` metadata
(`games/maltline/src/viewer/visual-fixtures.ts:56-81,863-866`). Before a
reachable fixture can emit events or draw, the runtime rejects:

- unsafe or negative counters and inconsistent scenario identity;
- `customers + resolved != spawned` or `exited + walkouts != resolved`;
- fulfillment exceeding service actions or spawned customers;
- out-of-scenario player/entity coordinates, invalid or duplicate entity IDs,
  and invalid washing timers;
- jar over-allocation; and
- anything short of exact jar-pool conservation for a pressure-envelope
  fixture.

Those checks are centralized at
`games/maltline/src/viewer/visual-fixtures.ts:1063-1128` and run before
`pushEvents`/`draw` at `games/maltline/src/viewer/visual-fixtures.ts:1141-1156`.
Metadata exposes the provenance, reachability, identity lists, and all relevant
counters for browser assertions (`games/maltline/src/viewer/visual-fixtures.ts:
1016-1058,1171-1176`).

The visual suite pins the event-fixture classification, requires isolated
fixtures to use only the isolated provenance, and applies lifecycle assertions
to every event fixture claiming reachability
(`games/maltline/tests/visual/maltline.visual.spec.ts:104-111,1633-1657`). The
pressure and collision-corridor cases independently assert jar conservation,
lifecycle accounting, fulfillment bounds, and unique entity identities
(`games/maltline/tests/visual/maltline.visual.spec.ts:1420-1440,1545-1608`).

This is strong structural evidence, not a claim that every authored snapshot
has a retained engine trace. `engine-reachable` means the fixture satisfies the
enforced engine-state invariants; only proof/playback fixtures should be called
replayed or recorded evidence.

## TD9-V02 — Production and human-lab module boundaries

**Status: closed.**

The production boundary no longer depends on enumerating today's known lab
files. The normal Vite entry must import `main.ts` and must import **zero**
modules below `src/experiments/**`, `src/testing/**`, or the visual-fixture
entry family (`games/maltline/tests/human-lab-boundary.test.ts:79-93`). A future
experiment or testing helper therefore fails the production-graph gate without
needing to be added to a denylist.

The lab side uses the inverse policy. It must include the five exact experiment
leaves currently needed by the study:

- `p1-08-candidates.ts`;
- `human-lab-observation.ts`;
- `human-lab-session.ts`;
- `human-lab-study.ts`; and
- `human-lab-timing.ts`.

No other `src/experiments/**` module is accepted, and P1-04 is explicitly
rejected. Proof, playback, production main, competition, ranked recorder,
replay scrubber, public root/telemetry barrels, and all testing modules remain
forbidden (`games/maltline/tests/human-lab-boundary.test.ts:12-22,95-119`).

The no-network/no-storage gate now builds the actual lab Vite graph and scans
the human-lab HTML plus every graph-reachable package source with a
`.ts`, `.css`, or `.html` extension. It rejects dynamic imports, `fetch`, XHR,
WebSocket, EventSource, beacon, local/session storage, IndexedDB, API paths, and
direct forbidden imports (`games/maltline/tests/human-lab-boundary.test.ts:
121-138`). This closes the prior fixed-file-list blind spot while retaining the
separate TypeScript-program coverage check (`games/maltline/tests/human-lab-boundary.test.ts:
67-77`).

These are static graph/source gates. They intentionally complement rather than
replace CSP, assembled-site exclusion/404 smoke, and browser execution tests.

## Deferred presentation debt

### TD9-V03 — Selected and processing station geometry remain conflated

**Severity: P1 presentation truth; fix before the next participant run, not a
ranked-release blocker.**

The engine permits station movement while preserving the flavor of an active
blend. The shared station-action presentation correctly distinguishes those
facts, but `drawMachine` still defines processing as “selected and any blend is
active” (`games/maltline/src/viewer/renderer.ts:1220-1235`). A valid state with
Chocolate selected and Strawberry processing can therefore animate Chocolate
while the action text truthfully names Strawberry. The next bounded visual
tranche should pass separate selected/processing flags, pin a real-engine split
state at normal and reduced motion, and repin only deliberate pixels. The
experiment revision must change if participant exposure is pooled across that
visual change.

### TD9-V04 — Renderer geometry lacks one scenario/layout authority

**Severity: P2 maintainability and future truth risk; non-blocking.**

`setScenario` stores scenario-derived lane height, while `draw` and most leaf
painters also accept a scenario on every call
(`games/maltline/src/viewer/renderer.ts:126-165,294-325`). Fixture metadata then
re-derives visible geometry separately. Callers currently pass the same frozen
default campaign scenario, and exact tests are green, so there is no observed
identity drift. A later pixel-neutral refactor should create one immutable
renderer scenario/layout value and share its coordinate helpers with fixture
evidence. It must not broaden into a renderer rewrite or change generation-2
campaign/rules/proof versions.

## Validation evidence

Commands were run from `games/maltline` unless stated otherwise:

- `npm test -- --run tests/human-lab-boundary.test.ts tests/viewer-boundary.test.ts tests/visual-theme.test.ts tests/renderer-presentation.test.ts`
  — **4 files, 26/26 passed** in 348 ms.
- `npm run test:visual -- --grep "declares coherent pressure provenance|Stage 4 collision corridor|reduced-motion Stage 4 corridor|fixture provenance pins|desktop (reduced-motion|jar-miss)"`
  — **14/14 passed** in 2.2 s. An earlier focused event/inventory tranche also
  passed **18/18** after the intended fixture corrections.
- `npm run test:visual` — **132/132 passed** in 1.0 min, including all exact
  screenshots. No golden or production pixel update was required.
- `npm run build` — TypeScript and Vite production build passed; Vite transformed
  **38 modules** in 43 ms.
- `git diff --check -- games/maltline/src/viewer/visual-fixtures.ts games/maltline/tests/visual/maltline.visual.spec.ts games/maltline/tests/human-lab-boundary.test.ts`
  — clean.
- `rg -n "synthetic-isolated-event|maltline-visual-fixture-runtime|p1-04-recovery-ledger" games/maltline/dist`
  — no matches, confirming that the fixture runtime/provenance and P1-04
  sentinels were absent from the production package output.

## Release disposition and next order

- **Release blockers:** none in this audit scope.
- **Closed before release:** fixture truth labeling/conservation and generic
  production/lab graph isolation.
- **Before the next human participant run:** fix TD9-V03 and version the lab
  exposure if data collection crosses the pixel change.
- **Non-blocking follow-up:** address TD9-V04 as a small pure layout-authority
  extraction after the station fix; retain draw order and exact pixels.
- **Explicitly out of scope:** broad environment repaint, engine/campaign
  tuning, proof/replay protocol changes, and any weakening of current exact
  visual or module-boundary gates.
