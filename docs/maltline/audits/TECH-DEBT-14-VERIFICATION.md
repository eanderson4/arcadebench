# TD-14 verification and release review

Date: 2026-09-11

## Scope and verdict

This review covers the settled P0-58 portable-artifact runtime/source capture
and P0-57 visual-baseline identity/HUD-geometry work. It examines the P102
current and archival trust modes, actual toolchain binding, snapshot/disk/config
consistency, source-graph and package boundaries, the schema-2 PNG contract,
pre-browser execution, CI, Worker/source-map auditing, and assembled-site
containment. It does not reinterpret a self-attested experiment as ranked or a
pixel baseline as human/device evidence.

There are **no P0 or P1 correctness, verification, or release findings**.
P0-57 and P0-58 can remain closed. The implementation satisfies the exact
TD-13 exits, preserves the registered generation-2 authority and proof path,
and does not add either offline tool to a production package graph.

| Severity | Count | Meaning |
| --- | ---: | --- |
| P0 | 0 | No current artifact, PNG identity, ranked, Worker, or release correctness blocker. |
| P1 | 0 | No repair is required before relying on the current reviewed local/CI evidence. |
| P2 | 5 | Bounded hostile-input, ownership, build-parity, and external-evidence debt. |

## Closed P0-58 findings

### Toolchain and build identity are now exact for the supported command

The repository declares exactly `22.19.0` in `.node-version`, and both the
verification and deployment jobs use `node-version-file` rather than a
floating Node major (`.github/workflows/ci-cd.yml:26-33,108-117`). The P102
producer imports the package metadata for the TypeScript and tsx packages
resolved in its own module graph, compares their exact semantic versions with
the root lock, and compares the running Node version with `.node-version`
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:5-7,419-453`). All five
repository build inputs are themselves hashed into the recipe, including the
Node declaration (`:480-499`). Version mismatch, malformed declaration, and
both CI declarations have focused coverage
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:469-497`).

This is an exact supported-CLI identity under `npm ci`; it is not a signature
over the contents of `node_modules`. That distinction is already honest in the
envelope's self-attested trust statement (`p1-02-stage8-relief-envelope.ts:664-677`).

### Hashed source is the traversed AST text and stable build inputs are checked

The source manifest hashes normalized `SourceFile.text` from the retained
TypeScript snapshot, compares that text to a bounded UTF-8 disk read, and only
then follows the inspected AST's reviewed imports
(`p1-02-stage8-relief-envelope.ts:351-385`). Build-input realpaths and
normalized bytes are captured before the snapshot and checked again after both
source closures have completed (`:388-411,419-475`). The injected barrier
changes a source and tsconfig after snapshot creation and proves both cases
fail before identity emission; the hook itself rejects extras, accessors, and
wrong types (`p1-02-stage8-relief-experiment.test.ts:499-533`).

As with any userspace filesystem check, an adversary able to perform an exact
change-and-restore between observations can create an ABA event. Such an event
does not alter the normalized bytes ultimately bound, and this self-attested
offline producer does not claim filesystem locking or independent build
attestation. A signed/reproducible-build service would need a content-addressed
checkout or immutable build input, not more timing-sensitive unit tests.

### Current and archival schema-1 artifacts remain unambiguous

Wire shape stays at schema 1 because the producer identity fields did not
change. Current verification recomputes and compares the full producer, while
archival verification is an explicit low-level option after structural,
payload, descriptor, authority, controller, and integrity reconciliation
(`p1-02-stage8-relief-envelope.ts:680-740`). The compatibility test proves the
exact EXP-078 document accepts only with `verifyCurrentSource: false` and is
rejected by default/current verification
(`p1-02-stage8-relief-experiment.test.ts:386-400`).

The reviewed identities are:

| Identity | Current P0-58 | EXP-078 archival |
| --- | --- | --- |
| Producer source | `9b1f552b7af077b73c147dbba6984a8684f7bb5e7455275bc745a6cdc43c17f1` (21 files) | `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7` (21 files) |
| Simulation kernel | `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c` (19 files) | same |
| Build recipe | `1b7ab8ba811590bf9ce028717bcf25ffcff5debb00ee1031c119517a922ac863` | `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24` |
| Canonical integrity | `a388db09f772bf67b0153046f1173e521b4f52ebc02738858a54cb3f0a791569` | `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130` |
| Formatted document | `524595399413e934aa9c3082bc92cb53efc79b7fbb58dc8998c320bfd9d36a2b` (533,781 bytes) | `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703` (533,781 bytes) |

The payload remains 333,137 bytes at
`4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`;
the result, experiment, controller, and work identities remain unchanged.

## Closed P0-57 findings

The schema-2 manifest is an exact ordinary-object contract at its top level,
browser object, and entries. It requires 1–256 lowercase basename-only PNG
records, validates every digest, requires unique lexical order, admits only
regular directory entries, reconciles the exact filename ledger and individual
bytes, and then hashes raw PNG bytes in manifest order
(`games/maltline/tests/visual/baseline-contract.ts:6-8,30-68,70-134,137-172`).
`playwright.config.ts:1-9` performs this verification at config evaluation,
before test discovery can start a browser.

Independent recomputation found exactly 49 manifest records and 49 regular PNG
files, zero name/digest mismatches, manifest SHA-256
`dbaa7cf0a846cd3b6ac9b98c0c695f2040287c2a43ec39b6d6dd99517a5f175c`
(7,107 bytes), and ordered raw-PNG SHA-256
`00ee116a20ba2a43caa0e2166cfde3ce88ace20860708dc86608ec38874cb34f`.

The fixed orders/lives rectangles are now nested frozen values in the one
renderer frame authority (`games/maltline/src/viewer/renderer-layout.ts:27-44`).
The renderer consumes them at `renderer.ts:1498-1537`, and fixture metadata
consumes the same authority at `visual-fixtures.ts:1075-1091`. The latter adds
the strawberry color only when `state.lives > 0`, exactly matching the
renderer cup condition. Deep-freeze/spacing, Canvas transcript, fixture
metadata, 1280/700 geometry, normal/reduced, early-run, Stage 7, and game-over
coverage lives in `renderer-layout.test.ts:16-35`,
`renderer-presentation.test.ts:362-408`, and
`tests/visual/maltline.visual.spec.ts:1710-1751`.

No PNG changed. This proves deterministic byte and geometry preservation, not
human recognition of the life role.

## P2 findings and task mapping

### TDV14-P2-01 — The manifest's collection value is not yet exact data

`normalizeMaltlineVisualBaselineManifest` checks only `Array.isArray` and
length before invoking the array's own `map` (`baseline-contract.ts:94-109`).
It does not require `Array.prototype`, dense enumerable data indices, or reject
extra string/symbol properties. A one-slot sparse array is accepted by the
normalizer as a frozen one-slot sparse `screenshots` value, contrary to its
declared entry-array type. A hostile custom `map` can also run before the
normalized entry count is re-established.

This does **not** bypass the current visual gate: the checked-in manifest comes
from JSON and is dense, and `verifyMaltlineVisualBaselineFiles` rejects the
sparse result against every real directory inventory. It is nevertheless a
real strict-normalizer defect. P0-59 is the correct bounded owner. Acceptance:

1. Require an ordinary dense array with exactly `length` plus enumerable data
   indices and no accessors, symbols, aliases, or extra keys.
2. Iterate by validated indices without invoking caller-owned collection
   methods and reassert the 256-entry ceiling on the produced array.
3. Add sparse, accessor, custom-prototype/custom-map, symbol, and extra-property
   adversaries while preserving the current manifest and all PNG bytes.

### TDV14-P2-02 — Directory/path/resource adversaries are enforced but not owned by tests

The lowercase filename expression excludes separators, dot segments, Unicode,
and absolute paths, and `Dirent` checks reject symlink/non-file PNG entries
before reads (`baseline-contract.ts:6-8,101-108,145-165`). Existing tests cover
uppercase, missing, extra, changed, duplicate, and unsorted cases
(`visual-baseline-contract.test.ts:54-103`), but do not pin traversal names,
symlinked PNGs, or a symlinked baseline directory. The helper also reads each
admitted file synchronously without a per-file or aggregate byte ceiling.

The production caller passes a literal repository URL and the 49 checked-in
files are bounded, so this is not a current path escape or CI denial-of-service
condition. P0-59 should add direct filename/symlink-directory/file adversaries,
realpath containment relative to an explicit trusted root or rejection of a
symlinked directory, and generous per-PNG/aggregate stat ceilings before
`readFileSync`.

### TDV14-P2-03 — Source-policy and adversarial fixtures still share the expensive experiment owner

The P102 file builds the full 2,736,116-step artifact in its suite-level setup,
then runs toolchain, source-graph, mutation, archival, and two CLI cases in the
same test owner (`p1-02-stage8-relief-experiment.test.ts:344-650`). The focused
seven-file audit took 19.40 seconds, while the pure manifest/layout checks took
well under a second in the preceding independent P0-57 run. Temporary fixture
repositories are also created repeatedly without per-test cleanup
(`:451-630`).

P0-54 remains the correct owner: extract one shared entry-scoped P108/P102
source policy and fast fixture suite, retain one payload/producer integration,
remove temporary repositories, and add the committed all-fresh prefix oracle.
Do not raise semantic tick/controller ceilings or blanket timeouts. Its policy
must also prevent the producer-only Node/TypeScript externals currently allowed
at `p1-02-stage8-relief-envelope.ts:53-62` from becoming simulation-kernel
dependencies merely because both closures share one allowlist.

### TDV14-P2-04 — Production graph auditing should reject game tool/test paths generically

Platform production correctly imports the narrow verifier leaves, Maltline's
P102 tool has no package export, and the current dry-run source map contains 31
reviewed sources with no viewer, telemetry, experiment, testing, or root-barrel
closure. The audit explicitly rejects those Maltline `src` families and the
equivalent Partition roots (`scripts/audit-worker-bundle.mjs:14-27,80-103`).

The path policy does not generically reject `games/*/tools/**` or
`games/*/tests/**`. P102 itself would currently also trip the retained
`node:fs`/`node:path` content guard, but that is incidental rather than an exact
tool-boundary rule. Before P4-05 freezes a release protocol, add both game tool
and test trees to the prohibited source-map fixtures and retain the required
authority/proof core assertions. This is defense in depth; no such source is in
the current bundle.

### TDV14-P2-05 — Local release parity stops before immutable/live deployment and human evidence

CI builds/tests all workspaces, assembles the exact site, dry-runs and audits
the Worker, exercises the contract emulator and Wrangler-local composite, then
runs both browser suites before uploading `dist/site`
(`.github/workflows/ci-cd.yml:32-72`). The deploy job checks out the same commit,
downloads only the verified static artifact, installs the same lock under the
pinned Node, then rebuilds the Worker during deploy (`:74-133`). It does not
promote the exact dry-run Worker bytes as an immutable artifact, and local
emulation cannot establish live apex/www/header/cache behavior.

This is not reason to reopen P0-57, P0-58, or P4-01. Keep portable root raster
ownership under P0-48, live edge parity under P4-06, and immutable release
protocol/signing under P4-05. Human cabinet-distance comprehension, Stage 8
preference, fatigue, and completion remain P1-02/P1-04/P1-10 evidence; exact
pixels and automated controllers cannot close them.

## Authority, proof, and production isolation

- Ruleset 2, campaign generation 2, proof schema 1, and authority SHA-256
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
  are unchanged. Focused authority/proof tests passed.
- The public Maltline root remains broad for local tooling, while the Worker
  consumes `src/verifier.ts`, whose exact exports are limited to registered
  authority and proof verification (`games/maltline/src/verifier.ts:1-16`).
- Production Vite graph tests reject experiments, testing, and visual-fixture
  modules; lab graph tests retain their exact experiment allowlist and exclude
  proof/competition/testing (`games/maltline/tests/human-lab-boundary.test.ts:83-145`).
- The schema-2 manifest and contract live under `tests/`; P102 lives under
  `tools/`. Neither is exported by `games/maltline/package.json:7-24` or shipped
  by the exact site contract.

## Independent validation

Run on the settled tree without regenerating baselines or launching a browser:

- `npm exec --workspace @arcadebench/maltline vitest -- run tests/p1-02-stage8-relief-experiment.test.ts tests/visual-baseline-contract.test.ts tests/renderer-layout.test.ts tests/renderer-presentation.test.ts tests/human-lab-boundary.test.ts tests/authority.test.ts tests/proof.test.ts --reporter=dot`
  — 7 files, 116 tests passed. The P102 test includes two byte-identical CLI
  executions from different working directories/timezones.
- `npm run build:site && npm run test:site`
  — both game builds passed; Maltline transformed 44 production modules; exact
  site assembly/smoke passed at 24 files and 445,096 bytes.
- `npm run check:wrangler`
  — Wrangler 4.124.0 dry-run passed; actual Worker was 201,177 bytes, 44,448
  gzip bytes, 31 source-map entries, and SHA-256
  `610374588410875b78b6b34237042e36e21ffb83a2461b55c9565988e0bc4981`;
  bundle adversaries passed 4/4.
- Direct manifest/PNG recomputation — 49 entries/files, zero mismatches,
  manifest and ordered-raw hashes exactly as recorded above.
- `git diff --check` passed before this report was added. The protected
  Partition sitemap remains byte-exact at
  `1b53407583f7f0517c873967ba088cbe68f35cf40938461bbc877f98f27f6976`.

The settled root record additionally reports 827 unit tests, 146 Maltline
Playwright checks, and 19 site Playwright checks. Those browser suites were not
repeated for this read-only audit as requested.

## Closure and cadence recommendation

Keep P0-57 and P0-58 done. Complete P0-59 as a small test-contract hardening
change without touching pixels, renderer behavior, or manifest bytes. Keep
P0-54 queued for the materially separate experiment-source/oracle/throughput
work. P0-60/TD-14 is complete with no need to revise generation 2, EXP-078, or
the prospective Stage 8 decision. Schedule TD-15 after the next two substantial
implementations, or earlier if an offline experiment becomes a public service,
generation 3 begins, the proof/Worker trust boundary changes, or deployment
starts claiming immutable/live attestation.
