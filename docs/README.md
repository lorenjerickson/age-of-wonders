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

| Document                                          | Status and scope                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `campaign-session-gate-1-implementation-plan.md`  | Completed Session delivery record; its compatibility route inventory is deprecated and excluded from current API analysis.           |
| `api-information-architecture-realignment.md`     | Active product-wide API inventory, target route policy, compatibility plan, and implementation waves.                                |
| `campaign-instance-gate-1-implementation-plan.md` | Completed Campaign Instance delivery record; its compatibility route inventory is deprecated and excluded from current API analysis. |
| `combat-system-requirements.md`                   | Draft requirements for the intentionally deferred Rules/combat exploration.                                                          |
| `science-and-technology-domain-refactor.md`       | Implemented science/technology semantics and rollout record.                                                                         |
| `database-migration-adoption.md`                  | Operational database-migration runbook.                                                                                              |
| `graph-index-reliability-design.md`               | Proposed graph-projection reliability work; not proof of implementation.                                                             |
| `ssr-ssg-migration-implementation.md`             | Implemented web rendering/runtime record.                                                                                            |

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

| Area                                                                                               | Status                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary navigation and discrete World/Campaign Definition/Campaign Instance/Session workspaces     | Implemented                                                                                                                                                                                                                                                                                                          |
| Multiple World lineages, drafts, revisions, snapshots, and authoring                               | Implemented vertical slice                                                                                                                                                                                                                                                                                           |
| Campaign Definition lineage, captured World, recursive Plots, placements, and migration            | Implemented vertical slice                                                                                                                                                                                                                                                                                           |
| Campaign Instance snapshots, runtime, progress, roster, Characters, Agents, migration, and restore | Implemented vertical slice                                                                                                                                                                                                                                                                                           |
| Session planning, lobby, participation, lifecycle, event history, summaries, and Continue/Resume   | Implemented vertical slice                                                                                                                                                                                                                                                                                           |
| Editable model registry and World-scoped model controls                                            | Partial; not every vocabulary, relationship, dependency, or migration is authorable                                                                                                                                                                                                                                  |
| Quick Start                                                                                        | Partial; Session completion is authoritative, earlier activities remain locally self-confirmed                                                                                                                                                                                                                       |
| Players and identity                                                                               | Implemented vertical slice; first-admin identity, invitation-safe profiles, global directory, standing, memberships, Instance-native Character authoring, captured-schema submission, GM review, activation materialization, one-way import UX, and explicit Auth0 account linking/exact-subject sign-in are present |
| Hosted Setup and system Settings                                                                   | Implemented read-only vertical slice; first-admin capability, twelve-area taxonomy, safe readiness, and independent operator access are present; writable configuration/secret workflows remain                                                                                                                      |
| Rules                                                                                              | Deliberately deferred                                                                                                                                                                                                                                                                                                |
| Product-wide API hierarchy and consistency                                                         | Implemented for Session, Instance, authoring, identity, Model adoption, media provenance, AI audit, and system-operator boundaries                                                                                                                                                                                   |
| Legacy routes, generic resources, compatibility types, and ambiguous `campaignId` cutover          | Character removal tranche complete; unscoped Character-draft HTTP routes are gone and legacy draft rows are archived migration input only                                                                                                                                                                            |

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
