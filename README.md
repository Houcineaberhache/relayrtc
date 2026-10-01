# RelayRTC

RelayRTC is open-source realtime communication infrastructure for developers. It is designed to provide stable APIs and SDKs for voice, video, rooms, screen sharing, messaging, presence. Built on top of WebRTC.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer
- Go 1.24 or newer

## Getting started

Start the complete local stack with Docker

```bash
pnpm docker:up
```

The first run creates `.env` with local secrets, builds the dashboard and signaling service,
starts the infrastructure, and applies database migrations. Open `http://localhost:3001` after
the command completes.

Use `pnpm docker:logs`, `pnpm docker:status`, and `pnpm docker:down` to operate the stack.

For development directly on the host please use :

```bash
pnpm install
pnpm build
pnpm test
```

Additional repository checks:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:e2e
```

## Project status

RelayRTC is under active development and does not yet expose a stable public API/SDK's.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report security issues according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

Licensed under the [Apache License 2.0](LICENSE).
