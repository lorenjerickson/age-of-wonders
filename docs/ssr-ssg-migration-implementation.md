# TanStack Start SSR/SSG migration implementation

**Implemented:** 2026-09-04  
**Runtime:** TanStack Start `1.168.49`, TanStack Router `1.170.32`, Nitro
`3.0.260903-beta`, Vite `8.2.2`

## Outcome

`apps/web` is now the production TanStack Start application. The Vite SPA entry point, manual
pathname dispatcher, post-hydration authentication gate, nginx `index.html` fallback, and public
browser API origin have been removed. Existing URLs remain available through generated file routes.

The migration keeps `apps/api` authoritative for sessions, authorization, domain behavior,
mutations, media, AI operations, and persistence. The web Node process is a presentation server and
same-origin proxy; it has no database access.

## Rendering map

| Route family                                                     | Audience          | Initial rendering                  | Data behavior                                                                                      |
| ---------------------------------------------------------------- | ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/login`                                                         | Public            | SSG                                | Identity-independent form; login posts through `/api`.                                             |
| `/join`, `/join/instance`, `/join/session`                       | Public invitation | SSG shell plus client exchange     | The fragment token is read, removed, exchanged, and retained only in browser state.                |
| `/`                                                              | GM                | SSR plus hydrated form             | Health and recent World/Campaign read models are present in initial HTML.                          |
| `/worlds`, `/campaigns`, `/players`, `/settings`, `/sessions`    | GM/operator       | SSR                                | Lists and status projections are loaded through server functions with cookie forwarding.           |
| World/Campaign and nested Atlas/Bestiary/Compendium editors      | GM                | Server-authenticated client island | Browser-heavy editors are code-split and excluded from server rendering.                           |
| `/session-canvas-lab`                                            | GM                | Server-authenticated client island | Canvas DOM, event, geometry, and focus code is never evaluated for server HTML.                    |
| `/play`, `/play/instances/:instanceId/characters{/:characterId}` | Player            | Server-authenticated client island | Character workflows are explicitly Instance-scoped and retain their interactive client data model. |

Opaque identifiers remain confined to URL parameters and request state. Server-rendered labels use
API-provided names or neutral human-readable fallbacks.

## Request and security boundaries

The `_gm` and `_player` pathless layouts call Nest before rendering their children. A missing or
wrong-role session redirects before protected page content is emitted. Nest still performs endpoint
authorization; the layout gate is a presentation and disclosure boundary, not a replacement for API
authorization.

Browser requests use relative `/api`. The streaming Start proxy:

- preserves HTTP methods, request bodies, multipart streams, status codes, and `Set-Cookie`;
- removes hop-by-hop headers;
- rewrites the Origin header of unsafe requests to `PUBLIC_WEB_ORIGIN`; and
- supplies forwarded host/protocol metadata.

Server read-model functions use `API_INTERNAL_URL`, copy only the incoming session cookie and
request ID, request `no-store`, and map 401/404 outcomes into route behavior. Cookie values are never
logged.

All non-public page responses default to `Cache-Control: private, no-store`. Only the four reviewed,
identity-independent entry routes are emitted as static HTML. Request middleware adds or preserves a
request ID, emits `Server-Timing`, and writes structured completion/error events.

## Deployment

The web Dockerfile now creates a minimal Node production image containing `.output`; nginx is no
longer the application runtime. The container exposes port 5173 and provides a `/healthz` Docker
health check. `/healthz?ready=1` additionally checks the Nest health endpoint.

Docker Compose runs the Start development server and configures the internal API origin. A
deployment reverse proxy or ingress should forward all web paths—including `/api`—to the web Node
process, set forwarded host/protocol/request-ID headers, and allow the upload/time-out limits needed
by the existing media and AI operations.

Nitro's current beta preview plugin changes Start's ephemeral prerender port to port 3000. A small
Vite configuration plugin applies only while `TSS_PRERENDERING=true` and assigns port 3103, keeping
SSG builds isolated from the local Nest process. No dependency source is patched. This guard should
be removed when the pinned Nitro integration no longer needs it.

## Verification

The production-output acceptance fixture uses a local Nest contract stub and headless Chrome. It
verifies:

- three generated static pages;
- authentication redirect before private markup;
- same-origin login and `Set-Cookie` relay;
- protected SSR home and detail read models;
- route-level 404 behavior;
- typed client navigation without document reload;
- absence of session-canvas markup in server HTML and successful client mounting;
- private caching, structured logging, source maps, clean hydration, and graceful shutdown.

Run the complete checks with:

```sh
pnpm --filter @aow/web lint
pnpm --filter @aow/web typecheck
pnpm --filter @aow/web test
pnpm --filter @aow/web build
pnpm --filter @aow/web smoke:ssr
docker build -f apps/web/Dockerfile -t aow-web:tanstack-start .
docker compose config --quiet
```

## Domain-model documentation verification

This migration changes presentation, routing, data-loading, and deployment boundaries only. It does
not add, remove, rename, or change the semantics of any domain type, field, relationship,
identifier, extension convention, or persisted resource mapping. The AI-facing domain model guide
therefore remained accurate and required no migration-specific update.
