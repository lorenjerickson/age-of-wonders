---
name: project-state-gap-analysis-2026-08-31
description: Deprecated pre-realignment repository assessment retained only for historical archaeology
status: deprecated
deprecated-on: 2026-09-06
superseded-by: docs/information-architecture-domain-model-realignment.md
exclude-from-analysis-and-generation: true
---

# Age of Wonders project-state and MVP gap analysis

> **DEPRECATED — EXCLUDED FROM FUTURE ANALYSIS AND GENERATION.** This point-in-time assessment was
> superseded by the adopted information architecture and the subsequent World, Campaign Definition,
> Campaign Instance, and Session implementations. Its readiness scores and recommended priorities
> are no longer current. Read it only for explicitly requested historical analysis or migration
> archaeology.

**Assessment date:** 2026-08-31  
**Scope:** Current `main` checkout, including uncommitted work; repository documentation; source-of-truth domain types; test/build evidence; and recent product conversations in this workspace.  
**Purpose:** Assess completeness, correctness, and robustness, then define a phased path to a coherent MVP without inventing requirements unsupported by the existing product direction.

## Executive assessment

Age of Wonders has a meaningful, working foundation for AI-assisted world authoring and a visually substantial GM location workspace. The current checkout builds cleanly, its existing automated tests pass, and several difficult supporting capabilities—media storage, selective host transfer, science-domain migration, optimistic revisions, and graph projection—already exist.

It is not yet a complete or robust MVP. The main reason is not unfinished visual polish. The project currently spans three product generations that have not been reconciled:

1. the committed campaign document describes reusable campaign definitions and session-owned mutable play state;
2. the newest product direction replaces that with one persistent world, one persistent campaign, multiple session journals, and a unified design/play location workspace; and
3. the newer combat requirements introduce private player plans, controllers, durable active-round state, GM adjudication, and atomic publication.

The current working tree substantially implements the second direction, while `docs/campaign-design.md` still describes the first and the combat system remains almost entirely at the requirements stage. This leaves the product's ownership, permission, and persistence boundaries only partly defined.

### Readiness scores

These scores are prioritization aids, not mathematical proof.

| Dimension             |  Score | Assessment                                                                                                                                                               |
| --------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completeness          | 52/100 | Strong authoring foundation; incomplete session, object, currency, player, and combat workflows.                                                                         |
| Correctness           | 58/100 | Current tests pass, but authoritative JSON accepts malformed domain data and several multi-record operations can partially commit.                                       |
| Robustness            | 35/100 | Suitable for a trusted local-development prototype; blocked for a networked or multi-user MVP by missing auth, migrations, recovery guarantees, and end-to-end evidence. |
| Overall MVP readiness | 46/100 | **Blocked** for external or multi-user use; **usable as a local GM-facing prototype** with known data-integrity and workflow limitations.                                |

The overall score is capped below 50 for a networked release because sensitive write/read routes have no authentication or authorization and because no production-safe relational migration/rollback path exists.

## Evidence and interpretation

### Evidence hierarchy used

Where sources disagree, this analysis uses the following order:

1. explicit, recent product decisions from the user;
2. current source-of-truth types in `packages/common/src/types` for implemented domain semantics;
3. current implementation and tests;
4. maintained requirements/design documents;
5. older documents and historical implementation notes.

This matters because recent product direction intentionally superseded part of the committed campaign document.

### Recent product decisions considered

- **“Restructure GM navigation model”** explicitly changed the product to one world, one campaign, and multiple sessions; made world/location changes persistent until reset; established the location as one combined design-time/play-time workspace; moved primary navigation left and inspection/configuration right; and required in-context creation during play.
- **“Make canvas lab the default”** made the canvas the primary campaign-location experience, with layers first and creatures, items, and discoveries secondary. It also preserved room for GM session controls.
- Follow-up location work established persistent walls and doors, canvas-placeable editing, cursor-relative zoom, layer accordion behavior, side-on gravity expectations, and visibility/lighting expectations.
- **“Clarify combat requirements docs”** resolved combat around ordered private plans, logical resolution slots, GM-centered conflict adjudication, no initiative or per-player turns, durable locked/resolving state, and atomic end-of-round publication.
- **“Add export and import support”** established selective world/campaign/session transfer with complete state, media, conflict strategies, validation, and recoverability; substantial host-transfer support now exists.
- **“Add domain model API endpoints”** established generic CRUD/list coverage for the domain model; that breadth exists, but runtime validation is still shallow.

### Repository state

- Branch: `main`.
- Git history contains only two commits: `7df2d49 initial revision` and `2b0b0a2 map layers`.
- The working tree contains 15 modified files with roughly 4,130 insertions and 1,277 deletions, primarily implementing the singleton navigation/persistence direction and expanded canvas behavior.
- `docs/combat-system-requirements.md` is untracked even though it is currently the clearest combat product baseline.
- The shallow history and large dirty change set make provenance, rollback, and regression isolation unusually difficult.

### Verification performed

The following passed on the current working tree:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`: 55 API tests and 30 web tests
- `pnpm build`

The web production build emitted a chunk-size warning for a main JavaScript bundle of approximately 503 kB minified. Existing web tests cover geometry and canvas-model helpers only. API tests are predominantly service/unit tests with mocked dependencies.

No deployed environment, production database, CI history, browser E2E suite, security test, migration rehearsal, backup-restore drill, or production telemetry was available.

## Product baseline inferred from existing evidence

The minimum coherent MVP strongly suggested by current requirements, conversations, and implementation is:

1. A GM can create or AI-generate the installation's single world, build its location hierarchy, and reset that world deliberately.
2. A GM can create or AI-generate the single campaign, with the full world hierarchy available rather than copied into a campaign silo.
3. A GM can manage locations, creatures, items, environmental objects, discoveries, maps, walls, doors, layers, sounds, lights, drawings, templates, and notes from a unified location-centered workspace.
4. Persistent world/campaign/location state carries across multiple sessions until changed or the world is reset.
5. Sessions provide meaningful start, resume, end, journal, timing, and history boundaries without silently becoming a second source of truth for persistent world state.
6. The GM can perform design-time actions while a session is running without leaving the active location.
7. Combat uses the documented plan-based, GM-adjudicated model; initiative and active-combatant turns do not coexist as a legacy mode.
8. Player/controller access is limited to permitted plans and player-safe projections; GM-only content and other players' plans remain private.
9. Content is validated, conflict-safe, recoverable, and exportable/importable without exposing opaque identifiers to the GM.

Items such as story arcs, reusable rulings, campaign publication/versioning, per-character knowledge, and advanced summon/mount/lair systems remain explicitly deferred or unsupported by evidence and are not treated as MVP requirements here.

## Capability assessment

| Capability                    | Requirements/design                                       | Implementation                                                                       | Verification                                             | Status                   |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------ |
| World creation and hierarchy  | Present in types, AI guide, and UI direction              | CRUD, AI generation, hierarchy editor, maps and connections exist                    | Unit/model tests; no full browser journey                | Partial/strong           |
| Single-world reset            | Latest direction and AI guide describe it                 | Reset logic exists but is sequential and incompletely enumerated                     | Unit coverage only                                       | Partial/risky            |
| Creatures and items           | Types, AI prompts, UI flows                               | Dedicated libraries/editors and generation exist                                     | Service/model tests; no E2E                              | Partial/strong           |
| Environmental objects         | Required by campaign document and location tool direction | Object state/resource exists, but no first-class definition catalog or placement UI  | None for user journey                                    | Incomplete               |
| Campaign                      | Latest direction says singleton persistent context        | Singleton checks, generation, editor, discoveries, placements, canvases exist        | Campaign service/model tests                             | Partial                  |
| Currency grants               | Campaign document requires world-supplied currency        | Free-text denomination accepted; no world currency catalog exists                    | No invariant test                                        | Incorrect/incomplete     |
| Location canvas               | Canvas-first design is explicit                           | Rich map, wall, door, layer, light, sound, drawing, template, note, token tooling    | Geometry/model tests; prior manual checks                | Partial/strong           |
| Side-on gravity and falls     | Recent direction explicitly requires it                   | Fall handling exists in current UI, including placement and HP writes                | Model-level coverage only; writes are non-atomic         | Partial/risky            |
| Vision/lighting               | Recent direction and canvas controls imply it             | Rendering primitives exist; authoritative observer/projection lifecycle is unclear   | No integrated test                                       | Partial                  |
| Sessions                      | Multiple sessions are core                                | Start/end journal records exist; list is thin; no full resume/detail/party flow      | No component/E2E coverage                                | Incomplete               |
| Combat                        | Detailed requirements and acceptance criteria exist       | Current types still model initiative/turns; no plan/adjudication workflow            | No combat tests                                          | Not implemented          |
| Player/controller permissions | Explicit combat requirement                               | No auth, viewer role, ownership, or safe projections                                 | None                                                     | Not implemented/blocker  |
| Generic domain API            | CRUD/list requirement exists                              | Broad JSON-document API exists                                                       | Service/unit tests                                       | Partial/risky            |
| Graph index                   | Reliability design exists                                 | Synchronous derived tuples plus manual graph API                                     | Unit tests only                                          | Partial/risky            |
| Media                         | Required by maps/items and implemented UI                 | S3-compatible upload/search/download/delete exists                                   | Media-key helper unit tests only                         | Partial/risky externally |
| Science-domain refactor       | Detailed migration design                                 | Types, compatibility, migration, archives implemented                                | Strongest focused test coverage                          | Mostly complete          |
| Host transfer                 | Explicit recent requirement                               | Versioned archive, media, schema, validation, conflict strategies, rollback attempts | Archive-format unit tests; service compensation untested | Mostly complete          |
| Operations/release            | Implied by Docker and production build                    | Dev Compose and Dockerfiles exist                                                    | Local build only                                         | Incomplete               |

## What is working well

### Domain and data foundations

- `packages/common/src/types` provides a broad and coherent compile-time model across catalogs, characters, creatures, items, locations, campaigns, sessions, games, encounters, and rules.
- The science-and-technology refactor is the most complete subsystem: it has versioned compatibility, dry-run/apply migration, archive support, exception reporting, optimistic updates, and focused tests.
- A small terminology cleanup remains: `apps/web/src/sessionCanvasModel.ts:416` still describes a “spell,” and `docs/combat-system-requirements.md:82` and `592` use the same legacy term. These should use discipline/activation language unless “spell” is explicitly retained as presentation vocabulary.
- Domain resources have stable metadata extraction, deterministic list ordering, and optional optimistic revision checks.
- Host transfer validates the complete archive, stages object writes, applies database changes transactionally, rebuilds projections, and attempts compensation when later steps fail.

### GM authoring experience

- Dedicated world, creature, item, campaign, and canvas interfaces are visually substantial and generally use names, descriptions, imagery, loading states, and empty states.
- The location canvas has meaningful interaction infrastructure: normalized geometry, map/wall alignment, cursor-relative zoom, layered inspection, persistent placeables, keyboard-aware map controls, reduced-motion handling, and responsive layout work.
- The latest shell changes align with the requested location-centered information architecture: primary navigation is on the left, location context fills the frame, and the right panel is used for inspection/configuration.
- Campaign premise and player introduction are kept separate, and UI-authored rich text is sanitized.

### Engineering practices already present

- Global DTO whitelisting and transformation reject undeclared DTO fields.
- Request failures receive correlation IDs and structured logs without request bodies.
- AI invalid-output logs bound and sanitize previews.
- Several AI/media flows include compensating cleanup.
- Current typecheck, lint, unit tests, and production builds are green.

## Findings by severity

### P0 — Product and architecture blockers

#### 1. The campaign requirements document is superseded but not replaced

`docs/campaign-design.md` describes reusable campaign definitions, multiple campaign instances with different parties, initial-only placements, and session-owned mutable state. The latest explicit direction instead specifies one world, one campaign, persistent shared location state, and sessions as journal/timing boundaries. Current changes in `packages/common/src/types/campaign.ts`, `apps/api/src/ai/prompts/domain-model.md`, `apps/api/src/domain/domain.service.ts`, and the web shell follow the newer direction.

This is a documentation correctness problem, not evidence that the implementation should revert. Until the old document is rewritten or marked superseded, developers can make mutually incompatible choices about multiplicity, ownership, instance creation, session reset behavior, and canvas persistence.

Required closure:

- rewrite `docs/campaign-design.md` around the singleton persistent-world model;
- explicitly define what a session owns versus merely journals;
- define the one reset boundary and its complete owned-resource inventory;
- reconcile creature/item/object “definition versus instance” terminology; and
- add a decision record explaining why the reusable-definition model was retired.

#### 2. The documented combat model is not implemented

`docs/combat-system-requirements.md:24-41`, `213-232`, `374-421`, and `536-585` require ordered plans, GM-centered conflicts, typed reactions, private projections, resumable resolution, and atomic publication. Current `packages/common/src/types/combat.ts:32-100` still exposes initiative phases, `turnIndex`, `activeCombatantId`, and per-turn state. `packages/common/src/types/game.ts:106-124` still includes `advance-turn` and standalone movement without plan locking, conflicts, adjudications, proposals, or publication.

The requirements explicitly say plan-based combat replaces initiative rather than coexisting with it. This requires a domain and persistence migration, not a UI-only addition.

#### 3. Authentication, authorization, and projection privacy are absent

All domain, reset, graph, media, AI, and generation-history routes are publicly callable in the current API. Representative evidence includes:

- `apps/api/src/domain/domain.controller.ts:31-88`
- `apps/api/src/domain/worlds.controller.ts:16-28`
- `apps/api/src/graph/graph.controller.ts:19-43`
- `apps/api/src/media/media.controller.ts:30-76`
- `apps/api/src/ai/ai.controller.ts:23-358`

This blocks any networked or multi-user MVP and makes the combat requirements for owners, controllers, spectators, hidden plans, and player-safe projections impossible. It also exposes full stored prompts/outputs through generation history and permits destructive graph/media/domain operations without an identity boundary.

The requirement is not invented: player-specific plan ownership and visibility are explicit in the combat document. If the MVP is intentionally single-user/local-only, that constraint must be stated and enforced through deployment rather than assumed.

#### 4. Authoritative domain persistence accepts structurally invalid data

`apps/api/src/domain/dto/domain-resource.dto.ts:14-33` verifies that `data` is an object, not that it conforms to the resource's TypeScript contract. `apps/api/src/domain/domain-resource.ts:34-156` extracts only selected metadata. `apps/api/src/domain/domain.service.ts:359-367` adds a legacy-science vocabulary check but not full runtime validation.

Consequences include persistence of invalid discriminants, missing required arrays, malformed coordinates, negative or out-of-range values, duplicate nested IDs, broken relationships, and cross-world references. Compile-time branded IDs do not protect JSON received at runtime.

This is the largest correctness gap outside combat because every feature assumes the generic store contains valid aggregates.

#### 5. There is no production-safe relational migration and rollback path

`apps/api/prisma/schema.prisma` exists, but there is no checked-in `apps/api/prisma/migrations` history. Development uses `prisma db push` (`README.md:32`, `apps/api/package.json:9-19`), and the production image starts the compiled API without applying a reviewed schema migration.

Science JSON migrations and host-transfer schema upgrades are valuable but do not replace normal forward relational migrations. A production database cannot be upgraded or rolled back reproducibly from the repository.

### P1 — Core MVP completeness and correctness

#### 6. Session semantics and lifecycle are too thin for the stated product

The latest direction makes multiple sessions core. Client-side start and end writes exist in `apps/web/src/Campaigns.tsx:133-188`, creating an `in-progress` session and later replacing it as `completed`, but they are thin record mutations without server-enforced lifecycle rules. The `/sessions` route selects the latest campaign, swallows load failures into an empty state, and provides no meaningful session detail/resume workflow (`apps/web/src/App.tsx:659-751`).

Still missing:

- server-enforced transition validation, durable active-session selection, resume/detail behavior, and interruption recovery;
- active-location and session context;
- party/session-zero assembly or an explicit decision that party state belongs elsewhere;
- a dedicated notes/detail/event-history workflow (the type and generic store can already persist optional notes);
- a defined relationship between sessions and the one active encounter; and
- clear UI distinction between persistent world changes and session journal entries.

The singleton direction removes the need to snapshot all world state per session, but it does not remove the need for a durable session lifecycle or combat-resume owner.

Session start can also race ahead of unsaved preparation. Canvas and placeable edits update only the local campaign draft until the adjacent Save action persists it (`apps/web/src/Campaigns.tsx:2183-2241`, `2379-2396`), while session controls can independently create an in-progress session. Starting a session must either validate and flush pending preparation, explicitly discard it with confirmation, or refuse to start; failure and retry behavior must be defined.

#### 7. Campaign/world reference invariants are not enforced server-side

Current product semantics require campaign references to resolve inside the one world. The campaign UI performs some local checks, but API callers and AI services can bypass them. Campaign generation also fetches catalogs with fixed limits and may omit hierarchy members or references when worlds exceed those limits.

Authoritative validation should cover:

- every location belongs to the root world hierarchy;
- every placement references an allowed world resource;
- every nested ID is unique within its aggregate;
- one persistent placement has one clear identity and ownership model;
- starting location and discovery locations resolve;
- generated `locationIds` deterministically contain the intended hierarchy; and
- update operations cannot orphan relationships.

#### 8. Object placement is a documented but unavailable user operation

The campaign document and the current location-tool direction both include environmental objects. The campaign UI only preserves/counts existing object placements and states that editing awaits a future object library (`apps/web/src/Campaigns.tsx:2159-2161`, `2483-2489`). Creature and item placement editors exist beside it.

This is also a type/catalog gap, not just missing UI. `CampaignObjectPlacement` requires an `objectDefinitionId` (`packages/common/src/types/campaign.ts:31-35`), but `GameDefinition` has no object-definition variant (`packages/common/src/types/catalog.ts:72-90`) and `ObjectState` only has an optional definition reference (`packages/common/src/types/world.ts:74-87`). The product needs a first-class object-definition catalog and instance contract, or it must revise the placement requirement.

This is a probable MVP omission because doors, wells, containers, machinery, and other environmental objects are part of the already-designed location workspace—not a speculative new feature.

#### 9. Discovery monetary grants do not select a world currency

`docs/campaign-design.md:136-141` and `190-193` require world-supplied currencies. The current campaign UI uses free text and validation only requires a non-empty denomination (`apps/web/src/Campaigns.tsx:1880-1901`, `2540-2548`). The AI normalizer has the same weak contract. More fundamentally, no world-owned currency catalog exists; `CurrencyAmount` contains only an open denomination string (`packages/common/src/types/primitives.ts:186-189`).

First define where world currencies live—or explicitly revise the older requirement. If retained, add a name-based world currency selector and enforce membership server-side.

#### 10. Multi-record canvas effects can partially commit

Current canvas fall handling first persists campaign placement and then separately updates creature hit points (`apps/web/src/Campaigns.tsx:2270-2305`). A failure between writes leaves location and creature state inconsistent. Similar risk appears anywhere one semantic action updates domain records, graph projections, media, or generation audit rows in sequence.

The newer persistent-world direction makes these real authoritative mutations rather than session-copy mistakes, but they still need atomic commands, idempotency, or compensating recovery.

#### 11. World reset is non-atomic and may miss owned resource types

`apps/api/src/domain/domain.service.ts:221-344` discovers and deletes sessions, games, campaigns, connections, content, and locations through many sequential operations. A mid-operation failure can leave a partially reset installation. The deletion inventory does not obviously include every resource category exposed by the generic API, such as encounters, pending decisions, game events, objects, or scenes.

Because “persistent until the entire world is reset” is now a primary lifecycle rule, reset needs a complete ownership manifest, one recoverable command, and failure/retry tests.

#### 12. Singleton enforcement is race-prone

`apps/api/src/domain/domain.service.ts:28-50` performs `count()` then `create()` for root worlds and campaigns. No database constraint or lock enforces the invariant. Concurrent requests can both observe zero and create duplicates.

Represent the singleton invariant in the database or serialize creation transactionally. The UI alone is insufficient.

#### 13. Graph projection reliability remains at the design stage

`docs/graph-index-reliability-design.md:26-52` identifies non-atomic source/graph writes, heuristic reference extraction, missing provenance, missing reconciliation, weak health, and incomplete integration coverage. The document is partly stale: its root self-`contains` defect appears fixed by the current `isRoot` guard and tests in `apps/api/src/graph/graph-tuples.ts:21-66`. The remaining architectural risks are current. The service still commits the `DomainRecord` before mutating graph state (`apps/api/src/domain/domain.service.ts:49-64`, `150-218`), and Prisma has no outbox, projection status, or ownership/provenance model.

A graph failure can therefore return an HTTP error after authoritative data already changed, encouraging an unsafe retry. Manual and derived tuples also share an API without a complete provenance boundary.

#### 14. GM-visible opaque identifiers remain possible

The repository rule forbids opaque IDs in GM-visible content. Current risks include:

- domain errors interpolating resource IDs (`apps/api/src/domain/domain.service.ts:68-69`, `132-134`, `161-163`, `224-226`, `346-347`);
- the web passing API messages directly into visible errors (`apps/web/src/api.ts:44-52`);
- generic raw JSON editors exposing identity and relation IDs (`apps/web/src/App.tsx:588-650`); and
- item metadata falling back to a definition ID as a stored name (`apps/api/src/domain/domain-resource.ts:111-117`).

Replace visible identifiers with resolved names or neutral fallbacks. Keep request IDs only as support correlation tokens.

### P2 — Robustness, UX, and release quality

#### 15. AI writes are synchronous, non-idempotent, and weakly bounded

`apps/api/src/ai/openai.service.ts:34-92` has no explicit timeout, retry policy, cancellation, budget limit, or durable job state. Generation services may commit domain/media changes before the controller records the generation audit. A response or audit failure can therefore create content while reporting failure; retries can duplicate content and spend.

The project needs idempotency keys, durable statuses, bounded provider calls, cost/token telemetry, and clear compensation rules before AI generation is robust.

`Generation` also retains full combined prompts and outputs without an ownership, redaction, deletion, encryption, or retention policy (`apps/api/prisma/schema.prisma:10-20`). Those records may contain GM-only campaign/world content and require a privacy lifecycle before networked use.

#### 16. Media upload is unsafe for an exposed deployment

The upload route is unauthenticated, accepts up to 2 GB, trusts client MIME/name metadata, and has no content signature check, malware policy, quota, or rate limit (`apps/api/src/media/s3-upload.interceptor.ts:56-69`, `object-storage.service.ts:69-99`). Delete is object-first then metadata, so failure can strand a database row (`apps/api/src/media/media.service.ts:85-89`).

This may be acceptable in a trusted local prototype, but not on an exposed host.

#### 17. Lists silently truncate at fixed limits

Generic web lists and campaign dependency loads stop at 200 (`apps/web/src/App.tsx:505-510`, `apps/web/src/Campaigns.tsx:2727-2753`). Campaign generation similarly caps catalog reads. `WorldEditor` already demonstrates full pagination (`apps/web/src/WorldEditor.tsx:2920-2937`).

Silent truncation can produce invalid selectors, incomplete campaign hierarchy, and missing generated context. Complete operations must page to exhaustion; interactive libraries should be searchable and paginated.

#### 18. Sessions and navigation depend on “latest” records

The current singleton model reduces but does not eliminate the problem. Shell and session views derive context from most recently updated records. If legacy, imported, or race-created duplicates exist, context becomes surprising. Invalid routes also redirect rather than presenting a not-found or invalid-context state.

Use an installation/current-context endpoint that validates singleton state and returns human-readable recovery actions.

#### 19. Important UX states and accessibility contracts are incomplete

High-value gaps include:

- dialogs use `<dialog open>` without `showModal`, `aria-labelledby`, a focus trap, initial focus, or focus restoration (`apps/web/src/WorldEditor.tsx:904-937`, `1230+`, `2432+`, `3272-3309`);
- no structured keyboard/screen-reader list equivalent for canvas tokens and placeables;
- campaign save lacks a strong dirty-state/navigation guard and field-associated errors;
- some canvas text is 9–11 px despite the broader 14 px minimum intent;
- item search relies on placeholder text rather than a meaningful accessible name (`apps/web/src/Items.tsx:321-334`);
- destructive/archive behavior is inconsistent across content types;
- responsive behavior has prior manual evidence but no repeatable viewport suite; and
- there is no declared accessibility target such as WCAG 2.2 AA.

#### 20. Automated coverage does not exercise product journeys

The 30 web tests cover `mapGeometry` and `sessionCanvasModel`; there are no React component or browser tests. API tests mock Prisma, graph, storage, and provider boundaries. There is no CI workflow.

Missing evidence includes:

- clean installation and migration;
- world → campaign → location → session journeys;
- permissions and privacy projections;
- malformed JSON and referential-integrity rejection;
- concurrent singleton creation and revision conflicts;
- graph failure/recovery and reset failure/retry;
- OpenAI and object-storage failure modes;
- archive/restore against a real database and object store;
- responsive, keyboard, screen-reader, and opaque-ID checks; and
- every combat acceptance criterion.

#### 21. Operational readiness is development-level

Health checks only prove a database query. There is no typed fail-fast environment schema, readiness check for storage/graph/provider/schema status, metrics, traces, alerts, SLOs, CI, deploy manifest, incident owner, backup schedule, restore drill, or release rollback runbook. Swagger is always exposed. Several production-critical settings have development defaults.

#### 22. The README does not describe the actual product

`README.md` still calls Age of Wonders a generic “Docker-first full-stack scaffold for building AI-enabled products.” It documents technical facilities well but does not provide the current product vision, primary GM workflow, singleton model, session semantics, combat status, user roles, MVP boundary, or requirements index.

## Probable MVP gaps derived from existing data

These are not new speculative features. Each follows from a relationship or workflow already represented in requirements, types, UI, or recent product direction.

### Installation-state bootstrap and recovery

The UI assumes one world and one campaign, while persistence can contain zero, one, or—under races/imports—more than one. MVP needs a deterministic installation bootstrap/status endpoint and recovery screen covering:

- empty installation;
- world exists but campaign does not;
- complete installation;
- invalid duplicate roots/campaigns; and
- reset/import in progress or recovery required.

### Active-session and active-encounter ownership

The data model contains sessions, games, scenes, encounters, pending decisions, and game events, while the latest campaign direction keeps most world state persistent and combat requires one durable active encounter. MVP needs one canonical ownership graph stating where the following live:

- active session identity and clock;
- active location;
- party and token controllers;
- locked plans and resolver cursor;
- pending adjudication;
- simulated round state;
- published combat history; and
- persistent world mutations caused by play.

Without this, resume and recovery cannot be correct.

### Definition/instance identity for repeated content

Current campaign placements can point multiple times at one creature/item identifier, while older campaign requirements describe creating distinct instances from definitions. Persistent HP, inventory, ownership, and multiple copies require an explicit distinction between reusable definitions and stateful instances even in a singleton world.

This does not imply reusable campaigns. It follows from the existing ability to place multiple copies and mutate their independent state.

### In-context creation transaction

Recent direction explicitly requires creating a creature type with AI and adding an instance to the active location without leaving a session. MVP therefore needs one guided and recoverable workflow:

1. generate or author the definition;
2. validate and persist it;
3. create a stateful instance;
4. place it at a human-selected map position;
5. update the inspector and activity history; and
6. compensate or resume after any intermediate failure.

The current building blocks exist, but not this complete transaction.

### Human-readable resolution service

Names are resolved ad hoc in several UI surfaces. The strict no-opaque-ID rule and combat's human-readable adjudication/log requirements imply a shared resolver for resource labels, images, types, and neutral fallbacks. This should be used by API errors/projections as well as the web UI.

### Content lifecycle and referential safety

Persistent state plus import/reset requires explicit behavior when deleting or replacing a location, definition, creature instance, item, object, or media asset that is referenced elsewhere. MVP needs dependency previews and either archive, cascade, block, or reassign semantics. The current generic delete API cannot safely infer all of this from heuristic graph tuples.

## Phased plan

The phases are ordered by dependency and risk. Later work should not compensate for unresolved earlier contracts.

### Phase 0 — Establish one authoritative product baseline

**Goal:** Eliminate contradictory requirements before further domain expansion.

Requirements/design work:

- Rewrite `docs/campaign-design.md` for the single-world, single-campaign, persistent-state model.
- Define session semantics: what is persistent world state, what is session journal/history, and what must resume.
- Define the canonical ownership of `CampaignDefinition`, `CampaignState`, `SessionState`, `GameState`, `Scene`, and `EncounterState`; remove or rename concepts that no longer have distinct responsibilities.
- Decide and document definition-versus-instance identity for creatures, items, and objects.
- Decide whether environmental objects and world currencies remain MVP concepts, and define their missing catalog/ownership models before promising selectors or placement workflows.
- Convert `docs/combat-system-requirements.md` from an untracked artifact into the maintained product baseline.
- Write the combat technical design: state machine, commands/events, privacy projections, persistence owner, atomic publication, idempotency, and migration away from initiative.
- Define user roles and deployment assumption: trusted local-only GM, authenticated remote GM/player, or staged progression. The combat contract requires an eventual GM/player model.
- Add `docs/README.md` or a requirements index with status columns: required, designed, typed, persisted, API, UI, tested, deferred.
- Refresh the root README with the actual product vision, primary workflow, and MVP boundary.

Exit criteria:

- No maintained document describes reusable multi-campaign semantics as current.
- Every mutable play concept has exactly one canonical owner.
- Combat technical design maps every acceptance criterion to an API/state/test concept.
- Explicit deferred items are recorded so MVP scope cannot expand accidentally.

### Phase 1 — Secure and validate the authoritative data boundary

**Goal:** Make persisted state trustworthy before adding more behavior.

Implementation:

- Introduce executable runtime schemas for every domain resource, reviewed against `packages/common/src/types`.
- Add cross-resource validators for world ownership, hierarchy, definition/instance references, unique nested IDs, normalized ranges, allowed discriminants, and rich-text sanitization.
- Make revision preconditions mandatory for collaboratively mutable or multi-step resources.
- Add authenticated identities and server-side authorization for GM, player/controller, and read-only/spectator access before any player-facing combat work. This may be deferred only for a trusted GM-only alpha in which combat is unavailable.
- Restrict or remove direct graph mutation from ordinary clients; make generation history GM/admin-scoped.
- Add route-specific rate limits and quotas for AI, media, and destructive writes.
- Define ownership, access, retention/deletion, redaction, and encryption policy for stored AI prompts and outputs.
- Replace user-visible ID-bearing errors and raw JSON GM editors with human-readable forms/resolvers; gate developer tooling explicitly.
- Enforce single root world and campaign with database-backed constraints or serialized transactions.
- Create checked-in Prisma migrations, deploy preflight, schema-version check, and documented rollback/restore path.
- Add a minimum CI workflow now—not at release time—for format checks, lint, typecheck, unit tests, builds, Prisma migration validation, and schema-drift detection.

Tests:

- malformed payload tables for every resource;
- cross-world/cross-definition rejection;
- concurrent singleton creation;
- stale revision and concurrent update behavior;
- authorization matrix and projection leakage; and
- automated visible-UUID/opaque-ID assertions;
- validation through generic CRUD, AI, science archive import, host transfer, migrations/backfills, and every CLI/bulk ingestion path; and
- migration from the current baseline plus representative data, including compatibility/backfill verification and restore or forward-fix rehearsal.

Exit criteria:

- Invalid aggregates cannot enter persistence through any interactive, AI, archive, transfer, migration, backfill, or bulk ingestion path.
- Every sensitive route has an explicit identity/authorization policy or is provably local-only.
- CI enforces the minimum quality and migration gates on every change.
- A clean database can be created from checked-in migrations, and a representative baseline database can be upgraded with schema drift, compatibility/backfill, and recovery behavior verified.

### Phase 2 — Establish recoverable mutation and projection infrastructure

**Goal:** Provide the reliability primitives required before the vertical slice claims atomicity or recovery.

Implementation:

- Implement the transactional graph outbox, projection provenance, worker, retry policy, reconciliation, drift audit/repair, and health signals described in `docs/graph-index-reliability-design.md`.
- Route imports, migrations, bulk changes, and authoritative multi-record commands through projection intent rather than directly interleaving graph writes.
- Introduce a durable operation/command pattern with idempotency keys, explicit status, retry semantics, and compensation for partial external work.
- Use that pattern for fall/damage and other multi-record play mutations.
- Define a complete world-ownership manifest and implement reset once as an interruption-safe, idempotent command with graph convergence and human-readable recovery status.
- Establish the minimum durable AI-operation primitives needed by the in-context creation flow: provider timeout/cancellation, request idempotency, status, bounded retry, and compensation. Full cost and retention hardening continues later.
- Define media repair/compensation primitives for metadata/object divergence.

Tests:

- real-PostgreSQL source/outbox/projection lifecycle;
- graph failure after source commit, duplicate/reordered worker delivery, reconciliation, and manual tuple preservation;
- side-on fall plus HP update under injected failures and safe retry;
- reset interruption at every stage, dependency cleanup, rerun, and graph convergence;
- AI response loss/client retry without duplicate definitions or placements; and
- object-storage/metadata divergence detection and repair.

Exit criteria:

- A failed multi-record request cannot conceal a committed change without returning a durable operation status.
- Graph drift is detectable and repairable without harming manual tuples.
- World reset has one implementation with a complete ownership inventory and interruption-safe retry.
- The following vertical slice can rely on tested idempotent command and projection semantics.

### Phase 3 — Complete the persistent world/campaign/session vertical slice

**Goal:** Deliver the non-combat GM workflow end to end on the validated, recoverable foundation.

Implementation:

- Add installation bootstrap/status and duplicate-state recovery.
- Make campaign generation deterministically materialize the intended full world hierarchy using complete pagination.
- Define a first-class environmental object catalog and instance contract, then implement library, creation, placement, inspection, movement, and lifecycle.
- Decide whether world-owned currencies remain required. If so, add the catalog/ownership model, name-based selector, and authoritative validation; otherwise revise the superseded requirement explicitly.
- Resolve definition/instance semantics and support multiple independent instances from one definition.
- Build server-validated session start/resume/end/detail/history with active location and durable journal semantics.
- Require session start to flush and validate pending campaign/location preparation, explicitly discard it with confirmation, or refuse to start; define failure/retry behavior.
- Add party/controller assembly at session start, or document and implement the alternate canonical owner.
- Implement the in-context create-definition → create-instance → place-on-map flow using the Phase 2 durable-operation primitives.
- Define and implement deletion/archive dependency behavior for referenced content.
- Replace fixed 200-record assumptions with complete pagination and searchable libraries.
- Introduce the accessible modal/focus primitive, field-associated errors, minimum operational text size, and keyboard/screen-reader canvas object list as part of the workflow—not as later remediation.

Tests:

- world creation → campaign creation → location preparation → flushed session start → in-session creation/placement → end → resume;
- refusal/recovery when session start encounters unsaved or invalid preparation;
- object, currency, discovery, and repeated-instance flows;
- import into empty, older, and conflicting installations;
- component checks for accessible names, dialog focus behavior, field errors, and keyboard-equivalent canvas inspection; and
- browser E2E for the complete non-combat journey.

Exit criteria:

- A GM can complete the full non-combat MVP journey without raw JSON or manual database repair.
- All persistent changes survive reload and appear in the next session as designed.
- Ending a session cannot claim the world is unchanged when play has changed persistent state.
- The critical workflow is keyboard-operable and has meaningful accessible names and focus behavior.

### Phase 4 — Replace legacy combat with plan-based combat

**Goal:** Implement the sole documented combat model without legacy initiative leakage.

Domain and persistence:

- Replace initiative/turn types, commands, events, durations, and usage-limit assumptions.
- Add concepts equivalent to round plan, declared activity, plan cursor, movement progress, reaction reservation, conflict, adjudication, resolution proposal, simulated state, and publication record.
- Select one canonical active-encounter owner and enforce at most one active encounter.
- Define migration/compatibility behavior for any persisted legacy encounter/rule data.
- Keep locked plans, partial resolution, random state, and adjudications restart-safe; drafts may remain ephemeral as specified.

API and security:

- Treat Phase 1 identity, controller assignment, and server authorization as hard prerequisites; a local-only UI identity is not sufficient for private plans.
- Add controller assignment, plan draft/reorder/submit/lock, resolver advancement, adjudication, preview, publication, pause, resume, and completion commands.
- Use optimistic revisions and idempotency keys for every state transition.
- Produce separate GM-safe and player-safe projections with private plans and hidden facts omitted.
- Resolve every visible participant/activity/reference to a human-readable label.

UI:

- Remove or lab-gate the current initiative-like “Round / Kael's turn” control.
- Build setup, planning, lock, guided resolution, blocking adjudication, consequence preview, review, publication, and accessible activity log states.
- Show ordered plans, current/completed activities, movement remaining, armed reactions, conflict reasons, and decisions at the correct permission level.
- Support pause/reload/resume without reconstructing state from UI memory.
- Build the activity log, adjudication controls, focus order, status announcements, and non-color state distinctions to the accessibility baseline during implementation.

Tests:

- Convert every criterion in `docs/combat-system-requirements.md:536-585` into an automated fixture.
- Add concurrency, privacy, stale-write, idempotency, restart, and atomic-publication tests.
- Include the documented logical-slot and attack-during-evade examples as executable acceptance fixtures.

Exit criteria:

- No production type, route, prompt, or UI exposes initiative order, active-combatant turns, or selectable legacy combat.
- Locked/resolving rounds survive restart exactly.
- Publication is atomic and no player projection leaks hidden data.
- Planning and adjudication are keyboard-operable, screen-reader understandable, and do not depend on color or motion.

### Phase 5 — Harden AI, media, and retained operational data

**Goal:** Complete external-service safety, privacy, cost control, and repair beyond the Phase 2 minimum primitives.

Implementation:

- Complete AI generation as an idempotent durable job/saga with queue isolation, cancellation, bounded retries, status, costs/tokens, latency telemetry, and compensation.
- Make generation audit creation part of the durable workflow rather than a controller-afterthought.
- Enforce ownership/access, retention/deletion, selective redaction, and appropriate encryption for stored prompts and outputs.
- Harden media with signature/content validation, safe limits, quotas, authorization, malware policy where appropriate, cleanup/repair, and explicit retention.
- Add operational dashboards and alerts for graph backlog/drift, AI failure/cost/latency, media repair, and durable-operation failures.

Tests:

- provider timeout, response loss, client retry, and compensation;
- AI audit ownership, access, redaction, deletion, and retention expiry;
- S3 write/delete failure, content validation, quota enforcement, and metadata repair; and
- operational alert threshold smoke tests.

Exit criteria:

- AI and media retries do not duplicate content or lose authoritative state.
- Full prompts/outputs are not indefinitely exposed outside their defined ownership and retention policy.
- External-service failures are visible, bounded, and repairable.

### Phase 6 — UX, accessibility, performance, and end-to-end evidence

**Goal:** Turn the functioning feature set into a dependable GM/player product.

Implementation:

- Complete shared combobox/listbox, toast/status, and destructive-action primitives and audit the modal/field/canvas foundations introduced earlier.
- Add dirty-state indication and navigation protection for campaign/location edits.
- Add a keyboard/screen-reader-operable structured list for all canvas tokens/placeables and an accessible activity log.
- Remove sub-14px operational text; verify focus, contrast, reflow, zoom, and reduced motion.
- Define supported browsers/viewports and an accessibility target.
- Split the large web bundle by route/workspace and measure startup/render costs on representative worlds.
- Add explicit loading, retry, permission-denied, conflict, offline/interrupted, and recovery states.

Verification:

- React component tests for empty/loading/error/dirty/conflict/permission states;
- Playwright or equivalent E2E for every critical GM and player journey;
- form accessible-name assertions, including item search;
- automated accessibility scans plus keyboard and screen-reader manual scripts;
- visual regression at 320 px, tablet, laptop, and wide desktop;
- large-world performance fixtures beyond 200 resources; and
- no-visible-opaque-ID scans in every journey.

Exit criteria:

- Critical journeys are repeatable in CI across supported viewport classes.
- Essential canvas and combat state is accessible without color, motion, or pointer input.
- Performance budgets are defined and met on representative data.

### Phase 7 — Release and operational hardening

**Goal:** Produce evidence for a controlled MVP release.

Implementation:

- Expand the Phase 1 CI baseline with integration, E2E, security, container-scan, accessibility, performance, and deployed smoke gates.
- Add typed fail-fast environment validation and remove unsafe production defaults.
- Separate liveness from readiness; include database, object storage, schema version, graph backlog/drift, and required provider configuration.
- Add metrics, tracing, structured audit events, AI cost/latency telemetry, dashboards, and alert thresholds.
- Document backup schedule, restore drill, deploy, migration, canary, rollback, incident ownership, graph repair, reset recovery, and active-combat recovery.
- Rehearse migrations and restore against a production-like snapshot.
- Complete science migration audits in every environment before retiring compatibility.

Rollout:

1. trusted local GM alpha;
2. authenticated internal multi-user session;
3. small invited beta with backup/rollback criteria;
4. wider MVP only after privacy, recovery, and combat acceptance evidence is green.

Exit criteria:

- CI and deployment are reproducible from a clean checkout.
- Backup restoration and release rollback are demonstrated, not merely documented.
- On-call/incident paths and go/no-go thresholds are explicit.

## Suggested work packages and dependency order

| Work package                             | Depends on                               | Unlocks                                                |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Campaign/session ownership decision      | None                                     | Correct types, runtime schemas, sessions, combat owner |
| Role/deployment decision                 | None                                     | Auth architecture, player UI, projection tests         |
| Runtime schemas and reference validation | Ownership decision                       | Safe feature work, imports, AI writes                  |
| Prisma migration baseline                | Ownership decision                       | Production persistence, singleton constraint           |
| Minimum CI baseline                      | Package scripts + migration baseline     | Durable evidence for all later phases                  |
| Combat technical design                  | Ownership + roles                        | Combat implementation                                  |
| Graph outbox/reconciliation              | Runtime schemas + migration baseline     | Recoverable writes and reset                           |
| Durable operation/AI primitives          | Validation + migrations + outbox pattern | Reliable in-session generation and multi-record writes |
| Non-combat vertical slice                | Validation + migrations + recovery       | Usable GM MVP foundation                               |
| Combat implementation                    | Technical design + identity + recovery   | Complete documented play model                         |
| Browser E2E/accessibility                | Each stable vertical slice               | Release evidence                                       |
| Deploy/restore/observability             | Migrations + tests + CI                  | Controlled rollout                                     |

## MVP go/no-go criteria

### Local trusted-GM alpha

May proceed when:

- campaign documentation matches the singleton persistent model;
- malformed domain data is rejected;
- world reset is recoverable;
- the non-combat vertical slice has one browser E2E test;
- import/export restoration is rehearsed; and
- the UI clearly labels combat as unavailable if Phase 4 is not complete.

### Networked or multi-user MVP

Must not proceed until:

- authentication, authorization, controller ownership, and privacy projections are enforced server-side;
- stored AI prompts/outputs have enforced ownership, access, redaction, deletion, and retention policy;
- checked-in migrations and rollback/restore are proven;
- all destructive and multi-record mutations are atomic or durably recoverable;
- plan-based combat acceptance criteria pass if combat is advertised;
- browser/API E2E, accessibility, and visible-ID checks run in CI; and
- operational readiness and incident recovery are demonstrated.

## Evidence still needed

The following would materially change confidence or prioritization:

- target deployment model and whether the first MVP is strictly local/single-user;
- current production-like database contents and legacy encounter prevalence;
- approved visual designs or screenshots for the final navigation, session, and combat flows;
- supported browser/device and accessibility targets;
- backup destination, retention policy, and recovery-time expectations;
- expected world/catalog size and concurrent player count;
- AI usage/cost constraints and acceptable generation latency; and
- whether party/character management is inside this repository's MVP or supplied externally.

## Immediate next actions

1. Treat the current dirty singleton/navigation work as an in-progress feature branch equivalent: review, split, and commit it into recoverable units before adding combat.
2. Rewrite `docs/campaign-design.md` and add the requirements traceability index.
3. Write the combat technical design and active-state ownership diagram.
4. Add runtime resource schemas, checked-in migrations, database-backed singleton constraints, and the minimum CI workflow.
5. Implement the recoverable mutation/outbox foundation, then build and test the complete non-combat vertical slice before beginning the resolver UI.

## Domain-model documentation verification

This assessment does not change any domain type. `apps/api/src/ai/prompts/domain-model.md` was therefore not edited. It is currently synchronized with the in-progress singleton and expanded campaign-canvas types, but the overall product documentation remains inconsistent because `docs/campaign-design.md` still expresses the superseded reusable-campaign/session-state model and the AI guide still documents legacy initiative-based combat where source types remain unchanged.
