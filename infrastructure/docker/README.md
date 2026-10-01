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

`TURN_PUBLIC_IP=127.0.0.1` supports browser clients running on the same host. Use the host's reachable LAN address for testing from other devices. A public deployment requires its public IP and one-to-one forwarding for the TURN listener and relay port range.

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
| PostgreSQL | `localhost:5433`                  |
| TURN/STUN  | `localhost:3478` over UDP and TCP |
| Prometheus | `http://localhost:9090`           |
| Grafana    | `http://localhost:3000`           |

### Validate configuration

```bash
pnpm docker:config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

Stop containers while retaining local data:

```bash
pnpm docker:down
```

Delete containers and all PostgreSQL, Prometheus, and Grafana data:

```bash
docker compose down --volumes
```
