---
status: active
role: implementation-scope
---

# One-to-many authoring experience

This is the active scope for the user's request to replace multiline and stacked collection
editing with dedicated list, add, and edit pages, explicit removal, contextual left navigation,
and ancestry breadcrumbs throughout the application. The first implementation slice is Campaign
Plot authoring. This document records the source audit and delivery scope. The inventory describes the baseline
before the first slice; the dedicated Plot collection slice is now implemented, with bounded browser
evidence and remaining verification limits in `campaign-authoring-verification.md`.

The authority is [the documentation index](README.md), the common TypeScript types, and the
[canonical architecture](information-architecture-domain-model-realignment.md). In particular,
the architecture's “Product model” contextual navigation contract requires direct-entry URLs,
parent links, mobile equivalence, and breadcrumbs for **ancestry, not selected sections**.
Its Campaign Definition/Instance/Plot section preserves captured ownership, recursive Plots,
and explicit knowledge provenance. The user request refines the editing experience; it does not
turn immutable history into editable content or move Instance state into Definitions.

## Permanent scope exclusion

Feat, Heritage and Discipline are permanently removed from scope by user decision
on 2026-10-13. AU-19–21 are retired, not deferred. This supersedes earlier deferral
notes and excludes further concept-specific work from later batches. Existing
implementation and persisted-data descriptions are retained as facts, not future
requirements.

## Required interaction pattern

For each editable owned collection, the parent exposes a named collection destination in its
contextual left navigation. The collection has a dedicated list with useful summaries, an Add
action, and item links. Add and Edit open separate addressable experiences with one focused form,
Save and Cancel; they do not append another form below the list. Existing records expose an
explicit Delete action, with a named confirmation and dependency handling. Where the domain uses
archive, revoke, remove association, or an audited runtime command, use that operation and wording
instead of inventing destructive deletion. A confirmation dialog is sufficient for deletion;
a separate deletion page is not required.

Selecting a child record advances the contextual navigation frame. Breadcrumbs reconstruct the
actual parent ancestry, including recursive parents, on direct entry and reload. A dedicated child collection list is a real navigation frame and appears in the breadcrumb
ancestry between its owning record and a selected child. Ordinary section tabs do not become
artificial ownership ancestors. Names must resolve
without exposing internal identifiers. Record ancestry and destination navigation are distinct:
World library records retain the owning World's destinations in the sidebar/mobile drawer, while
property groups use local tabs inside the selected record view. Child collection lists and links
still open the corresponding records; scalar property groups never become sidebar destinations.

An owned child object is different from a scalar list or a reference selection. Stable child
identity, independently editable fields, nested children, ordering, provenance, or removal impact
are strong reasons for a collection workspace. Tags, dice values, coordinates, text paragraphs,
and checkbox selections do not require a page per scalar. Reference relationships with their own
rationale, state, or provenance do require a relationship editor; selecting an existing entity
must never edit or delete that source entity implicitly.

## Source-backed application inventory

“Partial” means some list/detail/navigation exists but the complete pattern is absent. “Gap”
means inline, multiline, or missing authoring. “Command/read-only” identifies a collection whose
lifecycle must be preserved rather than converted to generic CRUD. Priorities are delivery order,
not a claim that all later capabilities are already accepted for unrestricted manual authoring.

| Area and collection                                                                          | Baseline and required scope                                                                                                                                                                                                                                         | Priority         | Primary implementation/domain evidence                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| World library → World lineages                                                               | Partial: library, creation, selected World frame exist. Preserve archive/fork/publish semantics and verify parent navigation instead of replacing the frame.                                                                                                        | P2               | `routes/_gm.worlds.index.tsx`, `routes/_gm.worlds.new.tsx`, `worldDefinitionModel.ts`                                                                              |
| World → Locations and recursive child Locations                                              | Partial: Atlas and selected Location six-section frame exist; generic record editor and Connections contain creation/relationship controls. Separate Add Location and record editing, preserve root rules and containment ancestry.                                 | P1               | `WorldAuthoringPages.tsx:715,911`, `LocationWorkspacePages.tsx:506`, `types/locations.ts`                                                                          |
| Location → Discoveries/claims                                                                | Complete B04: dedicated claim list/Add/Edit, identity/provenance and named truth/conflict references. Preserves Location DiscoveryClaim[]; separate Plot facets are not migrated.                                                                                                | P1               | `LocationWorkspacePages.tsx:245,296,333,417`, `types/plots.ts:59,80`                                                                                               |
| Location → Creature and Item placements                                                      | Complete B04: dedicated Creature/Item placement list/Add/Edit, named source selection, position/presentation fields and source-safe removal; preserves unsupported-source placements.                                                                                                                                        | P1               | `WorldAuthoringPages.tsx:2057,2268,2368`, `types/placements.ts`                                                                                                    |
| Location → Connections                                                                       | Partial: containment parent/children UI is not a full connection-record editor. Distinguish reparenting from explicit traversable connections; expose connection records only under their actual ownership contract.                                                | P2               | `LocationWorkspacePages.tsx:506,544`, `types/locations.ts:291,301,330`                                                                                             |
| World → Creature/Item Definitions                                                            | Partial: library and selected record routes already exist; generic list/editor creation needs dedicated Add routes and consistent removal/navigation.                                                                                                               | P1               | `WorldAuthoringPages.tsx:755,782,877,911`, `routes/_gm.worlds.$worldId.bestiary.creatures.$creatureId.tsx`, `types/creatures.ts`, `types/items.ts`                 |
| Creature → Skills, Professions, equipment/attribute selections                               | Mixed: checkbox/value selections are references, not owned Skill/Profession definitions. Rich proficiency, progression, inventory or equipped-item records need separate child experiences when authored; do not manufacture source definitions through a checkbox. | P2               | `WorldAuthoringPages.tsx:1834,1858,1937,1977`, `types/creatures.ts`, `types/professions.ts`                                                                        |
| World → Skill/Profession/Background and other Character-option Definitions                   | Partial: definition-kind libraries and selected records exist. Audit Add/Delete routing for each supported kind; missing domain kinds are capability gaps, not implemented pages.                                                                                   | P1               | `WorldAuthoringPages.tsx:2548,2588`, `routes/_gm.worlds.$worldId.characters.$definitionKind.$definitionId.tsx`, `types/character.ts`                               |
| Profession → expertise levels, modifier grants                                               | Complete B03: dedicated tier/benefit/grant contexts, exact adopted rank keys, synchronized tier order, costs/windows and preservation of grant IDs/dice/stacking.                                                                    | P1               | `ProfessionModifiersEditor.tsx:11,35,44`, `types/professions.ts:50,95`, `types/modifiers.ts`                                                                       |
| Profession → acquisition rules, actions/improvements, choices/prerequisites                  | Complete B03: dedicated acquisition and Action progression/improvement contexts, shared expressions/limits/predicates/Choices, named references and revision-pinned persistence.                                                                                  | P2               | `types/professions.ts:88,95,97,98`, `WorldAuthoringPages.tsx:2763`                                                                                                 |
| Character-option Definition → traits, choices, restrictions                                  | Domain capability gap: nested typed content is not a complete list/Add/Edit experience. Preserve imported richer content until explicit supported editors exist.                                                                                                    | P2               | `types/character.ts:118,135,146,148`, `WorldAuthoringPages.tsx:2588`                                                                                               |
| World → rules                                                                                | Complete B04: dedicated rule routes, stable selection and deletion, revision-pinned dedicated API persistence and strict imported-rule guards.                                                                                                      | P1               | `WorldRulesPage.tsx:40,307`, `WorldRuleEditor.tsx:671`, `types/world-rules.ts:16`                                                                                  |
| Rule → ordered effects/conditions and nested expressions                                     | Complete B04: focused ordered-effect and recursive-condition list/Add/Edit contexts. Expression operands remain within focused editors; WorldRule grammar and execution semantics unchanged.           | P1               | `WorldRuleEditor.tsx:310,407,753,760,794`, `types/world-rules.ts:56,69,106`                                                                                        |
| Model registry → vocabulary elements                                                         | Complete B04: separate vocabulary list/Add/Edit, explicit archive and immutable revision publication/exact adoption. Existing Models & taxonomies destination retained.                                                                       | P1               | `WorldAuthoringPages.tsx:2815,2891,3378,3395`, `types/model-registry.ts`                                                                                           |
| Model Schema Structure → Concepts, Fields, Relationships                                     | Complete B04: dedicated Concept/Field/Relationship contexts, parent/endpoints/cardinality and presentation controls, metadata preservation and unchanged archive/release lifecycle.                                                                                    | P1               | `WorldModelStructureEditor.tsx:56,428,488,544,838`, `types/model-registry.ts:147,225,245`                                                                          |
| Campaign library → Definitions/Instances                                                     | Partial: library, create routes and frames exist. Verify create/cancel destinations and exact selected lineage, preserve separation of Definition and Instance.                                                                                                     | P2               | `routes/_gm.campaigns.index.tsx`, `CampaignDefinitionPages.tsx:114`, `CampaignInstancePages.tsx:190`                                                               |
| Campaign Definition → root Plots; Plot → subplots                                            | Partial: list/selected Plot routes, but hierarchy selection and editing share the page; deletion missing at baseline. First slice supplies full recursive record contexts and lifecycle.                                                                            | P0               | `CampaignDefinitionPages.tsx:622`, `routes/_gm.campaigns.definitions.$campaignDefinitionId.plots.$plotDefinitionId.tsx`, `types/plots.ts:141`                      |
| Plot → Objectives, Pressures, Resistances                                                    | Gap: identity-bearing objects flattened to multiline names. First slice: dedicated collection and child forms exposing supported fields, preserving IDs/extensions and sibling order.                                                                               | P0               | `CampaignDefinitionPages.tsx:1072,1083,1094`, `types/plots.ts:31,40,49,149`                                                                                        |
| Plot → Discoveries → truth/beliefs/rumors                                                    | Gap: pipe-delimited multiline Discovery editing hides the composed facets. First slice must keep one Truth plus explicit supporting/contradicting Belief and Rumor records, including provenance.                                                                   | P0               | `CampaignPlotCollectionPage.tsx`, `types/plots.ts:58,80`                                                                                                           |
| Plot → Location contexts → actor/item placement intents                                      | Gap: Location checkboxes preserve hidden context objects but do not expose rich owned children. Dedicated context selection/editor and child intents; source Locations remain captured read-only.                                                                   | P0/P1            | `CampaignDefinitionPages.tsx:1134`, `types/plots.ts:100,113,126,132`                                                                                               |
| Plot → prerequisites/dependencies                                                            | Gap: checkbox relationships plus rationale mixed into Plot form. Relationship list/Add/Edit/remove with cycle and cross-branch validation; removing a link never deletes its target Plot.                                                                           | P1               | `CampaignDefinitionPages.tsx:622`, `types/plots.ts:25,154,155`                                                                                                     |
| Campaign Definition → placement overlays                                                     | Gap: list plus inline Add/Edit. Dedicated overlay routes, independent vs decorated source handling, Plot associations and named removal impact.                                                                                                                     | P1               | `CampaignDefinitionPages.tsx:1206`, `types/placements.ts`                                                                                                          |
| Campaign → preparation defaults                                                              | Scalar fields are not separate child entities. Existing notes/templates remain forms; structured per-Location canvas configurations, when exposed, need a collection editor.                                                                                        | P2               | `CampaignDefinitionPages.tsx:1641`, `types/campaign-instance.ts:35`                                                                                                |
| Instance → Plot/objective progress and Location realizations/knowledge                       | Command-bound gap: stacked progress controls. Dedicated captured Plot progress detail and nested records; no Add/Delete of captured Plot Definitions. Reveals/overrides retain authority and audit semantics.                                                       | P2               | `CampaignInstancePages.tsx:650`, `types/plots.ts:208,225,231`                                                                                                      |
| Instance → placement realizations, creature embodiments, item instances                      | Command-bound gap: placement cards and controls share a page. Separate selected realization/actor details; only supported realize/defer/replace/remove commands.                                                                                                    | P2               | `CampaignInstancePages.tsx:826,1017`, `types/campaign-instance.ts:136`                                                                                             |
| Instance → members/invitations/Characters                                                    | Gap: roster combines member, invitation, Character import/review forms and lists. Separate collection destinations and record pages; invitations revoke and membership changes follow authority, not generic delete.                                                | P2               | `CampaignInstancePages.tsx:1093,1487,1548,1699`, `types/participation.ts`, `types/player-api.ts`                                                                   |
| Instance → Agents                                                                            | Gap: configuration form plus configured-Agent list. Dedicated Add/Edit and supported removal, preserve profile/assignment distinction.                                                                                                                              | P2               | `CampaignInstancePages.tsx:2097,2216,2279`, `types/campaign-instance-api.ts`                                                                                       |
| Instance → Sessions                                                                          | Partial: Session record routes exist; planning form embedded in list. Separate Plan Session, preserve lobby/start/pause/conclude/cancel lifecycle and historical records.                                                                                           | P2               | `CampaignInstancePages.tsx:2361,2523`, `CampaignSessionPage.tsx:38`, `types/session.ts`                                                                            |
| Player → Instance Characters                                                                 | Partial: character list and selected creation/review flow exist. Reference choices and allocated attributes remain focused form controls; any rich Character child records need ownership-aware pages.                                                              | P2               | `CharacterCreationPage.tsx:77,407,459,509`, `routes/_player.play.instances.$campaignInstanceId.characters.$characterId.tsx`                                        |
| Players directory → selected Player, identities/memberships                                  | Gap for selected profile navigation: directory selection is inline. Identity/membership collections are read-only or command-controlled, not GM-owned editable identity records.                                                                                    | P2               | `routes/_gm.players.tsx:147,189,222,237`                                                                                                                           |
| Settings → areas/settings                                                                    | Partial: areas selected in one route, multiple SettingCards stacked. Addressable area/setting details improve navigation; fixed settings taxonomy is not an Add/Delete collection. Credential rotation/revocation remains protected.                                | P2               | `routes/_gm.settings.tsx:110,140,158,180`, `types/system-settings-api.ts`                                                                                          |
| Revisions, migration plans/impacts, Session participants/events/summaries/movement proposals | Command/read-only: retain lists, pagination and named detail views. No generic edit/delete for immutable snapshots, event journals, receipts or historical attendance.                                                                                              | Exempt from CRUD | `CampaignInstancePages.tsx:2601,2702`, `CampaignSessionPage.tsx:635,684,746`, `SessionMovementPanel.tsx`, `types/versioning.ts`, `types/movement-execution-api.ts` |
| Map geometry, terrain cells/chunks, walls, transitions; aggregate cultural/political records | Specialized/domain gap: terrain remains a spatial editor, not pages per voxel. Named transitions/walls or authored cultural/political records warrant focused list/detail only when supported ownership and editing scope are established.                          | P2               | `LocationTerrainEditor.tsx`, `types/locations.ts:204,222,270`, `types/isometric-terrain.ts`                                                                        |

Implementation file paths in this table are relative to `apps/web/src`; `types/` paths are relative
to `packages/common/src`. Line anchors identify the inspected baseline and may shift during delivery.
No deprecated documents were used. Hidden domain collections are reported explicitly rather than
misrepresented as currently editable UI.

## Delivery and verification gates

1. Deliver the recursive Plot slice first. Establish reusable list/detail/add navigation, a single
   focused child editor, stable record identity, deletion policy, and provider save/dirty semantics.
2. Apply that pattern to existing high-risk multiline or stacked authoring: World discoveries and
   placements, Campaign overlays, Profession grants, rules and Models. Preserve each resource's
   immutable adoption and source ownership rules.
3. Extend to Instance operational records, Players/Settings navigation, and richer domain content.
   Resolve unsupported capability and authorization questions before exposing mutations. The user
   request authorizes consistent UX work, not fabricated runtime state or schema-free generic CRUD.

Every delivered collection must have empirical browser coverage of these bounded scenarios:

- Empty list → Add → required-field failure → save → list/detail → reload shows persisted fields.
- Select an existing child → edit one field → save retains its identity, unexposed rich data and all
  untouched siblings. Include duplicate display names and first/middle/last list positions.
- Cancel Add and Edit; navigate by sidebar, parent breadcrumb and browser back/forward with dirty
  input; cancel departure preserves it, accepted departure discards only the intended unsaved edit.
- Delete cancellation and confirmation; named dependency failures; deletion of another item while
  editing retains the current unsaved form and dirty guard. Successful removal preserves siblings.
- Direct entry/reload reconstructs correct contextual sidebar and human ancestry. Unknown records
  are neutral, cross-owner IDs denied, and ancestor reparenting updates breadcrumbs without cycles.
- Pending save prevents duplicates; rejected save retains input; stale revision blocks overwrite;
  archived/read-only permissions block click and keyboard submissions. Refresh/retry recovers.
- Keyboard navigation and submit, narrow viewport/drawer, focus after transition, and no visible
  opaque IDs. Collection lists have useful names, accessible actions and explicit empty states.
- Immutable captured records, references and histories remain immutable. Removing an association
  never deletes its source; Instance changes never mutate a World or Campaign Definition.

Record each implemented collection's concrete route, controls, assertions and evidence in a
verification record. A shared component test alone does not prove every route, and the existing
[Campaign authoring verification](campaign-authoring-verification.md) covers the previous form
experience, not this new route pattern. This scope-only change does not change common types or
persisted resources; the AI-facing domain model guide remains accurate.

## Item structured editing — 2026-10-12

Item-owned Traits and Actions now have dedicated addressable collection and Add/Edit
pages, including Actions owned by Traits and Vehicle data. Vehicle scalar fields,
speeds, cargo and component references have structured controls. The forms preserve
unexposed rule data; this does not complete costs/outcomes/effects, choices or
prerequisite editing. Current completion, verification limits and next scope are
tracked in [BACKLOG SE-01/SE-02](../BACKLOG.md).

### Action Outcomes and Effects — 2026-10-13

Direct Item Actions, Trait Actions and Vehicle Actions now expose ordered Outcome
and Effect collection pages with focused Add/Edit, confirmed removal and reorder.
Outcome labels and Effect labels use ordinal positions rather than internal IDs.
The forms cover narrative, damage, healing and movement effects, simple constant
and dice terms, and unspecified/always/never Outcome conditions. Richer effects,
expressions and predicates are preserved; unsupported effects remain read only
with explicit reorder/removal. This is a bounded authoring increment, not complete
rule grammar editing or execution. Backlog SE-02 records verification boundaries.

### Action Costs — 2026-10-13

Direct Item, Trait and Vehicle Actions now expose ordered Cost collection and
Add/Edit pages. The forms cover economy, resource constant amounts, capacity,
item-use, hit-die and movement costs with confirmed removal and reorder. Custom
costs, advanced amounts, private data and source references remain preserved;
replacement of advanced amounts or hidden bindings is explicit. Action-owned
validation reports indexed malformed fields without introducing new rule grammar.
Backlog SE-03 records verification and the next bounded slice, Action choices.

### Action Choices — 2026-10-13

Action authoring now has dedicated Choice and Option collection/Add/Edit pages for
direct Item, Trait and Vehicle Actions. Its boundary is prompts, selection limits,
optional visibility/duplicate settings, option labels and primitive JSON values.
Catalog references, prerequisites and complex values are retained without adding
selection execution or catalog semantics. Ordered lists support confirmed removal
and consecutive reorder; imported ambiguous identities safely block editing.
Backlog SE-04 records verification; the broader rules grammar remains outside this
increment.

### Action Prerequisites — 2026-10-13

Action authoring provides ordered prerequisite collection/Add/Edit pages beneath
direct Item, Trait and Vehicle Actions. It covers atomic checks and preserves
compound predicates, comparisons, definition references and custom rules as
read-only entries with explicit reorder/removal. Bound values remain authored
data; this increment does not bind or execute rules. Backlog SE-05 records scope,
verification and remaining work.

### Compound Action Prerequisites — 2026-10-13

Prerequisite authoring now supports `all`, `any` and `not`
with addressable nested child lists and focused editors. Atomic editors are reused
at each depth, and edits retain ancestor, sibling and unsupported predicate data.
Action validates supported descendants recursively; empty groups remain valid and
a missing `not` child remains an incomplete draft. This does not add evaluation or
comparison/reference semantics. Backlog SE-06 records verification and next scope.

### Comparison Action Prerequisites — 2026-10-13

The comparison increment uses the existing prerequisite routes, including compound
children. It exposes the common comparison operators and constant, primitive
literal, path, event-value and collection-count operands. Advanced operands and
complex literals remain preserved until explicit replacement. Action owns the
supported operand validation; evaluation and operand compatibility remain deferred.
Backlog SE-07 records the current completion and verification status.

### Definition-reference Prerequisites — 2026-10-13

This slice adds `has-definition` to the existing root/nested prerequisite editors.
The selector offers named definition records from the current World draft, while
unavailable imported references stay preserved behind a neutral label until
explicit replacement. Action owns structural validation; catalog existence and
runtime possession are not inferred. Backlog SE-08 records verification and next
scope.

### Choice Option Prerequisites — 2026-10-13

The existing prerequisite editor is now reused beneath Action Choice Options,
including compound children, comparisons and named definition references. The
owned path retains the Choice and Option context and preserves complex Option
values, catalog references and siblings. Action owns the same recursive validation
for these predicates. Backlog SE-09 records completion and verification; custom
predicate execution and advanced expressions remain outside this slice.

### Trait Prerequisites — 2026-10-13

Item-owned Traits use the same root and nested prerequisite editors as Actions and
Choice Options. Shared grammar lives in an abstract domain base, while Trait and
Action expose their own validation diagnostics. Trait edits preserve embedded
Actions and their Options, private data, grants, modifiers, triggers and siblings.
Backlog SE-10 records delivery and verification; other Trait collections remain
subsequent work.

### Trait Choices and Options — 2026-10-13

Item-owned Traits now reuse the structured Choice and Option editors, including
nested Option prerequisites and contextual ancestry back to the Trait. Trait owns
Choice/Option validation through the shared rule grammar. Primitive Option values
are editable; existing complex values, catalog references, private fields and
other Trait collections remain preserved. Backlog SE-11 records delivery and
verification. Catalog authoring and complex value editing remain subsequent work.

### Trait Modifiers — 2026-10-13

Item-owned Trait rule modifiers use dedicated list/Add/Edit routes with ordering
and removal. Fields cover target, operation, priority, stacking, source label and
supported scalar values. Imported advanced expressions and predicates are preserved;
this slice does not provide predicate editing or rule execution. Trait owns
structural validation. These RuleModifier values are distinct from Model-backed
modifier grants. Backlog SE-12 records delivery and verification.

### Trait Modifier Predicates — 2026-10-13

Saved Item-owned Trait modifiers now expose one optional Predicate through the
shared recursive editor. Root removal deletes the optional field; nested groups
retain normal child-list behavior. Trait owns recursive validation at the actual
modifier predicate path. Modifier values, private fields and other rules are
preserved. Backlog SE-13 records verification. This extends authoring and structural
validation; predicate evaluation remains deferred.

### Trait Grants — 2026-10-13

Item-owned Traits expose an ordered grant-reference list with Add/Edit routes and
named definition selection. Unavailable imported references remain preserved until
explicit replacement or removal; duplicate references remain allowed by the current
contract. Trait owns the existing string-list validation. Private data and other
Trait rules are preserved. Backlog SE-14 records delivery and verification; grant
execution and catalog-existence validation are outside this slice.

### Trait Triggers and Effects — 2026-10-13

Item-owned Traits expose ordered Trigger lists and metadata editors, with nested
ordered Effect lists reusing narrative, damage, healing and movement controls.
Triggers and Effects use ordinal routes because the common contract has no child
identifiers. Revision checks protect edits after reordering. Trait owns metadata
and Effect validation; advanced effects, predicates, usage limits, private fields
and sibling rules remain preserved. Backlog SE-15 records delivery and verification.
Trigger predicate/limit editors and runtime execution remain subsequent work.

### Trigger Predicates — 2026-10-13

Saved Item-owned Trait Triggers reuse the optional singleton predicate editor,
including nested groups, comparisons and named definition references. Removing the
root deletes the optional predicate field. Trait owns recursive diagnostics at the
actual Trigger path. Existing Effects, usage limits, private fields and sibling
rules are preserved. Backlog SE-16 records verification; usage-limit editing and
runtime evaluation remain subsequent work.

### Trigger Usage Limits — 2026-10-13

The Trigger metadata form includes an optional UsageLimit fieldset. It covers uses
with a constant/path maximum and reset selection, recharge die and ordered success
results, once-per-turn/round/encounter, and resource bindings. Existing advanced
NumericExpressions and imported data remain preserved until explicit replacement or
removal. Trait owns structural validation; this does not introduce runtime counters,
recharge rolls or reset behavior. Backlog SE-17 records delivery and verification.

### Action Usage Limits — 2026-10-13

Direct Item Actions, Trait-owned Actions and Vehicle Actions share the Trigger
usage-limit controls. Each Action owns validation through shared rule grammar;
limits remain optional, imported advanced values and private fields are preserved.
Malformed supplied owner components block editing rather than being replaced with
empty objects. Backlog SE-18 records verification. Runtime limit execution remains
outside the authoring slice.

### Outcome Predicates — 2026-10-13

Saved Outcomes under direct Item, Trait-owned and Vehicle Actions expose the shared
optional singleton predicate editor. Nested groups, atomic conditions, comparisons
and named definition references persist in `OutcomeDefinition.when`; removing the
root omits that field. Outcome effects and private/sibling data remain preserved.
Action owns recursive validation at the actual Outcome path. Backlog SE-19 records
delivery and verification; runtime evaluation and complex expression authoring
remain outside this slice.

### Shared rule authoring — B01, 2026-10-13

Shared controls now cover built-in expressions, dice, D20 tests, durations, targets,
all noncustom Effects and structured Choice values. Direct Item, Trait and Vehicle
Actions and Trait Triggers reuse them, including comparisons, modifiers, resource
costs and usage maxima. `/rule/` descendants provide addressable focused collections
for targets/filters, nested branch/loop/repeat-save Effects and embedded Choice
options/prerequisites; embedded Modifier/Choice and predicate detail retain ancestry.
Scalar expression trees and dice terms remain cohesive value controls.

Custom Predicate/Cost/Effect/Area payloads and unknown imported tags are preserved-only;
emit-event names are editable but their payloads remain opaque. No runtime evaluation
or catalog execution semantics were added. Owning entities validate recognized grammar.
Desktop/mobile disposable-fixture journeys passed, including preservation, pending
saves, retry/conflict and read-only states. See BACKLOG B01 for measured verification
and B02–05 for remaining authoring scope; live database acceptance is still QA-03.

### Item and catalog actor owners — B02, 2026-10-13

Item rules now have focused `owner/` contexts for prerequisites, modifiers,
attunement prerequisites, capacity expressions/recharge and crafting ingredients,
currency costs, tool proficiencies and products. Shared controls edit crafting
duration/checks and nested predicates without replacing sibling or private content.

Bestiary exposes Catalog Creatures (`kind: monster`, common `MonsterComponents`),
and Characters exposes Catalog Character templates (`kind: character-template`).
These are explicit catalog entry points, separate from governed World Creatures,
World NPC templates and Instance Characters. Catalog creation indexes World
membership; edits use revision-pinned draft record saves. Existing malformed
containers are preserved and unavailable for destructive reconstruction.

Catalog Creature rules cover Traits, regional Traits, all six Action collections,
skills, speeds/restrictions, damage adjustments/predicates, senses, communication
and Discipline references. Character rules cover Traits, Choices/Options/
prerequisites and the common attribute-generation variants. Both reuse nested
Action/Trait/rule list and detail pages with durable owner ancestry. Common type
contracts remain unchanged; this does not implement runtime Character inheritance,
slot equipment, expression evaluation or combat changes. Remaining authoring work
is B03–05; authenticated database acceptance remains QA-03.


### Profession and Background authors — B03, 2026-10-13

AU-16–18 now expose built-in Profession and Background fields through their existing
libraries and dedicated owned-child contexts. Tier order uses exact adopted rank
keys; draft creation can precede the first tier. Nested saves retain private data,
use revision checks and apply the owning Model gate even on direct entry. Shared
references are filtered by the expected kind and visible labels hide internal IDs.
The user initially deferred Feat, Heritage and Discipline entry points (AU-19–21),
then permanently removed those concepts from scope; those
classes received validation support but no new editor destinations. Unknown/custom
extensions remain preserved. Runtime features remain deferred.

See [B03 verification](verification/b03-character-authoring.md) for the field matrix,
responsive browser evidence, review fixes, checks and measurement limits. B04–05
remain selected authoring work; authenticated database acceptance remains QA-03.

### World structured collections — B04, 2026-10-13

AU-22–24 now use dedicated collection and child authoring contexts with responsive
navigation, Cancel, revision-pinned saves and authoritative read-back. Location
claims retain the supported flat contract; Model authoring retains its existing
destination and immutable release lifecycle; WorldRule keeps its separate strict
grammar. Unsupported data is preserved or guarded rather than coerced.

See [B04 verification](verification/b04-world-collections.md) for field coverage,
desktop/mobile journeys, preservation checks and measured timings. Authenticated
database acceptance and cross-surface final coverage remain B05.

### Authoring integration and acceptance — B05, 2026-10-13

The selected B01–05 authoring milestone is closed. The actual World parent router
now retains dedicated editors; existing library destinations are discoverable,
supported root records have Cancel/removal, and Location collection writes use
the authoritative dedicated API. Malformed nested edits are guarded, imported
private/custom data is preserved, and active browser domain policies delegate to
owners. Current draft/publication structural gates are documented explicitly.

Sixteen authenticated real-database checks cover representative desktop/mobile
create/edit/save/reload/export/publication, permissions, conflicts, reference-safe
removal and failure/retry behavior. Field-level fixture evidence remains distinct
from live persistence evidence. See [B05 acceptance](verification/b05-authoring-acceptance.md)
and the [finite editable/preserved/excluded matrix](verification/b05-authoring-coverage.md).
These supersede earlier B01–04 notes leaving QA-03/B05 open. AU-19–21 are permanently retired;
B06–12 remain deferred with those concepts excluded; no runtime or whole-domain completion is implied.
