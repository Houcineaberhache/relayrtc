FROM node:24-bookworm-slim AS dependencies

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/media/package.json services/media/package.json
RUN pnpm install --frozen-lockfile --filter @relayrtc/media...

FROM dependencies AS builder

COPY tsconfig.base.json eslint.config.mjs ./
COPY services/media services/media
RUN pnpm --filter @relayrtc/media build

FROM node:24-bookworm-slim AS runner

WORKDIR /workspace
ENV MEDIA_HOST=0.0.0.0
ENV MEDIA_PORT=8082
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/services/media/package.json ./services/media/package.json
COPY --from=builder --chown=node:node /workspace/services/media/dist ./services/media/dist
COPY --from=builder --chown=node:node /workspace/services/media/node_modules ./services/media/node_modules

USER node
EXPOSE 8082
EXPOSE 40000/tcp
EXPOSE 40000/udp
CMD ["node", "--enable-source-maps", "services/media/dist/server.js"]
