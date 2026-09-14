# TD-12 verification and release review

Date: 2026-09-11

## Scope and verdict

This review covers the settled EXP-078 P102 Stage 8 relief experiment, its
offline envelope/parser, source and build provenance, work accounting,
generation-2 isolation, production exports, and the requirements for any later
generation-3 promotion. It does not reinterpret the experiment as human,
ranked, signed, or deployed evidence.

There is **no P0 correctness, verification, or release blocker for the exact
EXP-078 artifact**. Its fixed payload, current 21-file producer graph, 19-file
simulation kernel, toolchain recipe, and full work ledger reconcile. The
candidate remains correctly self-attested and unranked. The one material P1
finding is a future provenance-boundary hole: the source walker does not resolve
or reject bare workspace-package specifiers. The reviewed graph uses no such
specifier, so this does not invalidate the pinned EXP-078 bytes, but it must be
closed before publishing a later source-bound artifact revision or using the
same walker as promotion evidence.

| Severity | Current count | Meaning |
| --- | ---: | --- |
| P0 | 0 | No defect requires reopening EXP-078 or blocks the present generation-2 release. |
| P1 | 2 | Required before a later artifact revision or generation-3 promotion. |
| P2 | 3 | Bounded robustness/test debt; safe to defer while this remains an offline fixed-input tool. |

## Findings

### P1 — Bare workspace imports can escape the claimed transitive closure

`localSpecifiers` follows only specifiers beginning with `.` or `/`
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:192-210`). A future
static import such as `@arcadebench/maltline`,
`@arcadebench/maltline/verifier`, or another `@arcadebench/*` workspace package
would be treated like an external dependency rather than resolved or rejected.
Consequently, its transitive files could omit the root barrel, proof code, or
another prohibited workspace boundary even though `assertGraphPolicy` claims to
exclude them (`:229-238`). The current fixture proves rejection for a relative
proof import only (`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:337-353`).

This is not a current-artifact defect. The exact producer manifest is pinned at
21 files and contains only relative local dependencies; the 19-file kernel has
the one declared viewer dependency and contains no proof, competition,
human-lab, platform, testing, or root-barrel file. Any change to the current
entry source also changes the aggregate source and build digests. The gap is
that a future review could mistakenly accept an incomplete new closure after
updating those pins.

Acceptance criteria before P102 revision 2 or reuse of this walker:

- Fail closed on all bare `@arcadebench/*` specifiers, or resolve them through
  an exact reviewed workspace/subpath map and traverse the resolved local file.
- Add fixtures for the Maltline root, Maltline verifier subpath, another
  workspace package, re-export syntax, import-equals syntax, and an unresolved
  local/workspace alias. Each prohibited or unresolved case must fail before an
  identity is emitted.
- Preserve explicit handling for the intentional
  `viewer/viewer-input-adapter.ts` dependency and keep dynamic imports rejected.
- Because the walker source is part of the producer graph, retain EXP-078 as a
  historical schema-1 artifact and issue new source/build/envelope hashes rather
  than rewriting its recorded identities.

### P1 — Generation 3 is not a data edit; authority and storage are generation-2-specific

The proposed `132 -> 138` change is correctly isolated as prospective data.
The experiment requires the exact registered generation-2 configuration and
rejects baseline drift
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:624-638`),
while the candidate constructor validates an exact one-field normalized diff
(`:326-356`). Its policy explicitly has no authority registration, season, or
ranked proof emission (`:40-46`). Nothing in EXP-078 changes the registered
campaign.

Promotion cannot safely mutate the existing constant. Authority identity and
types currently use the single literal `MALTLINE_CAMPAIGN_GENERATION`, and the
only production constructor and registry entry are generation 2
(`games/maltline/src/core/authority.ts:32-52,74-111`). Platform storage and
leaderboard code likewise name one generation-2 season/context
(`apps/platform/src/maltline-leaderboard.ts:1-20`), while the migration pins
that season and stores authority, proof, envelope, nonce, and configuration
identity in every challenge/score (`apps/platform/migrations/0003_maltline_generation_2.sql:5-43,87-165`).

Acceptance criteria for a future promotion:

1. Preserve the deeply frozen generation-2 authority, digest, proof fixtures,
   retained envelopes, season, rows, and verification path byte-for-byte.
2. Add a separately authored and normalized generation-3 campaign snapshot,
   new campaign-generation identity and SHA-256 configuration digest, and a
   second registry entry. Refactor literal generation types without weakening
   exact authority resolution or permitting caller-supplied campaign data.
3. If engine rules, RNG, scenario schema, proof inputs, and envelope wire shape
   are unchanged, bump campaign generation/configuration only. Bump ruleset,
   proof schema, RNG, or envelope versions only when their respective semantics
   actually change.
4. Add static generation-3 win, loss, and mistake proofs; verifier/envelope
   goldens; deterministic repeated hashes; Worker-runtime maximum-shape and CPU
   evidence; and explicit tests that generation-2 proofs still resolve only to
   generation 2.
5. Add a forward-only D1 migration and generation-3 season/storage context.
   Challenge issuance, object keys, ranking, retention, and reconciliation must
   select the authority by trusted season context. Archive/admit seasons
   atomically and retain generation-2 leaderboard/proof inspection.
6. Switch viewer/default telemetry only at the deliberate launch boundary,
   update campaign/scenario fingerprints and study materializer identities, and
   obtain the still-required human duration, fairness, fatigue, and recovery
   evidence. EXP-078 simulation alone is not promotion authority.

### P2 — The unknown-object verifier measures size after canonical serialization

The JSON parser safely checks the UTF-8 input length before `JSON.parse`
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:566-574`). In contrast,
`verifyP102Stage8ReliefEnvelope(unknown)` first canonicalizes the complete
object and only then checks the 2 MiB result (`:514-520`). Canonical JSON still
rejects accessors, cycles, exotic prototypes, non-finite values, sparse/extra
arrays, and depth over 64, but an in-process caller can supply a very wide or
large-string ordinary object and force work/allocation above the advertised
envelope limit before rejection.

This is non-blocking because the helper is tool-local, is not a package export,
and the supported untrusted serialized boundary is pre-bounded. Before exposing
the unknown-object function to a service or plugin, add a descriptor-only
bounded preflight for nodes, keys, array lengths, and cumulative UTF-8 string
bytes, then canonicalize. Tests should reject one-over limits without invoking
hashing and include wide, deep, large-string, accessor, and cycle cases.

### P2 — Tick limits cannot preempt a stalled trusted controller callback

The experiment preflights 264 fixed logical runs and a 15,840,000-tick maximum
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:641-653`),
then enforces stage, campaign, and cumulative counters immediately around every
engine step (`:500-537`). The final ledger reconciles actual starts and
ticks/calls/steps (`:736-745`). However, the controller call itself is ordinary
synchronous code and cannot be interrupted by those counters. The identity is
honest about that limitation (`:695-704`), and the controller set is a fixed
module constant rather than caller input (`:78-83,770-777`).

This is safe for the current source-bound offline run. If these tools are ever
made extensible or run as an automated shared service, execute the complete
fixed job in a supervised subprocess/Worker with an external wall-clock and
memory ceiling; never claim that a tick cap bounds arbitrary callback CPU.

### P2 — Prefix equivalence is strongly evidenced but the independent oracle is not a committed gate

Prefix reuse clones/freezes only run totals and loss counters, creates a fresh
engine and controller for every executed stage, and reuses terminal-before-
Stage-8 outcomes without further stepping
(`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:462-556`).
The ledger distinguishes 264 logical outcomes from 132 executed and 132 reused
prefixes, with 1,006 starts and 2,736,116 actual ticks/calls/steps (`:708-745`).
Tests prove pairwise prefix value equality without reference aliasing and pin
the ledger (`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:116-127,212-220`).
Independent TD-12 reproduction also matched every one of the 132 relief
terminal outcomes against a fresh full eight-stage execution.

The latter oracle is review evidence, not a checked-in regression test. Before
changing prefix structure, controller lifetime, per-stage RNG construction, or
campaign carry semantics, add a bounded test that compares every optimized A/B
outcome—and preferably Stage 8 observation/event summaries—to independent full
campaign execution. Do not update reviewed payload pins until that equivalence
passes.

## Integrity, parsing, and trust assessment

- Source traversal uses TypeScript ASTs for static import/export/import-equals,
  rejects dynamic imports, resolves a closed extension/index set, realpaths
  every file, rejects repository escapes, and caps the graph at 256 files and
  4 MiB (`games/maltline/tools/p1-02-stage8-relief-envelope.ts:192-271`). LF
  normalization and repository-relative POSIX names make the current graph
  independent of cwd and checkout line endings.
- The producer identity includes package/version/mode/entry, source and kernel
  closures, explicit graph policy, exact Node/TypeScript/tsx versions, and a
  build-recipe hash over the package manifest, package/root tsconfigs, and lock
  file (`:274-334`). Verification defaults `verifyCurrentSource` to true and
  requires canonical equality with a fresh producer identity (`:514-563`).
- Payload verification recomputes the experiment fingerprint from identity and
  the result SHA-256 from all runs, summaries, and actual work (`:337-359`). It
  binds exact generation 2 and reconciles bounded work (`:360-406`). The
  reviewed full canonical payload byte count/SHA, experiment fingerprint, and
  result SHA are then pinned (`:34-40,475-480`), so changing a nested run while
  recomputing subordinate hashes still fails. The descriptor, controller
  registry digest, and envelope-without-integrity SHA are recomputed
  (`:483-563`).
- `verifyCurrentSource: false` intentionally verifies only the recorded
  self-attested artifact and its internal integrity; it is not a signature or
  independent build attestation. The exact trust limitation is mandatory in
  the envelope (`:83-107,529-533`). This is appropriate for archival parsing,
  provided consumers do not relabel it as ranked, human, signed, or reproduced
  current-source evidence.
- Recovery pairs each first-fulfillment event at most once to an earlier loss,
  comparing tick and within-tick ordinal (`games/maltline/src/experiments/p1-02-stage8-relief-experiment.ts:374-415`).
  Scarcity rates use raw counts divided by each run's observed Stage 8 ticks
  and round to six decimals (`:275-277,441-459`). Tests cover same-tick ordering,
  one-to-one consumption, mixed-tick rejection, exact recovery distributions,
  and normalized rate distributions
  (`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:152-210`).

## Production and generation-2 boundary

P102 is absent from the Maltline root exports and narrow production verifier
surface (`games/maltline/src/index.ts:1-37`, `games/maltline/src/verifier.ts:1-16`).
The only public invocation is the package's offline `relief:p1-02` tool script
(`games/maltline/package.json:13-24`). The normal viewer graph test rejects all
`src/experiments/**` and `src/testing/**` modules
(`games/maltline/tests/human-lab-boundary.test.ts:83-100`). The post-Wrangler
source-map audit separately rejects Maltline experiment/telemetry/viewer/testing
sources and the root barrel while requiring the authority/proof core
(`scripts/audit-worker-bundle.mjs:9-27,80-103`).

Generation 2 remains immutable and self-checking: its normalized campaign and
configuration digest are frozen in the sole registry entry, and the asynchronous
authority boundary recomputes/caches the full configuration SHA-256
(`games/maltline/src/core/authority.ts:74-111,137-170`). Focused authority and
proof tests passed, including configuration mutation and retained-envelope
behavior. No P102 code is reachable from the viewer or Worker bundle, and the
experiment emits no proof or platform mutation.

## Exact reviewed identities

- Generation-2 configuration SHA-256:
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
- Baseline / relief campaign fingerprints:
  `fnv1a64:adc596f1154aeafa` / `fnv1a64:dda799c718f032f8`
- Experiment fingerprint:
  `fnv1a64:cd875f6472067ad5`
- Result SHA-256:
  `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`
- Canonical payload: 333,137 bytes,
  `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`
- Formatted CLI envelope: 533,781 bytes,
  `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703`
- Canonical envelope integrity:
  `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130`
- Producer / kernel / build SHA-256:
  `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7`,
  `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c`,
  `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24`
- Controller registry SHA-256:
  `cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`
- Toolchain: Node 22.19.0, TypeScript 7.0.2, tsx 4.23.12
- Actual work: 264 logical outcomes; 132 executed and 132 reused prefixes;
  1,006 stage/controller starts; 2,736,116 ticks, controller calls, and engine
  steps.

## Commands and evidence

Independently run for this review:

- `npm exec --workspace @arcadebench/maltline vitest -- run tests/p1-02-stage8-relief-experiment.test.ts tests/authority.test.ts tests/proof.test.ts tests/human-lab-boundary.test.ts --reporter=dot`
  — 4 files and 76 tests passed.
- `npm run test:worker-bundle` — 4 adversarial bundle tests passed.
- `npm run --silent relief:p1-02 --workspace=@arcadebench/maltline` — emitted
  one parseable 533,781-byte document with the formatted SHA and embedded
  integrity/source/kernel/build hashes listed above.
- `npm run build --workspace=@arcadebench/maltline` — TypeScript and Vite build
  passed; the production build transformed 44 modules and contained no P102
  experiment entry.
- `git diff --check` — passed before this report was added.

EXP-078 additionally records the settled broad release gates: 812 repository
unit tests, 145 Maltline Playwright checks, 19 root-site Playwright checks, all
workspace/site builds, the exact 24-file site inventory, Maltline site smoke,
Wrangler dry-run/local checks, privacy and scoped secret scans, and protected
Partition sitemap identity. Those are retained release records, not repeated
deployment evidence from this review. No production deployment, external edge
parity, reference-device result, paid audio acquisition, or human-participant
evidence is claimed.

## Closure recommendation

Keep EXP-078 and P0-50 closed. Do not promote its candidate from this evidence
alone. Track the bare-workspace-alias parser repair and generation-3 authority/
season work as P1 future gates; keep the unknown-object preflight, supervised
callback runtime, and committed prefix-equivalence oracle as P2 hardening.
None requires changing generation 2 or reopening the current unranked artifact.
