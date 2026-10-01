# infrastructure

### Configure

Copy the environment template before starting the stack:

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
docker compose up -d
docker compose ps
docker compose logs -f
```

The same operations are available through `pnpm infra:up`, `pnpm infra:status`, and `pnpm infra:logs`.

Local endpoints:

| Service    | Endpoint                          |
| ---------- | --------------------------------- |
| PostgreSQL | `localhost:5432`                  |
| TURN/STUN  | `localhost:3478` over UDP and TCP |
| Prometheus | `http://localhost:9090`           |
| Grafana    | `http://localhost:3000`           |


### Validate configuration

```bash
docker compose --env-file .env.example config --quiet
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

Stop containers while retaining local data:

```bash
docker compose down
```

Delete containers and all PostgreSQL, Prometheus, and Grafana data:

```bash
docker compose down --volumes
```