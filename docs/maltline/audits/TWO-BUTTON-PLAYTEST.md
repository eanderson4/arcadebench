# Two-button playtest evidence — 2026-09-15

The viewer explicitly selects `two-button-v1`: Space holds to fill and releases
to toss; X switches flavor and replaces a held shake. This is an unranked
playtest. The engine's default remains `generation-2`.

## Default experiment compatibility

Regenerated both artifacts with the supported commands:

```sh
npm run --silent relief:p1-02 --workspace=@arcadebench/maltline
npm run --silent tuning:p1-08 --workspace=@arcadebench/maltline
```

Both envelopes passed their exported verifier with `verifyCurrentSource: true`
and formatted back to the exact CLI bytes. The verifier's existing reviewed
payload checks confirmed these unchanged default payloads:

| Artifact | Canonical payload bytes | Payload SHA-256 |
| --- | ---: | --- |
| P1-02 | 333,137 | `4e497da6714e78b49ec86d3c0175850d373e2cf7e77d7f285695a9dd2fde622a` |
| P1-08 | 781,938 | `59ccec0cc3dabc7ce110d0ed3f0863e6b861a5728758baf1687c0fe7eef8ca36` |

Updated only current source, kernel, build, and envelope hash expectations in
the two envelope test suites. Source changes legitimately change those hashes
even when default simulation output is identical. Payload/result hashes,
simulation results, work limits, and archived envelope expectations remain
unchanged. Both complete focused suites passed: **28 tests**.

## Browser evidence and limits

The focused cabinet-start browser suite passed **6 tests**, covering splash
layout at 1280px, 700px, and 390px; click/Enter/Space activation; focus through
instructions and countdown into gameplay; and the narrow-window guard.
Screenshots were visually inspected, with no horizontal overflow or runtime
errors observed.

Default generation-2 experiment compatibility does not validate two-button
game balance. Prior human studies and reviewed visual baselines remain evidence
for their original revisions. The cabinet revision still needs human playtesting
and fresh gameplay visual review.
