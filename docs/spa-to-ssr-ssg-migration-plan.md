---
name: spa-to-ssr-ssg-migration-plan
description: Proposed migration from the Vite SPA to path-based server and static rendering
status: deprecated-excluded
date: 2026-09-03
superseded-by: docs/ssr-ssg-migration-implementation.md
exclude-from-analysis-and-generation: true
---

# SPA to SSR/SSG migration plan

> **Deprecated and excluded.** The production migration is complete. Do not use this proposal or
> its transitional route/API examples for current analysis or generation. Use
> `ssr-ssg-migration-implementation.md`.

## Decision summary

Adopt a full-stack React router for the web process while retaining NestJS as the authoritative API
and business-logic boundary. The target should render each route according to its data and
interaction needs rather than forcing the whole application into one rendering mode:

- request-time SSR for authenticated, mutable browse and detail routes;
- prerendering/SSG only for content that is public and independent of a user's identity;
- a server-rendered shell with client islands for editors; and
- client-only rendering for the live session canvas and other DOM-intensive surfaces until they are
  made hydration-safe.

**Decision:** use **TanStack Start**. The Phase 0 gate passed and the production migration is
documented in
[`ssr-ssg-migration-implementation.md`](./ssr-ssg-migration-implementation.md). It fits the current
Vite-based, client-heavy React application and the proposed deeply
nested route model particularly well: routes, parameters, search state, loaders, and links form one
typed contract, and SSR can be reduced to `data-only` or disabled at a route boundary. Those are
more valuable to this MVP than React Server Components or broad static-regeneration features.

**Fallback:** use the Next.js App Router if the spike does not prove TanStack Start's pinned release,
Node/Docker output, request middleware, and selective SSR reliable in this repository. Next.js
supports every MVP function, and is stronger where React Server Components, mature self-hosting,
or incremental static regeneration are decisive. Its cost here is a larger conceptual and build
tool migration for components that are currently ordinary Vite client components.

This is a suitability decision, not an assessment of adoption, ecosystem size, hiring, or mind-share.
Framework release maturity is included only where it directly affects the ability to ship and
operate this MVP. As of this document's date, TanStack's own documentation labels Start a
feature-complete release candidate with a stable API, while its Nitro/Vite hosting integration is
still described as under active development.

## Relationship to the information architecture

The target route hierarchy is the one proposed in
[`information-architecture-domain-model-realignment.md`](./information-architecture-domain-model-realignment.md),
including separate shells for Setup, World authoring, Campaign Definition authoring, Campaign
Instance management, Run, and player/spectator projections. This plan does not reopen the domain or
navigation decisions in that proposal. It provides the rendering and routing migration needed to
implement them.

The routing migration should precede most of the domain realignment. The new router can first host
the current route shapes and existing components, then introduce canonical routes as their backing
domain concepts become available. That avoids coupling a framework replacement to the Campaign
Definition/Instance data migration.

## Current-state findings

The current web application is a React 19 SPA built by Vite and served as static files by nginx.
nginx falls back every unknown path to `index.html`. There is no routing library: `App.tsx` splits
`window.location.pathname` and selects a component through ordered conditionals. Navigation uses
ordinary anchors and `window.location.assign`/`replace`, so most transitions reload the document.

All application data is fetched after mount from the NestJS API. Authentication is also checked in
a client effect, which means protected routes initially render a loading state and can only redirect
after JavaScript runs. The API already owns authentication and authorization, uses an HTTP-only
session cookie, and performs origin checks for unsafe cookie-authenticated requests. That boundary
should remain authoritative.

Several characteristics materially affect the migration:

- `App.tsx` currently selects the most recently updated World and Campaign for navigation and `/`.
  The proposed information architecture explicitly removes that behavior in favor of Home and
  deliberate context selection.
- World, creature, item, and campaign screens are large interactive components with data loading,
  local draft state, and direct browser API use. They should initially migrate as client islands,
  not be rewritten wholesale as server components.
- `SessionCanvasHarness.tsx` and parts of the map editors use keyboard listeners, body/document
  mutation, geometry, confirmation dialogs, and focus management. The canvas is an explicit
  client-only route for the MVP.
- The invitation flow reads a token from `window.location.hash`. URL fragments are never sent to a
  server, so that step cannot be server-resolved. The flow must either retain a tiny client exchange
  boundary or adopt a single-use path/query token that is exchanged and immediately removed from
  browser history.
- The client currently compiles an API origin through `VITE_API_URL`. SSR adds server-to-server
  requests, which must forward the incoming session cookie explicitly. A same-origin `/api` route
  is preferable for both browser and server traffic.
- The repository is a pnpm workspace and already packages shared domain types and UI components.
  Neither should be moved into the web framework's server layer.

## MVP rendering policy

Rendering mode is a route-level security and freshness decision. It must not be inferred merely
from whether a framework is capable of prerendering a route.

| Route class                                          | MVP rendering                                       | Cache rule                                                         | Examples                                                        |
| ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Public, identity-independent, version-pinned content | SSG/prerender                                       | Public, immutable per version                                      | Future published rules/reference pages; static product guidance |
| Public but request-specific                          | SSR                                                 | No shared cache unless the response is proven identity-independent | Invitation resolution, authentication entry/error states        |
| Authenticated browse/detail                          | SSR plus hydration where needed                     | `private` or `no-store`; request memoization is allowed            | Home, World/Campaign/Player lists, overviews, session records   |
| Authenticated editor                                 | SSR shell and initial read model plus client island | Private; invalidate after mutation                                 | Location, creature, item, Plot, roster, and character editors   |
| Operational live surface                             | Client-only route inside an SSR-safe document shell | No shared page cache                                               | Session lobby/table/canvas and DOM-intensive map interaction    |
| Setup/readiness                                      | SSR                                                 | No shared cache                                                    | `/setup`, `/settings/system`, health and capability checks      |

Do not statically generate authenticated World, Campaign, Player, or Session HTML. A build artifact
or shared cache containing one GM's projection would be a data leak. Static generation is not an
MVP goal by itself; it is used only when the route's ownership and freshness rules make it safe.

## MVP capability comparison

Ratings mean **strong** (direct, production-suitable support), **adequate** (supports the function
with an explicit pattern or modest adapter), or **conditional** (support exists but requires a spike,
an experimental feature, or a material workaround). They evaluate the proposed application rather
than the frameworks in the abstract.

| MVP function and acceptance test                                                                                                                                                              | Next.js App Router                                                                                                                                                                                              | TanStack Start                                                                                                                                                                                     | Project-specific assessment                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical nested paths and workspace shells.** Every proposed URL has a route-owned layout, parameters, loading/error UI, and a stable deep link.                                           | **Strong.** Folder segments, nested layouts, route groups, dynamic segments, and special loading/error/not-found files map cleanly to the site map.                                                             | **Strong.** File routes, pathless layouts, generated route tree, nested error/pending boundaries, and dynamic segments map cleanly to the site map.                                                | Tie on rendering structure. Start is stronger as an application contract because route params, validated search state, links, and navigation are inferred together.         |
| **Server-first access control.** An unauthenticated request to a protected URL redirects before protected UI/data is emitted; every API operation remains independently authorized.           | **Strong.** Request cookies, server rendering, redirects, and a server-only data-access layer are first-class. Auth must still be checked near each data access/action, not only in a layout or proxy.          | **Strong.** Request middleware plus `beforeLoad` gives a server-side route gate; server functions/routes support their own authorization middleware. The Nest endpoint remains the final boundary. | Both remove the current client-side auth flash. Both require an adapter that forwards the incoming cookie to Nest.                                                          |
| **SSR for private mutable read models.** A direct request returns meaningful HTML using the current user's Nest projection.                                                                   | **Strong.** Server Components fetch on the server by default and can stream uncached data.                                                                                                                      | **Strong.** Route `beforeLoad`/loaders and full-document SSR run on the server for the initial request and hydrate loader data.                                                                    | Start matches the existing component/data model more closely. Next provides a larger benefit only after components are split deliberately across server/client boundaries.  |
| **Incremental adoption of the current SPA.** Existing screens can be placed behind real routes before each screen is made SSR-safe.                                                           | **Adequate.** Existing screens can be Client Components, but the build moves from Vite to Next and imported descendants join the client module graph. Browser-only modules require carefully placed boundaries. | **Strong.** It keeps Vite, ordinary React components, and supports `ssr: false` or `ssr: 'data-only'` at route boundaries.                                                                         | This is the largest delivery advantage for Start. It enables a router-first cutover with behavior-preserving client routes.                                                 |
| **Browser-heavy Run/canvas isolation.** The canvas loads without server evaluation of DOM-dependent code while its parent document and access gate remain server-safe.                        | **Adequate.** Use a Client Component and, where needed, a client-only dynamic import. The page/layout can still SSR its shell and auth state.                                                                   | **Strong.** Selective SSR directly supports full SSR, data-only SSR, or no SSR per route, with pending fallback rendering.                                                                         | Start expresses the required exception at the route level and reduces accidental server evaluation during migration.                                                        |
| **SSR/SSG selection by route.** Public pages can be built ahead of time while authenticated pages remain dynamic.                                                                             | **Strong.** Static rendering, `generateStaticParams`, dynamic rendering, and Node-hosted ISR are built in.                                                                                                      | **Strong for build-time prerendering; conditional for advanced static data.** Explicit pages, route discovery, and link crawling are supported. Static Server Functions are experimental.          | Next is stronger if runtime regeneration becomes an MVP requirement. It is not currently required; authored application records remain private/dynamic.                     |
| **Forms and mutations with progressive enhancement.** Login and basic create/update flows can submit without depending on a client-side route dispatcher, then show field errors or redirect. | **Strong.** Server Functions/Actions integrate with forms, pending state, cookies, redirects, and revalidation.                                                                                                 | **Strong.** Server functions support form actions/progressive enhancement, validation middleware, redirects, and typed calls.                                                                      | Initially keep mutations in Nest and post through same-origin `/api`; adopting either framework's mutation RPC too early would duplicate the API boundary.                  |
| **Data refresh after mutation.** A saved record updates the current view and affected navigation without serving another user's data.                                                         | **Strong but policy-sensitive.** Revalidation and cache tags are powerful; authenticated content requires conservative cache configuration.                                                                     | **Strong.** Route loaders expose explicit invalidation/reload behavior and may integrate with TanStack Query where client cache needs justify it.                                                  | Start's explicit route-data model is easier to layer over the current API. The MVP should begin with private/no-store server reads and add caching only from measured need. |
| **Typed path, parameter, and URL state.** Changing a canonical route produces compile-time failures in links and navigation; filters/tabs are validated.                                      | **Adequate.** Route-aware types infer page/layout params and named slots, but search parameters and application links are not one end-to-end validated router schema.                                           | **Strong.** File-route generation and Router inference cover params, links, navigation, loader data, and validated search parameters.                                                              | Start better supports the proposed path-heavy hierarchy and reliable Quick Start launch/return context.                                                                     |
| **Streaming, pending, error, redirect, and not-found behavior.** Slow API reads do not blank the shell and each workspace has a useful failure boundary.                                      | **Strong.** Suspense, `loading`, `error`, `not-found`, and redirect conventions are integrated with server rendering.                                                                                           | **Strong.** Pending/error/not-found route components, deferred data, redirects, and streamed SSR are integrated with loaders.                                                                      | No meaningful MVP difference. Define application-level semantics and test them in either framework.                                                                         |
| **Metadata and share previews.** Public routes can derive title, description, canonical URL, and Open Graph metadata from route data.                                                         | **Strong.** Static/dynamic metadata and generated OG assets are first-class server APIs.                                                                                                                        | **Strong.** Route `head` derives metadata from loader data; SSR and prerendering emit it in the document.                                                                                          | Both meet the MVP. Never expose GM-only names or content through public metadata.                                                                                           |
| **Existing Nest API, uploads, AI operations, and external clients.** The migration does not fork business logic or break non-web API consumers.                                               | **Strong with an adapter.** Server Components/actions can call Nest; Route Handlers can proxy same-origin browser traffic.                                                                                      | **Strong with an adapter.** Loaders/server functions can call Nest; server routes or deployment proxying can keep `/api` same-origin.                                                              | Tie. Keep Nest authoritative. Do not convert controllers into framework actions during this migration.                                                                      |
| **Self-hosted Node/Docker operation.** One repeatable image serves dynamic HTML/assets behind a reverse proxy and calls the existing API service.                                             | **Strong.** Official self-hosting guidance covers Node, Docker, reverse proxies, runtime environment variables, and multi-instance cache concerns.                                                              | **Conditional.** Official Node/Docker output is available through Nitro, but the Vite/Nitro integration is documented as actively developing.                                                      | Next has the safer runtime story. Start must pass the Phase 0 container, shutdown, proxy-header, asset, and health checks with exact dependency pins.                       |
| **Framework/API maturity needed for MVP stability.** Routine upgrades do not unpredictably change routing, SSR, or deployment behavior.                                                       | **Strong.** Required App Router capabilities are documented as normal production features.                                                                                                                      | **Conditional.** Start is officially a feature-complete RC with an API described as stable, not yet a final v1 release. RSC and Static Server Functions remain experimental.                       | Do not use Start RSC or Static Server Functions in the MVP. Pin exact Start/Router/Nitro versions and upgrade intentionally.                                                |
| **Preserve current tests and Vite-oriented tooling.** Model/unit tests remain fast while route behavior gains integration coverage.                                                           | **Adequate.** Vitest can remain for pure modules, but framework mocking/build conventions and the application bundler change.                                                                                   | **Strong.** The Vite/Vitest base remains; generated route types and SSR tests are added around it.                                                                                                 | Start has lower test migration cost. Both need browser-level route, hydration, and access-control coverage.                                                                 |

### Why TanStack Start is the recommended fit

The proposed application is an authenticated authoring and operational tool with rich client-side
interaction, not primarily a public content site. Its most important MVP problems are replacing a
hand-written path switch, preserving deeply nested context, rendering private read models before
hydration, and exempting a browser-heavy canvas from SSR. Start addresses those problems directly
while allowing the existing Vite components to migrate route by route.

Next.js would be the preferred choice if the MVP instead required extensive runtime ISR, made React
Server Components a near-term architectural goal, or could not accept an RC/Nitro deployment
dependency. None is currently true. Choosing Start must therefore be treated as a tested,
reversible decision rather than an assumption.

## Target architecture

```text
browser
  |
  | same-origin HTML, assets, and /api requests
  v
reverse proxy
  |-- web Node process (TanStack Start)
  |     |-- file router and workspace layouts
  |     |-- SSR loaders / request middleware
  |     |-- static assets and prerendered public pages
  |     `-- server-side API adapter (forwards Cookie and request ID)
  |
  `-- NestJS /api
        |-- authentication and authorization
        |-- domain/application services
        |-- PostgreSQL
        `-- object storage and external integrations
```

The web process is a presentation server, not a second application backend. It may compose route
read models, issue redirects, and proxy same-origin traffic, but authorization and domain mutations
remain in Nest. Shared types describe API contracts; they must not invite direct database access
from route loaders.

### Required boundaries

1. **Browser API client:** uses relative `/api` URLs and includes credentials. It is safe to import
   only from client code.
2. **Server API client:** accepts the incoming `Request`, copies only approved headers (`cookie`,
   correlation/request ID, and content negotiation), calls the internal API origin, and maps 401,
   403, and 404 into route outcomes. It never logs cookie values.
3. **Route read-model functions:** validate route/search parameters, call the server client, and
   return the minimum human-readable projection required by the page.
4. **Client islands:** receive serializable initial data and own local interaction. They do not
   infer authorization from rendered controls.
5. **Render policy:** is explicit on every route family. Authenticated responses default to
   `Cache-Control: private, no-store` until a narrower safe policy is demonstrated.

The user-facing application must continue to follow the repository rule that opaque internal IDs
may appear in URLs but never as visible labels, errors, or empty states. SSR loaders must resolve
names before rendering and use neutral fallbacks when resolution fails.

## Migration plan

### Phase 0 — time-boxed framework and deployment spike

Create a disposable branch/prototype using the exact Node version and workspace layout. Implement:

- a nested `/world/atlas/locations/:locationId` route with typed parameters;
- a protected server-rendered page that forwards the current session cookie to Nest and redirects
  before emitting protected content;
- one prerendered public page;
- a client-only `/campaigns/instances/:campaignInstanceId/run/:sessionId` placeholder;
- a same-origin mutation and multipart upload through `/api`;
- a production Docker image behind the intended reverse proxy; and
- request IDs, error logging, source maps, graceful shutdown, and a health check.

Pin exact TanStack Start, Router, and Nitro versions. The spike passes only if a cold direct request,
client navigation, refresh on every route type, cookie login/logout, 401/403/404 mapping, static
asset serving, and production container restart all work without undocumented patches. Record build
size and cold/warm response timings as baselines, not competitive benchmarks.

**Exit:** proceed with Start if all checks pass. If any blocker remains in routing, SSR correctness,
auth propagation, or Node/Docker operation after the time box, repeat the same acceptance fixture in
Next.js and adopt Next. Do not let the spike grow into production implementation.

**Completed 2026-09-04:** the pinned TanStack Start fixture passed the Phase 0 acceptance gate. The
measured evidence, operational caveat, and decision to proceed are recorded in
[`ssr-ssg-phase-0-spike-results.md`](./ssr-ssg-phase-0-spike-results.md).

### Phase 1 — establish route and rendering contracts

Before changing the runtime, create a route manifest that maps current URLs to proposed canonical
URLs, route audience, owning shell, rendering mode, data dependency, and legacy redirect. Add
contract tests for the current public invitation, player, GM, and lab classifications so behavior is
not lost during the router cutover.

Define the target route tree from the information-architecture proposal, but implement only routes
whose backing concepts exist. Reserve future paths with useful not-found/unavailable states rather
than fabricating records. Keep domain migration separately sequenced.

Capture baselines for direct-load HTML, time to useful content, hydrated interaction, client bundle
size, and API request count on one browse route, one editor, and the session canvas.

### Phase 2 — router-first runtime cutover

Replace the Vite SPA entry and manual `App.tsx` dispatch with TanStack Start and generated file
routes. Initially import existing screens behind route components with SSR disabled where necessary.
This phase changes route ownership and deployment, not screen behavior.

Create pathless/nested layouts for public/auth, GM authoring, player, and Run surfaces. Replace raw
anchors and `window.location` calls with typed links/navigation except where a deliberate full
document navigation is required. Route parameters and validated search parameters replace manual
segment parsing. Provide root and workspace-specific pending, error, forbidden, and not-found UI.

Switch production from nginx-only static hosting to the Node SSR output, with a reverse proxy in
front. Keep a rollback image for the SPA and do not remove the legacy route classifier until route
parity tests pass.

### Phase 3 — same-origin API and server authentication

Make `/api` the browser-visible API base in every environment. Route it to Nest at the reverse proxy
or server-route layer and remove build-time public API origins from browser code. Introduce the
server API adapter for SSR calls and explicitly forward the HTTP-only session cookie.

Move audience gating from `AuthenticatedRoute` effects into server request/route middleware, but
continue to enforce authorization in every Nest endpoint. Load the minimum current-user projection
once per request and make it available to the owning route tree. Verify that prefetch requests cannot
leak protected data and that authenticated responses never enter a public cache.

For invitations, choose and document one of two explicit contracts:

- retain the fragment token and render only the token-exchange widget on the client; or
- preferably, use a single-use query/path token, exchange it immediately over POST, then redirect to
  a clean URL with `replace` semantics.

Never render invitation tokens into logs, error pages, metadata, or serialized loader data.

### Phase 4 — migrate server-renderable reads in waves

Migrate low-interaction routes first: Home/chooser, lists, overview/detail pages, session history,
and setup/readiness. Their loaders return route-specific read models, and the initial response must
contain useful headings, names, navigation, and states without waiting for client effects.

Then migrate editors. Fetch their initial record and selection data on the server and pass a
serializable snapshot to a client island. Keep existing save functions initially, then add router
invalidation after successful mutations. Split large components only when doing so creates a clear
server/client boundary or reduces an observed performance cost.

Keep the Run/session canvas client-only. SSR its access decision, document shell, human-readable
campaign/session context, and loading fallback; load the operational surface in the browser. Move
individual read-only panels to SSR later only if profiling shows value and hydration remains safe.

Each wave must pass direct URL load, browser navigation, back/forward, refresh, deep-link,
unauthorized, not-found, save/conflict, and hydration-console tests before the next wave starts.

### Phase 5 — canonical IA routes and legacy redirects

As the backing domain model is implemented, introduce `/world/...`, Campaign Definition,
Campaign Instance, nested Session, `/run`, `/players`, `/me`, `/setup`, `/quick-start`, and Settings
routes. Do not independently choose a latest record. Route loaders validate ownership relationships
so, for example, a Session URL cannot render under the wrong Campaign Instance.

Redirect old resource paths only when the destination can be resolved unambiguously. Use temporary
redirects during rollout, then permanent redirects after telemetry shows no incorrect mapping. If a
legacy `campaignId` cannot be classified as Definition or Instance, render a human-readable
reselection/remediation page rather than guessing or exposing the identifier.

Quick Start guide and return context should use validated URL search state or persisted per-GM
progress. It is navigation state, never proof of authority. The canonical target route repeats its
normal access check on every request.

### Phase 6 — add safe SSG and deliberate caching

Inventory public content before enabling prerendering. For every candidate, record its audience,
source revision, invalidation event, build-time availability, and whether any request header/cookie
can change the output. Only identity-independent candidates pass.

Prerender stable route shells and public version-pinned reference content. Generate explicit paths
from published identifiers rather than relying solely on link crawling. A changed published revision
gets a new immutable URL or triggers a controlled rebuild; private drafts never participate.

Start authenticated SSR with private/no-store responses. Add short-lived private browser caching or
route-loader caching only after mutation invalidation tests exist. Do not add shared full-page caches
to private routes. If future requirements call for high-volume public content with on-demand
regeneration, revisit the framework decision because this is a material strength of Next.js.

### Phase 7 — remove the SPA compatibility layer

After all supported routes are owned by the new router, remove manual pathname parsing, the
`AuthenticatedRoute` client gate, absolute `VITE_API_URL` browser configuration, SPA fallback
nginx configuration, and obsolete navigation helpers. Keep redirects for published legacy URLs for
the agreed compatibility period.

Update runbooks, Docker/Compose configuration, health checks, deployment smoke tests, and rollback
instructions. Re-measure the Phase 1 routes and accept the migration only if SSR improved useful
first response without regressing editor or canvas interaction beyond the agreed budget.

## Verification strategy

### Automated gates

- Unit tests for route parameter/search validators, route-to-audience policy, API error mapping, and
  render-policy classification.
- Integration tests that render direct HTTP requests with no cookie, GM, player, spectator, expired
  invitation, missing record, and wrong-parent record contexts.
- Browser tests for direct load and client navigation across every workspace shell, including
  back/forward scroll restoration and mobile navigation hierarchy.
- Security tests proving protected data is absent from unauthenticated HTML, serialized hydration
  data, metadata, caches, and logs.
- Hydration tests with console errors treated as failures, especially around dates, random values,
  responsive markup, portals, and browser-only modules.
- Production-image smoke tests for assets, `/api` proxying, uploads, redirects, graceful restart,
  and deep links.

### MVP acceptance criteria

1. Every implemented canonical route is directly loadable and has one declared owner, audience,
   shell, and rendering mode.
2. Protected direct requests authenticate and authorize before emitting route data or protected UI.
3. Server-renderable browse/detail routes return meaningful record names and state in the initial
   HTML without opaque IDs in visible content.
4. Editors hydrate without warnings and retain all current create, update, conflict, upload, and AI
   operations.
5. The live canvas remains fully interactive and is never evaluated in a DOM-less server context.
6. Refresh, typed navigation, validated Quick Start context, errors, and not-found states work at
   each nesting level.
7. Only reviewed identity-independent routes are emitted as static HTML or publicly cached.
8. The production Node/Docker service passes cold start, health, shutdown, proxy, cookie, and asset
   tests and has a rehearsed rollback to the previous web image.

## Risks and mitigations

| Risk                                                                          | Mitigation                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TanStack Start or Nitro RC defect affects production                          | Phase 0 gate, exact version pins, no experimental RSC/static-server-function use, production-image tests, and Next.js fallback      |
| SSR leaks private data through shared caching or serialized state             | Private/no-store default, minimum read models, cache-policy tests, and authorization in Nest at every endpoint                      |
| Existing components access `window`/`document` during server import or render | Start with `ssr: false`, audit module-scope access, then introduce SSR boundaries incrementally                                     |
| Hydration changes editor state or causes duplicate API calls                  | Server-provided serializable initial snapshots, deterministic markup, Strict Mode tests, and one route-data owner                   |
| Web server becomes a competing backend                                        | Architecture rule: no direct database/domain writes from routes; Nest remains authoritative and serves non-web clients              |
| Framework migration becomes coupled to domain migration                       | Router-first compatibility routes; canonical IA routes land only as their domain ownership is implemented                           |
| Build-time SSG captures mutable or user-specific data                         | Explicit public-content inventory and build gate; never prerender authenticated records                                             |
| Invitation secret is unavailable to SSR or leaks after changing URL form      | Deliberate client fragment exchange or single-use server-visible token followed by immediate clean redirect; secret redaction tests |

## Decision checkpoints

- **After Phase 0:** confirm Start or switch to Next.js based only on the acceptance fixture.
- **After Phase 2:** confirm routing/deployment parity before any server-rendering refactor.
- **After Phase 4:** confirm SSR value with measured first-response and interaction results.
- **Before Phase 6:** approve the public-content inventory and cache policy route by route.
- **Before removing rollback:** complete a production-like restore rehearsal and legacy URL report.

## Official framework references

The comparison reflects official documentation available on 2026-09-03:

### Next.js

- [App Router](https://nextjs.org/docs/app)
- [Layouts and pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Fetching data and streaming](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Authentication and authorization](https://nextjs.org/docs/app/guides/authentication)
- [`generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
- [Incremental static regeneration](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

### TanStack Start and Router

- [Start overview and release status](https://tanstack.com/start/latest/docs/framework/react/overview)
- [Routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing)
- [Selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)
- [Static prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)
- [Server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [Middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)
- [Node/Docker hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [Router type safety](https://tanstack.com/router/latest/docs/guide/type-safety)
- [Authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes)

## Domain-model documentation verification

This plan changes no domain type, field, discriminant, relationship, identifier, extension
convention, or persisted resource mapping. `apps/api/src/ai/prompts/domain-model.md` therefore
remains accurate for the current implementation and was not changed. Any later implementation of
the canonical IA routes must update that guide in the same change as the corresponding source types
and `apps/api/src/domain/domain-resource.ts` when domain semantics change.
