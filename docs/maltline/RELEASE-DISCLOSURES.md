# Maltline release disclosures

**Engineering review:** 2026-09-11. This inventory records the repository and
browser behavior checked for release; it is not legal advice.

## Shipped assets and licenses

Maltline's production visuals are code-native HTML, CSS, and Canvas drawing
under the repository's MIT license. The production bundle currently ships no
raster images, audio, or generated media. PNG visual baselines are test evidence
and are not copied into the production route.

The only separately licensed runtime assets are four self-hosted Noto Sans
Latin WOFF2 files from `@fontsource/noto-sans` 5.3.0. They use weights 400, 600,
700, and 800 in normal style and remain licensed under OFL-1.1. Their exact
package paths, sizes, SHA-256 digests, and notice identity are pinned in
`games/maltline/release-assets.json`. The upstream copyright notice and complete
license ship byte-for-byte at
`/maltline/third-party-licenses/noto-sans-OFL-1.1.txt`.

Any new font, image, audio, video, or generated runtime asset requires an
explicit manifest entry, provenance and rights review, and an intentional
release-test update before it can enter the assembled route.

## Browser data and network behavior

- Play and replay inspection execute in the browser. Maltline does not use
  local storage, session storage, or IndexedDB for run proofs.
- Starting a ranked attempt requests a same-origin, one-use challenge. The
  request contains the game version and board ID, not replay inputs or a
  callsign. The accountless service may set the signed anonymous cookie
  described by the ArcadeBench privacy promise.
- Opening Shift Board requests the public board. Inspecting an available score
  requests its retained proof; verification and playback then happen locally.
- The complete input proof and chosen callsign are sent only when the player
  explicitly submits a rank-eligible terminal result. Callsign moderation and
  five-day proof retention follow the published privacy promise.
- The development-only human playtest lab has separate tests that prohibit
  network, storage, cookies, ranked proofs, and production-bundle inclusion.

The public policy is maintained in `docs/PRIVACY.md` and published at
`/privacy/`. Source tests cover same-origin request credentials, explicit
submission, memory-only proof lifecycle, callsign handling, replay expiry, and
human-lab isolation. The assembled-site smoke checks that the policy and font
notice remain reachable and that Maltline loads no unlisted or cross-origin
runtime asset.

## Review boundary

This review does not approve future generated audio, replace provider-specific
rights review, assess deployed WAF or capacity settings, validate a launcher,
or substitute for counsel. Those boundaries remain separate release work.
