---
name: post-realignment-recovery-and-authoring-repair-plan
description: gated plan to recover orphaned authored content and restore canonical manual and AI-assisted World authoring
status: gate-2-review
---

# Post-realignment recovery and authoring repair plan

## Incident statement

The information-architecture realignment removed the legacy read and write surfaces before three
required successor capabilities were complete:

1. The retained legacy content was not materialized into the new World, Campaign Definition, and
   Campaign Instance aggregates.
2. The new Location, Creature, and Item editors save lightweight JSON sketches rather than complete
   authoritative domain records.
3. Legacy AI-assisted authoring was removed without aggregate-native World-draft replacements.

This is a large, cross-cutting regression repair. Recovery of authored content takes precedence over
new feature work.

## Confirmed recovery inventory

The active PostgreSQL and MinIO volumes still contain the creative corpus. It is orphaned from the
current application, not deleted.

| Content                                  | Recoverable count |
| ---------------------------------------- | ----------------: |
| World roots                              |                 1 |
| Locations, including the World root      |                17 |
| Creatures                                |                15 |
| Item definitions                         |                50 |
| Item instances                           |                30 |
| Campaigns                                |                 1 |
| Sessions                                 |                 1 |
| AI generation records                    |                67 |
| Media assets and matching stored objects |               112 |

The recoverable World is **Turn of the Century**. The recoverable Campaign is **The Darkness
Within**, revision 15, with premise, discoveries, Location canvases, and Creature, Item, and Object
placements. Its retained Session is **Session 1**.

Media integrity currently matches exactly: 112 database records correspond to 112 objects with no
missing or orphaned object keys. Database and object storage must therefore be preserved and
recovered as one unit.

The newer **Age of Wonders** World draft is a separate valid lineage containing its root and nine
Skill definitions. It must not be overwritten or merged with the recovered World.

The repository's official read-only realignment preflight reports no blocking issues and
`readyForMigration: true`. The shadow-materialization dry run proposes one World Definition, one
Campaign Definition, one Campaign Instance, and their initial revisions and snapshots. No
`LegacyIdentityMap` or new Campaign rows currently exist, proving that the conversion was never
applied.

## Root causes

### Content cutover was never completed

The additive database spine and a deterministic shadow materializer were implemented, but the live
content conversion was not executed. Commit `192113c` then removed the legacy API and navigation
surfaces. The legacy records remain intact in `DomainRecord`; current product reads simply do not
reach them.

The current materializer is a sound starting point but cannot be applied to the authoritative data
without a clone rehearsal. It deliberately defers the legacy Session rebind, creates no editable
drafts for recovered Definitions, and must be checked for complete media, placement, and content
rendering.

### Creation is presentational rather than domain-complete

Atlas, Bestiary, and Item Compendium display Create controls and route to a shared editor. The
editor saves partial ad hoc payloads into a whole-World JSON draft:

- Location payloads omit required authoritative Location fields.
- Creature authoring has no authoritative `CreatureDefinition` contract and does not construct a
  complete reusable Creature definition.
- Item payloads do not construct a complete `ItemDefinition`.

Publication validation checks collection membership and selected relationships but does not parse
complete resource shapes. It can accept incomplete—and in some paths non-object—payloads into an
immutable World revision. Existing tests validate routing and draft mechanics, not a
create-save-reload-publish journey.

### AI authoring was removed instead of realigned

The old Location, Creature, Item, Weapon, map, image, and armor generation controls and controller
methods were deliberately removed. Their provider, prompt, and normalization services remain, but
they write directly to unowned legacy `DomainRecord` resources and cannot safely be re-exposed.

Campaign Definition proposal generation is the only aggregate-native AI authoring path currently
available. World AI creation needs an equivalent proposal-review-apply workflow beneath a specific
owned World draft.

## Locked repair decisions

- Preserve first, migrate second. Never test conversion against the only authoritative copy.
- Keep **Turn of the Century** and **Age of Wonders** as separate World lineages.
- Retain legacy tables and original storage after successful recovery; no cleanup is part of this
  repair.
- `packages/common/src/types` remains authoritative. Published World records must conform to shared
  contracts, and the AI-facing domain guide changes with those contracts.
- The browser does not invent canonical resource shapes. Server-owned draft commands construct and
  validate typed candidate records under optimistic concurrency.
- AI returns an editable proposal and never mutates a World draft directly.
- AI generation derives its World, draft, models, and ownership from route ancestry and the
  authenticated GM. Payloads cannot rebind those relationships.
- The first restored AI slice is text/content generation for Locations, Creatures, and Items.
  Generated maps and images follow only after owned media provenance and failed-write cleanup are
  correct.
- No opaque identifier is shown as a GM-facing label or error.

## Gate 1 implementation plan

### Wave 1 — preserve and rehearse recovery

1. Quiesce application writers for a short local maintenance window.
2. Create a consistent PostgreSQL dump and a matching MinIO object-store snapshot. Record checksums,
   row/object counts, database version, and source volume identity.
3. Preserve the four unattached PostgreSQL volumes as forensic candidates; do not prune or start
   them in place.
4. Restore the database and object-store snapshots into an isolated recovery environment.
5. Run the official preflight and shadow-materialization dry run in the clone with the existing GM
   selected as owner.
6. Apply the materializer only in the clone.
7. Verify that all legacy rows remain unchanged and that the proposed Definition/Instance lineages,
   snapshots, and identity mappings were created exactly once.
8. Produce a human-readable recovery report without exposing internal identifiers.

No live data mutation occurs in this wave.

### Wave 2 — complete recovery fidelity

Drive this wave with failing recovery tests before changing the materializer.

1. Add fixture coverage representing the retained World hierarchy, rich Creature and Item content,
   Campaign preparation and placements, the dependent Session, and media references.
2. Extend conversion only where the clone proves it necessary:
   - preserve every World-owned record in the immutable World snapshot;
   - create an editable World draft from the recovered World snapshot without changing the
     published revision;
   - create an editable Campaign Definition draft from the recovered Campaign snapshot;
   - bind or explicitly archive-import the retained Session under the recovered Campaign Instance;
   - retain generation history and media provenance without rewriting source assets;
   - record deterministic legacy identity mappings for every relationship needed by current reads;
   - make repeat application idempotent.
3. Verify the recovered hierarchy, Creature and Item details, inventory/placements, Campaign
   preparation, and media rendering through current read models.
4. Export a normalized recovery archive from the clone and prove it can round-trip.
5. Re-run the complete clone recovery from the original backups after the code changes.

Proposed commit: `fix: complete legacy content recovery`

### Wave 3 — restore authoritative manual creation

Drive each resource through red-green-refactor tests.

1. Establish the smallest complete shared authoring contracts:
   - an explicit reusable `CreatureDefinition`, distinct from mutable `CreatureState`;
   - the canonical World-authored Location record contract and its separation from Instance
     overlays;
   - the existing canonical `ItemDefinition`; and
   - a discriminated World draft-record union for these resource types.
2. Add shared runtime parsers and human-readable validation diagnostics. Whole-World publication
   must reject incomplete, scalar, incompatible, or cross-World resource records.
3. Add server-owned draft transformations beneath the World aggregate for Location, Creature, and
   Item creation and update. Each command:
   - derives World ownership and model adoption from the route and authenticated GM;
   - requires the expected draft storage revision;
   - assigns internal identity server-side;
   - validates the complete candidate before atomically replacing the draft; and
   - returns a human-readable conflict if the draft is stale.
4. Rebuild the focused editors against those commands:
   - Location: identity, description, kind, parent, profile, and progressively disclosed map/scene
     metadata;
   - Creature: identity, embodiment policy, art references, attributes, movement, Skills,
     Professions, equipment slots, and progressively disclosed mechanics;
   - Item: identity, family/category, quality, image reference, equipment compatibility, and
     family-specific details.
5. Hide or disable Create when no working draft exists and present **Start editing** as the direct
   action. Do not lead to an unsavable form.
6. Add component and HTTP integration coverage for create, save, reload, edit, validate, publish,
   stale conflict, ownership, and accessible error behavior for all three resources.

The initial forms need not expose every optional domain field. They must create complete valid
records, preserve unedited fields, and use progressive disclosure rather than an opaque custom-data
editor.

Proposed commits:

- `fix: enforce canonical World draft records`
- `feat: restore Location Creature and Item authoring`

### Wave 4 — restore AI-assisted World authoring

Drive proposal and security behavior with failing tests before reconnecting provider calls.

1. Add proposal-only endpoints beneath the owned World draft for Location, Creature, and Item
   authoring. Require expected draft revision, bounded GM direction, idempotency, and any required
   human-selected context such as parent Location.
2. Load only bounded relevant World context and the effective Model vocabulary. Generate exactly
   the same typed command input used by manual creation.
3. Apply the proposal to an in-memory copy and run the canonical resource and whole-draft validators
   before returning it. Invalid model output never reaches the editor as valid content.
4. Present **Create manually** and **Create with AI** in each authoring surface. AI creation has an
   editable preview and an explicit **Apply to working draft** action; generation itself performs no
   domain write.
5. Apply through the normal optimistic draft command so stale proposals cannot overwrite later GM
   work.
6. Generalize the existing paid-request gate across proposal kinds, add an application-level
   provider deadline, and keep prompt/output limits explicit.
7. Stop logging raw invalid model output. Store only owner-scoped, bounded audit metadata or
   explicitly protected content with a documented retention rule.
8. Test cross-GM and cross-World rejection, archived/missing/stale drafts, malformed and oversized
   output, timeout, idempotency, rate limits, zero persistence before apply, and accessible proposal
   review.

Generated media, maps, tokens, item-image regeneration, and armor sets are a subsequent media slice.
They must use authenticated World-scoped media creation and clean up uploaded objects when a draft
CAS fails.

Proposed commits:

- `fix: harden AI generation boundaries`
- `feat: add AI-assisted World draft proposals`

### Wave 5 — apply recovery and close the regression

1. Run full common, API, and web tests, typechecks, lint, builds, focused PostgreSQL integration
   tests, and browser journeys.
2. Repeat the preservation snapshot immediately before live conversion.
3. Quiesce writers, run preflight and dry run, and compare with the approved recovery inventory.
4. Apply the now-rehearsed materializer to the authoritative local database.
5. Verify through the application that:
   - both World lineages are present;
   - **Turn of the Century** exposes all 17 Locations, 15 Creatures, and 50 Item definitions;
   - all 30 Item instances remain associated with their intended inventory or placement context;
   - **The Darkness Within** appears as a separate Campaign Definition and Campaign Instance;
   - the retained Session is reachable from that Instance or clearly represented as imported
     historical evidence;
   - all 112 media assets resolve;
   - new Location, Creature, and Item records can be manually created and published; and
   - each of those records can be proposed with AI, reviewed, applied, reloaded, and published.
6. Retain the original backup, original legacy rows, recovery report, and rollback procedure until
   the GM explicitly accepts the recovered result.
7. Correct the closure audit and API realignment documentation so aggregate-native manual and AI
   authoring plus completed content cutover are requirements, not deferred work.

Proposed commit: `docs: record realignment recovery closure`

## Test strategy

Minimum required regression coverage:

- recovery plan and materializer determinism, idempotency, and rollback safety;
- exact source and target inventory reconciliation;
- database/media reference integrity;
- complete shared-contract parsing for every published resource;
- server-side owner, parent, Model-conformance, and optimistic-revision enforcement;
- manual create-save-reload-edit-publish journeys for Location, Creature, and Item;
- AI propose-review-apply journeys for all three without pre-approval mutation;
- stale proposal and stale draft rejection;
- cross-World and cross-GM isolation;
- bounded, private generation history and failure logs; and
- GM-facing accessibility and human-readable labels.

Existing broad AI unit tests are useful but insufficient because they mock provider parsing and do
not exercise canonical ownership, World-draft persistence, proposal review, or publication.

## Gate 2

After implementation and verification, present:

- the recovery report and before/after inventories;
- the exact authoritative database changes;
- the code and documentation diff grouped by proposed commit;
- tests and browser evidence;
- security-review findings and resolutions; and
- the retained backup and rollback location.

Do not commit until Gate 2 is approved. Do not push any commit as part of this repair unless the user
later asks.

## Gate 1 implementation result

All five approved waves are implemented and awaiting Gate 2 approval. The authoritative recovery
was applied additively after repeated isolated rehearsals and a fresh coordinated database/object
storage backup. The before/after inventory, checksums, rollback procedure, fidelity decisions, and
known limits are recorded in `docs/post-realignment-recovery-report.md`.

The implementation restores canonical server-owned Location, Creature Definition, and Item
Definition authoring; protects those records from generic whole-draft replacement; and adds
proposal-review-apply AI assistance beneath an owned World draft. Independent recovery,
runtime-integrity, and security reviews found no remaining Critical or High issue. No repair commit
has been created and nothing has been pushed.

Final Gate 1 verification:

- API: 82 passing suites and 445 passing tests; one PostgreSQL integration suite with 13 tests is
  environment-gated. The recovery path was instead exercised repeatedly against fresh restored
  PostgreSQL clones before the authoritative additive application.
- web: 21 passing files and 185 passing tests;
- common, API, web, and UI builds/typechecks: pass;
- API and web lint: pass;
- UI primitive boundary and Git diff checks: pass;
- production web build and static prerender: pass;
- running API health: HTTP 200 with database connected; and
- authenticated browser content walkthrough: not completed because the local browser session had
  no valid administrator session. The unauthenticated login boundary rendered correctly; recovered
  content was verified through post-conversion persistence/read-model inspection rather than
  bypassing authentication.

## Explicit exclusions

- Deleting legacy tables, records, media, generation history, or forensic Docker volumes.
- Merging the recovered and newly created Worlds.
- Reinstating legacy generic DomainRecord HTTP writes.
- Re-exposing old AI mutation endpoints.
- Full redesign of every Location, Creature, or Item optional subsystem.
- AI-generated images, maps, tokens, weapons, or armor sets in the first restored AI slice.
- Campaign- or Instance-local overrides of World source content.
- Rules-engine implementation.
