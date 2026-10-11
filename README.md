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

## Available SDKs

| SDK | Package | GitHub | Documentation |
| --- | --- | --- | --- |
| React | [@relayrtc/react](https://www.npmjs.com/package/@relayrtc/react) | [react-sdk](https://github.com/relayrtc/react-sdk) | [React SDK](https://docs.relayrtc.com/reference/sdk/client/react/overview) |
| Node.js | [@relayrtc/node](https://www.npmjs.com/package/@relayrtc/node) | [node-sdk](https://github.com/relayrtc/node-sdk) | [Node SDK](https://docs.relayrtc.com/reference/sdk/server/node/overview) |
| JavaScript browser client | [@relayrtc/client](https://www.npmjs.com/package/@relayrtc/client) | [packages/client](https://github.com/relayrtc/relayrtc/tree/main/packages/client) | [Browser SDK](https://docs.relayrtc.com/reference/sdk/client/javascript/overview) |

## Supporting packages

| Package | Purpose | GitHub |
| --- | --- | --- |
| [@relayrtc/types](https://www.npmjs.com/package/@relayrtc/types) | Shared TypeScript domain contracts. | [packages/types](https://github.com/relayrtc/relayrtc/tree/main/packages/types) |
| [@relayrtc/validation](https://www.npmjs.com/package/@relayrtc/validation) | Runtime validation schemas for domain contracts. | [packages/validation](https://github.com/relayrtc/relayrtc/tree/main/packages/validation) |
| [@relayrtc/protocol](https://www.npmjs.com/package/@relayrtc/protocol) | Versioned realtime wire contracts. | [packages/protocol](https://github.com/relayrtc/relayrtc/tree/main/packages/protocol) |

See the [installation guide](https://docs.relayrtc.com/installation) and [quickstart](https://docs.relayrtc.com/quickstart) to build your first call.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report security issues according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

Licensed under the [Apache License 2.0](LICENSE).
