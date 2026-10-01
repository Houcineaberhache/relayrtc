# @relaykit/auth

Shared Better Auth configuration for RelayKit.cc dashboard/app accounts


## Required environment

```text
DATABASE_URL=postgresql://relaykit:password@localhost:5432/relaykit
BETTER_AUTH_SECRET=a-random-secret-containing-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_TRUSTED_ORIGINS=https://dashboard.example.com
```

`BETTER_AUTH_TRUSTED_ORIGINS` is optional and accepts a comma-separated list of additional origins. Secrets must be generated independently for each deployment and must not be committed.
