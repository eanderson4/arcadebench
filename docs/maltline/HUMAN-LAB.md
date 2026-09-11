# Maltline EXP-049 Human Lab

This is the facilitator sheet for the local A-versus-D playtest. The lab is a
development-only page: it is type-checked and browser-tested, but deliberately
absent from the production bundle and assembled arcade.

## Start a session

From the repository root:

```sh
npm run dev --workspace=@arcadebench/maltline
```

Set the browser's inner viewport to the assigned width before opening its opaque
link. A mismatched width rejects before the game mounts. Give the participant
the link, but do not disclose its order until they have frozen their final
comparison.

| Experience stratum | Width | Facilitator order | Local path |
| --- | ---: | --- | --- |
| First-time | 1280 | A then D | `/src/viewer/human-lab.html?token=exp049-lab-k7m4q2` |
| First-time | 1280 | D then A | `/src/viewer/human-lab.html?token=exp049-lab-p9v2n6` |
| First-time | 700 | A then D | `/src/viewer/human-lab.html?token=exp049-lab-r3c8w5` |
| First-time | 700 | D then A | `/src/viewer/human-lab.html?token=exp049-lab-x6h1t9` |
| Informed | 1280 | A then D | `/src/viewer/human-lab.html?token=exp049-lab-c4n7d2` |
| Informed | 1280 | D then A | `/src/viewer/human-lab.html?token=exp049-lab-v8j3m6` |
| Informed | 700 | A then D | `/src/viewer/human-lab.html?token=exp049-lab-h2w9q5` |
| Informed | 700 | D then A | `/src/viewer/human-lab.html?token=exp049-lab-t6r1k8` |

Use an even number of each order within every experience/width cell. Keep the
assigned viewport constant for the entire session; any mismatch pauses the lab
and requires exact restoration plus an explicit resume. Issue each participant
an opaque local code in the exact form `p-` followed by 6–12 lowercase letters
or digits. Do not encode their name, email, or other identity in that code.

## Session protocol

1. Let the participant review the versioned disclosure, verify the read-only
   experience/width assignment, enter the facilitator's opaque participant
   code, and affirm voluntarily. **Stop without saving** ends before gameplay
   and creates no artifact. Confirm keyboard use and the approximate 15–20
   minute duration without coaching or disclosing the candidate order.
2. Let the participant complete the common Stage 1–3 practice without coaching
   beyond the visible instructions. Every stage begins with the unskippable
   `3 · 2 · 1 · SERVE` countdown; an interruption restarts from its stage card.
3. Observe Round 1 and Round 2. Each starts at Stage 4 with four lives and score
   zero and allows one attempt. After every comparison stage, let the participant
   complete the pressure/pacing pulse without coaching. A loss requires their
   own explanation before the engine-derived loss causes are reviewed. Do not
   reveal which setup is active.
4. Before revealing the mapping, have the participant complete both final
   survey steps: per-round jar/recovery ratings, the three paired comparisons,
   and their score-model explanation. Then choose **Freeze my answers**.
5. Download the JSON for the facilitator before choosing **Reveal setups**.
   Reloading intentionally discards unfinished in-memory work.

The current human-lab schema-3 / EXP-049 experiment-revision-11 artifact records
ordered stage pulses;
stage outcomes, ticks,
score deltas, lives, terminal counters, engine loss causes, and bounded input
transition summaries; relative active/paused time and typed interruption
intervals; none/partial/full candidate exposure; assignment order; a one-way
assignment-token digest; entry viewport/reduced-motion metadata; the verified
generation-2 source-authority identity and configuration SHA-256; canonical
seed-offset-zero candidate, campaign, and scenario fingerprints from the A/D
materializer; per-round jar/recovery ratings; the assigned first-time/informed
experience and exact 700/1280 width cell; opaque participant code; affirmative
consent statement v2 (`maltline-p108-local-consent-v2`) or an unmistakable
synthetic test-driver bypass; and the final paired choices and score-model
explanation. Use a local paper worksheet only for observations that are not
safe or useful to collect in the browser:

- Where did the player hesitate between lane, flavor, and returning jar?
- Did Stage 7 feel like a readable bridge to Closing Time?
- Did either round create fatigue, confusion, or an urge to stop?

Do not record names, email, microphone/video, analytics identifiers, or remote
data. Exposure is derived from the highest comparison stage entered: Stage 4
only is `none`, Stage 5 or 6 is `partial`, and Stage 7 is `full`. A participant
with `none` exposure remains useful for usability evidence but must not be used
as a paired Stage 5/7 preference result; keep partial exposure distinct from a
full Stage 7 comparison during analysis.

## Safety boundary

The banner must always read `LOCAL PLAYTEST · UNRANKED · NOTHING IS SUBMITTED`.
The lab has no Shift Board, challenge, proof, leaderboard, API, persistent
storage, cookie, or analytics path. Missing and unknown assignment tokens fail
before a game mounts. Production builds must continue returning 404 for both
`/maltline/human-lab.html` and `/maltline/src/viewer/human-lab.html`.

Never add `labTestDriver=1` to a participant link. That development-only flag
creates a visibly labelled `test-driver` artifact with a synthetic filename;
it is browser-test output and must never be counted as human evidence.

Run the isolation and browser gates before facilitated sessions:

```sh
npm exec --workspace=@arcadebench/maltline -- vitest run tests/human-lab-study.test.ts tests/human-lab-session.test.ts tests/human-lab-observation.test.ts tests/human-lab-timing.test.ts tests/p1-08-candidates.test.ts tests/human-lab-boundary.test.ts
npm run test:visual --workspace=@arcadebench/maltline
npm run build:site
npm run test:site:maltline
```

The full research design and deferred acceptance matrix are in
`docs/maltline/audits/P1-08-HUMAN-LAB-UX.md`.
