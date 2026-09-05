FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY . .
EXPOSE 5173

FROM base AS build
COPY . .
RUN pnpm --filter @aow/web... build

FROM node:22-alpine AS production
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=5173
WORKDIR /app
COPY --from=build /workspace/apps/web/.output ./.output
EXPOSE 5173
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5173/healthz || exit 1
CMD ["node", ".output/server/index.mjs"]
