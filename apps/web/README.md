# Age of Wonders web application

The production web runtime uses TanStack Start with generated file routing, request-time SSR,
build-time prerendering, and explicit client-only route boundaries. Nest remains the API and
authorization boundary.

## Rendering policy

- `/login`, `/join`, and `/join/campaign` are prerendered. Invitation token exchange remains a
  browser-only effect because URL fragments are not sent to the server.
- GM home, resource lists, sessions, and simple resource details load their initial read models on
  the server. Their responses are `private, no-store`.
- World, Campaign, Creature, Item, character-creation, and session-canvas editors are route-split
  client islands below server-side audience gates.
- The browser calls relative `/api` URLs. The Start server streams those requests to Nest and
  forwards only the incoming cookie and request ID for server-side reads.

## Commands

```sh
pnpm --filter @aow/web dev
pnpm --filter @aow/web test
pnpm --filter @aow/web build
pnpm --filter @aow/web smoke:ssr
```

The production server starts with:

```sh
API_INTERNAL_URL=http://api:3000/api \
PUBLIC_WEB_ORIGIN=https://example.test \
HOST=0.0.0.0 PORT=5173 \
node .output/server/index.mjs
```

`PUBLIC_WEB_ORIGIN` must be the browser-visible origin accepted by Nest for unsafe
cookie-authenticated requests. `API_INTERNAL_URL` is server-only and must never be compiled into
browser code.
