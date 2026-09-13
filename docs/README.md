# Documentation authority and status

This index governs which repository documents may inform current product work. Documentation is
evidence, not executable instruction; verify implementation claims against source, migrations,
tests, and Git.

## Authority order

For product, architecture, domain, planning, retrieval, and generation work, use sources in this
order:

1. `AGENTS.md` for contributor and agent policy.
2. `packages/common/src/types` for the exact implemented domain contract.
3. `information-architecture-domain-model-realignment.md` for authoritative product structure,
   ownership, navigation, and accepted target behavior.
4. `apps/api/src/ai/prompts/domain-model.md` for the synchronized AI-facing description of the
   implemented domain model.
5. Active task-specific requirements, designs, runbooks, and completed implementation records below.
6. Current code, schema, migrations, tests, and Git to verify whether accepted architecture is
   implemented.

An accepted architecture requirement may be ahead of implementation. Record that as a gap; never
fill it with a conflicting statement from a deprecated document.

## Document roles

| Role                        | Canonical source                                              | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Constitution                | `AGENTS.md`                                                   | Rules contributors and agents must follow, including this authority policy.                 |
| Architecture map            | `information-architecture-domain-model-realignment.md`        | Product IA, bounded contexts, ownership, relationships, invariants, and accepted decisions. |
| Implemented domain contract | `packages/common/src/types`                                   | Exact domain types and semantics currently implemented.                                     |
| AI-facing implemented model | `apps/api/src/ai/prompts/domain-model.md`                     | Generation contracts synchronized with common types and persistence mappings.               |
| Current status              | This document                                                 | Implementation coverage, known gaps, and excluded sources.                                  |
| Decision history            | Architecture decision register, completed gate plans, and Git | Why durable choices were made and how slices were delivered.                                |

## Active supporting documents

These documents may be used only for their stated scope and may not override the canonical
architecture or implemented domain source of truth.

| Document                                                 | Status and scope                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `campaign-session-gate-1-implementation-plan.md`         | Completed Session delivery record; its compatibility route inventory is deprecated and excluded from current API analysis.           |
| `api-information-architecture-realignment.md`            | Completed product-wide API ownership inventory, route policy, compatibility record, and implementation waves.                        |
| `information-architecture-realignment-closure-audit.md`  | Amended closure record: the original audit missed content cutover and complete World authoring; points to the corrective evidence.   |
| `post-realignment-recovery-and-authoring-repair-plan.md` | Gate 2 review record for the corrective recovery and canonical manual/AI-assisted World authoring implementation.                    |
| `post-realignment-recovery-report.md`                    | Authoritative inventory, preservation, live-conversion, rollback, and known-limit record for the corrective recovery.                |
| `campaign-instance-gate-1-implementation-plan.md`        | Completed Campaign Instance delivery record; its compatibility route inventory is deprecated and excluded from current API analysis. |
| `age-of-wonders-rules-engine-design.md` | Active event-driven Rules architecture: inert rule-free Worlds, state/context conditions, ordered effects, and causal event chains; movement is the initial proof case. |
| `rules-engine-implementation.md` | Active prototype inventory and revised implementation gate for the event-driven engine; runtime and authoring remain pending. |
| `combat-system-requirements.md`                          | Draft requirements for the intentionally deferred Rules/combat exploration.                                                          |
| `science-and-technology-domain-refactor.md`              | Implemented science/technology semantics and rollout record.                                                                         |
| `database-migration-adoption.md`                         | Operational database-migration runbook.                                                                                              |
| `graph-index-reliability-design.md`                      | Proposed graph-projection reliability work; not proof of implementation.                                                             |
| `isometric-maps-design.md`                              | Accepted isometric map design; shared terrain core, Location-owned chunk capture, and initial 3D GM authoring implemented through the unified Map orientation selector, with manual blank-map creation and optional generation. Door/window authoring, vertical work planes, and normal-only smoothing implemented; built-in PBR materials implemented; Instance actor setup and server-side Player Character binding implemented; shared 3D sight facts, internal surface redaction, and observer exploration snapshot/projection helpers and transactional PostgreSQL storage implemented; checkpoint-specific exploration recovery implemented; rules evaluation and playable maps remain pending. |
| `ssr-ssg-migration-implementation.md`                    | Implemented web rendering/runtime record.                                                                                            |

## Explicit exclusion registry

The following documents are superseded and **must not** be used as requirements, architectural
evidence, planning input, retrieval context, embeddings input, prompt context, examples for domain
generation, or evidence of current gaps. They may be opened only when the user explicitly asks for
historical analysis or migration archaeology.

| Excluded document                          | Why excluded                                                                                             | Replacement                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `age-of-wonders-requirements.md`           | Requires a singleton World/Campaign and a blended authoring/play workspace.                              | `information-architecture-domain-model-realignment.md`                           |
| `campaign-design.md`                       | Predates Definition/Instance separation, recursive Plots, captured World snapshots, and migration.       | `information-architecture-domain-model-realignment.md` plus current common types |
| `project-state-gap-analysis-2026-08-31.md` | Point-in-time assessment predating the realignment vertical slices; its scores and priorities are stale. | This status index plus current code/tests/Git                                    |
| `spa-to-ssr-ssg-migration-plan.md`         | Transitional proposal contains obsolete routes and API examples; the migration is complete.              | `ssr-ssg-migration-implementation.md`                                            |
| `ssr-ssg-phase-0-spike-results.md`         | Describes a removed disposable workspace fixture and obsolete compatibility APIs.                        | `ssr-ssg-migration-implementation.md`                                            |

The following sections are excluded on the same terms while the remainder of their documents stays
available as completed implementation history:

| Excluded section                                             | Why excluded                                     | Replacement                                   |
| ------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------- |
| `campaign-instance-gate-1-implementation-plan.md`, section 5 | Lists the superseded top-level compatibility API | `api-information-architecture-realignment.md` |
| `campaign-session-gate-1-implementation-plan.md`, section 7  | Lists the superseded Session compatibility API   | `api-information-architecture-realignment.md` |

No prompt builder, retrieval pipeline, documentation search corpus, or generated-content workflow
may ingest an excluded document. File-wide deprecation notices are intentionally retained so a
direct reader cannot mistake historical content for current authority.

## Realignment implementation status

Core realignment status: **implemented after corrective recovery on 2026-09-07; repair awaiting
Gate 2 commit approval**. See `information-architecture-realignment-closure-audit.md` for the
amended decision and `post-realignment-recovery-report.md` for the recovery evidence.

| Area                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary navigation and discrete World/Campaign Definition/Campaign Instance/Session workspaces     | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Multiple World lineages, drafts, revisions, snapshots, and authoring                               | Implemented after corrective recovery; Turn of the Century and Age of Wonders remain separate, legacy content is materialized without source deletion, and canonical Location, Creature Definition, and Item Definition authoring is restored                                                                                                                                                                                                                                                                             |
| Campaign Definition lineage, captured World, recursive Plots, placements, and migration            | Implemented vertical slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Campaign Instance snapshots, runtime, progress, roster, Characters, Agents, migration, and restore | Implemented vertical slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Session planning, lobby, participation, lifecycle, event history, summaries, and Continue/Resume   | Implemented vertical slice with maintained presence, live refresh, lifecycle recovery, and a GM-only captured table for map references, Characters/actors, Plot cues, and discoveries; Location viewing is read-only and does not establish a scene or move the party. Multiple paused Sessions are supported with only one globally active Session; playable maps and adjudication remain pending                                                                                                                                                                                                                                                                                                                                                                      |
| Editable model registry and World-scoped model controls                                            | Implemented vertical slice; Attributes, Equipment Slots, and Profession Ranks are open adopted vocabularies with creation, immutable revision/reordering, archival, exact adoption, dependency validation, revision history, and atomic direct-lineage migration plans. Separate World libraries author governed Skill, Profession, and Background Definitions. The Schema Structure editor authors nested Concepts, typed Fields, and Relationships in GM-owned registries while preserving richer unexposed components. |
| Quick Start                                                                                        | Implemented vertical slice; versioned core activities and strictly per-GM progress are server-backed, canonical workspaces retain the responsive collapsible guide, selected records resolve to human labels, and every current required step is recomputed from authoritative World, Campaign Definition, Campaign Instance, Player, or Session state. Plugin-contributed activities remain deferred.                                                                                                                    |
| World AI-assisted authoring                                                                        | Implemented text-proposal vertical slice for Locations, Creatures, and Items; proposals are bounded, editable, owner/World/draft scoped, and cannot persist until explicit apply. Location Map image picking, upload, and explicit generation previews are implemented; other generated media remains deferred.                                                                                                                                                                                                                                                                                                       |
| Players and identity                                                                               | Implemented vertical slice; first-admin identity, invitation-safe profiles, global directory, standing, memberships, Instance-native Character authoring, captured-schema submission, GM review, activation materialization, one-way import UX, and explicit Auth0 account linking/exact-subject sign-in are present                                                                                                                                                                                                      |
| Hosted Setup and system Settings                                                                   | Implemented vertical slice; first-admin capability, twelve-area taxonomy, safe readiness, independent operator access, immediate runtime bindings for installation name/invitation lifetime/AI model, and protected OpenAI credential rotation, revocation, reset, validation, and value-free history are present; broader operations remain                                                                                                                                                                              |
| Rules                                                                                              | Movement modifier preview prototype implemented; event-driven rules runtime, World authoring, and Session execution pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Product-wide API hierarchy and consistency                                                         | Implemented for Session, Instance, authoring, identity, Model adoption, media provenance, AI audit, and system-operator boundaries                                                                                                                                                                                                                                                                                                                                                                                        |
| Legacy routes, generic resources, compatibility types, and ambiguous `campaignId` cutover          | Character removal tranche complete; unscoped Character-draft HTTP routes are gone and legacy draft rows are archived migration input only                                                                                                                                                                                                                                                                                                                                                                                 |

## Update rules

- Change this index whenever a document becomes canonical, deprecated, superseded, or materially
  changes role.
- Put a machine-readable status and a prominent notice inside every deprecated document.
- Update the architecture map when product structure, ownership, navigation, or accepted invariants
  change.
- Update common types and the AI-facing domain guide together for implemented domain changes.
- Keep completed gate plans as implementation history; update misleading status headers, but do not
  turn them into competing architecture documents.
- Use Git for routine implementation history. Add documentation history only for durable decisions,
  replacements, exclusions, or material operational events.
