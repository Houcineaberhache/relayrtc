<img width="2172" height="724" alt="GithubBanner" src="https://github.com/user-attachments/assets/0cc439f5-cf28-4003-a8ac-a1b2dff96115" />

# What is Relayrtc?

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

Make sure to copy .env.example to .env!

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
