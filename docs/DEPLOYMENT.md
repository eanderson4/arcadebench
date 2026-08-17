# ArcadeBench deployment

ArcadeBench deploys as a Cloudflare Worker with Static Assets. The first
production artifact exposes Partition at both `/` and its permanent
`/partition/` route. When the cross-game launcher replaces `/`, existing game
links will continue to work.

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
4. On `main` only, deploy that exact artifact to Cloudflare.

Push the repository to GitHub before enabling deployment; this local checkout
does not currently have a remote configured. Create a protected GitHub
environment named `production`, then add these repository or environment
secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Use a narrowly scoped Cloudflare API token that can edit Workers scripts for
the target account. Pull requests never receive the production secrets and
never deploy.

## First activation

The checked-in `wrangler.jsonc` publishes to the `arcadebench` Worker and keeps
its `workers.dev` URL enabled. After registering the final domain:

1. Add the domain to the same Cloudflare account.
2. Open **Workers & Pages → arcadebench → Settings → Domains & Routes**.
3. Add the apex as a Custom Domain.
4. Add `www` and redirect it to the canonical apex.
5. Update the repository description and canonical metadata after the first
   successful custom-domain deployment.

Keeping the hostname out of `wrangler.jsonc` lets CI/CD go live before DNS is
registered and avoids a failed deploy during domain activation. The intended
primary hostname is `arcadebench.org`; the site can first ship to its generated
`workers.dev` address.

## Later API bindings

The static deployment does not yet provision public score or replay storage.
When those handlers land, add separate preview and production bindings for:

- D1: seasons, verified scores, level votes, and replay metadata.
- R2: five-day public shares and retained leaderboard proofs.
- KV: optional read caches only, never canonical scores or vote counters.

Apply D1 migrations before deploying code that depends on them. Preview
resources must never share bindings with production.
