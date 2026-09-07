---
name: information-architecture-realignment-closure-audit
description: Evidence-backed closure record for the core information architecture and domain/API realignment
status: passed-core-scope-closed
date: 2026-09-07
architecture: docs/information-architecture-domain-model-realignment.md
implementation-record: docs/api-information-architecture-realignment.md
---

# Information architecture realignment closure audit

## Result

The core information architecture and domain/API realignment is complete. The implemented product
now has discrete World authoring, Campaign Definition authoring, Campaign Instance management, and
Session operation; explicit multi-World selection; captured and migratable immutable revisions;
hierarchical parent-scoped APIs; open GM-authored Model structure; and authoritative Quick Start
guidance over those real records.

This result closes the realignment program as a unit of work. It does not claim that every future
product capability described in the architecture is implemented. The exclusions below are either
deliberately deferred product designs or independently schedulable fast follows, and must not be
used to reopen the core realignment implicitly.

## Audit scope and method

The audit compared the adopted architecture against:

- the common TypeScript contracts and synchronized AI-facing domain guide;
- Nest controller roots, parent-scoped service queries, Prisma relationships, constraints, and
  migrations;
- the generated web route tree, primary/secondary navigation models, canonical workspaces, and
  legacy-route guards;
- Model Registry compilation, immutable release adoption, and authoring surfaces;
- Quick Start definitions, per-GM persistence, target resolution, and live completion predicates;
- documentation authority metadata and explicit exclusion notices;
- the complete unit/component test suites, type checks, lint, Prisma validation, and production
  build.

## Closure matrix

| Concern                             | Result                   | Repository evidence                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation authority             | Pass                     | `docs/README.md` establishes authority order and an explicit exclusion registry; deprecated documents carry file-level exclusion metadata and warnings.                                                                                                                                                                |
| Discrete experiences                | Pass                     | Separate route shells own Worlds, Campaign Definitions, Campaign Instances, and Session operation. Authoring and play do not share an implicit save target or mode switch.                                                                                                                                             |
| Multiple Worlds                     | Pass                     | `WorldDefinition` is a stable lineage with owner-scoped library selection, drafts, immutable revisions, snapshots, fork provenance, archive/restore behavior, and no singleton current-World authority.                                                                                                                |
| Campaign Definition versus Instance | Pass                     | Definitions own authored Plots, placements, and preparation against a captured World; Instances permanently reference one Definition lineage and own snapshots, runtime, roster, progress, Characters, Agents, and Sessions.                                                                                           |
| Captures and migration              | Pass                     | Campaign and World snapshots are immutable. Definition/Instance migrations are direct-lineage, all-or-nothing operations with audit records; active Sessions block migration. Existing Instances do not drift when a Definition changes.                                                                               |
| Hierarchical API ownership          | Pass                     | World content is rooted at `/api/worlds/:worldId`; Instances are rooted at `/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId`; Sessions and Instance children remain beneath that ancestry. Public invitation and authenticated `/api/me` locators are explicit exceptions, not fabricated ancestry. |
| Session continuity and concurrency  | Pass                     | Sessions belong to one Instance, preserve participants/event boundaries/summaries, support Continue/Resume, permit multiple paused Sessions, and enforce one active Session installation-wide.                                                                                                                         |
| Progressive World navigation        | Pass                     | The World workspace exposes Atlas, Bestiary, Item Compendium, Characters, and the reserved Rules group through accessible accordion-capable secondary navigation. Objects, Traps, and Hazards are Item families.                                                                                                       |
| Open domain model                   | Pass                     | Attributes, Equipment Slots, Profession Ranks, Skills, Professions, and Backgrounds have contextual authoring. GM registries can also author nested Concepts, typed Fields, and Relationships through immutable releases adopted explicitly by a World.                                                                |
| Identity and participation          | Pass                     | Installation administration, User/provider identity, Player server standing, durable Instance membership/invitations, Session attendance, Character lifecycle/import, and bounded Agent participation remain distinct.                                                                                                 |
| Hosted Setup and Settings           | Pass for vertical slice  | Hosted-system readiness is separate from content onboarding. The system exposes the accepted configuration taxonomy, first-administrator bootstrap, safe secret handling, validation/history, and initial runtime bindings.                                                                                            |
| Quick Start tutorial                | Pass                     | Versioned core activities and per-GM progress are server-backed. Canonical workspaces retain a collapsible responsive guide, selected records resolve to human names, and current completion is recomputed from authoritative domain state.                                                                            |
| Legacy exclusion/removal            | Pass                     | Removed API/controller roots and obsolete web routes are guarded by tests. Historical plans are either file-wide excluded or have explicitly excluded compatibility sections.                                                                                                                                          |
| Rules                               | Deferred by architecture | Rules remains the fifth World grouping; its detailed information architecture and semantics are intentionally outside this closure.                                                                                                                                                                                    |

## Verification record

On 2026-09-07 the closure candidate produced:

- API: 397 passing tests, 13 skipped integration tests requiring an external PostgreSQL test
  environment;
- web: 172 passing tests;
- common and UI package checks through the recursive typecheck/build gates;
- clean ESLint and TypeScript checks;
- valid Prisma schema, including Quick Start persistence constraints;
- successful full production build and static prerender after allowing the build-only local preview
  listener.

The skipped PostgreSQL tests are environment-gated, not failing tests. Applying the new migration
to a deployed database remains a deployment operation governed by `docs/database-migration-adoption.md`.

Jest also reported that a worker required forced shutdown after the passing suite. This is test
harness cleanup debt rather than a failed product assertion and should be diagnosed independently
if it persists. This closure audit introduced no further domain type or persistence semantics; the
AI-facing domain guide was already synchronized with the Quick Start contracts and remained
accurate for the audit-only changes.

## Explicitly separate work

The following work remains valid but is not part of the closed core realignment:

- detailed Rules and combat semantics;
- full Profession progression mechanics and any not-yet-known core vocabularies;
- plugin authoring/versioning, plugin-contributed Quick Start activities, and plugin permission
  design;
- broader hosted operations, provider administration, recovery automation, and additional runtime
  setting bindings;
- aggregate-native World/Campaign AI transformations and broader Campaign/Instance media scope;
- derived-graph reliability/rebuild operations;
- deeper cross-aggregate API refinements that preserve the ownership rules already established.

Each item requires its own requirements/design or implementation gate. None authorizes restoring a
singleton World, blending authoring with play, weakening captured revision consistency, reviving a
generic domain write API, or using deprecated documents as present-day requirements.

## Closure decision

No additional implementation wave is required to close the information architecture and core API
realignment. Future work should start from the adopted architecture, implemented common types, and
this closure record, and should be named for the capability being built rather than treated as an
unbounded continuation of realignment.
