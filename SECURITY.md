# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- **Preferred:** use GitHub's private reporting: the **Security** tab of this repository, then **Report a vulnerability**.
- **Otherwise:** email security@any2orca.com with "any2orca security" in the subject.

Include what you found, how to reproduce it (a sample file helps), and which version. You'll get an answer within a few days. This is a small project run by one person, so there is no bounty, but I will credit you in the fix if you like.

## What is in scope

any2orca reads `.3mf` files that other people made, so the parts that handle untrusted input matter most:

- **The file reader:** zip handling and limits (entry counts, sizes, compression ratios, unsafe paths), and the XML and JSON it parses.
- **The converter:** anything that lets a crafted project cause unbounded work, write outside where it should, or run code.
- **The CLI:** argument handling, the `--watch` and `--archive-dir` file moves, and the state file.
- **The web app:** the manifest-link and `postMessage` hand-offs (origin checks, size limits, confirmation), and anything that could make a file leave the visitor's device.
- **Privacy claims:** a way to make the library or the web app send a file, or something derived from it, anywhere. See [docs/privacy.md](docs/privacy.md).

## Supported versions

Fixes go into the latest release of `any2orca`, `any2orca-profiles` and the web app. Before 1.0 there is no backport policy.

## How the project defends itself

The reader's limits are listed in [`packages/core/README.md`](packages/core/README.md). The hand-off limits are in [the integration guide](docs/integration-guide.md#limits). The CI pipeline runs the unit tests, the browser tests (including a network check that a conversion sends nothing) and an accessibility check on every change, and dependencies are updated by Dependabot. Releases are published by GitHub Actions through npm trusted publishing, with no stored npm token.
