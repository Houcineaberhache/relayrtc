# infrastructure

### Configure

The complete stack can configure itself on its first run:

```bash
pnpm docker:up
```

When `.env` does not exist, this command copies the environment template and replaces the local
PostgreSQL, Better Auth, TURN, and Grafana secrets with cryptographically random values. OAuth
credentials remain placeholders until you add real GitHub and Google application credentials.

To configure values manually instead, copy the environment template before starting the stack:

```bash
cp .env.example .env
```

Replace every `replace-with-...` value. Generate independent random values for the PostgreSQL password, TURN shared secret, and Grafana password. A 32-byte hexadecimal value is suitable for local secrets:

```bash
openssl rand -hex 32
```

Set `DATABASE_URL` to the same PostgreSQL user, password, port, and database configured by the other PostgreSQL variables.

`TURN_PUBLIC_IP=127.0.0.1` supports browser clients running on the same host. Use the host's reachable LAN address for testing from other devices. A public deployment requires its public IP and one-to-one forwarding for ports `3478/UDP`, `3478/TCP`, `5349/TCP`, and the configured UDP relay range.

The coturn image includes a self-signed `relayrtc.local` certificate for local TLS testing. Public deployments must bind-mount a certificate and private key trusted for the public TURN hostname, then set `TURN_TLS_CERT_FILE` and `TURN_TLS_PRIVATE_KEY_FILE` to their container paths. The coturn process runs as `nobody`, so both mounted files must be readable by UID `65534` while the private key remains inaccessible to other users.

Supported ICE server URLs are:

```text
stun:turn.example.com:3478
turn:turn.example.com:3478?transport=udp
turn:turn.example.com:3478?transport=tcp
turns:turn.example.com:5349?transport=tcp
```

TURN allocations require credentials. Phase 5.2 provides short-lived credentials derived from `TURN_SHARED_SECRET`; unauthenticated STUN discovery remains available.

### Start and inspect

```bash
pnpm docker:up
pnpm docker:status
pnpm docker:logs
```

`docker:up` builds the application images, waits for PostgreSQL, applies all committed Drizzle
migrations, starts the dashboard and signaling service, and waits for service health checks.
Migration failure prevents the application containers from starting.

Use `pnpm infra:up` when you only need PostgreSQL, TURN, Prometheus, and Grafana for host-based
development.

Local endpoints:

| Service    | Endpoint                          |
| ---------- | --------------------------------- |
| Dashboard  | `http://localhost:3001`           |
| Signaling  | `ws://localhost:8081/v1/connect`  |
| PostgreSQL | `localhost:5433`                  |
| STUN       | `localhost:3478` over UDP         |
| TURN UDP   | `localhost:3478` over UDP         |
| TURN TCP   | `localhost:3478` over TCP         |
| TURN TLS   | `localhost:5349` over TLS/TCP     |
| Prometheus | `http://localhost:9090`           |
| Grafana    | `http://localhost:3000`           |

Grafana provisions a `TURN Metrics` dashboard with active allocations, active relay sessions,
ingress bytes, egress bytes, relay throughput, allocation transport, and relay seconds for the
selected time range. Prometheus records these RelayRTC metrics from coturn's native exporter:

```text
relayrtc_turn_allocations
relayrtc_turn_sessions
relayrtc_turn_ingress_bytes_total
relayrtc_turn_egress_bytes_total
relayrtc_turn_relay_seconds_per_second
```

### Validate configuration

```bash
pnpm docker:config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec prometheus promtool check rules /etc/prometheus/relayrtc.rules.yml
```

Stop containers while retaining local data:

```bash
pnpm docker:down
```

Delete containers and all PostgreSQL, Prometheus, and Grafana data:

```bash
docker compose down --volumes
```
