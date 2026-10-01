# @relayrtc/auth

Shared Better Auth configuration for RelayRTC.com dashboard/app accounts

## Required environment

```text
DATABASE_URL=postgresql://relaykit:password@localhost:5432/relaykit
BETTER_AUTH_SECRET=a-random-secret-containing-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_TRUSTED_ORIGINS=https://dashboard.example.com
GITHUB_CLIENT_ID=github-client-id
GITHUB_CLIENT_SECRET=github-client-secret
GOOGLE_CLIENT_ID=google-client-id
GOOGLE_CLIENT_SECRET=google-client-secret
```

`BETTER_AUTH_TRUSTED_ORIGINS` is optional and accepts a comma-separated list of additional origins. Secrets must be generated independently for each deployment and must not be committed.

## GitHub and Google OAuth

Register these exact local callback URLs in the provider consoles:

```text
http://localhost:3001/api/auth/callback/github
http://localhost:3001/api/auth/callback/google
```
