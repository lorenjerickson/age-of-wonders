FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @aow/web-ssr-spike build

FROM node:22-alpine AS production
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=build /workspace/apps/web-ssr-spike/.output ./.output
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/healthz || exit 1
CMD ["node", ".output/server/index.mjs"]
