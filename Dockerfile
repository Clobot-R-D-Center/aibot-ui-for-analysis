# The dashboard in one image: the gateway, also serving the built web app on
# its port (8787). See README (Docker).
FROM node:24-slim AS base
# CI: no git hooks to install (lefthook) and no prompts.
ENV CI=true
RUN corepack enable
WORKDIR /app

FROM base AS web
# Packages by the lockfile alone, so a source change doesn't refetch them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter web... \
	&& pnpm --filter web build

# Not from the fetch above: it fills node_modules with every package (~0.5 GB).
FROM base AS gateway
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter gateway...

FROM node:24-slim
# Only what runs: the build context also holds local, git-ignored files.
COPY --from=gateway /app/node_modules /app/node_modules
COPY --from=gateway /app/packages /app/packages
COPY --from=gateway /app/apps/gateway /app/apps/gateway
COPY --from=web /app/apps/web/dist /app/web
RUN mkdir /data && chown node /data
USER node
ENV WEB_DIR=/app/web HISTORY_DB=/data/history.db
VOLUME /data
EXPOSE 8787
WORKDIR /app/apps/gateway
CMD ["node", "src/main.ts"]
