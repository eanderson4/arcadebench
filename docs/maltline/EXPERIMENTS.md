# Maltline Experiment Log

This file is append-only. Never rewrite or delete an experiment, including a
failed one. Corrections and superseding decisions get a new entry referencing
the earlier ID. This makes repeated ideas and tuning loops visible.

Each experiment records:

- hypothesis or question;
- exact code/content state and procedure;
- measurements or observations;
- decision and follow-up;
- related task IDs.

---

## EXP-000 — Project baseline opened

- **Date:** 2026-09-10
- **State:** `maltline-polish` created from `9058307` (`maltline`)
- **Question:** What evidence is required before changing game feel or visual
  direction?
- **Procedure:** Preserve the existing prototype, create an explicit backlog,
  run build/tests, and commission independent gameplay, visual/UX, and
  replay-security audits.
- **Observation:** The inherited prototype already contains a deterministic
  fixed-tick engine, an eight-stage campaign, replay records, a canvas renderer,
  and focused engine tests. It does not yet contain the benchmark/leaderboard
  integration or visual-regression harness described by its README.
- **Decision:** Treat the existing game as the baseline artifact. Make tuning
  changes only after recording a measurable hypothesis or a clearly identified
  usability defect.
- **Tasks:** P0-01, P0-02, P0-03, P0-04

## EXP-001 — Baseline command attempt without dependencies

- **Date:** 2026-09-10
- **State:** `maltline-polish` at `9058307`, before product-code changes
- **Question:** Does the inherited Maltline workspace currently build and pass
  its focused tests?
- **Procedure:** Run `npm test --workspace=@arcadebench/maltline` and
  `npm run build --workspace=@arcadebench/maltline`.
- **Observation:** Both commands stopped before reading project code because the
  worktree had no installed dependencies: `vitest: not found` and
  `tsc: not found`.
- **Decision:** This is an invalid code baseline, not a product defect. Install
  from the committed lockfile with `npm ci`, rerun both commands, and record the
  actual result separately.
- **Tasks:** P0-01

## EXP-002 — Valid focused baseline

- **Date:** 2026-09-10
- **State:** `maltline-polish` at `9058307`, dependencies installed with
  `npm ci`; Node 22.19.0 and npm 10.9.3
- **Question:** Does the inherited Maltline implementation compile and satisfy
  its existing automated behavior checks?
- **Procedure:** Rerun `npm test --workspace=@arcadebench/maltline` and
  `npm run build --workspace=@arcadebench/maltline`.
- **Measurement:** 1 test file and 7 tests passed in 106 ms. TypeScript and Vite
  production build passed; the JS bundle was 33.76 kB (10.54 kB gzip), CSS was
  1.92 kB (0.89 kB gzip), and HTML was 1.57 kB (0.73 kB gzip).
- **Observation:** The inherited unit suite is healthy but narrow: all seven
  checks live in one engine test file. Passing it does not establish campaign
  duration, browser behavior, visual quality, accessibility, or hostile replay
  rejection.
- **Decision:** Preserve this as the known-good functional baseline. Expand
  evidence before gameplay tuning.
- **Tasks:** P0-01, P0-05, P0-06, P3-03

## EXP-003 — Repository compatibility baseline

- **Date:** 2026-09-10
- **State:** Same product state as EXP-002
- **Question:** Does adding the inherited Maltline workspace preserve the full
  monorepo's build and test contracts?
- **Procedure:** Run `npm run check` from the repository root.
- **Measurement:** All workspace builds passed. All 85 tests passed across 21
  files: Arcade SDK 6, bench core 7, harness 2, Maltline 7, Partition 58, and
  platform 13.
- **Observation:** Maltline is compatible with the branch's current shared
  packages and platform. The comparison also quantifies the testing gap:
  Maltline has 7 tests versus Partition's 58, before counting missing browser
  and visual coverage.
- **Decision:** Use the full check as a required regression gate while adding
  focused Maltline coverage.
- **Tasks:** P0-01, P0-05, P3-04

## EXP-004 — Correction to EXP-003 test total

- **Date:** 2026-09-10
- **Correction:** EXP-003 incorrectly stated the aggregate as 85 tests. The
  per-workspace counts written in that entry sum to **93 tests across 21 test
  files**. The command passed in full; only the hand-calculated aggregate was
  wrong.
- **Decision:** Retain EXP-003 unchanged under the append-only rule and use 93
  as the authoritative baseline total.
- **Tasks:** P0-01

## EXP-005 — Independent baseline audits

- **Date:** 2026-09-10
- **State:** Same inherited product state as EXP-002; reports added under
  `docs/maltline/audits/`
- **Question:** Which defects invalidate gameplay, visual, or leaderboard
  conclusions before tuning begins?
- **Procedure:** Three agents independently audited gameplay/campaign behavior,
  rendered UI/UX, and replay-verification/security. The gameplay audit used a
  current-state-only reference controller and an adversarial score farmer. The
  visual audit captured desktop and 390 px-wide browser states. The verifier
  audit traced Maltline against Partition's platform path and threat model.
- **Measurement:** The reference controller cleared all eight stages in 14,120
  active ticks (3:55) or about 4:11 including transitions. A legal stage-one
  farmer remained running at tick 50,000 with 180,975 points and 807 serves.
  At 390 px wide, essential 10–12 px canvas labels render at roughly 4–5 CSS px.
- **Observation:** Duration and score are presently unbounded for successful
  adversarial play, while normal expert completion is below the desired range.
  Display cadence affects tick advancement. Visual scenery is cohesive, but
  actionable state and failure causes are under-signaled. The replay embeds
  client-authored scenario/run/final data and has no authoritative Maltline
  verification route.
- **Decision:** Preserve the current visual identity. Before campaign tuning,
  fix/test the clock, unique scoring/customer resolution, fatal-tick semantics,
  and deterministic presentation inputs. Then check in telemetry and build the
  input-only verifier path. Do not pad campaign counts until telemetry can show
  what each added minute contributes.
- **Tasks:** P0-02 through P0-10, P1-01 through P1-08, P3-01 through P3-06

## EXP-006 — Fixed-step clock invariance

- **Date:** 2026-09-10
- **State:** First product change after the inherited `9058307` baseline
- **Hypothesis:** A persistent fractional accumulator can make simulation time
  independent of display refresh while keeping catch-up work bounded.
- **Procedure:** Extract `FixedStepClock`, integrate it into the browser loop,
  and feed exact 10-second timestamp schedules at 30, 60, 90, 120, and 144 Hz,
  plus jitter, a one-second hitch, reset, and tick-rate-change cases.
- **Measurement:** Every uninterrupted cadence produced exactly 600 ticks with
  zero dropped time. A one-second hitch executed the explicit six-tick maximum
  and reported 900 ms discarded. The focused clock suite passed 9/9; the full
  Maltline suite passed 16/16; the production build passed.
- **Observation:** Retaining fractional time fixes both high-refresh stalls and
  low-refresh slowdown. Making dropped backlog observable distinguishes an
  intentional lag policy from silent clock loss. The browser now records one
  input per actual engine tick, stops a frame's loop after terminal state, and
  clears old stage replays on a fresh run.
- **Decision:** Adopt the accumulator as the viewer clock baseline. Ranked wall
  time and visibility/pause policy still require a server challenge contract;
  this experiment only establishes correct active simulation cadence.
- **Tasks:** P0-07, P3-01, P3-02

## EXP-008 — Deterministic presentation dependencies

- **Date:** 2026-09-10
- **State:** Renderer behavior from `9058307`, with dependency injection only
- **Hypothesis:** Presentation time and entropy can be controlled for visual
  fixtures without changing the live aesthetic or authoritative simulation.
- **Procedure:** Route particle generation, screen shake, and the washing-jar
  pulse through optional renderer dependencies for random values and exact
  presentation time. Record Canvas commands for fixed state/event/seed/time
  combinations.
- **Measurement:** Two same-seed renderers produced identical command hashes
  after the same 125 ms advancement; a different seed changed the hash.
  Advancing global `Date.now` did not change a frozen injected-clock render,
  while advancing the injected clock by 300 ms did. Focused tests passed 2/2;
  the then-current Maltline suite passed 18/18; production build passed.
- **Observation:** Visual fixtures can now own their clock and RNG. Live callers
  retain the previous defaults. Pixel goldens still require a named state
  fixture route, pinned browser/font, and CSS motion controls.
- **Decision:** Adopt the injected dependencies and proceed to browser fixtures
  rather than masking nondeterministic regions in screenshots.
- **Tasks:** P0-05, P0-10, P2-03, P2-05

## EXP-007 — Finite customer scoring and terminal semantics

- **Date:** 2026-09-10
- **State:** Core engine after EXP-006; campaign parameters unchanged
- **Hypothesis:** Scoring an authored order only once and allowing at most one
  late rescue/requeue preserves the original mechanic while making score and
  customer resolution finite.
- **Procedure:** Track unique fulfillment separately from service actions;
  attach explicit points to serve/catch events; award a customer's serve and
  jar-catch points only for first fulfillment; force exit after its one allowed
  requeue. Track walkouts and total resolutions. Clamp lives and stop all later
  score/life resolution on a fatal tick. Add targeted regression tests.
- **Measurement:** The prior canonical stage-one farming strategy now wins at
  tick 2,266 rather than remaining active past tick 50,000. Seven new scoring
  and resolution tests pass. The combined Maltline suite passes 25/25 across
  four files; production build and whitespace validation pass.
- **Observation:** A rescue service remains possible but cannot inflate score;
  its return catch also awards zero. Event-ledger scoring is now explicit.
  `serviceActions`, `fulfilled`, `walkouts`, `resolved`, and `exited` remove the
  prior state ambiguity. The viewer still uses `exited` for remaining count and
  assumes every serve/catch awards points, so presentation is temporarily
  behind the core contract.
- **Decision:** Adopt unique-order scoring and a single rescue requeue for the
  next playtest baseline. Align the HUD/popups and bump/replace the development
  replay format before treating it as a ranked protocol.
- **Tasks:** P0-08, P0-09, P1-04, P1-06, P3-01

## EXP-009 — Checked-in campaign telemetry baseline

- **Date:** 2026-09-10
- **State:** Engine after EXP-007; original campaign parameters unchanged
- **Hypothesis:** A versioned current-state-only controller and stable metric
  schema can make campaign tuning reproducible instead of anecdotal.
- **Procedure:** Check in the reactive controller used by the audit, a bounded
  per-stage/campaign runner, stable JSON formatting, a CLI command, and tests
  for repeatability, canonical completion, loss attribution, and tick limits.
- **Measurement:** Repeated runs are byte-identical. The canonical campaign wins
  8/8 stages in 14,120 ticks (235.333 active seconds), scores 25,930, retains
  three lives, fulfills/resolves all 108 customers, reaches four simultaneous
  customers and six committed jars, and records no losses. Four telemetry tests
  pass; the then-current full Maltline suite passed 29/29 and build passed.
- **Observation:** Stage pressure valleys are now machine-visible: maximum live
  customers by stage are 2,2,2,3,2,2,4,4, while zero-clean-jar ticks are 0,0,0,
  0,42,0,90,331. A 100,000-tick per-stage ceiling prevents a controller bug from
  hanging the tuning tool.
- **Decision:** Use `npm run telemetry --workspace=@arcadebench/maltline` before
  and after every campaign/rules change. Add delayed/novice/error-injection
  controllers before claiming human difficulty targets.
- **Tasks:** P0-06, P1-01, P1-02, P1-04, P1-08

## EXP-011 — Input-only ranked proof foundation

- **Date:** 2026-09-10
- **State:** Fulfillment-aware engine from EXP-007; platform route not yet added
- **Hypothesis:** A strict input-only proof can make every rankable outcome
  server-derived while bounding verification work and proof size.
- **Procedure:** Define proof v1 as ordered stages of run-length-encoded inputs;
  take campaign/rules/initial context only from the trusted caller; sanitize
  exact keys and runtime types; incrementally replay with 60,000-tick/run hard
  ceilings; reject nonterminal, post-terminal, missing/reordered, and
  post-loss stages; canonicalize adjacent input runs. Bump the richer local
  replay to v2 after its state/event schema change.
- **Measurement:** Twenty-one proof/adversarial tests pass, including a valid
  two-stage carry, terminal loss, authority-field injection, runtime-type
  attacks, campaign ordering, tick/run limits, canonical RLE, and replay v1
  rejection. At that point the full Maltline suite passed 50/50 and build
  passed.
- **Observation:** Score, lives, progress, completion, ticks, fulfillment,
  service actions, and walkouts are now derived from authoritative execution;
  untrusted proof data cannot express scenarios, seeds, events, starting state,
  or final state. This is a core verifier, not yet a secure public submission:
  challenge binding, game/campaign generation, payload byte limits, canonical
  hashing, persistence, concurrency, rate limits, and retention remain platform
  work.
- **Decision:** Adopt the input-only RLE shape. Keep P3-01/P3-02 active until a
  frozen campaign version and server challenge route bind this verifier.
- **Tasks:** P3-01, P3-02, P3-03, P3-04

## EXP-010 — Deterministic browser visual baselines

- **Date:** 2026-09-10
- **State:** Deterministic renderer dependencies from EXP-008; pre-polish art
- **Hypothesis:** Named authored states can provide stable pixel and geometry
  evidence before UI changes begin.
- **Procedure:** Build a test-only fixture entry with seeded presentation RNG,
  exact time/effect age, pinned Noto Sans, disabled CSS motion, and readiness
  signaling. Capture title, first-pour idle, half blend, ready shake, three-lane
  rush, and jar miss at 1280×720. Add 1024×768 shell geometry and 390×844
  support-classification checks using Playwright with pinned settings.
- **Measurement:** Eight browser tests pass with zero differing pixels. The six
  tracked PNG baselines total about 2.0 MiB. The combined unit suite passes
  50/50 across six files and production build passes.
- **Observation:** Human inspection confirms the audit findings: the visual
  world is cohesive, but the left menu/player area overlaps even on desktop;
  active lane/station and ready state are too quiet; the jar-miss fixture shows
  particles without naming the failure; and critical labels are very small.
  Portrait is deliberately classified unsupported rather than mislabeled as
  playable.
- **Decision:** Keep these images as the before-polish baseline. The next visual
  experiment will change actionable hierarchy and failure attribution, then
  deliberately update goldens after side-by-side inspection.
- **Tasks:** P0-05, P1-05, P1-06, P2-01 through P2-05

## EXP-012 — Dependency security baseline

- **Date:** 2026-09-10
- **State:** Dependencies after adding Playwright 1.63.0 and Noto Sans 5.3.0
- **Question:** Do the newly established build/test dependencies introduce a
  production vulnerability or expose existing toolchain debt?
- **Procedure:** Run `npm audit --omit=dev` and the full `npm audit`.
- **Measurement:** The production dependency audit reports zero vulnerabilities.
  The full development tree reports eight advisories (two moderate, six high)
  through Vitest mocking and Cloudflare/Miniflare tooling dependencies,
  including `fast-uri`, `js-yaml`, and `sharp`. Non-forced fixes are available
  for several; the reported `sharp` path suggests a breaking Cloudflare test
  pool change if forced.
- **Decision:** Do not use `--force` during the gameplay tranche. Track a tested
  development-toolchain update separately; keep production risk classified
  distinctly from local/CI tooling exposure.
- **Tasks:** P0-12

## EXP-013 — Technical-debt review 01

- **Date:** 2026-09-10
- **State:** Combined EXP-006 through EXP-011 implementation; 50 unit tests and
  8 browser tests green
- **Question:** Did the first architecture tranche introduce cross-layer drift,
  false confidence, or boundaries that should be repaired before more features?
- **Procedure:** Three agents cross-reviewed engine/telemetry, viewer/visual
  harness, and proof/verifier code, including code outside their original edit
  ownership. They reran build/tests/telemetry and performed adversarial and
  performance probes without modifying product code.
- **Measurement:** The verifier processed a 60,000-tick single-run proof in
  about 45.95 ms and a 60,000-input-run worst shape in about 72.19 ms on the
  current Node 22 environment; worst-shape JSON was about 3.83 MiB. All 50 unit
  and 8 browser tests still passed, and telemetry remained 14,120 ticks.
- **Observation:** Green tests missed a renderer/core contract regression:
  repeat service/catch events display invented points, and the HUD uses exits
  rather than total resolutions. Engine scenarios remain mutable and only
  minimally validated. Telemetry lacks immutable controller/rules identity.
  Proof meaning is not yet bound to game/campaign generations; context
  validation is incomplete; hashing/transport/Worker limits are undefined; and
  proof verification snapshots state redundantly per tick. Some invariant tests
  construct private or unreachable state. Visual fixtures differ from the
  production shell/font, do not reset transient effects, and do not yet fail on
  browser console/resource errors.
- **Decision:** Fix correctness and identity boundaries before tuning or art
  expansion. Defer splitting the 1,324-line renderer and small-array performance
  work until the interaction language stabilizes. Keep rich replay parsing
  explicitly local-only.
- **Tasks:** P0-13 through P0-17, P3-08 through P3-10

## EXP-014 — Scenario authority and telemetry provenance

- **Date:** 2026-09-10
- **State:** Engine/telemetry after TD-01; campaign parameters unchanged
- **Hypothesis:** One normalized immutable scenario boundary plus complete
  provenance makes engine behavior mutation-proof and tuning output attributable.
- **Procedure:** Validate every scenario/run field and fixed-point domain; clone
  and deeply freeze station/config state; centralize deterministic scoring/rule
  constants; add safe-integer score headroom. Advance telemetry to schema v2 and
  fingerprint game, rules, controller behavior metadata, campaign, scenarios,
  and full configuration with canonical FNV-1a/64 identities.
- **Measurement:** Mutation/adversarial tests pass; changing a scenario or
  controller definition changes its identity, while repeated canonical runs are
  byte-identical. Campaign output remains 8/8, 14,120 ticks, 25,930 points.
- **Decision:** Use normalized engine-owned configuration and telemetry v2 as
  the next tuning baseline. Cryptographic proof identity remains SHA-256; the
  faster FNV telemetry fingerprints are labels for experiment provenance, not
  security claims.
- **Tasks:** P0-14, P0-15, P3-08

## EXP-015 — Generation-bound proof and real campaign golden

- **Date:** 2026-09-10
- **State:** Ranked proof foundation after ruleset centralization
- **Hypothesis:** Explicit generations plus a canonical server envelope prevent
  the same input bytes from changing ranked meaning silently.
- **Procedure:** Bind proof and trusted context to game `maltline`, ruleset 2,
  campaign generation 1, and proof/envelope version 1. Canonicalize a strict
  challenge identity and verified proof/summary, hash with Web Crypto SHA-256,
  add derived resolved/exited totals, remove redundant per-tick snapshots, and
  generate a real eight-stage proof from the checked-in controller.
- **Measurement:** The real proof verifies 14,120 ticks, score 25,930, three
  lives, 108 fulfilled/service/resolved/exited, with stable SHA-256
  `35420cc7b0719cf8d3a48a5ac441b22afee60f52ef9203042d58ba781fae5531`.
  Generation/context/tamper/canonicalization tests pass within a generous 2 s
  CPU gate.
- **Decision:** Treat this as the core ranked golden for the current ruleset.
  The public platform still needs challenge issuance, atomic consumption,
  byte/rate/Worker limits, persistence, and retention integration.
- **Tasks:** P3-01, P3-02, P3-03, P3-08, P3-09, P3-10

## EXP-016 — Truthful event feedback and hardened browser checks

- **Date:** 2026-09-10
- **State:** UI aligned to EXP-007 engine events; art direction preserved
- **Hypothesis:** Authoritative event fields and fixed-age failure callouts can
  remove misleading feedback without a wholesale visual redesign.
- **Procedure:** Render event-provided points and fulfillment; label zero-point
  rescue/catch actions; derive `ORDERS LEFT` from resolved customers; add named
  callouts for shake miss, jar miss, and walkout; reset effects at stage/run
  boundaries; make shake movement draw-count independent. Expand Playwright to
  nine desktop goldens, production smoke, runtime/resource/font failures, and
  geometry checks.
- **Measurement:** Human inspection of the 3×3 sheet confirms the three life
  loss labels are readable and aligned, and `RESCUED · 0 PTS` is explicit.
  Twelve browser tests pass with exact pixels. Presentation-focused unit tests
  cover event truth/reset/draw determinism.
- **Decision:** Adopt the truthful feedback baseline. The left control rail,
  active lane/station emphasis, jar labeling, flavor redundancy, responsive
  policy, and first-pour teaching remain the next actual polish work.
- **Tasks:** P0-13, P0-16, P1-05, P1-06, P2-02 through P2-05

## EXP-017 — Combined post-debt-fix gate

- **Date:** 2026-09-10
- **State:** Combined EXP-014 through EXP-016
- **Procedure:** Run the complete monorepo build/test gate, Maltline browser
  visual suite, two independent telemetry commands with byte comparison, and
  whitespace validation.
- **Measurement:** All workspace builds pass. Maltline passes 100 unit,
  invariant, telemetry, renderer, clock, replay, and proof tests; the monorepo
  totals 186 passing tests. All 12 Playwright checks pass. Two telemetry outputs
  compare byte-for-byte and hash to
  `b8156f1374e2ee05fdaa2415638cf38bdc688cec92e0e401683a39ab99ddf088`.
- **Decision:** Correctness tranche is stable enough for the remaining small
  refactor, then controlled game-feel and UI experiments.
- **Tasks:** P0-11, P0-13 through P0-16, P3-08 through P3-10

## EXP-018 — Shared normalization with ranked policy layer

- **Date:** 2026-09-10
- **State:** Scenario authority from EXP-014 and verifier from EXP-015
- **Hypothesis:** The verifier can reuse engine validity rules while keeping
  stricter public resource ceilings explicit and independently testable.
- **Procedure:** Delegate fundamental scenario/run validation to the shared
  normalizers; wrap failures as verifier-domain errors; retain exact trusted
  object shapes; layer named ranked caps for lanes, entities, timing, movement,
  lives, score, and nontrivial campaigns; add parity and divergence tests.
- **Measurement:** Proof suite passes 44/44. Tests cover shared rejection for
  malformed IDs/names/timing/fixed-point/threshold/run values and twelve cases
  accepted by the general engine but rejected by tighter ranked policy.
- **Decision:** Maintain one validity boundary and one visibly separate ranked
  resource policy. Do not duplicate full scenario construction in verifier code.
- **Tasks:** P0-18, P3-02, P3-03

## EXP-019 — Production/fixture visual parity

- **Date:** 2026-09-10
- **State:** Hardened browser checks from EXP-016
- **Hypothesis:** A single shell and bundled font source can make screenshot
  evidence representative without exposing fixture controls to production.
- **Procedure:** Share shell markup and bundled Noto Sans 400/600/700/800 font
  loading between production and fixtures; retain fixture state/RNG/time in
  fixture-only modules; test the production dependency graph and browser DOM,
  font weights, resources, and absence of fixture runtime markers.
- **Measurement:** Unit suite passed 118/118 at this checkpoint; Playwright
  update and exact compare passed 13/13; production build included four WOFF2
  files. Eight changed goldens differed only in text rasterization from the now
  genuine 600 weight; the title was unchanged. The full montage was inspected.
- **Decision:** Adopt the shared shell/font boundary. Future golden changes now
  represent the same layout primitives and typography production uses.
- **Tasks:** P0-16, P2-04

## EXP-020 — Deterministic player-model baseline

- **Date:** 2026-09-10
- **State:** Original campaign knobs, four-life variant simulated only
- **Hypothesis:** Controlled reaction/error profiles can distinguish duration
  pressure from survivability before human calibration.
- **Procedure:** Compare current-state reactive, two-tick delayed competent, and
  seven-tick novice/error controllers across canonical plus four shadow seed
  sets. Fingerprint all behavior parameters; instantiate fresh per stage. Also
  simulate four starting lives without editing the campaign.
- **Measurement:** Reactive won 5/5 at a 235.583 s mean. Delayed competent won
  4/5, averaged 7.8 stages, and winning runs averaged 258.071 s. Novice won 0/5,
  averaged 1.6 stages, and failed after 66.823 s mean. Four lives moved delayed
  to 5/5 and novice to 2.8 mean stages but still 0/5 wins.
- **Observation:** One extra life improves the narrow competent completion edge
  without making repeated mistakes harmless. Expert/competent active wins are
  still under five minutes; transition/reading time may cross five, but the
  desired 5–15 minute experience is not yet established. The novice profile is
  a harsh stress probe, not a human proxy.
- **Decision:** Carry four lives into the first human-facing tuning candidate,
  but evaluate at least 32 seed offsets before locking it. Add meaningful late
  campaign work rather than globally slowing the opening.
- **Tasks:** P1-01, P1-02, P1-04, P1-08, P4-03

## EXP-021 — Thirty-three-seed campaign tuning matrix

- **Date:** 2026-09-10
- **State:** Seven temporary candidates; authored campaign unchanged
- **Hypothesis:** Additional late work with moderated arrival pacing can reach a
  six-minute active expert run without the overload caused by count-only growth.
- **Procedure:** Run reactive, delayed, and novice profiles across the canonical
  seed plus 32 deterministic shadow offsets for baseline lives and five late-
  stage tuning shapes. Preserve every stage 1–3 field. Measure duration, stage
  curve, score/lives, crowd, jar pressure, zero-jar time, and loss reasons.
- **Measurement:** `paced-balanced-4-lives` (stage 4–8 counts 20/20/17/27/31,
  1.20× initial/floor intervals, 0.50× acceleration) produced 33/33 reactive
  wins at 360.775 s mean and 31/33 delayed wins at 369.449 s winning mean; both
  delayed failures reached stage 8 and delayed maximum crowd was 7. Count-only
  light reached only 266.797 s reactive, caused 0/33 delayed wins and crowd up
  to 16. Overpaced heavy reached roughly 500 s with crowd near 2 and no pressure.
- **Observation:** Four lives alone improves delayed completion from 13/33 to
  23/33, not the earlier small sample's 5/5. The balanced candidate enters the
  desired duration band while retaining a late skill boundary, but stages 4–6
  become longer more than denser and may feel repetitive to humans.
- **Decision:** Promote paced-balanced/four-lives to the next playable candidate
  and increment campaign generation. Do not freeze it until visual teaching and
  human sessions evaluate pacing. Keep optional deterministic `waveBreaks` as a
  separate future experiment if even spacing feels flat.
- **Tasks:** P1-02, P1-04, P1-08, P3-01, P4-03

## EXP-022 — Play-critical UI and accessibility pass

- **Date:** 2026-09-10
- **State:** Truthful renderer and shared production/fixture shell from EXP-019
- **Hypothesis:** Replacing decorative space with persistent action, lane,
  flavor, and jar cues will make the core loop readable without changing the
  established diner art direction or deterministic simulation.
- **Procedure:** Separate the player from a numbered window rail; outline the
  active lane and station; add selected/blending/ready/no-jar action states, a
  real blend bar, clean/washing jar counts, and V/C/S cues. Share honest stage-
  clear copy, implement renderer and CSS reduced-motion behavior, and show an
  explicit keyboard/wider-window message below 700 px. Add deterministic
  fixtures, pixel goldens, semantic-control checks, and accessibility assertions.
- **Measurement:** Focused unit/boundary checks pass 12/12, exact-pixel and
  browser accessibility checks pass 18/18, and the production build passes.
  Thirteen representative goldens—including rush, no-clean-jars, reduced-
  motion, stage-clear-with-walkout, and 390×844 unsupported portrait—were
  inspected individually and as a montage with no overlap or clipped copy.
- **Decision:** Adopt this as the first polished gameplay surface. Close the
  HUD, truthful-resolution, reduced-motion, and non-color-cue tasks. First-time
  countdown/teaching and richer event animation remain separate work.
- **Tasks:** P1-06, P2-04, P2-05

## EXP-023 — Promote balanced campaign generation 2

- **Date:** 2026-09-10
- **State:** Winning candidate from EXP-021; ruleset 2 unchanged
- **Hypothesis:** Four lives plus the measured late-stage pacing candidate can
  produce a six-minute expert/competent run while preserving the opening lesson
  and a meaningful closing skill boundary.
- **Procedure:** Preserve stages 1–3 except the run-wide life count. Author
  stage 4–8 customer/initial/floor/acceleration tuples as `20/180/96/3`,
  `20/204/96/2`, `17/192/96/2`, `27/144/66/2`, and `31/132/60/2`; increment
  campaign generation to 2; refresh telemetry, player-model, proof, docs, and
  goldens. Keep an immutable generation-1 fixture so EXP-021 remains repeatable.
- **Measurement:** The canonical run verifies at 21,662 ticks (361.033 active
  seconds), score 36,255, 145 fulfilled/resolved, and four lives remaining.
  Its campaign fingerprint is `adc596f1154aeafa`, configuration fingerprint is
  `28ac8864373bc650`, and proof SHA-256 is
  `b0734006aa9753d98c52ae1a6245cb8bcd1bfecb051500cf6299f578fd248e1d`.
  Across 33 seeds, reactive wins 33/33 at 360.775 s mean and delayed competent
  wins 31/33 at 369.449 s winning mean; novice wins 0/33. All 136 tests and the
  build pass at this checkpoint, and repeated comparison output is byte-stable.
- **Decision:** Adopt generation 2 as the next human-playtest candidate, not a
  final balance freeze. Human sessions must determine whether the deliberately
  longer stages 4–6 need authored waves or new decisions rather than more speed.
- **Tasks:** P1-02, P1-04, P1-08, P3-01, P4-03

## EXP-024 — Event-first audio production foundation

- **Date:** 2026-09-10
- **State:** No product audio assets or runtime audio system
- **Hypothesis:** A semantic cue matrix and deliberately gated acquisition path
  can make later sound work coherent, auditable, and safe from accidental paid
  generation without coupling audio to deterministic simulation.
- **Procedure:** Map existing engine/viewer transitions to prioritized diner-
  themed cues; specify buses, voice limits, ducking, reduced-sensory behavior,
  mastering, formats, naming, rights, and provenance. Add a dry-run-by-default
  ElevenLabs scaffold that requires both `--execute` and
  `MALTLINE_AUDIO_GENERATION_APPROVED=YES`, reads its key only from the
  environment, generates sequentially, never overwrites, normalizes with
  recorded ffmpeg commands, hashes all bytes, and writes only to ignored staging.
- **Measurement:** Documentation and tool syntax/help/diff checks pass. Thirty-
  one offline tests cover exact schemas, boundary values, names, duplicates,
  kind/loop pairing, formats, real calendar dates, dry-run non-execution,
  argument parsing, and both execution gates. The configured key is present but
  was never read into output; tests inject a no-network executor and never set
  the approval variable. No paid request, ffmpeg generation, staging directory,
  or Maltline audio file exists. Provider requests cannot reproduce waveforms
  by seed, so selected source hashes are explicitly the release identity.
- **Decision:** Adopt the workflow foundation and keep product audio active.
  Before generating candidates, present a small priced batch and obtain explicit
  confirmation of paid-subscription/commercial-rights basis and spend.
- **Tasks:** P2-06, P2-07, P4-02

## EXP-025 — Combined generation-2 gate and TD-02 review

- **Date:** 2026-09-10
- **State:** EXP-022 UI, EXP-023 campaign, and EXP-024 audio foundation combined
- **Procedure:** Run all workspace builds and tests, Maltline exact-pixel/browser
  checks, duplicate telemetry and 33-seed comparison commands with byte
  comparison, whitespace validation, and independent gameplay, viewer, and
  verification/audio debt reviews.
- **Measurement:** All workspace builds pass. The monorepo passes 253 tests,
  including Maltline 167/167; Playwright passes 18/18. Duplicate telemetry and
  player-model outputs compare byte-for-byte. Canonical telemetry remains
  21,662 ticks, 361.033 seconds, score 36,255, 145 resolved, and four lives.
  The reviews found no new core arithmetic/terminal defect, but reproduced a
  tuning-fingerprint collision and identified false narrow-screen pause,
  font-startup failure, semantic/input ownership, mutable campaign authority,
  unsafe authoritative helper composition, Worker resource/lifecycle, and paid-
  acquisition state-machine gaps.
- **Decision:** Keep generation 2 and the polished pixels as the human-test
  candidate, but reopen accessibility completion and do not claim ranked,
  production-web, or paid-audio readiness. Repair browser truth, tuning identity,
  input/authority composition, and audio spend safety in bounded refactor
  tranches before expanding those surfaces.
- **Tasks:** P0-20 through P0-24, P2-05, P2-08 through P2-12, P3-11 through P3-14

## EXP-026 — Complete tuning provenance identity

- **Date:** 2026-09-10
- **State:** TD2-G03 reproduced different outcomes under one EXP-021 fingerprint
- **Hypothesis:** Fingerprinting normalized inputs and effective campaigns can
  make tuning evidence collision-sensitive without changing measured outcomes.
- **Procedure:** Bump tuning output to schema 2; retain the legacy schema-1
  identity explicitly; bind game/rules, normalized baseline, initial-run policy,
  tick limit, ordered seeds, controller and candidate metadata, transforms, and
  every seed-adjusted effective campaign. Snapshot definitions before execution
  and reject duplicate identities and invalid run/limit inputs.
- **Measurement:** Exhaustive tests mutate all 23 scenario fields and every
  rules field plus run, limit, seed, controller, candidate, and transform data.
  The new identity is `fnv1a64:ca3ebefefc0b4582`; legacy EXP-021 remains
  `fnv1a64:da093358d25348ae`. Two full outputs compare byte-for-byte with SHA-256
  `698cac7866232b4974188cd1f32388582078f0659acaa313124ce85462636d5f`,
  and every outcome distribution remains unchanged.
- **Decision:** Adopt schema 2 for new tuning evidence and keep schema 1 only as
  a labeled historical record. This hash is reproducibility evidence, not a
  security primitive.
- **Tasks:** P0-23, P1-02, P1-08

## EXP-027 — Truthful timing pause and semantic interaction boundary

- **Date:** 2026-09-10
- **State:** TD2-G01/G02 and TDV2-01/02 release-boundary findings
- **Hypothesis:** Viewer-only eligibility, explicit session transitions, and a
  semantic shell can fix timing/focus/accessibility truth without changing the
  engine or approved gameplay pixels.
- **Procedure:** Interrupt before further input/ticks on dropped backlog, blur,
  hidden document, or unsupported width; clear held input and clock/frame
  anchors and resume only as unranked. Stop hidden-width draws. Scope keys to a
  focusable game root while ignoring editable controls. Add coherent inert/ARIA
  surfaces, dialog focus, non-live state text, prioritized event announcements,
  and diagnosed font timeout/fallback.
- **Measurement:** Maltline unit coverage passes 213/213 in the settled tree and
  Playwright passes 25/25, including hitch, background, 699/700, input/focus,
  event-throttling, and font-failure cases. All thirteen prior PNG hashes are
  byte-identical; the new keyboard-focus golden was inspected and shows a clear
  unobtrusive 3 px boundary.
- **Decision:** Adopt the session/accessibility boundary and close the scoped
  timing, font, unsupported-width, and semantic-control findings. Eligibility
  remains presentation/session metadata until the future submission route
  explicitly refuses ranked upload after interruption.
- **Tasks:** P0-21, P0-22, P2-05, P2-08, P2-09

## EXP-028 — Paid-audio acquisition state machine

- **Date:** 2026-09-10
- **State:** Dry-run and double gate from EXP-024; TD2 A1–A3 execution blockers
- **Hypothesis:** Exact-plan approval, pre-request reservation, durable state,
  bounded transport, and no-fetch resume can prevent duplicate spend and retain
  auditable evidence across failures.
- **Procedure:** Canonicalize/hash plans; require a ≤24-hour exact JSON approval
  with asset/second/credit ceilings; validate current rights review and a closed
  cue vocabulary; preflight paths/tools and lock the whole plan; journal each
  lifecycle step append-only; persist source/hash/provider receipt before
  normalization; make resume source-only; bound requests to 60 s and 16 MiB;
  reject encoding/type/signature/decode failures and never retry a paid POST.
- **Measurement:** Sixty-two offline tests cover validation, plan/budget/expiry,
  existing paths, concurrency, locks, journals, bounded response streaming,
  timeouts, provider failures, crash points, recovery, and credential secrecy.
  Full settled-tree Maltline tests and build pass. No approval environment was
  set, no real network or ffmpeg generation occurred, ignored staging is absent,
  and no audio file exists.
- **Decision:** Adopt the acquisition state machine and close its tooling safety
  task. Product audio remains incomplete and paid generation still requires the
  owner to confirm commercial-rights basis and approve one exact priced batch.
- **Tasks:** P2-06, P2-12, P4-02

## EXP-029 — Post-refactor combined gate

- **Date:** 2026-09-10
- **State:** EXP-026 through EXP-028 integrated
- **Procedure:** Run every workspace build and test, the full Maltline browser
  suite, duplicate raw telemetry/tuning commands with byte comparison, visual
  inspection of the only new golden, whitespace validation, and an absence check
  for audio staging/assets.
- **Measurement:** All workspace builds pass and the monorepo passes 299 tests,
  including Maltline 213/213. Playwright passes 25/25. Tuning output repeats at
  SHA-256 `698cac7866232b4974188cd1f32388582078f0659acaa313124ce85462636d5f`;
  canonical telemetry repeats at
  `450e81685c2934dbefb15ae4f233f2970b7a950cb117cfea20c9ee07aa499aa7`.
  No whitespace issue, audio staging directory, or Maltline audio asset exists.
- **Decision:** Treat this boundary/refactor tranche as stable. The next work
  should normalize runtime input and establish immutable registered campaign
  authority before any Worker integration, while first-time play flow and human
  balance evaluation proceed independently.
- **Tasks:** P0-21 through P0-23, P2-05, P2-08, P2-09, P2-12

## EXP-030 — Bounded audio direction proposal

- **Date:** 2026-09-10
- **State:** Safe acquisition state machine exists; no generation authorized
- **Hypothesis:** A small cross-section of UI, machinery, success, and failure
  sounds can validate the acoustic direction before funding the full cue matrix.
- **Procedure:** Specify two exact candidates each for station navigation, blend
  loop, served order, and smashed return jar; predeclare prompts, controls,
  loudness targets, blind-review procedure, technical/semantic rejection gates,
  and fail-closed plan/approval templates.
- **Measurement:** The proposed eight requests total exactly 6.0 requested
  seconds and a conservative 120 credits. Both JSON templates parse but reject
  by design until the owner truthfully fills rights/date and exact-hash approval
  fields; substituting rights/date in memory validates the acoustic fields and
  recomputes 8/6/120. No network, ffmpeg, environment, or asset action occurred.
- **Decision:** Use this batch only after explicit owner confirmation of paid
  commercial rights, current terms/sublicensing setting, original prompts, and
  the exact 120-credit ceiling. A passed direction still needs broader candidate
  selection, mastering, provenance review, and runtime implementation.
- **Tasks:** P2-06, P2-13, P4-02

## EXP-031 — Strict shared input boundary

- **Date:** 2026-09-10
- **State:** TD2-G08 found runtime/controller inputs trusted outside proof parsing
- **Hypothesis:** One exact primitive normalizer can protect every engine entry
  point while leaving all legal proof and telemetry bytes unchanged.
- **Procedure:** Require exactly four own enumerable data fields, directions in
  `-1/0/1`, booleans for actions, no symbols/extras/accessors, and a defensive
  frozen copy. Use the boundary in engine, proof encode/verify, rich replay, and
  controllers; cache only internally normalized controller combinations.
- **Measurement:** Adversarial tests cover nonobjects, missing/extra/non-
  enumerable/symbol fields, all invalid numeric/type values, getters without
  invocation, source mutation, malformed controllers, and pre-tick engine
  immutability. The full Maltline suite passes 259/259 at this checkpoint.
  Canonical proof SHA remains
  `b0734006aa9753d98c52ae1a6245cb8bcd1bfecb051500cf6299f578fd248e1d`,
  and duplicate telemetry output remains byte-identical.
- **Decision:** Adopt the shared normalizer with no protocol generation bump;
  legal semantics and canonical bytes did not change.
- **Tasks:** P0-24, P3-03

## EXP-032 — First-time arcade flow

- **Date:** 2026-09-10
- **State:** Polished gameplay surface without an authored teaching/progression flow
- **Hypothesis:** One concise lesson plus stage-specific skill cards and a
  presentation-only countdown can make Maltline self-explanatory without
  weakening deterministic replay or forcing long instructions between stages.
- **Procedure:** Define the eight-stage learning arc and implement title,
  instruction, stage card, 3/2/1/SERVE countdown, play, truthful stage clear,
  game over, victory, and clean restart. Gate all simulation/input recording
  behind live play, cancel/re-anchor countdown across focus/width interruptions,
  and share semantic presentation helpers with deterministic fixtures.
- **Measurement:** At the settled pre-authority checkpoint, Maltline passes
  259/259 unit/invariant tests and 33/33 Playwright checks. New instruction,
  stage-card, countdown, game-over, and victory goldens plus intentional title
  and stage-clear updates were inspected; non-overlay gameplay goldens remain
  byte-identical. Tests prove overlays/countdowns add zero ticks and inputs and
  terminal restart rebuilds Stage 1 at tick/input zero.
- **Decision:** Adopt the flow as the human-test baseline. Its presentation
  pauses add roughly tens of seconds to a successful run but do not alter the
  measured 361-second active simulation; human wall-clock timing remains the
  authority for the final 5–15 minute claim.
- **Tasks:** P1-01, P1-05, P4-03

## EXP-033 — Immutable generation-2 authority and single verification facade

- **Date:** 2026-09-10
- **State:** TD2 R1/R3/G1 authority-composition blockers; proof v1/ruleset 2/campaign 2
- **Hypothesis:** A registered frozen configuration plus one verify-and-hash API
  can prevent numeric-generation drift and structurally fabricated summaries
  while preserving the input proof protocol.
- **Procedure:** Register exact game/rules/RNG/schema/campaign/initial-run/ranking
  data under a recomputed SHA-256 digest; deep-freeze normalized stage snapshots;
  add the digest to envelope v2; resolve it inside a sole public facade; harden
  canonical JSON against accessors, cycles, exotic objects, symbols, nonfinite
  values, and excess depth. Pin static controller-independent win, idle-loss,
  and mistake/life-carry proofs separately from dynamic solvability tests.
- **Measurement:** Configuration SHA-256 is
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`.
  The static win envelope hashes repeatedly to
  `59c225436dd9a567e11142dee5564ddbf63278f5f45544a56706726bf929476d`;
  loss and mistake vectors also verify exact derived summaries/hashes. Fifty-six
  focused authority/proof checks and the full Maltline 270-test suite pass.
- **Decision:** Adopt authority schema 1 and envelope 2. Keep proof v1, ruleset
  2, and campaign generation 2 because legal simulation/input semantics did not
  change. Remove generic context verification and structural envelope builders
  from the package root; keep the named context verifier only for internal tests.
- **Tasks:** P3-01, P3-03, P3-11, P3-13

## EXP-034 — First-flow and authority combined gate

- **Date:** 2026-09-10
- **State:** EXP-030 through EXP-033 integrated
- **Procedure:** Inspect all new/changed flow goldens and authority boundaries,
  run all workspace builds/tests, run the full exact-pixel/browser suite, and
  validate whitespace plus preserved user-owned files/artifacts.
- **Measurement:** Every workspace build passes. The monorepo passes 356 tests,
  including Maltline 270/270; Playwright passes 33/33. Title, lesson, stage card,
  countdown, stage clear, game over, victory, and focus frames were inspected.
  No audio staging/assets were created, and the pre-existing Partition sitemap
  and unrelated untracked workspace data remain untouched.
- **Decision:** Treat the self-teaching viewer, strict input boundary, and
  registered proof core as a stable integration candidate. Run TD-03 now, then
  resolve its actual blockers before adding the public Worker route.
- **Tasks:** P0-24, P1-01, P1-05, P2-13, P3-11, P3-13

## EXP-035 — Third technical-debt and release-boundary review

- **Date:** 2026-09-10
- **State:** EXP-034 stable integration candidate before public platform work
- **Procedure:** Independently audit gameplay/control validity, viewer flow and
  built-artifact accessibility, and verifier/platform/audio trust boundaries;
  rerun the full Maltline unit, build, browser, telemetry, whitespace, and
  artifact-absence checks; adversarially measure expanded proof transport.
- **Measurement:** Maltline passes 270/270 unit tests, 33/33 Playwright checks,
  production build, canonical telemetry, and whitespace validation. The core
  facade and static vectors remain sound. Reviewers reproduced a warmed-cache
  invalid-input collision and mutable live-campaign/verifier drift. They also
  found misleading catch/final-life copy, phase-dependent short taps, timed
  flow announcement and stale-callback debt, and the absence of Maltline from
  the assembled site. A legal 21,662-record uncompressed proof measured
  1,445,121 JSON bytes and about 54.77 ms facade-only in local Node, versus
  roughly 58 KiB for canonical RLE. No paid audio or product asset exists;
  direct-call plan validation, symlink containment, and runtime Ogg probing
  remain required before acquisition or promotion.
- **Decision:** Keep generation 2 as the local human-test candidate, but block
  public ranked and accessibility claims. First repair input-cache validation,
  converge viewer/telemetry on the frozen registered campaign, and correct
  player-facing copy. Then address deterministic input buffering, timed flow,
  exact built-site smoke, explicit nonce-versus-gameplay-seed policy, measured
  Worker budgets/storage, and paid-audio containment in bounded tranches.
- **Tasks:** P0-25 through P0-27, P1-03, P1-07, P2-14 through P2-16, P3-02,
  P3-12, P3-14, P4-01

## EXP-036 — TD-03 correctness, control, and accessibility repairs

- **Date:** 2026-09-10
- **State:** TD-03 reproduced two correctness faults and bounded viewer truth,
  control, and challenge-policy blockers
- **Procedure:** Validate controller primitives before cache lookup; make the
  frozen registered authority campaign the single viewer/telemetry/verifier
  default and self-check its pinned SHA-256 at the async facade; rename the
  fixed-campaign challenge field from `seed` to `nonce`; correct jar/life copy
  and first-interruption causality; add semantic flow announcements, explicit
  stage-clear advance, overlay ownership, and a tick-driven direction adapter.
- **Measurement:** All 36 legal controller objects remain frozen/reused while
  warmed invalid collisions reject. Authority SHA-256 stays
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`.
  Envelope v3 static hashes are win
  `ab2661e514950db79b159aa4342cc61b2f6feba8b7aca4a80346112379d1660f`,
  loss `f703bc8f898c1533fca2a71d3ca576ce400b2f27662d461d74597bf0df771d47`,
  and mistake
  `ece5b627396f87fc795974ddf492e4950a6028f0d3e37a8b98ddad6943359736`;
  proof v1/ruleset 2/campaign 2 are unchanged. Modulo-5 taps move once,
  held directions wait 15 ticks then repeat every 5, and 30/60/144 Hz emit the
  same inputs. Stage clear remains frozen until explicit advance. Maltline
  passes 309/309 unit and 37/37 exact browser checks with no new pixel changes.
- **Decision:** Adopt the fixes and the honest fixed-campaign nonce policy.
  Nonce binding is not proof of human or post-challenge play; the future Worker
  must enforce session ownership, expiry, atomic one-use consumption, and rate
  limits. Keep serve buffering and generation-safe flow extraction active as
  separate replay-edge/refactor work.
- **Tasks:** P0-26, P0-27, P1-03, P1-07, P2-14, P2-15, P3-12

## EXP-037 — Built route, Worker resource boundary, and audio containment

- **Date:** 2026-09-10
- **State:** TD-03 site, transport/resource, and paid-audio blockers
- **Procedure:** Give Maltline a route-scoped Vite base and assemble only its
  production entry/assets under `/maltline/`; validate referenced assets and
  fixture exclusion. Replace whole-body JSON materialization with a decoded-byte
  bounded stream and reject unsupported encodings. Exercise the public Maltline
  verifier in workerd using static and adversarial proof shapes. Revalidate and
  freeze every direct audio execution plan and enforce realpath/no-symlink
  containment throughout the offline acquisition lifecycle.
- **Measurement:** The exact assembled route returns 200 with all four fonts
  loaded and no console, page, request, or HTTP resource failures. Workerd
  measures the canonical win input/envelope at 58,016/58,525 bytes, loss at
  187/684, mistake at 60,064/60,573, and the accepted per-tick-segmented win at
  1,445,121 input bytes; canonical and segmented hashes match. Tests pin 60,000
  raw-run/stage-tick/total-tick gates and one-over rejection, with CI size
  ceilings of 75 KB canonical and 1.6 MB segmented. Audio direct-call,
  traversal, symlink, parent-swap, and special-file cases reject before paid
  fetch or out-of-root mutation. No credentials, network, ffmpeg, staging, or
  audio assets were used. The settled monorepo passes 416/416 tests and every
  workspace build; telemetry repeats at
  `450e81685c2934dbefb15ae4f233f2970b7a950cb117cfea20c9ee07aa499aa7`
  and tuning at
  `698cac7866232b4974188cd1f32388582078f0659acaa313124ce85462636d5f`.
  One deliberately oversubscribed parallel gate pushed the tuning test past
  its 5-second harness timeout; the immediate isolated monorepo rerun passed.
- **Decision:** Close the built-route integration blocker and audio A1/A2, and
  adopt the streaming/resource tests as the platform baseline. Do not call the
  leaderboard complete: Maltline-specific server challenges, D1/R2 recovery,
  total ranking order, concurrent submission tests, and final request/CPU
  budgets remain. Do not promote audio until runtime Ogg probe/size checks and
  the owner's explicit paid-rights/spend approval are complete.
- **Tasks:** P2-16, P3-02, P3-04, P3-14, P4-01, P4-02

## EXP-038 — Fourth technical-debt and integration review

- **Date:** 2026-09-10
- **State:** EXP-036/037 settled after four correctness/release tranches
- **Procedure:** Independently audit gameplay/control evidence, viewer/visual
  and assembled-site behavior, and verifier/platform/audio boundaries; rerun
  focused unit/workerd/browser/build/site/hash checks and adversarially exercise
  native key repeat plus adapter-mediated controller intent.
- **Measurement:** No deterministic engine, proof, authority, nonce-claim,
  campaign-source, streamed-reader, or audio A1/A2 regression was found. A live
  initial Enter followed only by native repeat events crossed title, lesson,
  stage card, countdown, and play, so manual flow ownership is not yet true.
  Serve taps and pre-READY holds remain lossy. Existing raw player models bypass
  the shipped adapter; an audit-only adapter-mediated reactive run lost in
  Stage 7 while delayed-competent won, proving those evidence classes are not
  interchangeable. The assembled route remains clean, but neither exact
  Playwright nor built-route browser smoke is a pinned CI gate. Ranked release
  remains blocked on Maltline-specific challenge/submission routing, forward D1
  authority/ranking schema, a recoverable concurrency-tested D1/R2 saga, and a
  composed transport/CPU/admission budget. Runtime Ogg validation alone remains
  the tooling blocker to audio promotion.
- **Decision:** Fix native repeat and serve edges before decision-grade human
  tuning; add separately versioned adapter-mediated models without rewriting
  raw historical probes. Activate pinned visual CI and built-route smoke. Build
  the ranked platform from an explicit pending/ready/failed persistence design,
  not by copying Partition's R2-before-D1 ordering. Keep FlowController,
  renderer splitting, touch support, CSP, score-ledger/recovery, and timer
  semantics as bounded follow-ups with their stated launch conditions.
- **Tasks:** P0-28, P0-29, P1-03, P1-07, P1-09, P2-10, P2-15, P2-16, P3-02,
  P3-04, P3-14, P3-15

## EXP-039 — TD-04 input, evidence, visual-CI, and persistence foundations

- **Date:** 2026-09-10
- **State:** TD-04 immediate control/CI blockers repaired; ranked persistence
  implementation remains active
- **Procedure:** Consume native keyboard repeat at the presentation boundary;
  latch fresh serve intent across blending/holding using pre-step state; mediate
  physical-intent models through the exact shipped direction/serve adapter;
  pin Playwright, browser, platform, fonts, and baseline inventory; run exact
  visual checks plus an automated assembled-site smoke in CI. Add a forward-only
  Maltline D1 schema and shared authority-derived total ranking comparator with
  explicit pending/ready/failed persistence states and deterministic R2 keys.
- **Measurement:** One held Enter/Space/R cannot cascade presentation screens,
  advance stage clear twice, or restart repeatedly. Fresh serve taps survive
  blend completion and emit exactly once; idle presses are discarded and a
  forced-false cycle rearms the latch. Across 33 seeds, the versioned mediated
  profiles finish 0/33 reactive, 30/33 delayed-competent, and 0/33 novice runs,
  with stable fingerprint
  `2fba231bf50f2cd74c1366c72de85b16d255139baa3516a873b3cc92a8765987`;
  emitted inputs replay byte-identically. Nineteen exact PNGs were regenerated
  only for the pinned Chrome-for-Testing 153 text raster and inspected as a
  complete contact sheet. The full repository passes 436/436 tests, including
  324 Maltline and 39 platform tests; exact Playwright passes 40/40, the
  assembled `/maltline/` smoke passes, and local Wrangler dry-run resolves the
  Worker bundle and bindings without a remote operation. Duplicate hashes match
  for telemetry
  `450e81685c2934dbefb15ae4f233f2970b7a950cb117cfea20c9ee07aa499aa7`,
  tuning
  `698cac7866232b4974188cd1f32388582078f0659acaa313124ce85462636d5f`,
  and mediated evidence. No audio product/staging artifact was created.
- **Decision:** Close native-repeat, shipped-adapter buffering/evidence, and
  pinned visual/site-CI tasks. Adopt the additive Maltline schema and comparator
  as the persistence foundation, but do not call ranked storage complete until
  the Worker challenge/submission route implements one-use D1 transactions,
  R2 promotion/compensation, reconciliation, retention, and concurrent failure
  injection. Keep raw historical controller evidence distinct from mediated
  physical-intent evidence; neither is a substitute for human playtesting.
- **Tasks:** P0-29, P1-03, P1-07, P1-09, P2-10, P3-02, P3-04, P3-14, P3-15

## EXP-040 — Authority-bound Worker route and recoverable proof saga

- **Date:** 2026-09-10
- **State:** Generation-2 server challenge, submission, ranking, and proof
  retention tranche implemented after the TD-04 persistence design
- **Procedure:** Add a Maltline-specific Worker API for fixed-authority arcade
  challenges, input-only proof submission, and ready-only leaderboard reads.
  Verify and canonicalize the proof before accepting it; atomically consume the
  one-use challenge and insert a pending verifier-derived score in one D1 batch;
  retain the exact envelope at its deterministic R2 key using a conditional
  write and SHA-256 checksum; then move the row to ready. Exercise duplicate and
  concurrent requests, transient puts, exact/missing reconciliation, object
  collision, archived-season admission, request size/origin checks, retention,
  and a barrier-controlled retry-versus-reconciler race in workerd.
- **Measurement:** The route accepts no client score or summary fields. Its D1
  season predicate is inside the consuming transaction, exactly one concurrent
  claim wins, identical retries repair a pending object, and mismatched objects
  terminally fail without ranking. A monotonic pending-row upload lease plus
  compare-and-set state transitions prevents stale reconciliation from failing
  an active retry; terminal-only cleanup cannot orphan a later pending write.
  The focused integration matrix passes 8/8 repeatedly and the platform passes
  47/47 tests. The full repository passes 444/444 tests and every workspace
  build; exact Playwright passes 40/40, the assembled route smoke passes, and a
  local Wrangler 4.124.0 dry-run resolves 31 assets plus D1, R2, AI, both rate
  limiters, and assets at 214.89 KiB/47.59 KiB gzip without remote mutation. No
  audio artifact was created.
- **Decision:** Close the public server-verifier route, adversarial verifier,
  fixed-campaign fairness-policy, and recoverable persistence tasks. Keep the
  broader competition task active until the Maltline browser records/submits
  proofs, renders ranking and submission states, and can inspect retained
  replays. Keep launch blocked on a non-session-rotatable edge abuse control
  and measured production-equivalent CPU/admission capacity; the current
  session limiter remains defense in depth, not the sole public abuse boundary.
- **Tasks:** P3-02 through P3-06, P3-14, P3-15

## EXP-041 — Ranked-platform technical-debt review

- **Date:** 2026-09-10
- **State:** EXP-040 complete and fully gated before browser competition work
- **Procedure:** Independently audit Worker routing, authority reconstruction,
  atomic D1 admission, conditional R2 retention, retry/reconciliation races,
  terminal cleanup, season closure, request bounds, scheduled isolation, and
  unchanged Partition behavior. Reproduce each counterexample found during
  implementation and review the repaired tree after its barrier tests pass.
- **Measurement:** `audits/TECH-DEBT-05-VERIFICATION.md` records eight repaired
  issues and finds no remaining correctness blocker in the current server
  tranche. The settled full gate is 444/444 tests, 40/40 exact browser checks,
  assembled-route smoke, workspace builds, whitespace validation, and local
  Wrangler dry-run. The audit leaves four explicit hardening items: a
  different-valid-proof admission race, ambiguous R2/final-CAS fault injection,
  documented concurrent `202` semantics, and non-session-rotatable admission
  plus production-equivalent CPU capacity.
- **Decision:** Treat the D1/R2 state machine as the stable server foundation
  and make its residual assurance items part of P3-14/P3-04 rather than silently
  broadening the completed saga. Do not enable public ranked writes until edge
  abuse and composed capacity gates pass; proceed next with browser proof,
  submission-state, leaderboard, and replay-inspection architecture.
- **Tasks:** P0-30, P3-04, P3-14

## EXP-042 — In-memory browser proof and live Shift Board

- **Date:** 2026-09-10
- **State:** Generation-2 competition connected from live input through the
  same-origin browser client
- **Procedure:** Add an authority-ordered, memory-only ranked-proof recorder;
  a strict bounded challenge/list/submit client; and an accessible competition
  controller/panel. Start a fresh one-use challenge with each attempt, capture
  the exact shipped-adapter input before every engine tick, finalize only a
  loss or complete campaign, discard proof on timing interruption, and keep
  ordinary localhost visual runs network-free behind a development-only mocked
  preview switch. Drive canonical loss and all eight winning stages through
  the production viewer, and replay the emitted full-campaign proof through
  the public verification facade.
- **Measurement:** The browser never writes proof state to localStorage,
  sessionStorage, or IndexedDB and sends no client-authored score or summary.
  The complete shipped-input campaign verifies to 36,255 points, four lives,
  eight cleared stages, 21,662 ticks, and 145 fulfilled/exited customers.
  Terminal Enter/R protects the proof—including the final Stage 8 clear—until
  accepted or explicitly discarded. A delayed board response preserves the
  callsign draft; moderation 400 stays editable; a consumed 202 retries after
  local expiry; accepted copy uses the server-returned score/name; timing and
  preflight failures produce visible practice-only results. The settled tree
  passes 388/388 Maltline tests and 508/508 tests across all workspaces. Exact
  Playwright passes 52/52 before the final review additions, including the
  full-campaign verifier path, with no old golden drift.
- **Decision:** Close live proof recording and browser leaderboard UX. Keep the
  umbrella competition task active for retained replay inspection and a
  composed browser-to-real-Worker smoke. Preserve explicit public-launch blocks
  for edge abuse/capacity evidence, and add stable error codes plus direct stale
  completion barriers as bounded follow-ups.
- **Tasks:** P3-04, P3-16, P3-17, P3-18, P3-19

## EXP-043 — TD-06 browser competition repair and visual lock

- **Date:** 2026-09-10
- **State:** EXP-042 independently reviewed and repaired before replay-viewer work
- **Procedure:** Re-audit gameplay lifecycle, proof/transport authority, async
  races, modal accessibility, responsive policy, and enabled public visuals in
  three independent TD-06 reports. Reproduce each counterexample, repair the
  live tree, and add reviewed exact images for the enabled trigger, eligible
  panel, accepted 700px panel, and browse-only 390px board.
- **Measurement:** The review repaired silent proof loss on restart, unknown
  preflight failure, invalidation proof retention, post-expiry pending retry,
  browser-authored accepted copy, callsign draft loss, indiscriminate error
  retry, modal busy/live-region scope, stale reopen announcements, opaque
  trigger semantics, color-only current-player meaning, and a 700px practice
  disclosure layout shift. Controller status changes now republish composed
  eligibility without waiting for animation frames. All four new PNGs were
  inspected at source resolution and pinned in the browser/image manifest.
  `audits/TECH-DEBT-06-GAMEPLAY.md`, `TECH-DEBT-06-VERIFICATION.md`, and
  `TECH-DEBT-06-VISUAL.md` record the evidence and residuals. No audio or remote
  artifact was created.
- **Decision:** Treat the browser proof and Shift Board slice as settled. The
  remaining verification debt is machine-readable 400 taxonomy, direct stale
  async barrier coverage, the composed real-Worker browser smoke, and retained
  replay inspection; none permits a browser-authored score to rank.
- **Tasks:** P0-31, P3-04, P3-18, P3-19

## EXP-044 — Fail-closed error taxonomy and async replacement barriers

- **Date:** 2026-09-10
- **State:** TD-06 verification residuals P3-18 and P3-19 closed
- **Procedure:** Give Maltline invalid-proof and callsign-rejection HTTP 400
  responses distinct exact machine codes; parse only the closed code/status
  combinations; reopen callsign editing only for explicit moderation rejection.
  Add a browser controller fixture whose fake service deliberately ignores
  abort signals, then resolve obsolete challenge, board, and submit operations
  after their replacements for both success and failure outcomes.
- **Measurement:** Invalid proof returns exact
  `maltline_proof_invalid`; deterministic moderation rejection returns exact
  `maltline_callsign_rejected`. Unknown, extra-field, and wrong-status coded
  envelopes fail as protocol errors; uncoded HTTP 400 fails rank eligibility.
  Partition retains its exact uncoded error envelope. Focused platform tests
  pass 28/28, competition client/controller tests pass 58/58, the live
  moderation path passes, and all six non-cooperative replacement cases pass.
- **Decision:** Close the ambiguous HTTP 400 recovery policy and direct stale
  completion coverage. Keep P3-04 active for retained replay inspection and a
  composed browser-to-real-Worker smoke; keep P3-14 active for independent edge
  admission and production-equivalent capacity evidence.
- **Tasks:** P3-04, P3-18, P3-19
- **Full gate:** All 514 repository tests pass (392 Maltline, 49 platform,
  58 Partition, 15 shared packages), all workspace builds pass, all 58 exact
  Playwright checks pass, the assembled `/maltline/` route smoke passes, and
  `git diff --check` is clean.

## EXP-045 — Retained-proof transport, local inspection, and TD-07 repair

- **Date:** 2026-09-10
- **State:** P3-04 closed; retained input proofs now travel from authoritative
  storage to a locally replayed Shift Board detail view
- **Procedure:** Add a bounded ready/unexpired replay GET/HEAD route backed by
  the leaderboard row's immutable R2 key and SHA-256; reconstruct and replay
  the exact retained envelope through its registered authority in the strict
  browser client; and compose challenge, submission, D1/R2 persistence, replay
  retrieval, local verification, and board listing in one integration test.
  Independently review the resulting gameplay, verification, and visual
  surfaces in TD-07, then repair every bounded P1 finding with authoritative
  proof availability, terminal 404/410 handling, complete summary comparison,
  a focused detail/back interaction, honest reproduction copy, and an initially
  visible Proof action at 390 px.
- **Measurement:** An expired proof leaves its score ranked while the board
  changes to `Window ended` and offers no futile retry; temporary failures do
  remain retryable. A valid same-score proof with different ticks is rejected.
  Closing and reopening the panel ignores non-cooperative stale replay success
  and failure. At 700×600, both the first and tenth entries on a ten-row board
  move focus to visible proof detail and Back restores the initiating control.
  The maximum eight-stage fixture leads with authored stages, 6:01 active time,
  service/walkout facts, and a disclosed fingerprint. Exact reviewed images
  hash to `a36d259bc7c4f958f4b4e50ec43ce5d08680f3940579daf78ef2ac9cc23bf70c`
  (eligible), `e14531684f022d4ad24604e432a6967d4225e2a6cfce6ff3d686dd8e38a8f8df`
  (accepted 700), `900eb2c2dc25aea116b23a2b8e829e5862607290ba063c3411a349c97285cfeb`
  (inspected), and
  `dd402e0d226088ff8a01e6305f24f153042ce2fb8bd12b7b4f5d2d268ff3b644`
  (ranked 390).
- **Decision:** Close P3-04 because submission, ranking, retention, bounded
  transport, and local input replay now have a composed strict path. Keep P3-05
  active for the animated tick scrubber. Keep public ranked launch blocked on
  P3-14 until retained-proof reads as well as submissions have a
  non-cookie-rotatable edge policy and production-equivalent capacity evidence.
  Measure full-winning-proof main-thread replay/interaction latency on target
  low-end hardware under P4-04 before release. No audio, deployment, or remote
  artifact was created.
- **Tasks:** P0-32, P3-04, P3-05, P3-14, P4-04
- **Full gate:** All 519 repository tests pass (396 Maltline, 50 platform,
  58 Partition, 15 shared packages), all workspace builds pass, all 66 exact
  Playwright checks pass, the assembled `/maltline/` route smoke passes, and
  `git diff --check` is clean.

## EXP-046 — TD-07 responsive and retained-read assurance closure

- **Date:** 2026-09-10
- **State:** Bounded TD-07 evidence residuals closed after EXP-045
- **Procedure:** Commit maximum-shape proof-detail geometry checks at 700×600
  and 390×720, update the retained-proof protocol note to the actual complete
  summary/retry/trust contract, inject an R2 body-read fault, and interleave a
  captured valid proof read with retention cleanup. Have the original visual
  and verification reviewers recheck each repair and append superseding notes
  without rewriting their historical findings.
- **Measurement:** Both responsive widths contain all eight stage rows, final
  stage, fingerprint disclosure, and Back control inside the sheet and document
  bounds. The body fault returns only the generic bounded HTTP 500 envelope.
  An object opened before cleanup returns the exact canonical bytes and stored
  SHA-256 after cleanup deletes the backing object; the already-tested
  post-cleanup path returns 410. Reviewers report no remaining TD-07 visual,
  protocol, authority, R2-integrity, stale-async, or assurance finding. TD7-S1
  remains the single public-launch blocker in this slice.
- **Decision:** Treat TD-07's code-local repair/evidence work as settled. Do not
  enable public ranked traffic until P3-14 supplies non-cookie-rotatable edge
  control and production-equivalent proof-read/submission capacity. Continue
  P3-05 with the animated tick scrubber in the next competition tranche.
- **Tasks:** P0-32, P2-10, P3-04, P3-05, P3-14
- **Full gate:** All 520 repository tests pass (396 Maltline, 51 platform,
  58 Partition, 15 shared packages), all workspace builds pass, and all 67
  exact Playwright checks pass.

## EXP-047 — Verified animated retained-proof scrubber

- **Date:** 2026-09-10
- **State:** P3-05 implemented from strict retained bytes through the live Shift
  Board proof detail
- **Procedure:** Add a verifier-owned playback cursor that accepts only an
  unknown retained envelope, shares the canonical verify-and-hash pass, keeps
  RLE compressed, derives every stage/run boundary from registered authority,
  and exposes immutable stage-local frames. Mount a private replay canvas with
  last-stage-first paused inspection, stage selection, native exact-tick and
  five-second seek, 1×/2×/4×/8× playback, no cross-stage autoplay, semantic
  state/event copy, visibility pause, and modal-owned destruction. Connect the
  strict browser client and controller to the cursor only after the complete
  verifier-derived summary equals the selected board row. Add a full-win
  Worker→D1/R2→client composition alongside loss coverage.
- **Measurement:** The canonical full win exposes 21,670 unique frames for
  21,662 proof inputs, including distinct stage-terminal/start frames with an
  intentionally duplicated consumed-input `runTick`. On this development host,
  25 strict full-win verification/construction samples measured 17.30 ms median
  and 32.89 ms maximum; cold seeks through the longest 3,766-tick authored stage
  measured 2.31 ms median and 4.84 ms maximum. These are algorithmic sanity
  measurements, not a substitute for P4-04 target-device acceptance. The exact
  1280×720 proof image was reviewed with its full primary transport visible;
  700×600 and 390×720 geometry plus null-canvas behavior remain contained and
  usable.
- **Decision:** Send the large replay/viewer change immediately through TD-08
  before closing P3-05. Preserve P4-04 for low-end verification, cold-seek,
  sustained-drag, and effect-reconstruction budgets; do not infer production
  capacity from the local samples. No audio, deployment, remote mutation, or
  browser proof persistence was added.
- **Tasks:** P0-33, P3-05, P3-14, P4-04

## EXP-048 — TD-08 scrubber repair and deterministic presentation closure

- **Date:** 2026-09-10
- **State:** Three independent post-implementation reviews completed and all
  P3-05 closure findings repaired
- **Procedure:** Audit gameplay comprehension/lifecycle, verification and
  cursor/resource semantics, and visual/accessibility behavior in
  `TECH-DEBT-08-GAMEPLAY.md`, `TECH-DEBT-08-VERIFICATION.md`, and
  `TECH-DEBT-08-VISUAL.md`. Reproduce findings before repair, then remove the
  traversal-dependent `discontinuity` frame field; coalesce 100 rapid range
  inputs to the latest value once per RAF; cancel pending seek work on commit,
  replacement, and destroy; clear terminal event copy on Replay; expose window,
  station, held/blending, clean/washing jar, outbound shake, returning jar,
  lives, and campaign score as non-live text; include native proof disclosure
  summaries in modal focus order; and make effect pixels depend only on a
  stable proof/stage/tick seed plus a bounded 1.4-second logical frame ring.
  Correct the first deterministic-effects attempt after review showed that it
  rewound the only engine every paint: explicit discontinuities now build the
  bounded ring once, adjacent play only appends/trims it, and drawing never
  touches the playback cursor.
- **Measurement:** Instrumentation proves a 100-event range burst performs one
  `frameAt` reconstruction and subsequent continuous playback performs zero
  rewind calls. Event-bearing draw commands match direct seek, 60 Hz playback,
  and 144 Hz playback with reduced motion both on and off. Won and lost replay
  restarts return to clean tick-zero semantics; blending, holding, outbound
  shake, and returning-jar frames all retain real-text equivalents when canvas
  drawing is unavailable. Keyboard traversal reaches and opens Stage breakdown
  and Proof fingerprint before wrapping. The final reviewed desktop golden is
  SHA-256 `d331133505e55f04282b20895fc3f3be894df7fdfd0c7a7a43deb629a5c7e1a0`.
- **Decision:** Close P3-05 and P0-33. TD-08 has no remaining P1 correctness,
  resource, visual, or accessibility blocker. Track live reduced-motion
  preference switching, deliberate same-detail rerender focus, optional narrow
  scrolled pixel evidence, and clearer one-frame control language as P2-17 and
  P2-18. Public ranked launch remains blocked by P3-14, and target-device
  interaction evidence remains P4-04.
- **Tasks:** P0-33, P2-17, P2-18, P3-05, P3-14, P4-04
- **Full gate:** All 546 repository tests pass (421 Maltline, 52 platform,
  58 Partition, 15 shared packages), all workspace builds pass, all 71 pinned
  Playwright checks pass, the assembled `/maltline/` route smoke passes, and
  `git diff --check` is clean.

## EXP-049 — Actionable pressure telemetry and unranked P1-08 matrix

- **Date:** 2026-09-10
- **State:** Reproducible unranked experiment completed; no live campaign value
  promoted
- **Procedure:** First audit the registered generation-2 Stage 4–8 curve and
  lock a synthetic pressure-envelope image for each of Stages 4–7 plus a dense
  Stage 7 image at the supported 700px boundary. Add telemetry schema v3 with
  greedy unique slide-to-order reservation, open-demand and multi-order time,
  lane/flavor choice, order/return conflicts, pacing-window quiet time, jar
  scarcity, spawn-floor binding, repeat service, split walkouts, and an exact
  event-derived score ledger. Then run the canonical seed plus 32 fixed shadow
  offsets for three versioned controllers over four candidates: A registered
  control; B Stage 5 cadence (`204→180`, acceleration `2→3`); C Stage 7 bridge
  (`27→29` orders, `144→138` spawn interval, `0.120→0.125` march); and D the
  combined B+C change. Every effective campaign is explicitly unranked and
  verifies the exact registered authority digest before simulation.
- **Measurement:** EXP-049 schema/revision 2 has experiment fingerprint
  `fnv1a64:02f416b17ef06cb2` and formatted JSON SHA-256
  `08fa7662562ef93b1a20499566c23ac5034a792b7ce3ec783abefe338d53dd7a`.
  Telemetry v3's canonical JSON SHA-256 is
  `418aa234364fedc119c5c49086a1415fd1e6c7e55a0cf2683b8eefab34cd9775`.
  Its scoped pressure evidence identifies all 33 runs, the canonical run, and
  the 32 shadows separately; additive counters are labeled totals across runs
  reaching that stage. Model outcomes were:

  | Candidate | Reactive wins / mean attempt | Raw delayed | Adapter-mediated delayed |
  | --- | ---: | ---: | ---: |
  | A control | 33 / 360.775s | 31 / 369.629s | 30 / 369.631s |
  | B Stage 5 | 33 / 350.017s | 31 / 358.875s | 30 / 358.880s |
  | C Stage 7 | 33 / 360.894s | 31 / 371.060s | 30 / 371.018s |
  | D combined | 33 / 350.137s | 31 / 360.306s | 30 / 360.267s |

  Across all 33 raw-delayed runs, B raises Stage 5 maximum committed jars from
  a mean of 3 to 4, introduces 127.970 mean zero-clean-jar ticks, and reduces
  quiet pacing from 22.1% to 13.0% without a Stage 5 life loss. C raises Stage
  7 mean maximum live customers to 4.545 and mean maximum open demands to
  2.788; multi-order time reaches 14.1% and cross-lane order/return opportunity
  reaches 25.4%, again without a raw-delayed Stage 7 life loss. All observed
  simulations stay within the 60,000-tick proof ceilings. The five new exact
  image hashes are `8f5a6fed…5eebf8`, `2f8fac26…15f1b4`,
  `25562778…f0b63`, `f53ffc2a…7499a`, and `3edf145f…60ac18`; existing
  generation-2 control goldens do not move.
- **Decision:** Keep the registered generation-2 campaign, authority digest
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`,
  ruleset, proofs, Worker, season, and public viewer unchanged. B demonstrates
  the intended jar-economy loop and C creates the intended pre-Closing-Time
  bridge; D is the leading human-test candidate, not an authorized promotion.
  Require counterbalanced human A-versus-D sessions at desktop and the 700px
  boundary before closing P1-02/P1-04/P1-08 or creating generation 3.
- **Tasks:** P0-34, P0-35, P1-02, P1-04, P1-08, P1-10

## EXP-050 — Independent EXP-049 evidence and trust-boundary review

- **Date:** 2026-09-10
- **State:** Independent audit completed; moderate finding repaired and
  reverified
- **Procedure:** Review the finished telemetry and experiment runner against
  `audits/P1-08-TUNING-VERIFICATION-PLAN.md`; attack malformed transforms,
  mutable inputs, identity coverage, ranked/unranked separation, authority and
  retained-proof compatibility, resource ceilings, score/counter
  reconciliation, and canonical/shadow claims. Reproduce findings before
  repair, then rerun the focused authority/proof/telemetry/controller suites and
  reconcile every scoped additive result. Record the complete review in
  `audits/EXP-049-VERIFICATION.md`.
- **Measurement:** The audit found one moderate evidence defect in EXP-049
  revision 1: stage pressure pooled canonical and shadow runs, while scalar
  totals lacked a machine-readable aggregation label. Revision 2 now exposes
  exact `all-runs`, `canonical-run`, and `shadow-runs-only` scopes and nests
  sums under `totalsAcrossReachedRuns`; all 96 candidate/profile/stage triples
  satisfy `all = canonical + shadows`. The final focused Maltline audit passes
  102/102 tests and the platform authority/data-model slice passes 10/10. No
  tuned campaign can enter the generation-2 proof path, and static retained
  proofs remain exact. Two low local-tool residuals remain: controller
  fingerprints identify reviewed declarative metadata rather than executable
  source, and caller-supplied experiment collection cardinality/cumulative work
  has no preflight cap.
- **Decision:** EXP-049 is safe and honest for offline unranked comparison and
  is not evidence for immediate ranked promotion. Preserve the full formatted
  artifact SHA alongside its experiment fingerprint, require controller
  behavior-version metadata to change with behavior, and track portable source
  identity plus preflight work caps as P0-37 before exposing lab configuration
  to untrusted callers. The independent audit found no P1/P3 release blocker.
- **Tasks:** P0-35, P0-36, P0-37, P1-08, P1-10, P3-14

## EXP-051 — Dev-only counterbalanced A/D human lab

- **Date:** 2026-09-11
- **State:** First usable local lab completed; facilitated human sessions and
  richer qualitative capture remain
- **Procedure:** Extract EXP-049 candidate transforms into one side-effect-free
  experiment module and add a strict canonical seed-zero materializer for A or
  D. Build a DOM-free immutable session reducer and exact unranked artifact
  schema, then mount them in a separate `human-lab.html` Vite development entry
  using the real engine, renderer, fixed-step clock, input adapter, font loader,
  semantic status, and shell. Gate entry with four opaque evenly
  counterbalanced tokens; run common control Stages 1–3, then hidden A/D or D/A
  four-stage rounds with fresh lives/score, terminal pauses, an intermission,
  a three-question comparison, frozen local JSON download, and optional reveal.
  Independently inspect normal and lab-only Rollup graphs, ban proof,
  competition, network, API, storage, dynamic-import, and broad-barrel escape
  paths, and scan both production artifact trees for lab names/sentinels.
- **Measurement:** A materializes as an isolated exact copy of generation 2
  (`fnv1a64:adc596f1154aeafa`); D differs only at the five authorized Stage 5/7
  fields (`fnv1a64:b8279edfb6bd516e`). The EXP-049 fingerprint and JSON SHA stay
  byte-exact after extraction. The normal production viewer remains
  `index-CB56mtTe.js` / `index-B8gu1BUH.css`; the lab is absent from its module
  graph and from both `games/maltline/dist` and `dist/site/maltline`, and both
  possible production lab URLs return 404. Browser tests exercise clean token
  rejection, blinding, fresh rounds, frozen artifact download, zero prohibited
  calls/storage, terminal pause, and explicit 699→700 resume. Four inspected
  exact UI hashes are welcome 1280
  `7ec95fa3e535df87d1ad76c74f3ddf61bf41663f1de34cf9f490b8d4fed3de64`,
  terminal 1280
  `5f9e551cf7834a1728d6781be0ee809d407338d48a4c328ba372a593bfc637fb`,
  active 700
  `17122032a60024d8bfe483bdff10a7f1bbcb96c5c9ca2ec9a03f6613a859dc04`,
  and comparison 700
  `7d7f550c3b21900e2504220715955f88404d7f5dc5be9e95b00b02fce0f3e3da`.
- **Decision:** Use the lab for a small paired pilot; do not link or ship it and
  do not treat its shortened Stage 4–7 rounds as full-run duration evidence.
  `HUMAN-LAB.md` is the facilitator contract. The current schema honestly
  records stage outcome/ticks/input count/score/lives, partial versus full
  exposure, assignment, and final ramp/fairness/enjoyment choices. Track stage
  pulse questions, qualitative notes, participant strata/token digest,
  interruption/timing/input summaries, and countdown polish as P1-11 rather
  than claiming that evidence exists. No tuning candidate is promoted.
- **Tasks:** P0-38, P1-02, P1-04, P1-08, P1-10, P1-11, P4-03
- **Full gate:** All 572 repository tests pass (447 Maltline, 52 platform,
  58 Partition, 15 shared packages), every workspace builds, all 92 Playwright
  checks pass, the assembled `/maltline/` route and lab-exclusion smoke passes,
  and `git diff --check` is clean.

## EXP-052 — Human-lab evidence repair and diagnostic schema

- **Date:** 2026-09-11
- **State:** Audit blockers repaired and automated evidence verified; real human
  sessions and the complete actual-engine order/viewport matrix remain
- **Procedure:** Preserve the original P1-10 gameplay review, reproduce its
  G01–G08 findings, and revise the local artifact to schema 2 / experiment
  revision 3. Commit a failed practice attempt once and begin Round 1 fresh;
  give test-driver sessions a distinct kind, execution mode, synthetic label,
  and filename; remove candidate-dependent comparison copy; pause after every
  Stage 4–7 terminal for pressure, pacing, hardest-decision, and conditional
  loss responses; split the final survey into per-round jar/recovery evidence
  and paired ramp/fairness/enjoyment plus score-model evidence; and preserve
  drafts across blur, background, manual, and 699→700 interruptions. Fold real
  engine ticks into exact score/life/customer/loss/action counters, record
  relative active/paused time with typed interruption intervals, classify
  exposure by highest stage entered, hash the opaque assignment token, capture
  entry environment, and bind every recorded scenario to the verified source
  authority and ordered materializer fingerprints. Keep all lab code local and
  unranked.
- **Measurement:** Strict normalization now rejects extra fields, malformed or
  reordered tuples, inconsistent score/life/customer ledgers, zero-tick human
  observations, raw-token leakage, authority/candidate/scenario fingerprint
  mismatches, and open or non-reconciling timing snapshots. The browser suite
  drives a real DOM Space hold through the shipped input adapter,
  `FixedStepClock`, observation fold, and engine to an automatic canonical
  Stage 4 loss in both A→D and D→A orders: 1,458 ticks, four walkouts/four lives
  lost, and one blend start in each case, with both rounds beginning at
  `{ lives: 4, score: 0 }`. The remaining synthetic full-flow matrix is visibly
  quarantined and cannot normalize as human evidence. Exact reviewed lab
  images are welcome 1280
  `7ec95fa3e535df87d1ad76c74f3ddf61bf41663f1de34cf9f490b8d4fed3de64`,
  Stage-pulse 1280
  `1137fde5ebddef1b8ad892a2dcc0765f999e079bc964fed67dd263d7318265c8`,
  active 700
  `17122032a60024d8bfe483bdff10a7f1bbcb96c5c9ca2ec9a03f6613a859dc04`,
  and final comparison 700
  `6573b4bd213636d8d025cf3b5d4cf81741f91f6bbe4629e084973d26664c1349`.
- **Decision:** The false-evidence and candidate-blinding blockers are closed,
  and the lab is suitable for disposable facilitated pilots after the final
  repair audit. Do not promote A or D and do not count synthetic browser
  artifacts. Before decision-bearing collection, add explicit consent and
  participant strata, polish the countdown, and complete actual-engine A→D and
  D→A sessions at both 1280px and 700px with normal losses in both round
  positions. Human completion, fatigue, attribution, and 5–15-minute evidence
  still do not exist.
- **Tasks:** P0-39, P1-02, P1-04, P1-08, P1-10, P1-11, P4-03
- **Full gate:** All 592 repository tests pass (467 Maltline, 52 platform,
  58 Partition, 15 shared packages), every workspace builds, all 98 Playwright
  checks pass, the assembled `/maltline/` route and explicit two-route
  lab-exclusion smoke pass, the production Maltline bundle remains
  `index-CB56mtTe.js` / `index-B8gu1BUH.css`, and `git diff --check` is clean.

## EXP-053 — Independent human-lab repair verification

- **Date:** 2026-09-11
- **State:** Independent review completed; evidence-integrity repair accepted
  for supervised pilots, study closure still deferred
- **Procedure:** Re-audit the settled lab against every original P1-10-G01–G08
  finding without rewriting the historical review. Independently inspect the
  reducer, browser entry, materializer/provenance, timing and observation
  helpers, accessibility/lifecycle behavior, production graphs and artifacts,
  then run the focused unit, browser, build, site, and source-scan gates. Record
  the disposition in `audits/P1-10-LAB-REPAIR-VERIFICATION.md`. After the audit
  identified that two new pure helpers were transitively covered but absent
  from the boundary test's explicit source list, add both to its required
  runtime and escape-hatch scan lists and rerun that gate.
- **Measurement:** The reviewer independently passed 35 focused unit tests, 14
  lab Playwright tests, the Maltline build, full site assembly, built-site lab
  404/artifact smoke, explicit sentinel scans, and diff check. The post-audit
  boundary hardening passes 4/4. G01, G02, G03, and G05 are fully closed; G04
  and G06 meet the present pilot's minimum evidence bar with bounded depth and
  lifecycle-matrix follow-ups; G07 and G08 remain open.
- **Decision:** Close P0-39, not P1-10 or P1-11. The lab is safe for supervised,
  disposable, local unranked pilots, but it is not yet the complete declared
  study. Require full actual-engine A→D and D→A sessions at 1280px and 700px,
  artifact-bound consent/participant/width strata, and countdown behavior
  before treating collected artifacts as decision-bearing promotion evidence.
  No candidate is promoted and no production code or bundle changes.
- **Tasks:** P0-39, P1-02, P1-04, P1-08, P1-10, P1-11, P4-03

## EXP-054 — Stratified consent, countdown, and full real-engine lab matrix

- **Date:** 2026-09-11
- **State:** Study-control implementation and cross-review complete; lab ready
  for facilitated local sessions, no human results collected
- **Procedure:** Replace the fieldless welcome action with schema-3 study
  identity and consent, using eight opaque assignments counterbalanced A→D and
  D→A inside first-time/informed × 1280/700 cells. Reject a wrong assigned width
  before mounting and pause on any later mismatch until exact restoration plus
  explicit resume. Record a strict `p-` pseudonymous code and mode-bound consent
  evidence without names, email, absolute time, signature, IP, user agent,
  storage, or network access. Add an unskippable lab-neutral
  `3 · 2 · 1 · SERVE` before every stage using the production 650/650/650/350 ms
  cadence, zero engine ticks, bounded announcements, cancellable timer
  generation, and stage-card restart after interruption. Add a persistent
  `Stop playtest without saving` action through every unfinished surface. After
  cross-review found the human disclosure omitted keyboard/duration burden and
  withdrawal was actionable only before consent, version the complete
  disclosure as `maltline-p108-local-consent-v2`, bump EXP-049 artifact revision
  4→5, and prove stop makes all later input/RAF/focus/resize work inert without
  an artifact or mapping reveal.
- **Measurement:** A dedicated four-case browser matrix precomputes deterministic
  physical-key tapes and then drives ordinary DOM key events through the shipped
  input adapter, fixed-step clock, engine, observation fold, reducer, download,
  and public artifact normalizer without calling `finishStage()`. All 44 stage
  records across A→D/D→A × 1280/700 are `engine-observed`, have exact positive
  tick/input counts and reconciled counters, carry score/lives only within a
  round, and begin both rounds at `{ lives: 4, score: 0 }`. Pinned comparison
  outcomes are A Stage 4–7
  `won/3120, won/4143, won/3112, lost/2184` and D
  `won/3120, won/3121, won/3112, won/3351`; practice wins at
  `1558, 1621, 1889` ticks. The final cross-review in
  `audits/P1-10-STUDY-CONTROLS-VERIFICATION.md` closes G07/G08 and its two
  consent/withdrawal findings. Exact inspected lab images are welcome 1280
  `7ec95fa3e535df87d1ad76c74f3ddf61bf41663f1de34cf9f490b8d4fed3de64`,
  countdown 1280
  `67d8c1b1030b5fd84abd001592beb599bda59235188a03ffa2800da08f2f4498`,
  countdown 700
  `0ba17fd581a01fc03be1a94828fe14bd7cecfd6feab665a54f01253a9f99e4c4`,
  active 700
  `11cdee09370ccef4351df59a8c7431e52e86761ac87bfcb2fbc1af54ac717991`,
  pulse 1280
  `4ff0e83e8371f5d3d2cc88e251819f1a20626d372f43dc2a223f386f1bdd9f78`,
  and comparison 700
  `cb002f4cc24720ffba29c1fbc3125434bf2c65c6742111beb4972b0cfa03c075`.
- **Decision:** Close P0-40 and P1-11. The lab now meets its reviewed technical,
  privacy, consent, withdrawal, blinding, width, countdown, and all-stage
  browser acceptance criteria. Keep P1-10 open until real participants complete
  the counterbalanced cells; automation is verification evidence, not evidence
  of comprehension, fatigue, fairness, enjoyment, or full-game 5–15-minute
  duration. Do not promote candidate D or change registered generation 2.
- **Tasks:** P0-40, P1-02, P1-04, P1-08, P1-10, P1-11, P4-03
- **Full gate:** All 621 repository tests pass (496 Maltline, 52 platform,
  58 Partition, 15 shared packages), every workspace builds, all 115 Playwright
  checks pass, the assembled `/maltline/` route and explicit lab-exclusion smoke
  pass, production remains `index-CB56mtTe.js` / `index-B8gu1BUH.css`, and
  `git diff --check` is clean.

## EXP-055 — Bounded runtime audio derivative verification

- **Date:** 2026-09-11
- **State:** Offline safety tranche complete; no audio generated
- **Procedure:** Close the retained P2-16/TD4-A3 gap in the dependency-injected
  audio production scaffold. Bound ffmpeg/ffprobe execution time and combined
  output, cap WAV/Ogg files before complete reads, reject symlinks and mutation
  during probe/read, and require strict ffprobe evidence for one decoded stream,
  exact container/codec/rate/channel, finite duration, and bounded duration
  drift. Persist canonical source/master/runtime probe facts in manifest schema
  2 and re-probe resumable and completed derivatives instead of trusting hashes
  alone. Exercise only fake runners and local temporary files.
- **Measurement:** `audio-production.test.ts` passes 89/89, including malformed,
  empty, multi-stream, wrong-container/codec/rate/channel, duration-drift,
  derivative-oversize, process-output, timeout/abort, symlink, retained-source,
  recovery, and completed-output re-probe cases. `node --check` passes for the
  tool and the Maltline TypeScript project passes `tsc --noEmit`. No provider
  fetch, real ffmpeg/ffprobe execution, approval mutation, or staged asset was
  performed.
- **Decision:** Close P2-16. Runtime candidates still cannot ship until P2-06's
  selection, rights, mastering, browser lifecycle, mix, and deterministic-score
  gates pass; this experiment establishes production-tool safety, not an audio
  asset or commercial-rights approval.
- **Tasks:** P2-06, P2-16
- **Focused gate:** 89 audio-production tests, Node syntax check, Maltline
  TypeScript check, and whitespace/error diff check pass. The broader repository
  gate was not rerun for this isolated offline tool tranche.

## EXP-056 — Visual-direction lock, outcome truth, and audio pre-spend correction

- **Date:** 2026-09-11
- **State:** Presentation foundation and audio safety integrated; no human
  result, tuning promotion, audio generation, or asset selection performed
- **Procedure:** Independently review the current code-native renderer and exact
  pressure evidence, then lock the resulting `counter-after-dark-v1` direction
  in `VISUAL-DIRECTION.md`. Extract its environment, flavor, customer, and
  operational feedback palettes into one deeply frozen semantic theme consumed
  by both production painting and fixture visibility checks, while holding
  representative pixels exact. Independently audit gameplay/presentation truth
  and repair three reproduced faults without changing engine or authority: carry
  the zero-life reason into the game-over body/announcement, report fulfillment
  separately from disjoint final exits/walkouts, and stop reconstructing every
  same-tick serve popup from one final aggregate streak. Update the two affected
  goldens after source-resolution review. Because successful-serve copy is part
  of lab exposure and no participant session exists, bump the strict EXP-049
  artifact revision 5→6 and reject revision 5. Independently close P2-16 with
  bounded source/WAV/Ogg probing and recovery validation. Finally recheck the
  current official provider pages before spend: replace the stale 20-credit
  estimate with 40 credits per explicitly timed second, increase Batch 01's
  six-second ceiling 120→240, and accept either mono or stereo provider MP3
  input because the API contract does not promise channels, while still proving
  mono WAV/Ogg derivatives.
- **Measurement:** The frozen theme passes four unit contracts and keeps title,
  ready, return-miss, reduced-motion, Stage 7 1280, and Stage 7 700 pixels exact.
  The reviewed direction frame hashes remain Stage 7 1280
  `f53ffc2aa8dfece41c10c18417a4f5703952d41cbb6173ec60cf222f16c7499a`
  and Stage 7 700
  `3edf145f0d0dc2b01584a43b9bbbe9b5c65b1c8ad94d536827ca3ebb8760ac18`.
  New truthful terminal hashes are game over
  `316e59735bc9d4779494e8ae197c3562e20464259945410ec71248b739282e48`
  and stage-clear walkout
  `cabd4f530b32de09989b8f704d5520af688594f06278ad24e4bc2f7308f200d6`.
  Fatal-cause tests cover all three loss reasons; a same-tick two-serve test
  proves event point popups stay local while the HUD alone shows aggregate
  streak. The revision-6 lab passes all 31 browser cases, including 44 real
  engine stage records. Audio production passes 90/90 offline tests, including
  bounded Ogg validation and a stereo-source-to-mono-derivatives case. No
  provider request, credential, real ffmpeg/ffprobe call, approval, staging
  directory, or product audio asset exists.
- **Decision:** Close P0-41, P2-01, and P2-16. Keep P2-11 active after the first
  pixel-neutral theme extraction; keep P1-04/P2-03 active for recovery analysis
  and the complete deterministic event-age evidence matrix; start P2-02 with
  jar/return legibility at Stage 5/7 rather than a broad repaint. Keep P1-10
  open until real participant evidence exists, and do not promote D or change
  registered generation 2. P2-06 remains incomplete pending explicit owner
  rights/spend approval, selected assets, runtime/mix work, and human audition—not
  on the now-closed file-validation gap.
- **Tasks:** P0-41, P1-02, P1-04, P1-08, P1-10, P2-01, P2-02, P2-03, P2-06,
  P2-11, P2-13, P2-16, P4-02, P4-03
- **Full gate:** All 644 repository tests pass (519 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace builds; all 115 Playwright
  checks pass; assembled `/maltline/` browser/resource/font/fixture isolation
  smoke passes; production contains only `index-B2GMIynO.js`,
  `index-B8gu1BUH.css`, and the four pinned fonts; recursive artifacts contain
  no lab kind/token/participant/consent sentinel; Node syntax, audio-staging
  absence, and `git diff --check` pass.

## EXP-057 — Return readability and schedule-invariant feedback evidence

- **Date:** 2026-09-11
- **State:** Jar/readability tranche integrated; no tuning promotion, human
  result, audio generation, or selected audio asset
- **Procedure:** Run independent read-only visual and verification audits at
  the 700px support boundary. Strengthen the weakest gameplay silhouette—the
  returning empty jar—with an opaque glass keyline, a persistent leftward
  trail, and a final-approach marker that says `CATCH` only on the currently
  selected lane and otherwise names the window the player must move to.
  Recompose the jar gauge around dominant `CLEAN n` plus `WASH n · IN PLAY n`
  accounting, while retaining the amber zero-clean action warning. Repair the
  audit-reproduced partition-dependent particle integrator by deriving each
  particle and popup from origin plus total presentation age. Add isolated
  ready, first-serve, jar-catch, shake-launch, return-window, and integrated
  fatal fixture provenance, three new 700px crisis/approach goldens, and a
  ten-age 0–1400ms coarse-versus-fine schedule matrix. Because these visuals
  change future lab exposure and no real session exists, advance strict
  EXP-049 schema 3 from revision 6 to 7 and reject revision 6.
- **Measurement:** The event-age matrix is byte-identical at 0, 90, 479, 480,
  899, 900, 1119, 1120, 1399, and 1400ms for one coarse update versus 30ms
  partitions. Popup expiry is exact at 900ms, lane-flash expiry at 480ms, and
  loss-callout expiry at 1400ms; reduced motion retains the named failure.
  Fixture metadata binds exact 90ms ages and authoritative event types, and
  every non-destructive event fixture conserves its scenario jar pool. The
  reviewed 700px hashes are Stage 5
  `e3e23c71fe34a803101e67f3c3a3464a9db14cfddce100ab47f1be30214c4deb`,
  Stage 7
  `e843a83e661fe4d08e1ad8d12eb2e5500302b8e4003baa66d14793a953fe8cd5`,
  zero-clean
  `6eccbda585dde352397e457f3c790a5b3b20c1771e5b0a46a0cf9d032efc6c7c`,
  and return-window
  `fe1018243edea1903c7fcc00139711d0e13fd6bd86827a84b0a7f97be6e39355`.
  Isolated first-serve, catch, and launch hashes are respectively
  `b4f38504f5e3482c8532b5728a34072df623dab3673e66336480500e4a8efe51`,
  `e47e95cb253a16857fec7d10a34d75f425e56f052c50db76dbba742416ae86ea`,
  and `6372e6152a93beb6b6cc1cbb68126f305d5164d3ca598a30bc1b727557f8891b`.
- **Decision:** Close P0-42 and P2-03. Keep P2-02 active: jar/return and
  resource-accounting clarity now meet the reviewed boundary, while the next
  entity pass should address customer/order separation and outgoing-shake
  silhouette before station/environment ornament. Keep registered generation
  2 and the A-versus-D decision unchanged until real P1-10 participants exist.
  P2-06 remains gated on explicit rights/spend approval, selected assets,
  runtime/mix work, and human audition.
- **Tasks:** P0-42, P1-02, P1-04, P1-10, P1-11, P2-02, P2-03, P2-06,
  P2-11, P4-02, P4-03
- **Full gate:** All 648 repository tests pass (523 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace builds; all 127
  Playwright checks and the 42-image pinned manifest pass; assembled
  `/maltline/` browser/resource/font/fixture isolation smoke passes; production
  contains only `index-DG7C4lGv.js`, `index-B8gu1BUH.css`, and the four pinned
  fonts; recursive artifacts contain no lab kind/token/participant/consent
  sentinel; audio staging remains absent; TypeScript and `git diff --check`
  pass.

## EXP-058 — Order ownership and opposing traffic silhouettes

- **Date:** 2026-09-11
- **State:** Second bounded P2-02 presentation tranche integrated; no gameplay,
  campaign, proof, audio, or generation-2 authority change
- **Procedure:** Preserve `counter-after-dark-v1` while giving each marching
  customer's order ticket a neutral outer keyline and deterministic leader to
  its owner. Clamp top-lane tickets below the HUD. Give outgoing shakes a
  larger filled/outlined silhouette and persistent rightward chevrons—the
  non-color opposite of return jars' leftward trail—including under reduced
  motion. Add semantic theme tokens, expose separate ticket/leader/shake-body/
  shake-trail fixture regions, and enforce lifecycle accounting, unique bounded
  entity IDs, and jar conservation. Add exact 700px Stage 4 pressure and
  synthetic shake/return collision-corridor frames; deliberately regenerate
  only exact controls containing affected customers, tickets, or slides.
  Because future lab participants would see the changed renderer and no real
  session exists, advance strict EXP-049 schema 3 from revision 7 to 8 and
  reject revision 7.
- **Measurement:** At source resolution, Stage 4 and Stage 7 keep every V/C/S
  ticket below the HUD and visibly tethered to its customer. The collision
  frame keeps a filled chocolate shake and empty return jar distinct while
  their trails cross: the outgoing chevrons point right and the preserved
  return chevrons point left. The reduced-motion frame retains the outgoing
  cue without animation. Reviewed hashes are Stage 4 desktop
  `86d0747f6ab122cb91039dba8ee647518314e7aa74c6b3e1689ec57992f6d24f`,
  Stage 4 at 700px
  `ff86b031aaeaf5180abb6f0c51d3b43415ef48523b88647b3ecb6cee7e9111d0`,
  collision corridor at 700px
  `bca8c6bd2241f17cf378092bac39eb4e9f659ab1f73cb39f688c549dba30d0b7`,
  Stage 7 desktop
  `ded0cb1935eabc690cafe821b2330bd96adedea9a15c7ce41e0b9b7efc2e72c2`,
  Stage 7 at 700px
  `a3c0b8860fe57b1d105bf3c81cfb4710d4ffb984baa3ba42f1f42f270649c013`,
  and reduced motion
  `775424947ff31f734850e8d50403f76e5b98db40cd8398885d170a41d2bd17eb`.
  All 44 pinned images were reviewed as one contact sheet, with the six primary
  frames and four representative controls inspected individually at source
  resolution.
- **Decision:** Accept this bounded separation result and keep P2-02 active for
  station, counter, and environment refinement. Pixel/geometry evidence proves
  deterministic visibility and opposing direction language; it does not prove
  human cabinet-distance comprehension, which remains a participant question.
  Keep registered generation 2 and the A-versus-D tuning decision unchanged.
- **Tasks:** P1-10, P1-11, P2-02, P2-11
- **Focused gate:** All 529 Maltline unit tests pass; all 130 Maltline
  Playwright tests and the 44-image exact manifest pass; the Maltline production
  build and scoped `git diff --check` pass.

## EXP-059 — Recovery-ledger timing and reduced-motion traffic close-out

- **Date:** 2026-09-11
- **State:** Prospective P1-04 evidence and the final EXP-058 audit control are
  integrated; no score, campaign, proof, audio, or generation-2 authority
  change
- **Procedure:** Replay one perfect control and the same first-return jar miss
  in Stage 4 versus Stage 8 across the canonical campaign plus 32 deterministic
  shadow seeds. Reconcile serve, jar-catch, and stage-clear event ledgers, then
  compare three post-hoc policies that each retain the 8,000-point perfect-run
  budget: authoritative 250 points per carried life at every clear; stage-local
  `max(0, 1000 - 250 * stage life losses)`; and 750 points per clear plus 500
  points per ending life only after a campaign win. Bind authority, rules,
  campaign/scenario fingerprints, controller, seeds, traces, policies, limits,
  and results in an explicitly prospective/unranked artifact that forbids
  ranked-proof emission. Add a deterministic stdout-only CLI. Independently
  audit EXP-058 and close its only visual-evidence residual with an exact 700px
  reduced-motion twin of the conserved Stage 4 collision corridor, pairing the
  rightward filled shake and leftward empty return in one frozen frame.
- **Measurement:** Every perfect run scores 36,255 under all three policies,
  including the same 8,000 bonus. All 33 early-fault and all 33 late-fault runs
  win with exactly one jar smash and 28,130 non-bonus points. The authoritative
  carried-life policy scores 34,880 for the Stage 4 miss and 35,880 for the
  Stage 8 miss; stage-local survival scores 35,880 for both, and fixed progress
  plus final lives scores 35,630 for both. The canonical traces take 21,662
  ticks; shadows range from 21,636 to 21,662 as their spawn order changes.
  Canonical first-fulfillment/full-tier recovery takes 103/1,652 ticks after
  the Stage 4 miss and 92/1,189 after the Stage 8 miss. The experiment identity
  is `fnv1a64:3edebca005595e7d`, its result SHA-256 is
  `0458ab7b4407b09585cf9115d5cca8b878011b726d76718d4e71ed4898de08aa`,
  and two 229,568-byte CLI outputs are byte-identical with SHA-256
  `4cb2fcccc0fb35dec6df3ee3c63b15d6485ef24ebe02bbb07e3af07e3fbf2daf`.
  The new reduced-motion collision golden is 700×720, 213,987 bytes, and has
  SHA-256
  `924d4103a5c8c6194412d5a18e2bed4b492bb65e22d78d4ea042412d5f702a77`;
  native-color and grayscale source-resolution review preserves both opposing
  directions without animation or flavor color.
- **Decision:** The 1,000-point early/late difference is isolated to repeated
  scoring of carried lives, not fault severity, completion, or non-bonus play.
  Keep P1-04 active and all three alternatives unranked until human attribution
  evidence supports a policy decision; do not promote generation 3. Accept the
  post-EXP-058 audit with no correctness or ranked-release blocker and close
  P0-43. Keep P2-02 active for station, counter, and environment refinement,
  and keep P1-10 open for real cabinet-distance comprehension evidence.
- **Tasks:** P0-43, P1-02, P1-04, P1-08, P1-10, P1-11, P2-02, P2-11, P4-03
- **Full gate:** All 654 repository unit tests pass (529 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace builds; all 132 Maltline
  Playwright checks and the 45-image exact manifest pass; assembled
  `/maltline/` browser/resource/font/fixture isolation smoke passes; production
  contains only `index-DxdUKOdo.js`, `index-B8gu1BUH.css`, and the four pinned
  fonts; recursive artifacts contain no lab kind/token/participant/consent
  sentinel; audio staging remains absent; the P1-04 CLI hash, Node syntax, and
  `git diff --check` pass.

## EXP-060 — Station truth, fixture reachability, and TD-09 boundary repair

- **Date:** 2026-09-11
- **State:** Third bounded P2-02 presentation tranche and ninth technical-debt
  review integrated; no gameplay, campaign, score, proof, audio, ranked, or
  generation-2 authority change
- **Procedure:** Run independent gameplay, visual, and verification audits over
  the settled EXP-059 tree. Reproduce the presentation-truth defect in which a
  player could move selection during a blend and cause the renderer to paint
  the newly selected cabinet as processing the original flavor. Extract one
  frozen presentation-only policy with `holding > blending > blocked > idle`
  precedence, separate selected/processing/held/action flavors, and shared
  Canvas/semantic copy. Repaint the station bank so neutral cream identifies
  selection, amber identifies the actual processing cabinet or a blocked
  selection, and green belongs only to the actionable held shake and action
  chip. Replace the overstated stepped meter with exact continuous bottom-up
  fill and four fixed fifth dividers. Add conserved synthetic/unranked Stage 6
  split-state controls at 1280px, 700px, and reduced-motion 700px. Repair
  fixture lifecycle counters, explicitly label isolated presentation-only
  event provenance, fail closed on reachability/conservation/ID metadata, ban
  every experiment/testing/fixture module from the production graph, and allow
  only the exact reviewed experiment set in the lab graph. Advance the strict
  human-lab artifact revision 8→9 because future participants see the changed
  renderer, while retaining schema 3 and rejecting revision 8.
- **Measurement:** The derived model and command recorder pin action precedence,
  truthful selected-versus-processing identity, no false ready-green cabinet,
  exact 0/50/99/100 percent fill geometry, and identical meter geometry under
  reduced motion. Frozen station tokens keep primary status text at least
  4.5:1 against its panel and structural cream/amber marks at least 3:1 against
  the cabinet field. Source-resolution color and grayscale review preserves
  distinct Chocolate selection and Strawberry processing at 50% in all three
  controls. SHA-256 values are split desktop
  `2fa74cc3c1d00a1d8c39954eef046636fff7d3a22646595eeb18c253684bba34`,
  split 700px
  `960a843d182ee074a0117976b339acae813ad3d4b958f8bd90291d9936d651f0`,
  split reduced 700px
  `1f3ba0a249ca999cf05a50ca6401ce05694ca7224e55deb1052d138dcf7afd82`,
  blend-half
  `94af266ac68a6fabc14908fadbaa18058397bc3d14ceddec0a0f029612cfed89`,
  reduced-motion
  `085c31cc0273e0693d7879de5c0d53c8e1a1806ad491ce64d9e2545345c97022`,
  Stage 6 pressure
  `acff62c1dafcf53e41003f72e0c7e4c1a98825330d2f948bbef7d5e428903768`,
  and manifest
  `7d92d036717c7cb1cbf1ef96355754a0382b23e70a7e56f7582ed2a6de2d47c9`.
- **Decision:** Close P0-44 and accept the station slice with no correctness,
  ranked-integrity, or security blocker. Keep P2-02 active but defer counter
  and environment repaint until real participant evidence identifies a
  concrete comprehension problem. Keep P2-11 active for shared renderer
  geometry/scenario authority plus bounded effect/painter decomposition, and
  keep P1-10 active for real cabinet-distance comprehension, fairness,
  fatigue, preference, and completion evidence. Keep P1-04 alternatives
  prospective/unranked and do not promote generation 3. P2-06 remains gated on
  explicit rights/spend approval, selected assets, runtime/mix work, and human
  audition.
- **Tasks:** P0-44, P1-04, P1-10, P1-11, P2-02, P2-06, P2-11, P4-03
- **Full gate:** All 663 repository unit tests pass (538 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace builds; all 136 Maltline
  Playwright checks and the 48-image exact manifest pass; assembled
  `/maltline/` browser/resource/font/fixture isolation smoke passes; production
  contains only `index-DCZjYYWe.js`, `index-B8gu1BUH.css`, and the four pinned
  fonts; recursive artifacts contain no lab output sentinel; audio staging
  remains absent; the P1-04 CLI retains SHA-256
  `4cb2fcccc0fb35dec6df3ee3c63b15d6485ef24ebe02bbb07e3af07e3fbf2daf`;
  Node audio-tool syntax and `git diff --check` pass.

## EXP-061 — Single renderer scenario/layout binding

- **Date:** 2026-09-11
- **State:** Bounded P2-11 technical-debt extraction integrated pixel-neutrally;
  no visual, gameplay, campaign, score, proof, lab, audio, ranked, or
  generation-2 authority change
- **Procedure:** Follow the TD-09 close-out with three independent read-only
  scopes of the remaining renderer geometry seam. Add a viewer-only,
  deterministic, deeply frozen layout derived from one normalized scenario,
  with shared frame anchors, guarded lane coordinates, fixed-point lane
  projection, station centers/rectangles, action regions, and jar-gauge bounds.
  Replace the renderer's independently stored scenario/lane-height pair with
  one `{scenario, layout}` binding. Remove the redundant scenario parameter
  from `draw`; make draw and event ingestion reject an absent binding or a
  different state scenario ID before Canvas, random, or retained-effect
  mutation. Bind production, lab, and replay renderers from their exact engine
  or verified-playback scenario. Make visual-fixture metadata consume the exact
  layout returned by its renderer binding instead of re-deriving lane and
  station formulas. Keep entity visibility envelopes, effects, painters,
  engine state, and protocol authority outside this tranche.
- **Measurement:** Layout tests pin deep freeze, deterministic serialized data,
  two-/three-/four-lane centers, fixed-point counter/door endpoints,
  one-/two-/three-station centers and station rectangles, invalid lanes, and
  non-finite projection inputs. Renderer tests prove unbound and mismatched
  state rejection occurs before Canvas/random mutation, stage rebinding swaps
  the complete layout, and a rejected replacement preserves the preceding
  valid binding. Browser metadata asserts selected/processing/action/gauge
  evidence equals the shared layout. All 48 PNGs remain byte-identical: the
  aggregate ordered-image SHA-256 stays
  `657d44b987d5e51bc5ce76da8a395f3ecb242ee8cae5aadf09b87d59d6f39c93`
  and the manifest stays
  `7d92d036717c7cb1cbf1ef96355754a0382b23e70a7e56f7582ed2a6de2d47c9`.
- **Decision:** Accept the extraction and narrow P2-11 to bounded effect and
  painter seams. Retain human-lab schema 3/revision 9 because participant-facing
  pixels and semantics did not change. Record two non-blocking internal limits:
  state exposes only `scenarioId`, so a future same-ID candidate that changes
  geometry needs a stronger binding identity or explicit regression contract;
  and layout's runtime normalized-scenario guard relies on the internal frozen
  type contract. Current A/D candidates do not change layout inputs, no cache
  is keyed by ID, and all runtime callers bind the exact normalized engine or
  verified-playback object. Do not add presentation layout to authority/proof
  hashes or promote generation 3.
- **Tasks:** P1-10, P2-11, P4-03
- **Full gate:** All 669 repository unit tests pass (544 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace builds; all 136 Maltline
  Playwright checks and the unchanged 48-image exact manifest pass; assembled
  `/maltline/` browser/resource/font/fixture isolation smoke passes; production
  contains only `index-BYqvcd-Q.js`, `index-B8gu1BUH.css`, and the four pinned
  fonts; graph/sentinel and production dependency audits are clean; audio
  staging remains absent; Node audio-tool syntax, the unchanged P1-04 CLI hash,
  and `git diff --check` pass.

## EXP-062 — Player-readable exact replay frames

- **Date:** 2026-09-11
- **State:** P2-18 replay-language and secondary visual-evidence tranche
  integrated; no cursor, proof, verification, submission, score, campaign,
  audio, or ranked-authority change
- **Procedure:** Reproduce the exact-step comprehension defect in which moving
  from stage tick zero to one retained identical visible time, range value
  description, and live announcement at `0:00`, while controls exposed the
  protocol shorthand `−1t/+1t`. Keep the integer stage tick as the internal
  cursor, but present its real stage-local frame ordinal as `stageTick + 1` of
  `stage.ticks + 1`. Rename the exact buttons to `−1 FRAME/+1 FRAME` with
  Previous/Next replay frame semantics; add the ordinal to visible game time,
  range `aria-valuetext`, and committed seek/pause announcements. Clarify that
  stages play separately and make terminal copy direct the player to another
  stage. Derive replay action facts from the shared station-action policy so
  blocked/no-clean, selected, processing, and held states agree with live play.
  Relabel the replay region and recent-event surface without weakening the
  surrounding local-reproduction claim. Add an exact scrolled 700px control
  frame with keyboard focus while retaining the existing desktop hierarchy.
- **Measurement:** Adjacent frames 1, 2, and 3 have distinct visible ordinals,
  range descriptions, and announcements even while game time remains `0:00`.
  Exact buttons still move one underlying stage tick, five-second controls
  still move `5 * ticksPerSecond`, and playback still stops at the current
  stage boundary. Unit evidence covers player-readable controls, adjacent-frame
  perceptibility, blocked/no-clean and cross-station processing truth, recent
  event reset, seek coalescing, and canvas failure. Native and grayscale review
  at 1280 and scrolled 700 finds no overlap or horizontal overflow. The updated
  desktop golden SHA-256 is
  `6f957934834096238abf12446c6a59ef6d0bbff1327b2fc2bfdf66810bb80753`;
  the new focused 700px control golden is
  `728ed268086888a4b3ae927c6b3a140e762bf32ef67eb6e8cfd830a3e16d574e`.
- **Decision:** Close P2-18. Keep P2-17 active for live reduced-motion change
  ownership and same-verified-detail rerender preservation; do not mix those
  lifecycle changes into this copy/evidence result. Preserve verified-envelope
  admission, exact stage-local tick semantics, no-cross-stage playback,
  presentation-history and range-work bounds, and all authority/proof hashes.
- **Tasks:** P2-17, P2-18, P3-05, P4-04
- **Focused gate:** Replay unit tests pass 17/17; focused competition panel and
  controller browser tests pass 26/26; the full Maltline Playwright matrix
  passes 137/137 with a 49-image exact inventory; Maltline type/build and
  `git diff --check` pass.

## EXP-063 — Replay preference and verified-detail lifecycle

- **Date:** 2026-09-11
- **State:** P2-17 replay accessibility lifecycle integrated; the single-stage
  terminal-copy residual from EXP-062 repaired; no proof, verification,
  competition client/controller, submission, score, campaign, audio, or
  ranked-authority change
- **Procedure:** Audit the replay surface independently across gameplay,
  visual, and verification scopes. Add an injectable browser motion-preference
  boundary and subscribe only when renderer motion was not explicitly fixed.
  On a live preference change, cancel animation and pending range work, retain
  the last committed verified stage/tick, pause, rebuild that exact frame once
  under the new presentation mode, preserve control focus, announce once, and
  unsubscribe on destruction. Make single-stage terminal loss guidance say
  `Replay complete` instead of offering an impossible alternate stage. In the
  competition panel, define a verified detail identity as both leaderboard
  entry ID and `playback.verification.sha256`; while the active scrubber is
  connected and contained, a fresh state object with the same identity takes a
  true DOM no-op path. Any changed ID, changed verified digest, changed detail
  kind, Back, close, or destroy retains destructive teardown. A replacement
  verified detail starts at frame one, resets sheet scroll, focuses the visible
  `PROOF CHECK` heading, and announces once. Exercise paused and playing 700px
  cases, both identity halves, teardown paths, reduced-motion transitions,
  non-cooperative callbacks, direct-render equality, and fixed-mode cleanup.
- **Measurement:** Same-identity rerenders preserve the scrubber and canvas node
  identities, cursor, 8x speed, play/pause state, focused control, both open
  disclosures, sheet scroll, live-region text, and zero additional status
  mutations. The adversarial changed-playback fixture deliberately retains the
  display-only fingerprint while changing the verified playback digest, and
  still rebuilds. Motion changes make exactly one verified-frame lookup, leave
  the replay paused at the committed ordinal, cancel outstanding RAF/range
  work, ignore invoked stale callbacks, retain focus, and reproduce the same
  Canvas command stream as a direct render in the resulting mode. The first
  root browser run under simultaneous repository-test load exposed an
  unrelated test assumption that only frames 300–309 could be reached before
  Pause; the product correctly reached frame 312. Replacing that arbitrary
  window with an exact assertion derived from the paused slider tick passes
  three repeated focused runs and the serial full matrix. No golden changed
  during this lifecycle tranche. The 49-image manifest SHA-256 is
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`;
  its manifest-ordered raw-image-byte SHA-256 is
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  EXP-062's desktop/focused-control image hashes remain
  `6f957934834096238abf12446c6a59ef6d0bbff1327b2fc2bfdf66810bb80753`
  and
  `728ed268086888a4b3ae927c6b3a140e762bf32ef67eb6e8cfd830a3e16d574e`.
- **Decision:** Close P2-17 and confirm P2-18. Terminal guidance is now
  conditional: multi-stage proofs may direct the player to another stage,
  while single-stage loss proofs end honestly. Preserve verified-envelope
  admission, stage-local integer cursor semantics, no-cross-stage playback,
  replay presentation bounds, and all proof/authority hashes. Retain P4-04 for
  measured low-end device performance rather than treating deterministic
  browser correctness as a performance claim.
- **Tasks:** P2-17, P2-18, P3-05, P4-04
- **Full gate:** All 676 repository unit tests pass (551 Maltline, 52 platform,
  58 Partition, 15 shared packages); every workspace and the assembled site
  build; all 142 Maltline Playwright checks and the 49-image exact manifest
  pass; assembled `/maltline/` browser/resource/font/fixture isolation smoke
  passes. Production contains only `index-BJxNTjuN.js`,
  `index-OMJFi19V.css`, and the four pinned fonts; lab/experiment/fixture
  sentinels and audio staging are absent. The prospective P1-04 artifact is
  byte-identical across two 229,568-byte runs at SHA-256
  `4cb2fcccc0fb35dec6df3ee3c63b15d6485ef24ebe02bbb07e3af07e3fbf2daf`;
  production dependency audit reports zero vulnerabilities; Node audio-tool
  syntax and `git diff --check` pass.

## EXP-064 — Tenth technical-debt and refactor review

- **Date:** 2026-09-11
- **State:** Three independent read-only gameplay, visual/accessibility, and
  verification/security audits completed after EXP-062/063; no product source,
  proof, authority, campaign, score, audio, lab schema, or visual baseline
  changed
- **Procedure:** Follow the two substantial replay tranches with the scheduled
  maintenance review. Trace exact-frame semantics, motion and panel lifecycle,
  renderer ownership, scene/fixture geometry, Canvas/DOM fact policies,
  high-refresh work, proof/envelope admission, replay cursor isolation,
  competition identity, Worker D1/R2 concurrency, canonicalization ceilings,
  build isolation, and deployment gates. Re-run focused unit, browser, and
  workerd matrices; inspect representative 1280/700/390 frames; separate
  deterministic correctness from human, target-device, and deployed-edge
  evidence. Record the complete reviews in
  `audits/TECH-DEBT-10-GAMEPLAY.md`,
  `audits/TECH-DEBT-10-VISUAL.md`, and
  `audits/TECH-DEBT-10-VERIFICATION.md`.
- **Measurement:** No current P0/P1 gameplay, pixel, accessibility,
  replay-coordinate, stale-UI, proof-integrity, score-authority, or production
  graph defect is reproduced. All reviewers identify the 1,834-line renderer's
  combined transient event reduction/RNG/age/reset and painter ownership as the
  highest-value bounded P2-11 seam; effects-store extraction creates a useful
  lifecycle boundary while a leaf painter would mainly relocate code. Other
  presentation debt is duplicated live/replay event facts, raw coordinate
  assertions, the viewer normalized-scenario freeze heuristic/same-ID limit,
  replay reconstruction cost, and live play's missing mid-session motion
  listener. The security audit retains one high public-ranked-launch blocker:
  deleting the anonymous session cookie resets the current expensive-request
  limiter, while retained-proof GET/HEAD performs D1/R2/read/hash work without
  equivalent admission. It also retains future generation rollover design,
  three D1/R2 fault interleavings, canonical JSON width/output defense, and a
  deploy-command artifact-scan gap. Focused results are gameplay 58/58 units;
  visual 44/44 units plus 12/12 browser checks and six inspected frames;
  verification 119/119 Maltline units, 38/38 platform tests, and 5/5 replay
  lifecycle browser checks. A temporary local probe confirms redundant-work
  shape but is not device evidence: roughly 30 live canvas clears per 500 ms
  on title, 26 behind an open board, and 30 for playing versus zero for paused
  isolated replay.
- **Decision:** Close P0-45 and keep P2-11 active. Extract only a private
  transient-effects store next, preserving the renderer API, Canvas painters,
  draw order, RNG sequence, TTLs, strings, proof/authority identities, and every
  PNG byte. Then address live mid-session motion as P2-19 before moving stateless
  painters. Do not optimize redraw/replay cadence without P4-04 target-device
  measurements. Keep P3-14 active and require a centralized pre-work admission
  policy, non-cookie-rotatable deployment control, proof-read coverage, and
  production-equivalent concurrency/resource evidence before public ranked
  launch. Human tuning and comprehension remain P1-02/P1-04/P1-08/P1-10/P4-03
  work, not conclusions automation can supply.
- **Tasks:** P0-45, P1-02, P1-04, P1-08, P1-10, P2-11, P2-19, P3-14,
  P4-03, P4-04
- **Gate:** Audit-only diff hygiene passes. The focused matrices above pass,
  and the unchanged settled-tree gate remains EXP-063: 676 repository unit
  tests, 142 Maltline Playwright checks, 49 exact images, all builds, assembled
  route smoke, isolation/sentinel scans, zero production dependency
  vulnerabilities, deterministic P1-04 output, and clean diff whitespace.

## EXP-065 — Package-private transient-effects ownership

- **Date:** 2026-09-11
- **State:** First post-TD-10 P2-11 refactor integrated pixel-neutrally; no
  gameplay, Canvas painter, draw-order, public renderer API, copy, campaign,
  score, proof, authority, lab schema, audio, or ranked behavior change
- **Procedure:** Extract only the renderer's particle, popup, lane-flash,
  failure-callout, and camera-shake records into a package-private
  `MaltlineRendererEffects` store. Move event-to-effect reduction, random
  consumption, lifetime advancement/expiry, shake translation, and reset with
  those records. Keep normalized scenario admission and layout ownership in
  `MaltlineRenderer`; pass its already-admitted state/layout into effect
  ingestion; expose read-only views to the existing Canvas methods. Preserve
  `setScenario`, `pushEvents`, `update`, `resetPresentation`, and `draw`, every
  painter body, and the exact draw sequence. Add direct store tests for a mixed
  ordered event batch, immediate-failure lane association and fallback,
  reduced-motion entropy suppression, boundary expiry, partition equivalence,
  and full reset. Run independent visual and verification acceptance audits
  after the implementation rather than relying on the extracting agent's
  gates.
- **Measurement:** The representative ordered batch produces 57 particles, two
  truthful popups, one flash, three correctly paired failure callouts, and
  exactly 231 deterministic RNG calls; the last shake phase remains call 179.
  Reduced motion consumes zero effect entropy while retaining static popup,
  flash, and callout feedback. Flash, popup, and failure callout records remain
  live through 479/899/1,399 ms respectively and expire exactly at
  480/900/1,400 ms. A 40+85 ms advance equals one 125 ms advance, and reset
  clears every record and shake translation. Existing tests retain unbound and
  mismatched rejection before Canvas/RNG/effect mutation, failed rebind
  recovery, repeated-draw neutrality, exact command transcripts, and all
  presentation-history behavior. `renderer.ts` drops from 1,834 to 1,660 lines;
  the explicit internal store and read-only view contracts occupy 260 lines.
  Changed SHA-256 values are store
  `47844114aeb5860dadb695041b499184c5eefab05a7ba29ff8fffe7e10e2bd56`,
  renderer
  `6ba51caf7a245bb8da7382aad04e4fe001b2a566d87640f8c02545ce39fab72d`,
  and direct test
  `385de3926e8ca8014920768e9e4bb60d15fceb6f4793237db9d2207f7336048d`.
  Both independent reviews accept the boundary: the effects module is imported
  only by the renderer and its direct test, is absent from package exports, and
  leaves production, lab, replay, and fixture callers unchanged.
- **Decision:** Accept the extraction and keep P2-11 active for structured
  shared event facts, removal of raw coordinate duplication, and one stateless
  painter family at a time. Do not combine those follow-ups with pixel polish.
  Keep P2-19 separate because live motion-mode mutation needs deliberate
  transient-collapse semantics; this fixed-mode extraction must not silently
  choose that policy. Retain P3-14 and P4-04 exactly as recorded in EXP-064.
  Human-lab schema 3/revision 9 remains current because participant-facing
  pixels, semantics, and behavior are byte-equivalent.
- **Tasks:** P2-11, P2-19, P3-14, P4-04
- **Full gate:** All 680 repository unit tests pass (555 Maltline, 52 platform,
  58 Partition, 15 shared packages); all workspaces and the assembled site
  build; two independent full Maltline Playwright runs pass 142/142 with all 49
  PNG bytes unchanged. Manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  The assembled `/maltline/` smoke and production graph/sentinel scan pass;
  production contains `index-fcYiDwUF.js`, `index-OMJFi19V.css`, and the four
  pinned fonts. The prospective P1-04 output remains byte-identical at
  `4cb2fcccc0fb35dec6df3ee3c63b15d6485ef24ebe02bbb07e3af07e3fbf2daf`;
  production dependency audit has zero vulnerabilities; Node audio-tool syntax
  and `git diff --check` pass.

## EXP-066 — Live motion preference and BFCache lifecycle

- **Date:** 2026-09-11
- **State:** P2-19 live reduced-motion lifecycle integrated after independent
  defect discovery and repair; no engine, tick clock, input, run eligibility,
  proof recorder, score, campaign, authority, competition, replay, lab schema,
  audio, or visual-baseline change
- **Procedure:** Add a live-only injectable media-query source and binding that
  synchronizes the production renderer at startup, closes the read/subscribe
  race, owns one listener, suppresses duplicate emissions, rejects stale
  callbacks, and cleans up idempotently with page lifecycle. Make the renderer
  and its new transient-effects store change presentation motion in place.
  Entering reduced mode clears particles and camera shake, freezes popup travel
  at its current location, and continues popup, flash, and failure-callout ages
  and TTLs. Returning to normal resumes only still-live popup travel and never
  reconstructs discarded particles/shake or expired feedback. Keep replay,
  visual fixtures, and the human lab on their existing explicit deterministic
  constructor modes. In a production-browser test, freeze RAF at one committed
  game state and compare a full internal Canvas pixel signature across
  normal→reduced→normal while pinning public viewer state, focus, flow status,
  event live text, and rank state. After the first implementation, run two
  independent lifecycle audits rather than closing immediately.
- **Measurement:** Six new unit cases cover the effect transition, exact TTL/no
  resurrection, renderer-owned motion at one fixed state, initial preference
  synchronization, duplicate/race behavior, stale callbacks, and cleanup. The
  first implementation passed 560 Maltline units and 143 browser checks, but
  both auditors found a moderate acceptance blocker: unconditional `pagehide`
  cleanup also ran when `PageTransitionEvent.persisted === true`, so a page
  restored from BFCache could remain unsubscribed and stale. The repair uses a
  guarded structural `persisted === true` read rather than cross-realm-fragile
  `instanceof`, retains the sole source listener across persisted hide,
  re-reads `source.current()` on persisted show, and removes both lifecycle
  handlers plus the source listener only for non-persisted hide or manual
  cleanup. An exact unit case silently changes the source while cached, proves
  one restore synchronization and later event delivery, then proves one-time
  teardown and stale-callback rejection. The production browser test now
  crosses synthetic persisted hide/show before its pixel transition and passes
  three consecutive focused runs. Constant initial normal/reduced modes retain
  all prior command streams and exact PNG bytes. Final source SHA-256 values are
  motion binding
  `e62da90503c284ce442d87185f0c9ff1d37f5ebbd3137efa17e3e98341b8d3c0`,
  main integration
  `4259ba931f195f7c59c672a7a1e4bdee11502bdfbd93921d506b2b3c7c461454`,
  renderer
  `70893df21d0ce2753058f2f363f32b26b317b4eff4cf14716490a955095bbe8a`,
  and effects store
  `b2ff16437e3c30802659ebc6806b83253402620dc45dd65fc550712ce6df4dbd`.
- **Decision:** Accept the repaired lifecycle and close P2-19. The browser
  preference callback can reach only renderer presentation state; it does not
  pause, resume, advance, invalidate, or announce gameplay. Retain P4-04 for
  actual reference-device performance and P2-11 for structured event facts,
  coordinate cleanup, and later stateless painters. Human-lab schema
  3/revision 9 remains current because the lab does not install the live
  binding and its explicit presentation mode/pixels are unchanged. Keep P3-14
  active as the independent public-ranked admission blocker from EXP-064.
- **Tasks:** P2-05, P2-11, P2-19, P3-14, P4-04
- **Full gate:** All 686 repository unit tests pass (561 Maltline, 52 platform,
  58 Partition, 15 shared packages); all workspaces and the assembled site
  build; all 143 Maltline Playwright checks and the 49-image exact inventory
  pass. Manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  The assembled `/maltline/` browser/resource/font/fixture isolation smoke
  passes; production contains `index-DyvnQwwP.js`, `index-OMJFi19V.css`, and
  the four pinned fonts; lab/experiment/fixture sentinels and audio staging are
  absent. Two prospective P1-04 runs remain byte-identical at 229,568 bytes and
  SHA-256
  `4cb2fcccc0fb35dec6df3ee3c63b15d6485ef24ebe02bbb07e3af07e3fbf2daf`;
  production dependency audit reports zero vulnerabilities; Node audio-tool
  syntax and `git diff --check` pass.

## EXP-067 — Cookie-independent ranked edge admission

- **Date:** 2026-09-11
- **State:** First P3-14 production-admission tranche integrated and independently
  reviewed; cookie deletion no longer resets the primary in-Worker budget, but
  P3-14 remains active for applied WAF/trusted-header inventory and deployed
  worst-case capacity evidence
- **Procedure:** Retrieve the current Workers Rate Limiting API, request-header,
  WAF-characteristic, Wrangler-schema, and Workers-type contracts before editing
  the platform. Add one required production `RateLimit` binding and a small
  `admitMaltlineExpensiveRequest` boundary. Classify supported routes and methods
  before sessions; reject cross-origin writes before admission; then admit
  ranked writes, board reads, and proof GET/HEAD under separate route-class keys
  before anonymous-session insertion, body reads, D1/R2, proof execution, or
  moderation. Derive each key from a bounded Cloudflare-provided network address
  using HMAC so the application never stores or logs the raw address. Fail
  closed on a missing/faulting binding, weak secret, or missing/malformed trusted
  header. Preserve the exact session-keyed binding and atomic D1 windows as
  secondary controls. Make 429 responses no-store with `Retry-After: 60`, keep
  every HEAD error bodyless, expose optional bounded retry timing to the strict
  browser client, and reject duplicate/unknown leaderboard query parameters
  before D1. Document identity, NAT/privacy, same-zone subrequest, WAF, and
  deployed capacity limits in `EDGE-ADMISSION.md`. Run three independent
  gameplay, verification, and client-surface audits without granting external
  deployment authority.
- **Measurement:** Seven admission unit cases prove cookie-independent and
  route-separated HMAC keys, raw-address non-disclosure, fail-closed identity,
  binding faults, and exact 429 timing. Eight added/expanded workerd cases
  execute the configured binding and prove one admitted cookie-less write plus
  a rejected rotated-cookie write creates exactly one session/challenge; rejected
  run and submit bodies remain unread; submit cannot reach D1, R2, verifier, or
  AI moderation; proof GET/HEAD/404 probes share one key and cannot reach D1/R2;
  board admission uses a separate key; unsupported methods and cross-origin
  writes consume no token; and noncanonical board queries reject before D1.
  Focused admission/Worker gates pass 27/27 and client/controller gates pass
  67/67. Wrangler 4.124.0 generated a configuration type containing all three
  rate bindings; its dry run resolved 31 site assets plus D1, R2, AI, assets,
  and the new `MALTLINE_ADMISSION_RATE_LIMITER (60 requests/60s)` with a
  224.07 KiB / 49.89 KiB gzip Worker upload. Local startup profiling measured
  14.8 ms active time in a 23.4 ms sample window; this is explicitly not edge
  CPU evidence. The latest retrieved Workers types, 5.20260911.1, retain the
  installed `RateLimit.limit({ key }): Promise<{ success: boolean }>` contract.
  Final source SHA-256 values are admission
  `e694986d990f480a11bcfcebccba14d1d3d24e99d6590573fbed399705385587`,
  Maltline Worker
  `1d9cdb3d321214b2debaaaaff6982ff2dbb4b832142b0821e0e18b203d0aed8e`,
  HTTP errors
  `e936ec1c27630e8e27a8a88566f0b4d0f69dafa5d43b9b1dc6b9bb84a76bf94e`,
  platform Worker
  `4a60ea6e9693c1731bd00083b6c8d9c2167071e903172b7c9e8c0663fc0b720e`,
  strict client
  `3ea9a678732d5a3c7b2fe09e16d132391f680675aeeb352c5779517a4555542c`,
  Wrangler config
  `afefaad519bf86f537f895ed16b87facb95629757934d5e268e0dd2b828e4b5a`,
  and admission runbook
  `c458e72da0d2911b6209e56f2954e6a0e5d1db692c471dcfc676b94f4720e3d5`.
- **Decision:** Accept the local defense-in-depth boundary. It closes the direct
  cookie-rotation and unthrottled proof/board-read holes without changing score
  authority, proof identity, deterministic gameplay, pixels, or successful
  response contracts. Do not call the 60/minute binding an exact or global cap:
  Cloudflare documents per-location, permissive, eventually consistent counters,
  and network addresses are shared and rotatable. Keep public ranked launch
  gated on the account owner verifying visitor-IP transforms and same-zone
  routing, applying/recording a plan-appropriate WAF policy, and measuring the
  1,445,121-byte route plus concurrent full proof reads in a production-equivalent
  staging deployment. No Worker, D1, R2, WAF, secret, or zone state was deployed
  or mutated in this experiment.
- **Tasks:** P3-14, P4-02, P4-04
- **Full gate:** All 707 repository unit tests pass (567 Maltline, 67 platform,
  58 Partition, 15 shared packages); every workspace and the assembled site
  build; all 143 Maltline Playwright checks and the 49-image exact inventory
  pass. Manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  The assembled `/maltline/` browser/resource/font/fixture isolation smoke
  passes; production contains `index-rTMPDZYS.js`, `index-OMJFi19V.css`, and
  the four pinned fonts. Production dependency audit reports zero
  vulnerabilities; Node audio-tool syntax, generated-artifact cleanup, and
  `git diff --check` pass.

## EXP-068 — Generation-safe production viewer flow

- **Date:** 2026-09-11
- **State:** P2-15 closed after red-to-green production reproduction, exhaustive
  injected-scheduler coverage, two independent repair rounds, and exact-pixel
  acceptance; no engine, campaign, scoring, proof format, authority, competition
  protocol, lab flow, CSS, golden, or simulation-tick change
- **Procedure:** Revisit the latent countdown race recorded in TD-03/TD-04 and
  independently map gameplay, proof-lifecycle, and visual/accessibility
  boundaries before editing. Extract a production-viewer-only controller as the
  sole authority for screen, stage, opaque attempt identity, opaque countdown
  identity, expected countdown step, and timer ownership. Feed it semantic
  events and apply its declarative effects in `main.ts`, while leaving engine
  construction, RAF/tick advancement, input, replay, proof, competition,
  eligibility, rendering, DOM, focus, and browser availability at their
  existing boundaries. Inject the presentation scheduler and preserve the
  exact 650/650/650/350 ms cadence, manual countdown skip, card return before
  play when the environment becomes unavailable, explicit unranked resume,
  manual stage-clear advance, and final-clear-to-victory separation. Add a
  browser timer probe that deliberately retains canceled callbacks. Run the
  initial probe against the old implementation, then keep its failing assertion
  unchanged through the extraction. Independently audit the first green
  implementation, repair its settled-return and undefined-handle ownership
  findings, reject negative terminal bonuses, and correct the pre-existing
  protected-terminal hint/live-announcement mismatch pixel-neutrally.
- **Measurement:** Before extraction, releasing countdown A's canceled callback
  after restart into countdown B reproducibly changed B from `3` to `2`. After
  extraction, the same retained callback cannot change the replacement timer,
  screen/dataset, overlay title, focus, rank eligibility, engine tick, recorded
  input count, replay count, or flow announcement; B's owned callback still
  advances normally, and retained work after a manual skip is inert. Fifteen
  direct controller cases cover every screen against advance, restart,
  terminal, interruption, and resume events; all eight stage boundaries; exact
  countdown delays; unavailable play; stale/wrong attempt, stage, identity, and
  step tuples; duplicate/out-of-order delivery; synchronous cancellation;
  observer and synchronous-scheduler reentrancy; schedule failure; immutable
  snapshots; nonnegative bonuses; undefined scheduler handles; and idempotent
  controller disposal. A callback validates its exact state object, attempt,
  stage, countdown identity, and expected step before any slot mutation.
  State/slot invalidation precedes best-effort cancellation. `dispatch()` now
  reports the settled synchronous-chain state/effect after reentrancy or failure,
  and timer registration is tracked separately from the handle value so even a
  valid `undefined` handle is canceled. Protected ranked loss and victory
  surfaces now give the same review/discard instruction visibly and through the
  live region without changing rendered pixels.
- **Decision:** Accept the bounded extraction and close P2-15. The controller is
  a package-private presentation coordinator, not an authorization boundary;
  its opaque identities prevent temporal mix-ups but are intentionally visible
  to its trusted caller. Its `dispose()` claim covers only owned presentation
  timers, not full application teardown or BFCache policy. Retain the fixed-step
  engine, authoritative proof recorder, competition async generations, and
  human-lab controller as separate authorities. Continue P2-11 one painter
  family at a time and keep P1-02/P1-03/P1-04/P1-08/P1-10, P2-02/P2-06,
  P3-14, and P4-03/P4-04 active under their existing evidence requirements.
- **Tasks:** P2-15, P1-03, P2-05, P3-16
- **Full gate:** All 722 repository unit tests pass (582 Maltline, 67 platform,
  58 Partition, 15 shared packages); every workspace and the assembled site
  build; all 144 Maltline Playwright checks and the 49-image exact inventory
  pass. Manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Final source SHA-256 values are controller
  `50db2d378bfd0a56843fd191461603785ada245038c842beffd5075990dbe2f8`,
  production integration
  `cfc1811424b6dfc19feccdc395b74c24c6fa0970ff270d13ad9e4a1e865c8455`,
  direct controller tests
  `f5463eae93ec863f61107b3c98aada06a33555f6974146f4a7448d84ac7f8780`,
  and production-browser specification
  `20bbba55cc240aa9dc1361ea9a0bdf8760f75f0c6478af3fbf8ab8a50f25b38a`.
  The assembled `/maltline/` browser/resource/font/fixture isolation smoke
  passes; production contains `index-CKtVzbi2.js`, `index-OMJFi19V.css`, and
  the four pinned fonts. Production dependency audit reports zero
  vulnerabilities; Node audio-tool syntax, generated-artifact cleanup, and
  `git diff --check` pass.

## EXP-069 — Bounded, source-bound offline tuning evidence

- **Date:** 2026-09-11
- **State:** P0-37 closed after two adversarial repair rounds and an independent
  final audit; no ranked authority, proof, campaign, engine rule, browser,
  human-lab schema, production bundle, or visual-baseline change
- **Procedure:** Close the two low trust-boundary residuals recorded by the
  independent EXP-049 audit. First, admit only ordinary exact options and dense
  caller collections, cap candidates/profiles/seeds/changes and checked total
  work before authority verification, transforms, controller construction, or
  simulation, then enforce one campaign-wide tick ledger before each controller
  decision and engine step. Second, replace the bare default P1-08 CLI output
  with a versioned, explicitly unranked and self-attested offline envelope. Use
  TypeScript's AST/project API to walk the actual static local producer and
  kernel import closures; normalize source text to UTF-8/LF; hash an internal
  sorted repo-relative manifest while exposing only aggregate digests/counts;
  bind the package, toolchain, lockfile, inherited/package TypeScript configs,
  authority, controller registry, work plan, payload, and canonical envelope.
  Realpath every source and build input, reject escape/unresolved/dynamic-import
  graphs, and bound retained JSON before parsing. Run independent gameplay,
  verification, and documentation reviews, preserve the earlier EXP-049
  revision-2 evidence as historical, and update the public command to exercise
  the exact npm wrapper rather than only its underlying `tsx` process.
- **Measurement:** The default 4-candidate × 3-profile × 33-seed matrix
  admits 132 effective campaigns, 396 campaign runs, 3,168 maximum stage starts,
  and exactly 23,760,000 planned tick slots under caps of 8 candidates, 4
  profiles, 64 seed offsets, 16 changes per candidate, 512 effective
  campaigns/runs, 4,096 stage starts, and 60,000 ticks per stage/campaign. The
  measured default consumes 8,596,148 controller decisions/engine steps. A
  60,001-callback probe now stops at 60,000; exhausting that budget on an exact
  nonfinal stage win reports campaign `tick_limit` and never constructs the next
  stage controller. EXP-049 remains schema 2 but advances to revision 3 with
  fingerprint `fnv1a64:a56ab6aac3bd00ec`; the legacy telemetry output with no
  total limit stays byte-identical at SHA-256
  `418aa234364fedc119c5c49086a1415fd1e6c7e55a0cf2683b8eefab34cd9775`.
  Before envelope repair, a caller-injected idle callback that reused the exact
  reviewed controller id/metadata was accepted under the reviewed source
  digest, and a forged nine-candidate identity with only one result row could
  also be self-enveloped. The settled v1 boundary rejects both by requiring the
  exact ordered default controller registry and the separately reviewed full
  default payload fingerprint, canonical length, and SHA-256. A second red probe
  showed the documented unsilenced npm command prepended a lifecycle banner;
  `npm run --silent tuning:p1-08 --workspace=@arcadebench/maltline` and its
  direct public-command test now emit one parseable JSON document.
- **Artifact identity:** The canonical default payload is 781,938 bytes with
  SHA-256
  `59ccec0cc3dabc7ce110d0ed3f0863e6b861a5728758baf1687c0fe7eef8ca36`.
  The producer closure is 23 files at
  `ee01c3858dbfce3b51e703c50c2f71402752ea881098bb6b0b958ee8de59206c`;
  the 21-file kernel closure is
  `c3353176aa777e4965b2772dbf7d256baf1e224cb107a5b37709c37105502b54`;
  and the build recipe is
  `cc7b31b4f8a6755a568c24011dd95412f5e466142928e3c0409713e5b55779b4`.
  Envelope canonical integrity is
  `e0c09430e62c5fc8a5c41f71bfcb4def74a8c4bf3435e300dc78725d52c8665e`.
  Two public-command runs were byte-identical: 1,899,811 formatted bytes at
  SHA-256
  `170519bd4d8cf0b1f1a5fa59957a7f99048647f35d047a95e1b0e821be259d4b`.
  The final helper, CLI, experiment runner, and campaign telemetry source
  SHA-256 values are respectively
  `4fead1ce6017cb0f0b561366e2f90bf1404b85ae11cb1c4a904493b483335b2b`,
  `ba918b5e610b66117d2614ea26b237ec10d22ae32d7678b07f8aa7e5689e6fa8`,
  `75eeec57ee246ff4e95d8a5d4944519c92ae820636bc6378c5a4acd0af9760f9`,
  and `c0d2ff43f94ddc62f5841602ea7d299175b45fd24aa443335cacc52465c99c03`.
- **Decision:** Close P0-37. The retained artifact now identifies exact reviewed
  default output plus the local source/build recipe needed to reproduce it, but
  remains deliberately self-attested: it is not a signature, independent
  execution attestation, ranked proof, or promotion authority. Custom profiles
  and matrices stay bare diagnostics and cannot receive a v1 envelope.
  Controller callbacks and JavaScript proxies remain trusted executable
  in-process code; invocation/tick budgets cannot interrupt a callback that
  never returns. Extend source discovery before adopting non-static loaders.
  Keep generation 2 and all ranked/public behavior unchanged, and retain real
  participant evidence as the blocker for P1-02/P1-04/P1-08/P1-10.
- **Tasks:** P0-35, P0-36, P0-37, P1-02, P1-04, P1-08, P1-10
- **Full gate:** All 740 repository unit tests pass (600 Maltline, 67 platform,
  58 Partition, 15 shared packages); every workspace and the assembled site
  build; all 144 Maltline Playwright checks and the 49-image exact inventory
  pass. Manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Production Maltline still emits `index-CKtVzbi2.js` and
  `index-OMJFi19V.css`; the assembled browser/resource/font/fixture isolation
  smoke passes. Production dependency audit reports zero vulnerabilities and
  `git diff --check` passes.

## EXP-070 — Shared ordered event-presentation facts

- **Date:** 2026-09-11
- **State:** The structured-event-facts portion of P2-11 is complete; coordinate
  cleanup and stateless leaf painters remain active. No renderer painter, CSS,
  golden, engine, campaign, score, proof, replay-verification, authority, or
  protocol change.
- **Hypothesis:** Live semantic announcements and retained-proof replay can
  consume one exhaustive, immutable interpretation of authoritative engine
  events while preserving their deliberately different player-facing copy and
  selection detail. Making event order and context-specific priorities explicit
  should remove duplicated policy without changing pixels, deterministic
  gameplay, or verified replay truth.
- **Procedure:** Add a viewer-private pure `event-presentation` boundary with an
  exhaustive builder table for all 13 `GameEvent` variants. Copy every
  applicable authoritative tick, cause, lane, flavor, points,
  `firstFulfillment`, lives, bonus, and customer ID into frozen ordered facts;
  retain same-type duplicates and attach their original sequence ordinal.
  Reject mixed-tick batches because engine batches describe one step. Derive
  named facts for terminal loss, last life loss, first clear/serve/catch/ready,
  and reverse-most-recent non-spawn event, then preserve separate priorities:
  live terminal > last loss > clear > first serve > first catch > first ready;
  replay important terminal > clear > last loss; replay recent last loss >
  clear > last non-spawn. Refactor only `semantic-status.ts` and
  `replay-scrubber.ts` to consume the shared facts, retaining every existing
  ID and string, including zero-point rescue/catch language and the generic
  replay game-over message.
- **Finding and repair:** The pre-extraction `.find()` policy selected the first
  `life_lost` in a tick. A legal tick may contain multiple loss events, so live
  terminal copy could cite an earlier nonfatal cause and live/replay loss status
  could report stale remaining lives. Red/green mixed-cause and duplicate-loss
  tests now select the final same-tick life loss. When `game_lost` is present,
  live copy associates only the authoritative `lives === 0` loss as its fatal
  cause; if that association is absent, it uses the existing safe generic
  `Run ended.` fallback instead of inventing a cause. Raw event order and every
  event remain intact.
- **Evidence:** Focused event-presentation, semantic viewer-session, and replay
  scrubber coverage passes 57/57. The full Maltline suite passes 627/627 across
  42 files; TypeScript and the Vite production build pass; scoped
  `git diff --check` passes. Table tests cover all 13 variants, authoritative
  field retention, immutability and source-mutation isolation, duplicates,
  mixed-tick rejection, fatal/clear/life/action simultaneous batches,
  first-match and reverse-most-recent selection, zero-point facts, all three
  life-loss causes, and exact live/replay text and announcement IDs.
- **Decision:** Accept this as a pixel- and copy-neutral P2-11 tranche. The
  shared boundary owns event facts and selection only; it does not merge live
  and replay wording, alter renderer effects, reinterpret proof events, or
  become a gameplay authority. Continue P2-11 with one bounded coordinate seam
  followed by stateless leaf-painter extraction, preserving painter order,
  effect entropy, pixels, presentation strings, and generation-2 proof output.
- **Tasks:** P2-11, P2-17, P2-18
- **Post-integration verification:** All 767 repository unit tests pass: 627
  Maltline, 67 platform, 58 Partition, and 15 shared-package tests. Every
  workspace and the assembled site build; the built-site smoke passes; and all
  144 Maltline Playwright checks pass. The 49-image manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and its manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Production emits `index-C_hIKL6M.js` and `index-OMJFi19V.css`; the npm
  production dependency audit reports zero vulnerabilities; and
  `git diff --check` passes. Independent verification and visual/accessibility
  audits accepted the tranche with no blocker.

## EXP-071 — Shared returning-jar coordinate truth

- **Date:** 2026-09-11
- **State:** The coordinate-cleanup portion of P2-11 is complete; stateless leaf
  painters remain active. No core engine, scenario admission, campaign, score,
  proof, authority, protocol, effect-entropy, painter-order, player-facing copy,
  or canvas-pixel change.
- **Hypothesis:** Moving the returning-jar threshold and truth-sensitive
  projection into the existing scenario-bound layout can remove the final
  renderer/fixture coordinate duplication, correct evidence metadata, and
  preserve exact output. Keeping the control rail on a shared numeric threshold
  should avoid introducing per-frame projection allocations into its jar scan.
- **Procedure:** Add the layout-owned numeric
  `returnApproachMaxFixedX = scenario.laneLength * FIXED_SCALE * 0.25` and a
  frozen `projectReturningJar(fixedPointX, lane)` result. Retain the exact
  formulas `anchorX = lanePx(fixedPointX)`,
  `groundY = laneBottom(lane) - 20`, and
  `finalApproach = fixedPointX <= returnApproachMaxFixedX`; for final approach,
  return the deeply frozen catch cue
  `{ x: frame.counterX + 3, y: groundY - 43, width: 70, height: 19 }`, otherwise
  `null`. Continue accepting finite off-track positions and delegate nonfinite-X
  and invalid-lane rejection to the existing layout validation. Make the
  control rail compare directly with `returnApproachMaxFixedX`, allocation-free;
  make the return-jar painter and visual-fixture metadata consume the full
  projection while leaving painter-local trail, arrow, body, pulse, label, and
  color choices in place.
- **Finding and repair:** Fixture metadata independently described the catch
  rectangle as `laneCenterY(lane) - 18`, while the painter used
  `laneBottom(lane) - 63`. The metadata was one pixel above the painter for the
  current 92px lane height and would diverge by 8.75px in the four-lane layout.
  It now spreads the exact projected cue. This is an evidence-only geometry
  correction: the renderer already painted the intended rectangle and no PNG
  changed.
- **Evidence:** Focused layout/renderer coverage passes 25/25, including exact
  threshold minus-one/equal/plus-one behavior; exact two-, three-, and four-lane
  coordinates; frozen results; invalid lane/nonfinite rejection; finite
  off-track acceptance; normal/reduced transcript shape; and simultaneous
  catch/move jar metadata. The full Maltline suite passes 629/629 across 42
  files. All 769 repository unit tests pass: 629 Maltline, 67 platform, 58
  Partition, and 15 shared-package tests. All workspaces and the assembled site
  build, the built-site smoke passes, and all 144 Playwright checks pass with no
  golden update. The 49-image manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and its manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Production emits `index-Dq2LM4N7.js` and `index-OMJFi19V.css`; the npm
  production dependency audit reports zero vulnerabilities; and
  `git diff --check` passes. Independent gameplay, verification, and
  visual/accessibility audits accepted the tranche without a blocker.
- **Source identity:** Final SHA-256 values are renderer layout
  `ea07420d13e5169ae3ae382d0eabe6513408fda444af70a43efbe8ac06c1b440`,
  renderer
  `ceb3cc6427b0dc2bec63c5b6713b7c3e22b8711fa4ea390fb960771882c08df9`,
  and visual fixtures
  `92dd12f84da875e8ba0361e01f81bcead77aca337fbf123219bf1c3e4978e29b`.
- **Decision:** Accept the coordinate seam and keep P2-11 active. The layout is
  a viewer-private projection authority, not gameplay or proof authority; no
  clamp or reinterpretation was added. Continue with one bounded stateless leaf
  painter family, preserving draw order, entropy, copy, generation-2 replay
  truth, and exact pixels.
- **Tasks:** P2-11, P2-17

## EXP-072 — Stateless vessel leaf painters

- **Date:** 2026-09-11
- **State:** P2-11 is complete. This final tranche changes only the viewer-private
  ownership of the soft-serve, cup, and jar leaf painters; it does not change
  core gameplay, proof, authority, layout, effects, goldens, player-facing copy,
  draw order, or canvas pixels.
- **Hypothesis:** Extracting one cohesive, stateless vessel family behind
  positional functions can reduce renderer ownership and make the primitive art
  directly testable without broadening the seam into orchestration or creating
  presentation drift.
- **Procedure:** Move `drawSoftServe`, `drawCup`, and `drawJar` into the
  viewer-private `renderer-vessel-painters.ts`, importing only `FlavorId` and
  the frozen visual theme. Preserve every canvas command, transform, gradient,
  path, default, save/restore boundary, and the cup-to-soft-serve composition.
  Replace the seven renderer call sites one-for-one while leaving order bubbles,
  slide/return/gauge orchestration, stations, effects, and layout in the
  renderer. The resulting leaf module is 161 lines and the renderer is now
  1,520 lines; these are the actual checked-in line counts, not a target metric.
- **Direct transcript evidence:** The command-recorder suite exercises every
  flavor cue; direct soft serve; ordinary, outgoing, and rotated/scaled cups;
  ordinary and emphasized jars; preservation of caller `globalAlpha`; exact
  transform, gradient, path, and text-state ordering; nested cup/soft-serve
  composition; and balanced saves/restores. Existing representative full-render
  transcript tests preserve their method sequences. Focused renderer/vessel
  coverage passes 31/31, and independent gameplay, verification, and
  visual/accessibility audits accepted the boundary with no blocker.
- **Repository evidence:** The complete unit total is 779: 639 Maltline, 67
  platform, 58 Partition, and 15 shared-package tests. All workspaces and the
  assembled site build, built-site smoke passes, and Playwright passes 144/144.
  No golden update was required. The 49-image manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and the manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Production emits `index-BrhkkiDF.js` and `index-OMJFi19V.css`; the npm
  production dependency audit reports zero vulnerabilities; and
  `git diff --check` passes.
- **Source identity:** Final SHA-256 values are vessel painters
  `e9805efcdd309744a3940b3521b5997a6465e7b47dc43f3d36206203ceef6056`,
  renderer
  `451ff2b865688dc25491fdeb8def2c5a83245fe5ccae93e781af90f6dc7ef95e`,
  and vessel-painter tests
  `995dce3c169333b035a1024d49589ed553920bc99ddcb93a040923c598d8cc5a`.
- **Decision:** Accept the vessel seam and close P2-11. Frozen theme, station
  policy, scenario layout, transient-effects ownership, structured event facts,
  return-coordinate truth, and the viewer-private vessel family now form the
  intended bounded presentation seams with exact tests and unchanged pixels.
  Extract broader painter families only in response to a concrete maintenance
  or truth need. P4-04 physical-device measurement and human-evidence tasks
  remain separate work, not unfinished P2-11 clauses.
- **Tasks:** P2-11

## EXP-073 — Supported synthetic resolution harness

- **Date:** 2026-09-11
- **State:** P0-17 is complete. The only critical private engine cast is
  centralized behind the test-only `src/testing` boundary and is absent from
  the production root, production bundle, human-lab, and proof graphs. Fatal
  walkout and terminal-immutability cases use publicly reachable engine state;
  only the two simultaneous resolution-order cases use the synthetic harness.
- **Hypothesis:** A deliberately narrow, unmistakably synthetic branch-entry
  harness can test fatal same-tick ordering without spreading mutable private
  casts or pretending to provide general snapshot restoration. Strictly
  describing the supported history should make the exceptional test seam safer
  and more reviewable than ad hoc engine-state mutation.
- **Implementation:** Add a strict exact-object and exact-array test boundary
  for running resolution states with idle input, no held/blending/washing state,
  and all customers spawned. It normalizes scenarios and run contexts through
  production boundaries, clones inputs, freezes its wrapper and descriptive
  initial state, and derives `jarsAvailable` and `nextId`. The harness validates
  scenario identity; finite/safe timers and positions; lanes, flavors, and
  phases; global positive ID uniqueness; spawn/resolution counters; truthful
  baseline score, lives, and streak; service and fulfillment ledgers; distinct
  fulfilled owners; rescue-jar ownership; exact active-customer phase and
  owned-jar histories; owner/jar lane agreement; and fixed rescue-threshold
  branch history. Its no-removal artifact contract permits unique fulfillment
  plus at most one rescue and rejects histories not representable by the
  retained customers/jars. Boundary endpoints are explicitly synthetic
  branch-entry checkpoints and are not claimed to be public post-tick snapshots.
- **Independent review and repairs:** Adversarial review found and closed gaps
  in the service-action ledger, fulfilled-owner accounting, phase-to-owned-jar
  history, jar lanes, and rescue-threshold branches. Accepted cases retain the
  two-live-jar rescue history and both first-drink threshold branches; rejected
  cases cover contradictory ownership, lane, service, and phase histories. The
  migrated simultaneous jar-before-catch and slide-before-fulfillment tests
  preserve the exact fatal event and terminal assertions, including no
  post-fatal score, catch, wash, or resolution mutation.
- **Test reliability cleanup:** The P1-04 recovery and player-model repeatability
  suites now share one canonical `beforeAll` artifact and perform only one fresh
  comparison for byte-repeat evidence. No timeout or telemetry/work-budget was
  increased. The replay visual tick-zero case now observes the synchronous
  terminal-stage reset atomically and pauses before the scheduled frame; this
  removes a transient Playwright polling race without changing production
  playback.
- **Evidence:** The final Maltline unit suite passes 657/657 across 45 files;
  all 797 repository unit tests pass (657 Maltline, 67 platform, 58 Partition,
  and 15 shared-package tests). All 144 Playwright checks pass. Every workspace
  and the assembled site build pass, as does the built-site smoke. Production assets
  remain `index-BrhkkiDF.js` and `index-OMJFi19V.css`. The 49-image manifest
  SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and its manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
  Independent audit accepted the repaired boundary.
- **Source identity:** Final SHA-256 values are the harness
  `b6c8dbde22e989c634e588b0b63977367b4a92ec7b2eeae0e684ac7204ca4ec8`,
  harness tests
  `609d40f1c0ff5162da6f2134f89beb3f1818f76b1cddd59a7ddbaf51a239cf29`,
  P1-04 tests
  `ce23866814c22fee3bde0518b8aeb22dafbf8616f9cb093a2d9763128112e9e2`,
  and player-model tests
  `8d39131d5faef0aea722107060b4f0d7b29f2423022a0f9536250e07c804c2be`.
- **Decision:** Close P0-17. Keep the adapter narrow, test-only, and explicitly
  synthetic; do not expose snapshot restoration or testing state through the
  production engine. The timeout-free reliability changes do not alter
  gameplay, telemetry budgets, proof behavior, or production code.
- **Tasks:** P0-17

## EXP-074 — Release asset and privacy disclosure gate

- **Date:** 2026-09-11
- **State:** P4-02 is complete as an engineering review, not legal advice. The
  separately licensed production runtime assets are exactly four self-hosted
  `@fontsource/noto-sans` 5.3.0 Latin weights. The game uses code-native art;
  production contains no raster, audio, or generated-media asset, and test PNGs
  are excluded.
- **Hypothesis:** Exact asset inventory, license delivery, production-graph, and
  privacy assertions can turn release disclosure expectations into a fail-closed
  local gate without claiming deployment verification, legal counsel, or human
  testing.
- **Asset boundary:** A machine-readable manifest pins the exact font files,
  byte sizes, hashes, and inline favicon. The exact 4,518-byte OFL notice has
  SHA-256
  `54ec7b5a35310ad66f9f3091426f7028484cbf9ae1ab5da30122ee412a3009e1`
  and ships at the asserted route with the asserted `rel` license relationship.
  Vite uses `assetsInlineLimit: 0`. Tests compare the actual Maltline package
  and assembled site against an exact allowlist, perform a case-insensitive
  embedded-media scan, and permit only the manifest-pinned inline favicon
  exception.
- **Privacy boundary:** The full Vite production graph is checked for
  local-storage, session-storage, IndexedDB, and direct cookie writes. Source and
  deploy assertions pin the privacy route and the explicit same-origin
  submission facts. Human-lab isolation remains intact. These checks describe
  reviewed source and assembled artifacts; they do not attest a deployment.
- **Independent review and repairs:** Adversarial review found and closed inline
  asset, favicon-exception, case-folding, and production-graph bypasses. The
  resulting site smoke covers the browser route, resources, fonts, license,
  privacy disclosure, and fixture isolation. Independent audit accepted the
  repaired gate without a blocker.
- **Evidence:** The final Maltline unit suite passes 657/657 across 45 files;
  all 797 repository unit tests pass (657 Maltline, 67 platform, 58 Partition,
  and 15 shared-package tests). All 144 Playwright checks pass. Every workspace
  and the assembled site build pass, as does the built-site smoke. The production
  dependency audit reports zero vulnerabilities. Production assets remain
  `index-BrhkkiDF.js` and `index-OMJFi19V.css`; the 49-image manifest SHA-256
  remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and its manifest-ordered raw-image SHA-256 remains
  `1774541041086fa5ecd74d88c293f1ff332633de4d24db67045c0e748b6b7308`.
- **Decision:** Close P4-02. Retain these automated disclosure checks as an
  engineering release gate. P4-01 discoverability, P3-14 deployed admission
  capacity, P4-04 reference-device validation, and P2-06 paid audio remain
  separate work; this experiment does not claim those tasks, legal review,
  deployed-state verification, or participant evidence are complete.
- **Tasks:** P4-02

## EXP-075 — Cross-game launcher and selective production assembly

- **Date:** 2026-09-11
- **State:** P4-01 is complete locally; no production deployment was performed.
  ArcadeBench now has a dedicated static root launcher with equal native links
  to Partition and Maltline, permanent self-canonical game routes, and a
  coherent noindex recovery page. The launcher imports one site stylesheet and
  no JavaScript, game bundle, media, API, or browser-persistence surface.
- **Implementation:** Replace the copied Partition root with a neutral
  code-native arcade foyer. Selectively assemble only Partition's reviewed
  entry/root asset namespace and Maltline's route-scoped entry/assets/license,
  excluding Vite source trees and lab/fixture artifacts. Add site-global
  sitemap/robots/metadata, explicit immutable-versus-revalidate cache policy,
  security headers, exact local CSP emulation, legacy viewer redirects, and
  Worker Static Assets `auto-trailing-slash` with Worker-first and custom-404
  behavior retained. Partition `/r/:id` now redirects to
  `/partition/?mode=replay&replay=...` instead of the launcher.
- **Cloudflare deployment contract:** The platform guidance kept
  `run_worker_first: true` so apex/www and API behavior remain Worker-owned,
  made `html_handling: auto-trailing-slash` explicit, used `404-page`, and
  favored selective static assembly. These are locally schema- and
  behavior-checked declarations, not a claim about deployed state.
- **Visual/accessibility evidence:** Five exact images cover 1280×720,
  700×600, 390×720, 320×568, and focused 700px. Tests enforce semantic native
  links, focus order, 44px actions/footer links, zero horizontal overflow,
  reduced motion, forced colors, route identity, custom 404 recovery, pinned
  browser inventory, and exact pixels. Visual review accepted the distinct
  cyan/angular Partition and pink/cream/rounded Maltline treatments at every
  size. Launcher HTML, CSS, and 404 SHA-256 values are respectively
  `cee996b8aced5e49359044e4b231450f18bb554168d72656753975fbd89d6e95`,
  `a46bdaca448be7e676f2395e7357c653d5b660c40090b82bcda28edb8dfff60f`,
  and `bc5fdc5894ef71c4684b8b698ed1a0febeff9f232db166c90e24e87b919af930`.
- **Fresh-entry and routing evidence:** Independent assembled-browser review
  held Partition at home/tick `0000` and Maltline at title/tick 0/zero recorded
  inputs. Focused platform integration pins the retained replay 302 and no
  cookie. Both games and policy routes execute under the exact production CSP
  without console, page, or request failures.
- **Repository evidence:** All 798 unit tests pass (658 Maltline, 67 platform,
  58 Partition, and 15 shared-package tests); Maltline Playwright passes
  144/144 and site Playwright passes 10/10. Every workspace and assembled site
  build, the general built-site smoke, production dependency audit, and
  `git diff --check` pass. Maltline production remains
  `index-BrhkkiDF.js`/`index-OMJFi19V.css`. The user-edited Partition sitemap
  was preserved at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision:** Close P4-01. Keep deployment parity, broader runtime-entry
  regression coverage, exact recursive inventory, and visual-environment
  portability explicit rather than treating local emulation as live evidence.
- **Tasks:** P4-01, P4-06, P0-47, P0-48

## EXP-076 — Post-launcher technical-debt review

- **Date:** 2026-09-11
- **State:** P0-46 is complete. Independent gameplay, verification, and
  visual/accessibility reviews inspected the settled P4-01 tree read-only and
  found no reason to reopen the launcher tranche. Reports are
  `audits/TECH-DEBT-11-GAMEPLAY.md`,
  `audits/TECH-DEBT-11-VERIFICATION.md`, and
  `audits/TECH-DEBT-11-VISUAL.md`.
- **Highest-priority debt:** Replace duplicated route/inventory expectations
  with one exact recursive release contract, and exercise actual Wrangler/
  Workers Static Assets behavior before deployment. The current local server is
  intentionally an emulator even though its CSP, cache, slash, redirect, and
  404 declarations are exact and passing.
- **Evidence hardening:** Add committed cross-game runtime/fresh-entry checks,
  canonical `www` GET/HEAD tests, bounded 404 and 699px evidence, and post-deploy
  apex/www/header probes. Manual execution already passes; the gap is durable
  regression and external-state evidence.
- **Portability and ownership:** Exact launcher typography currently depends on
  host Inter. Pin licensed font bytes or a verified visual environment, move
  root site-browser dependency ownership out of the Maltline workspace, and
  ignore root test-result artifacts. Preserve the no-JavaScript launcher and
  use test-only contracts for static game facts.
- **Lower-priority polish:** When launcher copy next changes, narrow the broad
  controller sentence and expose visible device facts through accessible
  descriptions. Keep the cohesive stylesheet intact until another site surface
  creates a real ownership boundary.
- **Decision:** Close P0-46 and queue P0-47, P0-48, and P4-06. These are bounded
  release-evidence and maintenance tasks; none changes deterministic gameplay,
  proof authority, current route correctness, or the P4-01 completion verdict.
- **Tasks:** P0-46, P0-47, P0-48, P4-06

## EXP-077 — Exact site contract and production-bundle boundary

- **Date:** 2026-09-11
- **State:** P0-47 is complete. P0-48 and P4-06 are active rather than
  complete: root browser dependency/result hygiene and local production-shaped
  routing evidence landed, while portable typography and actual deployed-edge
  parity remain open. No deployment was performed.
- **Release contract:** One deeply frozen, data-only contract now owns the site
  route files, explicit static files, hashed asset families, canonical hosts,
  redirects, cache/security headers, sitemap/robots inputs, Wrangler Static
  Assets settings, permitted extensions, and per-file/aggregate ceilings. The
  builder starts from an empty output, rejects missing, duplicate, unsupported,
  oversized, nested, symlinked, or escaping inputs, and requires checked-in
  policies to equal their deterministic renderings. The independent smoke
  requires the exact recursive output and exact reference-to-shipped-asset
  equality. The accepted artifact contains exactly 24 files and 444,575 bytes.
- **Launcher and entry evidence:** Seven exact PNGs cover the launcher at
  1280×720, 700×600, 390×720, and 320×568, focused keyboard state at 700px,
  and the custom 404 at 1280×720 and 390×720. Browser checks retain the
  no-script launcher, native named/described cabinet links, metadata,
  responsive containment, 44px targets, focus order, reduced motion, forced
  colors, baseline inventory, and exact image hashes. New real-entry checks
  activate each cabinet through ordinary links, keep Partition at home/tick
  `0000` without `autostart`, and keep Maltline at title/tick 0 with zero
  recorded inputs. Console, page, request, and response failures are collected.
- **Wrangler and composite routing evidence:** Root now owns exact
  `@playwright/test` 1.63.0 and ignores `/test-results/`. Ajv validates the
  complete installed Wrangler schema. Wrangler 4.124.0 `deploy --dry-run`
  builds without uploading. A separate `wrangler dev --local` composite probe
  observes exactly three parsed redirects and 16 parsed header rules; the
  Worker-first health route; launcher/static CSP and cache headers;
  query-preserving slash and legacy redirects; hidden `_headers` and
  `_redirects` controls; custom-404 content; and empty-body HEAD behavior. The
  separate root Playwright entry suite loads both game entries under the
  contract emulator's exact CSP. The local runtime does not propagate an
  overridden `Host` header into the Worker URL reliably, so direct workerd
  integration separately pins GET and HEAD `www`-to-apex 308 responses, exact
  path/query preservation, no cookie, empty body, and no anonymous-session
  insert. This Miniflare limitation is recorded, not treated as deployed-host
  evidence.
- **404 observation and emulator repair:** Wrangler Local serves an arbitrary
  missing pathname with the reviewed `404.html` body but applies the incoming
  pathname's default `public, max-age=0, must-revalidate` policy; direct
  `/404.html` retains its explicit `no-store` rule. The lightweight site server
  originally overclaimed `no-store` for every custom 404. It now passes the
  requested pathname through the shared cache matcher, and browser/smoke checks
  distinguish arbitrary missing routes from direct `/404.html`.
- **Worker graph repair:** Dry-run inspection found both game root barrels in
  platform production imports. Maltline pulled telemetry, P1-08 experiments,
  physical/browser input mediation, and other offline initializers; Partition
  pulled benchmark/session code with literal `node:fs` and `node:path`
  dependencies. Narrow `@arcadebench/maltline/verifier` and
  `@arcadebench/partition/verifier` leaf exports now expose only the authority,
  proof, engine, campaign, version, and types the platform uses, without
  changing either root barrel or tooling behavior. The dry-run Worker shrank
  from 230,221 to 201,177 bytes, from 51,323 to 44,448 gzip bytes, and from 44
  to 31 source-map entries. Final Worker SHA-256 is
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
- **Fail-closed bundle gate:** The post-dry-run audit requires bounded regular
  `worker.js` and `worker.js.map` files, an external non-empty version-3 source
  map with aligned source content, required verifier/platform sources, a
  256-KiB JavaScript regression ceiling, and zero Maltline
  telemetry/experiment/viewer/testing/root-barrel or Partition
  benchmark/runtime/viewer/testing/root-barrel sources. It also rejects
  `node:fs` and `node:path` in emitted code or retained source. Four adversarial
  tests cover the accepted leaf graph, every prohibited family and both root
  barrels, Node builtin contamination, malformed maps, and oversized output.
- **Validation:** All 799 repository unit tests pass, including 68 platform
  tests. Maltline Playwright passes 144/144. The initial delegated root-site
  suite passed 18/18; after the exact direct-404 cache assertion landed, the
  settled root rerun passes 19/19. Partition, Maltline, platform, all workspace,
  and assembled-site builds pass, as do exact site smoke, Wrangler dry-run,
  composite Wrangler-local routing, bundle audit, and `git diff --check`. The
  user-edited Partition sitemap remains byte-exact at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision:** Close P0-47. Keep P0-48 active until root raster evidence no
  longer depends on host Inter/`ubuntu-latest`, either through licensed pinned
  font bytes or a fully pinned visual runtime. Keep P4-06 active until a real
  post-deploy probe verifies apex and `www`, GET and HEAD, redirects, custom
  404s, CSP/security headers, and cache behavior at the edge. Local Wrangler,
  workerd, and the emulator substantially narrow that risk but do not establish
  live DNS, zone, transform, cache, or deployment state.
- **Tasks:** P0-47, P0-48, P4-06

## EXP-078 — Truthful fulfillment chains and source-bound Stage 8 relief evidence

- **Date:** 2026-09-11
- **State:** P0-49 and P0-50 are complete. This tranche repairs a
  presentation-only score claim and records a fixed prospective Stage 8
  experiment. The experiment is self-attested, offline, and unranked: it does
  not register an authority or season, emit a ranked proof, promote the
  candidate, or deploy anything. P1-02, P1-04, P1-08, and P1-10 remain active.
- **Presentation truth:** The HUD and semantic status now describe consecutive
  first fulfillments as `CHAIN N` instead of implying a score multiplier.
  Engine event points and scoring are unchanged, live and replay semantics
  agree, and human-lab revision 10 binds the repaired presentation so stale
  revision-9 artifacts are rejected. Seventeen of 49 reviewed Maltline images
  changed. The 49-image manifest SHA-256 is
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`;
  the lexicographically ordered raw-PNG SHA-256 is
  `73e3de37c6c87ad4df4bfe7af4989c888b4bd4d74836ace43c020bdfa0a90255`.
- **Fixed comparison:** The only candidate change is Closing Time's initial
  `spawnIntervalTicks`, from 132 to 138. Across four fixed controllers and 33
  fixed seed offsets, reactive completion remains 33/33; delayed improves from
  31/33 to 33/33; physical-intent delayed improves from 30/33 to 33/33; and the
  novice profile remains 0/33 without reaching Stage 8. Attempt-duration
  min/median/mean/max seconds are respectively reactive
  360.600/360.750/360.775/361.033 to
  363.600/363.750/363.775/364.033; delayed
  365.117/368.000/369.629/376.217 to
  366.483/370.600/371.200/380.350; physical-intent delayed
  365.117/368.233/369.631/376.883 to
  367.100/370.433/371.298/380.483; and unchanged novice
  49.617/112.600/100.312/175.383.
- **Loss and recovery result:** Control-to-relief loss totals
  `(walkout, shake, jar)` are reactive `(0,0,0)` to `(0,0,0)`, delayed
  `(14,0,2)` to `(6,0,2)`, physical-intent delayed `(14,0,6)` to `(6,0,6)`,
  and novice `(0,108,24)` unchanged. Fatal Stage 8 runs/cascades change from
  2/2 to 0/0 for delayed and from 3/3 to 0/0 for physical-intent delayed.
  Delayed control cascades contain exactly four losses and span
  121/133.5/133.5/146 ticks (min/median/mean/max); physical-intent control
  cascades contain 3/4/3.667/4 losses and span 50/121/105.667/146 ticks.
  Recovery is deliberately structural rather than causal: life losses pair
  greedily one-to-one with later first-fulfillment events using within-tick
  event ordinals. Jar-scarcity rates divide each raw scarcity-tick count by its
  run's observed Stage 8 ticks and round to six decimals.
- **Prefix execution and independent review:** The fixed run ledger reports
  264 logical campaign outcomes, 132 executed prefixes, 132 reused prefixes,
  1,006 stage/controller starts, and 2,736,116 campaign ticks, controller
  calls, and engine steps. Prefixes contain only deeply frozen run counters,
  completion state, and loss totals; no engine or controller instance is
  reused. Independent rereview executed all 132 relief cases as fresh full
  eight-stage campaigns and matched every terminal outcome, and confirmed all
  132 control/relief pairs differ only at Stage 8.
- **Authority and result identity:** The unchanged generation-2 authority
  configuration SHA-256 is
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`.
  Baseline and relief campaign fingerprints are
  `fnv1a64:adc596f1154aeafa` and `fnv1a64:dda799c718f032f8`.
  The experiment fingerprint is `fnv1a64:cd875f6472067ad5`; result SHA-256 is
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`.
  The canonical payload is 333,137 bytes with SHA-256
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`.
- **Portable provenance:** The one-document CLI envelope is 533,781 bytes with
  SHA-256
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`;
  its canonical integrity SHA-256 is
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`.
  Producer source, simulation-kernel, and build-recipe SHA-256 values are
  `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7`,
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`,
  and `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24`.
  Controller-registry SHA-256 is
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`.
  The recipe pins Node 22.19.0, TypeScript 7.0.2, and tsx 4.23.12. Strict
  current-source verification covers the exact local import graph and rejects
  prohibited proof, competition, platform, human-lab, and production-root
  closure. Future workspace-package alias resolution is non-blocking hardening
  assigned to P0-51; the reviewed graph contains no such import.
- **Validation:** All 812 repository unit tests pass: 671 Maltline, 68
  platform, 58 Partition, and 15 shared-package tests. Maltline Playwright
  passes 145/145 and root site Playwright passes 19/19. All workspace and
  assembled-site builds pass; the exact site contains 24 files and 444,656
  bytes. Maltline site smoke, Wrangler dry-run, composite Wrangler-local
  routing, scoped tranche secretlint, privacy scanning across 154 files, and
  `git diff --check` pass. The Worker remains 201,177 bytes, 44,448 gzip bytes,
  and 31 source-map entries with SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The protected user-edited Partition sitemap remains byte-exact at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
  No audio changed and no paid audio acquisition occurred.
- **Decision:** Keep the Stage 8 candidate prospective until human evidence
  supports a generation/authority/season promotion decision. Close P0-49 and
  P0-50; begin P0-51 without treating future alias-walker hardening as a
  blocker to this exact source-bound artifact.
- **Tasks:** P0-49, P0-50, P0-51, P1-02, P1-04, P1-08, P1-10

## EXP-079 — Twelfth technical-debt review after source-bound relief evidence

- **Date:** 2026-09-11
- **State:** P0-51 is complete. Independent gameplay, verification/release,
  and visual/accessibility reviews examined the settled EXP-078 tree in
  `audits/TECH-DEBT-12-GAMEPLAY.md`,
  `audits/TECH-DEBT-12-VERIFICATION.md`, and
  `audits/TECH-DEBT-12-VISUAL.md`. All three found zero P0 blockers and no
  reason to reopen generation 2, EXP-078, or P0-50.
- **Gameplay verdict:** Generation 2 remains the truthful ranked baseline and
  the 138-tick Stage 8 candidate remains a strong prospective sensitivity
  result, not an optimum or promotion decision. Three P1 findings reserve
  promotion/closure for blinded human Stage 8 preference and recovery evidence,
  successful full-run human duration, and an explicit lives/score policy
  decision. Four P2 findings preserve structural rather than causal recovery
  wording, status/exposure caveats for scarcity, a fresh-run prefix oracle,
  score-comprehension research, and host-sensitive test throughput. Generation
  3 and its human evidence stay mapped to P1-02, P1-04, P1-10, and P4-05 rather
  than creating another promotion task.
- **Verification verdict:** The exact self-attested unranked payload, source and
  kernel closures, build/toolchain recipe, canonical hashes, 264-outcome work
  ledger, prefix isolation, generation-2 authority, and production/Worker
  exclusions reconcile. The current 21-file producer and 19-file kernel use no
  bare workspace import. One P1 future boundary remains: the walker follows
  relative/absolute local imports but can mistake a bare `@arcadebench/*`
  workspace import for an external package. P0-52 must reject or exactly
  resolve those aliases, exercise adversarial root/subpath/re-export/
  import-equals/unresolved cases, and produce new provenance identities before
  a later artifact revision. It does not invalidate EXP-078.
- **Visual verdict:** The `CHAIN N` repair, exact point feedback, semantic
  parity, reduced-motion result, and strict human-lab revision 10 are accepted.
  P0-53 owns the two objective P1 residuals: update the stale Stage 7 style-board
  hashes to
  `4cbdf4a0fbb177de113bbe0429c64f16a643177b165a638b8f4d6f5bf78129cf`
  and
  `8f31e6a793e6dabbd9d6b61260c111ecc60abb1c9cfce6d5024876f2738c7dc3`,
  replace two presentation-facing `streak` terms with first-fulfillment-chain
  language, and add a dominant non-color numeric lives-role label. Its evidence
  must cover exact 0/1/2/4 lives, 1280/700, normal/reduced motion, and game over;
  participant-visible changes require another strict human-lab revision.
- **Promotion-only evidence:** Do not add or repin a static Stage 8 candidate
  golden merely to support the current unranked experiment. If the candidate
  enters a generation-3 promotion packet, add engine-derived control/candidate
  sequences or density envelopes at fixed ticks and peak pressure, including
  700px reduced-motion geometry and exact scenario identity. Static goldens can
  prove pixels, containment, and density at sampled states; they cannot prove
  pacing, recovery fairness, fun, fatigue, or the 5–15-minute human objective.
- **Bounded evidence debt:** P0-54 queues a committed independent full-campaign,
  non-prefix-reused oracle for all optimized A/B outcomes and a throughput
  repair that does not raise experiment tick/callback limits or paper over the
  default test timeout. Descriptor/node/byte preflight for the in-memory object
  verifier and supervised callback CPU are conditional: require them before
  accepting untrusted/extensible callers or moving the tool into a shared
  service, not for the present fixed offline CLI.
- **Focused evidence:** Gameplay's P102/scoring/presentation gate passed 22/22,
  verification's P102/authority/proof/production-boundary gate passed 76/76,
  and its Worker-bundle audit passed 4/4. Visual presentation/session/lab units
  passed 51/51 and five targeted exact browser checks passed. Both gameplay and
  verification reproduced the one-document 533,781-byte P102 CLI artifact at
  SHA-256
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`;
  focused Maltline builds passed.
- **Host-load caveat:** The P1-04 fresh-repeat assertion retains the default
  five-second Vitest timeout and took 6.173 seconds beside player models and
  6.857 seconds alone on the heavily CPU-contended review host. Its semantic
  assertions passed, and the settled root full suite had already passed all 812
  repository unit tests. TD-12 therefore classifies this as P2 throughput
  brittleness, not contradictory gameplay evidence and not justification to
  raise semantic work limits or blanket timeouts.
- **Decision:** Close P0-51. Start P0-52 and P0-53; queue P0-54. Keep the Stage 8
  candidate prospective and preserve generation 2. Human/promotion decisions
  remain under P1-02, P1-04, P1-10, and P4-05.
- **Tasks:** P0-51, P0-52, P0-53, P0-54, P1-02, P1-04, P1-10, P4-05

## EXP-080 — Numeric lives-role truth and Stage 7 evidence repair

- **Date:** 2026-09-11
- **Presentation contract:** `LIVES N` is now the primary, state-derived lives
  role in the gameplay HUD. One subdued cup remains only while lives are above
  zero as secondary cabinet art; it is not a count. Semantic status continues
  to report the same exact state-derived lives with singular/plural wording.
  Rules, scoring, campaign, proof, and authority behavior did not change.
- **Bounded evidence:** Exact Canvas transcripts cover 0, 1, 2, and 4 lives in
  normal and reduced motion. Browser geometry proves separation from stage
  copy, `ORDERS LEFT`, and the canvas edge at 1280px and the supported 700px
  boundary. The evidence includes the early four-life state, Stage 7 with one
  life, and game over with zero lives. Forty-one of 49 PNGs changed in the
  update run wherever the shared gameplay canvas is visible; all 49 current
  images and their exact goldens were independently verified. These tests and
  source-resolution inspections prove deterministic rendering and containment,
  not human comprehension at cabinet distance.
- **Study boundary:** Human-lab artifacts remain schema 3 and advance to
  revision 11 because the HUD change is participant-visible. Revision 11 is the
  sole accepted and emitted revision across human and test-driver paths;
  revision 10 is rejected. Ranked submission remains forbidden from the lab.
- **Visual identities:** The baseline manifest SHA-256 is
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`.
  The lexicographically ordered raw-PNG SHA-256 is
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
  Corrected Stage 7 SHA-256 values are
  `ca2e3213bd418bfccad358531ea3b50f94e4b53c974d3e776d405afb6faa6dd9`
  at 1280px and
  `e1cd2b6f098ced3561464da5eb8deb618ceb32efe13ef3bed7b45673d258d6c7`
  at 700px. Presentation-facing style-board terminology now describes the
  first-fulfillment chain rather than a score multiplier or generic streak.
- **Authority isolation:** Ruleset version 2, campaign generation 2, proof
  version 1, and authority configuration SHA-256
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
  remain unchanged. Production graph checks continue to exclude lab and test
  modules. No audio or deployment change occurred.
- **Validation:** The settled root passes all 814 repository unit tests: 673
  Maltline, 68 platform, 58 Partition, and 15 shared-package tests. Maltline
  Playwright passes 146/146 and root site Playwright passes 19/19. Relevant
  workspace and assembled-site builds, Maltline and site smokes, Wrangler
  dry-run and local checks, scoped secretlint, privacy scanning across 154
  files, and `git diff --check` pass. The exact assembled site contains 24
  files and 444,892 bytes. The Worker remains 201,177 bytes, 44,448 gzip bytes,
  and 31 source-map entries with SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The protected user-edited Partition sitemap remains byte-exact at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Independent review and decision:** Verification review found no gameplay,
  proof, authority, accessibility, or release blocker. Close P0-53. P0-52
  remains active and P0-54 remains queued. This is one substantial
  implementation after TD-12, so TD-13 is not yet due.
- **Tasks:** P0-52, P0-53, P0-54, P1-04, P1-10

## EXP-081 — Fail-closed P102 source provenance

- **Date:** 2026-09-11
- **State and scope:** P0-52 is complete. The prospective Stage 8 relief
  experiment remains self-attested, offline, unranked, and schema 1. This
  tranche hardens only its source/build provenance and parser verification; it
  does not change the registered generation-2 campaign, rules, engine, proof,
  controller behavior, experiment matrix, or ranked/production imports.
- **Exact dependency policy:** Every bare `@arcadebench/*` root, subpath, other
  workspace, and unresolved workspace specifier is rejected in static imports,
  re-exports, import-equals declarations, and import-type expressions. The
  walker follows only resolved relative/absolute local imports and permits the
  exact reviewed external set `node:crypto`, `node:fs/promises`, `node:path`,
  `node:url`, `typescript/unstable/ast`, and `typescript/unstable/sync`. Every
  other bare/package/path alias is rejected, including `#` package imports and
  TypeScript `paths` aliases. Dynamic imports, CommonJS/runtime loader seams
  (`require`, `require.resolve`, `module.require`, and `createRequire`), local
  module declarations/augmentations, triple-slash path/type/lib references,
  and AMD module/dependency directives fail closed. Realpath containment,
  UTF-8/LF normalization, the 256-file and 4-MiB graph ceilings, the sole
  reviewed relative viewer adapter, and proof/competition/platform/human-lab/
  production-root exclusions remain enforced.
- **Legacy compatibility:** The exact EXP-078 schema-1 envelope remains
  533,781 bytes with formatted SHA-256
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`
  and canonical integrity SHA-256
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`.
  Its producer-source and build-recipe SHA-256 values remain
  `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7`
  and
  `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24`.
  It is accepted only when archival callers explicitly set
  `verifyCurrentSource: false`; default/current-source verification rejects it
  as historical rather than silently relabeling it current.
- **Current identities:** The hardened 21-file producer source SHA-256 is
  `9dfa303bd5974f4c2ea9761c2c9cb03c52c39e5b910169997f3d45ff94e71d67`;
  the build-recipe SHA-256 is
  `16a87515d640ebaabd6b173e91e14946dbbdb1c23d2cd032f54a98161091d31f`.
  The current formatted envelope remains 533,781 bytes and is
  `947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64`;
  its canonical integrity is
  `ed3e6b18bb7905f35d2a6b68d17d7894ac28ddee9416f54fe614561843e70b97`.
- **Unchanged experiment facts:** The 19-file simulation-kernel SHA-256 remains
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`;
  controller-registry SHA-256 remains
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`.
  Experiment fingerprint `fnv1a64:cd875f6472067ad5`, result SHA-256
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`,
  and the 333,137-byte payload SHA-256
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`
  are byte-exact. Work remains 264 logical outcomes, 132 executed and 132
  reused prefixes, 1,006 stage/controller starts, and 2,736,116 campaign
  ticks, controller calls, and engine steps.
- **Validation:** The settled P102 source/provenance suite passes 16/16,
  including workspace syntax, unresolved/dynamic/local escapes, package/path
  aliases, runtime loaders, import types, directives, module declarations,
  ordinary calls, legacy parsing, and the supported public CLI. The full
  Maltline unit suite passes 678/678 across 46 files; a focused gameplay/
  presentation/provenance slice passes 69/69. Maltline build passes with 44
  production modules, the Worker bundle audit passes 4/4, two supported
  `npm run --silent relief:p1-02 --workspace=@arcadebench/maltline` executions
  are byte-identical one-document JSON, and `git diff --check` passes.
- **Decision:** Close P0-52 without revising the experiment payload or ranked
  authority. Preserve EXP-078 as an exact archival schema-1 artifact and use
  the new producer/build/envelope identity for current-source claims. Start
  P0-55 for the post-P0-52/P0-53 review; keep P0-54 and all human tuning/
  scoring decisions separate.
- **Tasks:** P0-52, P0-54, P0-55, P1-02, P1-04, P1-08, P1-10

## EXP-082 — Thirteenth technical-debt review after provenance and lives truth

- **Date:** 2026-09-11
- **State:** P0-55 is complete. Independent gameplay/evidence, verification/
  release, and visual/accessibility reviews examined the settled P0-52/P0-53
  tree in `audits/TECH-DEBT-13-GAMEPLAY.md`,
  `audits/TECH-DEBT-13-VERIFICATION.md`, and
  `audits/TECH-DEBT-13-VISUAL.md`. All three found **zero P0 blockers**, accept
  P0-52 and P0-53, and find no reason to change or reopen generation 2,
  ruleset 2, proof schema 1, ranked authority, or the prospective EXP-078
  gameplay result.
- **Gameplay and evidence verdict:** Numeric `LIVES N`, truthful `CHAIN N`,
  event-local points, semantic status, and human-lab revision 11 are coherent.
  Automated Stage 8 relief remains a sensitivity result, not a promotion
  decision. The existing A/D lab covers Stages 4–7 and the different EXP-049 D
  candidate, so it cannot decide the Stage 8 132-to-138 candidate. Successful
  full-run human wall time, Stage 8 preference/recovery, and the carried-lives
  score-policy decision remain assigned to P1-02, P1-04, P1-08, and P1-10;
  simulation is not substituted for participant evidence.
- **P0-54 mapping:** The older P108 portable-envelope walker still follows only
  relative/absolute specifiers and can ignore the bare aliases and other static
  dependency forms that P0-52 now rejects for P102. Its current fixed graph has
  no `@arcadebench/*` import, so the retained P108 artifact is not invalidated.
  Before another P108 current-source revision, P0-54 must converge P108 and
  P102 on one parameterized, fail-closed, entry-scoped AST policy with exact
  external and viewer allowances. P0-54 also retains the committed all-fresh
  132-pair P102 oracle, source-security/simulation test separation, and
  throughput repair without higher semantic tick limits or blanket timeouts.
  Object-size preflight and supervised callback CPU/memory stay conditional on
  accepting untrusted/extensible callers or becoming a service.
- **P0-56 mapping:** Three hashes in `VISUAL-DIRECTION.md` predate the accepted
  P0-53 lives pixels. Update documentation only, from
  `775424947ff31f734850e8d50403f76e5b98db40cd8398885d170a41d2bd17eb`
  to `6bfd44f62f2ab5ab0fb7b6e30977aa24c3b6771c4ef751d434910a2e8d8ec594`
  for `reduced-motion.png`, from
  `38cde586dfde23d34c773076be1d2bc648cacbe9782d0b491b7135a9696cbdaa`
  to `56caf63ebe1309a9ac53520f6633d3d680ad6d811f51711d2cdacc9cce35f5ae`
  for `ready.png`, and from
  `c2a3d7530de0003c43cda2a984cf77acab2b90876914802cce5ac2401c74eecc`
  to `ee17903de9fab23eb25a0b24c96d83ccc5f458362381d9953030929fae18c75e`
  for `jar-miss.png`. P0-56 must not regenerate or modify PNGs.
- **P0-57 mapping:** The exact Playwright comparison protects pixels against
  checked-in files, but the baseline manifest machine-checks inventory and
  toolchain rather than each PNG digest or the ordered-raw digest. Add a sorted
  per-file digest ledger and ordered-raw aggregate without self-hashing the
  manifest. In the same bounded pixel-neutral evidence tranche, move the
  duplicated orders/lives HUD rectangles into frozen shared frame authority.
  Correct fixture metadata so zero lives does not claim the strawberry color
  of a cup that the renderer omits; positive lives must retain it. These are
  evidence/geometry repairs, not reasons to reopen P0-53 or revise the lab.
- **P0-58 mapping:** The current envelope is exact on the reviewed Node 22.19.0
  host, but CI selects floating Node 22 while the formatted hash includes the
  exact runtime string. The recipe also reports TypeScript/tsx versions from
  the lock rather than independently proving they are the executing packages.
  Separately, source bytes are read and hashed from disk after a TypeScript
  snapshot supplies the AST, leaving a concurrent-edit/config race. Before any
  later current-source portable artifact, P0-58 must pin Node 22.19.0 in a
  repository-owned declaration and CI, fail on runtime-package/lock mismatch,
  and reject any AST-text/disk/config drift through an atomic or verified
  snapshot boundary. Entry-specific external restrictions may reuse P0-54's
  shared graph policy.
- **Retained P2/conditional boundaries:** Keep archival and current-source
  verification distinct if a new caller is added; do not expose a caller-
  controlled downgrade boolean in ranked or promotion code. Keep the present
  producer/kernel external set scoped before the kernel changes. Cabinet-
  distance comprehension, reference-device control feel, live deployment
  parity, audio acquisition, and participant outcomes remain external evidence,
  not autonomous refactor work.
- **P0-52 identity reconciliation:** Historical EXP-078 remains schema 1,
  533,781 bytes at
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`
  with integrity
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`,
  and is archival-only under explicit `verifyCurrentSource: false`. The current
  producer/build/envelope/integrity SHA-256 values are respectively
  `9dfa303bd5974f4c2ea9761c2c9cb03c52c39e5b910169997f3d45ff94e71d67`,
  `16a87515d640ebaabd6b173e91e14946dbbdb1c23d2cd032f54a98161091d31f`,
  `947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64`,
  and `ed3e6b18bb7905f35d2a6b68d17d7894ac28ddee9416f54fe614561843e70b97`.
  Payload, result, kernel, controller registry, and work remain exact at
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`,
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`,
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`,
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`,
  and 2,736,116 ticks/calls/steps across 264 logical outcomes, 132 executed
  prefixes, 132 reused prefixes, and 1,006 stage/controller starts.
- **Settled validation:** All **819 repository unit tests** pass: 678 Maltline,
  68 platform, 58 Partition, and 15 shared-package tests. Maltline Playwright
  passes 146/146 and root site Playwright passes 19/19. All relevant workspace
  and assembled-site builds pass; the exact site contains 24 files and 444,892
  bytes. Site/Maltline smoke, Wrangler dry-run and composite local routing,
  scoped secretlint, privacy scanning across 154 files, and `git diff --check`
  pass. The Worker remains 201,177 bytes, 44,448 gzip bytes, and 31 source-map
  entries at SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The 49-image manifest SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`
  and ordered raw-PNG SHA-256 remains
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
  The protected Partition sitemap remains byte-exact at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision:** Close P0-55 with zero P0 findings. Start P0-56 as the smallest
  objective next repair; keep P0-54, P0-57, and P0-58 queued. Do not regenerate
  images, promote the Stage 8 candidate, or change generation 2 until their
  separately stated evidence gates are met.
- **Tasks:** P0-54, P0-55, P0-56, P0-57, P0-58, P1-02, P1-04, P1-08, P1-10,
  P2-02, P4-04, P4-05, P4-06

## EXP-083 — Current visual-direction control identities repaired

- **Date:** 2026-09-11
- **State and scope:** P0-56 is complete. This is a documentation-only repair
  to the current visual-direction acceptance recipe after the intentional
  `LIVES N` repin. No renderer, fixture, test, manifest, PNG, campaign, rules,
  proof, authority, human-lab, audio, release asset, or deployment byte changed.
- **Independent identities:** Direct SHA-256 recomputation records
  `reduced-motion.png` as
  `6bfd44f62f2ab5ab0fb7b6e30977aa24c3b6771c4ef751d434910a2e8d8ec594`,
  `ready.png` as
  `56caf63ebe1309a9ac53520f6633d3d680ad6d811f51711d2cdacc9cce35f5ae`,
  and `jar-miss.png` as
  `ee17903de9fab23eb25a0b24c96d83ccc5f458362381d9953030929fae18c75e`.
  These replace only the three stale current-control values in
  `VISUAL-DIRECTION.md`.
- **Unchanged visual contract:** The inventory remains 49 PNGs. The manifest
  SHA-256 remains
  `ddb82c6bb724b2c8a9b05349cca032b2993e2812919f1cccc3d2e39e86529a4b`,
  and the lexicographically ordered raw-PNG SHA-256 remains
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
  The pinned exact browser passes all three named desktop controls with zero
  pixel tolerance; no baseline update command ran.
- **Validation:** `desktop ready`, `desktop reduced-motion`, and `desktop
  jar-miss` pass 3/3 in the exact Playwright suite. Scoped secretlint and
  `git diff --check` pass, and direct hashing confirms the manifest and all PNG
  bytes are unchanged.
- **Cadence:** This factual documentation correction counts as zero substantial
  implementations after TD-13. The next periodic technical-debt review cadence
  therefore remains at 0.
- **Decision:** Close P0-56. Keep the machine-checked image-identity manifest
  and pixel-neutral HUD-layout consolidation as separate bounded TD-13
  follow-ups; do not reopen P0-53.
- **Tasks:** P0-56, P0-57, P0-58, P0-54, P0-55, P1-02, P1-04, P1-08, P1-10

## EXP-084 — Portable evidence runtime and source snapshot made exact

- **Date:** 2026-09-11
- **State and scope:** P0-58 is complete. The P102 offline producer now pins
  Node 22.19.0 in `.node-version` and both CI jobs, reads the versions of the
  executing TypeScript 7.0.2 and tsx 4.23.12 packages, and requires those exact
  runtime versions to match the lockfile. Its build identity includes the
  Maltline package manifest and tsconfig, root tsconfig, root lockfile, and
  `.node-version`. No campaign, rules, engine, proof, authority, controller,
  experiment payload, ranked path, viewer, or Worker behavior changed.
- **Atomic capture policy:** The producer hashes the normalized
  `SourceFile.text` that its TypeScript snapshot actually traverses and compares
  every source with normalized disk bytes. It captures realpaths and bytes for
  all five build inputs before opening the snapshot, then re-realpaths and
  re-reads all five after source traversal. Any AST/disk/config/path drift fails
  before identity emission. A strict deterministic testing hook proves source
  and config mutations at the snapshot boundary fail closed; malformed hook
  objects, extras, accessors, and wrong callback types are rejected.
- **Current identities:** The current producer source is 21 files at SHA-256
  `9b1f552b7af077b73c147dbba6984a8684f7bb5e7455275bc745a6cdc43c17f1`.
  The 19-file kernel remains
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`.
  The exact build-recipe SHA-256 is
  `1b7ab8ba811590bf9ce028717bcf25ffcff5debb00ee1031c119517a922ac863`,
  canonical integrity is
  `a388db09f772bf67b0153046f1173e521b4f52ebc02738858a54cb3f0a791569`,
  and the 533,781-byte formatted CLI document is
  `524595399413e934aa9c3082bc92cb53efc79b7fbb58dc8998c320bfd9d36a2b`.
- **Archival identity:** EXP-078 remains schema 1 and byte-exact at 533,781
  bytes, formatted SHA-256
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`,
  integrity
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`,
  producer-source SHA-256
  `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7`,
  and build SHA-256
  `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24`.
  It verifies only in explicit archival mode with `verifyCurrentSource: false`;
  default/current-source verification rejects it.
- **Unchanged experiment facts:** Payload remains 333,137 bytes at SHA-256
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`;
  experiment fingerprint remains `fnv1a64:cd875f6472067ad5`; result SHA-256
  remains
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`;
  controller registry remains
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`.
  Work remains 264 logical outcomes, 132 executed and 132 reused prefixes,
  1,006 stage/controller starts, and 2,736,116 ticks, controller calls, and
  engine steps.
- **Independent audit and validation:** Adversarial review accepted the exact
  runtime/lock reconciliation, normalized AST-to-disk comparison, five-input
  before/after snapshot, deterministic hook, legacy/current separation,
  external allowlist, and production isolation with no blocker. The final root
  gates pass all 827 unit tests (686 Maltline + 68 platform + 58 Partition + 15
  shared), 146 Maltline Playwright checks, 19 site browser checks, all workspace
  and assembled-site builds, exact 24-file/445,096-byte site assembly, Wrangler
  dry-run/local and smoke checks, privacy scanning across 154 files, and
  `git diff --check`. The Worker remains 201,177 bytes, 44,448 gzip bytes, and
  31 source-map entries at SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The protected Partition sitemap remains
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision and cadence:** Close P0-58. This is the first substantive
  implementation after TD-13. Keep P0-54's shared P108/P102 source-graph and
  fresh-oracle/throughput work separate; do not revise EXP-078 or promote its
  prospective Stage 8 candidate.
- **Tasks:** P0-58, P0-54, P1-02, P1-04, P1-08, P1-10

## EXP-085 — Visual baseline identity and HUD geometry made authoritative

- **Date:** 2026-09-11
- **State and scope:** P0-57 is complete. The visual baseline manifest advances
  to schema 2 with a lexicographically sorted 49-entry `{name, sha256}` ledger
  and an ordered-raw PNG digest. A pre-browser contract verifies inventory,
  every individual PNG, and the aggregate raw-byte identity. Frozen shared
  `MALTLINE_RENDERER_FRAME.hudOrders` and `.hudLives` rectangles now drive the
  renderer, Canvas transcript assertions, fixture metadata, and browser spacing
  checks. Zero-life fixture metadata omits the strawberry motif that the
  renderer does not draw; positive-life metadata retains it.
- **Pixel and gameplay boundary:** This was evidence and geometry
  consolidation only. No PNG was regenerated, and no Canvas command order,
  pixels, copy, engine, rules, scoring, lives, campaign, proof, authority,
  competition, audio, or ranked identity changed. The schema-2 manifest is
  7,107 bytes at SHA-256
  `dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`;
  its `orderedRawPngSha256` remains
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
- **Independent audit:** The accepted review confirms sorted ledger and raw
  aggregate reconciliation, regular-file admission, lowercase plain PNG
  names, shared frozen HUD rectangles, and truthful zero-life metadata. It
  found no gameplay, pixel, accessibility, proof, or release blocker. The
  remaining nonblocking hardening is P0-59: require `screenshots` itself to be
  a strict dense plain array and add explicit directory traversal and symlink
  adversaries around the baseline contract. Existing filename validation
  blocks ordinary `../` entries and the current checked-in manifest is exact;
  this is defensive test-evidence hardening, not invalidation of the 49 images.
- **Validation:** The final root gates pass all 827 unit tests (686 Maltline +
  68 platform + 58 Partition + 15 shared), 146 Maltline Playwright checks, 19
  site browser checks, all workspace and assembled-site builds, exact
  24-file/445,096-byte site assembly, Wrangler dry-run/local and smoke checks,
  privacy scanning across 154 files, and `git diff --check`. The Worker remains
  201,177 bytes, 44,448 gzip bytes, and 31 source-map entries at SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The protected Partition sitemap remains
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision and cadence:** Close P0-57 and queue P0-59. P0-58 and P0-57 are
  the two substantive implementations since TD-13, so P0-60, the fourteenth
  technical-debt/refactor review, starts immediately. Do not infer human
  comprehension, Stage 8 preference, or device performance from pixel
  identity evidence.
- **Tasks:** P0-57, P0-59, P0-60, P2-02, P4-04, P4-05

## EXP-086 — Fourteenth technical-debt review after evidence-authority hardening

- **Date:** 2026-09-11
- **State:** P0-60 is complete. Independent gameplay/evidence, verification/
  release, and visual/accessibility reviews examined the settled P0-58/P0-57
  tree in `audits/TECH-DEBT-14-GAMEPLAY.md`,
  `audits/TECH-DEBT-14-VERIFICATION.md`, and
  `audits/TECH-DEBT-14-VISUAL.md`. All three report **zero P0 blockers**;
  verification and visual additionally report **zero P1 findings**. The
  gameplay P1 items are retained human/product-decision gates and the already
  queued experiment-evidence work, not defects in the current generation.
- **Accepted implementations:** Keep P0-58 and P0-57 done. P0-58 binds exact
  Node 22.19.0 and the executing TypeScript 7.0.2/tsx 4.23.12 packages to their
  declarations and lock, and rejects normalized AST/disk/realpath/five-input
  config drift across one verified snapshot. P0-57's schema-2 manifest binds
  the sorted 49-PNG digest ledger and ordered-raw bytes, while shared frozen
  orders/lives geometry and zero-life metadata remain pixel- and gameplay-
  neutral. Neither changes generation 2, ruleset 2, proof schema 1, ranked
  authority, gameplay, controllers, scoring, lives, or any PNG.
- **P0-54 is the highest-value substantial evidence work:** Converge P108 and
  P102 on one fail-closed, entry-scoped static source-graph policy; keep the
  simulation kernel's external set exact; commit the all-fresh 132-pair P102
  equivalence oracle; and separate fast provenance adversaries from the fixed
  multi-million-tick artifact fixture without increasing semantic budgets or
  blanket timeouts. The current retained P108/P102 payloads are not invalidated,
  and this work must not be presented as new tuning evidence.
- **P0-59 starts as the next small hardening:** Require the schema-2
  `screenshots` value to be a strict dense plain data array, reject sparse,
  accessor, custom-prototype/method, symbol, and extra-key collections before
  iteration, and pin explicit traversal, file-symlink, directory-symlink, and
  realpath-containment adversaries. Add generous per-file and aggregate byte
  ceilings before synchronous reads. Bind the recorded Chromium revision
  `1243`, version `153.0.8010.12`, and title `Chrome for Testing` to the
  executing installed `playwright-core` browser registry. Preserve the current
  manifest and all PNG bytes.
- **P0-61 defense in depth:** Before P4-05, make the Worker source-map policy
  and fixtures generically reject `games/*/tools/**` and `games/*/tests/**`.
  The current 31-entry Worker graph contains neither, and P102 would currently
  also trip incidental Node-module/content guards; the explicit path rule is a
  future-proof ownership boundary, not a present bundle defect.
- **Retained boundaries:** Exact local/CI evidence is not immutable deploy
  attestation; keep that under P4-05. Wrangler-local evidence is not live
  apex/www/header/cache parity; keep that under active P4-06. Linux Chrome
  goldens fail safely but portable root raster provenance remains P0-48 and an
  explicit runner/container pin is conditional on actual host-image drift.
  Reference-device timing/control remains P4-04. Successful full-run duration,
  Stage 8 preference, carried-life score fairness, recovery comprehension,
  fatigue, and fun remain participant evidence under P1-02/P1-04/P1-08/P1-10/
  P4-03. Do not promote Stage 8 interval 138 or revise generation 2 from
  source or pixel evidence.
- **Settled validation:** All **827 repository unit tests** pass: 686 Maltline,
  68 platform, 58 Partition, and 15 shared-package tests. Maltline Playwright
  passes 146/146 and root site Playwright passes 19/19. All workspace and
  assembled-site builds pass; the exact site contains 24 files and 445,096
  bytes. Wrangler dry-run/local, site and route smokes, privacy scanning across
  154 files, and `git diff --check` pass. The Worker remains 201,177 bytes,
  44,448 gzip bytes, and 31 source-map entries at SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.
  The schema-2 visual manifest remains 7,107 bytes at SHA-256
  `dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`,
  and its ordered raw-PNG SHA-256 remains
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
  The protected Partition sitemap remains byte-exact at SHA-256
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.
- **Decision and cadence:** Close P0-60 with zero P0 findings and no reason to
  reopen P0-57/P0-58, generation 2, or EXP-078. P0-58 and P0-57 are the two
  substantive implementations reviewed by TD-14, so the maintenance cadence
  now resets to **0**. Start P0-59 immediately; keep P0-54 as the next
  substantial evidence tranche and P0-61 queued before release freeze.
- **Tasks:** P0-54, P0-57, P0-58, P0-59, P0-60, P0-61, P0-48, P1-02, P1-04,
  P1-08, P1-10, P4-03, P4-04, P4-05, P4-06

## EXP-087 — Visual baseline admission and reads hardened

- **Date:** 2026-09-11
- **State and scope:** P0-59 is complete. The schema-2 baseline contract now
  requires `screenshots` to be an ordinary dense data array with exact own
  indices and descriptor-safe entries. Verification options are exact plain
  enumerable data, and the installed `playwright-core` registry is parsed
  without invoking accessors; its unique Chromium revision, version, title,
  and default-install role must match the manifest.
- **Filesystem and resource boundary:** Baseline and trusted-root paths are
  lstat/realpath-contained; traversal, absolute, separator, Unicode, file-
  symlink, directory-symlink, sparse, accessor, symbol, extra-key, and custom-
  prototype/method inputs fail closed. Each PNG is capped at 8 MiB and the
  collection at 64 MiB. After preflight, every file is opened read-only with
  `O_NOFOLLOW|O_NONBLOCK`; descriptor type, device, inode, path, size, and caps
  must still agree before any bounded read. Reads allocate only the recorded
  size plus a one-byte EOF probe, retry `EINTR`, reject early EOF/growth, check
  post-read fstat and hashes, and close every descriptor on every path.
- **Independent verification:** Rereview accepted the strict option/registry
  normalization and deterministic post-preflight symlink, FIFO, and oversize
  replacements, plus same-inode growth after descriptor admission. No residual
  correctness, resource, or TOCTOU blocker remains in this bounded contract.
- **Validation and identities:** Direct contract checks pass 15/15; the focused
  integration passes 46 tests across four files; the full Maltline unit suite
  passes 696 tests across 47 files; and exact Maltline Playwright passes
  146/146. The production build passes with 44 modules. Scoped secretlint and
  `git diff --check` pass. The 7,107-byte manifest remains byte-exact at
  SHA-256
  `dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`;
  all 49 PNGs remain unchanged with ordered-raw SHA-256
  `00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.
- **Production boundary:** No renderer, fixture state, human-lab revision,
  gameplay, rules, proof, authority, release asset, production bundle, copy,
  CSS, manifest, or PNG byte changed. This is test-evidence hardening only.
- **Decision and cadence:** Close P0-59. This is the first substantive
  implementation since TD-14, so the periodic technical-debt cadence is **1**.
  Keep P0-54 as the next substantial experiment-evidence tranche and P0-61 as
  the explicit pre-release Worker source-map boundary.
- **Tasks:** P0-59, P0-54, P0-61, P0-48, P1-02, P1-04, P1-08, P1-10, P4-03,
  P4-04, P4-05, P4-06

## EXP-088 — Experiment source closure and prefix equivalence made shared and exact

- **Date:** 2026-09-11
- **State and independent acceptance:** P0-54 is complete. Independent review
  accepted the shared source-graph implementation, exact producer/kernel
  separation, current-versus-archival behavior, fixed all-fresh equivalence
  oracle, and the final P108 proof-boundary repair. This is evidence
  architecture only: it does not promote either prospective experiment or
  change generation 2, ruleset 2, proof schema 1, ranked authority, seasons,
  scoring, controllers, or gameplay.
- **Shared fail-closed policy:** P108 and P102 now use one entry-scoped
  TypeScript AST/disk/realpath resolver with normalized snapshot-to-disk byte
  equality, local resolution containment, exact file/byte caps, and rejection
  of unresolved locals, unreviewed bare/workspace/path/package aliases,
  re-exports, import-equals/import-type forms, string-literal module
  declarations, dynamic imports, CommonJS/createRequire seams, AMD/type/lib
  references, prohibited paths, and unreviewed viewer files. Policies are
  supplied separately per closure and never unioned: both simulation kernels
  require an empty external-specifier set, and the sole allowed viewer leaf is
  `games/maltline/src/viewer/viewer-input-adapter.ts`. P102 forbids proof,
  verifier, competition, platform, human-lab, and production-root closures.
  P108 now forbids the same proof boundary in both producer and kernel; its
  unchanged ranked ceilings live in a narrow `ranked-resource-limits.ts` leaf
  that `proof.ts` re-exports for API compatibility.
- **Fresh P102 oracle:** A test-only independent matrix executes all **132**
  profile/seed A/B pairs from Stage 1, for **264 executed campaign prefixes**
  and **0 reused prefixes**. It compares every complete fresh control and
  relief run, including the fully executed pre-Stage-8 prefix, with the
  optimized artifact. The exact checked oracle ledger is **1,814** stage
  starts, **1,814** controller creations, and **4,765,724** campaign ticks,
  controller calls, and engine steps. The retained optimized ledger remains
  **264** logical outcomes, **132 executed** and **132 reused** prefixes,
  **1,006** stage/controller starts, and **2,736,116** ticks/calls/steps.
- **Current P102 identity:** Producer source is 22 files at SHA-256
  `7152f778324f8e542a0168acf2941eefdd3e270dab6aedaefffe71689f24070c`;
  its 19-file simulation kernel is
  `18bc7c06e5ab736e9f1dfd081b49e172882a2a1d9922087084edddff511d4a39`.
  Build-recipe SHA-256 is
  `d9b7a11a222ac04486972527b1313bcd3b5710a797d0038472a151dfaa6c657e`,
  canonical integrity is
  `062f04551e324018df2d8b7cd9c5e5f8eb05734eb7ac7351256bccda64a94cb1`,
  and the 533,836-byte formatted document is
  `a1bbcd42c24bc2577a19a49bde25c6c8ecc94936bf4423aefb00c20e47ca4201`.
- **Current P108 identity:** Producer source is 24 files at SHA-256
  `d16ac109cd7f85b233e4915014c1fcfd4f6c9a8b6af549c8a655a314e1e0a8d4`;
  its 21-file simulation kernel is
  `6eda008b5fd3c12ccd970d642dbab0fdc8782e027976dee56354569a99a620ad`.
  Build-recipe SHA-256 is
  `8c06bd54f93097d3b3f38a822a48ca2a6ecff27282bf19c55b938309d6130f4a`,
  canonical integrity is
  `c122df879267c69f631cca656bc2504685c9b07f68ae180bb8353e168b64e541`,
  and the 1,899,811-byte formatted document is
  `888d409ddf97d3968d6e13788b047cbad8ed7c62eff948a0db22ced14b8b378a`.
- **Archival compatibility:** Wire schema remains 1. P102 EXP-078 remains an
  explicit archival-only 533,781-byte document: producer source
  `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7`
  (21 files), kernel
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`
  (19 files), build
  `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24`,
  integrity
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`,
  and formatted SHA-256
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`.
  P102 EXP-084 remains an explicit archival-only 533,781-byte document with
  source
  `9b1f552b7af077b73c147dbba6984a8684f7bb5e7455275bc745a6cdc43c17f1`,
  the same 19-file kernel, build
  `1b7ab8ba811590bf9ce028717bcf25ffcff5debb00ee1031c119517a922ac863`,
  integrity
  `a388db09f772bf67b0153046f1173e521b4f52ebc02738858a54cb3f0a791569`,
  and formatted SHA-256
  `524595399413e934aa9c3082bc92cb53efc79b7fbb58dc8998c320bfd9d36a2b`.
  The pre-P0-54 P108 document remains archival-only at 1,899,811 bytes with
  source
  `ee01c3858dbfce3b51e703c50c2f71402752ea881098bb6b0b958ee8de59206c`
  (23 files), kernel
  `c3353176aa777e4965b2772dbf7d256baf1e224cb107a5b37709c37105502b54`
  (21 files), build
  `7bdb64dff75eb0763739cb88a38a68e2e06e5b098919cc132eb48504e17eeb32`,
  integrity
  `e5f35b8d61c39a8f87402f6d81232cf3b2f749e39526667065842277dc5d8035`,
  and formatted SHA-256
  `a6809d6370c34b40dc9728364fd75bf4bcab37a4f0e39d71c7d530b521ac5c2e`.
  Each archive passes only with explicit `verifyCurrentSource: false`; default
  current-source verification rejects it.
- **Unchanged experiment facts:** P102 payload remains 333,137 bytes at
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`,
  experiment fingerprint `fnv1a64:cd875f6472067ad5`, result SHA-256
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`,
  and controller-registry SHA-256
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`.
  P108 payload remains 781,938 bytes at
  `59ccec0cc3dabc7ce110d0ed3f0863e6b861a5728758baf1687c0fe7eef8ca36`,
  experiment fingerprint `fnv1a64:a56ab6aac3bd00ec`, controller-registry
  SHA-256
  `95e792abf6806a52c00f234a86bc04ce378b5f08d2fc85b78f1d718e5a9cdb84`,
  and the reviewed 396-run work preflight remains unchanged.
- **Validation and throughput signal:** Shared graph and oracle checks pass
  6/6; current/archive identity checks pass 5/5; final P108/shared checks pass
  17/17; authority/proof/boundary checks pass 65/65 and the post-repair proof/
  authority slice passes 61/61. Maltline TypeScript/Vite builds pass, both
  supported CLIs emit one parseable byte-identical document twice across time
  zones, the Worker bundle audit passes 4/4, scoped secretlint passes, and
  `git diff --check` passes. One loaded-host full serial run reached 696/698:
  only the existing P108 byte-identity simulation and legacy tuning simulation
  hit their unchanged 30-second/15-second wall-clock limits, with no assertion
  failure. A later independent isolated reviewer did not reproduce those
  timeouts. They remain a nonblocking CI-capacity signal; semantic work limits
  and timeouts were not raised.
- **Decision and cadence:** Close P0-54. P0-59 and P0-54 are the two substantive
  implementations since TD-14, so the cadence reaches **2** and P0-62 queues
  the now-due fifteenth technical-debt/refactor review. Do not interpret source
  closure or model equivalence as human pacing/preference evidence.
- **Tasks:** P0-54, P0-62, P0-61, P0-48, P1-02, P1-04, P1-08, P1-10, P4-03,
  P4-04, P4-05, P4-06

## EXP-089 — PR freeze, main sync, and Claude Fable review

- **Date:** 2026-09-11
- **State and scope:** PR #9 was updated from the original Maltline prototype to
  the complete release-candidate tranche and synchronized with current `main`.
  The PR diff excludes local `.research/`, `.token-usage.jsonl`, and `hardware/`
  content. The protected Partition sitemap remains byte-exact. This freeze does
  not claim the retained human, reference-device, live-deploy, or paid-audio
  gates.
- **Independent review:** Claude Fable reviewed the platform/security slice in
  read-only mode and posted its findings to PR #9. It found one merge-artifact
  blocker: `wrangler-local-smoke.mjs` hard-coded Wrangler 4.124.0 after `main`
  advanced the lock. The smoke now obtains the exact root Wrangler version from
  `package-lock.json` and still rejects an installed mismatch. The expanded
  verify job receives a 20-minute job ceiling; simulation test limits remain
  unchanged. P0-63 retains Fable's nonblocking IPv6-prefix admission, missing-
  object retry, consume-expiry status, proof-HEAD cost, and measured CI-duration
  follow-ups rather than silently treating them as closed.
- **Dependency repair:** Root Wrangler advances to 4.131.1. The current
  Cloudflare Vitest pool remains 0.22.0 but receives a narrow Miniflare
  5.20260911.0-alpha override, bringing Sharp to 0.35.4; routine lock repair
  brings `fast-uri` to 3.1.7 and `js-yaml` to 4.3.2. `npm ci` succeeds and
  `npm audit --audit-level=high` reports zero vulnerabilities. `lint-staged`
  17.3.0 still declares Node >=22.22.1 while the evidence runtime is pinned to
  22.19.0; npm emits a support-policy warning, but the staged hook and build run
  successfully. A runtime-pin revision must be a separate provenance change.
- **Post-freeze current identities:** Staged whitespace normalization and the
  merged lock changed source/build bytes, so EXP-088 remains the pre-freeze
  current snapshot. P102 is now source
  `6f90f4aa56f9d99b88eb7e07edbf3db50efbaaa79a8dfd653c5b0c06b0dfb735`
  (22 files), kernel
  `b067a45fd025c07a6ac340fbcb6ac7c14971485cfe6f3b701a792f7b0299c7a1`
  (19 files), build
  `995812f49643ba389d642f5564d3dec7e5f038e0f0a86725d5073c1d9cd46b07`,
  integrity
  `c932363c4e2a6d8a507a2d270ce886a82a27f4a8a11cf5be6d122676d75baca4`,
  and formatted 533,836-byte SHA-256
  `db567cdb23dfc853a3920f0b8c6c713831293c2d1f813bb792e11778d881ce00`.
  P108 is now source
  `8bbae9c3def04bd142413f781e0a4415b08fb079a536a0a92bdb9f5ffd0a5c78`
  (24 files), kernel
  `481137b6537d71035371fc01fc00cce3db2271d63dcfa41cbf11ee0afc371740`
  (21 files), build
  `61f7314384bb8ff8f1b35fff526c94a9ac60bbbf9181cb5170b9246bee6ab955`,
  integrity
  `d0e87a3b9a3ac7d0fc9f54210df92c431d36e161cffdc4471837b329832b8411`,
  and formatted 1,899,811-byte SHA-256
  `670a6689fc121819b8d9866b4704a977af2512a19a59b8f3e55602121a7f9d96`.
  All EXP-078/EXP-084/pre-P0-54 archives and the P102/P108 payload, result,
  controller, and work identities remain unchanged.
- **Validation:** P102 envelope/CLI checks pass 16/16 and P108 envelope/archive
  checks pass 12/12. Clean `npm ci`, zero-high advisory audit, all workspace
  builds, the 4/4 Worker bundle audit, exact 24-file/445,096-byte site assembly,
  and Wrangler 4.131.1 local composite smoke pass. GitHub CI is rerun from the
  repaired PR head; this local evidence does not replace that result.
- **Decision:** Keep the PR open for human review. Do not reopen gameplay or
  provenance payloads from source-identity movement alone. P0-62 remains due,
  and P0-63 owns the concrete Fable follow-ups before merge.
- **Tasks:** P0-63, P0-62, P0-61, P0-48, P3-14, P3-15, P4-03, P4-04, P4-05,
  P4-06
