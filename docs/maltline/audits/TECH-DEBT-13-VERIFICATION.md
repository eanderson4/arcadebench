# TD-13 verification and release review

Date: 2026-09-11

## Scope and verdict

This review covers the settled P0-52 P102 provenance repair and P0-53 numeric
lives presentation repair: current and archival envelope behavior, source/build
closure, test ownership, generation-2 authority and proof isolation, production
graphs, and release-gate durability. It does not reinterpret the Stage 8 result
as ranked, signed, human, or promotion evidence.

There is **no P0 correctness, verification, or release blocker**. The prior
workspace-alias hole is closed more broadly than its exit condition: the walker
now rejects unreviewed bare/package/paths aliases, CommonJS and runtime loader
seams, dynamic imports, import-type expressions, triple-slash and AMD
references, and string-literal module declarations. The current schema-1
artifact verifies against the current tree, while the exact EXP-078 artifact
remains available only as explicitly archival self-attested evidence. P0-52 can
close without changing generation 2.

Two P1 items should be scheduled before treating a later artifact as portable
CI-produced evidence: pin the exact Node toolchain end to end, and ensure the
bytes hashed for each source file are the same bytes parsed by the TypeScript
snapshot. Neither invalidates the repeatedly reproduced current artifact on the
settled, non-mutating Node 22.19.0 review host.

| Severity | Count | Meaning |
| --- | ---: | --- |
| P0 | 0 | No current artifact, ranked, proof, Worker, or release correctness blocker. |
| P1 | 2 | Required before the next provenance artifact is cited as portable CI evidence. |
| P2 | 4 | Bounded ownership, performance, and future-boundary hardening. |

## P1 findings

### TDV13-P1-01 — Exact envelope bytes conflict with the floating CI Node selector

The producer records the actual `process.versions.node` and includes it in the
build recipe
(`games/maltline/tools/p1-02-stage8-relief-envelope.ts:382-409`). The current
test then pins the complete formatted envelope SHA-256 while accepting the
process's Node string in the structural expectation
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:359-362,565-583`).
That is internally correct on Node 22.19.0. However, CI requests the floating
major `node-version: 22` (`.github/workflows/ci-cd.yml:26-30`). A later 22.x
release changes the producer/build/integrity/formatted hashes and will fail the
golden even when source and payload are unchanged.

The same code reads TypeScript and tsx versions from `package-lock.json`, not
from the modules actually executing (`p1-02-stage8-relief-envelope.ts:377-385`).
`npm ci` makes those agree in current CI, and this audit directly observed
TypeScript 7.0.2 and tsx 4.23.12 installed. A locally drifted `node_modules`
tree could nevertheless emit an envelope that reports lockfile versions rather
than actual runtime versions.

This is a release-gate portability defect, not an integrity defect in the
current artifact. Exit criteria:

1. Pin Node 22.19.0 in CI and a repository-owned toolchain declaration, or
   deliberately define a different stable toolchain identity and issue new
   hashes.
2. Fail before simulation/emission if actual TypeScript or tsx package versions
   do not equal the locked versions.
3. Add a subprocess test for Node/tool-package mismatch and a positive test
   that the pinned CI environment reproduces the exact current formatted hash.
4. Do not silently update the golden when the floating runtime advances.

Recommended task: a new P0 release-provenance task, separate from P0-54's
simulation/test-throughput work.

### TDV13-P1-02 — Disk bytes and the TypeScript AST are captured independently

`producerIdentity` creates one TypeScript snapshot
(`p1-02-stage8-relief-envelope.ts:360-370`). During traversal,
`sourceIdentity` separately reads and hashes each file from disk at
`:325-335`, then obtains the AST from the earlier snapshot at `:336-341`. A
concurrent edit between snapshot creation and disk read can therefore make the
manifest digest describe one byte sequence while dependency discovery examines
another. The tsconfig and root config bytes used by the build recipe are also
read after the snapshot (`:377-399`).

Normal local execution is stable, and two current CLI runs from different
working directories/timezones were byte-identical. The artifact is explicitly
self-attested, so this race does not invalidate those observed bytes. It is
still inconsistent with an unqualified exact-current-source claim under a
concurrent editor/build process.

Exit criteria before a later artifact revision:

- Hash the normalized `SourceFile.text` used for traversal, and compare it with
  a bounded disk read before accepting the identity; fail if they differ.
- Capture the effective project configuration and its hashed config bytes from
  one stable snapshot, or double-read and reject concurrent changes.
- Add an injected barrier test that mutates an imported file and tsconfig
  between snapshot/read phases and proves identity emission fails closed.
- Preserve realpath containment, LF normalization, file/count/byte ceilings,
  and the exact current external allowlist.

## P2 findings and retained boundaries

### TDV13-P2-01 — The external allowlist is exact but not entry-scoped

The six allowed external specifiers are now explicit
(`p1-02-stage8-relief-envelope.ts:49-57`), and every other non-local specifier
fails at `:209-228`. This closes workspace root/subpath, other workspace,
package `#imports`, TypeScript `paths`, and unresolved-bare omissions. The same
policy is used for both the producer and kernel closures (`:368-370`), however,
so a future simulation-kernel file could begin importing `node:fs/promises` or
the TypeScript API merely because the producer-side envelope walker needs it.
That would change the source hash, but it would not fail the intended
data-only-kernel boundary.

Before changing the kernel, track external specifiers by source and require the
current kernel external set to remain empty. Allow filesystem, path, URL,
crypto, and TypeScript tooling only in the exact producer-side files that need
them. Add one-over fixtures proving each producer-only external is rejected
from the kernel. This is future hardening; the current 19-file kernel contains
no external import and retains only the reviewed relative
`viewer-input-adapter.ts` dependency.

### TDV13-P2-02 — Archival/current verification differs by a low-level boolean

`verifyCurrentSource` defaults to true, but false skips producer recomputation
after all structural and internal-integrity checks
(`p1-02-stage8-relief-envelope.ts:590-639`). The exact trust statement says the
artifact is self-attested and not signed/ranked/human (`:605-608`), and the
helper is package-private, so current use is honest. The compatibility test
correctly proves EXP-078 accepts only with false and rejects against current
source with true
(`games/maltline/tests/p1-02-stage8-relief-experiment.test.ts:385-399`).

If this verifier gains another caller, expose separately named archival and
current-source operations or return an explicit verification mode. Never let a
boolean supplied by untrusted input downgrade verification, and never pass an
archival result into promotion or ranked authority code.

### TDV13-P2-03 — Provenance adversaries share an expensive simulation test owner

The P102 test file constructs the complete fixed experiment/envelope in a
top-level `beforeAll`; even source-walker-only selections pay that setup cost.
It then creates many temporary repositories and executes the CLI twice
(`p1-02-stage8-relief-experiment.test.ts:468-583`). The resulting coverage is
strong, but source-graph security and multi-million-tick experiment evidence
have different ownership and failure modes.

Move the fixture walker/legacy compatibility cases into a focused tool test
that does not run the simulation. Keep one integration case binding the
reviewed payload to the producer. Clean temporary repositories after each test.
P0-54 should retain the committed non-prefix-reused oracle and improve default
suite throughput without raising tick/callback limits or blanket timeouts.
This audit observed the known P1-08 test exceed 30 seconds once under parallel
load; it passed alone in 25.1 seconds, and the complete Maltline suite passed
678/678 sequentially under unchanged timeouts.

### TDV13-P2-04 — Conditional service-boundary hardening remains conditional

`verifyP102Stage8ReliefEnvelope(unknown)` still canonicalizes before enforcing
its 2 MiB serialized ceiling (`p1-02-stage8-relief-envelope.ts:590-600`), and a
trusted synchronous controller cannot be preempted by the experiment's tick
ledger. Neither path is exported from the Maltline package or reachable by the
viewer/Worker; the supported CLI has fixed payload/controllers. Descriptor and
UTF-8 preflight plus supervised subprocess CPU/memory limits remain required
only if the tool accepts untrusted/extensible callers or becomes a service.

## Compatibility and exact identities

Wire schema remains 1 because payload/envelope semantics did not change. The
current and historical identities are intentionally different:

| Identity | Current P0-52 | EXP-078 archival |
| --- | --- | --- |
| Producer source | `9dfa303bd5974f4c2ea9761c2c9cb03c52c39e5b910169997f3d45ff94e71d67` (21 files) | `17133667d99a0b396980f738ca3ce6674bdf7c1aa4478bf817fe4de788bf7bd7` (21 files) |
| Kernel | `e58b43eae8b5ed3b8cce3e779098574ac4d22e215c9572ba601ba124e067495c` (19 files) | same |
| Build recipe | `16a87515d640ebaabd6b173e91e14946dbbdb1c23d2cd032f54a98161091d31f` | `effcb87d93add2c4be2889340e815d8c3e631d0ee7bf1b8a7cd3c632386f9f24` |
| Canonical envelope integrity | `ed3e6b18bb7905f35d2a6b68d17d7894ac28ddee9416f54fe614561843e70b97` | `9c99024e3d7c44bd4dce36efa8c8bc9219e071605bb4eca17d481481a1865130` |
| Formatted envelope | `947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64` (533,781 bytes) | `442918b6d13c70ea952b27b12bcb4379ce1478f8ebdc4e9ecefb155ad89ef703` (533,781 bytes) |

The canonical payload remains 333,137 bytes at
`4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a`;
the experiment fingerprint remains `fnv1a64:cd875f6472067ad5`, result SHA-256
remains `12a7e2f21de2b17f5f81b392fef55c03bedb50d1242a9198a0c71ca0fae6d034`,
and controller-registry SHA-256 remains
`cfe3265f5d6ea77ac85b0ad43d6bb60943a8d8d9737b0df58425b0651638a793`.

## Authority, proof, and production boundaries

- Ruleset 2, campaign generation 2, proof schema 1, and authority SHA-256
  `e8851d0eaea204e2c70c30e5505ba47de12f203e7b4147c973ca2e26336b0469`
  remain unchanged. The authority is deeply normalized/frozen and its async
  facade recomputes and caches the configuration digest
  (`games/maltline/src/core/authority.ts:99-111,137-170`).
- P102 has no Maltline package export. Its only package entry is the offline
  `relief:p1-02` script (`games/maltline/package.json:7-24`). The production
  verifier leaf exports only authority/proof symbols
  (`games/maltline/src/verifier.ts:1-16`).
- The normal Vite graph rejects all experiment/testing/fixture modules
  (`games/maltline/tests/human-lab-boundary.test.ts:83-100`). The Worker
  source-map audit independently rejects Maltline experiment, telemetry,
  viewer, testing, and root-barrel sources while requiring authority/proof
  core (`scripts/audit-worker-bundle.mjs:14-27,80-103`).
- P0-53 changed presentation and human-lab revision only. Numeric lives and
  semantic lives remain state-derived; it did not alter scoring, rules,
  campaign, proof, authority, Worker, or audio behavior.

## Focused validation

Independently run on the settled tree:

- `npm exec --workspace @arcadebench/maltline vitest -- run tests/p1-02-stage8-relief-experiment.test.ts tests/authority.test.ts tests/proof.test.ts tests/human-lab-boundary.test.ts --reporter=dot`
  — 4 files, 81 tests passed.
- `npm exec --workspace @arcadebench/maltline vitest -- run --maxWorkers=1 --no-file-parallelism --reporter=dot`
  — all 46 files and 678 Maltline tests passed under existing limits.
- `npm run build --workspace=@arcadebench/maltline` — TypeScript/Vite passed;
  the production build transformed 44 modules.
- Current CLI from repository root and package root with a different `TZ` —
  both emitted the same one-document SHA-256
  `947e312f44c7b96415a0a91e336afdef232f18a806d431c2f58a718f4c8c3f64`.
- `npm run test:worker-bundle` — 4/4 passed.
- Scoped secretlint and `git diff --check` passed before this report was added.

The settled EXP-080 root record additionally reports 814 repository unit
tests, 146 Maltline Playwright checks, 19 site Playwright checks, all relevant
builds/smokes, Wrangler dry-run/local evidence, and the exact release inventory.
Those are retained release evidence, not repeated live-deployment checks here.

## Task and cadence recommendation

Close P0-52 and keep P0-53 closed. Keep P0-54 queued for the independent
non-prefix oracle and throughput cleanup. Add one high-priority bounded task for
exact CI/runtime toolchain pinning and snapshot/hashed-byte atomicity before a
new P102 artifact revision; entry-scoped external policy can travel with it or
remain P2 cleanup. Do not change EXP-078 historical identities or promote its
Stage 8 candidate.

TD-13 is now complete after the two substantial post-TD-12 changes. Schedule
TD-14 after the next two substantial implementations, or earlier if P102 moves
into a service/public export, generation 3 begins, or ranked proof/Worker
boundaries change. Live apex/www/header/cache parity, portable raster evidence,
reference-device play, and human participant evidence remain external and are
not established by this audit.
