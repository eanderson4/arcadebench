# Contributing to ArcadeBench

ArcadeBench welcomes fixes, controllers, levels, replay tooling, and eventually
whole new games. Keep contributions inspectable: a reviewer should be able to
understand what changed, reproduce the behavior, and tell whether it affects a
frozen benchmark protocol.

## Local setup

Use Node.js 22 or newer.

```sh
npm install
npm run check
```

`npm install` enables the repository's local Git hooks. Staged files are checked
for credentials and private details before commit; the full repository and Git
history are checked before push. See
[the disclosure-prevention guide](docs/DISCLOSURE-PREVENTION.md) before adding
screenshots, replay artifacts, or fixtures.

## What belongs where

- A game owns its engine, authored content, art, controls, scoring, protocol,
  and replay implementation.
- `@arcadebench/sdk` exposes optional platform services such as leaderboards,
  replay sharing, and votes. Games should remain playable without those
  services.
- `@arcadebench/bench-core` owns cross-game records and protocol contracts.
- Frozen protocol behavior changes require a new generation; do not silently
  reinterpret existing replay artifacts.

## Pull requests

Keep changes focused and include tests for engine or protocol behavior. Run
`npm run check` before opening a pull request. In the description, call out:

- visible gameplay or control changes;
- score, replay, or protocol compatibility effects;
- new storage, network, or environment-variable requirements;
- screenshots for meaningful interface changes, with private metadata removed.

Please use a GitHub noreply address or another identity you intentionally want
to publish in repository history. Never put credentials, private reports, or
unredacted user replay data in an issue or pull request.
