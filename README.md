# ArcadeBench

**A growing, free public collection of browser arcade games.** Quick to start,
simple controls, and scores worth chasing — no ads, no microtransactions, no
loot boxes.

[![Verify and deploy](https://github.com/eanderson4/arcadebench/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/eanderson4/arcadebench/actions/workflows/ci-cd.yml)
[![CodeQL](https://github.com/eanderson4/arcadebench/actions/workflows/application-security.yml/badge.svg)](https://github.com/eanderson4/arcadebench/actions/workflows/application-security.yml)
[![MIT licensed](https://img.shields.io/badge/license-MIT-6ee9f5.svg)](LICENSE)

<a href="https://mathvsvibes.com"><img src="games/partition/public/math-vs-vibes-badge.svg" width="206" alt="A Math vs Vibes project"></a>

**[Choose a game at arcadebench.org →](https://arcadebench.org/)**

[Play Partition](https://arcadebench.org/games/partition/) ·
[Play Maltline](https://arcadebench.org/games/maltline/) ·
[About](https://arcadebench.org/about/)

ArcadeBench is inspired by the early arcade era: games you can start in
seconds, understand from a line of instructions, and keep replaying because the
score is close. Each game here is a small, complete thing with its own rules and
its own pull. Learn by playing, chase the score, take one more try.

The games are free to play: no ads, no microtransactions, no loot boxes. Each one
owns its personality, rules, assets, simulation, scoring, and model interface.
The shared platform provides the boring-but-important pieces: benchmark records,
replay transport, leaderboards, and social discovery.

ArcadeBench is free, non-commercial, and does not sell player data or use
gameplay, replays, prompts, or controllers to train AI. Earlier submissions, nonqualifying proofs, and shared replays expire after
five days. New Top 50 submissions under the displayed policy are saved privately;
social-media use requires a separate optional permission. Verified leaderboard
summaries and replay hashes remain.
Read the [plain-language privacy promise](docs/PRIVACY.md) or the
[live version](https://arcadebench.org/privacy/).

## Partition

Partition is a real-time control game inspired by the territory-capture arcade
tradition. Trace boundaries, isolate moving anomalies, and stabilize the field
before the clock runs out.

- **Human arcade run:** ten stages, escalating hazards, and a restart from
  stage one when the run ends.
- **Field catalog:** explore 20 authored boards independently and help identify
  the best future benchmark stages.
- **Model control:** consume compact state ticks and install controllers without
  pausing the authoritative game clock.
- **Replay Lab:** scrub human or model runs tick by tick and inspect every
  control signal.

Partition is playable at
[arcadebench.org/games/partition/](https://arcadebench.org/games/partition/) and
locally today. `dev-0` is intentionally unfrozen, so its results are development
evidence rather than permanent leaderboard entries.

## Maltline

Maltline is a Tapper-lineage shake-counter game. Match each order, blend and
slide the right shake, then face its window to catch the returning jar.

- **Human arcade shift:** eight stages, four lives, and escalating order, jar,
  and window pressure.
- **Deterministic replay:** fixed-tick inputs reproduce each stage and retained
  Shift Board proofs can be inspected locally.
- **Current status:** generation 2 remains a gameplay prototype pending broader
  human and reference-device evidence. It requires a keyboard and a window at
  least 700 CSS pixels wide.

Play the prototype at
[arcadebench.org/games/maltline/](https://arcadebench.org/games/maltline/).

## Play

Open **[arcadebench.org](https://arcadebench.org/)** to choose a game. The
launcher does not start or resume gameplay; Partition and Maltline keep their
permanent direct routes at `/games/partition/` and `/games/maltline/`. What the
arcade is for is on the [About page](https://arcadebench.org/about/).

For local development, use Node.js 22 or newer:

```sh
npm install
npm run dev:partition
# In a second terminal, or instead of Partition:
npm run dev --workspace=@arcadebench/maltline
```

For Partition, open <http://127.0.0.1:5183/src/viewer/?seed=11> and choose
**Play**. Arrow keys move along walls; hold Space with a direction to cut
through the field. **Fit Screen** letterboxes the full 3:2 playfield, and
**Watch Run** opens the attempt in Replay Lab.

For Maltline, open <http://127.0.0.1:5184/src/viewer/> in a keyboard-equipped
window at least 700 CSS pixels wide. Its title and instructions teach the
match, blend, slide, and catch loop before Stage 1 begins.

Run the complete repository check with:

```sh
npm run check
```

## Run a model benchmark

Inspect the installation or start a tracked model run:

```sh
npm run bench -- list
npm run bench -- doctor
npm run bench -- run --game partition --generation dev-0 \
  --provider openai --model <model-id> --seed 11 --max-turns 40
```

The current controller interface is documented in the
[Partition SDK guide](docs/PARTITION-SDK.md). The engine continues advancing
while the model thinks; a resident controller remains responsible for the
Spark between model calls.

## Repository map

```text
packages/bench-core/   shared contracts, run records, protocol validation
packages/arcade-sdk/   game-facing leaderboards, replays, and social client
packages/harness/      provider-neutral model and tool orchestration
games/partition/       Partition simulation, controller SDK, and viewer
games/maltline/        Maltline deterministic engine, proof core, and viewer
apps/cli/              family-wide command line interface
apps/board/            cross-game run browser and leaderboard
deploy/                static launcher, policy pages, and Worker entry
```

The [architecture](docs/ARCHITECTURE.md), [run format](docs/RUN-FORMAT.md),
and [replay sharing contract](docs/REPLAY-SHARING.md) define the shared
platform. The [Partition leaderboard contract](docs/LEADERBOARD.md) covers
replay-backed score submission, ranking, storage, and callsign moderation.

Core design rules:

- The authoritative simulation is headless and deterministic where the
  protocol permits it.
- Human rendering never affects scoring.
- Every official result identifies an immutable game protocol generation.
- Local benchmark runs can retain model configuration, tool events, usage,
  scores, and replay/controller artifacts under the runner's control. The
  public service retains new qualifying Top 50 replays privately under the
  displayed policy; other replay payloads expire after five days.
- Continuous games never pause for model inference.

## Production and contributions

`npm run build:site` assembles the Cloudflare artifact at `dist/site`. See the
[deployment guide](docs/DEPLOYMENT.md) for CI/CD and domain configuration.

Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md). Local
installs enable staged disclosure checks before commits and a full repository
and history scan before pushes. Read the
[disclosure-prevention guide](docs/DISCLOSURE-PREVENTION.md) before publishing
new artifacts or replay fixtures.

ArcadeBench is MIT licensed and built as a
[Math vs Vibes](https://mathvsvibes.com) project.
