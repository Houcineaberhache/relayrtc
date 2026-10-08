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
COPY services/api/package.json services/api/package.json
COPY services/signaling/package.json services/signaling/package.json
COPY tooling/workspace-smoke/package.json tooling/workspace-smoke/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @relayrtc/api...
RUN pnpm turbo run build --filter=@relayrtc/api

FROM node:24-alpine AS runner

WORKDIR /workspace
ENV API_HOST=0.0.0.0
ENV API_PORT=8080
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/packages/auth/package.json ./packages/auth/package.json
COPY --from=builder --chown=node:node /workspace/packages/auth/dist ./packages/auth/dist
COPY --from=builder --chown=node:node /workspace/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=builder --chown=node:node /workspace/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=node:node /workspace/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /workspace/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /workspace/packages/types/package.json ./packages/types/package.json
COPY --from=builder --chown=node:node /workspace/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=node:node /workspace/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=builder --chown=node:node /workspace/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder --chown=node:node /workspace/packages/protocol/node_modules ./packages/protocol/node_modules
COPY --from=builder --chown=node:node /workspace/packages/validation/package.json ./packages/validation/package.json
COPY --from=builder --chown=node:node /workspace/packages/validation/dist ./packages/validation/dist
COPY --from=builder --chown=node:node /workspace/packages/validation/node_modules ./packages/validation/node_modules
COPY --from=builder --chown=node:node /workspace/services/api/package.json ./services/api/package.json
COPY --from=builder --chown=node:node /workspace/services/api/dist ./services/api/dist
COPY --from=builder --chown=node:node /workspace/services/api/node_modules ./services/api/node_modules

USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "services/api/dist/server.js"]
