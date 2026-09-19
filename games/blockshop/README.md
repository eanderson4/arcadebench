# Blockshop

**A single-player brick breaker for ArcadeBench.** Slide a wooden catch tray,
keep the steel bearing in the shop, and clear eight hand-built racks. Labeled
blocks release visible tools: wide tray, slow motion, multiball, glue, heavy
bearing, and an extra ball.

```sh
npm run dev:blockshop
```

Open <http://127.0.0.1:5187/src/viewer/>.

## Controls

| Input | Action |
| --- | --- |
| Left/Right or A/D | Move the tray |
| Button 1, Space, or Enter | Launch or release a glued ball |
| P or Escape | Pause |

The simulation runs at 60 fixed ticks per second. Rendering never changes the
rules. A replay needs only the official stage, starting score and lives, and
one small input record per tick.

## Arcade run

The run contains eight stages and starts with three balls. Score and remaining
balls carry between stages. Each stage adds one readable material or power:

1. **First Cut** — painted one-hit blocks.
2. **Wide Load** — the wide-tray power and an early extra ball.
3. **Hard Grain** — two-hit hardwood and slow motion.
4. **Split Shift** — multiball and steel reflectors.
5. **Steel Rack** — unbreakable routing and extra balls.
6. **Glue Bench** — catch and intentionally release a return.
7. **Heavy Duty** — a temporary bearing that passes through breakable blocks.
8. **Closing Bell** — every shop material and tool in one rack.

Power effects are authored and deterministic. Their block and falling tag show
the same symbol, so the player knows what is coming before breaking it.
