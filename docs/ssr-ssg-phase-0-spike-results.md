# SSR/SSG migration Phase 0 spike results

**Date:** 2026-09-04  
**Outcome:** Pass  
**Decision:** Proceed with TanStack Start for Phase 1, retaining Next.js as the documented fallback.

## Scope

The disposable `apps/web-ssr-spike` workspace app implements the acceptance fixture defined in
Phase 0 of [`spa-to-ssr-ssg-migration-plan.md`](./spa-to-ssr-ssg-migration-plan.md). It does not
replace or modify the current `apps/web` runtime.

The fixture proves:

- typed nested routing at `/world/atlas/locations/:locationId`;
- request-time rendering of protected content after forwarding the incoming session cookie to the
  existing Nest API;
- an authentication redirect before protected content is emitted;
- build-time prerendering of the identity-independent `/` route;
- a client-only Run route beneath a server-authenticated layout;
- same-origin login/logout and a streaming multipart upload through `/api`;
- explicit 401 redirect, 403 proxy preservation, and route-level 404 behavior;
- request IDs, structured request/error logging, server timing, private cache defaults, source maps,
  liveness/readiness checks, graceful shutdown, and restart; and
- a minimal Node production image operating behind nginx.

No domain logic or database access moved into the web process. Nest remains the authentication,
authorization, and mutation boundary.

## Pinned fixture

| Component             |                                                       Version |
| --------------------- | ------------------------------------------------------------: |
| TanStack Start        |                                                    `1.168.49` |
| TanStack React Router |                                                    `1.170.32` |
| Nitro                 |                                             `3.0.260903-beta` |
| Vite                  |                                                       `8.2.2` |
| React / React DOM     |                                                      `19.1.1` |
| Production base       | `node:22-alpine`, matching the repository's existing services |

The package manager lockfile is included in the frozen Docker build. The spike does not use React
Server Components or Static Server Functions.

## Acceptance evidence

The production-output smoke fixture starts a stub of the existing Nest boundary and the built Node
server on ephemeral ports, then exercises direct HTTP requests and an installed headless Chrome
browser.

| Required behavior                     | Result | Evidence                                                                                                                                      |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold direct request and protected SSR | Pass   | Initial HTML contains the API-provided location name and preserves the incoming request ID.                                                   |
| Authentication propagation            | Pass   | The server API adapter forwards the HTTP-only session cookie; an unauthenticated direct request redirects before protected markup is emitted. |
| 401 / 403 / 404 handling              | Pass   | 401 becomes a login redirect, a Nest 403 is preserved through `/api`, and a missing location renders the route's 404 boundary with HTTP 404.  |
| Typed client navigation               | Pass   | Browser navigation between generated routes completes without document-only path parsing.                                                     |
| Client-only operational route         | Pass   | Run-specific DOM markup is absent from server HTML and mounts after hydration in Chrome.                                                      |
| SSG                                   | Pass   | The build emits `.output/public/index.html`; its prerender proof is verified before the server starts.                                        |
| Same-origin mutations and upload      | Pass   | Login/logout cookies traverse the proxy, origin is normalized to the public web origin, and multipart bytes stream intact to Nest.            |
| Assets and hydration                  | Pass   | The emitted stylesheet is served and the tested navigation/mutation sequence produces no browser console errors.                              |
| Operations                            | Pass   | Liveness, API-backed readiness, structured completion logs, source maps, graceful `SIGTERM`, and restart are exercised.                       |
| Production container and proxy        | Pass   | A frozen multi-stage Docker build succeeds, and the built service returns root and health responses through the supplied nginx configuration. |

Commands used for the final verification:

```sh
pnpm --filter @aow/web-ssr-spike typecheck
pnpm --filter @aow/web-ssr-spike smoke
docker build -f apps/web-ssr-spike/Dockerfile -t aow-web-ssr-spike:phase0 .
docker compose -f compose.yaml -f compose.ssr-spike.yaml config --quiet
```

## Baselines

These measurements are regression baselines for this fixture, not framework benchmarks. The API is
an in-process local stub and the browser and direct-request checks share one development machine.

| Measurement                                        |           Result |
| -------------------------------------------------- | ---------------: |
| Protected SSR, first measured request              |          16.4 ms |
| Protected SSR, immediately repeated request        |          10.9 ms |
| `.output/public` disk usage                        |  1,904,640 bytes |
| `.output/server` disk usage, including source maps |  1,150,976 bytes |
| Final Docker image size                            | 58,395,950 bytes |
| Prerendered routes                                 |          1 (`/`) |

## Findings and constraints carried forward

- The route-level `ssr: false` boundary successfully prevents evaluation of Run's browser-only
  component during server rendering while retaining the authenticated parent shell.
- The server API adapter is sufficient for the current cookie contract. It deliberately forwards
  only the cookie, request ID, and content-negotiation headers and never logs cookie values.
- Authenticated responses default to `private, no-store`; only the reviewed public root route is
  prerendered and eligible for public revalidation.
- Nitro's internal prerender preview may probe port 3000 even when Vite preview is configured for a
  different port. When the existing API already owns port 3000, Nitro detects the conflict and
  selects another port; the build still emits the expected page. The isolated Docker build, where
  the port is free, also passes. This is an operational caveat to retest on pinned dependency
  upgrades, not a Phase 0 blocker.
- Start and Nitro remain release-candidate/beta dependencies. Exact pins, frozen builds, the smoke
  fixture, and deliberate upgrades are therefore release requirements.

## Exit decision

The fixture has no remaining blocker in typed routing, SSR correctness, authentication propagation,
selective rendering, or Node/Docker operation. Phase 0 therefore selects **TanStack Start** for the
router and rendering contracts in Phase 1. A duplicate Next.js fixture is not warranted by the
documented exit rule. The selection remains reversible: if a later pinned upgrade breaks these
checks and cannot be resolved within its time box without an undocumented patch, run the same
fixture against Next.js and reconsider the runtime decision.

## Domain-model documentation verification

The spike adds presentation and deployment fixtures only. It changes no domain type, field,
discriminant, relationship, identifier, extension convention, or persisted resource mapping. The
AI-facing domain model guide therefore remained accurate and required no spike-specific update.
