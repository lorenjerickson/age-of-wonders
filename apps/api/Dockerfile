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
RUN pnpm --filter @aow/api db:generate
EXPOSE 3000 9229

FROM base AS build
COPY . .
RUN pnpm --filter @aow/api db:generate && pnpm --filter @aow/api... build

FROM node:22-alpine AS production
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/packages/common ./packages/common
COPY --from=build /workspace/prompts ./prompts
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @aow/api db:deploy && pnpm --filter @aow/api start"]
