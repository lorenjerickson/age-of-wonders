# Age of Wonders domain model

This document is the AI-facing serialization guide for the domain model implemented in
`packages/common/src/types`. The TypeScript source remains authoritative. Generate JSON that
matches these structures exactly: omit optional properties when they are unknown, include every
required property, use the documented discriminant values, and never add explanatory prose around
a requested JSON payload.

There is no magic in the authoritative game system. Every apparently supernatural event is a
physical phenomenon, biological capability, scientific process, or technology, even when people
in the setting misunderstand it. Folkloric terms may appear in names, aliases, beliefs, and quoted
descriptions, but never as authoritative mechanical causation.

## Model conventions

### Definitions and state

The model separates reusable rules content from mutable play state.

- A **definition** describes reusable rules or authored content. Definitions use the common
  `Definition` envelope and are referenced by `DefinitionId`.
- A **state aggregate** describes one mutable thing in a game. Most state aggregates use
  `StateIdentity` and reference definitions rather than copying them.
- A **game state** is an authoritative snapshot that composes a campaign, its entities, geography,
  encounter state, decisions, executions, events, and deterministic random state.

Do not embed a definition where an `...Id` property is expected. Do not use a runtime entity ID as
a definition ID. IDs are serialized as strings even though TypeScript brands them by purpose.

### Common JSON shapes

```ts
type NamespacedKey = `${string}:${string}`;
type RulesEdition = "2014" | "2024" | `homebrew:${string}`;

interface VersionedState {
  revision: number;
  updatedAt: string; // ISO-8601 timestamp
}

interface StateIdentity {
  id: string;
  version: VersionedState;
}

interface RulesSource {
  namespace: string;
  edition: RulesEdition;
  book?: string;
  page?: number;
  url?: string;
  license?: "CC-BY-4.0" | "OGL-1.0a" | "proprietary" | "private" | string;
}

interface DefinitionIdentity {
  id: string;
  key: NamespacedKey;
  name: string;
  description?: string;
  source: RulesSource;
  tags?: string[];
}

interface Definition {
  identity: DefinitionIdentity;
  kind: string;
  components: object;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

All `extensions` objects must use namespaced keys such as `aow:session-zero`. Extension values must
be JSON values. Standard open-string fields accept their documented values and may accept a custom
string; prefer a namespaced custom value where ambiguity is possible.

Other shared values include:

- `Distance`: `{ "value": number, "unit": "foot" | "mile" | "square" | "hex" | "meter" | "kilometer" }`
- `Weight`: `{ "value": number, "unit": "pound" | "ounce" | "kilogram" }`
- `Duration`: `{ "kind": "instantaneous" }`, `{ "kind": "until-event", "event": string }`,
  `{ "kind": "permanent", "neutralizable"?: boolean }`,
  `{ "kind": "measured", "amount": number, "unit": "turn" | "round" | "minute" | "hour" | "day" | "week" | "month" | "year" }`,
  or `{ "kind": "special", "description": string }`.
- `ResourcePool`: `{ "current": number, "maximum": number, "temporary"?: number }`.
- `AttributeCollection<T>` is a legacy compatibility projection:
  `{ "standard": { ...legacy standard attributes }, "custom"?: { [namespacedKey]: T } }`. Its
  standard keys remain `might`, `intellect`, `will`, `hardiness`, `charisma`, `agility`, `fortune`,
  and `sanity` until persisted values migrate. New model authoring uses the exact Model Schema
  Releases described below. The editable core model defines `wisdom`, not `will`; migration must
  apply the explicit legacy Will-to-Wisdom mapping and must never silently reinterpret the key.
  `AttributeScore` remains an integer from 0 through 100, with a neutral default of 50.

### Definition lineages, revisions, and captured snapshots

The shared contracts now include the additive identity and version spine for the domain-model
realignment. These contracts coexist with the legacy persisted campaign and world shapes while
storage and callers migrate; they are not yet generic domain API resource categories.

IDs for each role are separately branded and must never be interchanged:

```ts
type WorldDefinitionId = string;
type WorldDefinitionRevisionId = string;
type WorldDefinitionSnapshotId = string;
type CampaignDefinitionId = string;
type CampaignDefinitionRevisionId = string;
type CampaignDefinitionSnapshotId = string;
type PlotDefinitionId = string;
type CampaignInstanceId = string;
type CampaignInstanceSnapshotId = string;
type CampaignInstanceRuntimeId = string;
type ModelRegistryId = string;
type ModelElementId = string;
type ModelElementRevisionId = string;
type ModelSchemaReleaseId = string;
type ModelMigrationPlanId = string;
```

A `WorldDefinition` and `CampaignDefinitionLineage` are stable logical identities with mutable
authoring-head metadata. Their published revisions are immutable and use
`DefinitionRevisionIdentity`, which records the lineage ID, a monotonically increasing revision
number, the direct predecessor revision, publication time, and a content hash. A revision may only
name a predecessor from its own lineage.

```ts
interface DefinitionRevisionIdentity<LineageId, RevisionId> {
  id: RevisionId;
  lineageId: LineageId;
  revisionNumber: number;
  predecessorRevisionId?: RevisionId;
  publishedAt: string;
  contentHash: string;
}

interface WorldDefinition {
  identity: StateIdentity; // WorldDefinitionId
  name: string;
  description?: string;
  currentRevisionId?: WorldDefinitionRevisionId;
  archivedAt?: string;
  extensions?: Record<NamespacedKey, JsonValue>;
}

interface CampaignDefinitionLineage {
  identity: StateIdentity; // CampaignDefinitionId
  name: string;
  description?: string;
  worldDefinitionId: WorldDefinitionId;
  currentRevisionId?: CampaignDefinitionRevisionId;
  archivedAt?: string;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

`WorldDefinitionRevision` owns the published root Location, Location membership, definitions,
legacy schema selections, and required `modelSchemaReleaseIds` for one World revision. Those IDs
select exact immutable Model Schema Releases; a World never resolves a mutable registry head or
embeds editable registry records. `CampaignDefinitionRevision` owns its authored premise,
introduction, Plot references, and placement references, and captures the exact replicated World
snapshot against which it was authored. Neither revision resolves a mutable upstream authoring
head.

Snapshots contain complete, content-addressed replicas rather than live pointers:

```ts
interface SnapshotResourceRecord {
  resourceType: string;
  sourceId: string;
  sourceRevision?: number;
  contentHash: string;
  payload: JsonValue;
}

interface SnapshotManifest {
  formatVersion: number;
  contentHash: string;
  records: SnapshotResourceRecord[];
}
```

A `WorldDefinitionSnapshot` identifies its source World lineage and revision. A
`CampaignDefinitionSnapshot` identifies its source Campaign Definition lineage and revision and
the captured World snapshot required by that revision. A `CampaignInstance` is a distinct played
realization and points to its current immutable `CampaignInstanceSnapshot`. That Instance snapshot
captures both a Campaign Definition snapshot and the same World snapshot required by the captured
Campaign Definition; migration creates the next snapshot with a direct predecessor and preserves
the old snapshot. `CampaignInstanceRuntime` is the mutable continuing state identity and always
names both its Campaign Instance and the Instance snapshot against which its records conform.

`CampaignId`, `CampaignDefinition`, `CampaignState`, and their `campaignId` relationships remain
legacy compatibility contracts for existing storage and callers. `CampaignId` is deprecated
because it historically identifies both authored campaign content and mutable play state. New code
must use the separately branded Definition, Instance, snapshot, and runtime identifiers. Compatibility
readers may translate legacy aggregates during the migration window; AI output must not invent a
relationship between the new contracts by reusing a legacy `CampaignId`.

### Editable Model Registry and exact releases

The Model Registry is the editable meta-model for core and GM-authored structure. It keeps a small,
fixed set of meta-kinds—`concept`, `field`, `relationship`, `vocabulary`, and
`vocabulary-option`—while `semanticRole` is an open namespaced key. Therefore Attributes,
Equipment Slots, movement modes, item families, profession ranks, art roles, Skills, Professions,
and Backgrounds can grow without adding TypeScript discriminants for every new concept. A GM may,
for example, publish `loren:attribute-likeable` or `loren:equipment-slot-wings` as a new
`vocabulary-option` revision.

`ModelRegistry` is a stable registry identity with `system`, `plugin`, or `gm` provenance. System
and plugin registries are globally applicable and are authored/versioned outside any World or
Campaign. A GM registry records its owner, and each element lineage declares `global`, `world`, or
`campaign-definition` applicability. `ModelElementLineage` carries the stable namespaced key,
fixed kind, open semantic role, lifecycle status, and optional authoring head.
`ModelElementRevision` is immutable and contains exactly one typed payload plus advisory
`ModelPresentation`, dependency declarations, provenance, and author attribution.

Field payloads use a safe typed AST rather than executable JavaScript. Atomic values are string,
integer, number, boolean, bounded JSON, vocabulary-option references, Definition references,
Entity references, or concept values; fields may also be lists. Cardinality, literal or CEL value
sources, applicability, allowed values, and validation expressions are data. CEL is identified by
the fixed `aow:model-expression/v1` profile and declares a typed `resultType` value descriptor, but
this contract and its deterministic compiler do not execute CEL. Presentation metadata supplies
labels, help, grouping, ordering, editors, units, media, and layout hints; it does not change
storage or validation meaning.

A `ModelSchemaRelease` selects one exact immutable revision for each included lineage and locks any
dependency releases by ID. Its canonical hash covers those selections and dependencies. Compiling
a release validates hashes, ownership, kind agreement, references, cardinality/default safety,
dependency conflicts and cycles, and produces a deterministically ordered exact closure. It never
infers a current element revision. `ModelMigrationPlan` maps one exact source release to one exact
target release with explicit element mappings and optional typed backfills. A source-only mapping
explicitly retires an element; a target-only mapping introduces one. A newly required field needs a
target mapping with a type-correct backfill unless its target revision supplies a default or
computed value. Adoption is all-or-nothing through a new World Definition revision; content
governed by a World records the exact release IDs in `ModelConformance`.

The editable core seed supplies Wisdom and the other core Attributes, the documented Equipment
Slots, movement modes, item families (including Object, Trap, and Hazard), profession ranks, and
portrait/overhead-token/side-on-token art roles. These are seed data, not closed enums. The seed
also publishes explicit mappings from legacy `attributes.standard.will` to Wisdom and from legacy
`paperDollToken` imagery to the side-on-token art role.

The Model Registry uses dedicated relational persistence and is not a generic `DomainRecord`
resource. At application startup, the Model Registry module idempotently materializes the
deterministically identified core registry, element lineages, immutable element revisions, and
core release. Existing deterministic identities are preserved rather than rewritten. Changes to
the core seed require a new immutable release identity; consumers retain the exact older release
until they explicitly adopt its successor.

All Model Registry HTTP endpoints require an authenticated GM:

- `GET /model-registries` lists registries owned by that GM plus readable system/plugin registries.
  `GET /model-registries/:id` returns one accessible registry with its human-readable elements and
  immutable release history. Neither query grants edit rights to a global or another GM's registry.
- `POST /model-registries` creates a GM-owned registry from a namespaced key, name, and optional
  description. The authenticated GM becomes the provenance owner.
- `POST /model-registries/:id/releases/extend` is the bounded convenience workflow currently used
  by contextual World editors. It creates new elements, carries forward the predecessor release's
  exact selections, locks the installed core release dependency, validates the complete effective
  closure, and publishes one successor transactionally.
- `GET /model-registries/effective?worldDefinitionId=...` reads the explicitly selected release
  roots from that GM's mutable World draft, compiles accessible exact releases and their locked
  dependencies, rejects overlapping stable keys, filters by global/World applicability, and returns
  human-readable Attribute, Equipment Slot, and general element projections. It does not infer a
  latest release and does not read a Campaign Instance-local schema.

### Relational World Definition API

The additive World lineage spine is persisted in the relational `WorldDefinition`,
`WorldDefinitionRevision`, and `WorldDefinitionSnapshot` models rather than the generic
`DomainRecord` resource table. This preserves referential constraints between a lineage, its
current immutable revision, direct revision ancestry, and content-addressed snapshots while the
legacy root-Location representation remains available during migration.

The GM-authorized `GET /world-definitions` endpoint lists every active and archived lineage owned
by the authenticated GM; another GM's lineage is neither listed nor returned by explicit lookup. Each
item includes its transport ID, human-readable name and description, lifecycle status, archive and
update metadata, and—when published—human-readable current-revision metadata. It deliberately omits
revision `content` and snapshot `manifest` payloads. The endpoint is a library query only: response
order does not establish a current World and clients must explicitly select a lineage.

`GET /world-definitions/:id` reads one explicitly selected lineage and returns its revisions and
their captured snapshots, including immutable revision content and snapshot manifests. Missing
lineages and persistence failures use neutral errors that do not echo the requested opaque ID.

World authoring is draft-first. `POST /world-definitions` creates one independently selectable,
GM-owned World lineage and one mutable working draft in a serializable transaction; it does not
publish revision 1. When content and records are omitted, the service seeds a root World Location,
the complete top-level collections, and the installed core Model Schema Release. Optional supplied
content and records become the complete initial draft rather than a patch over another World.

Each World has at most one mutable draft:

- `POST /world-definitions/:id/draft` starts or resumes the authenticated owner's draft. If a
  draft already exists, it returns that draft without creating another. Otherwise the request must
  name the World's exact current `baseRevisionId`; the service verifies the current revision's
  canonical snapshot manifest and authoritative revision record, then seeds the draft from that
  immutable capture. A legacy revision without Model Schema selections receives the installed core
  release as its explicit draft selection; publication still requires normal validation and
  conformance. Archived Worlds and stale bases cannot start a draft.
- `GET /world-definitions/:id/draft` returns the authenticated owner's complete working content,
  snapshot records, base revision/snapshot metadata, optimistic storage revision, and validation
  status.
- `PUT /world-definitions/:id/draft` replaces the complete draft content and record collection. It
  requires `expectedStorageRevision`, increments that revision atomically, and invalidates any
  earlier validation report. A stale save conflicts rather than overwriting another edit.
- `POST /world-definitions/:id/draft/validate` validates the exact requested storage revision. It
  checks bounded JSON, reserved server records, collection/record completeness, the root Location,
  and the Location containment graph, then stores a report tied to that same revision.
- `GET /world-definitions/:id/draft/impact` compares the draft records with its captured base and
  reports additions, changes, removals, and human-readable downstream Campaign Definition
  migration eligibility. It is analysis only and changes no published state.
- `POST /world-definitions/:id/draft/publish` publishes the complete draft, never a partial patch.
  It requires the exact optimistic draft revision, recomputes validation, verifies that the draft
  is based on the current World head, and checks that selected Model Schema Releases are readable
  by the GM. In one serializable transaction it creates the next immutable World revision, stores
  its ordered exact release selections, builds a content-addressed snapshot with a server-owned
  `world-definition-revision` record, guarded-advances the World head, and advances the draft base.
  `sourceDraftRevision` makes retrying an already successful publication idempotent. No Campaign
  Definition or Campaign Instance is migrated automatically.

Publication record payloads are bounded JSON. Callers never submit revision, record, manifest, or
snapshot hashes; the server computes canonical revision and record hashes and the complete manifest
hash. At most 4,999 caller records are accepted so the authoritative server record keeps the final
snapshot within the 5,000-record limit.

World lineage lifecycle and copying are also explicit:

- `POST /world-definitions/:id/archive` and `POST /world-definitions/:id/restore` require the exact
  `expectedMetadataRevision`. Archiving hides the World from normal active selection and freezes
  draft editing, validation, and publication without deleting revisions, snapshots, or downstream
  Campaign captures.
- `POST /world-definitions/:id/forks` requires an explicit snapshot from a World owned by the GM.
  It creates a new World lineage and unpublished draft, remaps captured resource identities and
  references, and stores immutable fork provenance. It does not establish a live link or alter the
  source World.

All draft, lifecycle, fork, list, and detail operations are owner-scoped. Missing resources,
stale revisions, and unavailable dependencies use neutral human-readable errors without echoing
opaque identifiers.

### Relational Campaign Definition read API

The additive Campaign authoring spine is persisted in `CampaignDefinition`,
`CampaignDefinitionRevision`, and `CampaignDefinitionSnapshot`. The GM-authorized
`GET /campaign-definitions` endpoint is a compact library query: it returns each lineage's
human-readable metadata, lifecycle status, current revision summary, and the captured World
revision summary while omitting revision content and snapshot manifests. It never selects a
Campaign Definition by recency and never follows the mutable current World head. List and detail
queries are scoped to lineages owned by the authenticated GM.

`GET /campaign-definitions/:id` reads one explicitly selected lineage and its immutable current
revision content. Its World provenance is resolved through the revision's captured
`WorldDefinitionSnapshot`, so the response remains internally consistent even after newer World
revisions are published. The endpoint does not substitute current World content for the capture.
Missing lineages and persistence failures use neutral errors that do not echo opaque identifiers.
Both GET endpoints are read-only.

`POST /campaign-definitions` creates a new Campaign Definition lineage and its first complete
immutable revision. The request names an explicit `worldDefinitionSnapshotId` and supplies the
complete Campaign revision `content` and a complete `snapshotManifest`; it never names a live World
head. `snapshotManifest` contains `formatVersion` and at least one complete resource record
with `resourceType`, `sourceId`, optional `sourceRevision`, and `payload`. Callers do not submit
record or manifest hashes: the server hashes each payload, constructs the required top-level
`manifest.contentHash`, and stores that same hash as the Campaign snapshot's `contentHash`. One
authoritative `campaign-definition-revision` record is prepended with payload exactly equal to the
stored revision content. Publication JSON is limited to 64 nested levels and at most 4,999 caller
records (5,000 after the authoritative record). One
serializable transaction creates the owned lineage, revision 1 capturing that
exact World snapshot, its Campaign snapshot, and then sets `currentRevisionId`. The authenticated GM
is recorded as lineage owner and revision author. Content and manifest hashes are canonicalized and
computed by the server rather than trusted from the client.

`POST /campaign-definitions/:id/revisions` publishes one complete direct successor. Its request must
name the current `predecessorRevisionId`, an explicit `worldDefinitionSnapshotId`, a revision name,
complete replacement content, and a complete replacement manifest. The transaction verifies that
the predecessor is still the selected Campaign lineage's current head and that the World snapshot
belongs to the same World Definition lineage. It creates exactly the next revision and snapshot,
then advances the head with a compare-and-set guard. A stale predecessor, missing snapshot, or
cross-lineage World migration aborts the whole transaction. This is the all-or-nothing primitive for
optionally migrating Campaign authoring to a newer World revision; partial-field migration and
latest-World inference are not supported.

### Campaign Instance creation

The GM-authorized `POST /campaign-instances` endpoint creates one played Campaign Instance from an
explicit immutable Campaign Definition snapshot. Its request contains only a human-readable `name`
and `campaignDefinitionSnapshotId`. It never accepts the ambiguous legacy `campaignId`, selects a
snapshot by recency, or substitutes the mutable current Campaign or World authoring head.

Creation is one serializable transaction. The service loads a selected Campaign Definition
snapshot, its immutable Campaign revision, and the exact captured World snapshot and World revision
required by that Campaign snapshot, scoped through a Campaign Definition owned by the authenticated
GM. It verifies both source manifests and their persisted hashes before writing, and rejects missing,
foreign-owned, or inconsistent provenance.
It then creates a `PREPARING` Campaign Instance, an initial `CampaignInstanceSnapshot` with
`snapshotNumber: 1` and `reason: "INITIAL"`, a mutable `CampaignInstanceRuntime` bound to that
snapshot, and finally records the snapshot as the Instance's current snapshot.
The authenticated GM is recorded as the creator of both the Campaign Instance and its initial
snapshot; ownership/audit identity is never accepted from the request body.

The initial Instance snapshot manifest is a deterministic compatibility capture. It replicates the
complete Campaign Definition and World snapshot manifests together with their snapshot/revision
identities, capture times, revision numbers, and content hashes. Its own content hash is derived
from that complete manifest. This makes the Instance reproducible even after either authoring
lineage advances. The runtime begins with `state: { "formatVersion": 1 }`; mutable play state is not
written into Definition snapshots. Failure rolls back the whole transaction, so no Instance,
snapshot, or runtime may exist alone.

### Relational Campaign Instance read API

`GET /campaign-instances` lists each played realization by human-readable name and lifecycle status,
with compact names and revision numbers for the Campaign Definition and World Definition captured
by its current `CampaignInstanceSnapshot`. It omits runtime state and snapshot manifests. The query
walks only the stored snapshot relationships; it never follows mutable Definition heads and never
selects an Instance by recency.

`GET /campaign-instances/:id` returns one explicitly selected Instance, its immutable compatible
Campaign/World snapshot provenance, and non-payload runtime metadata such as storage revision and
last update time. It does not return the mutable runtime JSON. Active Session state is currently
omitted because the relational Instance-to-Session relationship has not yet been introduced; the
API must not guess through a legacy `campaignId`. Both endpoints require GM authorization and use
neutral not-found/unavailable responses that do not echo opaque identifiers. Both reads are scoped
to Instances created by the authenticated GM; selecting another GM's Instance behaves as not found.

### Legacy realignment shadow materialization

The legacy conversion preflight inventories every generic `DomainRecord` resource. The deterministic
shadow planner assigns World-owned resources to exact World captures, rebinds known Instance
dependents, and explicitly retains resources whose target aggregate is deferred; it never silently
drops an unclassified record. Revision content hashes are computed from the exact JSON persisted in
the revision row, while every proposed snapshot uses the same canonical `SnapshotManifest` hash
contract as live publication.

Shadow application is idempotent only when an existing deterministic row is field-equivalent to the
plan. A duplicate identity with different content aborts the transaction instead of being hidden by
`skipDuplicates`. Successful shadow writing advances the installation rollout only to
`READY_FOR_CUTOVER`, with no completion timestamp; validation and explicit cutover remain separate
work.

Every dry run and apply operation requires one explicitly selected, persisted GM owner; the CLI
accepts this through `AOW_REALIGNMENT_OWNER_USER_ID`. The service validates that identity's GM role
and never guesses among server users. New World and Campaign lineages are owned by that GM, their
revisions name that GM as author, and migrated Campaign Instances and initial Instance snapshots name
that GM as creator. For an earlier unattributed shadow attempt, recovery may adopt only the mutable
World/Campaign lineage owner and Campaign Instance creator fields. It never updates immutable
revision or Instance-snapshot authorship: a matching historical row may retain a null author, while
a non-null different author or any differing content aborts the transaction. Fresh immutable inserts
still record the selected GM. The rollout state and audits record the same initiating GM.

The first apply fixes the rollout capture time. Later applies for the same installation and migration
reuse that stored start time even if the caller supplies a newer time, so immutable revision,
snapshot, runtime, and identity-map rows remain byte-equivalent on an unchanged rerun. A rollout
already initiated by a different GM cannot be silently adopted.

### Campaign Definition Plots and Instance progress

`PlotDefinitionId` is a separately branded identity. A `PlotDefinition` belongs to one
`CampaignDefinitionId` and declares either `{ kind: "root" }` or a subplot parent in that same
Campaign Definition. A Campaign Definition may have several roots, and every subplot is a complete
Plot that may itself have children. Parent cycles and cross-Definition parentage are invalid.
Prerequisites and dependencies also stay inside one Campaign Definition and form one acyclic
relationship graph. They normally target a parent or ancestor; a cross-branch relationship must
include a human-readable `crossBranchRationale`.

Each Plot carries flexible arrays of Objectives, Pressures, Resistances, Discoveries, and
`PlotLocationContext` records; the contracts do not impose singular cardinality. A Location context
references a Location in the Campaign revision's captured World snapshot. Its actor and Item
placement intents are authored source references or roles. `capturedWorldPlacementId` marks an
intent as a decoration of captured World placement data; it does not transfer ownership of that
placement to the Campaign.

Runtime realizations are deliberately separate. `PlotActorRealization` names a runtime entity,
`PlotItemRealization` names an Item instance, and both point back to their authored placement-intent
IDs. They occur only inside `CampaignInstancePlotProgress`, which is keyed by both
`CampaignInstanceId` and `PlotDefinitionId`. Instance progress owns status, Objective progress,
runtime realization links, per-Creature knowledge, revealed claims, and approved overrides. It does
not copy Plot parentage into a second runtime hierarchy or turn mutable actors and Items into
Campaign Definition content.

A `PlotDiscovery` contains claims discriminated as `truth`, `belief`, or `rumor`. Truth claims do
not offer a contradiction field. Beliefs and Rumors may name claims they conflict with, and a Rumor's
`relatedTruthClaimId` is optional because a false Rumor need not resolve to a Truth. Per-Creature
knowledge is separately discriminated as `knows-truth`, `holds-belief`, or `heard-rumor`; learning a
claim never changes its epistemic kind.

Use `validatePlotHierarchy` before accepting an authored Plot set. It reports duplicate identities,
missing or cross-Definition parents and relationship targets, parent cycles, combined
prerequisite/dependency cycles, and unexplained cross-branch relationships without mutating input.
Plot contracts are not yet persistence resources; they are captured through Campaign Definition
revision content until an aggregate-specific persistence workflow is introduced.

### Relational Campaign Instance participation persistence

The additive participation spine persists the current Instance-scoped contracts without rebinding
or removing legacy Campaign membership, invitation, Character draft, or `sessions` resource rows.
These relational tables are not generic domain resources and do not yet imply public authoring or
play APIs:

| Contract or protected boundary                  | Relational table                       | Integrity boundary                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerProfile`                                 | `PlayerProfile`                        | One durable profile per authenticated User; server standing is independent of Instance membership and contact fields are encrypted/hashed, never returned by the shared profile contract                          |
| Protected authentication-provider association   | `AuthenticationProviderAssociation`    | Provider subjects use hash/encrypted columns and credentials use an external reference; plaintext subjects or credentials are forbidden; status and associated/disabled timestamps must form a coherent lifecycle |
| `CampaignInstanceHumanMembership`               | `CampaignInstanceHumanMembership`      | Explicit Instance FK; Player role requires a Player profile, while GM and Spectator roles forbid one                                                                                                              |
| Protected `CampaignInstanceInvitation` workflow | `CampaignInstanceInvitation`           | Explicit Instance FK; Player/Spectator only; contacts are encrypted/hashed and invitation credentials are hash-only; acceptance/revocation fields must agree with status and chronology                           |
| Non-human Agent identity                        | `AgentIdentity`                        | GM-owned stable Agent identity with protected configuration reference rather than embedded credentials                                                                                                            |
| `CampaignInstanceAgentParticipation`            | `CampaignInstanceAgentParticipation`   | Explicit Instance and Agent FKs; observe and act capability arrays are stored separately and contain only open namespaced string keys                                                                             |
| `CampaignInstanceSession`                       | `CampaignInstanceSession`              | Explicit Instance FK with lifecycle-consistent start/conclusion/cancellation timestamps, schedule, event-log, summary, and extension metadata                                                                     |
| `SessionParticipation`                          | `SessionParticipation`                 | Exactly one human membership or Agent participation; composite FKs require it and its Session to share the same Instance                                                                                          |
| `CampaignInstanceCharacterAssociation`          | `CampaignInstanceCharacterAssociation` | A Character ID belongs to one Instance and Player membership; active Character and one-way import provenance use same-Instance/source-lineage composite FKs                                                       |

Database checks enforce the role discriminants, provider/invitation/Session lifecycle chronology,
namespaced Agent capability arrays, protected JSON shapes, exactly-one participant, join/leave
chronology, and complete one-way Character import provenance. A PostgreSQL partial unique index
permits many active Campaign Instances but no more than one `ACTIVE` relational Session across the
installation. Runtime code must not infer an active Session from legacy `campaignId` data.

## Persisted API resources

The generic domain API persists the legacy compatibility resources below. The identifier used by
that API is derived as shown. During additive realignment, an existing installation may still have
one legacy root `locations` World and one legacy `campaigns` record, but this is not the target
cardinality: the relational Definition APIs support multiple World and Campaign Definition
lineages. Legacy destructive World deletion is disabled while archive and dependency-safe
retention replace the old cascade. Sessions and runtime ownership must move to Campaign Instances
before the legacy singleton guards and ambiguous `campaignId` contracts are removed.

| Resource               | Aggregate                                   | Stored ID              | Stored kind/name                                |
| ---------------------- | ------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `definitions`          | `GameDefinition`                            | `identity.id`          | `kind`, `identity.name`                         |
| `rule-variants`        | `RuleVariant`                               | `id`                   | `rule-variant`, `name`                          |
| `content-packs`        | `ContentPackManifest`                       | `id`                   | `content-pack`, `name`                          |
| `extension-schemas`    | `ExtensionSchema`                           | `id`                   | `extension-schema`, `key`                       |
| `systems`              | `GameSystemDefinition`                      | `id`                   | `game-system`, `name`                           |
| `games`                | `GameState`                                 | `campaign.identity.id` | `game-state`, campaign name                     |
| `campaigns`            | `CampaignDefinition` (legacy compatibility) | `identity.id`          | name                                            |
| `sessions`             | `SessionState`                              | `identity.id`          | name                                            |
| `characters`           | `CharacterState`                            | `identity.id`          | name                                            |
| `creatures`            | `CreatureState`                             | `identity.id`          | name                                            |
| `items`                | `ItemInstance`                              | `id`                   | `item-instance`, name override or definition ID |
| `objects`              | `ObjectState`                               | `identity.id`          | name                                            |
| `scenes`               | `SceneState`                                | `identity.id`          | name                                            |
| `locations`            | `LocationState`                             | `identity.id`          | `kind`, name                                    |
| `location-connections` | `LocationConnectionState`                   | `identity.id`          | `kind`                                          |
| `encounters`           | `EncounterState`                            | `identity.id`          | name                                            |
| `pending-decisions`    | `PendingDecision`                           | `id`                   | `pending-decision`                              |
| `game-events`          | `GameEvent`                                 | `id`                   | `type`                                          |

Fields ending in `Id` or `Ids` become graph relationships automatically. Keep references in those
fields rather than inventing parallel reference structures.

World-authored item definitions are stored in `definitions` with `kind: "item"` and the owning
world ID in `extensions["aow:worldId"]`. Item instances use the same extension when created by a
world-scoped workflow. Supplying `worldId` while listing either resource filters on that extension;
other world-owned aggregates use their top-level `worldId` field. Removing a root world removes
these world-scoped item instances and definitions along with its creatures and location hierarchy.

Legacy stored aggregates are temporarily normalized by the science-domain compatibility reader.
The versioned persistence migration rewrites changed aggregates with optimistic revision increments
and replaces their derived graph projections. This compatibility behavior is for old records only;
AI output must always use the current contracts in this guide.

Portable domain snapshots use the versioned `aow:science-domain-archive` envelope. Each record
contains a resource category and one complete aggregate. Archive creation and reading apply the
same compatibility migration, reject duplicate canonical identities, and emit human-readable
exception reports without exposing internal identifiers. Persistence-facing CLI commands export a
new archive without overwriting an existing backup and import it as a dry-run-by-default merge.
Apply mode uses optimistic aggregate replacement and rebuilds every imported graph projection.
Ordinary create and replace operations reject legacy contracts; only the explicit migration and
archive workflows may normalize legacy data.

Complete host transfers use the separate versioned `aow:host-transfer-archive` format. Its
compressed artifact preserves full selected `DomainRecord` rows (including revisions and
timestamps), every `MediaAsset` row, every object-storage byte under its original key, checksums,
and the exact Prisma schema required by the exported data. World, campaign, and session selectors
include owned records, location descendants, and referenced dependencies. Import is one complete
operation, supports `ours`, `theirs`, and `both` conflict strategies, and can declaratively upgrade
an empty or older destination database from the bundled schema before applying data.

### SessionState

`SessionState` is the persisted campaign-session aggregate. It has `identity`, a human-readable
`name`, required `worldId` and `campaignId`, a `status` of `planned`, `in-progress`, `completed`, or
`cancelled`, optional ISO timestamps (`scheduledFor`, `startedAt`, and `endedAt`), and arrays of
`sceneIds`, `encounterIds`, and `eventIds`. Optional `notes` and namespaced `extensions` hold session
material that does not yet have a first-class field. These references make selective host transfer
include the session's required campaign and play-state dependencies.

## Geography and world-building

Geography is normalized. Every world, plane, continent, ocean, region, nation, province, territory,
wilderness, settlement, district, and site is its own `LocationState`. Parentage is expressed by
`placement`; direct travel or adjacency is expressed by `LocationConnectionState`. Do not nest child
location aggregates inside a parent `LocationState`.

### LocationState

```ts
interface LocationState {
  identity: StateIdentity;
  name: string;
  description?: string;
  kind:
    | "world"
    | "plane"
    | "continent"
    | "ocean"
    | "region"
    | "nation"
    | "province"
    | "territory"
    | "wilderness"
    | "settlement"
    | "district"
    | "site"
    | string;
  placement: LocationPlacement;
  image: LocationImage;
  profile: LocationProfile;
  walls?: LocationWall[];
  transitions?: LocationTransition[];
  sceneIds: string[];
  pointOfInterestIds?: string[];
  discoveredBy?: string[];
  physicalEnvironment?: PhysicalEnvironment;
  extensions?: Record<NamespacedKey, JsonValue>;
}

interface LocationWall {
  id: string;
  kind: "wall" | "door" | "invisible-wall";
  vertices: [
    NormalizedMapCoordinate,
    NormalizedMapCoordinate,
    ...NormalizedMapCoordinate[],
  ];
  blocks: {
    sight: boolean;
    sound: boolean;
    movement: boolean;
    environmentalEffects: boolean;
  };
  doorState?: "open" | "closed";
}

interface LocationTransition {
  id: string;
  position: NormalizedMapCoordinate;
  radius: number;
  destination: {
    locationId: string;
    position: NormalizedMapCoordinate;
  };
}

interface PhysicalEnvironment {
  kind:
    | "planetary-region"
    | "extradimensional-region"
    | "artificial-habitat"
    | "isolated-habitat"
    | "simulation"
    | "field-contained-region"
    | "unknown"
    | string;
  understanding: UnderstandingState;
  observedProperties: [string, ...string[]];
  operatingBasis?: OperatingBasis;
  mechanismDescription?: string;
  sustainingInfrastructure?: string[];
  boundaryConditions?: string[];
  accessConstraints?: string[];
  provenance?: string;
}

type LocationPlacement =
  | { kind: "root" }
  | {
      kind: "within-parent";
      parentLocationId: string;
      mapPosition?: NormalizedMapCoordinate;
      border: LocationBorder;
    };

interface LocationImage {
  assetId: string;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
  orientation: "scenic" | "overhead" | "side-on";
  focalPoint?: { kind: "normalized-map"; x: number; y: number };
}

interface LocationProfile {
  terrain: {
    aspect: LocationAspectSummary;
    terrainTypes: string[];
    climates?: string[];
    elevationRange?: [number, number];
    waterways?: string[];
    naturalResourceTags?: string[];
    hazardDefinitionIds?: string[];
    travelModifiers?: RuleModifier[];
  };
  culture: {
    aspect: LocationAspectSummary;
    cultures: Array<{
      cultureId: string;
      prominence?: number;
      population?: number;
      settlementPattern?: string;
    }>;
    heritageCandidateIds: string[];
    languages: string[];
    population?: number;
    customs?: string[];
    religions?: string[];
  };
  politics: {
    aspect: LocationAspectSummary;
    governmentForms?: string[];
    influences: Array<{
      polityId: string;
      role:
        | "sovereign"
        | "administrator"
        | "claimant"
        | "occupier"
        | "influencer"
        | string;
      influence?: number;
    }>;
    relationships?: Array<{
      otherLocationId: string;
      relation:
        | "allied"
        | "friendly"
        | "neutral"
        | "tense"
        | "hostile"
        | "at-war"
        | string;
      since?: string;
      notes?: string;
    }>;
    stability?: number;
    laws?: string[];
  };
}

interface LocationAspectSummary {
  summary?: string;
  tags: string[];
  traitIds: string[];
}
```

Every location whose `kind` is `plane` requires `physicalEnvironment` and at least one measurable
or repeatably observed property. “Plane” may remain as a cultural or geographic label, but it does
not supply a supernatural explanation. Use `understanding: "unknown"` when the mechanism has not
been established; do not invent precision. Legacy plane records without this metadata migrate to
an explicit unknown environment and are registered as content-review exceptions.

`LocationBorder` identifies its coordinate space and contains either a polygon or multiple polygons.
Polygon rings contain at least three coordinates. Coordinates are one of:

- normalized map: `{ "kind": "normalized-map", "x": 0..1, "y": 0..1 }`
- geographic: `{ "kind": "geographic", "latitude": number, "longitude": number, "elevation"?: number }`
- custom: `{ "kind": "custom", "coordinateSystem": "namespace:key", "value": JsonValue }`

### LocationConnectionState

```ts
interface LocationConnectionState {
  identity: StateIdentity;
  scopeLocationId: string;
  fromLocationId: string;
  toLocationId: string;
  direction: "bidirectional" | "from-to-only" | "to-from-only";
  kind:
    | "shared-border"
    | "road"
    | "trail"
    | "river"
    | "sea-route"
    | "air-route"
    | "portal"
    | "passage"
    | string;
  status: "open" | "restricted" | "blocked" | "destroyed" | "unknown" | string;
  distance?: Distance;
  typicalDuration?: Duration;
  allowedMovementModes?: string[];
  prerequisites?: Predicate[];
  travelCheck?: {
    interval?: Duration;
    encounterRoll?: DiceExpression;
    difficulty?: NumericExpression;
  };
  mechanism?: {
    operatingBasis: OperatingBasis;
    understanding: UnderstandingState;
    observedOperation: string;
    mechanismDescription?: string;
    infrastructure?: string[];
    activationRequirements?: string[];
    failureModes?: string[];
  };
  notes?: string;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

`mechanism` is required for `portal` connections and any edge whose traversal is not ordinary
locomotion. A legacy portal without enough information uses an `unknown` basis and understanding
only while carrying an explicit science-refactor exception; new records must describe the observed
operation and known physical implementation honestly.

`LocationGraphState` contains `version`, `rootLocationIds`, a flat `locations` array, and a flat
`connections` array. It is composed into `GameState.entities.geography`; it is not itself a generic
domain API resource.

`image.orientation` determines encounter rendering: `scenic` is an illustrative view, `overhead`
is a top-down map without gravity, and `side-on` is a profile map where tokens fall vertically to
the nearest horizontal movement-blocking wall. If no wall catches a falling token, the lower edge
of the background image acts as the final floor so tokens remain within the map. Every generated
image must declare its orientation; use `scenic` for strategic and illustrative maps unless an
encounter viewpoint is explicitly known.

`walls` is encounter-scale geometry for `site` locations. Each boundary is one connected polyline
with at least two normalized map vertices. A `wall` may independently block sight, sound, movement,
and environmental effects. A `door` additionally has an open/closed state; an open door blocks no
channel. An `invisible-wall` always blocks movement and nothing else. A legacy boundary without a
`kind` is read as `wall`, but all new output must include the discriminant. Do not use walls for
strategic location borders or child-location placement.

`transitions` contains circular encounter-map triggers. `radius` is normalized against the smaller
displayed map dimension. When a token intersects the trigger it moves to `destination.position` on
the referenced location map. The editor resolves destination IDs to location names; never display
opaque IDs to the GM.

### AI location-generation output

The `POST /api/ai/worlds` workflow accepts exactly one JSON object, parses it as the root
`LocationState`, forces `kind` to `world`, generates and stores its map, and persists it under the
`locations` resource. Return the root world only: no Markdown fence, prose, array,
`{ "world": ... }` wrapper, or full `LocationGraphState` wrapper. The API replaces generated
identity and image-storage metadata with authoritative values before persistence. Include a
two-sentence `description` suitable for the dashboard.

The `POST /api/ai/locations/:parentId` workflow combines `create-location.md`, this document, the
complete parent location record, and user context. It accepts one child `LocationState`, forces a
new identity and a `within-parent` placement referencing the route parent, generates and stores its
map, and then persists it. When the GM supplies normalized map coordinates, the workflow stores them
as `placement.mapPosition` so the child appears as a labeled pin on the parent's strategic map.
Never copy the parent's ID or emit nested child aggregates. Both workflows use
`extensions["aow:map-brief"].imageGenerationPrompt` as the production image prompt.

Use namespaced extension data for generation-only artifacts that do not yet have first-class domain
fields. In particular, a session-zero brief may be stored at `extensions["aow:session-zero"]`. A
planned child-location outline may be stored at `extensions["aow:location-outline"]`, but it does not
replace separately persisted child `LocationState` records. Generated and uploaded maps are stored
as media assets; `image.assetId` identifies that asset, while a short-lived signed URL is resolved
when displayed. Do not fabricate or persist a signed `image.uri`.

Minimal structurally complete root-world example:

```json
{
  "identity": {
    "id": "8dd65d5f-f943-4d86-a2b4-bf6769d4975a",
    "version": { "revision": 1, "updatedAt": "2026-08-20T20:00:00.000Z" }
  },
  "name": "The Shattered Meridian",
  "description": "The Shattered Meridian is an ocean world whose migrating islands follow the passage of three moons. Rival navigators race to control the one route that may lead beyond the celestial storm wall.",
  "kind": "world",
  "placement": { "kind": "root" },
  "image": {
    "assetId": "2daf3824-2a95-4d3c-86f2-9df88f14f737",
    "altText": "A painted map of migrating islands beneath three moons",
    "width": 2048,
    "height": 2048,
    "mimeType": "image/webp",
    "orientation": "scenic"
  },
  "profile": {
    "terrain": {
      "aspect": {
        "summary": "A moon-driven ocean of moving archipelagos.",
        "tags": ["oceanic", "migratory-islands"],
        "traitIds": []
      },
      "terrainTypes": ["open ocean", "volcanic archipelago"],
      "climates": ["tropical", "storm belt"],
      "waterways": ["The Meridian Current"]
    },
    "culture": {
      "aspect": {
        "summary": "Navigation defines status, faith, and survival.",
        "tags": ["seafaring", "lunar"],
        "traitIds": []
      },
      "cultures": [],
      "heritageCandidateIds": [],
      "languages": ["Meridian Trade Speech"]
    },
    "politics": {
      "aspect": {
        "summary": "Chart-houses compete for routes and safe harbor.",
        "tags": ["mercantile", "competitive"],
        "traitIds": []
      },
      "governmentForms": ["independent chart-houses"],
      "influences": [],
      "stability": 52
    }
  },
  "sceneIds": [],
  "pointOfInterestIds": [],
  "discoveredBy": [],
  "extensions": {
    "aow:session-zero": {
      "tone": "adventurous maritime fantasy with looming cosmic danger",
      "themes": ["discovery", "community", "the cost of certainty"],
      "premise": "The characters possess a fragment of the only chart through the storm wall.",
      "primaryOpponent": "The Astral Cartographers",
      "safetyNotes": []
    },
    "aow:location-outline": [
      {
        "provisionalId": "region:glasswake",
        "name": "The Glasswake",
        "kind": "region",
        "summary": "A calm equatorial sea hiding drowned observatories."
      }
    ]
  }
}
```

## Campaign definitions and world state

`CampaignDefinition` is the singleton world's GM-authored story and persistent play context,
persisted by the `campaigns` resource. It contains `identity`, `name`, the root-world `worldId`, a
protected `gmPremise`, a `playerIntroduction`, the materialized world hierarchy in `locationIds`,
and a required `partyStartingLocationId` within that set. Every world descendant is in editable
scope; `locationIds` does not create a campaign-specific location silo. The premise and introduction are sanitized rich HTML
limited to paragraphs, second- and third-level headings, emphasis, lists, blockquotes, line breaks,
and safe links. It does not contain a party roster or starting clock and never prescribes player
actions.

Campaign definitions own persistent placement records and location discoveries shared by every
session:

- `creaturePlacements` associate a world-supplied creature with its current world location and may
  include a persistent normalized `mapPosition` on that location's map plus a positive `scale`
  multiplier for its authored token size.
- `itemPlacements` associate a world item definition with its current world location.
- `objectPlacements` associate a world object definition with its current world location.
- `discoveries` contain a human-readable GM name, a world location, and zero or more grants. Grants
  are discriminated as `money`, `rumor`, `fact`, `general-knowledge`, or `item`. Money uses
  `CurrencyAmount`; item grants reference a world item definition.
- `locationCanvases` contain persistent GM-authored presentation state for world locations.
  Each entry identifies its `locationId` and provides ordered layer settings with a stable `key`,
  boolean `visible` state, and normalized `opacity` from 0 through 1. This presentation state is
  shared across session boundaries. `pixelsPerFiveFeet` defines the measurement scale used by the
  grid and side-on fall resolution. Optional arrays persist directly authored light sources, sound
  sources, drawings, templates, and notes. Every authored object has a human-readable `name` and a
  normalized map position. Light and sound ranges and drawing/template sizes use `radius`, expressed
  as a fraction of the smaller map dimension. World locations remain authoritative for map images,
  walls, transitions, and orientation. Sessions are journal and timing boundaries; ending one does
  not reset placements, discoveries, or location presentation.

Every campaign location reference must appear in `locationIds`, every world descendant must be
materialized there, and every entry must resolve within the campaign's `worldId`. Campaign generation must not invent creature, item,
object, currency, or location definitions inside a campaign. A location or placement supplies
context only: presence never reveals a discovery, awards an item, starts combat, or restricts the
actions available to the party.

```ts
type CampaignCanvasLayerKey =
  | "background"
  | "background-effects"
  | "tiles"
  | "grid"
  | "regions"
  | "drawings"
  | "templates"
  | "walls"
  | "tokens"
  | "sounds"
  | "lighting"
  | "notes"
  | "controls"
  | "special-effects"
  | "illumination-effects"
  | "coloration-effects"
  | "darkness-effects"
  | "visibility"
  | "particle-effects"
  | "weather-effects"
  | "filter-effects"
  | "interface";

interface CampaignCanvasLayerConfiguration {
  key: CampaignCanvasLayerKey;
  visible: boolean;
  opacity: number;
}

interface CampaignCreaturePlacement {
  id: string;
  creatureId: CreatureId;
  locationId: LocationId;
  mapPosition?: NormalizedMapCoordinate;
  // Optional visual scale multiplier for the placed token.
  scale?: number;
}

interface CampaignCanvasLightSource {
  id: string;
  name: string;
  position: NormalizedMapCoordinate;
  // Fraction of the smaller map dimension.
  radius: number;
  // CSS-compatible color used by the location canvas renderer.
  color: string;
}

type CampaignCanvasSoundVolumeMode = "distance" | "constant";

interface CampaignCanvasSoundSource {
  id: string;
  name: string;
  position: NormalizedMapCoordinate;
  // Fraction of the smaller map dimension.
  radius: number;
  // 0 (silent) through 1 (full volume).
  volume: number;
  volumeMode: CampaignCanvasSoundVolumeMode;
  loop: boolean;
}

interface CampaignCanvasDrawing {
  id: string;
  name: string;
  position: NormalizedMapCoordinate;
  // Fraction of the smaller map dimension.
  radius: number;
}

interface CampaignCanvasTemplate {
  id: string;
  name: string;
  position: NormalizedMapCoordinate;
  // Fraction of the smaller map dimension.
  radius: number;
}

interface CampaignCanvasNote {
  id: string;
  name: string;
  position: NormalizedMapCoordinate;
  text: string;
}

interface CampaignLocationCanvasConfiguration {
  locationId: LocationId;
  layers: CampaignCanvasLayerConfiguration[];
  // Canvas pixels representing five feet for measurement and side-on falls.
  pixelsPerFiveFeet?: number;
  lightSources?: CampaignCanvasLightSource[];
  soundSources?: CampaignCanvasSoundSource[];
  drawings?: CampaignCanvasDrawing[];
  templates?: CampaignCanvasTemplate[];
  notes?: CampaignCanvasNote[];
}

interface CampaignDefinition {
  identity: StateIdentity<CampaignId>;
  name: string;
  worldId: LocationId;
  gmPremise: string;
  playerIntroduction: string;
  locationIds: LocationId[];
  partyStartingLocationId: LocationId;
  creaturePlacements: CampaignCreaturePlacement[];
  itemPlacements: CampaignItemPlacement[];
  objectPlacements: CampaignObjectPlacement[];
  discoveries: CampaignDiscovery[];
  locationCanvases: CampaignLocationCanvasConfiguration[];
}
```

`CampaignState` remains the mutable campaign state embedded in an authoritative `GameState`; it is
not the aggregate stored by the `campaigns` definition resource.

`CampaignState` contains `identity`, `name`, `currentTime`, optional `activeSceneId`, `sceneIds`,
`partyIds`, `partyLocations`, `rests`, optional active `travel`, `socialAttitudes`,
`downtimeActivities`, optional quests, `globalFlags`, and optional extensions. A quest has `id`,
`name`, status (`unknown`, `active`, `completed`, or `failed`), and objectives with `description` and
`completed`. `CalendarInstant` contains `calendarId`, year, month, day, hour, minute, and optional
round.

`SceneState` contains `identity`, `name`, optional strategic `locationId`, optional dimensions and
grid, `defaultLight`, `entityIds`, `objectIds`, `hazardIds`, optional traits, and extensions.

`ObjectState` contains `identity`, optional `definitionId`, `name`, optional defenses and hit points,
boolean locked/open/hidden state, optional encounter position and inventory, and extensions.

Travel references a flat route of `routeConnectionIds` between an origin and destination, tracks the
current location/connection, pace, remaining distance, travel hours, forced march, navigator, roles,
vehicle, lost state, and encounter checks. Party location is stored separately as a party ID,
location ID, and `stationary`, `traveling`, or `lost` status.

## Characters, creatures, items, and encounters

- `CharacterState` extends `CreatureState`; it is not a parallel aggregate with a smaller or
  incompatible creature contract. Every creature property and invariant therefore applies to a
  character. Character state additionally records its owning campaign membership, campaign status
  (`active`, `retired`, or `dead`), advancement, heritage, background, alignment, classes,
  features, feats, professions, death saves, biography, and other character-specific progression.
- `CreatureState` is the common runtime creature aggregate. For monsters and NPCs it includes an optional monster
  definition, three required image assets, an opposed-roll defense rating contributed by equipped
  armor, physical classification and local aliases, combat statistics, inventory/equipment,
  disciplines, communication capabilities, action definition IDs, effects, conditions, resources,
  damage adjustments, triggers, optional transformed form, disposition, and extensions.
- Every `ItemDefinition` has a required construction quality of `ramshackle`, `standard`, `fine`,
  or `exquisite`. `ItemInstance` references an item definition and records its own required quality,
  quantity, current location,
  attunement-as-operator-synchronization, analysis state, capacity/ammunition/durability, custom
  values, and extensions. Item
  location is discriminated as `inventory`, `container`, `scene`, `location`, `carried`, or
  `destroyed`.
- `EncounterState` contains identity/name, phase, round/turn, initiative, combatants, environment,
  pending rule executions, roll history, and extensions. Encounter position is scene-local and is
  not a substitute for strategic `LocationState` placement.

Character heritage records an origin region and zero to three immutable-at-creation heritage
selections. Character profession state records current expertise, how it was acquired, advancement
awards/spends, and action use counts.

Participation has four separate scopes; never collapse them into one Campaign participant record:

- `PlayerProfile` is the durable server-wide Player role. Its `standing` (`active`, `inactive`, or
  `banned`) is independent of Campaign membership and Session attendance. A profile references
  non-sensitive `AuthenticationProviderAssociation` summaries. Provider subject identifiers,
  credentials, email addresses, phone numbers, and recovery data remain behind protected identity
  service boundaries.
- `CampaignInstanceHumanMembership` is the durable relationship between a person and exactly one
  Campaign Instance, with role `gm`, `player`, or `spectator`. A Player membership references its
  Player profile and owns its full Instance-bound Character history; GM and Spectator memberships
  do not. Invitation workflow is Instance-scoped and does not substitute for membership.
- `CampaignInstanceAgentParticipation` authorizes one non-human Agent process in exactly one
  Campaign Instance. Observe and act capability keys are separately explicit and least-privilege.
  The contract has no human user, membership, role, or impersonation target; implementations must
  never turn an Agent capability into human credentials or attribute Agent actions to a person.
- `SessionParticipation` separately records response, attendance, join/leave, and whether a human
  membership or Agent acted in one Session. It always names the same Campaign Instance as the
  Session and the referenced membership/Agent authorization. The GM is both operator and a human
  Session participant; fictional GM actions are attributed to the Instance Creatures they control.

`CampaignInstanceCharacterAssociation` binds each Character to exactly one Campaign Instance and
one Player-role membership in that Instance. Its discriminated `origin` is either
`created-in-instance` or `one-way-import`. Import provenance records the source but creates a new
destination Character identity in a different Campaign Instance, with no synchronization or
back-transfer. The membership's optional
active Character must occur in its Character history and resolve to an association for that same
membership and Instance. Every Character in the membership's full history must likewise resolve to
an association owned by that membership in that Instance. `validateParticipationConsistency` checks these Character invariants plus
same-Instance Session, human-membership, and Agent-participation relationships without putting
opaque identifiers into its human-readable issues.

`CampaignMembership`, `PlayerCampaignMembership`, `NonPlayerCampaignMembership`, and
`CharacterCreationDraft` remain deprecated compatibility contracts because their `CampaignId`
association conflates definition and runtime scope. Existing callers may continue to use them, but
new work uses the Campaign Instance contracts. `CharacterCreationDraft` remains a resumable,
revisioned legacy input aggregate until an Instance-safe replacement is introduced.

`CampaignInvitationPreview`, `CampaignInstanceInvitationPreview`,
`CampaignInstanceInvitation`, and `CampaignInvitationDeliverySummary` are deliberately
non-sensitive. Do not add email addresses, phone numbers, authentication-provider subject IDs,
plaintext invitation tokens, token hashes, credentials, or recovery data to these shared contracts
or generic domain resources. Invitation/contact/secret storage belongs behind dedicated protected
service boundaries.

Skills are definitions, never free-form strings in state or tests:

```ts
interface SkillComponents {
  defaultAttribute?: Attribute;
}

type SkillDefinition = Definition<"skill", SkillComponents>;

interface SkillState {
  skillDefinitionId: DefinitionId;
  attribute: Attribute;
  rank: "none" | "half" | "proficient" | "expertise" | "custom";
  bonus: number;
  passive: number;
}
```

Backgrounds use `skillProficiencyIds`. Tests and skill-bonus expressions use
`skillDefinitionId`. Never invent a skill definition ID; omit the optional skill from a test or use
an empty skill-state collection when the referenced definition is not supplied.

The built-in skill catalog uses stable IDs of the form `aow:skill-<key>`. Its keys are
`acrobatics`, `animal-handling`, `athletics`, `deception`, `history`, `insight`, `intimidation`,
`investigation`, `medicine`, `nature`, `perception`, `performance`, `persuasion`, `religion`,
`sleight-of-hand`, `stealth`, `survival`, `demolition`, `engineering`, `navigation`, `pilot`,
`science`, `streetwise`, `subterfuge`, `tactics`, `technology`, and `marksmanship`. Arcana is not a
built-in skill; migrated Arcana references resolve to `aow:skill-science`.

Creature taxonomy separates physical classification from cultural vocabulary:

```ts
interface CreatureClassification {
  nature:
    | "organism"
    | "engineered-organism"
    | "machine"
    | "composite"
    | "collective"
    | "field-phenomenon"
    | "unknown"
    | string;
  morphology?: string;
  formalName?: string;
  origin?: string;
  composition?: string[];
  aliases: {
    label: string;
    context?: string;
    language?: string;
    locationId?: string;
  }[];
}

interface CommunicationCapability {
  medium:
    | "acoustic"
    | "visual"
    | "chemical"
    | "radio"
    | "neural"
    | "field-effect"
    | "wired"
    | "unknown"
    | string;
  directionality: "one-way" | "bidirectional" | "broadcast";
  range?: Distance;
  operatingBasis: OperatingBasis;
  understanding: UnderstandingState;
  requirements?: string[];
  description?: string;
}
```

`CreatureState.classification` and `MonsterComponents.classification` are required. Terms such as
fiend, fey, celestial, undead, dragon, or monstrosity may be aliases but are not authoritative
physical categories. Creature state always has a `communicationCapabilities` array; monster
definitions may omit it. Never emit the legacy numeric `telepathy` field.

Senses use observed capabilities such as `normal`, `multispectral`, `field-detection`,
`material-penetration`, or `projection-discrimination`. Every extraordinary sense records its
`operatingBasis`, `understanding`, and optional `mechanismDescription`. `truesight` migrates to an
unresolved advanced-sensing exception rather than pretending several unrelated sensing mechanisms
are one universal capability.

Canonical conditions use `influenced` rather than `charmed` and `immobilized-transformed` rather
than `petrified`. Damage adjustments use a structured `bypassPredicate`. Compatibility migration
preserves old `bypassedBy` strings under `extensions["aow:legacy-bypass-labels"]` and registers the
record for review.

### Creature images

Every `CreatureState`, including every `CharacterState`, requires an `images` object with exactly
three gameplay views. The keyed
roles are semantic and must not be substituted for one another:

```ts
interface CreatureState {
  identity: StateIdentity;
  entityId: string;
  worldId: string;
  definitionId?: string;
  name: string;
  images: CreatureImages;
  // remaining creature state fields...
}

interface CreatureImages {
  /** Full-size, full-body player-facing illustration for presenting the creature at the table. */
  portrait: CreatureImage;
  /** Top-down token for maps viewed from above. */
  overheadToken: CreatureImage;
  /** Compact, full-body side-view token for multi-level maps viewed from the side. */
  paperDollToken: CreatureImage;
}

interface CreatureImage {
  assetId: string;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
}
```

Each property must identify its own stored media asset. `portrait` shows the entire creature at full
illustration scale; it is not a headshot. `overheadToken` must use a true top-down camera angle.
`paperDollToken` must show the entire creature in profile at a smaller token scale. Generated or
uploaded images are stored as media assets; do not fabricate or persist signed `uri` values.

Product language may call `paperDollToken` the character's horizontal token. These are the same
semantic image role, not two separately required assets.

`worldId` is required and references the root `LocationState` that owns the creature. World-scoped
creature creation must use the authoritative route world ID rather than inventing or copying a
different location ID.

### Creature defense rating

`CreatureState` has no static armor class. Its required `defenseRating` is a set of dice
contributions from equipped armor:

```ts
interface CreatureDefenseRating {
  contributions: ArmorDefenseContribution[];
}

interface ArmorDefenseContribution {
  itemId: string;
  equipmentSlots: [EquipmentSlot, ...EquipmentSlot[]];
  dice: DiceExpression;
}
```

Each contribution references the equipped `ItemInstance` supplying it, records one or more occupied
equipment slots, and contains at least one dice term. The referenced armor definition uses
`defenseDice: DiceExpression`; it does not use a static armor-class value. When an attack is
declared, roll every term in every current armor contribution and sum the results. That defense
total contends with the attacker's fresh base `1d20` plus every term in the equipped weapon's
optional `hitDice`. Do not cache either total between attacks. The active rules system determines
how ties resolve.

For example, a helmet contributing `1d4`, gloves contributing `1d2`, a breastplate contributing
`1d10`, and pauldrons contributing `1d4` produce this defense rating:

```json
{
  "contributions": [
    {
      "itemId": "helmet-item-id",
      "equipmentSlots": ["head"],
      "dice": {
        "terms": [{ "kind": "dice", "count": 1, "size": 4, "label": "Helmet" }]
      }
    },
    {
      "itemId": "gloves-item-id",
      "equipmentSlots": ["hands"],
      "dice": {
        "terms": [{ "kind": "dice", "count": 1, "size": 2, "label": "Gloves" }]
      }
    },
    {
      "itemId": "breastplate-item-id",
      "equipmentSlots": ["chest"],
      "dice": {
        "terms": [
          { "kind": "dice", "count": 1, "size": 10, "label": "Breastplate" }
        ]
      }
    },
    {
      "itemId": "pauldrons-item-id",
      "equipmentSlots": ["shoulders"],
      "dice": {
        "terms": [
          { "kind": "dice", "count": 1, "size": 4, "label": "Pauldrons" }
        ]
      }
    }
  ]
}
```

A defense roll of `1 + 3 + 9 + 4 = 17` defeats an attacker base hit roll of `15` when the weapon has
no additional hit dice. Every subsequent attack causes both sides to roll again.

Weapons can optionally contribute a non-empty dice collection to the hit roll without replacing the
base `1d20`. This contribution is uncommon and should normally be reserved for very rare,
exceptionally well-made, or otherwise extraordinary weapons:

```ts
interface WeaponDefinition {
  category: WeaponCategory;
  hitDice?: { terms: [DiceTerm, ...DiceTerm[]]; label?: string };
  range:
    | { kind: "melee"; minimum: Distance; maximum: Distance }
    | { kind: "ranged"; minimum: Distance; maximum: Distance };
  damage: [WeaponDamageComponent, ...WeaponDamageComponent[]];
  wieldingModes: [WeaponWieldingMode, ...WeaponWieldingMode[]];
  properties: WeaponProperty[];
  // ammunition, mastery, and attack attribute omitted
}

interface WeaponDamageComponent {
  damage: DiceExpression;
  damageType: DamageType;
  savingThrow?: {
    test: D20TestDefinition & { kind: "saving-throw" };
    onSuccess: "negates" | "half-damage";
  };
}

interface WeaponWieldingMode {
  kind: "one-handed" | "two-handed" | "dual-wield";
  handsRequired: 1 | 2;
  requiresSecondWeapon?: boolean;
  proficiency?: {
    subjects: [string, ...string[]];
    match: "any" | "all";
    minimumRank: "half" | "proficient" | "expertise" | "custom";
    onFailure: {
      hitRollMode: "normal" | "disadvantage";
      weaponHitDice: "include" | "omit";
    };
  };
}
```

For example, a weapon with `hitDice: { terms: [{ kind: "dice", count: 1, size: 4 }] }` makes the
attacker's hit roll `1d20 + 1d4`. These hit dice affect only whether the attack lands. They are not
added to `damage`, copied into armor defense, or rolled when the weapon is not used for the attack.

`range.minimum` and `range.maximum` are the effective bounds for the attack. Melee weapons normally
use zero as the minimum and their reach as the maximum. Ranged weapons may have a nonzero minimum
when they are ineffective at very close range. `damage` is a non-empty collection because one hit
can deal several types—for example piercing plus explosive. A component's saving throw applies only
to that component after the hit lands.

`wieldingModes` is authoritative for hand usage and proficiency. A one-handed item definition is
equippable in either `main-hand` or `off-hand`; a two-handed item occupies both slots with the same
item-instance ID. A `dual-wield` mode has `handsRequired: 2` and `requiresSecondWeapon: true` because
it uses two separate one-handed weapon instances. Mode-specific proficiency subjects allow a
creature to be proficient with the weapon normally but still suffer disadvantage or lose weapon
hit dice when attempting an unfamiliar two-handed or dual-wield technique.

Common industrial-era damage types include `ballistic`, `piercing`, `slashing`, `bludgeoning`,
`explosive`, `concussive`, `fire`, `electrical`, `chemical`, and `poison`. `DamageType` remains open
to namespaced setting-specific values. Do not create synonymous parallel types: use `electrical`,
not `lightning`, and `concussive`, not `thunder`. Legacy `force`, `necrotic`, and `radiant` damage
must be replaced according to the physical injury mechanism or retained as an explicit migration
exception.

Every `ItemDefinition` has a required closed quality rating and one required stored inventory image:

```ts
interface ItemImage {
  assetId: MediaAssetId;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
}

type ItemDefinition = Definition<"item", ItemComponents> & {
  image: ItemImage;
};

type ItemQuality = "ramshackle" | "standard" | "fine" | "exquisite";

type ItemCategory =
  | "weapon"
  | "armor"
  | "shield"
  | "adventuring-gear"
  | "ammunition"
  | "tool"
  | "mount"
  | "vehicle"
  | "trade-good"
  | "control-interface"
  | "compound"
  | "procedure-record"
  | "device"
  | "ring"
  | "rod"
  | "staff"
  | "wand"
  | "treasure"
  | string;

type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very-rare"
  | "legendary"
  | "unique"
  | "varies"
  | string;

interface ItemComponents {
  category: ItemCategory;
  quality: ItemQuality;
  operatingBasis?: OperatingBasis;
  understanding?: UnderstandingState;
  mechanismDescription?: string;
  provenance?: string;
  // category-specific and optional components omitted
}
```

`operatingBasis` is one primary value: `mechanical`, `chemical`, `electrical`, `thermal`, `optical`,
`acoustic`, `biological`, `neurological`, `computational`, `field-effect`, `materials`, `composite`,
`unknown`, or a custom value. Use `composite` plus `mechanismDescription` when no single basis is
honestly primary. Understanding is `understood`, `empirical`, `hypothesized`, `unknown`,
`classified`, or a custom value. Items are never classified as magical or mundane.

`AttunementRequirement`, `ItemInstance.attunedBy`, and `InventoryState.attunementLimit` remain one
universal mechanic. Attunement means operator-item synchronization, not magic. An item may explain
the process as calibration, pairing, authorization, biological tolerance, or interface bandwidth.
Item instances use `analyzed?: boolean` and `capacity?: ResourcePool`; do not emit legacy
`identified` or `charges` fields.

Quality describes construction and workmanship, independently of rarity, operating basis, or
understanding state. Both an
item definition and every physical `ItemInstance` carry a quality value; an instance normally uses
its definition's quality unless a workflow explicitly creates a variant. This square image depicts
one complete standalone item and is reused in inventories, equipment
slots, stores, and catalogs. AI-authored item JSON supplies a reserved image record and a
production-ready `extensions["aow:image-brief"]`; the generation workflow renders and uploads the
image, then replaces the reservation with authoritative media metadata. Do not fabricate signed
`uri` values.

Armor item definitions use this non-empty dice collection:

```ts
interface ArmorDefinition {
  category: "light" | "medium" | "heavy" | "shield" | string;
  defenseDice: { terms: [DiceTerm, ...DiceTerm[]]; label?: string };
  agilityContribution?: "none" | "full" | { maximum: number };
  mightRequirement?: number;
  stealthDisadvantage?: boolean;
  donTime?: number;
  doffTime?: number;
}
```

Armor dice originate only from persisted armor definitions and equipped armor instances. Creature
creation must initialize an empty inventory, empty equipment slots, and an empty defense
contribution list. It must not invent armor contributions. The armor-generation workflow creates
each `ItemDefinition`, creates its `ItemInstance` in the creature inventory, equips that instance,
and only then copies its `defenseDice` into the runtime contribution list.

### AI armor-generation output

`POST /api/ai/worlds/:worldId/creatures/:creatureId/armor-set` runs `create-armor.md` once for each
of `head`, `chest`, `arms`, `hands`, `legs`, and `feet`. Each model response is exactly one armor
`ItemDefinition`. The API supplies the authoritative world, creature, target slot, and user context;
then assigns authoritative IDs and source metadata, renders and stores each definition's inventory
image, persists a definition and inventory instance, equips it in the requested slot, and derives
the creature's defense contribution from the persisted armor dice. Generated JSON must not contain
an `ItemInstance`, equipment state, or creature defense contribution.

### AI item-generation output

`POST /api/ai/worlds/:worldId/items` combines `create-item.md`, the complete domain guide, the
authoritative root-world record, and user direction. It returns and persists exactly one
`ItemDefinition` in the `definitions` resource with `kind: "item"` and authoritative
`extensions["aow:worldId"]`. It also renders `extensions["aow:image-brief"]`, stores the result, and
sets the required authoritative `image` metadata. This catalog workflow does not create an
`ItemInstance` or put a copy in an inventory. IDs, keys, source metadata, and world ownership are
normalized by the API.

`POST /api/ai/worlds/:worldId/items/:itemId/image` regenerates only the stored inventory image for
an existing world-owned `ItemDefinition`. It uses the definition's description and saved
`extensions["aow:image-brief"]`, atomically replaces the definition's `image` metadata, removes the
previous media asset after a successful replacement, and removes the new asset if persistence
fails. It does not change item mechanics or create an `ItemInstance`.

`POST /api/ai/worlds/:worldId/weapons` combines `create-weapon.md`, this guide, the authoritative
root-world record, and one weapon concept. It normalizes identity, source, world ownership, and
hand-slot alternatives; renders and stores the required inventory image; then persists one
world-owned weapon `ItemDefinition`. It does not create an inventory instance.

## Definition catalog

Every definition uses the common `Definition` envelope. Implemented `kind` values and component
families are:

- `action`: activation, costs, prerequisites, targets, choices, test, outcomes, usage limit,
  sustained operation, and duration.
- `trait`: prerequisites, modifiers, embedded actions, triggers, grants, and choices.
- `condition`: condition type, modifiers, actions, triggers, stacking, and maximum level.
- `character-template`: level bounds, attribute defaults/generation, choices, and traits.
- `class`: hit die, primary attributes, save proficiencies, level progression, multiclass
  prerequisites, and discipline progression.
- `subclass`: parent class and level-to-feature mapping.
- `background`: attribute/language choices, proficiencies, equipment, feat/features, and
  characteristics.
- `feat`: category, prerequisites, repeatability, traits, and choices.
- `heritage`: short description, paired beneficial/harmful modifiers, skill-proficiency and
  discipline-access grants, choices, and prerequisites. Heritage is any formative influence fixed
  at character creation, including regional industries, cohorts, families, clubs, and institutions.
- `profession`: ordered expertise tiers, acquisition rules, action progressions, prerequisites,
  choices, and mutual exclusions.
- `monster`: physical classification and aliases, creature statistics, defenses, senses,
  communication capabilities, actions, disciplines, gear, and encounter data.
- `item`: category, physical/economic properties, equipment/container rules, rarity, primary
  operating basis, understanding, attunement-as-synchronization, weapon/armor/tool/vehicle data,
  armor defense dice, capacity,
  traits/actions/modifiers, and crafting.
- `discipline`: one shared band, function tags, one primary operating basis, understanding, observed
  phenomenon, activation time, range/targets, inputs, duration/sustained operation, prerequisites,
  outcomes, scaling, training/source compatibility, and related skill definition IDs.
- `skill`: optional default attribute. Skill identity supplies its stable ID, key, name,
  description, source, and tags; all other domain records reference the skill definition ID.
- `hazard`, `trap`, `disease`, `poison`, or `environmental-effect`: detection/disarm tests,
  predicate-triggered effects, reset duration, and severity.
- `language`: script and rarity.
- `table`: optional dice roll and ranged/weighted entries.
- `custom`: namespaced custom kind, optional schema definition, and JSON data.

A discipline uses this core structure:

```ts
interface DisciplineComponents {
  band: number;
  functionTags: string[];
  operatingBasis: OperatingBasis;
  understanding: UnderstandingState;
  observedPhenomenon: string;
  mechanismDescription?: string;
  provenance?: string;
  extendedProcedure?: boolean;
  activationTime: ActionCost[];
  reactionTrigger?: string;
  range: Distance | "self" | "touch" | "sight" | "unlimited" | "special";
  targets?: TargetDefinition[];
  inputs: DisciplineInput[];
  duration: Duration;
  sustainedOperation?: boolean;
  prerequisites?: Predicate[];
  outcomes: OutcomeDefinition[];
  scaling?: DisciplineScaling[];
  trainingProgramIds?: DefinitionId[];
  compatibleSourceIds?: DefinitionId[];
  relatedSkillIds?: DefinitionId[];
  safetyNotes?: string[];
  failureModes?: string[];
}

type DisciplineDefinition = Definition<"discipline", DisciplineComponents>;
```

Function tags state what the discipline does. `operatingBasis` states how it primarily works.
`relatedSkillIds` references competency definitions. These axes are independent and no magic-school
field exists. Never invent related skill, training, or source IDs.

`RulesCatalog` combines definitions, rule variants, and content packs. `GameSystemDefinition` adds
supported editions, engine schema version, enabled variants, configuration, and extensions.
`ExtensionSchema` supplies legacy JSON Schema for namespaced extension data and declares the
aggregate types to which it applies. It remains a compatibility contract while newly editable
domain structure uses typed Model Registry elements and exact Model Schema Releases.

## Executable rules model

Rules are data, not prose:

- `NumericExpression` supports constants, paths, attribute modifiers, proficiency bonus, level,
  resources, arithmetic, and conditionals.
- `ScalarExpression` adds JSON literals, dice, attribute/skill-definition lookups, counts, tables,
  choices, and event values.
- `Predicate` supports boolean composition, comparisons, conditions/tags/definitions,
  proficiency/attunement/sustained operation, damage type, distance/visibility/cover, relations, and
  custom rules.
- `RuleModifier` targets a rule path and performs add/subtract/multiply/divide/set/min/max,
  advantage/disadvantage, proficiency/expertise, allow, or prohibit operations.
- `RuleEffect` covers damage, healing, temporary hit points, resources, values, conditions,
  modifiers, movement/transit, actions, profession advancement, tests, choices, branches,
  iteration, deployment, object creation/destruction, events, narrative output, and custom effects.
- `TriggerDefinition` binds effects to lifecycle/combat events with predicate, timing, limit,
  optionality, and priority.
- `DiceExpression` is a list of dice or numeric terms; dice support keep/drop, reroll, explode, and
  minimum/maximum modifiers. `D20TestDefinition` describes checks, saves, attacks, opposed tests,
  roll modes, critical ranges, and tie behavior.

## Authoritative GameState

`GameState` contains:

```ts
interface GameState {
  version: VersionedState;
  systemId: string;
  systemVersion: string;
  campaign: CampaignState;
  entities: {
    characters: CharacterState[];
    creatures: CreatureState[];
    items: ItemInstance[];
    objects: ObjectState[];
    scenes: SceneState[];
    geography: LocationGraphState;
  };
  activeEncounter?: EncounterState;
  pendingDecisions: PendingDecision[];
  pendingExecutions: RuleExecutionState[];
  events: GameEvent[];
  random: {
    algorithm: string;
    seedCommitment?: string;
    cursor: number;
    entropyLogHash: string;
  };
  customEntityState: Record<string, JsonValue>;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

Although `CharacterState` extends `CreatureState`, a character is stored in `entities.characters`.
Do not duplicate the same aggregate in `entities.creatures`; that collection is for non-character
creatures.

Game mutations are represented by discriminated `GameCommand` values for actions, choices,
movement, equipment/container operations, encounters, rest, travel, party location, professions,
time, GM effects, and namespaced custom commands. Their outcomes are captured as `CommandResult`
and append-only `GameEvent` records. Pending player/GM choices use `PendingDecision`; in-progress
actions use `RuleExecutionState`.

## Generation checklist

Before returning generated JSON:

1. Identify whether the request expects a definition, one state aggregate, or a complete game state.
2. Use one stable ID per object and reference that same ID from every `...Id` or `...Ids` field.
3. Include all required arrays and objects, even when they are empty.
4. Use the correct discriminant (`kind`, `phase`, `status`, or similar) for every union.
5. Keep reusable rules in definitions and mutable facts in state.
6. Keep geography normalized; parentage uses placement and travel edges use connections.
7. Put non-standard JSON under a namespaced extension key rather than inventing top-level fields.
8. Do not claim an asset URL is downloadable unless the asset has actually been created and stored.
9. Include portrait, overhead-token, and paper-doll-token assets for every creature state.
10. Include the owning root location as `worldId` for every creature state.
11. Use fresh armor dice contributions—not a static armor class—for creature defense ratings.
12. Return valid JSON only when the calling prompt requests JSON.
