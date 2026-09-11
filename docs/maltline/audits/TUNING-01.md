# Tuning Experiment 01 — Late Work, Lives, and Pace

**Experiment:** EXP-021
**Date:** 2026-09-10
**Scope:** P1-02, P1-04, P1-08
**Authored campaign changes:** none

## Method

The checked-in EXP-021 runner evaluates the canonical campaign seed plus 32
deterministic shadow offsets: 33 runs per candidate/controller pair. It reports
campaign completion, stage curve, duration, score, remaining lives, maximum live
customers, maximum committed jars, zero-available-jar ticks, and loss reasons.

```text
npx tsx games/maltline/tools/tuning-experiment.ts
```

The original checked-in schema-v1 result fingerprint is
`fnv1a64:da093358d25348ae`; it remains recorded as the historical EXP-021
identity. The reproducibility runner now emits schema 2 with fingerprint
`fnv1a64:ca3ebefefc0b4582`. Schema 2 binds the rules/game fingerprints,
normalized generation-1 baseline, initial-run policy, tick limit, seed set,
controller metadata, candidate transforms, and all effective candidate/seed
campaign fingerprints. The measured results below are unchanged. Repeated
output is byte-identical. All candidate transformations preserve every stage
1–3 field and change only the starting lives and/or stage 4–8 customer/spawn
fields in temporary scenario copies.

The three controller profiles are the perfect reactive reference, the
two-tick delayed-competent model, and the deterministic novice/error model. The
models use no seed foresight. Results remain simulation evidence, not a
substitute for human playtests.

## Candidate definitions

Late customer counts are listed for stages 4–8. “Interval” scales both authored
initial and floor spawn intervals. “Acceleration” scales the authored per-spawn
acceleration.

| Candidate | Lives | Late counts | Interval | Acceleration | Intent |
| --- | ---: | --- | ---: | ---: | --- |
| Baseline 3 | 3 | 14/14/12/18/20 | 1.00× | 1.00× | Current control |
| Baseline 4 | 4 | 14/14/12/18/20 | 1.00× | 1.00× | Lives-only control |
| Count-only light | 4 | 18/18/15/24/28 | 1.00× | 1.00× | More work without breathers |
| Paced light | 4 | 18/18/15/24/28 | 1.20× | 0.50× | Conservative duration target |
| Paced balanced | 4 | 20/20/17/27/31 | 1.20× | 0.50× | Duration plus late pressure |
| Paced breather | 4 | 20/20/17/27/31 | 1.35× | 0.50× | Low-pressure long control |
| Overpaced heavy | 4 | 22/22/19/30/35 | 1.40× | 0.00× | Duration-only rejection control |

No movement, blend, drink, wash, station, lane, or jar-pool value changes in
any candidate.

## Campaign distributions

Times are active simulation seconds. Crowd and jars are the mean of each run's
campaign maximum, followed by the observed maximum in parentheses. Zero jars is
mean ticks per run with no jar immediately available.

### Reactive reference

| Candidate | Wins | Winning seconds, mean (range) | Crowd | Jars | Zero-jar ticks | Losses |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Baseline 3 | 33/33 | 235.350 (234.933–235.783) | 4.667 (5) | 6.000 (6) | 468.424 | 0 |
| Baseline 4 | 33/33 | 235.350 (234.933–235.783) | 4.667 (5) | 6.000 (6) | 468.424 | 0 |
| Count-only light | 33/33 | 266.797 (266.250–268.583) | 6.030 (7) | 6.000 (6) | 1,504.303 | 0 |
| Paced light | 33/33 | 337.168 (336.933–337.450) | 3.000 (3) | 5.000 (5) | 0 | 0 |
| **Paced balanced** | **33/33** | **360.775 (360.600–361.033)** | **3.000 (3)** | **5.000 (5)** | **0** | **0** |
| Paced breather | 33/33 | 399.118 (398.733–399.533) | 3.000 (3) | 4.000 (4) | 0 | 0 |
| Overpaced heavy | 33/33 | 499.518 (499.233–499.833) | 2.000 (2) | 3.000 (3) | 0 | 0 |

### Delayed competent

| Candidate | Wins | Mean stages | Winning seconds, mean (range) | Crowd | Jars | Zero-jar ticks | Losses |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| Baseline 3 | 13/33 | 7.364 | 258.594 (252.667–265.067) | 7.970 (10) | 5.212 (6) | 116.152 | 51 walkouts, 13 jar smashes |
| Baseline 4 | 23/33 | 7.697 | 258.238 (252.233–265.067) | 7.970 (10) | 5.273 (6) | 118.515 | 59 walkouts, 15 jar smashes |
| Count-only light | 0/33 | 6.394 | — | 10.697 (16) | 5.152 (6) | 485.212 | 104 walkouts, 28 jar smashes |
| Paced light | 33/33 | 8.000 | 344.668 (340.617–354.483) | 4.606 (6) | 4.970 (6) | 0.303 | 1 walkout |
| **Paced balanced** | **31/33** | **7.939** | **369.449 (365.117–376.217)** | **5.242 (7)** | **5.030 (6)** | **1.000** | **14 walkouts, 2 jar smashes** |
| Paced breather | 33/33 | 8.000 | 404.875 (401.950–409.783) | 3.848 (5) | 4.606 (5) | 0 | 0 |
| Overpaced heavy | 33/33 | 8.000 | 502.473 (501.300–503.783) | 2.061 (3) | 3.000 (3) | 0 | 0 |

The lives-only change improves delayed completion from 39.4% to 69.7% over the
broader seed set, rather than the 100% suggested by the earlier five-run sample.
That is exactly why this expansion was needed. Four lives help, but do not fix
the current stage-8 cliff by themselves.

The novice/error model wins 0/33 for every candidate. Mean progress rises from
1.697 stages on three lives to 2.515 on baseline four lives. Paced balanced is
similar at 2.485 stages, so it does not accidentally rescue the deliberately
repeated-error profile. Its paced-balanced loss ledger contains 108 shake
smashes and 24 jar smashes across 33 runs.

## Recommended candidate: paced balanced, four lives

Take `paced-balanced-4-lives` into human testing first:

- stages 4–8 use 20/20/17/27/31 customers;
- initial/floor arrival intervals are 1.20× authored values;
- spawn acceleration is halved;
- the run starts with four lives.

It lands inside the requested 300–420 active-second window for both successful
profiles: 360.775 seconds reactive and 369.449 seconds delayed. It retains a
small skill boundary: reactive wins 33/33, while delayed wins 31/33 and loses 16
lives across the matrix. The two delayed failures both reach stage 8. Unlike the
paced-breather control, it produces a stage-8 delayed crowd mean of 5.242 and a
maximum of 7.

The canonical delayed run wins in 374.283 seconds with two lives remaining,
having lost two lives to stage-8 walkouts. The canonical reactive run wins in
361.033 seconds with all four lives.

### Recommended stage curve

| Stage | Reactive seconds / crowd | Delayed seconds / crowd | Delayed clear rate |
| ---: | ---: | ---: | ---: |
| 1 | 25.967 / 2.000 | 26.069 / 2.000 | 33/33 |
| 2 | 26.987 / 2.000 | 27.078 / 2.000 | 33/33 |
| 3 | 31.269 / 2.000 | 31.900 / 2.061 | 33/33 |
| 4 | 51.993 / 2.000 | 52.137 / 2.727 | 33/33 |
| 5 | 62.764 / 2.000 | 62.827 / 2.000 | 33/33 |
| 6 | 51.656 / 2.000 | 53.127 / 2.909 | 33/33 |
| 7 | 55.200 / 2.909 | 56.294 / 3.182 | 33/33 |
| 8 | 54.940 / 3.000 | 60.197 / 5.242 | 31/33 |

This is a candidate, not a campaign-edit recommendation without qualification.
The models show stages 4–6 becoming longer more than denser for perfect play.
Human testing must determine whether their extra orders feel satisfying or
repetitive.

## Rejected alternative: count-only light

Reject adding late customers at the current cadence. It misses the duration
target for reactive play at 266.797 seconds, drops delayed completion from
23/33 on the four-life baseline to 0/33, raises delayed maximum crowd as high as
16, and more than quadruples its mean zero-jar time from 118.515 to 485.212
ticks. Its failure is overload, not useful longer play.

Also reject `overpaced-heavy-4-lives`: it exceeds the target at roughly 500
seconds and strips away pressure. Reactive maximum crowd falls to exactly 2,
delayed mean maximum crowd to 2.061, and neither profile ever exhausts jars or
loses a life. It is measured waiting time rather than a better run.

## Wave/breather schema finding

The current scenario schema cannot express a burst followed by a deliberate
breather. It has only one monotonically accelerating spawn interval. Scaling
that interval creates long even spacing; leaving it alone with more customers
creates runaway late overlap.

The smallest useful future mechanic is one optional field:

```text
waveBreaks?: readonly { afterCustomer: number; extraTicks: number }[]
```

After the named spawn, the engine would add a deterministic pause before the
next customer. Existing interval/acceleration fields would still shape each
wave, and omitted `waveBreaks` would preserve current behavior exactly. This is
preferable to adding a second scheduler or globally slowing movement. It should
be proposed and tested separately; EXP-021 does not implement it.

## Next test

Run short human sessions on baseline four lives, paced light, and paced balanced.
Measure real elapsed time, perceived idle time in stages 4–6, stage-8 readability,
and whether a fourth life encourages recovery. If paced balanced feels sparse,
prototype explicit wave breaks before increasing count or speed pressure again.
