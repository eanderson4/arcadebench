# Maltline

**A two-button arcade game.** A Tapper-lineage counter game: customers line up
at the windows, each wanting a specific shake. Blend the right flavor at the
right station, slide it down the counter, and catch the empty jars before
they hit the floor.

- **Human arcade run:** an 8-stage campaign that escalates every Tapper-style
  lever — spawn rate, march speed, menu breadth, blend dwell, jar pool. Runs
  start with four lives; deterministic reference players clear the current
  campaign in about 6.0–6.2 active minutes, before menus and transitions.
- **Deterministic core:** fixed 60 Hz tick, seeded spawns, integer fixed-point
  positions; a recorded input list replays any stage byte-for-byte.
- **Verified competition:** deployed sessions request a one-use same-origin
  challenge, retain only an in-memory input proof, and submit no browser-authored
  trusted score. The shared platform replays the proof before the Shift Board
  accepts it. Top 50 proofs are saved privately; other proofs expire after
  five days. Optional social-media permission starts unchecked each run.
- **Model control (planned):** the whole state — order bubbles, station
  progress, jar pool, player position — serializes into compact ticks, so a
  controller can plan serving orders under the live clock.

## Play locally

From the repository root:

```sh
npm install
npm run dev --workspace=@arcadebench/maltline
```

Open <http://127.0.0.1:5184/src/viewer/>.

The opening page has a **Start Game** button and teaches the controls before the shift.
Local development is unranked by default. Production uses the shared
ArcadeBench SDK and the independent `cabinet-1` verified leaderboard.

| Input | Action |
| --- | --- |
| `←` `→` | run along the current counter to catch returning jars |
| `↑` `↓` | change lanes |
| Button 1 / `SPACE` | hold to fill; release a ready shake to toss it |
| Button 2 / `ENTER` | cycle flavors; replace a held shake and send its jar to the wash |
| `SPACE` / `ENTER` on menus | advance |
| `R` | restart |

Releasing Space before the shake is ready cancels the pour. Replacing a filled
shake costs no life or points, but its jar must finish washing before reuse.
`X` remains a compatibility shortcut for button 2.
The selected flavor stays beside the bartender; there is no duplicate mixer
selector at the bottom of the screen.

## Rules

- Customers march from the door toward your counter. Serve them their flavor
  before they reach you, or you lose a life (**walkout**).
- A shake nobody catches smashes at the end of the lane (**lose a life, lose
  the jar**).
- After drinking, the customer slides the empty jar back. Catching is automatic:
  be facing their lane when it arrives to send it to the wash; miss it and it smashes
  (**lose a life, lose the jar**).
- Customers caught past the halfway mark finish and leave; closer ones drink,
  return their jar, and get right back in line.
- Jars are a closed pool: blending takes one, washing returns one. Stages can
  starve you of jars before they starve you of time.
- Clear the line — every customer served and gone — to clear the stage.
  Survive all eight stages to close the shop.

## Design levers

Every mechanic is a scenario field (`src/core/types.ts`), and each campaign
stage (`src/core/campaign.ts`) is just a knob setting on them, in the spirit
of Partition's authored boards. The Tapper heritage: spawn interval and its
acceleration, march speed, crowding, and lane count. The Maltline additions:
menu breadth (which stations exist), blend dwell, wash time, jar pool size,
and the resume threshold that decides whether a served customer leaves or
re-queues.

## Unranked tuning evidence

`npm run --silent tuning:p1-08 --workspace=@arcadebench/maltline` emits one schema-1,
self-attested offline envelope around the deterministic EXP-049 A/B/C/D
comparison. The envelope binds the current source closure, build recipe,
controller registry, admitted work plan, payload SHA-256, and canonical envelope
SHA-256 without exposing source paths or machine/account metadata. It remains
intentionally unranked and is not a signature or independent attestation:
candidate campaigns have no authority registration, season, proof, or
submission path. Envelope v1 accepts only the reviewed default controller
registry and payload; customized profiles or matrices remain bare diagnostic
output rather than provenance-bound artifacts. The current payload experiment
fingerprint is
`fnv1a64:a56ab6aac3bd00ec`. Retain the complete envelope when citing results;
no candidate changes the generation-2 campaign used by the game. Envelope
verification checks the current source closure by default; reading a retained
historical document requires the explicit package-private archival opt-out and
does not upgrade its self-attested trust.

`npm run recovery:p1-04 --workspace=@arcadebench/maltline` emits the prospective
EXP-059 recovery/score-ledger comparison. It replays the same first-return miss
in Stages 4 and 8 across the canonical campaign plus 32 shadow seeds, and binds
the current carried-life bonus and two budget-preserving alternatives without
registering any of them for ranked play.

The paired A-versus-D browser lab is also development-only and deliberately
excluded from production. Facilitators should follow
[`docs/maltline/HUMAN-LAB.md`](../../docs/maltline/HUMAN-LAB.md) for opaque
assignment links, session protocol, and isolation gates.

Player-facing presentation work follows the reviewed
[`counter-after-dark-v1` visual direction](../../docs/maltline/VISUAL-DIRECTION.md),
with exact 1280px/700px pressure frames and reduced-motion constraints treated
as acceptance evidence rather than a detached mood board.

## Status

The current two-button viewer uses version-3 input replays wrapped in the
challenge-bound `cabinet-1` proof protocol. Its authority pins the campaign,
controls, scoring, and verification limits independently of the original
version-2/generation-2 proof protocol. Old verification remains available to
its tests and tools; its unreleased public routes stay closed.

The shared ArcadeBench leaderboard owns rank, publication, and Top 50 activity.
The Shift Board provides score submission and leaderboard reads; archived proof
files are private, with no public replay-inspection endpoint. See the
[SDK contract](../../docs/ARCADE-SDK.md) and
[release procedure](../../docs/PLATFORM-RELEASE-PLAN.md). This source describes
the implementation; the release record determines what is deployed.
