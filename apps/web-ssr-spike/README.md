# TanStack Start Phase 0 spike

This disposable workspace app implements the acceptance fixture from Phase 0 of
`docs/spa-to-ssr-ssg-migration-plan.md`. It does not replace `apps/web`.

## Covered capabilities

- typed nested `/world/atlas/locations/:locationId` routing;
- server-side GM access checks and cookie forwarding to Nest;
- build-time prerendering of `/`;
- a client-only Run route below the authenticated layout;
- same-origin login/logout mutations and streaming multipart upload proxying;
- request IDs, structured request/error logging, source maps, liveness/readiness, and graceful
  Nitro shutdown;
- a production Node container and nginx reverse-proxy overlay; and
- an automated HTTP and headless-Chrome acceptance fixture with cold/warm timings.

TanStack Start, Router, Nitro, Vite, and the browser driver are pinned exactly in `package.json`.
React stays on the version already used by `apps/web`.

## Local verification

```sh
pnpm --filter @aow/web-ssr-spike build
pnpm --filter @aow/web-ssr-spike smoke
```

The build's prerender phase opens a temporary localhost listener. The smoke test opens ephemeral
localhost listeners for a stub Nest boundary and the production Node output, and launches the
installed system Chrome through `playwright-core`.

## Production-shaped Compose verification

```sh
docker compose -f compose.yaml -f compose.ssr-spike.yaml up --build ssr-spike-proxy
```

Then open `http://localhost:8080`. The overlay sets the Nest origin to the reverse-proxy origin only
for this Compose invocation. Requests reach nginx, then the Start server, then its `/api` proxy, and
finally Nest.

Stop it with:

```sh
docker compose -f compose.yaml -f compose.ssr-spike.yaml down
```

## Deliberate limitations

- The fixture uses the existing API and does not move domain logic or database access into Start.
- Authenticated output is private/no-store. Only `/` is eligible for prerendering.
- Start RSC and Static Server Functions are not used because they remain experimental.
- Route IDs appear only in URLs and internal route state; visible fixture labels are names or neutral
  fallbacks.
