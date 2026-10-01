# @relaykit/database

Shared PostgreSQL access, Drizzle schema definitions, and versioned migrations for RelayKit.cc services
## Commands

Run these commands from the repository root with `DATABASE_URL` available in the environment:

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates a migration from schema changes. Review generated SQL before committing it. `db:migrate` applies committed migrations to the configured PostgreSQL database.
