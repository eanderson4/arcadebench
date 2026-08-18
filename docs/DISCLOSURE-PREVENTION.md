# Local disclosure prevention

ArcadeBench is intended to be public. Its local gates are therefore optimized
to stop credentials and private details before they enter public Git history.

## Installed gates

`npm install` activates the checked-in Husky hooks for local clones.

- **Pre-commit:** `lint-staged` scans the exact staged view with Secretlint and
  the ArcadeBench private-detail scanner.
- **Pre-push:** scans all tracked files, every reachable commit, and author
  identities.
- **GitHub Actions:** repeats the full pre-push scan with read-only repository
  permissions before build or deployment. Dependency advisories remain a
  separate CI concern and do not widen the local disclosure gate.

Run the complete disclosure gate manually with:

```sh
npm run security:prepush
```

The private-detail scanner rejects personal email addresses, absolute user home
paths, private-network addresses, and credential-shaped filenames. Public
fixtures can be explicitly reviewed by placing `privacylint-allow` on the same
line. Secretlint findings should not be allowlisted without verifying that the
value is fake or already revoked.

Git hooks can be bypassed with Git's `--no-verify` option. Before making the
repository public, enable GitHub secret scanning and push protection, protect
`main`, and require the verification workflow. Cloudflare credentials belong
only in the protected GitHub `production` environment.

Ordinary application security is intentionally separate. CodeQL runs publicly
on pull requests and `main`; a future LLM reviewer may comment on public PR
diffs without becoming part of the local private-disclosure boundary.

## Before the first public push

1. Run `npm run security:prepush`.
2. Confirm every Git author name and email is intentionally public.
3. Inspect image/document metadata before adding binary media.
4. Enable GitHub push protection and private vulnerability reporting.
5. Never place production credentials in local screenshots, replays, issues,
   examples, or build logs.
