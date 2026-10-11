FROM node:24-alpine AS migrator

WORKDIR /workspace
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --filter @relayrtc/database

COPY packages/database/drizzle.config.ts packages/database/drizzle.config.ts
COPY packages/database/src packages/database/src
COPY packages/database/migrations packages/database/migrations

ENV NODE_ENV=production
USER node
CMD ["pnpm", "db:migrate"]
