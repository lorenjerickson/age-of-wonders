---
status: active
date: 2026-10-14
scope: Entity architecture and staged migration; B06 scoped graph/catalog foundation and B08 runtime ownership
---

# Entity architecture and migration

B06 foundation/catalog work and B08 existing actor/equipment behavior were authorized.
Unrelated experience and engine feature work remains deferred in BACKLOG.md.
This document records the requested direction, executable contracts and migration sequence.
After architecture planning, the user authorized beginning migration. The implementation status
below distinguishes the delivered slices from the remaining target architecture.

## Implementation status

Current B06 closure: `EntityGraph` provides scoped identity, cycle-safe references,
dynamic dependency validity, exact isolated hydration, persistent owned-child identity,
explicit modes, commit-only command publication and cascading disposal. `CatalogCapture`
uses it in World publication against declared captured definitions/schemas. Library
callers can retain owned graphs; the API validates in isolated request-local graphs and
retains Prisma transactions/CAS as durable authority. It does not publish a shared
live graph before a database commit or imply global graph persistence.

Language, Table, Custom, ExtensionSchema, RuleVariant, ContentPack and GameSystem now
have concept-specific owners. Generic internal archive writes and replacement commands,
World draft structure and captured publication use these owners. Draft forward references
remain repairable; registration ambiguity and required pack namespaces are checked in
an explicit capture. Table entries, patches, dependencies, nested schemas and catalog
collections remain owned values. JSON Schema execution, version-range solving and
patch execution are not added. See [B06 evidence](verification/b06-entity-graph-catalog.md).

B08 already delivered Creature/Character/Item and grant/effect/equipment owners; B10
retains Instance integration. Older per-concept slice descriptions below are delivery
history; the consolidated BACKLOG.md governs remaining scope. Feat, Heritage and
Discipline are permanently excluded from further work.


The first slice implements `packages/domain/src/entity-runtime.ts`: abstract `Entity`, `IEntity`,
typed commands/events, class-owned codecs, immutable state with an RxJS `state$`, metadata validation,
disposal, and bounded FIFO causal work within an explicitly shared `EntityScope`. New concepts use
this base. The original `DomainEntity` type remains a deprecated compatibility export. The experimental
Location contract is replaced by `LocationDefinition`; common Location fields changed under the
explicitly accepted reconciliation below.

`CreatureDefinition` is the first concrete class. It owns authored payload construction and artwork
preservation, canonical checks, Creature Codex scalar/reference checks, explicit embodiment checks,
Model conformance/attribute/slot checks and submitted artwork-role decoding. API adapters now consume
its state issues; authorization, media access and transaction handling remain in the application.
The class supports envelope and existing-payload hydration, legacy-compatible payload serialization,
and the first typed `rename` command/`renamed` event. Model and reference context is copied and frozen;
incomplete context is unresolved. A validated snapshot is not inferred from an unchecked type cast.

The second slice adds `ItemDefinition` for authored `WorldItemDefinition` payloads. It owns payload
construction and legacy archival, canonical identity/component/image/slot-set checks, weight/cost/
notes draft compatibility, Condition references, effective Model family/slot/conformance rules and
AI proposal selection decoding. It exposes the same immutable observable state, class codecs and
typed `rename`/`renamed` interaction as Creature Definition. Canonical, Codex, authoring Model and
AI proposal adapters delegate to it while preserving existing errors and wire formats. Media
ownership and publication authorization remain application responsibilities.

The third slice adds `EffectDefinition` and `ConditionDefinition` for authored World Codex resources.
Their shared abstract `CodexDefinition` owns identity, name/revision construction, JSON codecs and
rename behavior. Effect owns modifier composition checks, numeric-property resolution, duration and
override capabilities. Condition owns linked Effect selection and override validation, consulting
Effect capabilities instead of parsing another concept's storage. Empty Conditions and partial
referenced Effect records keep their existing relationship-validation behavior; publication still
checks the full Effect independently. The Codex service delegates construction and the shared
validator delegates to entity-state issues. No gameplay modifier execution was added.

The fourth slice adds `CharacterTemplate` for authored `world-character-templates`, with immutable
observable state, typed rename events and self-owned codecs. It owns scalar, equipment, image and
scoped Creature/Item/Condition reference validation. The class enforces immutable Creature selection
using trusted baseline context in both Codex editing and full-draft saves. Artwork helpers preserve
inherited metadata and remove transient URIs; the API retains media authorization. Runtime Character
creation and lifecycle remain pending.

The next three authoring slices add `Attribute`, `SkillDefinition` and `Modifier`.
Attribute owns an existing Model vocabulary option's lineage/revision pair, its kind/label and
vocabulary/parent relationships; Model compilation delegates those checks. Its `selectRevision`
command selects an existing revision in memory without changing published revision content.
Skill owns optional Profession associations, modifier grants, exact Model conformance and default
Attribute selection. Canonical, draft/publication and Model adapters consume its validity state.
Modifier owns authored dice-based grant recipes and collection compatibility adapters for Skill,
Profession and Background. It does not roll dice or realize `GrantedModifier` runtime instances.
All three expose codecs and observable state with typed commands/events. Attribute's common branded
IDs also prompted a base `DeepReadonly` correction that preserves primitive brands.

The Location authoring slice introduces `LocationDefinition`, replacing the experimental Location
exports. It owns construction, canonical shape and required-map validity, private fields, artwork,
map changes, parent/Condition references, typed rename events and dormant scenic grid policy.
Dedicated API writes and publication now consume its state; text proposals can remain incomplete
previews but cannot be applied without a real map. Mapless legacy/initial World-root drafts remain
repairable and invalid. Common `WorldLocationDefinition.map` is required; `mapScene.grid` and nullable
`mapSceneGrid` updates preserve square/hex pixel configuration. The Atlas removes authored links,
requires images for new image Locations, and renders grids only on applicable image maps.

New/changed adjacency fields are rejected at the draft boundary; authored replacement removes old
fields. Existing captured data and deprecated travel resources remain readable, but generic travel
connection mutations and automated travel commands are retired. Deletion ignores retired links while
retaining actual containment/reference protections. Registry/resource IDs remain internal.

All nine concrete classes now expose `deserializePayload()` for raw persisted/API resource input.
It never unwraps fields that happen to resemble an entity envelope. `deserialize()` remains the
explicit entity round-trip API. API callers use the raw path so a nested valid `data` object cannot
mask invalid outer fields. This also closes the same ambiguity in earlier Creature/Item adapters.

The foundational tests exercise state publication, reentrancy, mappings, cycles, command rejection,
standard RxJS error reporting, disposal and serialization. Creature and API regressions preserve
draft baseline tolerance, full publication validation, Model constraints and retained artwork.
Item regressions additionally cover optional square artwork, archived legacy input, clearing slot
sets, same-World Condition grants, vocabulary selection and unchanged publication diagnostics.

`WorldDefinition` is the tenth authored concept. It owns revision-content decoding, collection
membership, required captures, root requirements, collective Location hierarchy/cycle checks and
World Placement reference policy. The API orchestrates child entities, legacy rule/terrain validation
and Placement shape validation, then binds those diagnostics to the exact content and record capture.
World exposes aggregate readiness only through state metadata. Missing or stale child evidence is
unresolved; it cannot turn an incomplete root Location into a publishable World. Typed `replaceContent`
and `contentReplaced` integrate with observable state; class helpers own baseline content and membership
updates used by existing services.

The executable class manages authored revision **content**, not the common `WorldDefinition` lineage
metadata interface. Authorized records are immutable validation context. `serializePayload()` retains
existing content JSON; repositories must persist content and captured records together. Entity envelopes
exclude records, validation caches and subscriptions, and must be hydrated with fresh context/evidence.
Authorization, capture storage/hashes, media and Model resolution, transaction concurrency and dedicated
workspace write restrictions remain application responsibilities.

The Placement, Discovery and Plot slices add `PlacementDefinition`, `Discovery` and `PlotDefinition`.
Placement owns explicit World/Campaign shapes and captured source/location/Plot references, preserving
independent intent and World-decoration variants. Discovery owns canonical facets and legacy claim
validation against its Plot scope. Plot owns narrative members, nested Discovery state, Campaign
ownership, captured context reciprocity, and scoped hierarchy/relationship checks. All three inherit
observable state, immutable codecs and typed commands/events. Validity is projected exclusively from
state; shape-only decoding is explicitly distinguished from full reference validation.

World and Campaign draft adapters now delegate these rules to the classes, covering the existing
manual/proposal/publication entry points that use those adapters. Campaign's remaining collection,
Model-release and preparation checks stay at the aggregate boundary. A changed Plot replaces its own
captured graph entry during validation; every scoped Plot sees graph failures, and the API deduplicates
shared graph diagnostics. Discovery retains lossless legacy reads; canonical facet replacement removes
legacy claims explicitly, without inventing a Truth or dropping private/extension fields.

These are authoring slices, not a full closure of inventory I02/I03: browser semantic construction,
legacy common validators, runtime Placement realization and Discovery knowledge/Plot progress remain
consumer-cutover work. No common persisted type or resource mapping changes accompany these classes.

`ProfessionDefinition` adds the fourteenth authoring class. Existing tier/Modifier-grant checks,
granted Condition references and exact Model/rank conformance now belong to it. Canonical, Codex,
draft-save and Model-binding adapters consume its state; the old Profession helper in `Modifier`
is removed. Browser starting-rank/default construction and tier grant edits now delegate to detached
class helpers, and browser grant feedback reads entity validity. This introduces the web package's
explicit workspace dependency on domain. It preserves sparse legacy payload behavior and does not
invent stricter common Profession semantics or runtime acquisition/advancement mechanics. Full tier
coverage/order, advancement windows, expression and action-reference validation remain recorded gaps.

`BackgroundDefinition` adds the fifteenth authoring class. It owns existing modifier-grant checks,
compatibility granted-Condition references and exact Model release/concept conformance. Canonical,
Codex, draft-save and Model-binding adapters consume state; the Background helper formerly on
Modifier is removed. The browser Background editor now validates through Background rather than
Profession and delegates explicit grant edits to its detached helper. Component construction preserves
all existing fields without adding defaults or silently repairing malformed grants. Optional attributes,
skills, tools, equipment, feats/features, language/choices and runtime acquisition remain outside the
existing validation coverage; preserve and track them rather than claiming those invariants complete.

`HeritageDefinition` adds the sixteenth concrete authoring class, with a deliberately narrower API
cutover. Heritage remains optional historical content, without an active dedicated browser editor or
required `aow:heritage` Model concept. The class owns raw/envelope serialization, observable state,
rename/events, supplied pair/modifier structural checks and compatibility Condition references.
Missing required component information is unresolved. Existing World compatibility reports project
only the previously enforced Condition rules; they do not introduce a new structural publication gate.
That distinction remains an explicit closure gap, not proof of complete Heritage publication validity.

The browser construction helper now delegates to the class and preserves rich pairs, unrelated
modifiers, metadata and prerequisites while editing the foundation text. It creates defaults for new
content only and preserves omitted text edits. No dedicated Heritage UI or Character creation gate
is introduced. Deep rule/choice semantics, prerequisite/reference validation, adoption policy and
runtime Heritage selection/acquisition remain deferred; the existing runtime maximum-one selection
versus common maximum-three contract discrepancy remains for runtime reconciliation.

`DisciplineDefinition` adds the seventeenth concrete authoring class. It owns raw/envelope codecs,
observable state, rename/events, structural diagnostics and compatibility Condition references.
The API projects only the previously enforced Condition rules, preserving sparse legacy captures and
optional generic Model conformance. Open operating-basis/understanding values and empty arrays remain
supported. No numeric band restriction beyond the common number contract is introduced.

No dedicated Discipline browser editor or construction helper exists to migrate. Spell-to-discipline
conversion and dual-kind catalog reads remain compatibility boundaries. Deep action/outcome/expression
semantics, reference resolution, publication enforcement and runtime access/capacity/activation remain
open; this groundwork does not resume the deferred Rules exploration.

`FeatDefinition` adds the eighteenth concrete authoring class. It owns raw/envelope codecs,
observable state, rename/events, shallow component diagnostics and compatibility Condition references.
The API projects only existing Condition-link rules; sparse legacy captures and optional generic Model
conformance retain their previous acceptance. Category remains an open string and empty trait lists
remain supported. There is no dedicated browser editor to migrate. Nested Trait/Choice/Predicate
semantics, reference resolution, full publication validation and runtime acquisition/repeatability
remain open; this slice adds no gameplay behavior.

`ActionDefinition` adds the nineteenth concrete authoring class. It owns raw/envelope codecs,
observable state, rename/events, shallow structure diagnostics and compatibility Condition references.
The API retains its prior Condition-link gate and optional generic Model conformance. Activation uses
the common closed vocabulary; outcomes use `id` and `effects` containers. Discipline outcome/scaling
checks now use that same authoritative container shape, correcting a mistaken `kind` requirement.
No dedicated browser editor exists to migrate. Deep nested rules, references, full publication validity
and runtime execution remain open; this authoring slice adds no gameplay execution.

`TraitDefinition` adds the twentieth concrete authoring class. It owns raw/envelope codecs,
observable state, rename/events, shallow component diagnostics and compatibility Condition references.
All common Trait component fields are optional, so an empty components object is accepted; missing
components remain unresolved. The API retains prior Condition-link checks and optional generic Model
conformance, with no new structural publication gate. No dedicated browser editor exists to migrate.
Nested Action/RuleModifier/Trigger/Choice/Predicate semantics, references and runtime realization remain
open. Feat now delegates embedded Trait validity to TraitDefinition, and Trait delegates embedded
Action validity to ActionDefinition. Each owner projects child diagnostics with indexed paths and
preserves unresolved status; child snapshots use the same capture context without inheriting the
parent source identity, and temporary instances are disposed. No child metadata is serialized.
Item now also delegates `components.traits` validity to TraitDefinition; Character recursive Trait
ownership for catalog `CharacterDefinition` is now implemented; runtime Character realization remains
pending. Catalog CharacterDefinition (`definitions`, kind `character-template`, components) is distinct
from the existing flat World NPC CharacterTemplate (`world-character-templates`). Item now also delegates direct `components.actions` and
`components.vehicle.actions` validation to ActionDefinition, preserving indexed diagnostics, scoped
captures and disposal. Vehicle required/optional field structure is now validated from common types as well, with missing
required data unresolved and malformed supplied data invalid; component-reference and runtime rules
remain open. Existing commands now reject blocking
owned-child diagnostics atomically through Entity validation; raw draft deserialization remains repairable.

B09 follow-up (2026-10-14): `Map`, `Wall`, `Door`, `Window` and `MapExploration`
now own map selection, atomic terrain/element changes and intrinsic exploration policy.
Location's stable Map view routes replacement through its parent command and shares teardown;
Map element views likewise route mutations through Map. Actual terrain authoring/capture and
server-authorized exploration projection delegate these policies. Optional authored weather
and audiovisual media defaults are captured as World data and have responsive editors and
read-only summaries. Runtime realization, Session dispatch, weather overrides and playback
remain B10. This supersedes older deferred-ledger statements for authored LOC-01/02 only.
See [B09 evidence](verification/b09-maps-location.md).

Remaining work before the migration gates can be closed:

- World lineage metadata lifecycle, runtime World and the older generic `WorldDefinitionsService`
  create/publish methods (currently used only by tests) remain unmigrated. Placement authoring now
  delegates local and captured-reference validation to its concrete class; runtime realization remains.
- The [concept and consumer inventory](domain-concept-consumer-inventory.md) now covers current
  source families, behavior owners and migration seams. Its I01–I10 checklist remains open; other
  entities, runtime realization and engine consumers remain unmigrated. Per-slice fixture/baseline
  evidence is still required; experience and engine features stay paused.
- Definition mutation workflows still build a new authored payload through the class and validate
  it through adapters; they have not all become instance commands. Existing API reports remain
  compatibility projections. B09 supplies owned Wall/Door/Window classes; broader runtime Location realization remains B10.
- Validation contexts currently contain immutable scoped record/Model snapshots. Dependency revision
  tracking and automatic cross-entity invalidation, a typed reference resolver and scoped identity-map
  hydration remain target work. Callers must explicitly revalidate with current context; the existing
  publication/application checks are retained.
- `EntityScope` is an in-memory operation queue, not a persistence transaction or engine replacement.
  Repositories do not yet hydrate and persist a whole isolated entity graph. Bound reactions require
  one shared scope; custom handlers must likewise keep interacting entities in that scope.
- Common's embodiment helper remains for unmigrated immutable-capture/runtime consumers. Authored
  Creature validation now belongs to the class; removal of that compatibility policy is part of the
  runtime cutover. Do not introduce a common-to-domain dependency cycle to forward it.
- Item runtime/container mechanics and the separate legacy Item/Armor/Weapon AI generation paths
  (including scientific-item validation) remain unmigrated. The active World draft Item proposal
  decoder now uses the class. Existing browser field affordances remain backed by server validation.
- Effect/Condition execution, GrantedModifier runtime state, and runtime
  Character behavior remain unmigrated. Common Modifier helpers remain for browser/runtime
  compatibility; API authoring now delegates to the class. Attribute release hashes, authorization
  and collective dependency checks remain registry responsibilities. Browser numeric-property choices and override controls
  remain UI affordances; fork/import reference rewriting remains a persistence adapter.

These are working initial slices, not completion of gates 0–5. The requirements and remaining target
contracts below continue to govern later migration.

## Required direction

The domain is expressed through interfaces, an abstract `Entity` base class, and concrete classes
for individual concepts. Generics preserve state, command, event, context, and identity types.
Each entity owns its state, serialization/deserialization, validation, command processing, and
emitted events. Other entities and the engine interact through the same typed command surface.
Entities can subscribe to one another's events. Bindings declare context mapping when created.
Domain metadata, including validity, is observable exclusively through exposed entity state.
Entity state is a subscribable Observable: the engine and other consumers can receive the current
state and subsequent changes without polling or reconstructing state from domain events.

Concrete concepts include World, Location, Creature, Character, Discovery, Item, Attribute, Skill,
Modifier, Wall, Door, and Window. Singular class names denote individual entities; collections of
walls, doors, or windows remain owned collections. This list is a starting inventory, not a limit.

## Evidence and constraints

| Baseline source                                                                  | Finding and migration consequence                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/entity.ts`, `command.ts`, `event.ts`                        | Type-only contracts; no base class, dispatch, subscriptions, serialization, or validation lifecycle exists. Existing discriminated envelopes are useful, but `commands` and `events` are currently payload types rather than callable surfaces. |
| `packages/domain/src/location.ts`                                                | The experimental Location shape differs from common Location contracts. Required map/weather and `adjacentLocationIds` must not silently replace optional authored maps or `connectedLocationIds`.                                              |
| `packages/common/src/types`                                                      | Authoritative implemented state, identity, extension, definition, and instance contracts. Preserve these during the initial behavior migration.                                                                                                 |
| `apps/api/src/world-definitions/world-codex-validation.ts`                       | Character, Effect, Condition, Creature, Item, and Location rules share one validator. Draft comparison deliberately permits certain unchanged legacy scalar fields; publication validates the complete snapshot.                                |
| `apps/api/src/world-definitions/world-authored-record.ts`                        | Canonical shape checks and record construction contain concept-specific policy in API code.                                                                                                                                                     |
| `apps/api/src/world-definitions/world-definition-draft-validator.ts`             | Creature references and embodiment, Location graphs, and placements are checked outside their owning concepts.                                                                                                                                  |
| `packages/common/src/types/creatures.ts`, `items.ts`, `modifiers.ts`, `plots.ts` | Behavior also exists beside common interfaces: embodiment policies, container rules, modifier checks, and Plot hierarchy checks. Moving only API validation is insufficient.                                                                    |
| `apps/api/src/domain/domain-resource.ts`                                         | Resource discriminators and identity extraction belong to the compatibility inventory. Domain classes must not import its NestJS exceptions or persistence implementation.                                                                      |

At baseline no application imported `@aow/domain`; the API now does so for Creature, Item, Effect
Condition, Character Template, Skill and Modifier authoring, and Attribute Model compilation.
A migration slice is complete only when callers use those classes and the replaced policies are
removed or delegated.

The current checkout contains substantial unrelated work. Implementation must preserve those edits
and establish a baseline before moving behavior. Deprecated documents listed in `docs/README.md`
are excluded from this proposal.

## Ownership and package boundary

`@aow/domain` becomes the framework-independent executable domain. Each concept module contains
its concrete class and its state/command/event declarations, with private implementation helpers
where necessary. A module may import the existing common state interface and name it as its state
contract; it must not maintain a second equivalent schema. The class owns the policy even when
its implementation spans private files in that concept's directory.

During migration, dependencies run from domain to common state contracts. Common must not import
domain: move callers of common policy helpers to domain in the same slice, rather than creating
circular compatibility re-exports. API and web applications may consume domain. Domain cannot
import application services, HTTP, ORM, browser APIs, or engine implementation.

Keep `packages/common/src/types` authoritative for implemented state until an explicit later
decision changes that authority and its consumers together. Collocation is achieved initially by
class-owned declarations that reference these exact types. A wholesale package/type relocation
is not a prerequisite for behavioral encapsulation.

Application services retain authorization, loading, transaction coordination, optimistic concurrency,
and persistence. They supply scoped entity references and call commands. They do not inspect a
Creature's health or reimplement a Door's rules. Infrastructure enforces storage integrity and
untrusted transport limits; entity classes enforce domain meaning. Clients use explicit authorized
state projections so GM-only state does not leak through serialization or events.

## Base contract and state

Proposed public shape (illustrative TypeScript; supporting mapped types are to be implemented):

```ts
import type { Observable } from "rxjs";

interface IEntity<S, C, E> {
  readonly state: DeepReadonly<EntityState<S>>;
  readonly state$: Observable<DeepReadonly<EntityState<S>>>;
  readonly events: EventChannels<E>;
  command<K extends keyof C>(name: K): CommandEndpoint<C[K]>;
  command<K extends keyof C>(
    name: K,
    invocation: CommandInvocation<C[K]>,
  ): Promise<CommandReceipt>;
  validate(context: ValidationContext): void;
  serialize(): SerializedEntity<S>;
  dispose(): void;
}

interface EntityState<S> {
  readonly data: S;
  readonly metadata: {
    readonly revision: number;
    readonly validity: {
      readonly status: "unchecked" | "valid" | "invalid" | "unresolved";
      readonly mode: "draft" | "publication" | "runtime";
      readonly issues: readonly ValidationIssue[];
      readonly checkedRevision?: number;
      readonly dependencyRevisions: readonly DependencyRevision[];
    };
  };
}

abstract class Entity<S, C, E> implements IEntity<S, C, E> {
  // Shared lifecycle; protected hooks supply concept policy.
}

class Creature extends Entity<CreatureData, CreatureCommands, CreatureEvents> {
  static deserialize(input: unknown, context: HydrationContext): Creature;
  // Owns shape decoding, version conversion, validation and command handlers.
}
```

`CreatureData` above means the chosen existing contract for that class, not a newly invented
union of all Creature representations. The first migration uses the authored Creature contract
through an explicit `CreatureDefinition` class; runtime `Creature` follows in its own slice.

The base implements private state ownership, immutable snapshots, observable state publication, validated transitions, typed
command dispatch, event channels, subscription cleanup, serialization mechanics, and disposal.
Its protected hooks cover decoding, encoding, validation, and command behavior. It contains no
switches over Creature/Item/Location kinds and no universal arbitrary `set(path, value)` escape.
Concrete handlers are private/protected; only the instance can emit its events.

Use generics where they enforce correlation: command name to parameters/context, event name to
payload, owned state to snapshot, and identifiers to references. Avoid unrelated type parameters
on every consumer. Keep existing dotted names in serialized envelopes, with short typed endpoint
names such as `open` in the instance API.

`state` is recursively immutable at runtime as well as readonly in TypeScript. Input, output,
event, and serialization data must not retain mutable aliases into private state. Changes occur
through declared commands; a handler prepares a candidate, validates it, commits one revision,
then makes immutable events available for delivery. Rejected commands leave domain data unchanged
and emit no successful change event. Receipts acknowledge execution/rejection; they do not expose
a competing validity flag or validation report. `validate()` updates `state.metadata.validity`
and returns no separate result. Rejected command diagnostics concern the attempted action, not
the validity of unchanged entity data.

Derived metadata is recomputed after hydration and relevant transitions. Relation changes must
invalidate dependent validation, using registered dependencies and checked revisions. No consumer
may treat `unchecked` or `unresolved` as valid, and a command/publication boundary must recheck its
required references against the current scoped snapshot. Validation must not silently repair data.

### Observable state

`state` reads the current immutable snapshot synchronously. `state$` exposes that same state over
time as a read-only RxJS `Observable`; they are two access patterns over one source of truth.
The abstract base owns publication so every concrete entity has identical subscription semantics.
Use a private `BehaviorSubject` (or an equivalent implementation) and expose only its Observable
view, never public `next`, `error`, or `complete` methods. RxJS's current-value subscription model
is documented in its [official Subject guide](https://rxjs.dev/guide/subject#behaviorsubject).
This proposes the dependency/API; installing RxJS belongs to the implementation gate.

```ts
const subscription = creature.state$.subscribe((state) => {
  engine.observeCreature(state);
});

// Engine teardown or removal of the entity from its execution scope:
subscription.unsubscribe();
```

Subscription semantics:

- A new subscriber synchronously receives the latest fully constructed snapshot, including
  validity metadata. Hydration does not expose partially decoded state. Unresolved references
  can be represented explicitly in the initial snapshot and resolved in a subsequent update.
- Each committed state change publishes one complete immutable snapshot after data and derived
  metadata are consistent, before the corresponding domain events are delivered. `state` already
  refers to that snapshot when its observers run. No intermediate field-by-field updates escape.
- Metadata-only changes, including invalidation or revalidation of a dependency, also emit. They
  need not advance the durable data revision, so consumers must not deduplicate solely by that
  revision. An unchanged validation result, rejected command with unchanged state, or no-op does
  not emit. Emit every actual committed change; do not debounce or drop transitions in the base.
- Multiple subscribers share publication; subscribing does not execute commands or rerun entity
  behavior. Consumers can derive focused streams with `map` and `distinctUntilChanged`, using
  an appropriate value comparator. Such streams remain projections of entity state, including
  validity, rather than separately maintained metadata.
- Observers cannot mutate snapshots. Commands issued while a snapshot is being delivered enter
  the same bounded causal queue and execute after current snapshot/event delivery, preventing
  recursive updates and different observers seeing different transition order.
- State observers are notifications, not awaited command handlers or transaction participants.
  Observer failures must be reported without terminating the shared state stream, preventing other
  observers from receiving updates, or rolling back a commit. Async observers own their rejected
  promises; required ordered domain reactions use the explicit command/event binding mechanism.
  The implementation uses standard RxJS behavior for both direct and piped subscribers: thrown
  consumer callback errors reach RxJS host error handling (`config.onUnhandledError` when configured).
  The library does not mutate that global configuration; application hosts own error reporting.
  Operator errors can terminate an individual derived stream without terminating the entity stream.
- Invalid state is an ordinary emitted snapshot, not an Observable error. `dispose()` completes
  the stream and releases owned subscriptions; later subscriptions complete without a snapshot,
  and disposed instances reject commands. Consumers unsubscribe when their own scope ends.

For a persistent workflow, the execution engine can observe entities inside its isolated working
graph, but those observations are provisional until the application transaction succeeds. External
observers receive only persisted snapshots through the application boundary. A failed transaction
disposes the working graph; never attach externally visible side effects to its provisional stream.
Observable publication does not establish multi-entity transaction atomicity or durable delivery.

State observations answer what the entity currently is; domain events record what happened and its
cause. An event can occur without a state change. Keep both contracts: the engine subscribes to
state for current facts and to declared events when a reaction needs occurrence or causal context.
Serialization stores snapshots, never Observables or subscriptions; hydration creates fresh streams.

## Validation and relationships

Every concrete class owns its shape requirements, invariants, reference expectations, and lifecycle
rules. Syntax helpers such as finite-number checks can be shared privately; entity-specific policy
cannot live in external validator registries. Classes compose other entities' declared behavior
instead of copying it. For example, a Condition checks its Effect links through the Effect's state
and declared override capability; it does not parse an Effect's storage payload.

Provide immutable, typed, scope-bound reference access through `ValidationContext`. Load references
before validation; entity code does not query a database. The context identifies World lineage,
captured revision, and/or Campaign Instance as applicable. Missing required references produce
`unresolved` or `invalid` state as defined by the validation mode, never an implicit pass.

World owns World-wide membership and publication invariants and aggregates child state issues.
Location owns its local hierarchy/geometry invariants; the owning World or Location hierarchy owns
cross-record graph invariants. Character owns equipment compatibility; Item owns its capabilities.
Ownership follows the invariant, so orchestration cannot become a renamed external validator.
Avoid recursive whole-graph validation: load the graph, validate local entities, then validate
owner-level relationships over a stable revision set.

Draft mode permits explicitly modeled incomplete authoring. Preserve the current legacy-edit policy
with a trusted baseline and field-change comparison supplied by the mutation workflow: unchanged
legacy scalar problems remain visible in state, while only explicitly grandfathered problems may
be nonblocking for that edit. Publication fully checks all fields and references. Runtime commands
protect runtime invariants. A client cannot choose a weaker validation mode or supply its own
trusted baseline to bypass a publication/runtime operation.

Malformed serialization is a decode error before an entity exists. Structurally decodable but
incomplete authored state can become an invalid draft entity. Do not label malformed JSON as a
valid `S` merely to return an entity. Distinguish transport/decode failures from entity validity.

## Commands, events, and context binding

An instance command endpoint is callable and bindable. `command(name, invocation)` executes;
`command(name)` obtains an endpoint without executing. `listen()` accepts a compatible handler or
bound endpoint and returns an unsubscribe function. Obtaining an endpoint never activates a trap.

```ts
const activate = trap.command("activate").bind({
  map: (opened: DoorOpenedEvent) => ({
    initiator: opened.initiator,
    params: { triggeringEntityId: opened.context.actorId },
    context: { locationId: opened.context.locationId },
  }),
});
const unsubscribe = door.events.opened.listen(activate);

await door.command("open", {
  initiator: actorRef,
  params: {},
  context: { locationId },
});
unsubscribe();
```

The mapping function is declared and typechecked when `.bind()` is called; it is evaluated for each
delivered event. Constants can be captured then; changing state is read explicitly at delivery
through scoped immutable state access. Avoid silently capturing stale mutable objects. Ordinary
event handlers use the same explicit mapping contract when they require transformed context.
Direct issuers, including engine adapters, bind typed input-to-command mappings in exactly the same
way. Missing mandatory context fails at compilation for typed code and at runtime for decoded input.

`door.events.opened.listen(trap.command("activate"))` is legal only when the event and command
invocation shapes are directly compatible, or the endpoint has an explicit compatible default
mapping declared by its class. There is no implicit global context search or arbitrary payload cast.

Commands retain their initiating actor separately from their immediate source entity. Event
envelopes identify source, event identity, causal parent, execution scope, and committed revision.
Mapping selects business context; it cannot forge authenticated authority or discard causal scope.
Application boundaries still authorize execution. Payloads cannot expose mutable entity instances.

Proposed deterministic dispatch semantics:

The first implementation requires a shared `EntityScope` for interacting instances. Pass it through
entity construction/hydration options. A root command promise settles after that scope drains;
commands submitted while it is draining immediately acknowledge `queued`, and their eventual
rejection fails the root operation. These acknowledgments are not persistence confirmations.
Do not share a scope between unrelated concurrent requests. Reentrant `validate()` calls also queue
so snapshot delivery cannot be interleaved. Direct non-reentrant validation remains synchronous.
Hydrate and validate the operation graph before dispatch; constructing an entity inside an active
scope defers its initial validation and exposes `unchecked` until that queued work runs.

- Serialize commands per instance. An accepted command commits its local state atomically before
  delivery. Revisions support persistence concurrency; in-memory ordering alone is insufficient.
- Queue events and listener-issued commands in a bounded, FIFO causal scope instead of recursively
  calling through the graph. Preserve listener registration order and await async work. Invocation
  from a listener enqueues work; it must not await its own outer queue's drain and deadlock.
- Fail the causal scope on mapping/handler failure, record the failure, and stop remaining delivery.
  Already committed in-memory transitions do not magically roll back. A standalone call reports
  that partial outcome; a transactional application workflow discards its isolated working graph.
- For persistent operations, use an isolated graph and stage all changed snapshots and external
  notifications. Persist together with revision checks; publish external notifications only after
  success. A durable outbox is required if guaranteed external delivery is later needed.
- Bound work/depth for cycles, release bindings on disposal, and ensure explicit unsubscribe works.
  Do not promise replay, exactly-once delivery, distributed dispatch, or implicit cross-entity atomicity.

These are domain interaction contracts, not permission to resume the gameplay engine. Prove dispatch
with small Door/Trap fixtures; adapt the paused engine to it only as a later migration task.

## Serialization and identity

Every concrete class exposes a typed static factory `deserialize(unknown, context)` and instance
`serialize()`. A separate `EntityConstructor` interface describes the static side because instance
interfaces cannot enforce static factories. The base shares safe JSON mechanics; concrete classes
own their codecs, supported schema versions, and state migrations. A factory registry dispatches
by declared type/version only and contains no concept behavior.

At persisted/API boundaries, use the explicit `deserializePayload(unknown, context)` raw-resource
factory. Never pass untrusted resource input to a factory that interprets entity envelopes: envelope
fields are ordinary resource fields at that boundary and cannot redirect validation to nested data.

The target serialization envelope contains entity type, schema version, and durable state, preserving
existing identity and extension semantics. Schema version, entity revision, and captured content
revision are distinct. Initially repositories adapt these snapshots to existing persisted resource
payloads so immutable captures and hashes are unchanged. Any later envelope/storage cutover requires
an explicit versioned migration and updates to `domain-resource.ts` and the AI serialization guide.

Serialize owned children through their own codecs; represent non-owned links by typed references.
Hydrate in two passes (construct, then resolve references) so cycles and shared identity do not
produce duplicate instances. The scoped identity map keys by concept, identity, and owning revision/
instance scope, not a bare ID. Missing links surface through state validation.

Round trips must preserve unknown namespaced extensions, retained legacy payloads, private
descriptions, optional fields, identities and revisions. Do not normalize these away as an incidental
consequence of class construction.

Never serialize closures, listeners, injected services, command queues, or cached validity as trusted
facts. Bindings are recreated after hydration. If authored bindings must persist, use versioned,
declarative binding specifications with explicit mapping operands, never executable code strings.
The first slice need not introduce persisted bindings. Instance serialization is a persistence
operation, not a safe player-facing projection by default.

## Concrete concepts and lifecycle separation

Prefer shallow inheritance and composition. Character can specialize shared Creature behavior only
where its runtime contract is substitutable; its membership and lifecycle rules remain its own.
Do not inherit a runtime Creature from an authored Creature Definition, or a Character from a
Creature template merely to reuse fields. Authored definition, captured revision, and runtime
instance have explicit contracts and deliberate realization operations.

| Concept family                         | Proposed responsibility                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| World / WorldDefinition                | World membership, ownership, publication readiness and captured definition relationships; explicit lifecycle class boundaries.                                         |
| Location / LocationDefinition          | Authored and runtime Location state, hierarchy, map ownership and validation; accepted reconciliation below replaces adjacency.                                        |
| Creature / CreatureDefinition          | Runtime Creature state versus authored template; attributes, skills, equipment pool, embodiment and reference rules reside with the appropriate class.                 |
| Character / CharacterTemplate          | Runtime membership/lifecycle versus authored Codex template; share Creature capabilities without erasing those distinctions.                                           |
| Item / ItemDefinition                  | Instance state versus authored capabilities; weight, cost, container and equipment rules.                                                                              |
| Discovery                              | Truth, Belief/Rumor composition and authored invariants; runtime knowledge belongs to its owning Creature/knowledge concept.                                           |
| Attribute, Skill, Modifier             | Own value, definition/reference and modifier semantics; definitions and grants stay distinct where their lifecycles differ.                                            |
| Effect, Condition                      | Modifier composition, duration, allowed overrides and granted relationships.                                                                                           |
| Wall, Door, Window                     | Own geometry/blocking and declared transitions; Location remains owner. Decode existing representations explicitly, including legacy door fields and terrain variants. |
| Plot, Placement and remaining concepts | Own hierarchy, realization and relationship invariants; inventory all remaining behavior before declaring completion.                                                  |

Do not mint persisted IDs for every nested object just to satisfy a base-class API. Owned entities
can use stable owner-scoped keys when the current contract has no independent identity. World,
Campaign Definition, Campaign Instance, and Session ownership must remain distinct.

Entity commands implement intrinsic transitions and invariants. Authored gameplay policy remains
represented by captured rules; moving behavior into classes must not silently add automatic damage,
movement costs, rolls, or trap triggers to rule-free Worlds. A Door-to-Trap subscription exists only
when explicitly bound. This refactor changes where domain behavior lives, not which mechanics
exist. The event-driven rules architecture remains paused and must later invoke entity capabilities
instead of writing raw state.

## Accepted Location migration contract (2026-10-11)

The user accepted the following reconciliation after the Attribute, Skill and Modifier slices.
These decisions replace the optional-map and preserved-adjacency proposals. They are accepted target
behavior. The Location authoring implementation now follows them; runtime realization and owned
map-element classes remain separate follow-ups. World authoring is now migrated as described above; lineage lifecycle and runtime World remain pending.

| Concern                         | Accepted decision                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity boundary                 | Introduce `LocationDefinition` for authored World Locations. Keep richer geographic/runtime state distinct with explicit realization.                                                                                                                                                                                                                                                                                                    |
| Identity and World ownership    | Preserve `identity.id` and its version. Supply authorized World ownership through context; do not add the experiment's required top-level `worldId`.                                                                                                                                                                                                                                                                                     |
| Required map                    | Every valid Location must have a map. Preserve image maps with their full metadata and isometric terrain manifests/chunks. An image-map marker without image content does not satisfy the invariant. An explicitly authored blank terrain map is valid; do not invent an image, terrain dimensions or orientation during migration.                                                                                                      |
| Hierarchy only                  | Preserve parent/child containment, root placement and hierarchy position. Abandon adjacency and related-Location link concepts: remove `adjacentLocationIds`, `connectedLocationIds` and their authoring commands/UI/validation. Travel between Locations is handled by roleplay at the table, not a domain travel graph. Existing travel-connection resources and cross-Location traversal consumers need explicit retirement handling. |
| Weather and audiovisual effects | Deferred, not abandoned. Track the capabilities and their existing shapes in the ledger below; they are not mandatory Location fields in this migration.                                                                                                                                                                                                                                                                                 |
| Scene/grid                      | Preserve scene orientation, scene notes and existing square/hex grid configuration with positive `cellSizePixels`. Grid configuration does not apply to scenic maps: scenic presentation must not render or use it. Preserve saved configuration through orientation changes. Image pixel grids remain distinct from terrain's physical cell size and coordinates.                                                                       |
| Walls, Doors and Windows        | Separate owned concepts with owner-scoped identities. Preserve normalized 2D wall geometry/legacy doors and 3D terrain openings as explicit formats. Location owns its map and map elements.                                                                                                                                                                                                                                             |
| Private content                 | Preserve `gmDescription`, other private fields and discoveries through codecs and edits. Only authorized projections may disclose content to players.                                                                                                                                                                                                                                                                                    |
| Hierarchy validity              | Location owns its local shape and parent-reference checks against authorized context. WorldDefinition now owns collective root membership and cycle checks.                                                                                                                                                                                                                                                                              |

### Migration requirements and compatibility

- The authored contract in `packages/common/src/types/world-authoring.ts` is the starting point;
  implement the approved map requirement and grid addition there alongside codecs, DTOs and callers.
  The pixel-grid shape is now a common `LocationSceneGrid`; the old experiment has been replaced
  with forwarding exports and contract tests.
- Existing valid image and isometric maps must round-trip without loss. Legacy mapless drafts remain
  loadable for repair and retain their data, but expose blocking map-required validity and cannot
  pass publication as valid Locations. Creation must support supplying/creating the required map;
  do not silently manufacture one or classify incomplete authoring state as valid.
- Remove authored adjacency from common requests, DTOs, record construction, Codex validation,
  import/fork rewriting, AI generation and Atlas controls together. Containment navigation remains.
  Inspect `LocationConnectionState`, `LocationGraphState.connections`, `location-connections`, and
  cross-Location transition consumers as retirement targets, not preserved travel features. Include
  route-bearing `TravelState`, `begin-travel`, connection identifiers and Location/World creation
  prompts in that inventory. Do not erase previously captured data or conflate retirement with
  movement within a Location's map.
- Canonical Location checks, map/scene policy, Condition grants, construction and image policy move
  into their owning classes. Persistence of terrain chunks/hashes, media authorization and private
  projections remain explicit adapters. Preserve hierarchy and terrain-capture checks throughout.
- Update common types, resource mappings where affected, canonical architecture, AI contracts,
  fixtures and all consumers in the same implementation. Record retained legacy read adapters;
  old optional maps and link fields must not remain active new-authoring policy.

### Deferred capabilities ledger

| Capability                        | Retained design                                                                                                | Re-entry requirement                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Location weather                  | Open `condition`, optional `temperatureCelsius`, wind `speedKph` and optional `directionDegrees`.              | Revisit authored defaults versus runtime weather ownership before adding common fields and commands.                                    |
| Location audiovisual presentation | Named asset-backed audio/visual effects with `enabled`, `loop`, and audio `volume` or visual `opacity` in 0–1. | Restore typed configuration/commands/events in a later presentation slice; keep these distinct from mechanical Condition/Effect grants. |

These two items remain explicit migration follow-ups and must be carried into the closure audit;
deferral does not authorize deleting the concepts from planning. No weather or audiovisual feature
work is included in the current Location implementation scope.

## Alternatives and trade-offs

1. **Recommended: migrate one complete concept at a time.** Build the small base, then move Creature
   validation and all its callers through it. Preserve wire contracts through adapters. This gives
   executable proof and limits data risk; temporary adapters require explicit removal criteria.
2. **Whole-model replacement.** Replace all common contracts, classes, resource mappings, engine
   writes, and application callers together. It offers a clean final boundary immediately but couples
   every migration risk and makes existing drafts/captures harder to preserve. Do not choose it for
   this checkout without a complete schema and consumer inventory.

The chosen OOP model makes behavior discoverable and enforces transition boundaries. It adds
hydration, lifecycle, and subscription management that plain records did not need. Keep the base
small and test these costs explicitly; do not hide remaining standalone policy behind empty classes.

## Migration gates

Each implementation gate ends with runnable evidence and deletion/delegation of replaced policy.
Experience and engine feature development remains paused through the agreed closure audit.

### 0. Baseline and concept inventory

Source mapping is recorded in [the concept and consumer inventory](domain-concept-consumer-inventory.md).
It covers all 39 current common type files and names API, browser, common-engine and persistence
consumers. This completes the source-inventory portion only; it does not close gate 0's fixture and
baseline requirements or any remaining implementation gate. Use its D/C references and I01–I10
checklist to track subsequent slices. Placement, Discovery and Plot authoring slices are now implemented; their consumer cutover, broader
authored definitions, owned map elements, lifecycles and runtime integration remain.

- Inventory authoritative types, all validators/calculations, constructors, mutations, projections,
  resource mappings, AI generation paths, and test fixtures by concept.
- Record authored/captured/runtime distinctions and legacy formats, including draft-vs-publication
  behavior. Capture existing test failures separately from migration failures.
- Assign every rule an owning class and every adapter an eventual removal criterion. Reconcile the
  experimental Location shape with existing contracts; preserve intended new fields as explicit
  decisions, not accidental replacements.

Exit: complete behavior/consumer matrix, representative existing-data fixtures, and agreed contracts
for the first Creature slice. No state migration or persisted format change hidden in scaffolding.

### 1. Minimal executable entity foundation

- Implement the abstract base, readonly state and `state$`, class codecs, validity lifecycle, correlated command/
  event types, bind-time mappings, scoped reference access, and deterministic bounded dispatch.
- Use test-only Door/Trap implementations for interaction semantics before adding new product behavior.
- Replace the old type-only entity API deliberately and update its compile-time tests/consumers.

Exit: runtime tests prove mutation isolation, commit/rejection, event ordering, context mapping,
unsubscribe/disposal, handler failure, cycles, and round-trip behavior. Type tests reject wrong
command parameters, event payloads, and incomplete binding contexts. Browser/API package builds work.
State-stream tests prove initial/latest delivery, shared subscriptions, atomic immutable snapshots,
metadata-only notifications, no-op suppression, publication-before-event ordering, queued reentrant
commands, observer failure isolation, unsubscribe/completion, and transaction visibility boundaries.

### 2. Creature authoring vertical migration

- Implement `CreatureDefinition` against `WorldCreatureDefinition`. Move canonical field checks,
  Codex Creature checks, references, embodiment policy and relevant construction behavior into it.
- Route manual create/edit, AI proposal apply, draft validation, and publication checks through the
  same class. The application supplies scope and baseline; it does not duplicate checks.
- Keep API diagnostics compatible by translating entity-state issues at the boundary. Remove the
  Creature branches from external validators, or retain only short-lived forwarding adapters.

Exit: existing Creature tests pass; legacy unchanged-field edits still work; publication rejects
invalid full state; foreign-World references fail; state validity cannot remain falsely fresh;
unknown input and serialization round trips are covered; no Creature policy remains in migrated
API branches. The AI-facing guide is compared and updated for the implemented class contract.

### 3. Related authoring concepts

- Move Item, Attribute, Skill, Modifier, Effect, Condition and CharacterTemplate behavior, then
  Location/World and Discovery/Plot/Placement behavior according to the dependency inventory.
- Introduce concrete Wall/Door/Window classes while preserving existing map and terrain formats.
- Move relationship invariants to owners; keep publication orchestration thin and state-based.

Exit per concept: one policy owner, all authoring/import/AI/publication paths use it, serialized
fixtures remain compatible, no ID leakage in translated diagnostics, and obsolete validators are
removed. Parameterize tests over the actual existing formats rather than rewriting expectations
to match a simplified replacement model.

### 4. Runtime and consumer cutover

- Introduce runtime entities and explicit realization from captured definitions. Migrate existing
  engine and Session mutation paths mechanically to commands; add no new mechanics or experiences.
- Let the engine observe current facts through entity `state$` subscriptions with scope-owned
  teardown, replacing polling or duplicated state tracking in migrated consumers.
- Migrate browser domain calculations/validation to the same classes or authorized projections.
  UI-only field affordances can remain local; authoritative policy cannot.
- Keep revisions, authorization, capture immutability, transactions, and existing event history intact.

Exit: direct writes to migrated domain state are eliminated outside hydration/persistence adapters;
existing runtime scenarios and snapshot/concurrency tests pass; engine and entities use one command
contract with no privileged bypass; metadata consumers read exposed state only.

### 5. Closure before resuming feature work

- Audit every concept in the inventory, including policy outside API validators. Remove temporary
  adapters and duplicate schemas where their callers are migrated.
- Enforce package boundaries and readonly state access; prohibit concept switches containing policy
  in generic validators, engines, codecs, or infrastructure.
- Compare source types, resource mapping, canonical architecture and AI guide. Document intentional
  residual adapters and any unimplemented concepts rather than claiming a universal conversion.

Exit: each inventoried concept owns its behavior and codec, all call paths use its public contracts,
and migration tests establish compatibility. Resume experience/engine work only after explicitly
reporting this closure against the requested requirements.

## Domain-model documentation verification

The early slices preserve payload contracts; the accepted Location slice changes required map,
grid and retired adjacency/travel fields in `packages/common/src/types`. Resource identities remain
stable; `location-connections` is now read-only legacy compatibility. The AI-facing guide was updated to distinguish
the executable Entity and concrete authoring APIs from persisted resource JSON. The Location
experiment is replaced with executable LocationDefinition and common grid contracts. Serialization envelopes and runtime validity metadata must not appear
in AI-generated `definitions` payloads. The larger base-contract sketch above includes future
dependency-revision tracking; exact implemented contracts are in `packages/domain/src`.

First-slice verification: domain build and typecheck passed; 28 domain runtime tests passed;
API typecheck passed; 72 tests across the six targeted authoring, Codex, draft, publication and
AI-service suites passed. The independent implementation review found no remaining blockers
within the documented shared-operation scope. No database migration or experience/engine feature
change was introduced.

Second-slice verification: domain build/typecheck and 37 domain runtime tests passed; API typecheck
and 86 tests across eight targeted authoring, Codex, draft, publication and AI suites passed.
Independent Item review found no compatibility blockers. Item payload contracts and persisted
resource mappings were compared with the AI guide and remain unchanged; the guide now documents
the Item class and its serialization boundary.

Third-slice verification: domain build/typecheck and 47 domain tests passed; API typecheck and
97 tests across 11 targeted suites passed, including Codex CRUD, validation, publication, fork/export,
AI proposals and raw-payload boundary regressions. Independent review identified the envelope
ambiguity and verified its correction. Common types and `domain-resource.ts` mappings remain
unchanged; the AI guide now documents Effect/Condition ownership and explicit raw-resource decoding.

Fourth-slice verification: domain build/typecheck and 58 domain runtime tests passed; API typecheck
and 98 tests across 11 targeted suites passed. Two additional full-draft save regressions passed
within the 35-test authoring service suite. Independent review found no remaining blockers.
Character Template common types and resource mappings were compared with the AI guide and remain
unchanged; the guide now documents class-owned validation, baseline checks and artwork policy.

Attribute/Skill/Modifier verification: domain build/typecheck and 74 runtime tests passed; API
typecheck and 134 tests across 14 targeted suites passed, followed by the expanded eight-test Skill
adapter suite. Independent reviews compared the migrated rules with common contracts and fixed
same-revision equality for reordered JSON keys. Common types and resource mappings are unchanged;
the AI guide now identifies class policy ownership and remaining browser/runtime compatibility.
Location reconciliation was subsequently accepted and implemented in the next authoring slice below.

Location verification: common, domain, API and web typechecks passed during the coordinated run.
All 90 domain tests and 133 API tests across 13 targeted suites passed. Browser map/grid,
authoring and navigation tests passed, including terrain/image switching and existing editor access. Common Location fields, retired travel commands,
and the read-only legacy resource mapping were actively compared with the updated AI guide.
Private data and captures remain preserved; no database rewrite or World entity migration was made.

Remaining Location boundaries: shared common terrain structural validators still serve the class
and terrain persistence; owned Wall/Door/Window classes and runtime realization are not complete.
Collective root/cycle orchestration remains outside the local entity. Weather/audiovisual work
remains tracked in the deferred ledger. Creating a World can initialize an incomplete root draft;
that root must acquire a map before publication. This does not claim all entity migration gates closed.

### World authoring verification — 2026-10-11

World migration adds 14 domain regressions for codecs, immutable captures, observable command/event
ordering, stale validation evidence, membership preservation, malformed records and relationships.
All 104 domain tests and 127 API tests across 14 targeted suites pass. Domain (including compile-time
contracts), API and web typechecks pass; formatting and `git diff --check` pass. Independent Backend
Architect/Code Reviewer review identified and corrected no-op event emission and mixed-array membership
data loss. Placement reference policy now belongs to World; Placement shape remains in the adapter.

Compared `packages/common/src/types/versioning.ts` and `apps/api/src/domain/domain-resource.ts` with the
AI-facing guide. Common lineage/revision/snapshot contracts, identifiers and resource mappings remain
unchanged. Updated `apps/api/src/ai/prompts/domain-model.md` to distinguish executable authored content
from lineage metadata, describe context/evidence requirements, and preserve existing generation JSON.

### Placement, Discovery and Plot authoring verification — 2026-10-12

Added three concrete classes and 23 domain regressions plus compile-time contracts. All 127 domain
tests pass. Across 12 targeted API suites, 118 tests initially passed and one older recovery assertion
failed because it expected mapless Locations to be publishable. Updated that assertion to preserve
recovered data while expecting the accepted required-map diagnostics; the recovery and new Campaign
entity suites then passed all 14 tests. All 119 tests selected by the broader run are therefore passing
after the targeted recheck. Domain, API and web typechecks pass; formatting and whitespace checks pass.

New evidence covers explicit Placement scopes, retained raw/private/extension state, canonical versus
legacy Discovery shapes, cross-Discovery references within a Plot (and isolation across Plots), graph
cycles and reciprocal Placement contexts, malformed JSON, immutable context, state-before-event
ordering, atomic rejection and equivalent-write event suppression. Independent review corrected
malformed facet-reference handling, graph validity for all scoped Plots, and duplicate diagnostic
projection for distinct same-named Plots. A preliminary API attempt during parallel edits saw missing
unbuilt domain exports; this was resolved by rebuilding and is not recorded as a pre-existing failure.

Common `placements.ts` and `plots.ts` contracts and `domain-resource.ts` mappings were actively compared
with the AI-facing guide. No persisted fields, identities, discriminants or resource names changed.
Updated the guide with entity ownership, explicit scope/shape modes, envelopes, canonical-write and
legacy-read distinctions. Existing common validators/browser semantic helpers and runtime realization,
knowledge and progress remain documented compatibility/cutover work; this does not close gates 3–5.

### Profession authoring verification — 2026-10-12

All 133 domain tests pass, including six new Profession runtime tests and compile-time contracts.
Five targeted API suites pass 82 tests, including sparse legacy grants, every Model rank reference
site, Condition scope, envelope isolation, malformed JSON and adapter disposal. The two browser
Character-option/Profession suites pass eight tests. Domain, API and web typechecks pass. The web
production build, including SSR/client output and prerendering, passes with its new domain workspace
dependency (the initial sandbox run could not bind the prerender port and was rerun successfully).
Independent Backend Architect/Code Reviewer review found no blockers. Formatting and whitespace
checks pass.

Compared common `professions.ts`/`modifiers.ts` and `domain-resource.ts` with the AI-facing guide:
persisted contracts and resource mappings are unchanged; the guide now documents Profession class
ownership and remaining semantic/runtime limits. Retained common compatibility helpers are no longer
used by production Profession authoring adapters or its browser grant editor. Full advancement-window,
order/tier-coverage, expression and action-reference validation remain separate gaps; this migration
preserves existing policy rather than declaring those unimplemented invariants complete.

### Background authoring verification — 2026-10-12

All 139 domain tests pass, including six new Background runtime tests and compile-time contracts.
Six targeted API suites pass 84 tests; three browser Character-option/Profession/Background suites
pass ten tests. Domain, API and web typechecks pass. Independent review using Backend Architect and
Code Reviewer guidance found no blockers. Formatting and `git diff --check` pass.

Coverage includes bounded/raw/envelope codecs, sparse legacy payloads, grant duplicates and malformed
recipes, captured Condition scope, exact Model releases and concept role, observable rename ordering,
no-op events, detached authoring helpers and adapter disposal. Component construction preserves
malformed input rather than silently correcting it; only an explicit grant edit replaces grants.

Compared common `character.ts` BackgroundComponents and `modifiers.ts`, plus `domain-resource.ts`,
against the AI-facing guide. No common fields or persisted resource mappings changed. Updated the
guide to describe the executable class and distinguish compatibility granted Conditions from declared
common fields. Optional attribute/skill/tool/equipment/feat/feature/language/choice invariants and
runtime acquisition remain documented gaps. This is an authored-policy migration, not full domain
closure or authorization to resume experience/engine features.

### Heritage compatibility and authoring verification — 2026-10-12

All 146 domain tests pass, including seven new Heritage runtime tests and compile-time contracts.
Seven targeted API suites pass 106 tests, including Character draft compatibility; four browser
Character-option/Heritage/Background/Profession suites pass twelve tests. Domain build and domain,
API and web typechecks pass. Independent review using Backend Architect and Code Reviewer guidance
found no remaining blockers. Targeted formatting and `git diff --check` pass.

Coverage includes raw/envelope codecs, malformed JSON, observable rename ordering, rejected/no-op
commands, captured Condition references, temporary instance disposal, optional generic Model
conformance, structural diagnostics and preservation of rich modifier pairs during descriptive edits.
The API intentionally retains historical compatibility policy rather than adding structural publication
gates. Deep modifier/choice semantics, prerequisite/reference resolution, dedicated UI and runtime
selection reconciliation remain open.

Compared common `heritage.ts` and `domain-resource.ts` against the AI-facing guide. No common fields
or persisted resource mappings changed. Updated `domain-model.md` with executable ownership,
compatibility projection and remaining validation/runtime limits. Experience and engine features
remain paused.

### Discipline compatibility verification — 2026-10-12

Baseline Codex/Heritage suites passed 18 tests before adapter changes. After migration, all 153 domain
tests pass, including seven new Discipline runtime tests and compile-time contracts. Ten targeted API
suites pass 103 tests, covering the new adapter, World authoring and existing science conversion,
archive, migration runner, catalog and resource behavior. Domain build and domain/API/web typechecks
pass. Targeted formatting and `git diff --check` pass. Independent review using Backend Architect and
Code Reviewer guidance found no remaining blockers.

Coverage includes detached raw/envelope codecs, private extensions, required-field diagnostics, open
vocabularies, fractional bands and empty arrays, structural input/range/duration/scaling checks,
observable state-before-event ordering, rejected/no-op commands, captured Condition links and disposal.
API fixtures preserve sparse captures, optional Model conformance and converted historical spells.
Historical nested payloads can carry structural diagnostics without acquiring a new publication gate.
No browser implementation changed in this slice; web typechecking verifies the package consumer.

Compared common `disciplines.ts`, related primitive/rule contracts and `domain-resource.ts` with the
AI-facing guide. Updated `domain-model.md` to describe class ownership and compatibility scope; no
common fields or persisted resource mappings changed. Nested rules, action/outcome/expression semantics,
reference resolution, full publication validation and runtime access/capacity/activation remain open.
Legacy spell conversion and dual-kind reads remain compatibility boundaries. Experience and engine
feature work remains paused.

### Feat compatibility verification — 2026-10-12

Baseline Discipline/Codex suites passed 19 tests before adapter changes. After migration, all 160 domain
tests pass, including seven new Feat runtime tests and compile-time contracts. Eight targeted API suites
pass 100 tests, covering Feat/Discipline/Heritage adapters, World authoring, resource metadata and
Character draft compatibility. Domain build and domain/API/web typechecks pass. Targeted formatting
and `git diff --check` pass. Independent review using Backend Architect and Code Reviewer guidance
found no blockers. No browser implementation changed; web typechecking verifies the package consumer.

Coverage includes detached raw/envelope codecs, bounded JSON, private extensions, required traits,
open categories and empty lists, shallow component diagnostics, captured Condition references,
observable rename/event ordering, rejected/no-op commands and disposal. API tests preserve sparse
captures, optional generic Model conformance, raw envelope-shaped extensions and prior grant diagnostics.
Nested trait identity/components and choice/predicate semantics remain unchecked; passing these shallow
checks does not establish full Feat validity. Publication and runtime acquisition remain open.

Compared common `character.ts` FeatComponents, nested `rules.ts` contracts and `domain-resource.ts`
against the AI-facing guide. Updated `domain-model.md` with class ownership and precise compatibility
limits. No common fields or persisted resource mappings changed. Experience and engine work remains
paused.

### Action compatibility and Discipline outcome correction — 2026-10-12

Baseline Feat/Codex suites passed 18 tests before adapter changes. After migration, all 168 domain
tests pass, including seven new Action runtime tests and a Discipline outcome regression. Compile
contracts include a rich fixture checked against common ActionComponents. Eight targeted API suites
pass 90 tests across Action/Feat/Discipline adapters, World authoring, resource metadata and science
conversion. Domain build and domain/API/web typechecks pass. Targeted formatting and `git diff --check`
pass. Independent review using Backend Architect and Code Reviewer guidance found no blockers.

Action coverage includes raw/envelope codecs, private extensions, malformed/bounded JSON, missing
required components, closed activation vocabulary, OutcomeDefinition containers, captured Condition
references, observable rename/event ordering, no-op/rejected commands and disposal. API compatibility
preserves sparse captures and optional supplied Model conformance. Discipline now checks outcomes and
scaling additionalEffects as id/effects containers instead of incorrectly requiring kind. Nested
predicates/effects remain shallow checks; publication enforcement and runtime execution remain open.

Compared common `rules.ts` ActionComponents/OutcomeDefinition, `disciplines.ts` and persisted
`definitions` metadata in `domain-resource.ts` against the AI-facing guide. Updated `domain-model.md`
to describe Action ownership, correct outcome structure and compatibility limits. No common fields or
persisted resource mappings changed. No browser implementation changed; consumer typechecking passed.
Experience and engine feature work remains paused.

### Trait compatibility verification — 2026-10-12

Baseline Action/Codex suites passed 18 tests before adapter changes. All 175 domain tests now pass,
including seven new Trait runtime tests and common-type compile contracts. Nine targeted API suites
pass 100 tests, covering Trait/Action/Feat/Discipline/Heritage adapters, World authoring and resource
metadata. Domain build and domain/API/web typechecks pass. An initial typed modifier fixture error
was corrected to a ScalarExpression before the successful run. Targeted formatting and
`git diff --check` pass. Independent review using Backend Architect and Code Reviewer guidance found
no implementation blockers.

Coverage includes detached raw/envelope codecs, private extensions, bounded JSON, empty optional
components versus missing data, collection shapes, Trigger event/effects interfaces, Condition capture
revalidation, observable rename/event ordering, no-op/rejected commands and disposal. API checks
preserve sparse captures, optional Model conformance and previous Condition-link policy. Generic
fallback regressions now use Language, since Trait no longer exercises that fallback.

Compared common `rules.ts` TraitComponents/RuleModifier/TriggerDefinition and `domain-resource.ts`
against the AI-facing guide. Updated `domain-model.md` to describe ownership and compatibility limits;
no common fields or persisted resource mappings changed. Nested modifier/choice/predicate semantics,
Trigger event vocabulary, recursive embedded Traits in Item/Feat/Character, full publication validation
and runtime realization remain open. No browser implementation changed; its package typecheck passed.
Experience and engine feature work remains paused.

### Feat/Trait owned validation — 2026-10-12

Feat now delegates embedded Trait checks to TraitDefinition, and Trait delegates embedded Action
checks to ActionDefinition. Owners project child state diagnostics with indexed paths, preserving
blocking/unresolved metadata. Validation forwards authorized record captures and mode, omits the
parent source identity, and disposes every temporary child. Child state metadata is never persisted.
The same checks run during existing commands: blocking child diagnostics reject rename atomically.
Raw malformed drafts remain deserializable for repair; API compatibility projections retain their
previous policy and do not acquire nested publication gates.

Baseline: 175 domain tests passed. After changes: 181 domain tests and 81 API tests across seven
suites pass, including recursive validity, repair by rehydration, multiple indexed children, scoped
Condition revalidation, detached context, child disposal, private-data round trips, atomic command
rejection and compatibility boundaries. Domain build and domain/API/web typechecks pass. Formatting
and `git diff --check` pass. Two initial test assertions incorrectly expected context identity rather
than cloned values; those assertions were corrected. Independent Code Reviewer review found no
implementation blockers; Backend Architect guidance informed implementation.

Compared common FeatComponents in `character.ts`, TraitComponents/ActionComponents in `rules.ts`,
and `definitions` mapping in `domain-resource.ts` with the AI-facing guide. Updated `domain-model.md`
for recursive ownership and its limits. Common types and persisted mappings are unchanged. Item and
Character embedded Trait ownership, persistent child graphs, full edit commands, deep rule semantics
and publication enforcement remain open. This slice adds no new entity classes or gameplay features.

### Item owned Trait validation — 2026-10-12

Item now validates optional `components.traits` through TraitDefinition, including Trait-owned Actions.
Supplied malformed lists/members and owned-child validity project into `item-traits-*` diagnostics with
indexed paths. Child contexts carry only authorized captures/mode; parent identity, baseline and Model
context are excluded. Temporary children are disposed. Item permits deeper JSON than Trait, so child
codec TypeErrors become diagnostics while the enclosing raw content remains preserved. Existing
commands reject blocking owned-child issues without partial changes.

All existing Item API consumers use purpose-specific filters, which remain unchanged. Canonical,
Codex and draft-grant adapters now also dispose their temporary Item instances. Static authoring and
AI selection decoding preserve prior behavior; no browser implementation changed.

Baseline Item/owned-definition API suites passed seven tests. After changes, 187 domain tests and
73 API tests across six suites pass, with six new domain cases and two API regressions. Domain build
and domain/API/web typechecks pass. Coverage includes absent/empty/multiple/malformed Traits, nested
Action diagnostics, private serialization, capture revalidation/disposal, atomic rename rejection,
codec-depth compatibility and canonical/Codex/Model acceptance. Formatting and `git diff --check` pass;
independent Code Reviewer review found no blockers, with Backend Architect guidance for implementation.

Compared `items.ts` Trait relationships, `rules.ts` nested contracts and `domain-resource.ts` persistence
mapping against the AI-facing guide; updated `domain-model.md`. No common fields or resource mappings
changed. Direct Item Actions, Vehicle Actions, Character-owned Traits, persistent child graphs, deep
rules, full mutation commands and publication enforcement remain open. Experience/engine features
remain paused.

### Item direct and Vehicle Action ownership — 2026-10-12

Item now delegates both optional `components.actions` and `components.vehicle.actions` to
ActionDefinition. Class-local orchestration validates supplied collection/member shapes, projects
child metadata into indexed `item-actions-*` and `item-vehicle-actions-*` diagnostics, forwards only
mode/authorized record captures, and disposes temporary Actions. The checks run before unresolved
record-context returns. Malformed Vehicle containers are reported without attempting full Vehicle
validation. Codec TypeErrors remain diagnostics; raw/deep/private data is preserved. Commands reject
blocking owned state atomically. Existing API canonical/Codex/Model gates retain their prior scope.

Baseline Item/Codex suites passed 16 tests. After changes, all 193 domain tests and 86 API tests across
seven suites pass. Six new domain tests cover optional/empty/multiple children, malformed collections,
missing child fields and repair, context revalidation/disposal, atomic rename rejection and deep-codec
preservation. Five API cases verify unchanged compatibility acceptance, child Condition diagnostics,
raw payloads and disposal. Domain build and domain/API/web typechecks pass; targeted formatting and
`git diff --check` pass. Independent Code Reviewer review found no blockers; Backend Architect guidance
and the bounded-refactor/incremental-domain skills informed implementation.

Compared `items.ts` ItemComponents/VehicleDefinition Action relationships, `rules.ts` ActionDefinition
and `domain-resource.ts` mapping with the AI-facing guide; updated `domain-model.md`. No common types
or persisted mappings changed. Full Vehicle validation, Character-owned Traits, deep rules, persistent
child graphs, full edit commands, publication enforcement and runtime execution remain open. No
browser implementation or gameplay feature changed.

### Catalog Character-owned Traits, then Vehicle field validation — 2026-10-12

The common CharacterDefinition contract is distinct from the existing flat World NPC CharacterTemplate.
Added CharacterDefinition for `definitions` kind `character-template`, with `character-definition`
codec envelope, observable state, rename/events, required attribute defaults and optional component
shape diagnostics. Its Traits delegate to TraitDefinition and owned Actions, preserving indexed issue
metadata, scoped captures and disposal. The generic Codex adapter consumes only existing
`character-definition-codex-*` Condition policy. NPC templates and runtime Character drafts retain
existing behavior; this does not materialize catalog Traits into runtime Characters.

Vehicle value validation then extended Item's ownership to required vehicle type/size/armorClass/
hitPoints/speeds and optional damageThreshold/crew/passengers/cargoCapacity/components. Open type/size
and movement names, empty maps/lists and finite negative/fractional numbers match common types.
Distance/Weight units use closed vocabularies. Missing required fields are unresolved; malformed supplied
fields are blocking diagnostics. Existing Entity status precedence applies when both occur, retaining
all issues. Action diagnostics aggregate even when other Vehicle fields are incomplete. Reference
string shapes are checked, but component targets are not resolved. No new API publication gate is added.

Character verification first passed 204 domain tests and 18 focused catalog/NPC API tests. After both
slices, all 209 domain tests and 115 API tests across nine suites pass. Eleven new Character runtime
cases and five Vehicle cases cover owned validity, serialization/privacy, context/disposal, fields,
units, repair and command atomicity; compile fixtures conform to common branded contracts. Domain
build and domain/API/web typechecks pass. Early typed fixture and test status-expectation mistakes
were corrected before the final run. Formatting and `git diff --check` pass. Independent Code Reviewer
review found no blockers; Backend Architect and the bounded-refactor/incremental-domain skills guided
implementation.

Compared `character.ts`, `items.ts`, shared primitive/rule types and `domain-resource.ts` mappings with
the AI-facing guide; updated `domain-model.md` and the inventory. No common types or resource mappings
changed. The new class increases the authored-class count to 21 without claiming domain closure.
Deep rules, Vehicle component references, runtime Character/Vehicle behavior, persistent child graphs,
full mutation commands and publication enforcement remain open. Experience/engine features stay paused.


## B10 — existing Instance and Session execution

The executable CampaignInstance aggregate owns captured initialization, placement realization/decisions, objective/Discovery progress, Character embodiment and starting equipment composition, and scoped weather overrides. CampaignSession owns existing lifecycle/readiness/presence policy. InstanceParticipation separates membership transitions and Agent capabilities. WorldRule and RuleExecution preserve the existing interpreter while actor commits and exploration observations use entity commands and observable state. Persistence, authentication, active-session locks, clocks, entropy, hashes, CAS and journals stay in adapters. Existing APIs and migration validation consume the owners.

There is no runtime World root. Encounter/Decision/Scene/rest/downtime remain existing value contracts where no production executor exists; B11's new combat mechanics are not part of migration. Runtime weather inherits captured defaults unless explicitly overridden or suppressed. Media playback is an explicit local GM control, not a scheduler or cross-participant broadcast. See [B10 verification](verification/b10-instance-session.md) for exact evidence and retained boundaries.
