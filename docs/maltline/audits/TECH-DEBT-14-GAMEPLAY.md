# Maltline Technical-Debt Audit 14 — Gameplay and Evidence Architecture

**Date:** 2026-09-11
**Scope:** Settled P0-58 portable-evidence runtime/snapshot hardening, P0-57
visual-evidence authority, generation-2 gameplay, prospective tuning/recovery
evidence, release scope, and remaining human-decision gates. Product code and
tests were read only.

## Verdict

There is **no P0 gameplay, ranked-authority, proof, evidence-integrity, or
release blocker** in the reviewed tree. P0-58 and P0-57 are accepted as
bounded infrastructure/evidence improvements. Neither changes simulation,
scoring, lives, campaign parameters, proof bytes, controller behavior, Canvas
commands, or checked-in PNG pixels, so neither supplies a reason to revise
generation 2.

The highest-value autonomous follow-up remains P0-54: converge P108 and P102
on one fail-closed, entry-scoped source-graph policy and commit the all-fresh
P102 equivalence oracle while separating expensive provenance checks from the
multi-million-tick experiment fixture. That work protects the next evidence
revision; it does not add tuning evidence and must not be described as such.

The actual gameplay decisions remain human-gated. Deterministic models make a
5–15-minute successful run plausible and show that Stage 8 interval 138 is
relief relative to 132, but they do not establish human completion time,
preference, learning, recovery comprehension, or whether carried-life scoring
feels fair. No engine, rules, scoring, lives, campaign, proof, or ranked
authority change is justified now.

| Severity | Count | Classification |
| --- | ---: | --- |
| P0 | 0 | No current gameplay, evidence, proof, authority, or release blocker. |
| P1 | 4 | One bounded evidence-architecture repair and three retained human/product decisions. |
| P2 | 3 | Defensive visual-contract hardening, a low-level archival API boundary, and external release evidence. |

## Accepted post-TD-13 implementations

### P0-58 — current-source identity now describes one verified toolchain/snapshot

The P102 producer owns an exact toolchain contract. It includes `.node-version`
among five build inputs, imports the executing TypeScript and tsx package
metadata, checks Node 22.19.0 plus TypeScript 7.0.2 and tsx 4.23.12 against the
declaration/lock, and binds those versions into the recipe
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:44-64,388-453`). Both CI
jobs consume `.node-version`; the declaration is one exact version plus LF.

Source identity uses normalized `SourceFile.text` from the TypeScript snapshot
and requires the corresponding normalized disk bytes to match before hashing
(`:351-385`). Build inputs are captured by realpath and bytes before snapshot
creation, then re-realpathed and re-read after both producer/kernel traversals
(`:394-411,419-475`). The injected post-snapshot barrier is strictly normalized
and exists only to prove concurrent source/config mutation fails closed
(`:200-217,455-470`). This closes TD13's AST/disk/config race without claiming
an operating-system transaction.

The identity split is coherent:

- current producer source: 21 files,
  `9b1f552b7af077b73c147dbba6984a8684f7bb5e7455275bc745a6cdc43c17f1`;
- unchanged kernel: 19 files,
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`;
- current build recipe:
  `1b7ab8ba811590bf9ce028717bcf25ffcff5debb00ee1031c119517a922ac863`;
- current integrity:
  `a388db09f772bf67b0153046f1173e521b4f52ebc02738858a54cb3f0a791569`;
- current formatted envelope: 533,781 bytes,
  `524595399413e934aa9c3082bc92cb53efc79b7fbb58dc8998c320bfd9d36a2b`.

The exact EXP-078 envelope remains an archival schema-1 document at 533,781
bytes and SHA-256
`442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`.
It accepts only with explicit `verifyCurrentSource: false`; current-source
verification rejects it. Payload, result, controller registry, experiment
fingerprint, kernel, and the 2,736,116-step work ledger are unchanged
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:299-307,
343-399`). This is honest provenance evolution rather than a gameplay rerun
being relabeled.

The producer remains an offline package-script leaf. It has no Maltline root,
viewer, proof, ranked, or Worker export. The graph allows only its reviewed
viewer input-adapter dependency and rejects proof, competition, platform,
human-lab, and production-root closures
(`p1-02-stage8-relief-envelope.ts:339-349,476-479`). P0-58 therefore has no
ranked or production-gameplay impact.

### P0-57 — visual evidence now binds bytes and shared HUD truth

The schema-2 baseline manifest contains a sorted 49-entry name/SHA-256 ledger
and an ordered-raw aggregate. Its normalizer checks exact top-level/browser/
entry fields, lowercase plain PNG names, digest form, uniqueness, order, and
the 256-entry ceiling; file verification reconciles directory inventory,
individual bytes, and aggregate bytes before browser comparison
(`games/maltline/tests/visual/baseline-contract.ts:7-129`). The current
7,107-byte manifest is
`dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`;
the raw 49-PNG aggregate remains
`00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.

Orders and lives rectangles now live in the frozen frame authority as
`hudOrders` and `hudLives`
(`games/maltline/src/viewer/renderer-layout.ts:24-45`). The renderer,
transcript tests, fixture metadata, and browser spacing assertions consume
those objects (`renderer.ts:1500-1522`; `visual-fixtures.ts:1074-1091`;
`renderer-presentation.test.ts:365-405`; `visual/maltline.visual.spec.ts:
1726-1746`). Zero lives no longer advertises a strawberry color in metadata
when the painter draws no life cup, while positive lives retain the motif
(`visual-fixtures.ts:1082-1091`).

This is evidence truth, not gameplay proof. The manifest says what reviewed
PNG bytes exist, and shared rectangles say where two HUD roles are painted; it
does not prove a player reads them quickly or enjoys the loop. All 49 PNG bytes
and exact render output are unchanged, so P0-57 neither reopens P0-53 nor
advances P1-02/P1-04/P1-08.

## P1 findings

### TD14-G01 — P108 and P102 still mean different things by source closure

**Owner:** P0-54. **Current artifact blocker:** no. **Blocker before another
P108 current-source revision:** yes.

P102 now admits a reviewed external set and fails closed on every other static
specifier and supported loader/directive form. P108's separate walker still
collects only relative or absolute import/export/import-equals specifiers and
otherwise falls through (`games/maltline/tools/p1-08-artifact-envelope.ts:
298-321`). Its focused adversaries cover unresolved/dynamic/escaping locals,
build-input escape, and graph ceilings
(`games/maltline/tests/p1-08-artifact-envelope.test.ts:275-325`), but they do
not establish P102's workspace/package/path-alias and complete static-source
policy.

The current fixed P108 graph has no demonstrated hidden workspace import, so
this does not invalidate its retained payload. The debt is duplicated evidence
semantics: a future P108 revision can omit a dependency class that P102 would
reject.

**Bounded exit:** share one parameterized graph walker with exact entry,
external, viewer-leaf, prohibited-closure, file, and byte policies. Apply the
same adversarial matrix to both envelopes. Preserve old P108 bytes only as an
explicit archival artifact; issue new source/build/envelope identities without
changing its payload/result/controller/work facts. Keep kernel externals
entry-scoped and empty unless independently reviewed.

### TD14-G02 — prefix reuse needs a committed all-fresh oracle, not more simulation

**Owner:** P0-54. **Gameplay blocker:** no. **Evidence-maintenance blocker
before changing the optimizer:** yes.

P102 truthfully labels 264 logical campaign outcomes, 132 executed prefixes,
132 reused prefixes, 1,006 stage/controller starts, and 2,736,116 actual ticks/
calls/steps (`p1-02-stage8-relief-experiment.test.ts:299-307`). Tests reconcile
control/candidate prefix identity and Stage 8 results, so the accepted artifact
does not claim 264 independently executed prefixes. The remaining weakness is
maintenance: source-walker adversaries, CLI provenance, and multi-million-tick
simulation share an expensive fixture, while the independent all-fresh
equivalence oracle is not the normal committed regression seam.

**Bounded exit:** commit one fixed all-fresh 132-pair oracle comparing every
Stage 1–7 terminal state/input count/tick/event and Stage 8 outcome against the
optimized artifact. Cache one canonical artifact per test file, split
source-security fixtures from simulation assertions, and retain existing
semantic tick/work ceilings and default timeouts. Do not call test-throughput
work a balance result.

### TD14-G03 — successful-human duration and Stage 8 preference remain unmeasured

**Owners:** P1-02, P1-08, P1-10, P4-03. **Blocks:** generation-3 tuning or
closing the 5–15-minute objective; not the current generation-2 release.

The product criterion is a complete fresh human run normally lasting 5–15
minutes (`docs/maltline/TASKS.md:8-17`). Deterministic reference players clear
in roughly 6.0–6.2 active minutes before cards and transitions
(`games/maltline/README.md:8-18`). P102's fixed profiles show the Stage 8
132-to-138 change improves delayed completion from 31/33 to 33/33 and adapter-
delayed completion from 30/33 to 33/33; reactive remains 33/33, while the
novice error-injection profile never reaches Stage 8
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:217-235`). This
proves relief under those models, not a human optimum.

The existing A/D lab plays only Stages 4–7, with fresh four-life rounds and a
different candidate D (`games/maltline/src/experiments/human-lab-session.ts:
694-736`; `p1-08-candidates.ts:52-91`). Its own protocol explicitly forbids
using the shortened rounds to close full-game duration
(`docs/maltline/audits/P1-08-HUMAN-LAB-UX.md:201-212`). It therefore cannot
decide Stage 8 interval 138.

**Acceptance before promotion:** collect predeclared first-time and informed
successful full-run wall-time distributions, including failed attempts,
restarts, cards, countdowns, and manual clear dwell. If 138 remains a candidate,
run a blinded comparison that actually includes Stage 8 and records preference,
pressure/fairness, hardest decision, loss cause, jar return/recovery experience,
fatigue, and completion. Do not substitute ticks or synthetic profile labels
for participant evidence.

### TD14-G04 — recovery metrics cannot select the carried-life score policy

**Owner:** P1-04 and human-session analysis. **Blocks:** scoring-policy change;
not current scoring correctness.

Current score/life resolution is deterministic and internally truthful. EXP-059
shows the same single first-return miss in Stage 4 versus Stage 8 wins all 33
seeds, with identical serve/catch ledgers but current carried-life totals of
34,880 versus 35,880. The stage-local alternative makes both 35,880 and the
fixed-progress-plus-final-lives alternative makes both 35,630 while preserving
the 8,000-point perfect stage-clear budget
(`games/maltline/tests/p1-04-recovery-experiment.test.ts:35-113`). P102 adds
structural later-first-fulfillment latency, inter-loss spacing, and terminal
cascade evidence with event ordinals, and labels that relationship without
claiming causality (`p1-02-stage8-relief-experiment.test.ts:239-297`).

Those facts reveal the policy tradeoff; they do not choose it. A human must
show whether an early mistake feels permanently over-penalized, whether the
recovery/CHAIN feedback is understood, and whether the ranking incentive feels
fair. Until then, retain authoritative carried lives and do not combine a
scoring change with the Stage 8 cadence candidate.

## P2 findings and release boundaries

### TD14-G05 — schema-2 screenshot collections and path adversaries need one defensive pass

**Owner:** P0-59. **Release/gameplay blocker:** no.

`normalizeMaltlineVisualBaselineManifest` uses `Array.isArray` and then `.map`
for screenshots (`games/maltline/tests/visual/baseline-contract.ts:94-109`). It
does not first require the array's exact prototype, own-key set, dense indices,
or data descriptors, so hostile sparse/accessor/extended arrays are not handled
through the same deliberate fail-closed boundary as the entry objects. The
plain filename regex blocks `../` and separators, and directory enumeration
rejects individual symlink entries, but focused tests do not pin traversal
names or a symlinked baseline-directory/root case
(`games/maltline/tests/visual-baseline-contract.test.ts:15-91`).

The input is a checked-in test manifest and current entries are exact, sorted,
dense JSON, so this cannot alter gameplay, production, or accepted PNG
identity. It is nonetheless concrete defensive debt in a newly security-shaped
test boundary.

**Bounded exit:** before mapping, reject non-`Array.prototype` collections,
holes, symbol/non-index/extra keys, non-enumerable indices, and index/length
accessors without invoking getters. Add explicit `../`, absolute/separator,
file-symlink, baseline-directory-symlink, and out-of-root resolution fixtures;
define whether the contract rejects all directory symlinks or verifies a
realpath-contained root. Preserve schema-2 checked-in bytes and all PNG hashes.

### TD14-G06 — archival verification remains a low-level boolean

**Owner:** P0-54 or the first new caller. **Current blocker:** no.

P102 defaults `verifyCurrentSource` to true, and the only supported CLI emits
the current fixed artifact. Explicit false is necessary to verify EXP-078's
archival structure without falsely calling its old producer current. Because
the helper is package-private and absent from viewer/Worker/ranked graphs, the
present contract is honest. If another caller appears, replace the downgrade
boolean with separately named archival/current operations or a result whose
mode cannot be ignored. Never accept the mode from untrusted artifact data.

### TD14-G07 — the remaining release claims require deployment and hardware evidence

**Owners:** P4-04, P4-05, P4-06. **Current local-build blocker:** no.

The final root gates prove deterministic builds, exact routes/assets, local
Wrangler behavior, privacy scanning, and pinned-browser presentation. They do
not prove post-deploy apex/www headers and cache behavior, shared-edge capacity,
or cabinet/reference-device frame cadence and controls. P4-06 correctly keeps
post-deploy parity active, P4-04 remains queued for target-device measurement,
and P4-05 remains queued for final protocol freeze
(`docs/maltline/TASKS.md:156-165`). Do not describe dry/local checks as live
deployment or 700/1280 screenshots as cabinet-distance comprehension.

## Authority and change recommendation

Ruleset 2, campaign generation 2, proof schema 1, and registered authority are
unchanged. The reviewed work strengthens how two evidence families describe
their source and pixels; it adds no player outcome. Therefore:

1. Complete P0-54 as evidence architecture, then P0-59 as a small defensive
   contract repair; neither warrants a campaign generation.
2. Collect the already-defined participant and full-run evidence for
   P1-02/P1-04/P1-08/P1-10/P4-03.
3. Only after that evidence selects a candidate should a scenario-only tuning
   change increment campaign generation. Change ruleset/proof only if scoring
   or protocol semantics actually change.
4. Keep counter/environment repaint, audio acquisition, device performance,
   and live deployment as separately owned gates rather than bundling them
   with tuning.

## Evidence run for this audit

Independently run on the settled tree:

```sh
npm exec --workspace=@arcadebench/maltline -- vitest run \
  tests/visual-baseline-contract.test.ts tests/renderer-layout.test.ts \
  tests/renderer-presentation.test.ts \
  tests/p1-02-stage8-relief-experiment.test.ts --reporter=dot
# 4 files, 51 tests passed
```

Direct checks also reproduced the schema-2 manifest SHA-256
`dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`
and the protected Partition sitemap SHA-256
`1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.

The settled root validation reports **827 unit tests** (686 Maltline + 68
platform + 58 Partition + 15 shared), 146 Maltline Playwright checks, 19 site
browser checks, all workspace and assembled-site builds, exact 24-file/
445,096-byte site assembly, Wrangler dry-run/local and smoke checks, privacy
scanning across 154 files, and `git diff --check`. The Worker remains 201,177
bytes, 44,448 gzip bytes, and 31 source-map entries at SHA-256
`610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`.

## Closure recommendation

Close P0-60 with zero P0 findings after the companion verification and visual
audits reconcile this same settled tree. Keep P0-54 and P0-59 as bounded
evidence hardening, and keep all human/device/deployment decisions active or
queued under their existing owners. Do not promote Stage 8 interval 138,
change carried-life scoring, or revise generation 2 on the basis of P0-58 or
P0-57.
