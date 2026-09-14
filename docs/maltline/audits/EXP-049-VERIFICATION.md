# EXP-049 / telemetry schema-v3 verification audit

Date: 2026-09-10

Scope: adversarial, read-only review of the EXP-049 P1-08 tuning experiment, telemetry schema v3, generation-2 authority/proof compatibility, and focused tests.

Implementation changes made by this audit: none.

## Verdict

The reviewed experiment is safe to use as an **unranked, offline tuning experiment**. I found no path by which a tuned or shadow campaign can be submitted as the registered generation-2 campaign, no mutation of the generation-2 authority, and no regression in retained proof verification. The current evidence does not authorize ranked promotion or a generation-2 gameplay change.

There are no correctness or security blockers to the repository's full gates or to honest documentation of EXP-049. One evidence-presentation issue was found during the audit: the initial result shape combined the canonical seed with 32 shadows for stage-pressure distributions and exposed scalar sums without a machine-readable aggregation label. The settled schema/revision 2 repair closes that issue with separate scoped evidence, explicit total semantics, regenerated identities, and focused reconciliation checks.

Severity in this report concerns the reliability of tuning conclusions, not the ranked verifier, unless stated otherwise.

## Findings

### EXP49-V1 — Moderate — Stage-pressure evidence initially did not separate canonical and shadow populations

Status: **closed in schema/revision 2; verified 2026-09-10**.

At the reviewed test cutoff, `summarizeProfile()` passed all 33 runs to one `stagePressure()` result while only campaign-level outcomes had separate `canonical` and `shadows` fields. Therefore a stage-pressure mean described neither the registered seed nor the 32-seed shadow population alone. The full-output test called this "canonical/shadow pressure," but its assertions only inspected the combined value. This fell short of the P1-08 plan's requirement to report the canonical run separately from shadow distributions.

The same shape placed distributions beside scalar counters and score-ledger values that were sums across every run reaching the stage. For example, the reviewed control/delayed Stage 4 score ledger was `113850 + 16500 + 33000 = 163350`, the sum across 33 reached runs, rather than a per-run ledger. Without a scope/operation label, that value was easy to misstate as a representative run.

Relevant implementation areas are `stagePressure()` and `summarizeProfile()` in `games/maltline/src/telemetry/p1-08-tuning-experiment.ts`; the original overclaim was in the full-output test headed "canonical/shadow pressure" in `games/maltline/tests/p1-08-tuning-experiment.test.ts`.

Closure evidence:

- `P108StagePressureEvidence` now exposes `allRuns`, `canonical`, and `shadowOnly`; each scope includes an exact scope tag and `sourceRunCount` (`p1-08-tuning-experiment.ts:196-205,646-705`).
- Additive fields now live under `totalsAcrossReachedRuns`, and `P108_PRESSURE_DEFINITION.stageAggregation` binds the reached-run population, distribution operation, sum operation, and exact additive fields into the experiment identity (`p1-08-tuning-experiment.ts:57-94,164-205,628-642,851-883`).
- The experiment output schema and revision both changed from 1 to 2. The settled experiment fingerprint is `fnv1a64:02f416b17ef06cb2`; formatted JSON SHA-256 is `08fa7662562ef93b1a20499566c23ac5034a792b7ce3ec783abefe338d53dd7a` (`p1-08-tuning-experiment.test.ts:269-283`).
- The focused test asserts exact 33/1/32 scope sizes, all eight stages per scope, and a real canonical-versus-shadow Stage 7 difference (`p1-08-tuning-experiment.test.ts:304-347`).
- An audit diagnostic checked all 96 candidate/profile/stage triples: reached, cleared, every scalar total, every loss-reason total, and every score-ledger total satisfy `allRuns = canonical + shadowOnly`.

This issue no longer blocks canonical/shadow comparisons. Consumers must still choose the named scope rather than treating `allRuns` as shadow-only.

### EXP49-V2 — Low — Controller fingerprints are declarations, not implementation hashes

Status: **accepted trust boundary / documentation debt**.

`snapshotProfiles()` retains `id`, canonicalized `fingerprintData`, and `create`; experiment controller identity is calculated from only `id` and the declared metadata (`games/maltline/src/telemetry/p1-08-tuning-experiment.ts`, profile snapshot and controller-identity construction). The telemetry binder uses the same policy in `games/maltline/src/telemetry/campaign-telemetry.ts:236-254`.

A focused adversarial probe supplied two different controller factories with identical `id` and `fingerprintData`. One lost Stage 1 with score 0; the other cleared three stages before the configured limit, yet both experiment fingerprints were identical. This is not a ranked security issue: controller definitions and experiment execution are local/trusted, and the checked-in full-output SHA detects drift in the built-in run. It does mean the experiment fingerprint alone cannot prove which JavaScript controller implementation produced an externally retained artifact.

Bounded treatment:

- State that controller fingerprints bind reviewed metadata, not executable source.
- Require any behavior change to increment the controller's declared algorithm/version metadata.
- Retain the formatted artifact SHA and source revision/commit in published experiment evidence.
- Do not use `Function.prototype.toString()` as a security hash; a build-artifact or source-manifest digest would be the stronger future mechanism if portability is required.

### EXP49-V3 — Low — Public experiment options have no collection-cardinality budget

Status: **deferred local hardening**.

Input normalization strictly validates each candidate, profile, and seed offset, and every simulated scenario is normalized and checked against ranked scenario ceilings. However, the public runner requires only non-empty arrays and unique IDs/offsets; it does not cap the number of candidates, profiles, or seeds. In addition, the campaign total-tick ceiling is checked after each complete campaign telemetry run (`games/maltline/src/telemetry/p1-08-tuning-experiment.ts:733-794` in the current area), so a custom run may execute up to eight per-stage limits before failing the proof-total policy.

The checked-in default is bounded (4 candidates × 3 profiles × 33 seeds), and this API is neither remotely reachable nor used by ranked verification. Consequently this is not a release blocker. Before accepting untrusted configuration or running it in shared automation, cap all three cardinalities, checked-multiply the planned run count, and enforce a cumulative campaign tick budget during simulation rather than only after return.

## Verified properties

### Ranked/unranked boundary

- The result and every effective campaign are explicitly marked `unranked`; authority registration and season are null, and ranked proof emission is declared forbidden (`p1-08-tuning-experiment.ts:49-55`).
- The experiment emits identities and aggregates, not input runs or a proof/submission constructor. The focused test also scans the experiment source for proof/submission APIs (`p1-08-tuning-experiment.test.ts:234-267`).
- Candidate changes are limited to the intended Stage 5/7 tuning fields. Stale `from` values, no-ops, unsupported stages/fields, duplicate changes, non-finite values, and ranked ceiling violations fail closed.
- Every changed candidate or nonzero seed must have an effective campaign fingerprint different from the registered baseline. Seed zero for the unchanged control must equal the baseline fingerprint.

### Identity and normalization

- The runner asynchronously verifies the frozen authority configuration against the pinned SHA-256 before simulation, then normalizes the authority campaign and initial run (`p1-08-tuning-experiment.ts`, authority-validation block).
- Experiment identity binds schema/revision, hypothesis, telemetry schema, unranked policy, authority identity and verified digest, game/rules fingerprints, baseline and per-stage fingerprints, initial run, ordered seed offsets, controller metadata, limits, analysis semantics, ordered candidates, and every effective campaign/configuration fingerprint.
- Scenario fingerprints include every normalized gameplay field, including timing, speeds, repeat settings, lives, and seed (`campaign-telemetry.ts:185-228`).
- Options are snapshotted before the first `await`; exact-key/data-property checks reject extras and accessors. Returned experiment data is deeply frozen.

### Determinism and accounting

- Two complete default executions are byte-identical under experiment schema/revision 2. The current experiment fingerprint is `fnv1a64:02f416b17ef06cb2`, and formatted JSON SHA-256 is `08fa7662562ef93b1a20499566c23ac5034a792b7ce3ec783abefe338d53dd7a`. The replaced schema/revision 1 hashes remain recorded in EXP49-V1 only as historical audit evidence and must not label current output.
- Telemetry schema v3 is pinned by an independent full formatted-output golden. The reviewed canonical generation-2 campaign fingerprint remained `fnv1a64:adc596f1154aeafa`, and the canonical telemetry configuration fingerprint remained `fnv1a64:28ac8864373bc650`.
- The telemetry loop derives counters from deterministic engine states/events. It throws unless score-ledger categories equal engine score gain and unless walkout/re-service counters reconcile (`campaign-telemetry.ts:513-524`). Focused handcrafted tests cover demand reservation, semantic inequalities, exact quiet runs, jar/floor pressure, both walkout classes, repeated service, and every score source.
- Stage and campaign status represent terminal engine status or an explicit `tick_limit`; campaign simulation stops after the first non-win stage.

### Generation-2 compatibility

- The generation-2 authority still pins ruleset 2, campaign generation 2, proof schema 1, initial run `{ lives: 4, score: 0 }`, and configuration SHA-256 `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`.
- Authority tests prove the public campaign aliases the deeply frozen registered campaign and recompute the exact digest.
- Static generation-2 win, loss, and mistake proofs continue to verify. Workerd budget tests continue to exercise canonical and one-record-per-tick proof shapes and exact/one-over resource boundaries.
- No authority, ruleset, proof, replay, envelope, migration, season, platform route, or viewer runtime change is required for this unranked experiment. Promotion remains a separate generation/authority/season decision.

## Test adequacy and residual acceptance criteria

The focused suites are strong on determinism, malformed transforms, identity sensitivity, exact telemetry behavior, unranked isolation, immutable authority, proof goldens, Worker-runtime proof budgets, named evidence scopes, and a seed-sensitive canonical/shadow distinction. Useful non-blocking strengthening would be:

- Campaign-level assertions that `resolved = walkouts + exited`, `fulfilled <= spawned`, loss-reason totals equal lives lost, and the aggregated score ledger equals campaign score gain.
- Explicit default-cardinality and checked work-budget assertions.
- A policy test requiring behavior-version metadata to change whenever a checked-in controller's decision behavior changes.

These improve diagnosis and provenance; the engine-derived score/walkout checks already prevent the most consequential misleading aggregates.

## Commands and results

Final focused run against the settled schema/revision 2 repair:

```text
npm exec --workspace @arcadebench/maltline -- vitest run tests/p1-08-tuning-experiment.test.ts tests/telemetry-pressure.test.ts tests/campaign-telemetry.test.ts tests/tuning-experiment.test.ts tests/player-models.test.ts tests/physical-intent-controller.test.ts tests/authority.test.ts tests/proof.test.ts
```

Result: **8 test files passed; 102 tests passed; duration 12.79s**. This includes the EXP-049, telemetry pressure, schema-v3 golden, controller/model, immutable authority, and proof-verifier suites.

```text
npm exec --workspace apps/platform -- vitest run tests/maltline-verifier-budget.test.ts tests/maltline-data-model.test.ts
```

Result: **2 test files passed; 10 tests passed; duration 695ms**.

Exact final scope/reconciliation diagnostic:

```text
npm run tuning:p1-08 --workspace @arcadebench/maltline --silent | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s);let n=0;for(const candidate of x.candidates)for(const profile of candidate.profiles){const a=profile.stagePressure.allRuns,c=profile.stagePressure.canonical,h=profile.stagePressure.shadowOnly;if(a.scope!=="all-runs"||a.sourceRunCount!==33||c.scope!=="canonical-run"||c.sourceRunCount!==1||h?.scope!=="shadow-runs-only"||h.sourceRunCount!==32)throw Error("scope");for(let i=0;i<a.stages.length;i++){const as=a.stages[i],cs=c.stages[i],hs=h.stages[i];for(const k of ["reached","cleared"])if(as[k]!==cs[k]+hs[k])throw Error(k);for(const k of ["repeatServiceActions","neverFulfilledWalkouts","fulfilledThenWalkout","livesLost"])if(as.totalsAcrossReachedRuns[k]!==cs.totalsAcrossReachedRuns[k]+hs.totalsAcrossReachedRuns[k])throw Error(k);for(const group of ["lossReasons","scoreLedger"])for(const k of Object.keys(as.totalsAcrossReachedRuns[group]))if(as.totalsAcrossReachedRuns[group][k]!==cs.totalsAcrossReachedRuns[group][k]+hs.totalsAcrossReachedRuns[group][k])throw Error(group+"."+k);n++}}console.log(JSON.stringify({schemaVersion:x.schemaVersion,revision:x.identity.revision,rankEligibility:x.rankEligibility,experimentFingerprint:x.experimentFingerprint,stageTriplesChecked:n}))})'
```

Result: `{"schemaVersion":2,"revision":2,"rankEligibility":"unranked","experimentFingerprint":"fnv1a64:02f416b17ef06cb2","stageTriplesChecked":96}`.

Controller identity counterexample (executed after the report issue was raised; both runs used candidate A, seed offset 0, and a 2,000-tick per-stage limit):

```text
npm exec --workspace @arcadebench/maltline -- tsx -e "import { IDLE_INPUT, P108_TUNING_CANDIDATES, REACTIVE_MALTLINE_CONTROLLER, runP108TuningExperiment } from './src/index.ts'; void (async () => { const base = { id: 'identity-collision-probe-v1', fingerprintData: { algorithm: 'identity-collision-probe', version: 1 } } as const; const idle = await runP108TuningExperiment({ candidates: [P108_TUNING_CANDIDATES[0]!], profiles: [{ ...base, create: () => () => IDLE_INPUT }], seedOffsets: [0], tickLimitPerStage: 2000 }); const active = await runP108TuningExperiment({ candidates: [P108_TUNING_CANDIDATES[0]!], profiles: [{ ...base, create: REACTIVE_MALTLINE_CONTROLLER.create }], seedOffsets: [0], tickLimitPerStage: 2000 }); console.log(JSON.stringify({ sameFingerprint: idle.experimentFingerprint === active.experimentFingerprint, fingerprint: idle.experimentFingerprint, idle: idle.candidates[0]!.profiles[0]!.canonical, active: active.candidates[0]!.profiles[0]!.canonical })); })();"
```

Result: `sameFingerprint:true` with current fingerprint `fnv1a64:ba5bc41b5e9a6568`; idle lost Stage 1 at 1,854 ticks with score 0, while active cleared three stages and reached `tick_limit` at 7,060 campaign ticks with score 10,255.

The pre-repair platform compatibility command above remains valid because the repair changed only unranked experiment evidence. The final 102-test Maltline run independently rechecked authority/proof compatibility after the repair. The broad 557-unit, 84-Playwright, build, and site-smoke gates were reported green by the coordinating agent; this auditor did not rerun or independently count those broad gates.

## Release/documentation decision

- **Safe as an unranked experiment:** yes.
- **Blocks ranked generation-2 compatibility:** no; the registered authority and proof protocol are unchanged and focused compatibility tests passed.
- **Blocks full gates:** no.
- **Blocks documentation:** no. Documentation must use the schema/revision 2 hashes and preserve the explicit scope/aggregation language; it must not reuse schema/revision 1 values or describe totals as per-run.
- **Supports immediate campaign promotion:** no. EXP-049 supplies deterministic model evidence, not player evidence; any gameplay promotion must follow the generation/authority/season gates in `P1-08-TUNING-VERIFICATION-PLAN.md`.
