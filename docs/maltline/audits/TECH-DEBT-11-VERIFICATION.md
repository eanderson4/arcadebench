# Maltline Technical-Debt Audit 11 — Site Release Verification

**Date:** 2026-09-11
**Scope:** Settled P4-01 assembly, local production server, built-site smoke,
Cloudflare Static Assets configuration, route metadata, Worker redirects, and
CI ownership. This review was read-only.

## Verdict

P4-01 should remain closed. Selective assembly, permanent routes, canonical
metadata, cache/security declarations, exact CSP parity, custom 404 behavior,
and the Partition replay redirect all pass their local gates. Remaining work is
release-verification hardening before a production deployment.

## Findings

1. **Exercise real Wrangler/Workers Static Assets behavior.** The local server
   intentionally emulates trailing-slash, 404, header, and cache behavior and
   treats Worker-owned API paths as static 404s. Add an offline Wrangler dry run
   and a production-shaped composite smoke for Worker-first APIs, slash routes,
   custom 404s, hidden control files, headers, and legacy redirects. Retain a
   post-deploy apex/www/header probe as external evidence.
2. **Make the recursive artifact inventory exact.** Top-level inventory is
   exact, but Partition and Maltline asset directories are copied recursively.
   Introduce one data-only release contract with referenced-assets-equal-shipped-
   assets, allowed media types, per-file and aggregate ceilings, and exact route
   trees. Use it to compare the checked-in sitemap, robots, redirects, and cache
   policy instead of duplicating route lists and a Worker-source regex.
3. **Pin canonical-host behavior.** Add GET/HEAD integration cases for the
   `www` 308 that preserve path/query, set no cookie, and touch no session or
   asset binding.
4. **Run both game documents in the root browser gate.** Current committed root
   coverage fetches their HTML; manual CSP execution was clean. Add a no-golden
   runtime case for console, page, request, font, and fresh-entry failures.
5. **Own site-test dependencies and artifacts at root.** Root scripts import
   Playwright through the Maltline workspace. Move the pinned dependency to root
   or a site-testing workspace and ignore root `/test-results/`.

No finding permits a score forgery, changes a game route, or requires reopening
the completed launcher tranche.
