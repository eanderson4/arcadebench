# Maltline Polish Task Log

This is the living execution backlog for bringing Maltline to (or beyond) the
quality bar set by Partition. Statuses are `queued`, `active`, `blocked`, or
`done`. Tasks should point to experiment-log entries when tuning evidence
changes a decision.

## Success criteria

- A complete human arcade run normally lasts 5–15 minutes, starts fresh, and
  offers no save/continue path.
- The controls, goals, failure modes, and moment-to-moment feedback are legible
  without reading repository documentation.
- The game is fun to replay: decisions become richer across the run rather
  than merely faster or more punishing.
- Simulation and scoring remain deterministic, tick-based, headless, and
  replay-verifiable by an authoritative server.
- Automated tests cover mechanics, invariants, replays, campaign balance,
  input edges, and verifier rejection cases.
- Visual tests cover representative states, common viewport sizes, overlays,
  transitions, accessibility preferences, and regression baselines.
- Art, animation, and audio form one intentional identity and include clear
  licensing/provenance notes.
- Large changes receive an explicit technical-debt/refactor review before the
  next major feature tranche.

## Phase 0 — Baseline and evidence

| ID | Status | Task | Evidence / exit condition |
| --- | --- | --- | --- |
| P0-01 | done | Establish baseline build and test results | Commands and results recorded in `EXPERIMENTS.md` |
| P0-02 | done | Audit campaign mechanics and estimated duration | `audits/GAMEPLAY.md`: measured 4:11 clean run and infinite farming case |
| P0-03 | done | Audit current UI, visual hierarchy, responsiveness, and accessibility | `audits/VISUAL_UX.md`: rendered desktop/mobile evidence and test matrix |
| P0-04 | done | Audit determinism, replay format, scoring, and server-side verification gaps | `audits/VERIFICATION.md`: threat model and bounded verifier design |
| P0-05 | done | Add repeatable browser visual-test harness and baseline captures | 6 exact-pixel goldens plus laptop/portrait geometry tests pass in Playwright |
| P0-06 | done | Add headless campaign telemetry harness | Versioned reactive controller emits stable per-stage/campaign JSON with pressure metrics |
| P0-07 | done | Make fixed-step wall time invariant across display cadences | 9 clock tests cover 30/60/90/120/144 Hz, jitter, reset, and backlog policy |
| P0-08 | done | Eliminate repeat-customer score farming and bound customer resolution | First order scores once, one rescue requeue is allowed, farmer resolves at tick 2,266 |
| P0-09 | done | Make terminal-tick life and score behavior explicit | Lives clamp at zero; fatal tick stops; terminal state is immutable |
| P0-10 | done | Inject deterministic renderer time and randomness | Command-recorder tests prove seeded/frozen presentation reproducibility |
| P0-11 | done | Run first technical-debt/refactor review | Three cross-reviews captured correctness, reproducibility, and security debt |
| P0-12 | queued | Resolve development-tool dependency advisories | Production audit is clean; update/test Vitest and Cloudflare toolchain without forced breakage |
| P0-13 | done | Align renderer/HUD with authoritative score and resolution events | Zero-point rescues, event points, loss reasons, and resolved orders display truthfully |
| P0-14 | done | Validate, clone, and freeze normalized engine scenarios/run inputs | Full domain checks and mutation tests protect authoritative configuration |
| P0-15 | done | Bind telemetry output to controller and campaign/rules fingerprints | Telemetry v2 fingerprints rules, controller behavior, campaign, scenarios, and full config |
| P0-16 | done | Harden visual harness parity and runtime failure detection | Shared shell/font, bundle isolation, error hooks, and production parity tests pass |
| P0-17 | done | Replace brittle private-state invariant tests with supported builders | Reachable fatal/terminal cases use the public engine; simultaneous-order cases use one strict test-only synthetic resolution harness |
| P0-18 | done | Unify engine and verifier scenario normalization | Shared fundamental validation plus explicit tighter ranked policy and 44 proof tests |
| P0-19 | done | Add deterministic player-model comparison baseline | Reactive, delayed, and novice profiles run canonical plus shadow seeds reproducibly |
| P0-20 | done | Run second technical-debt/refactor review | Gameplay, viewer, verification, and audio boundaries reviewed after EXP-022 through EXP-024 |
| P0-21 | done | Make dropped browser time explicit and rank-ineligible | Hitch/background tests mark eligibility before another tick/input and resume unranked without catch-up |
| P0-22 | done | Make bundled-font startup fail safe | Mocked timeout/failure reaches a playable, diagnosed system-font title screen |
| P0-23 | done | Bind tuning identity to all effective simulation inputs | Schema v2 binds baseline/rules/run/tick/controllers/effective campaigns and preserves EXP-021 history |
| P0-24 | done | Normalize all runtime/controller inputs at one boundary | Engine/proof/replay/controller adversarial values/getters/mutation fail before state changes |
| P0-25 | done | Run third technical-debt/refactor review | Three TD-03 reports separate local-play, human-test, accessibility, audio, and ranked-release debt |
| P0-26 | done | Reject invalid controller tuples before cache lookup | Warm-cache adversarial matrix rejects every invalid primitive without changing legal telemetry |
| P0-27 | done | Make registered authority the single runtime campaign source | Viewer, default telemetry, proof verification, and copy consume one deeply frozen snapshot |
| P0-28 | done | Run fourth technical-debt/refactor review | Three TD-04 reports verified the core and classified control, CI, platform-saga, and audio-promotion blockers |
| P0-29 | done | Reject presentation key auto-repeat | A held Enter cannot cross more than one flow transition or bypass manual stage clear |
| P0-30 | done | Run ranked-platform technical-debt/refactor review | TD-05 verifies the settled D1/R2 saga and records four bounded launch-hardening follow-ups |
| P0-31 | done | Run browser-competition technical-debt/refactor review | TD-06 gameplay, verification, and visual reviews repaired terminal-proof, expiry-retry, authoritative-display, draft, accessibility, and layout issues |
| P0-32 | done | Run retained-proof inspection technical-debt/refactor review | TD-07 repaired expiry honesty, retry policy, row-summary checks, focused detail navigation, mobile proof access, and trust copy; edge admission and replay latency remain explicit |
| P0-33 | done | Run animated replay-scrubber technical-debt/refactor review | TD-08 repaired stale terminal copy, semantic equivalence, disclosure focus order, seek amplification, presentation determinism, and an ambiguous cursor field; bounded P2/P4 follow-ups remain explicit |
| P0-34 | done | Add stage-specific visual pressure evidence before more tuning | Five reviewed exact goldens cover Stages 4–7 at 1280px and dense Stage 7 at the supported 700px boundary without changing generation-2 control images |
| P0-35 | done | Add actionable pressure telemetry and a reproducible P1-08 matrix | Telemetry v3 and EXP-049 schema/revision 2 bind open demand, conflicts, pacing, jar scarcity, scoring, all/canonical/shadow scopes, and four unranked candidates |
| P0-36 | done | Independently audit and repair EXP-049 evidence | `audits/EXP-049-VERIFICATION.md` closes ambiguous aggregation and verifies all 96 scope triples without finding a ranked-authority or proof-compatibility blocker |
| P0-37 | done | Harden portable offline experiment provenance and work preflight | EXP-069 binds the exact reviewed default payload to a path-free source/build envelope; strict preflight and a shared 60,000-tick ledger cap all admitted matrix work before trusted callbacks |
| P0-38 | done | Prove the human tuning lab cannot enter production | Normal and lab-only module graphs, recursive artifact scans, source bans, and two production-route 404s keep experiment/session code outside the shipped viewer |
| P0-39 | done | Independently verify the human-lab evidence repair | `audits/P1-10-LAB-REPAIR-VERIFICATION.md` independently closes G01/G02/G03/G05, accepts the minimum G04/G06 repair, and retains G07/G08 as explicit study blockers |
| P0-40 | done | Cross-review human-lab study controls and full engine matrix | `audits/P1-10-STUDY-CONTROLS-VERIFICATION.md` closes G07/G08 and its two consent/withdrawal findings after revision-5 repair and 31 focused browser checks |
| P0-41 | done | Run post-lab presentation and audio integration review | Independent visual/gameplay/audio slices lock direction, repair result truth, close Ogg safety, and record the current provider-rate correction in EXP-056 |
| P0-42 | done | Independently audit return readability and event-age evidence | Two read-only audits identified the 700px return weakness and update-partition defect; EXP-057 repairs both and verifies the expanded visual matrix |
| P0-43 | done | Independently audit order ownership, opposing traffic, and recovery scoring evidence | Post-implementation review found no correctness or ranked-release blocker; EXP-059 closes its reduced-motion paired-traffic evidence gap and records the prospective score-ledger artifact |
| P0-44 | done | Run ninth technical-debt/refactor review across presentation and evidence boundaries | Three TD-09 audits close station truth, fixture reachability, and lab/production graph gaps; EXP-061 then removes the identified duplicate renderer scenario/layout authority pixel-neutrally |
| P0-45 | done | Run tenth technical-debt/refactor review after the replay UX/lifecycle tranches | Three TD-10 audits find no current gameplay/visual/proof defect, select a private transient-effects store before leaf painters, and retain explicit live-motion, performance, admission, rollover, concurrency, canonicalization, and deploy-scan debt |
| P0-46 | done | Run eleventh technical-debt/refactor review after launcher and release wiring | Three TD-11 audits accept P4-01 and isolate artifact-contract, deployment-parity, entry-evidence, accessibility, typography, and test-ownership debt |
| P0-47 | done | Unify and make the recursive site release contract exact | One frozen data-only contract drives exact recursive route/inventory, reference, policy, containment, type, file-count, and byte-ceiling checks |
| P0-48 | active | Own and pin root site-browser evidence | Root owns exact Playwright and result hygiene; host Inter on `ubuntu-latest` still prevents portable raster provenance |
| P0-49 | done | Make first-fulfillment chains truthful in presentation and study evidence | CHAIN N replaces the false score-multiplier claim across HUD and semantic output, exact event points stay authoritative, and human-lab revision 10 binds the repaired presentation |
| P0-50 | done | Produce a durable source-bound Stage 8 relief experiment | EXP-078 records the fixed unranked 132-to-138-tick comparison with full payload, source graph, build recipe, work-ledger, and independent prefix-equivalence evidence |
| P0-51 | done | Run the twelfth technical-debt/refactor review | Three TD-12 reports accept generation 2 and EXP-078, retain promotion/human gates, and isolate source-graph, visual-truth, and experiment-throughput debt |
| P0-52 | done | Fail closed on workspace aliases in P102 provenance | The exact static-dependency policy rejects workspace/package/path aliases, unreviewed externals, runtime loaders, dynamic imports, directives, unresolved/escaping locals, and prohibited closures while preserving the exact EXP-078 payload and archival schema-1 bytes under explicit non-current verification |
| P0-53 | done | Repair TD-12 visual truth debt | `LIVES N` is the dominant state-derived role with exact 0/1/2/4 normal/reduced, 1280/700, early-run, Stage 7, and game-over evidence; Stage 7 hashes and terminology are current, and human-lab revision 11 rejects revision 10 |
| P0-54 | done | Harden bounded experiment evidence | One fail-closed entry-scoped source-graph implementation now enforces exact separate P108/P102 producer/kernel policies, archival/current verification stays explicit, and a 132-pair all-fresh oracle proves every optimized P102 outcome under the unchanged semantic limits |
| P0-55 | done | Run the thirteenth technical-debt/refactor review | Three TD-13 reports find zero P0 blockers, accept P0-52/P0-53 and generation 2, and map only source/provenance, visual-evidence, bounded-oracle, and retained human-decision debt |
| P0-56 | done | Repair TD-13 visual-direction hash drift | Only the documented reduced-motion, ready, and jar-miss SHA-256 values changed to their independently recomputed P0-53 bytes; exact focused controls pass with the 49-image manifest and every PNG unchanged |
| P0-57 | done | Make visual evidence geometry and image identity machine-authoritative | Schema-2 baseline evidence binds a sorted per-PNG ledger and ordered-raw digest; shared frozen HUD orders/lives rectangles and truthful zero-life metadata preserve all 49 PNG bytes |
| P0-58 | done | Make portable artifact runtime and source capture atomic | Exact Node 22.19.0 and executing TypeScript 7.0.2/tsx 4.23.12 are lock-checked; normalized AST text, disk bytes, realpaths, and five build/config inputs must remain one verified snapshot |
| P0-59 | done | Harden the visual baseline contract against hostile collections and paths | Strict descriptor-safe collections/options, installed-browser identity, bounded descriptor reads, and TOCTOU adversaries preserve the exact schema-2 manifest and all 49 PNG bytes |
| P0-60 | done | Run the fourteenth technical-debt/refactor review | Three TD-14 audits find zero P0 blockers, accept P0-57/P0-58, retain human/release gates, and map bounded visual-contract, Worker-policy, and shared experiment-evidence debt |
| P0-61 | queued | Reject game tool and test sources generically from the Worker bundle | Extend the Worker source-map policy and adversarial fixtures to reject `games/*/tools/**` and `games/*/tests/**` before P4-05 without changing the current bundle |
| P0-62 | queued | Run the fifteenth technical-debt/refactor review | Review the two substantive post-TD-14 evidence hardening tranches, P0-59 and P0-54, before further implementation |
| P0-63 | queued | Resolve Claude Fable platform review findings before merge | Normalize IPv6 admission keys, make missing-object retry recoverable, return truthful expiry status at consume, avoid proof-body work on HEAD, and confirm the expanded verify job fits its measured CI budget |

## Phase 1 — Core game feel

| ID | Status | Task | Evidence / exit condition |
| --- | --- | --- | --- |
| P1-01 | done | Define the intended decision loop and difficulty curve | Gameplay-flow note maps all eight stages to learned skills and pressure |
| P1-02 | active | Tune campaign to the 5–15 minute target | Simulation and human playtest distributions support the target |
| P1-03 | active | Refine controls and input buffering for arcade hardware and keyboards | Tests cover edge/repeat behavior; playtest has no ambiguous inputs |
| P1-04 | active | Improve lives, streak, scoring, recovery, and game-over pacing | Fatal outcomes and first-fulfillment CHAIN presentation are truthful; EXP-059 isolates early-loss alternatives and EXP-078 adds structural Stage 8 recovery/cascade evidence, while human attribution and a policy decision remain |
| P1-05 | done | Add attract/instruction/countdown/stage-clear/game-over flow | Tested title/lesson/stage/countdown/clear/loss/victory/restart sequence needs no repo docs |
| P1-06 | done | Track fulfilled, walked-out, and resolved customers consistently | Engine, events, HUD, stage-clear copy, telemetry, replay v2, and proof summaries agree |
| P1-07 | done | Add immediate navigation, delayed repeat, and serve buffering | Input matrix covers taps, holds, chords, and blend-completion timing |
| P1-08 | active | Smooth stages 4–7 and add authored decision beats | Telemetry shows no accidental pressure valleys or abrupt unlabeled wall |
| P1-09 | done | Add adapter-mediated player-model evidence | Versioned physical-intent profiles bind adapter/serve policy and replay byte-identically without replacing raw engine probes |
| P1-10 | active | Run counterbalanced human A-versus-D tuning sessions | Automated full-engine A→D/D→A × 1280/700 evidence is complete; collect real participant comprehension, fairness, fatigue, preference, and completion evidence before any generation-3 promotion decision |
| P1-11 | done | Enrich human-lab observation capture | Schema 3/revision 11 binds stage pulses, diagnostics, jar/recovery/score evidence, bounded notes, consent v2, participant/token/materializer/environment provenance, exact width strata, interruption timing, input summaries, countdown, withdrawal lifecycle, presentation-truth repair, and all three pre-participant P2-02 readability passes |

## Phase 2 — Presentation and UX

| ID | Status | Task | Evidence / exit condition |
| --- | --- | --- | --- |
| P2-01 | done | Lock a coherent Maltline visual direction | `counter-after-dark-v1` style board is reviewed against exact 1280/700 Stage 7 pressure frames and accessibility constraints |
| P2-02 | active | Polish customers, shakes, jars, stations, counter, and environment | Returns, jar economy, customer/order ownership, opposing traffic, and selected/processing/blocked/held station truth now have exact desktop, 700px, and reduced-motion evidence; defer counter/environment repaint until human evidence identifies a concrete comprehension gap |
| P2-03 | done | Add animation and effects language | Deterministic 0–1400ms schedule-invariant event matrix plus isolated ready/serve/catch/launch/return and integrated fatal evidence lock the feedback language |
| P2-04 | done | Redesign HUD and instructional affordances | 18 browser checks cover action/jar/HUD states and wide/unsupported-narrow layouts |
| P2-05 | done | Add reduced-motion, contrast, focus, and non-color cues | Initial and mid-session live/replay motion changes, non-color direction/state cues, semantic status/events, overlay focus, and scoped keyboard tests pass |
| P2-06 | active | Add cohesive music, ambience, and event SFX | Production matrix/scaffold complete; selected assets, runtime, mute/volume, and sensory mode remain |
| P2-07 | done | Establish safe audio acquisition and provenance workflow | Dry-run-first, double-gated sequential tool and dated rights/provenance specification exist |
| P2-08 | done | Make unsupported-width pause truthful | 699/700 transitions stop ticks/draws, clear held input, and resume without catch-up |
| P2-09 | done | Add a semantic play-state and scoped keyboard contract | ARIA state/event throttling, overlay focus, and editable-target tests pass |
| P2-10 | done | Pin and run visual regression in CI | Machine-checked browser/image manifest and built-preview smoke gate exact baselines |
| P2-11 | done | Split presentation model/effects/painters incrementally | Frozen theme, station-action policy, scenario-bound layout, package-private transient-effects store, exhaustive structured event facts/selection policy, returning-jar coordinate truth, and viewer-private vessel painters are extracted with exact command and pixel tests; no P2-11 clause remains open |
| P2-12 | done | Harden paid audio acquisition before any generation | Plan-bound spend approval, reservation/journal/recovery, timeout, and byte/decode tests pass offline |
| P2-13 | done | Specify the first bounded audio audition batch | Eight requests/6 seconds/240 estimated credits under the 2026-09-11 provider rate, review rubric, and fail-closed templates are ready |
| P2-14 | done | Make timed flow and inactive controls accessible | Transition announcements, explicit stage-clear advance, complete descriptions, and hidden inactive semantics pass browser checks |
| P2-15 | done | Extract a generation-safe viewer flow controller | Opaque attempt/countdown identity, injected-scheduler tests, and a production-browser retained-callback probe reject stale work across every legal screen transition |
| P2-16 | done | Close direct-call and filesystem audio safety gaps | Strict bounded source/WAV/Ogg probes, process limits, derivative caps, containment, and offline adversarial recovery tests pass |
| P2-17 | done | Finish replay accessibility lifecycle and secondary visual evidence | Live reduced-motion changes pause/rebuild the exact committed frame; same verified detail preserves active replay DOM, cursor, speed, focus, disclosures, scroll, and announcements; changed proofs reset accessibly; reviewed scrolled controls remain stable |
| P2-18 | done | Make exact replay stepping self-explanatory | Player-readable frame controls expose a distinct stage-local ordinal in visible time, range semantics, and committed announcements; EXP-062 pins the focused 700px surface |
| P2-19 | done | Make live gameplay honor mid-session reduced-motion changes | Preference changes clear particles/shake, freeze retained popup travel, update all renderer motion without engine/input/clock/rank changes, survive BFCache, preserve focus/status, and clean up exactly once on true teardown |

## Phase 3 — Replay-backed competition

| ID | Status | Task | Evidence / exit condition |
| --- | --- | --- | --- |
| P3-01 | done | Version the Maltline protocol and replay contract | Ruleset 2, campaign generation 2, proof v1, replay v2, and fingerprints bind score-affecting inputs |
| P3-02 | done | Integrate authoritative replay verification into the public platform | Input-only challenge/submission route resolves registered authority and stores only verifier-derived results |
| P3-03 | done | Add adversarial verifier tests | Tampered score/state/scenario/ticks and resource-abuse cases reject |
| P3-04 | done | Integrate submission, leaderboard, replay transport, and retention | Strict client-to-real-Worker/D1/R2 smoke passes; every retained board proof has bounded integrity-checked transport and local input replay |
| P3-05 | done | Add replay viewer/scrubber | Verified-envelope-only cursor, stage navigation, exact/coalesced seek, 1×–8× playback, deterministic effects, semantic fallback, and modal lifecycle pass TD-08 and exact browser gates |
| P3-06 | done | Choose and document canonical seed/fairness policy | Fixed campaign plus one-use nonce binding prevents proof reuse without unequal hidden difficulty |
| P3-07 | done | Implement strict bounded input-only core verifier | 21 adversarial tests derive outcomes from server-owned campaign context |
| P3-08 | done | Bind proofs to immutable game/ruleset/campaign generations | Proof and verifier require authoritative ruleset 2/campaign generation 1 |
| P3-09 | done | Define canonical server envelope and proof hash | Strict challenge envelope has stable canonical JSON and SHA-256 |
| P3-10 | done | Prove verifier cost and canonical full-campaign replay | Generation-2 8-stage/21,662-tick proof has a stable summary/hash and CPU gate |
| P3-11 | done | Register immutable campaign authority and SHA-256 config digest | Frozen generation 2 resolves exact rules/RNG/run/stages under pinned SHA-256 identity |
| P3-12 | done | Choose fixed-campaign nonce or gameplay-seed policy | Envelope v3 names a fixed-campaign nonce and explicitly disclaims gameplay/human freshness |
| P3-13 | done | Expose one authoritative verify-and-hash facade | Root API resolves authority, derives summary/envelope/hash, and rejects unsafe canonical values |
| P3-14 | active | Establish Maltline Worker request/CPU/concurrency budgets | Required pre-session HMAC network admission now covers ranked writes, board reads, and proof GET/HEAD with fail-closed workerd barriers; deployed WAF/header inventory and worst-case production-equivalent capacity remain |
| P3-15 | done | Design recoverable one-use Maltline score persistence | Forward D1 schema, deterministic R2 keys, leased pending/ready/failed transitions, retention, and reconciliation survive race/failure injection |
| P3-16 | done | Record live ranked proofs without browser persistence | Authority-ordered in-memory recorder captures the shipped adapter, discards interruptions, persists nothing, and emits loss/full-campaign proofs accepted by the public verifier |
| P3-17 | done | Add browser challenge, submission, and leaderboard UX | Same-origin client and accessible Shift Board cover loading, empty, error, moderation edit, pending/expired retry, accepted/server-authoritative, ineligible, discard, and responsive states |
| P3-18 | done | Add machine-readable Maltline API error codes | Exact coded callsign and invalid-proof 400 responses produce distinct editable versus fail-closed browser states without changing Partition errors |
| P3-19 | done | Add direct browser-controller stale-completion barriers | Six non-cooperative browser-harness cases prove deferred challenge, board, and submit success/failure cannot mutate a replacement attempt |

## Phase 4 — Release quality

| ID | Status | Task | Evidence / exit condition |
| --- | --- | --- | --- |
| P4-01 | done | Add site/catalog/launcher wiring and production build | Static root launcher, permanent game routes, exact responsive/focus goldens, selective assembly, replay redirect, metadata, and local release gates pass |
| P4-02 | done | Complete asset licensing and privacy/security review | Exact runtime assets, OFL notice, privacy route, production graph, and disclosure boundaries pass automated checks |
| P4-03 | queued | Run multi-session human playtests | Results, observations, and resulting decisions are logged |
| P4-04 | queued | Final performance, browser, and cabinet-control validation | Target devices hold frame/tick cadence and controls are correct; measure static live redraw, concurrent replay reconstruction, retained full-win verification, cold seek, sustained drag, and deterministic effects under low-end/high-refresh main-thread budgets |
| P4-05 | queued | Freeze a release protocol generation | Full repository and completion audit passes |
| P4-06 | active | Harden production-shaped and live site routing evidence | Dry-run/bundle, Wrangler-local composite, fresh-entry, www, 404, and breakpoint gates pass; post-deploy apex/www/header/cache parity remains |

## Maintenance cadence

After every two substantial implementation experiments—or immediately after a
large engine, renderer, replay, or platform change—run a dedicated debt review.
Record findings as an experiment and add concrete refactors here. Refactors are
not considered complete without focused tests preserving behavior.
