# ArcadeBench deployment

ArcadeBench deploys as a Cloudflare Worker with Static Assets. The first
production artifact exposes Partition at both `/` and its permanent
`/partition/` route. When the cross-game launcher replaces `/`, existing game
links will continue to work. Production is live at <https://arcadebench.org>.

## Local production preview

```sh
npm install
npm run preview:site
```

`npm run build:site` builds Partition and assembles the deployable artifact at
`dist/site`. The assembly step also promotes the Vite entry page to `/`, keeps
`/partition/`, and adds the production headers and legacy viewer redirects.

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

Use a narrowly scoped Cloudflare API token that can edit Workers scripts for
the target account. Pull requests never receive the production secrets and
never deploy. Until both secrets exist, the production job reports a notice and
exits successfully; verification and artifact assembly still run normally.

## Production domains

The checked-in `wrangler.jsonc` publishes to the `arcadebench` Worker, keeps its
`workers.dev` URL enabled, and attaches both production custom domains. The
small Worker entry point in `deploy/worker.js` serves the static asset binding
and permanently redirects `www.arcadebench.org` to the canonical apex while
preserving paths and query strings.

Cloudflare manages DNS and certificates for `arcadebench.org`. Because the
routes are source-controlled, local and CI deployments publish the same domain
behavior; do not add a competing apex or `www` DNS record outside the Worker
custom-domain flow.

## Later API bindings

The static deployment does not yet provision public score or replay storage.
When those handlers land, add separate preview and production bindings for:

- D1: seasons, verified scores, level votes, and replay metadata.
- R2: five-day public shares and retained leaderboard proofs.
- KV: optional read caches only, never canonical scores or vote counters.

Apply D1 migrations before deploying code that depends on them. Preview
resources must never share bindings with production.
