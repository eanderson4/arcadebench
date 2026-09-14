# P1-08 Tuning Verification Plan

**Date:** 2026-09-10
**Scope:** deterministic replay, authority/version identity, static fixtures,
ranked storage, and telemetry provenance for a new stages 4–7 tuning experiment
**Change made by this review:** this document only

## Decision

P1-08 can iterate without changing or invalidating ranked campaign generation 2
if every candidate remains an explicitly unranked, experiment-only scenario
snapshot. Derive candidates from the frozen generation-2 authority, fingerprint
every effective scenario/campaign and the complete experiment configuration,
and pass them explicitly to telemetry. Do not change the authored generation-2
source, runtime campaign alias, authority registry, proof recorder, Worker,
season, or generation-2 fixtures during exploration.

Promoting any candidate scenario value, stage order/membership, seed, or initial
run into the shipped/ranked game is a new campaign generation. For the likely
P1-08 case—only existing scenario knobs change—use **campaign generation 3**
while retaining ruleset 2, proof schema 1, and envelope v3. If “authored decision
beats” requires a new scenario field or engine scheduling behavior, promotion
also requires a new scenario-schema and ruleset version. Wire versions change
only if their wire shape or interpretation changes.

Do not promote until verification and retained playback can resolve both
generation 2 and generation 3. The current verifier types and parsers still
compare proofs/contexts to the singleton `MALTLINE_CAMPAIGN_GENERATION` constant,
so merely changing that constant would make retained generation-2 proofs
unverifiable (`games/maltline/src/core/proof.ts:67-89,462-519,676-694`).

## Current identity chain

Generation 2 is one complete, immutable configuration:

- ruleset 2 and campaign generation 2 are separately defined; the comments
  require a ruleset bump for changed simulation/scoring behavior and a campaign
  bump for any ordered stage membership or scenario-value change
  (`games/maltline/src/core/version.ts:5-15`);
- the authority owns rules, RNG identity, scenario schema, proof schema, the
  normalized ordered campaign, initial run, and ranking policy
  (`games/maltline/src/core/authority.ts:19-67`);
- its pinned SHA-256 is
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
  (`games/maltline/src/core/authority.ts:99-107`);
- the registry contains only that authority, and authority resolution includes
  game, ruleset, campaign generation, and configuration digest
  (`games/maltline/src/core/authority.ts:109-127`);
- successful facade use recomputes the complete configuration digest and caches
  the result by frozen authority object (`games/maltline/src/core/authority.ts:137-170`);
- `MALTLINE_CAMPAIGN` is the authority's same deeply frozen campaign, so viewer
  and default telemetry do not have a second mutable campaign definition
  (`games/maltline/src/core/campaign.ts:1-7`;
  `games/maltline/src/telemetry/campaign-telemetry.ts:291-305`); and
- the current authored values include every stage seed and all stage 4–8 tuning
  knobs (`games/maltline/src/core/campaign-source.ts:8-133`). Changing that file
  changes the configuration represented by the frozen authority on the next
  process start. Deep freeze prevents runtime mutation; it does not authorize an
  in-place source edit under the same generation.

The generation-2 proof protocol is input-only. The proof supplies version,
ruleset, campaign generation, ordered stage IDs, and RLE inputs; campaign,
initial lives/score, and all outcomes come from the resolved authority
(`games/maltline/src/core/proof.ts:57-89,497-652,743-778`). Scenario tuning can
therefore change terminal ticks, score, lives, and RLE even when stage IDs stay
the same. A digest update without a generation change is not an acceptable
shortcut: it would strand old generation-2 envelopes unless their exact old
authority remains registered, and it would mix two difficulty definitions
under one generation/season label.

### Existing golden and storage commitments

The static win, loss, and mistake proofs are literal controller-independent RLE
vectors labeled proof v1/ruleset 2/campaign 2
(`games/maltline/src/testing/generation-2-proofs.ts:3-64`). Authority tests pin:

- proof SHA-256 values;
- verifier-derived summaries and per-stage tick counts; and
- exact envelope-v3 hashes for fixed challenges
  (`games/maltline/tests/authority.test.ts:193-289`).

Workers-runtime tests also pin serialized proof/envelope sizes, hashes,
canonicalization, and exact/one-over resource shapes
(`apps/platform/tests/maltline-verifier-budget.test.ts:26-165`). These are
retained generation-2 evidence. They must remain unchanged when an experimental
candidate is added and after generation 3 is eventually introduced.

The D1 model names the active season `maltline-generation-2` and stores authority
schema, ruleset, campaign generation, configuration SHA, proof/envelope versions,
and nonce on both challenges and scores. R2 keys include ruleset, campaign,
configuration digest, run, and envelope version
(`apps/platform/migrations/0003_maltline_generation_2.sql:5-43,87-166`;
`apps/platform/src/maltline-leaderboard.ts:6-20,149-163`). One active season per
game is enforced by the original schema
(`apps/platform/migrations/0001_public_platform.sql:9-23`). The Worker and
browser client are currently generation-2-specific, including season and game
version checks (`apps/platform/src/maltline-worker.ts:102-139,142-196`;
`games/maltline/src/viewer/competition-client.ts:15-64`).

### Telemetry identity strengths and trap

Campaign telemetry normalizes scenarios and fingerprints every scenario field,
the ordered campaign, rules/game, controller behavior, initial run, and tick
limit (`games/maltline/src/telemetry/campaign-telemetry.ts:25-32,98-119,
134-177,291-360`). The generation-2 player-model matrix defaults to the frozen
authority, applies shadow seeds only to copies, and records each effective
configuration fingerprint (`games/maltline/src/telemetry/player-model-comparison.ts:
109-117,152-217`). Its current checked-in identities are campaign fingerprint
`fnv1a64:adc596f1154aeafa`, canonical reactive configuration fingerprint
`fnv1a64:28ac8864373bc650`, and 33-seed comparison fingerprint
`fnv1a64:dd75527c636fb0ab` (`games/maltline/tests/campaign-telemetry.test.ts:76-87`;
`games/maltline/tests/player-models.test.ts:66-73`). FNV fingerprints are
reproducibility labels, not security identities; the authority SHA-256 remains
the ranked trust identity.

Do **not** reuse `runMaltlineTuningExperiment({ scenarios: generation2 })` as the
P1-08 artifact without refactoring its identity. That runner intentionally
preserves EXP-021: its experiment ID is fixed to `EXP-021`, its default campaign
is the retained generation-1 snapshot, and its output type/identity labels any
supplied baseline as generation 1
(`games/maltline/src/telemetry/tuning-experiment.ts:28-41,175-234,421-544`;
`games/maltline/src/telemetry/exp-021-baseline.ts:3-31`). Supplying generation 2
through the options seam would change the fingerprint but leave a false
generation label.

## Exact safe experiment boundary

Create a new experiment definition/runner under telemetry/tools/tests, separate
from the immutable EXP-021 wrapper. Its input should be a snapshot of:

1. `MALTLINE_GENERATION_2_AUTHORITY.identity`, including the exact SHA-256;
2. the authority campaign and authority initial run;
3. a new experiment ID and schema version (for example `P1-08` plus an immutable
   revision), hypothesis, candidate order, and explicit transforms;
4. the exact canonical and shadow seed-offset set;
5. raw and physical-intent controller IDs plus behavior fingerprints—the latter
   binds the shipped input-adapter policy
   (`games/maltline/src/telemetry/physical-intent-controller.ts:25-31,49-67`);
6. tick/resource limits and all summary/acceptance calculations; and
7. for every candidate/seed pair, the complete effective scenario fingerprints,
   ordered campaign fingerprint, initial-run fingerprint, and final
   configuration fingerprint.

Normalize and freeze the baseline before running. Candidate construction must
copy the campaign and nested `stations` arrays; never mutate the authority.
Reject duplicate candidate IDs/seed offsets, non-finite transforms, invalid
scenarios, unexpected stage count/order, and candidates outside ranked resource
ceilings before simulation. Keep offset `0` as the canonical case. Shadow-seed
campaigns are robustness probes only: they must be labeled unranked and must
never be passed to the proof recorder, submission facade, or Worker challenge.

The experiment may change existing scenario fields on copies, including stage
4–7 customer counts, spawn intervals/floors/acceleration, speeds, jar pool, work
timings, repeat timings, or seeds. It may separately test an initial lives
change through an explicit copied run context. Every such change must produce a
different effective campaign or run/configuration fingerprint. It must not:

- edit `campaign-source.ts`, `version.ts`, `authority.ts`, or `campaign.ts`;
- change the default telemetry campaign;
- register candidate authorities or claim a generation/season;
- encode an experimental run as a generation-2 ranked proof;
- rewrite generation-2 static fixtures or expected hashes; or
- use ranked API challenges during human audition.

For browser human tests, use an unmistakably non-ranked lab entry point that
injects the exact frozen candidate and disables challenge acquisition, proof
recording, leaderboard submission, and score claims. If a run artifact is
needed, retain a local experiment artifact containing the exact scenario/run
snapshot, input stream, experiment fingerprint, and engine/rules identity.
The rich local replay embeds scenario and run data and is intentionally separate
from the ranked input-only proof (`games/maltline/src/core/replay.ts:6-26`), but
it must not be presented as server-verified evidence.

### Change classification

| Proposed change | During isolated experiment | If shipped/ranked |
| --- | --- | --- |
| Candidate metadata, sample set, controller parameters, analysis only | New experiment fingerprint/revision only | No gameplay generation change |
| Shadow stage seed on a copied scenario | New effective campaign/config fingerprint; unranked | Campaign generation 3 and new authority/season |
| Existing scenario value, name, ID, stage order, or membership | New effective campaign/config fingerprint; unranked | Campaign generation 3 and new authority/season |
| Initial lives/score context | New run/config fingerprint; unranked | Campaign generation 3 and new authority/season |
| Presentation copy outside authoritative scenario data | No proof generation change | No proof generation change if it cannot affect inputs/simulation |
| New `waveBreaks`-style scenario field or engine spawn behavior | Versioned experimental engine/schema identity; never call it ruleset 2 | Ruleset 3, scenario schema 2, campaign generation 3, new authority/season |
| Scoring, tick order, RNG algorithm/version, input meaning | Separate experimental rules identity | New ruleset (and RNG/schema version where applicable), campaign generation, authority, and season |
| Proof RLE fields or their interpretation | Separate experimental artifact | Proof schema bump |
| Envelope fields or canonical envelope interpretation | None needed for scenario-only work | Envelope bump only if this wire contract changes |
| Rich local state/event replay meaning | Separate experiment artifact version if changed | Rich replay bump only if its state/event contract changes |

Names are currently inside authoritative scenario data and the authority digest.
If P1-08 only changes explanatory stage-card copy, keep that copy outside the
scenario rather than renaming an authoritative stage in place.

## Promotion boundary: generation 3

After evidence selects one candidate, freeze its exact normalized bytes and stop
editing generation 2. Before switching the default viewer or ranked route:

1. Refactor authority/proof types and parsing to support more than the singleton
   numeric campaign constant. Resolve the challenge's exact registered authority
   first, then require the proof's ruleset and campaign generation to equal that
   authority. Keep the current generation-2 authority and its exact digest in
   the registry permanently for retained-envelope verification/playback.
2. Add a generic authority constructor or a generation-3 constructor that owns
   the selected normalized campaign and initial run. Pin and independently
   recompute its new SHA-256. Do not replace the generation-2 entry or reuse its
   generation number.
3. Add static generation-3 win, terminal-loss, and mistake/life-carry fixtures
   as compact literal RLE independent of controller implementation. Preserve all
   generation-2 fixture bytes and goldens.
4. Switch the default runtime campaign, telemetry default, proof recorder, API
   client expectations, Worker current storage context, and challenges together.
   A package/platform game-version bump is recommended as the deployment
   compatibility gate; it is not a substitute for authority identity.
5. Add a forward-only migration that archives `maltline-generation-2` and inserts
   `maltline-generation-3` as active in the same migration, respecting the one-
   active-season index. Never update old challenge/score identities. Keep R2
   keys and retained rows under their existing generation-2 digest paths.
6. Define cutover behavior explicitly: once generation 2 is archived, its
   unconsumed challenges must fail rather than enter the generation-3 board;
   ready generation-2 proofs remain inspectable and verifiable by score ID for
   their retention window.

A new season is required even if ranking policy and proof schema are unchanged:
tuned campaign difficulty changes the meaning and attainable distribution of
score/progress/ticks, so mixing generations would make the board incomparable.
If the campaign remains eight stages, current D1 stage-count constraints remain
usable; changing stage count or resource maxima requires a new migration/table
constraint review (`apps/platform/migrations/0003_maltline_generation_2.sql:
110-142`).

## Required gates

### Experiment admission

- Prove the baseline authority identity and SHA-256 equal the current generation
  2 pin before each experiment run.
- Prove baseline/candidate source objects are unchanged after construction and
  output is byte-identical across two clean runs.
- Mutation-test every candidate field, seed, initial run, controller/adapter
  metadata, tick limit, and candidate ordering; each must change the experiment
  fingerprint.
- Assert offset zero exactly equals the registered generation-2 baseline for the
  control candidate; every changed candidate or nonzero shadow must differ.
- Run raw and physical-intent profiles, report canonical separately from shadow
  distributions, and retain human evidence as the decision authority rather
  than treating synthetic completion as proof of difficulty.
- Enforce normalized scenario/ranked ceilings and show every run terminates
  inside the proof total-tick ceiling if the candidate could later be promoted.
- Assert the experiment bundle cannot import/call competition submission and
  cannot emit a `MaltlineRunProof` labeled campaign 2 for a changed campaign.

### Generation-2 non-regression during exploration

- Authority pin/digest/deep-freeze and mutation tests remain exact.
- Static generation-2 proof bytes, proof hashes, summaries, stage ticks, envelope
  hashes, canonical sizes, and Workers-runtime budget tests remain exact.
- Default campaign telemetry and player-model baseline fingerprints remain exact.
- D1 migration/storage-context, ranking-order, Worker challenge, submission,
  retained-proof, and browser contract tests remain exact.
- Full Maltline tests/build and focused platform workerd tests pass. Any changed
  generation-2 golden is a stop signal, not an expected tuning update.

### Promotion/update gates

- Both generation-2 and generation-3 authorities recompute to their pinned
  digests repeatedly in Node/browser/Workers-compatible WebCrypto.
- A generation-2 retained win/loss/mistake envelope still verifies and scrubs
  after generation 3 becomes the default; an authority/digest cross-pair fails.
- New static generation-3 fixtures verify to independently reviewed summaries,
  stage ticks, canonical hashes, and resource sizes. Dynamic controller proofs
  remain solvability evidence, not golden fixture construction.
- Scenario-only promotion leaves ruleset 2/proof v1/envelope v3 unchanged and
  has tests proving wire compatibility. A new mechanic has explicit ruleset and
  scenario-schema divergence tests.
- Viewer/default telemetry/recorder/client/Worker all identify generation 3;
  no mixed client/server generation can acquire or submit a challenge.
- Migration tests prove exactly one active Maltline season, generation-2 rows
  unchanged, new rows carry the generation-3 digest, rankings never cross
  seasons, old challenges cannot be consumed after archive, and retained old
  proof lookup still works.
- Re-run canonical plus shadow telemetry, physical-intent telemetry, score
  headroom, proof tick/input-run/byte budgets, Worker verification, complete
  D1/R2 integration/concurrency, full unit/build, and browser replay tests.
- Record the selected normalized campaign, authority SHA-256, telemetry and
  experiment fingerprints, fixture hashes, measured outcomes, human sample and
  rejection criteria in the experiment log before declaring generation 3.

## Stop conditions

Stop the tuning change if any of the following is proposed:

- editing generation-2 authored values and merely refreshing its SHA pin;
- deleting/replacing generation-2 registry or static fixture data;
- presenting shadow-seed results as ranked runs or changing the challenge nonce
  into a gameplay seed;
- reusing the generation-2 season for a changed campaign;
- updating expected generation-2 hashes without a byte-level explanation; or
- bumping every protocol number reflexively. Versions identify different
  contracts: change only the campaign generation for existing-knob tuning, and
  add rules/schema/wire bumps only when those respective semantics change.

## Review evidence

Focused checks run against the reviewed tree:

- Maltline authority/proof/campaign-telemetry/tuning tests — **4 files, 77 tests
  passed**; and
- platform Maltline data-model/verifier-budget tests — **2 files, 10 tests
  passed**.

No product code or existing test was changed.
