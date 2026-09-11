# Maltline Gameplay Flow

This document defines the first-time arcade flow in the viewer. It changes presentation only: campaign scenarios, engine ticks, scoring, lives, replay inputs, and proof outcomes stay untouched.

## Stage learning arc

| Stage | Learned skill | Added pressure | What the card says |
| --- | --- | --- | --- |
| 1 — First Pour | Complete the full match → blend → slide → face-return loop | One flavor, two windows, forgiving arrivals | Blend to READY, slide, then face the return window; jars catch automatically. |
| 2 — Two-Tap | Read flavor requests and select a station | Chocolate joins vanilla | Choose the requested station before blending. |
| 3 — Three Windows | Select the correct customer lane | A third window and strawberry arrive together | Choose where to slide; face a return window to auto-catch its jar. |
| 4 — Lunch Rush | Triage by proximity and prepare the next action | Arrivals accelerate and customers march faster | Serve customers nearest the counter first. |
| 5 — Jar Shortage | Treat clean jars as a circulating resource | Four jars and a longer wash | Catch returns and watch the wash queue. |
| 6 — Thick Shakes | Hold a blend accurately under pressure | Longer blend dwell | Release only when the machine says READY. |
| 7 — Happy Hour | Sustain the complete loop | Faster, accelerating arrivals and 27 orders | Plan the next flavor while jars return. |
| 8 — Closing Time | Combine every learned skill | Fastest march, shortest arrival floor, 31 orders | Protect your remaining lives through the final order. |

The cards explain the qualitative change without exposing tuning values. Their compact facts line still names window count, order count, and available V/C/S flavors.

## Screen contract

1. **Title / attract.** The frozen Stage 1 counter establishes the shop. The card states the objective and four-life failure model. `Enter` or `Space` opens the one-screen lesson; `R` skips the lesson and starts a fresh run at the Stage 1 card.
2. **First-run instructions.** Four short rows teach station selection, window selection, hold-to-READY blending, and the distinct final actions: `F`/`Enter` slides only a held shake, while facing a returning jar's window catches it automatically. The body names all three life-loss causes. No simulation ticks or replay inputs are produced. `Enter` or `Space` creates a fresh run and opens its first stage card.
3. **Stage card.** Every stage names one learned skill or new pressure plus its windows, orders, and flavors. It is untimed so a player can read it. No simulation ticks or replay inputs are produced. `Enter` or `Space` starts the countdown.
4. **Countdown.** The viewer presents `3`, `2`, `1`, and `SERVE` on presentation-only timers (650 ms per number, then 350 ms). Gameplay input is ignored, held keys and the fixed-step anchor are cleared, and the engine remains at the same tick. `Enter` or `Space` may skip the remainder without becoming a serve action.
5. **Live play.** The overlay becomes hidden/inert and focus returns to the game root. Only this screen samples controls, steps the engine, and appends replay input. A hidden page, blurred window, timing hitch, or unsupported width keeps the existing explicit interruption rules.
6. **Stage clear.** The card reports served and walked-out totals honestly, score, and bonus. It remains in place until the player presses `Enter` or `Space`; the final stage then advances to victory instead. `R` restarts immediately. No ticks or inputs are recorded while the card is present.
7. **Game over.** The card names the reached stage, final score, exhausted lives, and all life-loss categories. `Enter`, `Space`, or `R` creates a clean run and goes directly to the Stage 1 card.
8. **Victory.** The card confirms survival of all eight stages and final score. `Enter`, `Space`, or `R` creates a clean run and goes directly to the Stage 1 card.

## Restart and interruption rules

`R` is an immediate new-run command from any supported, viewer-owned surface. It cancels presentation timers, clears held keys, resets renderer effects and eligibility, empties staged replays, reconstructs Stage 1 at tick zero, and opens the Stage 1 card. It deliberately does not replay the first-run lesson.

If the page hides, the window blurs, or playable width is lost during a countdown, the countdown is canceled and returns to the current stage card. Gameplay cannot begin behind another window or the unsupported-device surface. Returning players explicitly ready up again, with no catch-up ticks.

## Live input policy

Station and window directions pass through a deterministic simulation-tick adapter. A fresh tap is held virtually until the next tick eligible under that stage's authored repeat cadence, so taps cannot disappear because they began between cadence ticks. A held direction moves at that first eligible tick, waits three repeat intervals (250 ms in the current 60 Hz campaign), then repeats once per authored interval. Opposite directions are neutral; releasing one side makes the remaining side a fresh direction. Browser key-repeat events do not restart the delay.

The adapter resets on every card, countdown, stage transition, restart, blur, hidden-document interruption, and unsupported-width transition. Blend remains an unbuffered held level. A fresh F/Enter press made while blending or holding is latched even if released between frames, emits one `serve: true` tick once the shake is held, then forces a false tick before another action can fire. Idle presses are discarded and aliases/native repeats cannot duplicate the action. The emitted values remain ordinary per-tick `MaltlineInput`, so recorded input replays the exact engine path without a proof or rules change.

## Accessibility and test contract

Each visible card is the single focus target and remains a labelled dialog. Kicker, heading, body, instruction list, and action hint are real text. Hidden overlays are `aria-hidden` and inert; during play, the semantic status and throttled event region are exposed instead. Reduced-motion mode removes overlay pulse and transition animation while leaving countdown timing and content intact.

Deterministic visual fixtures cover title, instructions, stage card, countdown, game over, and victory through the same shell and presentation helpers as production. Browser assertions verify that controls cannot alter ticks or recorded inputs during the lesson/card/countdown, and that restart returns a live run to a clean Stage 1 card.
