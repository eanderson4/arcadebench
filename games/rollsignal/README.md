# Roll Signal

Roll Signal is ArcadeBench's deterministic momentum course: steer a marble across suspended signal decks, collect tone rings for bonus points, and reach the bell before the clock expires. The simulation is a fixed 60 Hz, fixed-point 2D model. The viewer alone applies the isometric projection.

## Controls

- Steer with two discrete axes: `steerX` and `steerY`, each `-1`, `0`, or `1`.
- Hold `brace` to trade top speed for stronger braking and traction.
- Falling returns the marble to the latest checkpoint and adds a deterministic time penalty.

## Development

From the repository root:

```sh
npm run dev --workspace=@arcadebench/rollsignal
npm test --workspace=@arcadebench/rollsignal
npm run build --workspace=@arcadebench/rollsignal
```

The development server uses port 5188. Production assets are built under the `/rollsignal/` base path.

## Engine API

```ts
import {
  RollSignalEngine,
  ROLLSIGNAL_COURSES,
  FIXED_SCALE,
} from '@arcadebench/rollsignal';

const engine = new RollSignalEngine(ROLLSIGNAL_COURSES[0]);
const { state, events } = engine.step({ steerX: 1, steerY: 0, brace: false });
const displayX = state.position.x / FIXED_SCALE;
```

Course geometry is authored in readable world units. Dynamic simulation state uses integer thousandths. Snapshots are deep copies and can be retained safely. Replay parsing checks the replay version, size and tick bounds, input schema, contiguous ticks, reproduced events, and final state.

See [docs/SPEC.md](docs/SPEC.md) for the game and data contracts.
