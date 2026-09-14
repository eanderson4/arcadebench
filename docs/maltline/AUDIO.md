# Maltline audio production foundation

Status: production design and acquisition scaffold only. No audio has been
generated, selected, licensed, committed, or connected to the game runtime.
This document was checked against provider documentation on 2026-09-11.

## Decision

Build Maltline's sound language from gameplay events outward. The first audio
pass should make cause and effect legible with a small set of dry, tactile soda
counter sounds: selector detents, an electric blender, paper-cup and glass
impacts, a serving slide, and short outcome stingers. Ambience and music come
after those cues work in a noisy room and at low volume.

Audio is presentation only. It observes engine results and viewer state; it
must never change input, tick cadence, RNG, collision, score, lives, proof
recording, replay verification, or terminal state. A muted run and an audible
run must produce byte-identical proofs and summaries.

## Current repository audit

Maltline currently has:

- no product `.wav`, `.mp3`, `.ogg`, `.opus`, `.m4a`, or `.flac` assets;
- no Web Audio, `HTMLAudioElement`, audio library, sound settings, or audio
  preload/decode path;
- no mute, master-volume, or reduced-sensory preference;
- no audio license/provenance manifest;
- no audio-specific test harness; and
- no package dependency needed for a first Web Audio implementation.

The engine already emits the authoritative presentation events needed for most
cues: `shake_launched`, `served`, `jar_caught`, `shake_smashed`, `jar_smashed`,
`walkout`, `life_lost`, `blend_completed`, `stage_cleared`, and `game_lost`.
The viewer already observes each tick's event list. Navigation and the active
blend loop are presentation transitions derived from the current input/player
state; campaign victory is a viewer transition after the final
`stage_cleared`. No new score-affecting event is needed for audio.

The development machine has `ffmpeg`/`ffprobe` 6.1.1 and `sha256sum`, but those
are host tools, not repository dependencies. Production tooling must record the
actual tool version and command for each selected asset.

## Provider contract verified from primary sources

The current ElevenLabs Sound Effects REST endpoint is
`POST https://api.elevenlabs.io/v1/sound-generation`. Authentication uses the
`xi-api-key` header and the body is JSON. The request fields are:

| Field | Contract used here |
| --- | --- |
| `text` | Required prompt. Product guidance currently states a 450-character maximum. Generate one isolated effect per request. |
| `model_id` | Pin `eleven_text_to_sound_v2`; it is the only model currently listed for this endpoint and is also the default. Never depend on the default silently. |
| `loop` | Boolean, default `false`; seamless-loop generation is available only with `eleven_text_to_sound_v2`. |
| `duration_seconds` | Optional. The endpoint schema currently accepts 0.5–30 seconds; `null`/omission lets the model choose. The overview page says 0.1–30, so the stricter endpoint schema is the production authority. |
| `prompt_influence` | Optional 0–1, default `0.3`; higher values follow the prompt more literally with less variation. Pin it for every request. |
| `output_format` | Query parameter formatted as codec/sample-rate/bitrate. The endpoint currently lists MP3, PCM, μ-law, A-law, and Opus variants. Higher-quality MP3/PCM choices can depend on the account tier. |

The success response is a file download/binary audio response. The endpoint
documents a `character-cost` response header; the general API documentation
also identifies `request-id` and `x-trace-id` as useful generation metadata.
The scaffold captures those headers without logging response bodies or request
credentials. It does not assume that a later provider-history download will
remain available.

The provider's current Sound Effects overview says an explicitly timed request
costs 40 credits per requested second. Its general pricing page separately
describes Sound Effects as approximately 200 credits per generation, so the
plan-bound estimate is a conservative preflight rather than an invoice. Pricing
is mutable: confirm the account-visible charge immediately before approving a
batch, keep explicit durations, and keep acquisition sequential so a mistaken
plan cannot fan out spend.

Primary references:

- [Create sound effect API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- [Sound Effects overview and prompting](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Sound Effects product guide](https://elevenlabs.io/docs/eleven-creative/playground/sound-effects)
- [Current model catalog](https://elevenlabs.io/docs/overview/models)
- [API introduction and response metadata](https://elevenlabs.io/docs/api-reference/introduction)
- [Sound Effects API cost guidance](https://help.elevenlabs.io/hc/en-us/articles/25735337678481-How-much-does-it-cost-to-generate-sound-effects)

### Reproducibility limitation

The endpoint exposes no seed. Pinning prompt, duration, influence, loop flag,
model ID, and output format makes the *request* reproducible, but does not make
the generated waveform deterministic. Therefore the source response bytes are
the artifact of record. Download them immediately, retain them with policy
approval, and bind both source and normalized files to SHA-256 hashes. A later
regeneration is a new candidate/version even when its request is identical.

Model IDs can also continue to point at provider-updated infrastructure. Every
request records the model ID and review date, while the selected byte hash—not
the provider name—is the immutable release identity.

## Rights and provenance gate

Do not generate release candidates until the account owner confirms the plan
and records that basis in the batch plan.

As of the review date:

- ElevenLabs says paid plans include commercial rights and that commercial
  rights to content generated during a paid subscription survive cancellation.
- Free-plan/out-of-subscription generation is described as noncommercial and
  attribution-required. It must not enter a commercial release candidate set.
- Beta Services are described as unavailable for commercial/production use.
- The Sound Effects Terms allow opting out of sublicensing new uses of outputs,
  but pre-existing sublicenses are not undone. Decide and record the account's
  setting before generation.
- The Prohibited Use Policy bars exploiting Sound Effects output as standalone
  sound/sample libraries. Maltline uses selected cues only as components of the
  game; do not publish source masters as a reusable library.
- Inputs must be ours to submit. Prompts should describe acoustic properties,
  not ask for a living artist, protected character, trademark sound, or a close
  imitation of a third-party game.

Authoritative terms can change and should be reviewed again on the actual
generation date. The scaffold therefore rejects a future review date and one
older than 30 days. Resume uses the same exact plan identity; finish recovery
while that review remains current or perform an explicit manual rights review
before handling an older interrupted acquisition:

- [Sound Effects Terms](https://elevenlabs.io/sound-effects-terms)
- [ElevenAPI Terms](https://elevenlabs.io/elevenapi-terms)
- [Prohibited Use Policy](https://elevenlabs.io/use-policy)
- [Commercial-use help article](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)

This is a production record, not legal advice. Release approval should retain
the applicable invoice/subscription evidence and a dated copy or digest of the
terms reviewed.

## Event-first sound matrix

P0 cues are the minimum useful audio pass. P1 adds texture after every P0 cue is
recognizable in isolation, under overlap, and at the quiet preset. P2 is music
and nonessential ambience.

| Priority | Asset/event | Trigger | Perceptual job | Candidate prompt direction | Source target | Voice policy |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | `nav_station` | Player station index changes | Dry horizontal selection; distinct from lane travel | Short vintage soda-fountain selector detent, light metal and Bakelite, no melody, one-shot | 0.12–0.20 s final; request 0.5 s then trim | 1; replace/retrigger, 40 ms coalesce |
| P0 | `nav_lane` | Player lane index changes | Heavier vertical/counter movement | Short padded mechanical rail clack, lower than selector detent, no UI beep | 0.15–0.25 s final; request 0.5 s then trim | 1; replace/retrigger, 40 ms coalesce |
| P0 | `blend_loop` | `player.blending` becomes non-null; stop on null/hidden/terminal | Continuous machine state without watching the meter | Compact 1950s countertop blender motor, creamy load, steady, close-mic, seamless loop, no music | 1.0–1.5 s seamless loop | 1 global; 15 ms fade in/out |
| P0 | `blend_ready` | `blend_completed` | Crisp readiness confirmation | Tiny motor spin-down with bright timer bell tick, satisfying but not shrill | 0.30–0.55 s | 1; always audible |
| P0 | `serve_launch` | `shake_launched` | Confirms committed serve input | Paper shake cup sliding fast over polished diner counter, soft launch thunk and short whoosh | 0.18–0.35 s | 3; oldest fades |
| P0 | `serve_hit` | `served` | Primary success and streak rhythm | Full shake caught in paper cup, soft creamy impact, tiny glassless clink, arcade-positive, no voice | 0.20–0.40 s | 4; variant/pitch ±2% by streak presentation only |
| P0 | `jar_catch` | `jar_caught` | Distinguishes resource recovery and points | Empty thick soda glass caught by hand at counter edge, tidy hollow clink, no smash | 0.18–0.35 s | 3 |
| P0 | `fail_shake` | `shake_smashed` | Identifies an outbound shake miss | Paper cup and thick shake splat on tile, restrained mess, no glass | 0.35–0.65 s | 2; high priority |
| P0 | `fail_jar` | `jar_smashed` | Identifies a return-catch miss | Empty heavy soda glass breaking on tile, compact and nonviolent, short tail | 0.40–0.80 s | 2; high priority |
| P0 | `fail_walkout` | `walkout` | Identifies customer reaching counter | Small service bell buzz plus disappointed shoe pivot, no speech, no comedy sting | 0.45–0.80 s | 2; high priority |
| P0 | `life_loss` | `life_lost` | Unifies all failure causes and communicates consequence | Very short low diner-register drop, two descending mechanical notes, no explosion | 0.35–0.60 s | 1; layers after physical failure by 40–70 ms |
| P0 | `stage_clear` | `stage_cleared` except final campaign stage | Releases pressure and marks progression | Compact soda-shop register chime, brushed chrome sparkle, three-note upward cadence | 0.8–1.4 s | 1; duck lower buses |
| P0 | `game_over` | `game_lost` | Clearly terminal, not merely another lost life | Short fluorescent diner shutdown, register clack and restrained descending tone, no voice | 1.2–2.0 s | 1; stop loops, duck all |
| P0 | `victory` | Viewer confirms final stage cleared | Unique campaign completion | Celebratory soda fountain register flourish, glass clinks and compact upbeat cadence, no crowd/voice | 2.0–3.5 s | 1; stop loops, duck all |
| P1 | `customer_enter` | `customer_spawned` | Adds readable pressure only if mix remains sparse | Soft door hinge and shoe step, very subdued | 0.20–0.45 s | 2; aggressively coalesce |
| P1 | `jar_return` | `jar_returned` | Announces catch opportunity | Empty glass rolling smoothly on counter, subtle | 0.3–0.6 s | 3 |
| P1 | `no_clean_jar` | Viewer detects a blocked blend attempt with zero jars | Explains resource block | Dry blender lever click with no motor, low-energy | 0.12–0.25 s | 1; 250 ms cooldown |
| P2 | `diner_ambience` | Active gameplay after user audio gesture | Places the room without masking cues | Quiet late-night soda counter room tone, ventilation, distant dish movement, no voices, seamless | 8–20 s loop | 1; omitted in reduced-sensory mode |
| P2 | music system | Menu/gameplay/outcome state | Energy and identity after SFX ship | Commission or use a separately licensed composition; do not treat the SFX endpoint as a full-score generator | Authored loop/stems | At most 1 music state plus crossfade |

Generate at least three candidates for every P0 one-shot and two for every
loop, but pay for them deliberately in small batches. Select by blind A/B at
matched loudness. Variants share one semantic silhouette; variety must not make
the event ambiguous.

## Mix, concurrency, and lifecycle policy

Use Web Audio buses so one stored master setting can scale the full graph:

```text
master
├── ui/navigation
├── machinery (blend loop)
├── gameplay (launch, hit, catch, physical failures)
├── outcomes (life, clear, game over, victory)
├── ambience
└── music
```

- Start at master `0.70`; expose mute and a 0–100 volume control. Store only
  audio preferences, never run progress. The mute control remains usable before
  audio is unlocked.
- Create/resume the audio context only from a user gesture. Queue nothing from
  before unlock: stale gameplay cues are worse than silence.
- Cap the graph at 12 simultaneous voices. Outcomes outrank failures, failures
  outrank hit/catch/launch, and gameplay outranks navigation/ambience.
- Apply per-cue voice limits from the matrix. When saturated, fade the oldest
  lower-priority voice over 10–20 ms; do not hard-cut a glass transient.
- Coalesce repeated navigation within 40 ms and customer entrances within one
  animation frame. Never coalesce `life_lost`, `stage_cleared`, `game_lost`, or
  victory.
- On `life_lost`, duck machinery/gameplay by 4 dB for 250 ms. On stage clear,
  duck them by 6 dB for 600 ms. On game over/victory, stop the blend loop and
  duck ambience/music by 10 dB under the stinger, recovering only when a new
  screen/run begins.
- Starting/stopping loops uses 15 ms gain ramps. Page hide, run reset, stage
  transition, terminal state, and audio-context suspension must release the
  blend voice. Visibility resumption starts only sounds justified by current
  state; it does not replay hidden events.
- Loading/decoding failure is nonfatal. Log one sanitized development warning,
  keep the game playable, and leave simulation untouched.

### Reduced sensory load

Offer an explicit “reduced sound effects” preference; do not infer hearing
preference from `prefers-reduced-motion`. In reduced mode:

- omit ambience, music, customer entrance, and jar-return texture;
- replace the blend loop with only `blend_ready`;
- use one low-intensity variant for navigation, success, and each failure;
- disable pitch variation and overlapping decorative tails; and
- retain life loss and terminal cues at a controlled level because they convey
  state, with the existing visual/text channel always remaining sufficient.

Mute silences everything. Reduced mode is not a substitute for mute.

## Mastering, format, and loop targets

Keep lossless masters and shipped assets distinct.

| Property | Target |
| --- | --- |
| Archive master | WAV, mono unless stereo is perceptually necessary, 48 kHz, 24-bit PCM, metadata stripped; never edit the generated source in place |
| Runtime candidate | Ogg Opus, mono, 48 kHz, 80 kb/s for SFX/loops; add an MP3 44.1 kHz fallback only if the supported-browser test matrix requires it |
| Master ceiling | No sample clipping; final mix no higher than −1 dBTP |
| Ambience | Approximately −26 LUFS integrated before user/master gain |
| Music | Approximately −20 LUFS integrated; preserve headroom for gameplay |
| One-shots | Match perceived category loudness by audition; typical peaks: navigation ≤−8 dBFS, routine gameplay ≤−4 dBFS, outcome stingers ≤−2 dBFS |
| Silence | Trim unintended pre-roll to ≤10 ms; preserve intentional attack and tail |
| Loop | Exact 48 kHz sample boundary, no DC step, click, pump, or encoder gap across ten repeats; record loop start/end samples if they are not the file bounds |
| Channels | Mono by default; positional placement belongs to Web Audio, not baked stereo. Reserve stereo for ambience/music with a mono-compatibility check |

LUFS is unreliable as the only measurement for very short transients. Use it to
establish a batch starting point, then loudness-match by category and audition
at full, 25%, quiet-preset, laptop-speaker, and cabinet distances. Check
true-peak and integrated/short-term loudness after encoding, not only on the WAV
master. An MP3 file is not the sole master for a seamless loop.

## Naming and versioning

Use lowercase ASCII and semantic event names:

- `ml_sfx_<event>_vNNN_<variant>.wav|ogg`
- `ml_loop_<event>_vNNN_<variant>.wav|ogg`
- example: `ml_sfx_serve_hit_v001_a.ogg`
- example: `ml_loop_blend_v001_a.ogg`

The asset version changes when selected source bytes, edits, loop points, or
normalization change. A codec-only derivative retains the semantic version and
gets a distinct output hash. Runtime code should refer to stable semantic IDs,
not provider filenames.

## Manifest and provenance schema

Every selected source and derivative needs a sidecar manifest. Null review
fields mean “candidate only” and forbid copying it into product assets.

```json
{
  "schemaVersion": 2,
  "assetId": "ml_sfx_serve_hit_v001",
  "event": "served",
  "kind": "one-shot",
  "planSha256": "64 lowercase hex characters",
  "generation": {
    "provider": "elevenlabs",
    "endpoint": "https://api.elevenlabs.io/v1/sound-generation",
    "modelId": "eleven_text_to_sound_v2",
    "request": {
      "text": "Full shake caught in a paper cup...",
      "loop": false,
      "duration_seconds": 0.7,
      "prompt_influence": 0.55,
      "model_id": "eleven_text_to_sound_v2"
    },
    "outputFormat": "mp3_44100_192",
    "requestSha256": "64 lowercase hex characters",
    "responseHeaders": {
      "contentType": "audio/mpeg",
      "characterCost": "provider value or null",
      "requestId": "provider value or null",
      "traceId": "provider value or null"
    },
    "generatedAt": "ISO-8601 UTC",
    "sourceBytes": 123456,
    "sourceSha256": "64 lowercase hex characters",
    "sourceProbe": {
      "container": "mp3", "codecName": "mp3", "sampleRate": 44100,
      "channels": 1, "durationSeconds": 0.7
    }
  },
  "rights": {
    "commercialRightsBasis": "paid-subscription",
    "termsReviewedOn": "YYYY-MM-DD",
    "soundEffectsTerms": "https://elevenlabs.io/sound-effects-terms",
    "elevenApiTerms": "https://elevenlabs.io/elevenapi-terms"
  },
  "normalization": {
    "mode": "audition-one-pass",
    "ffmpegVersion": "exact first version line",
    "targets": { "integratedLufs": -18, "truePeakDbtp": -1 },
    "measurements": null,
    "measurementStatus": "pending-final-mastering",
    "masterArgs": ["exact", "argument", "array"],
    "runtimeArgs": ["exact", "argument", "array"],
    "probes": {
      "master": {
        "container": "wav", "codecName": "pcm_s24le", "sampleRate": 48000,
        "channels": 1, "durationSeconds": 0.7
      },
      "runtime": {
        "container": "ogg", "codecName": "opus", "sampleRate": 48000,
        "channels": 1, "durationSeconds": 0.7
      }
    }
  },
  "outputs": {
    "master": { "file": "...master.wav", "sha256": "...", "bytes": 123456 },
    "runtime": { "file": "...runtime.ogg", "sha256": "...", "bytes": 12345 }
  },
  "review": {
    "selected": false,
    "reviewer": null,
    "reviewedAt": null,
    "notes": null
  }
}
```

Never put an API key, authorization header, account email, invoice, or secret
manager identifier in this manifest. Store entitlement evidence outside the
public repository and reference it through the release process, not the asset.

## Safe acquisition scaffold

[`audio-production.mjs`](../../games/maltline/tools/audio-production.mjs) is a
dependency-free, offline-by-default scaffold. It:

- accepts the API credential only through `ELEVENLABS_API_KEY`;
- refuses a paid request unless both `--execute` and a short-lived
  `MALTLINE_AUDIO_GENERATION_APPROVAL` JSON envelope are present;
- binds that approval to the canonical SHA-256 of the exact validated plan and
  explicit asset-count, requested-seconds, estimated-credit, and expiry ceilings;
- pins the endpoint, model, request controls, and output format;
- validates a closed semantic cue set, filename/kind/loop agreement, and a
  recent commercial-rights attestation before any network call;
- preflights `ffmpeg` and `ffprobe` through a 60-second/64-KiB-output process
  boundary, reserves every asset with an exclusive lock, and checks every
  candidate path before the first request;
- performs requests sequentially to make spend bounded and visible;
- refuses to overwrite candidate files and promotes work files with exclusive
  hard links;
- writes only beneath the already ignored `artifacts/maltline-audio/` tree;
- limits a request to 60 seconds and a response to 16 MiB, rejects compressed or
  non-MP3 responses, verifies declared and streamed size, checks MP3 signatures,
  and requires `ffprobe` to decode the source;
- caps the WAV master at 8 MiB and runtime Ogg at 2 MiB before any complete
  read, rejects empty/symlinked/changing derivatives, and probes both sides of
  normalization before `normalization_ready`;
- requires exactly one audio stream; accepts the provider's undocumented mono
  or stereo MP3 channel layout, then proves WAV/PCM s24le and Ogg/Opus 48 kHz
  mono outputs, finite positive bounded duration, and no more than 100 ms
  source-to-master or master-to-runtime duration drift;
- records request/source/output SHA-256 values and provider response IDs in an
  append-only NDJSON lifecycle journal before normalization;
- never automatically retries a billable POST; `--resume` can only continue a
  source already recorded as acquired and hash-matched in that journal;
- re-probes hash-matched work/final derivatives during recovery and completed
  resume, so a retained hash or prior manifest never substitutes for current
  runtime decode validation;
- invokes `ffmpeg` without a shell or credential-bearing arguments; and
- produces an audition WAV master and Ogg Opus runtime candidate, not a
  release-approved asset.

Dry-run validation is safe and makes no network request. Its output provides
the exact plan SHA-256 and conservative requested seconds/credit estimate needed
for an approval:

```sh
node games/maltline/tools/audio-production.mjs --plan /absolute/path/to/audio-plan.json
```

Actual generation must wait for explicit budget and rights approval. Create a
JSON approval with exactly these keys (no extras), using the dry-run hash and a
UTC expiry no more than 24 hours away:

```json
{
  "planSha256": "hash printed by dry-run",
  "maximumAssets": 1,
  "maximumSeconds": 0.7,
  "maximumCredits": 28,
  "expiresAt": "2026-09-10T20:00:00.000Z"
}
```

Load that JSON as `MALTLINE_AUDIO_GENERATION_APPROVAL` and the credential as
`ELEVENLABS_API_KEY` through the operator's secret manager/environment, never as
command arguments, then add `--execute`. The tool revalidates the approval at
execution time and before each request. Do not run paid generation in CI or from
an unattended agent.

Each asset journal progresses monotonically through `reserved`,
`request_started`, `response_received`, `acquired`, `source_validated`,
`normalization_started`, `normalization_ready`, `normalized`, and `completed`,
with `failed` records appended instead of rewriting history. A successful
response is journaled with provider IDs and source hash before normalization.
If decoding, normalization, output promotion, or final manifest writing fails,
inspect the journal and use the same plan with `--execute --resume`; resume
verifies the source/output hashes and cannot call the provider. If failure
occurred after `request_started` but before `acquired`, resume refuses to guess
whether the provider charged the request. Reconcile it manually and create a
new asset version only with a new explicit approval. A lock left by abrupt
process termination is also a manual-review signal, not an invitation to delete
and retry blindly.

The input plan shape is intentionally smaller than the output manifest:

```json
{
  "schemaVersion": 1,
  "provider": "elevenlabs",
  "modelId": "eleven_text_to_sound_v2",
  "commercialRightsBasis": "paid-subscription",
  "termsReviewedOn": "2026-09-10",
  "assets": [
    {
      "id": "ml_sfx_serve_hit_v001",
      "event": "served",
      "kind": "one-shot",
      "prompt": "Full shake caught in a paper cup, soft creamy impact, tiny tidy clink, dry close recording, no speech, no music",
      "durationSeconds": 0.7,
      "loop": false,
      "promptInfluence": 0.55,
      "outputFormat": "mp3_44100_192",
      "targetLufs": -18
    }
  ]
}
```

`event` is restricted to the documented presentation/engine triggers:
`nav_station`, `nav_lane`, `blend_loop`, `blend_completed`, `shake_launched`,
`served`, `jar_caught`, `shake_smashed`, `jar_smashed`, `walkout`, `life_lost`,
`stage_cleared`, `game_lost`, `campaign_victory`, `customer_spawned`,
`jar_returned`, `no_clean_jar`, and `diner_ambience`. One-shots require an
`ml_sfx_` ID; loops require `ml_loop_`.

The scaffold's one-pass loudness normalization is for comparable auditions.
Its manifest records desired loudness/true-peak under `targets` and leaves
`measurements` null with `pending-final-mastering`; it never presents a target
as a measurement. Selected assets still require measured loudness/true-peak
reporting, loop and transient inspection, and a final reproducible mastering
pass before commit.

## Implementation acceptance gates

P2-06 is not complete until all of these are true:

1. Every P0 matrix row has a selected, rights-cleared manifest and hashed
   source/master/runtime asset.
2. A runtime audio manager owns preload/decode, buses, voice limits, lifecycle,
   stored mute/master/reduced preferences, and graceful failure.
3. Mapping tests prove every engine event selects the intended semantic cue and
   no sound callback can enter core simulation.
4. Browser tests cover first-gesture unlock, mute before unlock, persisted
   volume, reduced mode, visibility transitions, reset, terminal loop cleanup,
   missing asset behavior, and rapid-event voice limits.
5. Muted and audible executions of the same input stream produce identical
   replay/proof hashes and score summaries.
6. A human mix review passes headphones, laptop, target cabinet, quiet preset,
   and intentionally crowded failure/serve sequences without clipping or
   masking the visual state.
7. Only reviewed derivatives and their public-safe provenance manifests move
   from ignored staging into the product asset directory.
