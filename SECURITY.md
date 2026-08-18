# Security

Do not report exploitable vulnerabilities in a public issue.

Use GitHub's **Report a vulnerability** flow in the repository Security tab so
the report and any proof of concept remain private. Include the affected commit
or protocol generation, expected impact, and the smallest safe reproduction you
can provide. Do not include production credentials or unrelated user data.

ArcadeBench also maintains two different security boundaries:

- Local disclosure gates prevent credentials and private details from entering
  public Git history.
- Public CI checks application code, dependencies, and pull requests.

The boundaries and local commands are documented in
[the disclosure-prevention guide](docs/DISCLOSURE-PREVENTION.md).
