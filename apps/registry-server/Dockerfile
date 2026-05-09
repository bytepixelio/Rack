FROM node:22-slim AS builder

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/auth-core/ packages/auth-core/
COPY packages/registry-core/ packages/registry-core/
COPY apps/registry-server/ apps/registry-server/

RUN pnpm install --frozen-lockfile --filter @rack/registry-server... --ignore-scripts
RUN pnpm --filter @rack/registry-server build


FROM node:22-slim

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/registry-server/package.json apps/registry-server/

RUN pnpm install --frozen-lockfile --filter @rack/registry-server --prod --ignore-scripts

COPY --from=builder /app/apps/registry-server/dist apps/registry-server/dist/

RUN mkdir -p /app/config \
  && echo '{"@rack":[]}' > /app/config/auth.json \
  && echo '{"webhooks":[]}' > /app/config/webhooks.json

RUN mkdir -p /data && touch /data/.healthcheck
COPY packages/storage/schema/ /app/schema/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/registry-server/dist/server.js"]
