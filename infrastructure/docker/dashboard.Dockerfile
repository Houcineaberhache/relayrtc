FROM node:24-alpine AS dependencies

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY services/signaling/package.json services/signaling/package.json
COPY tooling/workspace-smoke/package.json tooling/workspace-smoke/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS source

COPY . .
RUN pnpm install --offline --frozen-lockfile

FROM source AS builder

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@relayrtc/dashboard

FROM source AS migrator

ENV NODE_ENV=production
CMD ["pnpm", "db:migrate"]

FROM node:24-alpine AS runner

WORKDIR /workspace
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder --chown=node:node /workspace/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=node:node /workspace/apps/dashboard/public ./apps/dashboard/public

USER node
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]
