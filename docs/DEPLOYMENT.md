# ArcadeBench deployment

ArcadeBench deploys as a Cloudflare Worker with Static Assets. The root `/`
serves the cross-game launcher and the mission statement lives at `/about/`;
Partition and Maltline keep permanent direct routes at `/games/partition/` and
`/games/maltline/`. The retired `/partition/`, `/maltline/`, and `/src/viewer`
paths stay reachable through exact 301 redirects, and a root request carrying a
Partition query key (a legacy replay share link) forwards to
`/games/partition/` with its query intact. Production is live at
<https://arcadebench.org>.

## Local production preview

```sh
npm install
npm run preview:site
```

`npm run build:site` builds both games and selectively assembles the deployable
artifact at `dist/site`. The assembly step installs the static launcher at `/`,
Partition's entry at `/games/partition/` with its root-scoped assets under
`/assets/`, Maltline's entry at `/games/maltline/` with its hashed assets and
font-license notice under `/maltline/`, the About page at `/about/`, and the
policy pages, production headers, and legacy route redirects. The launcher does
not import or mount either game runtime.

`npm run test:site:wrangler-local` starts the installed Wrangler version on an
ephemeral local port and probes the combined Worker and Static Assets runtime.
Cache policy follows the incoming request pathname, as Cloudflare `_headers`
matching does: `/404.html` itself is `no-store`, while an arbitrary missing or
hidden-control pathname that displays the custom page uses
`public, max-age=0, must-revalidate`. A 404 status alone does not select the
`/404.html` cache rule. This local check complements, but does not replace,
post-deploy edge verification.

## GitHub Actions

`.github/workflows/ci-cd.yml` runs on every push and pull request:

1. Install the exact dependency lock with `npm ci`.
2. Build and test every workspace.
3. Assemble and upload the verified static artifact.
4. On `main` only, deploy that exact artifact to Cloudflare when the production
   credentials are configured.

Create a protected GitHub environment named `production`, then add these
repository or environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Use a narrowly scoped Cloudflare API token for the target account and zone with
Workers Scripts edit, D1 edit, R2 edit, Workers AI binding, and route/domain
permissions. Pull requests never receive the production secrets and never
deploy. Until both secrets exist, the production job reports a notice and exits
successfully; verification and artifact assembly still run normally.

## Production domains

The checked-in `wrangler.jsonc` publishes to the `arcadebench` Worker, keeps its
`workers.dev` URL enabled, and attaches both production custom domains. The
Worker entry point in `deploy/worker.js` delegates to the tested public platform
in `apps/platform`, serves the static asset binding, and permanently redirects
`www.arcadebench.org` to the canonical apex while preserving paths and query
strings.

Cloudflare manages DNS and certificates for `arcadebench.org`. Because the
routes are source-controlled, local and CI deployments publish the same domain
behavior; do not add a competing apex or `www` DNS record outside the Worker
custom-domain flow.

## Public service bindings

The checked-in production bindings are:

- D1 `arcadebench-platform`: seasons, anonymous sessions, one-time challenges,
  verified scores, level/game votes, replay metadata, moderation cache, and
  exact rate windows.
- R2 `arcadebench-replays`: five-day opt-in shares below `shares/` and five-day
  leaderboard verification proofs below `proofs/`. New-policy replay candidates
  and saved Top 50 replays use `archives/`, with database-controlled retention.
- Workers AI: cached callsign review with a strict structured response.
- Two edge rate-limit bindings, backed by exact per-session D1 limits.
- Secret `COOKIE_SIGNING_SECRET`, generated and stored only in Cloudflare.

CI applies the reviewed production D1 migration set before each deployment.
The production directory includes 0001, 0002, 0004, 0005, and 0006; unreleased
Maltline generation-2 migration 0003 is intentionally excluded. A maintained
production entry disables those legacy Maltline routes and background jobs
while serving the shared v2 cabinet adapter. Migration 0006 archives the prior
`cabinet-1` season and opens `cabinet-2` (Second Shift) when no other Maltline
authority is active; Partition keeps its existing `0.1.0` launch season. See the
[shared platform release plan](PLATFORM-RELEASE-PLAN.md). R2 has five-day
lifecycle rules for `proofs/` and `shares/` only, while an hourly Worker job deletes
expired objects and metadata proactively. The score summary and proof hash stay
in D1 after proof deletion. Preview resources must never share bindings with
production.
