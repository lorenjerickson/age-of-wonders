---
status: point-in-time
role: progress-assessment
date: 2026-09-16
---

# Progress report: documented scope versus implemented code

This is a point-in-time assessment of how much of the documented product has been built, measured
against the active document library as of 2026-09-16. It follows the authority order in
`docs/README.md`: the canonical architecture map, the implemented common types, the AI-facing
domain guide, and the active supporting documents. Where documents conflict, the most recently
created document was favored, which in practice means the two uncommitted documents from
2026-09-13 (`one-to-many-authoring-scope.md`, `campaign-authoring-verification.md`), then the
2026-09-12 rules and isometric records, then the 2026-09-07 recovery records. The five excluded
documents in the exclusion registry were not used as requirements or as evidence of gaps.

Every implementation claim below was checked against source, routes, Prisma migrations, and Git
rather than taken from a status table. Percentages are judgment calls weighted by documented scope,
not measured coverage; they are meant to show relative distance, not precision.

## Headline

Roughly **60% of the total documented scope** is implemented, but that number hides a sharp
split. The **core realignment** (multi-World lineages, Definition/Instance separation, snapshots and
migrations, identity, Sessions, Quick Start, hosted configuration) is about **85% complete** and
has been delivered as coherent vertical slices with real tests and browser verification. The
**game-time layer** the product ultimately exists for—authoritative rules execution, Player-visible
maps, adjudication, combat—is about **30% complete** and is where nearly all remaining risk sits.

| Area                                                       | Estimated completion | Basis                                                                                                   |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Platform foundation (SSR, migrations, media, AI, transfer) | ~90%                 | All implementation records closed; only environment rollouts outstanding                                |
| Core information architecture and workspaces               | ~90%                 | 86 file routes match the canonical route direction almost one-for-one                                   |
| World authoring (Atlas, Bestiary, Item Compendium, Models) | ~70%                 | Heritages, Map layers (lights/sounds/tokens/weather), and dedicated Add/Edit pages missing              |
| Campaign Definition authoring                              | ~80%                 | 67-row browser verification passed; dedicated Plot child pages are in progress and uncommitted          |
| Campaign Instance management                               | ~80%                 | Snapshots, runtime, roster, Agents, migrations, restore, Characters all present                         |
| Players and identity                                       | ~80%                 | Bootstrap, Auth0, profiles, standing, review, import present; no dedicated Player record route          |
| Quick Start                                                | ~80%                 | Server-backed activities and per-GM progress present; plugin activities deferred by decision            |
| Hosted Setup and Settings / System                         | ~45%                 | Twelve-area taxonomy and readiness present; no `/setup` route, plugins, backups, or updates management  |
| Sessions and Run                                           | ~60%                 | Lobby, presence, lifecycle, events, summaries, GM table and movement present; no adjudication           |
| Isometric maps                                             | ~55%                 | Phases 0–2 done, phase 3 partial, phase 4 foundations only, phase 5 not started                         |
| Rules engine                                               | ~40%                 | Runtime contracts, World rule authoring, and movement proof present; no automatic execution             |
| One-to-many authoring UX (newest scope)                    | ~15%                 | P0 Plot slice partially built and uncommitted; P1/P2 not started                                        |
| Combat                                                     | 0%                   | Draft requirements only; intentionally deferred                                                         |
| Graph projection reliability                               | 0%                   | Design only; none of its six phases has landed                                                          |
| Plugins                                                    | 0%                   | Settings taxonomy names the area; no plugin model, catalog, or contracts exist                          |

## Repository state at the time of review

The repository has 55 commits, the last on 2026-09-12. The working tree carries **98 uncommitted
changes** (54 modified files with roughly 4,500 insertions, plus 44 new files) spanning the API,
web app, common types, scripts, and two new docs. The uncommitted work is not incidental: it holds
the recursive Plot collection pages, claims and placement child routes, session movement map
models, terrain generation jobs, a canonical Creature migration, new PostgreSQL specs, and seven
new browser smoke scripts. Both `apps/web` and `apps/api` pass `tsc --noEmit` cleanly in this
state, so the tree is coherent, but none of it is in history yet. Committing it (or at least
committing the verified Campaign authoring work separately from the in-progress Plot slice) is the
single cheapest way to reduce risk right now.

The test suites themselves could not be executed from this review session because the mounted
`node_modules` contain macOS-native binaries (rollup, ts-jest transform resolution); the
verification record from 2026-09-13 reports 261 passing web tests in 39 files and a clean
production build, and the typecheck result above is consistent with that.

Scale for context: about 123,000 lines of TypeScript across the API (261 files), web app (211
files), common package, and UI package; 103 API spec files, 42 web test files, 16 browser smoke
scripts; 63 Prisma models across 21 migrations; 23 HTTP controllers exposing roughly 195 endpoints.

## What is done, by documented area

### Platform foundation

The SPA-to-SSR migration, database-migration adoption, science-and-technology refactor, media
storage, host-transfer archives, and the AI provider integration are all recorded as complete and
the code agrees. The only open item is operational: the science refactor's compatibility reader
stays in place until every environment has completed the apply-and-verify procedure.

### Core information architecture

The route tree in `apps/web/src/routes` reproduces the canonical route direction closely:
`/worlds/:worldId/{atlas,bestiary,item-compendium,characters,rules,versions}`, the six-section
Location frame, `/campaigns/definitions/:id/{plots,placements,preparation,versions}`,
`/campaigns/instances/:id/{roster,roster/agents,sessions,versions,plots,placements,run/:sessionId}`,
`/players`, `/quick-start`, `/settings`, `/join/...`, and `/play/...`. The legacy API surfaces named
in the exclusion registry are gone, and `api-compat/legacy-api-removal.spec.ts` guards against their
return. Home renders Quick Start and a Continue action per active Instance rather than choosing a
record by recency, and the global `/sessions` route now refuses to list Sessions without an
Instance.

### Authoring and management

World lineages with drafts, revisions, snapshots, forks, and archive exist end-to-end. Locations,
Creature Definitions, and Item Definitions have canonical authoring restored after the 2026-09-07
recovery, with AI text proposals for all three plus Location Map image picking, upload, and
generation. The model registry supports open Attribute, Equipment Slot, and Profession Rank
vocabularies with immutable revisions, adoption, dependency validation, and migration plans; the
Schema Structure editor authors Concepts, Fields, and Relationships. Skill, Profession, and
Background libraries exist. Campaign Definition authoring is the most thoroughly verified area in
the codebase: create, overview, recursive Plots, placements (independent and decorated), preparation,
versions, validation, publication, and World-to-Campaign migration with dry run, mappings, and
pagination all have browser evidence. Campaign Instances have snapshots, runtime, checkpoints, Plot
progress, placement realization, roster, invitations with Resend/Twilio adapters, Agents with
observe/act lifecycle, Sessions, migration, and restore with exploration-checkpoint recovery.

### Identity, Quick Start, and hosted configuration

First-admin bootstrap, session auth, Auth0 linking with exact-subject lookup, Player profiles and
standing, the directory, Instance-native Character drafts with GM review and activation, and one-way
import are implemented. Quick Start has versioned server-backed activities (world, campaign,
instance, players, session), strictly per-GM progress, and state-derived step predicates. Settings /
System carries the full twelve-area taxonomy from the architecture with each setting classified as
application-managed, secret-backed, deployment-managed, or observed; installation name, invitation
lifetime, and AI model bind live, and the OpenAI credential supports rotation, revocation, and
value-free history.

### Sessions, maps, and rules

The Session shell has lobby, maintained presence leases, lifecycle recovery, event journal, outbox,
summaries, and a GM-only captured table showing maps, actors, Plot cues, and discoveries. Multiple
paused Sessions coexist with one globally active Session. The isometric slice delivers the shared
terrain core, Location-owned chunk capture, the Three.js GM editor with work planes, selections,
doors/windows, smoothing, PBR materials, and worker-based generation, plus Instance actor setup,
server-side Player binding, 3D sight facts, redacted projections, transactional exploration memory,
and checkpoint recovery. The rules engine has a separate captured event/effect runtime with bounded
execution, deterministic ordering, recorded dice, and idempotent proposals; World → Rules authors
structured triggers, conditions, and ordered effects; and GM point-route movement runs as a
declaration → preview → reviewed approval flow over six explicitly adopted starter rules.

## Major gaps

The gaps are listed by how much they block the documented product, not by size.

**1. The game-time experience is not playable by Players.** This is the largest gap and it is
structural rather than a missing page. The participant Session page deliberately returns
`awaiting-visibility` with no terrain or other actors; the internal `projectAuthorizedTerrain` and
`TerrainExplorationStore` exist but have no public controller and no rules-driven visibility
decision feeding them. Isometric phase 3 (authoritative spatial play) is only partially done via
GM-reviewed movement, and phase 4 (Player experience and visibility) has foundations but no
delivery. Both the isometric design and the rules implementation record name "rules evaluation"
as the next runtime dependency. Until this closes, the product is a GM authoring and preparation
tool with a GM-only table view.

**2. Rules execution is reviewed-only and movement-only.** The runtime satisfies the design's
proof case, but every gameplay event still passes through GM declaration and approval; there is no
automatic execution, no arbitrary event sources, no turn or resource-renewal mechanics, and the
schema query catalog is narrow. The older modifier prototype (`movement-rule-engine.ts`) is still
present and is explicitly not connected to the runtime. Combat has a 600-line draft requirements
document and a `combat.ts` type file that nothing imports; it is deferred by decision, but the
combat requirements assume declaration, ordering, reactions, and adjudication contracts that the
rules runtime does not yet offer.

**3. Run has no encounter or adjudication surface.** The site map's Run experience lists Lobby,
Table, Party, Plot cues, Encounter and adjudication, Event log, and End session. Lobby, Table (GM
overview), Plot cues, event journal, and summary exist. There is no encounter staging or
adjudication panel; "encounter" survives only in the legacy domain resource map and the session
table's read model.

**4. Hosted Setup is missing as a distinct experience.** The architecture requires a `/setup`
checklist route with area deep links, reached before minimum readiness, separate from Settings.
There is no `/setup` route; first-admin bootstrap lives under `/auth/bootstrap` and readiness under
`/settings`. Within Settings, plugins have no model at all (decision register items 1, 28, and
IA-032/IA-056), backup scheduling and restore drills are reported as "not application-managed,"
updates and lifecycle are deployment-managed only, and there is no inbound API client, webhook, or
security-event management. Email and SMS have working provider adapters but no in-UI provider
configuration or test-delivery flow. Decision register items 26, 27, and 29 (configuration
authority, secret storage, activation) remain deferred and are the reason much of this is thin.

**5. World authoring has three documented sub-areas with no authoring surface.** Heritages appear
in the site map, the route direction, IA-044, and the common types (`heritage.ts`), yet the
`$definitionKind` routes explicitly exclude `"heritage"` and the World authoring services do not
reference it. The Location Map's documented layers—walls and doors for image maps, lights and
sounds, tokens and templates, weather and effects—are absent apart from a single `sound` flag; the
terrain editor covers isometric maps only. World-level Creature and Item placements exist, but
the Location Contents view is still an inline form rather than the dedicated experience the newest
scope requires. The Rules navigation group exists with a real editor, but the rule list and editor
share one page.

**6. The newest scope (one-to-many authoring) is mostly ahead of the code.** The 2026-09-13 scope
document audits 33 collections and requires dedicated list/Add/Edit/Delete pages, contextual
navigation frames, and ancestry breadcrumbs across the application. The P0 Plot slice is visibly in
flight in the uncommitted tree: collection routes for objectives, pressures, resistances, and
discoveries, claims and placement child routes, a breadcrumb component, and a collection model with
tests. However, Plot deletion still has no API endpoint, location-contexts and
prerequisite/dependency collections are not yet separate pages, and none of the P1 areas (World
discoveries and placements, Campaign overlays, Profession grants, rule effects, model elements,
schema structure) or P2 areas (Instance records, Players, Settings navigation) have started. The
verification record notes that its 67 rows cover the previous form experience, not this pattern, so
a new verification record is owed once the slice lands.

**7. Graph projection reliability has not started.** The design proposes six phases: correctness
baseline, reindex tooling, transactional outbox and worker, provenance, health metrics, and failure
testing. `graph.service.ts` remains a thin add/remove/query wrapper; there is no job table, no
derived-versus-manual tuple ownership, no rebuild command, and no projection status. The
architecture's Settings → Data & storage area expects "graph/index projection backlog, drift,
rebuild, and reconciliation," which therefore cannot be shown. Because domain and graph writes are
still non-atomic, this is a latent data-integrity issue rather than a missing feature.

**8. Extensibility stops short of the accepted contract.** The open-by-default model registry is
real, but the recommended restricted CEL expression profile (decision 22) is not implemented;
`expressions.ts` defines a narrow scalar/arithmetic subset used by rules. The acceptance criteria
for "add a Likeable Attribute" and "add a Wings Equipment Slot without deploying code" are met for
authoring, validation, and persistence but not demonstrably for AI generation context, graph
relationships, and export/import. Plugin-contributed Quick Start activities (decision 33) are
deferred.

**9. Smaller route and navigation gaps.** No `/players/:playerId` record route (inspection is
inline in the directory); no `/campaigns/instances/:id/characters/:characterId` or
`/agents/:agentId` record routes (both live inside the roster page); no `/quick-start/activities/:key`
routes (activities launch from the checklist into canonical workspaces, which satisfies IA-035 but
not the documented route shape); no `/settings/system/:systemArea` deep links. A `_gm.session-canvas-lab`
route mounting a `SessionCanvasHarness` is still shipped in the GM route tree and should be
confirmed as intentional or removed.

## Documentation conflicts and drift worth fixing

The document library is unusually well governed, but three items have drifted from the code and
would mislead a reader who starts at the repository root.

The root `README.md` still describes the project as "a Docker-first full-stack scaffold for
building AI-enabled products" and documents `/api/domain/:resource`, `/api/graph/tuples`,
`/api/ai/generate`, and `/api/ai/pipelines/content`. All four surfaces were removed in the
realignment, and `legacy-api-removal.spec.ts` asserts that the first two stay removed. The README
is not in the exclusion registry, so nothing warns a reader off it.

`docs/README.md` states the realignment is "implemented after corrective recovery on 2026-09-07;
repair awaiting Gate 2 commit approval." Commits `e026e5c`, `2246dce`, and `7752cdc` from
2026-09-07 landed that work, so the status line is stale by a week and two gate cycles.

The World authoring section of the canonical architecture and the isometric design each carry a
running paragraph of "now implemented / remains pending" statements. They agree with each other
and with the code today, but they are being maintained in three places (architecture map, isometric
design, `docs/README.md` status table) and will diverge under the pace of the last two weeks. Moving
implementation status out of the architecture map into the status index alone would match the
index's own update rules.

## Suggested order of work

Given the split between a strong authoring core and a thin play layer, the sequence that reduces
the most risk first is: commit the current tree in at least two pieces (verified Campaign authoring
and the in-progress Plot slice); finish and verify the P0 Plot slice against the scope document's
eight browser scenarios so the newest requirement has a closed record; then wire the existing
`TerrainExplorationStore` projection to a rules-evaluated visibility decision and expose it through
the participant endpoint, which is the single dependency named by both the isometric and rules
documents and turns the product from GM-only into playable. Setup, plugins, graph reliability, and
combat can follow, in that order, because each is either operational hardening or explicitly
deferred by decision.

## Evidence reviewed

`docs/README.md` (authority index and status table); `docs/information-architecture-domain-model-realignment.md`
(site map, route direction, IA-001 through IA-060, acceptance criteria, decision register);
`docs/one-to-many-authoring-scope.md` and `docs/campaign-authoring-verification.md` (newest,
uncommitted); `docs/rules-engine-implementation.md`, `docs/age-of-wonders-rules-engine-design.md`,
`docs/isometric-maps-design.md` (2026-09-12); the recovery, closure, gate-plan, science, SSR,
database, combat, and graph documents; `apps/web/src/routes` (86 routes); `apps/api/src` controller
and endpoint inventory; `apps/api/prisma/schema.prisma` and its 21 migrations; `packages/common/src`
types and spatial/rules modules; `git log`, `git status`, and `git diff --stat`; `tsc --noEmit` in
`apps/web` and `apps/api`.
