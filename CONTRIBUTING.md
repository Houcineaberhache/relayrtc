# Contributing to RelayKit

Thank you for helping build RelayKit.

## Before starting

Use an existing issue when one describes the work. For a substantial behavior or architecture change, open a proposal before implementation so scope and compatibility can be discussed.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Install Node.js 20 or newer, pnpm 10 or newer, and Go 1.24 or newer. Then run:

```bash
pnpm install
pnpm build
pnpm test
```

Before submitting a change, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e
```

## Engineering expectations

- Keep changes focused on one problem.
- Respect the boundaries in `docs/architecture/module-boundaries.md`.
- Keep public APIs stable and document intentional compatibility changes.
- Use strict TypeScript and focused Go packages.
- Add tests for meaningful behavior and regressions.
- Validate external input and handle errors explicitly.
- Never commit credentials, tokens, private keys, or customer data.
- Use Conventional Commit-style subjects such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.

## Pull requests

Describe the problem, the chosen approach, verification performed, and security or compatibility impact. Keep unrelated refactors in separate changes. A pull request should pass every required CI check before review.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
