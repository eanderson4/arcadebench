# Canonical run format

Every benchmark invocation creates one immutable run directory:

```text
runs/<run-id>/
  manifest.json
  events.jsonl
  transcript.jsonl
  attempts/
  artifacts/
```

`manifest.json` is the durable index. Large streams stay in append-only JSONL
files and game-specific artifacts. Paths in the manifest are relative to the
run directory so a run can be archived or published as one unit.

Required identity fields:

- Run id, timestamps, completion status, and end reason.
- Game id and immutable protocol generation.
- Model provider, model id, and relevant inference parameters.
- Harness and game source revisions, plus dirty-worktree state when known.
- Scenario ids, seeds, attempt policy, and execution mode.
- Aggregate token usage and game-defined score metrics.

Required event classes:

- Model turn and token usage.
- Tool request, result, validation failure, and latency.
- Attempt/session lifecycle transition.
- Controller installation, applied tick, source hash, and failure.
- Artifact creation and integrity hash.
- Harness warning, retry, timeout, and terminal failure.

Run summaries must never silently replace raw evidence. Aggregators read the
manifest and attempt records; transcripts, event logs, replays, and controller
sources remain available for audit.

