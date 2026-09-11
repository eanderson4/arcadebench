# Maltline Audio Batch 01: Pre-approval Audition Proposal

Status: **proposal only — not approved for generation**

Date prepared: 2026-09-10; pricing revalidated: 2026-09-11

This document proposes a deliberately small first audition batch. No sound has
been generated, requested, licensed, selected, or approved. The repository
owner must make every rights and spending confirmation listed below before a
valid plan or execution approval is created.

## Decision this batch should answer

Does a dry, close-miked, lightly vintage soda-counter vocabulary give Maltline
clear cause-and-effect without becoming cute, musical, harsh, or fatiguing?

The batch tests four contrasting parts of that vocabulary:

1. `nav_station` tests the lightest, most frequently repeated UI texture.
2. `blend_loop` tests the machinery identity and the hardest technical case: a
   seamless, non-fatiguing loop beneath gameplay.
3. `served` tests the primary positive action and the cue most likely to define
   the game's moment-to-moment satisfaction.
4. `jar_smashed` tests whether failure can be immediately legible without a
   violent, brittle, or unpleasant glass sound.

Together they cover UI, sustained machinery, routine success, and physical
failure before spending on the rest of the matrix. Two candidates per cue are
enough to compare prompt direction in this diagnostic batch. They are **not**
enough to satisfy the three-candidate production-selection policy for P0
one-shots in [`AUDIO.md`](./AUDIO.md); a later approved batch must expand any
direction selected here.

## Proposed requests

All eight requests pin `eleven_text_to_sound_v2` and `mp3_44100_192`. Requested
MP3 is an acquisition candidate, not a lossless release master. The targets are
audition-normalization targets, not measured loudness claims.

| Candidate ID | Semantic event | Kind | Prompt | Duration | Influence | Target |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `ml_sfx_nav_station_a_v001` | `nav_station` | one-shot | `Single short vintage soda-fountain selector detent, light brushed metal and Bakelite contact, dry close recording, precise soft attack, no bell, no melody, no speech, no ambience` | 0.5 s | 0.62 | -22 LUFS |
| `ml_sfx_nav_station_b_v001` | `nav_station` | one-shot | `Tiny mechanical flavor-selector notch, padded metal lever touching a firm stop, warm 1950s diner hardware character, very short and restrained, dry close recording, no beep, no music, no voice` | 0.5 s | 0.48 | -22 LUFS |
| `ml_loop_blend_a_v001` | `blend_loop` | loop | `Compact countertop milkshake blender under a creamy load, steady low electric motor with gentle mechanical texture, seamless loop, close dry recording, controlled low end, no rattling dishes, no room ambience, no music` | 1.2 s | 0.66 | -26 LUFS |
| `ml_loop_blend_b_v001` | `blend_loop` | loop | `Small vintage soda-shop mixer running smoothly in one paper cup, soft motor hum and subtle spindle texture, stable pitch, seamless unobtrusive loop, isolated dry recording, no alarm, no speech, no music` | 1.2 s | 0.52 | -26 LUFS |
| `ml_sfx_serve_hit_a_v001` | `served` | one-shot | `Full milkshake caught cleanly in a paper cup at a soda counter, soft creamy landing, compact cup impact and one tiny tidy clink, satisfying restrained arcade success, dry close recording, no voice, no melody` | 0.6 s | 0.64 | -18 LUFS |
| `ml_sfx_serve_hit_b_v001` | `served` | one-shot | `Paper shake cup arriving into a customer's hand, rounded soft thump, brief liquid weight and subtle countertop tick, crisp positive confirmation without a jingle, dry close recording, no glass break, no speech, no music` | 0.6 s | 0.50 | -18 LUFS |
| `ml_sfx_fail_jar_a_v001` | `jar_smashed` | one-shot | `One empty heavy soda glass breaking on tile, compact controlled crack with a very short restrained scatter, unmistakable failure but not violent or piercing, dry close recording, no voice, no music` | 0.7 s | 0.65 | -18 LUFS |
| `ml_sfx_fail_jar_b_v001` | `jar_smashed` | one-shot | `Thick empty diner tumbler dropped onto a hard floor, low glass impact followed by a small tight break and minimal debris tail, readable but gentle arcade failure, isolated dry recording, no scream, no music` | 0.7 s | 0.50 | -18 LUFS |

## Spend envelope

The documented provider estimate for an explicitly timed sound-effect request
is 40 credits per requested second. The production tool conservatively rounds
each candidate up independently with:

```text
estimated candidate credits = ceil(duration seconds × 40)
```

| Cue | Candidates | Requested seconds | Conservative credits |
| --- | ---: | ---: | ---: |
| `nav_station` | 2 | 1.0 | 40 |
| `blend_loop` | 2 | 2.4 | 96 |
| `served` | 2 | 1.2 | 48 |
| `jar_smashed` | 2 | 1.4 | 56 |
| **Batch maximum** | **8** | **6.0** | **240** |

This is an estimate, not a provider invoice or authorization. Pricing and
account entitlements must be reconfirmed immediately before approval. The
proposed execution approval must set all three ceilings explicitly:
`maximumAssets: 8`, `maximumSeconds: 6`, and `maximumCredits: 240`. Raising any
ceiling requires a new decision; the tool should not receive contingency spend
inside this first batch.

## Blind audition procedure

Do not review provider filenames or prompts. A reviewer who did not generate
the files should create a temporary randomized map such as `A1` through `A8`,
loudness-match within each cue family, and retain the private mapping only until
scores are locked.

Review in this order:

1. Headphones at comfortable level.
2. Laptop speaker at 25% and 50% system volume.
3. Target cabinet/speaker, if available, at normal play distance.
4. A deliberately crowded mock sequence: repeated navigation, blender under a
   serve, then jar failure.
5. For each blend candidate, ten gapless repeats plus start/stop with a 15 ms
   gain ramp.

Score every candidate from 1 (fails badly) to 5 (excellent) on:

- **semantic recognition:** the intended action is identifiable without seeing
  the label;
- **Maltline fit:** tactile soda-counter character without imitating a specific
  third-party game or protected sound;
- **mix space:** remains intelligible beside the other three cue families;
- **fatigue:** tolerable at realistic repetition rates;
- **transient quality:** clear on laptop speakers without piercing peaks; and
- **technical cleanliness:** no unintended speech, music, ambience, clipping,
  pre-roll, broken tail, DC-like thump, or loop seam.

Reviewers should record scores and one short note before discussing preferences.
The first listening round must not expose which prompt, influence, or candidate
letter produced a sound.

## Acceptance and rejection thresholds

This batch validates a **direction**, not release-ready files.

A cue family passes direction review only when at least one of its two
candidates:

- scores at least 4/5 for semantic recognition and Maltline fit from every
  reviewer;
- scores at least 3/5 for mix space, fatigue, transient quality, and technical
  cleanliness from every reviewer;
- has no reviewer flagging speech, music, recognizable third-party imitation,
  clipping, or an unsafe/unpleasant transient; and
- remains distinguishable from the other three cue families in the crowded
  mock sequence.

Additional loop threshold: a `blend_loop` candidate must complete ten repeats
with no audible click, gap, pitch lurch, or rhythmic pump. This listening result
is preliminary; sample-boundary and encoded-loop measurements remain mandatory
before release.

Reject an individual candidate immediately for any of the following:

- speech, a musical phrase, crowd reaction, or unrelated room ambience;
- recognizable imitation of a named game, character, brand sound, or artist;
- clipping, brittle high-frequency glass, startling loudness, or a long debris
  tail that masks `life_lost`;
- an ambiguous success/failure valence;
- a navigation cue that becomes irritating in 30 rapid repetitions; or
- a blend loop with a detectable seam in any of ten repeats.

The overall sound direction passes only if all four cue families pass. If three
pass, revise only the failed family and run a separately approved micro-batch.
If two or fewer pass, stop and revise the acoustic brief before buying more
candidates. No candidate can move into product assets until final mastering,
measured loudness/true peak, provenance, rights clearance, and the broader P0
matrix acceptance gates in `AUDIO.md` are complete.

## Confirmations still required from the repository owner

The following are decisions only the account/repository owner can make. None is
asserted by this proposal.

1. **Subscription and commercial-rights basis:** confirm that the exact account
   used for every request has an active paid subscription at generation time,
   that its tier permits `mp3_44100_192`, and that the resulting use in Maltline
   is covered commercially. Record the evidence outside the public repository.
2. **Current terms review:** personally review the current Sound Effects Terms,
   ElevenAPI Terms, Prohibited Use Policy, and current pricing. Supply the true
   UTC review date; do not copy the proposal date unless that is when the review
   actually occurred.
3. **Sublicensing setting:** confirm the account's current Sound Effects output
   sublicensing/opt-out setting and explicitly decide whether it is acceptable
   before generation. Record the setting and decision with the private approval
   evidence.
4. **Input rights:** confirm the prompts are original/authorized and contain no
   prohibited imitation request.
5. **Exact spend:** approve at most 8 requests, 6.0 requested seconds, and 120
   estimated credits for this batch after checking current pricing. Do not
   approve a larger cushion implicitly.
6. **Short-lived execution:** after filling and dry-running the plan, approve
   its exact printed SHA-256 in an envelope expiring no more than 24 hours later.
   The approval is invalid if any prompt, duration, influence, format, rights
   field, or candidate list changes.
7. **Human operation:** confirm that an authorized person—not CI or an unattended
   agent—will set the approval and credential environment and invoke execution.

## Deliberately non-validating execution-plan template

Save a copy outside the repository only after the owner makes the decisions
above. This template is syntactically valid JSON but intentionally fails the
tool's validation because `commercialRightsBasis` and `termsReviewedOn` are
explicit placeholders. Do not replace them until the owner can truthfully make
the attestations.

```json
{
  "schemaVersion": 1,
  "provider": "elevenlabs",
  "modelId": "eleven_text_to_sound_v2",
  "commercialRightsBasis": "REQUIRED_OWNER_CONFIRMATION_OF_ACTIVE_PAID_SUBSCRIPTION",
  "termsReviewedOn": "REQUIRED_OWNER_YYYY-MM-DD",
  "assets": [
    {
      "id": "ml_sfx_nav_station_a_v001",
      "event": "nav_station",
      "kind": "one-shot",
      "prompt": "Single short vintage soda-fountain selector detent, light brushed metal and Bakelite contact, dry close recording, precise soft attack, no bell, no melody, no speech, no ambience",
      "durationSeconds": 0.5,
      "loop": false,
      "promptInfluence": 0.62,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -22
    },
    {
      "id": "ml_sfx_nav_station_b_v001",
      "event": "nav_station",
      "kind": "one-shot",
      "prompt": "Tiny mechanical flavor-selector notch, padded metal lever touching a firm stop, warm 1950s diner hardware character, very short and restrained, dry close recording, no beep, no music, no voice",
      "durationSeconds": 0.5,
      "loop": false,
      "promptInfluence": 0.48,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -22
    },
    {
      "id": "ml_loop_blend_a_v001",
      "event": "blend_loop",
      "kind": "loop",
      "prompt": "Compact countertop milkshake blender under a creamy load, steady low electric motor with gentle mechanical texture, seamless loop, close dry recording, controlled low end, no rattling dishes, no room ambience, no music",
      "durationSeconds": 1.2,
      "loop": true,
      "promptInfluence": 0.66,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -26
    },
    {
      "id": "ml_loop_blend_b_v001",
      "event": "blend_loop",
      "kind": "loop",
      "prompt": "Small vintage soda-shop mixer running smoothly in one paper cup, soft motor hum and subtle spindle texture, stable pitch, seamless unobtrusive loop, isolated dry recording, no alarm, no speech, no music",
      "durationSeconds": 1.2,
      "loop": true,
      "promptInfluence": 0.52,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -26
    },
    {
      "id": "ml_sfx_serve_hit_a_v001",
      "event": "served",
      "kind": "one-shot",
      "prompt": "Full milkshake caught cleanly in a paper cup at a soda counter, soft creamy landing, compact cup impact and one tiny tidy clink, satisfying restrained arcade success, dry close recording, no voice, no melody",
      "durationSeconds": 0.6,
      "loop": false,
      "promptInfluence": 0.64,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -18
    },
    {
      "id": "ml_sfx_serve_hit_b_v001",
      "event": "served",
      "kind": "one-shot",
      "prompt": "Paper shake cup arriving into a customer's hand, rounded soft thump, brief liquid weight and subtle countertop tick, crisp positive confirmation without a jingle, dry close recording, no glass break, no speech, no music",
      "durationSeconds": 0.6,
      "loop": false,
      "promptInfluence": 0.5,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -18
    },
    {
      "id": "ml_sfx_fail_jar_a_v001",
      "event": "jar_smashed",
      "kind": "one-shot",
      "prompt": "One empty heavy soda glass breaking on tile, compact controlled crack with a very short restrained scatter, unmistakable failure but not violent or piercing, dry close recording, no voice, no music",
      "durationSeconds": 0.7,
      "loop": false,
      "promptInfluence": 0.65,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -18
    },
    {
      "id": "ml_sfx_fail_jar_b_v001",
      "event": "jar_smashed",
      "kind": "one-shot",
      "prompt": "Thick empty diner tumbler dropped onto a hard floor, low glass impact followed by a small tight break and minimal debris tail, readable but gentle arcade failure, isolated dry recording, no scream, no music",
      "durationSeconds": 0.7,
      "loop": false,
      "promptInfluence": 0.5,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -18
    }
  ]
}
```

A dry run of the template must fail with the unsupported commercial-rights
basis before it prints an executable plan hash. That failure is intentional.

## Deliberately non-validating approval template

Only after the owner fills the plan truthfully, validates it by dry run, checks
current pricing, and decides to spend should they construct this separate
environment value. Every placeholder below is intentionally invalid or
insufficient, and this document does not grant approval.

```json
{
  "planSha256": "REQUIRED_EXACT_64_CHARACTER_SHA256_FROM_FILLED_DRY_RUN",
  "maximumAssets": 0,
  "maximumSeconds": 0,
  "maximumCredits": 0,
  "expiresAt": "REQUIRED_SHORT_LIVED_UTC_TIMESTAMP"
}
```

The approved values proposed for owner consideration are 8 assets, 6 seconds,
and 240 credits. The tool will still require the independent `--execute` flag
and `ELEVENLABS_API_KEY`; neither is supplied or authorized here.
