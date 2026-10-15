# Age of Wonders domain model

This document is the AI-facing serialization guide for the domain model implemented in
`packages/common/src/types`. The TypeScript source remains authoritative. Generate JSON that
matches these structures exactly: omit optional properties when they are unknown, include every
required property, use the documented discriminant values, and never add explanatory prose around
a requested JSON payload.

Feat, Heritage and Discipline are permanently outside product scope. Their existing type descriptions
below document compatibility data only and do not authorize new authoring, acquisition or execution.

There is no magic in the authoritative game system. Every apparently supernatural event is a
physical phenomenon, biological capability, scientific process, or technology, even when people
in the setting misunderstand it. Folkloric terms may appear in names, aliases, beliefs, and quoted
descriptions, but never as authoritative mechanical causation.

## Generic domain foundation

`packages/domain` now provides the executable abstract `Entity` base and concrete
`CreatureDefinition`, `ItemDefinition`, `EffectDefinition`, `ConditionDefinition`, `CharacterTemplate`,
`Attribute`, `SkillDefinition`, `Modifier`, `LocationDefinition`, `WorldDefinition`,
`PlacementDefinition`, `Discovery`, `PlotDefinition`, `ProfessionDefinition`, `BackgroundDefinition`, `HeritageDefinition`, `DisciplineDefinition`, `FeatDefinition`, `ActionDefinition`, `TraitDefinition` and `CharacterDefinition` classes, plus runtime `Creature`, `Character`, `Item`,
`ActorEquipment`, `GrantedModifier` and `ActiveEffect` owners and the `CharacterCreation` policy.
B06 adds `LanguageDefinition`, `TableDefinition`, `CustomDefinition`, `ExtensionSchema`,
`RuleVariant`, `ContentPack` and `GameSystem` catalog owners, with `EntityGraph` and `CatalogCapture`
for isolated identity and reference validation.
It does not replace `packages/common/src/types` as the authoritative
persisted state contract or add persisted resources. Generate the existing resource JSON below,
not entity instances, Observables, commands, or runtime serialization envelopes.

- `Entity<State, Commands, Events, ValidationContext>` implements `IEntity` with immutable
  `state.data` and `state.metadata.validity`, plus a read-only RxJS `state$` Observable. A subscriber
  receives the current snapshot immediately and subsequent committed data or metadata changes.
- `command(name, {initiator, params, context})` processes a typed command; `command(name)` obtains
  an endpoint whose `.bind({map})` declares input mapping before execution. Event channels expose
  `.listen(handler)`. A shared `EntityScope` queues causal work and bounds cycles; bound event
  reactions across different scopes are rejected. B08 migrates the existing actor/equipment behavior;
  B10 adds Instance, Session, participation and scoped rule-execution ownership to existing runtime consumers.
- `serialize()` produces `{type, schemaVersion: 1, data}` for entity round trips. It excludes
  validation caches, observers and subscriptions. This envelope is **not** the database/API resource
  format. Concrete `deserialize()` factories reject malformed input and recompute validity.
- `CreatureDefinition.deserialize(payload, context, options?)` also accepts the existing authored
  Creature payload. `serializePayload()` retains its existing `definitions` resource shape and
  extensions. Structurally decoded drafts can be incomplete; their fields are not automatically
  treated as a valid `WorldCreatureDefinition`. Validation needs the authorized World record set
  and Model projection. Missing context is unresolved, not valid. Trusted draft baselines preserve
  unchanged legacy scalar issues as nonblocking; publication checks the full payload.
- Creature construction, canonical/Codex/reference/embodiment checks and authoring Model checks
  are owned by the class. Its first instance command is `rename`, emitting
  `creature-definition.events.renamed`. Runtime overlays now use the separate `Creature` owner
  described below. The API adapts entity-state issues to existing response contracts.
- `ItemDefinition.deserialize(payload, context, options?)` accepts the existing authored Item payload
  or its `{type: "item-definition", schemaVersion: 1, data}` entity envelope. `serializePayload()`
  returns the unchanged `definitions` resource JSON. The class owns canonical shape, optional square
  artwork, slot sets, weight/cost/notes, Condition grants and effective Model conformance validation.
  Unknown extensions and legacy payloads survive codec round trips. Missing reference/Model context
  is unresolved; trusted draft baselines tolerate only unchanged legacy scalar problems, while full
  publication rechecks them. Validity remains in `state.metadata.validity`, never in persisted JSON.
- Item's typed `rename` command emits `item-definition.events.renamed` after state publication.
  `decodeAuthoringSelection` decodes textual proposal family/category/quality/slot fields against
  the authorized vocabulary; the AI adapter translates decoding failures to its existing errors.
  Clearing the last equipment slot set is rejected when it would discard custom equippable members;
  the prior payload is retained. The common nonempty slot-set contract is unchanged.
  Application media authorization is still required. This class models authored World Items; runtime
  `ItemInstance` and container mechanics now use separate runtime owners. Legacy Item/Armor/Weapon
  generation paths remain separate compatibility work. The common `ItemDefinition` type remains the serialized contract,
  distinct from the executable class exported by `@aow/domain`.
- `EffectDefinition` owns the authored `world-effects` contract: numeric-property modifier checks,
  scoped property resolution, default/per-modifier durations and explicit override permission.
  `ConditionDefinition` owns `world-conditions` links and overrides, consulting Effect capabilities.
  Both expose immutable `state`/`state$`, typed `rename`/`renamed` behavior and codecs over the
  unchanged common World Codex types. Shared `CodexDefinition` handles common identity and
  authoring construction. These classes do not apply gameplay modifiers or replace runtime Effects.
- `CharacterTemplate` owns authored `world-character-templates` scalar, equipment, artwork and
  scoped Creature/Item/Condition reference validation. It exposes immutable `state`/`state$`,
  typed `rename`/`renamed` behavior and a `character-template` serialization envelope. Trusted
  `baseline` context enforces immutable Creature selection in Codex edits and full-draft saves.
  The class preserves metadata for reused artwork and removes transient URIs; the API authorizes
  media access. Existing optional/legacy payload behavior is retained. This authoring class is
  distinct from runtime `CharacterState`, the sparse `Character` runtime owner and `CharacterCreation`.
- `Attribute` represents an adopted Model vocabulary option as `{lineage, revision}`, using existing
  common Model contracts. It validates kind/label, revision lineage and vocabulary/parent relationships
  against the exact release context. `selectRevision`/`revisionSelected` selects a supplied revision
  in memory without editing an immutable revision. The compiler consumes its validity state;
  registry authorization, content hashes and collective dependency checks remain application policy.
  This bundle is an entity hydration shape, not a new database resource or replacement Attribute key.
- `SkillDefinition` owns optional Profession association shape/references, bounded Modifier grants,
  exact Model conformance and available default Attribute selection. Its `rename` command updates
  `identity.name`. Missing Model/reference scope remains unresolved; partial legacy Skill and
  referenced Profession payloads retain their previous validation behavior.
- `Modifier` represents an authored `ModifierGrantDefinition` recipe, distinct from `WorldEffectModifier`
  and active `GrantedModifier` state. It owns target/stacking/dice validation; typed `rename` updates
  the label and emits `renamed`. Compatibility collection adapters preserve uniqueness scope and
  Skill/Profession/Background diagnostics while consuming child validity state. Runtime acquisition
  and captured aggregation now belong to `GrantedModifier`. Existing common helpers remain for browser/runtime
  compatibility; no common-to-domain dependency is introduced.
- For these authoring classes, `deserializePayload(raw, context, options?)` is the persisted/API input
  boundary; `serializePayload()` returns that unchanged resource shape. Use `deserialize()` for
  deliberate entity-envelope round trips. Raw resource hydration does not reinterpret `type/schemaVersion/data`
  fields as an envelope. Never generate an envelope where resource JSON is requested.
- Effect/Condition validation uses the authorized World record set and reports unresolved context
  when omitted. Condition relationship checks preserve support for partial legacy Effect records
  with modifier declarations; they do not certify those Effects as valid. Publication validates
  every full record independently. Empty Condition Effect lists remain permitted. Runtime captured
  modifier grants and effect-derived conditions use the separate B08 owners below.

### Scoped graphs and catalog ownership (B06)

`EntityGraph` registers live entities by `{type, id}` inside one `EntityScope`. Duplicate graph
identities and cross-scope registrations are rejected. References may cycle; persistent ownership
may not. Owned children remain registered until removal or disposal; removing an owner disposes
its descendants. Serialized graphs contain identities, ownership and entity envelopes, without
subscriptions or cached validity. Hydration uses caller-supplied codecs and an isolated graph;
it never resolves references from another request, World or global registry.

Graph validity follows registered references and owned children. Missing targets are unresolved,
invalid dependencies propagate diagnostics, and committed changes or target removal revalidate
consumers. Explicit draft, publication and runtime validation modes remain distinct. Commands
publish committed state before events; rejected changes do not publish candidate state. These
facilities do not authorize automatic gameplay execution or replace Instance/Session orchestration.

`CatalogCapture` applies this graph to an exact authorized record set. `catalogOwner` selects a
concrete codec; each catalog concept owns its validation. Language, Table and Custom use the existing
`definitions` resource with `identity`, `kind` and `components`. ExtensionSchema, RuleVariant,
ContentPack and GameSystem retain their existing independent resource identities. Table entries,
dice expressions, variant patches, pack dependencies and embedded pack schemas are owned values,
not new persisted resources. An ExtensionSchema has an independent entity lifecycle when stored in
`extension-schemas`, and is a value when embedded in a ContentPack.

The internal archive-compatible `DomainService` writers hydrate these owners for structural checks.
Replacement uses the owner's `replace` command and retains the existing resource identity; external
persistence revision checks remain in the service. Incomplete historical records remain readable and
are not rewritten. New writes require locally valid supplied structure; missing external reference
context remains explicitly unresolved and nonblocking in draft mode so sequential archive imports
can retain forward references. World publication instead validates against its exact captured closure.
Raw codecs preserve private/imported fields; replacement payloads must retain fields that should
survive. No source defaults or cross-World lookups are inferred.

- Language script and rarity remain open text. Table entries require finite ordered minimum/maximum
  ranges, JSON values and finite optional weights. Fractional endpoints and negative finite weights
  are not normalized or rejected. Optional dice use the existing authored dice grammar; no table roll
  execution is added.
- Custom Definitions bind `components.definitionKind` and optional `schemaId` to a registered
  ExtensionSchema in the capture. Registration identity, key, applicable kinds and schema structure
  are checked. Multiple captured registrations sharing a key require an explicit `schemaId` at
  publication/runtime; key-only lookup never chooses one arbitrarily. This does **not** execute JSON
  Schema against the custom payload or certify payload
  conformance. The existing JSON payload and extension members remain intact.
- RuleVariant owns supported patch operation/target structure and requirement/conflict references.
  Optional patch values remain JSON data. ContentPack owns metadata, definition/variant references,
  dependency structure and embedded schemas. Required dependency namespaces must exist in the exact
  publication/adoption capture; optional missing dependencies are allowed. Drafts without capture
  context retain unresolved references. Authored semantic versions and dependency version
  ranges remain strings; no version-range solver or automatic dependency installation is added.
- GameSystem owns its embedded catalog and explicit enabled variants. `setEnabledVariants` rejects
  absent, duplicated, conflicting or unsatisfied required selections atomically. It never automatically
  enables defaults or prerequisites. Configuration and private fields remain unchanged by selection.

Common catalog/game types and the resource mapping table below remain unchanged. Feat, Heritage
and Discipline remain excluded; their retained compatibility data does not gain new catalog behavior.

### Runtime actors, equipment and creation (B08)

`Creature` owns the bounded `CampaignInstanceCreatureStateOverlay`; `Character extends Creature`
shares the same placement, captured-rule resource and active-effect operations. These sparse overlays
are deliberately distinct from the complete common `CreatureState`/`CharacterState` contracts.
Do not fabricate health, proficiency, pools or other required full-state fields from a Definition.
Current placement and movement consumers select the Character owner for Character provenance.
The overlay's optional `equipment` and `activeEffects` remain absent on historical captures until
explicitly supplied. Unknown/private fields survive owner transitions. `ActiveEffect` validates a
captured effect and advances only caller-supplied events or elapsed units: instantaneous effects
expire on advancement; until-event effects expire on an exact event match; measured durations
consume matching units without conversion. Permanent and special durations do not expire by
inference. Effective conditions combine intrinsic conditions with remaining effect contributions;
removing one effect does not erase intrinsic or other effects' conditions. Broader scheduling and
rule-payload execution remain Instance/Session integration work. `WorldGrantedCondition` remains an
authored reference; it is not automatically converted into a runtime effect. Movement rule projection
can observe the effective condition union without executing new modifier or trigger payloads.

`Item` owns runtime quantity/state and `ActorEquipment` owns an actor's Item graph, complete slot
assignments, containment and retrieval transitions. `QualitySlotCapacity` has required `quality`
and `slots` plus optional `rarity`. `containerSlotCapacity(container, quality, rarity?)` first uses
an exact authored quality-and-rarity row, then an explicitly authored row for that quality with
rarity omitted. Missing matches yield no capacity; there is no game-wide table or implicit fallback.
Capacity rows use nonnegative safe whole numbers; the current runtime rejects capacities above 1000.
Belts accept only
Items explicitly configured as consumables, tools or a `beltSlotCategory`; packs/bags accept any
Item. Each occupied container slot holds one Item instance, whose quantity remains its stack count.
All slots in a compatible equipment set are assigned atomically. Occupancy, ownership, capacity,
containment cycles and captured definitions are validated before committing changes.

For example, this Item component fragment explicitly gives standard quality two slots, or three
when its captured rarity is rare; it supplies no capacity for other qualities:

```json
{
  "slottedContainer": {
    "kind": "belt",
    "accepts": "belt-compatible-items",
    "capacityByQuality": [
      { "quality": "standard", "slots": 2 },
      { "quality": "standard", "rarity": "rare", "slots": 3 }
    ]
  }
}
```

Retrieval from an equipped Belt costs no bonus action; retrieval from a Pack/Bag or an unequipped
container consumes one explicitly available bonus action, including retrieval immediately followed
by equipping. Failed moves consume nothing. The allowance is a nonnegative integer in
`extensions["aow:rules"]["aow:bonusActions"]`; absence grants no allowance and no turn/reset behavior
is inferred. GM equipment operations use the Instance runtime revision for CAS and retain unrelated
actors, Items and private data. Names are display projections; opaque identifiers remain references.

`CharacterCreation` owns captured selection, required-field/artwork/roll allocation, review,
creation equipment and import projections. The API retains authorization, schema-capture reads,
cryptographic entropy, audit and transactional persistence. `Character.validateSheetBinding`
checks the approved Character/Instance identity. `Character.fromApprovedSheet` is a sparse overlay
integration port consumed by Instance activation. Approval consumption, sheet persistence, one Character embodiment and physical starting Items commit in the same transaction with runtime/capture CAS. Captured quality and approved slot assignments drive Item creation through ActorEquipment; assignment definition IDs become physical Item IDs. Reactivation preserves the existing embodiment, Items and acquired grants. The approved sheet is creation output, not a fabricated complete `CharacterState`.

The original type-only compatibility contracts remain exported; they do not
describe the new executable command/event surface:

- `Command<Name, Params, Initiator, Context, Metadata>` is an action payload with required
  `initiator`, `name`, `params`, and `context`, plus optional additional `metadata`.
  Names use `<scope>.commands.<action>`; commands are data, not entity methods.
- `DomainEvent<Name, Context, Initiator>` has required `initiator`, `name`, and `context`.
  Names use `<scope>.events.<event>`; each event specifies the mapped context required by handlers.
- `DomainEntity<State, Commands, Events, HandledEvents>` describes state, accepted command
  payload unions, emitted event payload unions, and handler subscriptions. Handled events default
  to emitted events but may include other entities' events. This is a type contract, not a runtime
  object or queue format. Use literal-name payload unions to preserve name/payload correlation.
- `EventHandlers<Events>` associates each event name with optional handler lists receiving that
  event's precise envelope. This legacy type does not implement the executable base's mapping
  or dispatch behavior.
- `StatePath<State>` and `StatePathValue<State, Path>` describe dotted paths and their value
  types over nested key/value state. Arrays and functions are leaves; optional or null intermediate
  objects produce possibly undefined values. These types do not implement runtime dereferencing.

### Catalog Character Definition and owned Traits

`CharacterDefinition` owns the common `CharacterDefinition` contract: resource `definitions`, kind
`character-template`, and `CharacterTemplateComponents`. It is distinct from the flat NPC
`CharacterTemplate` entity/resource `world-character-templates`; their codecs are not interchangeable.
The new entity uses a `character-definition` envelope, immutable observable state, rename/events,
required attribute-default diagnostics and optional component shape checks. Embedded Traits delegate
to TraitDefinition, including its owned Actions, with indexed diagnostics and scoped record context.
Temporary children are disposed; unknown/private fields round-trip without metadata injection.

Compatibility-only Codex validation projects `character-definition-codex-*` Condition-link diagnostics,
retaining sparse captures and existing optional Model conformance. Current World draft/publication
boundaries additionally consume supplied structural and nested diagnostics. Catalog authoring now
exposes supported component fields; this adds no runtime Character acquisition/materialization or rule evaluation. Never generate the entity envelope as a persisted resource payload.

### World authoring validation boundaries

Current World draft saves and dedicated authored mutations (including applied AI proposals)
consume owner diagnostics for supplied known structural fields. Incomplete/sparse draft values
remain repairable. An unchanged inherited top-level mechanics field can remain while another
field is edited; a new or changed malformed field is rejected. The baseline must have the same
record kind. These exemptions never authorize publication.

World draft validation/publication explicitly rechecks structural Action/Trait/Item and character-option
diagnostics against the exact captured draft and Model selection. Existing completeness and
Condition-link policy remains; generic unresolved expression/catalog references do not acquire
new all-fields-required rules. Legacy compatibility-only Codex calls retain their existing projections;
they are distinct from the current World publication gate. Internal legacy generators/import CLIs
remain migration adapters, not public World-authoring save endpoints.

### Item structured draft edits

`CreateWorldItemDraftRequest` accepts optional `traits` and `actions` lists and an optional
`vehicle` object. Omission preserves existing content, an empty list clears that collection,
and `vehicle: null` explicitly removes Vehicle data. Submitted nested definitions carry their
complete identity, components and extensions; editors must preserve unexposed fields when editing.
The Item save boundary checks entity-owned malformed-field and reference diagnostics for supplied
sections while permitting unresolved draft information. Unedited legacy sections remain repairable.
Compatibility-only projections remain unchanged; current World publication explicitly includes structural diagnostics.

### Item owned Trait and Action validation

Item validates supplied `components.traits` through TraitDefinition, which owns embedded Action
checks. Indexed `item-traits-*` diagnostics preserve child blocking/unresolved state and remain outside
existing `item-canonical-*`, `item-codex-*` and `item-model-*` API projections. Context forwarding uses
only mode and authorized record captures; Item identity, baseline and Model context do not become
child identity or governance. Temporary child and API Item instances are disposed. Raw content and
extensions remain preserved, including malformed repairable captures. A child exceeding its codec
limits is diagnosed without discarding the enclosing Item payload. Existing commands reject blocking
owned-child issues atomically. Item also delegates optional `components.actions` and
`components.vehicle.actions` to ActionDefinition. These diagnostics use `item-actions-*` and
`item-vehicle-actions-*` prefixes with indexed paths, keeping the API projections unchanged. Malformed
supplied lists/members and a non-object Vehicle container receive diagnostics without data loss.
Vehicle fields now receive complete structural checks for the current `VehicleDefinition` contract:
required vehicleType/size/armorClass/hitPoints/speeds, optional damageThreshold/crew/passengers,
cargoCapacity, components and actions. Missing required fields are unresolved; malformed supplied
fields are invalid. Type and size remain open strings; numeric fields accept finite fractional/negative
values because the common contract declares no additional bounds. Speed Distance and cargo Weight
units use their closed common vocabularies. Vehicle component references resolve against declared
Definitions in the captured World. Any Definition kind is permitted by `DefinitionId[]`; this is not
an Item-only constraint. Missing targets are nonblocking draft diagnostics and block publication.
This does not implement runtime realization or broader deep rule semantics. Catalog CharacterDefinition now owns Traits; runtime Character composition remains separate.

### Trait definition grants

`TraitComponents.grants` is an optional ordered array of `DefinitionId` strings.
Trait owns its structural validation: supplied non-arrays and non-string entries
are invalid. Omission, empty lists, empty strings, unknown references and duplicate
strings remain accepted and round-trip unchanged; authoring does not infer catalog
existence, uniqueness or runtime granting semantics. Item-owned Trait grant editing
uses named references from current World `definitions` records and preserves
unavailable imported references until explicitly replaced or removed. Definition
records retain the existing `identity.id` / `identity.name` resource mapping.
Compatibility `grantedConditions` entries (`{conditionId}`) are a separate field
with existing Condition-link validation, not an alternative grant representation.

### Executable Trait compatibility

`TraitDefinition` owns raw/envelope codecs, immutable observable state, typed rename/events, recursive
component diagnostics and compatibility Condition-reference checks. All fields in common
`TraitComponents` are optional; `{}` is valid, while absent components remain unresolved. Supplied
component fields receive recursive structural checks for known built-in fields. RuleModifier and TriggerDefinition are object
interfaces, not kind-tagged unions. Trait delegates embedded Action validity to ActionDefinition;
Feat and Item delegate embedded Trait validity to TraitDefinition. Indexed diagnostic paths and unresolved
status propagate into the owner state, using the authorized record capture without inheriting the
parent source identity. Temporary children are disposed; payloads do not gain entity metadata.
RuleModifier, Trigger, Choice, Predicate and Action-effect built-in structures are validated recursively.
Reference resolution beyond current Condition checks and runtime realization remain deferred. Catalog CharacterDefinition now owns Traits; runtime Character composition
remains pending; direct Item actions and Vehicle actions now delegate validity to ActionDefinition.

Compatibility-only World Codex reports project `trait-codex-*` diagnostics, preserving the previous
Condition-link gate and sparse legacy captures. Nested diagnostics use owner-specific prefixes outside
`trait-codex-*` and `feat-codex-*`; current World draft/publication gates consume their supplied structural
errors. No required Trait Model concept/conformance is introduced. Owned Trait editors reuse shared controls. Generic supplied-conformance
checks remain unchanged. Private fields/extensions survive codecs. Persisted resources remain raw
`definitions` payloads; `trait-definition` envelopes are not AI-generated resource payloads.

### Executable Action compatibility

`ActionDefinition` owns raw/envelope codecs, immutable observable state, typed rename/events, recursive
component diagnostics and existing compatibility Condition-reference checks. Missing required
activation/outcomes are unresolved. Activation uses the closed `ActivationType` vocabulary from
`rules.ts`. Outcomes have `id` and `effects`, plus optional `when`; they do not require a `kind`.
Discipline outcomes and scaling additional effects use this same container contract. Action owns
indexed field diagnostics for every built-in RuleEffect, including recursive branches, iteration,
repeat saves and embedded choices/modifiers. Required missing fields are unresolved; malformed
supplied fields are invalid. Shared class-owned grammar recursively validates NumericExpression,
ScalarExpression, DiceExpression/terms/modifiers, D20 tests (including opposed tests), Duration,
AreaShape and TargetDefinition (including filters). Numbers must be finite; no extra positivity,
integer, ordering, range or uniqueness constraints are inferred. Attribute keys and emitted event
keys use their common namespaced-string contracts. Custom and unknown imported tags remain opaque,
and private fields survive codecs. Target/reference binding, choice selection, numeric evaluation,
combat resolution and duration execution remain deferred; this is structural validation only.
Action owns optional Outcome `when` predicates through the same recursive grammar as prerequisites,
with `action-outcome-predicate-*` diagnostics at `components.outcomes[index].when` and its descendants.
Omitted predicates stay omitted; missing required atomic/group/comparison fields are unresolved,
malformed supplied fields are invalid, and unknown tagged imported predicates remain opaque.
These diagnostics propagate through direct Item, Trait-owned and Vehicle-owned Actions; they do
not evaluate conditions or introduce new reference-resolution semantics. Current World draft/publication
gates consume malformed supplied structure under the boundary above.
Action also owns indexed `action-cost-*` diagnostics for economy activation/count, resource
resource/amount/minimumRemaining, capacity band/sourceId, item-use item/amount, hit-die amount,
and movement Distance. Missing required cost fields are unresolved; malformed supplied fields
are invalid. Numeric fields require finite numbers without additional positivity/integer rules;
resource amounts use the complete recursive NumericExpression grammar.
Custom and imported cost kinds round-trip unchanged; resource/reference binding and payment execution
remain deferred. These checks follow `ActionCost`/`ResourceCost` in common `rules.ts` and do not
change their wire contracts or persisted resource mapping.
Action owns indexed `action-choice-*` structural diagnostics for `ChoiceDefinition` and nested
`ChoiceOption` values: string IDs/prompts/labels, finite minimum/maximum, optional catalog string,
duplicate boolean, visibility vocabulary, options list, and JSON option values (including null and
nested arrays/objects). Missing required values are unresolved; malformed supplied values are invalid.
Option prerequisites use the same recursive Action-owned prerequisite checks described below. No additional
uniqueness, nonempty-string, integer, positivity, minimum/maximum ordering, catalog-resolution or
selection semantics are imposed. Common choice contracts and persisted mappings remain unchanged.
Action owns indexed `action-prerequisite-*` structural diagnostics for its atomic
prerequisites and nested Choice Option prerequisites, including descendants of `all`, `any`, and `not`: always/never; has-condition, has-tag, is-proficient, is-attuned,
is-sustaining-operation, damage-type, within-distance, visible, has-cover, and relation.
Binding and open vocabulary fields require strings (including empty strings); optional attuned
item remains optional. Distance uses finite values and common units. Missing required fields are
unresolved; malformed supplied values are invalid. `all`/`any` require a `predicates` array
(empty arrays are valid); `not` requires one tagged `predicate`. Diagnostics follow recursive
`.predicates[index]`/`.predicate` paths under the existing bounded, acyclic JSON contract.
Comparison prerequisites validate the closed `eq`/`ne`/`lt`/`lte`/`gt`/`gte`/`includes`/`matches`
operator and tagged left/right scalar expressions. Constants require finite numeric values;
literals accept every JSON value, including null and nested objects/arrays. Numeric `path`
requires a string path and optional finite fallback; `event-value` and `collection-count`
require a string path. Empty strings remain valid. Missing operands, tags, operators or required
expression fields are unresolved; malformed supplied values are invalid, with exact recursive
operand field paths. Unknown imported scalar tags preserve their internals without deeper
validation. No operator/operand compatibility, expression evaluation, or reference resolution
is imposed. These checks follow common `ScalarExpression`/`NumericExpression` as well as `Predicate`.
Has-definition prerequisites require string `subject` and `definitionId` fields, including empty
strings. Missing fields are unresolved; malformed supplied fields are invalid at their exact
recursive paths. Definition IDs are open references: unknown/imported IDs and private data
round-trip without catalog existence checks or inferred binding semantics.
Custom and imported predicate internals remain opaque. Option diagnostics carry full
`components.choices[index].options[index].prerequisites[index]` paths; an omitted Option
prerequisites list remains valid. Trait owns the same recursive prerequisite grammar through
the shared internal rule-entity base, with `trait-prerequisite-invalid` and
`trait-prerequisite-unresolved` codes and `components.prerequisites[index]` paths.
Malformed supplied values are rejected in Item Trait writes; omitted required values
remain repairable draft diagnostics. Trait also owns indexed `trait-choice-*` diagnostics for the same Choice/Option structure,
using the shared rule-entity base. Trait Option prerequisites report `trait-prerequisite-*`
diagnostics beneath `components.choices[index].options[index].prerequisites[index]`.
Omitted Choice/Option fields remain repairable draft diagnostics; supplied malformed values
are rejected in Item Trait writes. Catalog resolution and Choice selection semantics remain deferred.
No binding resolution or predicate evaluation is added. These checks follow common `Predicate`
in `expressions.ts`; wire contracts and persisted resource mappings remain unchanged.
Trait also owns indexed `trait-modifier-invalid`/`trait-modifier-unresolved` diagnostics
under `components.modifiers[index]` for embedded `RuleModifier` value objects (distinct
from catalog Modifier definitions). Required `id`/`target` are strings; `operation` is
one of the common `ModifierOperation` values. Optional `priority` is finite,
`stacking` follows the common closed union, and `sourceLabel` is a string. Empty
strings and negative/fractional priorities are allowed; value omission is valid for
every operation. Supplied scalar values share the comparison expression checks
above, including all JSON literal values; unknown imported tagged expressions keep
their internals opaque. Optional predicates use the shared recursive Predicate checks above, with exact paths
under `components.modifiers[index].predicate` and Trait modifier diagnostic codes.
Omission is valid; custom/imported predicate and unknown expression internals stay opaque. Missing required fields remain
unresolved; malformed supplied fields are invalid. No stacking execution, target
resolution, operation/value compatibility or uniqueness policy is inferred. These
checks follow `RuleModifier` in `rules.ts` and `ScalarExpression` in `expressions.ts`;
common types and resource mappings are unchanged.
Trait owns indexed `trait-trigger-invalid`/`trait-trigger-unresolved` diagnostics under
`components.triggers[index]`. Events follow the closed `EventType` union in `rules.ts`;
optional `customEvent` follows `NamespacedKey` (a colon-containing string), `timing` is
before/replace/after, `optional` is boolean, and `priority` is finite (including negative
and fractional values). `customEvent` stays optional even for the custom event; no
additional binding policy is inferred. Required omitted event/effects fields are
repairable unresolved drafts; supplied malformed values are invalid. Effects must be
a list of tagged objects. All built-in effects share the recursive Action
effect grammar through the abstract rule-entity base, with `trait-effect-*` codes
beneath each trigger's effects list. Unknown effect/expression internals and
private fields are preserved. Optional trigger predicates use the shared
recursive Predicate grammar at `components.triggers[index].predicate`, with
`trait-trigger-invalid`/`trait-trigger-unresolved` diagnostics and no synthetic root
array index. Omitted predicates are valid; missing required nested fields are unresolved,
while malformed supplied fields are invalid. Custom/imported predicates and unknown
expression internals remain opaque. Action and Trait share UsageLimit grammar through
the abstract rule-entity base. Action owns `action-limit-invalid` and
`action-limit-unresolved` diagnostics at `components.limit`, including direct, Trait-owned
and Vehicle-owned Actions. Optional trigger usage limits are validated at
`components.triggers[index].limit` with the same Trait trigger codes. `UsageLimit` has
six supported kinds: `uses`, `recharge`, `once-per-turn`, `once-per-round`,
`once-per-encounter`, and `resource`. Uses require a tagged `NumericExpression`
maximum: constant values and path fallbacks must be finite numbers, and paths must
be strings. Known scalar-only expression kinds (including `literal`, even numeric
literals) are invalid here; all known NumericExpression variants are checked recursively,
while unknown imported expression internals remain opaque. Optional `resetsOn` accepts `short`, `long`, `homebrew:*`
or an `EventType`. Recharge requires a finite numeric die and an array of finite
numeric success values; resource requires a string. No positivity, integer, range,
uniqueness, nonempty-string or resource-resolution policy is inferred. Omitted
limits are valid; missing required fields are unresolved, supplied malformed values
invalid. Unknown imported limit kinds and private fields are preserved. Runtime
usage counting, reset and recharge evaluation remain deferred. This follows
`TriggerDefinition`, `RuleEffect`, `UsageLimit` and `NumericExpression` (not the
broader `ScalarExpression`);
common types and persisted resource mappings are unchanged.
Item structured saves reject these invalid diagnostics through owned Trait and Action validation;
incomplete draft fields remain repairable. Runtime execution remains deferred.

Compatibility-only World Codex reports project `action-codex-*` Condition links. Current World
draft/publication gates also consume supplied structural diagnostics as described above; sparse drafts remain allowed. No required
Action Model concept/conformance is introduced. Structured Item-owned Action editors use these
diagnostics at save time. Generic checks of supplied conformance remain unchanged. Private fields/extensions survive codecs. Persisted resources remain
raw `definitions` payloads; `action-definition` envelopes are not AI-generated resource payloads.

### Executable Feat compatibility

`FeatDefinition` owns raw/envelope codecs, immutable observable state, typed rename/events, recursive
component diagnostics and existing compatibility Condition-reference checks. Required traits missing
from a capture are unresolved; supplied malformed component shapes are invalid. Category is an open
string and traits may be empty, matching `character.ts`. Embedded Trait validity now propagates into
Feat state through TraitDefinition, including its embedded Action diagnostics. Choice/Predicate
structure uses the shared rule grammar; broader reference resolution and runtime acquisition/repeatability
remain outside this slice.

Compatibility-only World Codex reports project `feat-codex-*` Condition links. Current World
draft/publication gates additionally consume structural diagnostics; missing draft data remains unresolved.
No required Feat Model concept or conformance is introduced; generic supplied conformance checks
remain unchanged. Extensions and private fields survive serialization. No dedicated browser editor
is added. Draft saves consume new structural diagnostics while preserving unchanged inherited fields;
publication rechecks structural and existing Condition-link diagnostics. Persisted resources remain raw `definitions` payloads, not `feat-definition` envelopes.

### Executable Discipline compatibility

`DisciplineDefinition` owns raw/envelope serialization, immutable observable state, typed rename/events,
structural diagnostics and compatibility granted-Condition checks. Missing required component data is
unresolved. Compatibility-only World Codex reports project `discipline-codex-*` Condition links;
current World draft/publication gates additionally consume supplied structural diagnostics. No required Discipline Model concept or conformance is added. Existing generic validation
of supplied conformance remains in force.

The common `disciplines.ts` contract remains authoritative: operating basis and understanding are open
strings, band is a number, and arrays may be empty. Scientific metadata, extensions and private data
survive serialization. Nested Action cost, target, Outcome, expression and scaling structures are
validated recursively. Reference resolution and runtime access/capacity/activation remain deferred. There is no dedicated browser
editor in this slice. Legacy spell conversion and dual-kind catalog reads remain unchanged. Persisted
resources remain raw `definitions` payloads; the `discipline-definition` envelope is not an AI-generated
resource payload.

### Executable Heritage compatibility and authoring

`HeritageDefinition` owns raw/envelope codecs, immutable observable state, typed rename/events,
supplied paired-modifier structure and existing compatibility Condition-reference validation. Missing
required component information is unresolved. `heritage-components-*` and `heritage-description-unresolved` metadata describe structural
state; compatibility-only reports project `heritage-codex-*` Condition links. Current World draft/publication
gates also consume structural modifier/predicate diagnostics; broader reference resolution remains deferred. The `heritage-definition` envelope is never a generated resource payload.

Heritage does not acquire required Model conformance or a required `aow:heritage` concept in this
slice. Existing generic validation of supplied conformance remains unchanged. The construction helper
preserves richer pairs and modifiers when editing foundation text and retains omitted edits/private
extensions. Heritage stays optional historical content, not a Character creation gate, and the current
browser still has no dedicated Heritage editor. Common fields/resources are unchanged; runtime
selection/adoption remains separate work, including the maximum-one compatibility API versus the
common maximum-three Heritage selection contract.

### Executable Background authoring

`BackgroundDefinition` owns existing authored modifier-grant checks, compatibility granted-Condition
references and exact Model release/concept conformance (`aow:background`). It provides immutable
observable state, raw payload codecs, a `background-definition` round-trip envelope and a typed
`rename` command/event. Missing Model/reference context is unresolved; local grant feedback alone
is not publication readiness. Canonical/Codex/draft-save/Model adapters read class validity and dispose
short-lived instances. The browser Background editor uses its class for grant validation and explicit
grant edits; component construction preserves all prior values, including malformed legacy input.

Common `BackgroundComponents` fields and the `definitions` resource remain unchanged. Granted
Conditions retain their existing compatibility-field treatment rather than becoming a newly declared
common field. The class preserves optional attributes, skills/tools, language choices, equipment,
feat/features, characteristics and choices; supplied known field and nested Choice shapes are recursively validated.
Selected Background and explicit starting Profession/Skill modifier grants are acquired on Character
activation through `GrantedModifier`; broader runtime selection remains separate work. Generate raw common JSON,
not entity envelopes, and retain extension/private data.

### Executable Profession authoring

`ProfessionDefinition` owns existing authored Profession tier/grant validation, granted Condition
references, exact Model release/concept conformance and Profession Rank selections. It composes
Modifier validation, exposes validity through state and supports observable `state$`, raw payload
serialization, a `profession-definition` round-trip envelope, and a typed `rename` command/event.
Missing Model/reference context is unresolved; local grant checks do not prove publication readiness.

Canonical resource, Codex, draft-save and Model-binding adapters delegate to the class. Browser
starting-rank/default construction and level grant edits use its detached authoring helpers; browser
grant feedback reads entity state. Sparse legacy components retain their previous validation behavior.
Advancement-window, expression, Choice and Action progression structures are validated recursively.
Explicit creation-tier modifier acquisition is implemented; later awards, spending, action use and
broader reference resolution remain separate work. Common legacy modifier helpers remain for
unmigrated consumers; common Profession payloads, resource names and generation JSON are unchanged.

### Executable Placement, Discovery and Plot authoring

`PlacementDefinition` uses explicit `scope: "world" | "campaign"` context. It owns local
source/presentation/coordinate validation and scoped captured-reference checks. Campaign independent
placements and World decorations retain their existing common discriminants and resource payloads.
Scope-specific entity envelopes (`placement-definition:world` / `placement-definition:campaign`)
are round-trip formats, never generated resource JSON.

`Discovery` owns the composed Truth/Belief/Rumor facets, claim identities and Plot-scoped references.
Legacy claims remain readable and serialize losslessly. Its `replaceFacets` command writes canonical
facets and removes legacy claims; it does not guess how to convert arbitrary old claims into one
Truth. Mixed records cannot hide malformed legacy claims behind valid facets, because current legacy
runtime readers give claims precedence. Malformed interpreted legacy reference fields also fail
validation instead of causing exceptions. Knowledge/reveal state remains Instance progress.

`PlotDefinition` owns local members, nested Discovery validation, Campaign ownership, captured
Location/Placement reciprocity and graph validation against the supplied Plot set. Missing reference
scope is unresolved. Shared graph issues are exposed in each scoped Plot's validity and deduplicated
only in the aggregate API report. Replacing Plot content preserves identity/ownership and validates
candidate edges instead of stale captured self state. All three classes expose immutable `state$`,
class-owned raw codecs, typed commands/events, and validity through state metadata. Shape-only
validation is an explicit intermediate decode mode, not full publication readiness.

Campaign authoring/proposal/publication adapters consume these classes. Campaign membership, Model
release selection, preparation, rich-text safety, authorization and persistence remain aggregate or
application responsibilities. Common hierarchy/Campaign validators and browser semantic helpers
remain compatibility consumers pending later cutover. No common payload fields or resource mappings
change in this slice; generate the raw contracts below and preserve extensions/private fields.

### Browser authoring owner projections

Browser World membership edits delegate `WorldDefinition.withMember` / `withoutMember`, and
Location parent choices use the owner's hierarchy gate. `LocationDefinition.authoringMap` owns
the existing image/terrain selection behavior; scenic grids remain preserved but inactive.
`Discovery.authoringClaims`, `withAuthoredClaims` and `authoringClaimReferences` provide the
canonical editor facet projection, explicit facet replacement and Plot-scoped reference checks.
This deliberately retains the editor's canonical-first behavior; historical `Discovery.claims()`
precedence remains unchanged. Location's flat DiscoveryClaim[] is a different contract.
`PlotDefinition` provides detached authoring projections for descendant/parent candidates,
reciprocal Location context associations, removal and parent-change guards. Browser code owns
labels, prompts and HTTP orchestration, while these projections own the existing policy. They do
not mutate captured runtime data or introduce new persisted fields, relationships or resource names.

### Executable World authoring

The domain `WorldDefinition` class owns authored revision-content validation, collection membership,
capture requirements, root/hierarchy consistency and World Placement references. Its name does not
replace the common `WorldDefinition` interface below, which describes stable lineage metadata.
`serializePayload()` returns existing revision-content JSON; authorized captured records remain
validation context and must be persisted alongside content by the repository. No resource mapping,
identifier, or common persisted type changes in this slice.

The class exposes aggregate validity through `state.metadata.validity` and observable `state$`.
Child diagnostics must be bound to the exact content and capture checked; missing/stale evidence is
unresolved. The API still orchestrates child, rules, terrain and Placement shape checks, then projects
World state. `replaceContent` emits `contentReplaced` after committed state changes. Its entity envelope
is not a World snapshot or generation format. Lineage lifecycle and runtime World remain separate work.

### Location Definition

`LocationDefinition` owns authored `WorldLocationDefinition` JSON, canonical validation, construction,
private fields, scoped parent/Condition references, artwork preservation, map changes and scene grid
policy. It uses the shared immutable `state`/`state$`, typed rename and presentation commands/events, and codecs. The
`location-definition` envelope is for entity round trips only; persisted resources use raw payloads.
World ownership is supplied through authorized context; no top-level `worldId` is added. Root
membership and collective hierarchy cycle checks remain application orchestration.

Every valid Location needs a real map: a complete image, or a valid isometric terrain manifest.
Blank terrain with explicit dimensions and zero chunks is valid. Legacy image-backed records without
an explicit map selector remain readable and acquire `{kind:"image"}` when authored again. Mapless
records remain loadable for repair, including newly initialized World-root drafts, but their state
is invalid and publication is blocked. Text AI proposals may omit the map only as incomplete previews;
dedicated Location create/update enforces the map before persistence. Do not invent image assets.

`mapScene.grid?: {kind:"square"|"hex", cellSizePixels:number}` uses positive image-pixel dimensions.
The mutation field `mapSceneGrid` replaces it, `null` clears it, and omission preserves it. Scenic
maps retain stored configuration but do not apply/render a grid. Image overlays are also inactive
for terrain, which retains its distinct physical cell dimensions. The experimental type-only
Location contract is replaced; its adjacency commands/events are no longer exported.

Location relationships are hierarchy-only. `connectedLocationIds` and `adjacentLocationIds` are
not new authoring fields. Old payloads can retain these for lossless reads; authored replacement
removes them and retired references do not block deleting unrelated Locations. Legacy
`location-connections` records remain readable but generic writes are disabled. Automated
`begin-travel`/`advance-travel` commands have retired; travel is roleplayed at the table. Parent
placement and same-map movement remain distinct.

B09 adds `Map`, `Wall`, `Door`, and `Window` owners. Normalized 2D legacy wall/door
payloads and cell-based 3D terrain openings remain explicit separate formats; an absent
legacy wall kind is interpreted as wall without rewriting the captured payload. Image
walls retain their authored blocking channels; open doors block none. Terrain doors
accept open/closed/locked, windows open/closed, and existing geometric kernels determine
visibility and collision. Map commands apply complete validated terrain batches and retain
undo patches, opening identities and private imported fields. Owned element views route
changes through their Map, update after parent commits and dispose with their owner.
Geometry, rendering, chunk authorization and immutable hash/capture checks remain adapters.

`MapExploration` owns the existing strict `TerrainExplorationSnapshot` codec and observe
transition, separately from authored Maps. It retains Instance/snapshot/location/observer
scope, revision conflict checks, remembered material revisions and explicitly observed
absence. Unknown/private fields are rejected at this player-memory boundary. The existing
server-authorized projection consumes this policy; no new participant endpoint or automatic
visibility sharing is added. The exploration store now awaits the MapExploration observe command, preserves scope/hash/CAS and returns only the authorized projection.

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
- `AttributeCollection<T>` is a flat record keyed by the applicable captured Model Schema's stable,
  namespaced Attribute option keys. The editable core seeds `aow:attribute-might`,
  `aow:attribute-intellect`, `aow:attribute-wisdom`, `aow:attribute-hardiness`,
  `aow:attribute-charisma`, `aow:attribute-agility`, `aow:attribute-fortune`, and
  `aow:attribute-sanity`, but these are not an exhaustive set. The legacy raw key `will` migrates
  explicitly to `aow:attribute-wisdom`; it must never be silently reinterpreted on an unmigrated
  record. `AttributeScore` remains an integer from 0 through 100, with a neutral default of 50.

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
type WorldPlacementDefinitionId = string;
type CampaignPlacementDefinitionId = string;
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
stable `worldPlacementDefinitionIds`, legacy schema selections, and required
`modelSchemaReleaseIds` for one World revision. World Placement records use the exact snapshot
resource name `world-placements`. Those IDs
select exact immutable Model Schema Releases; a World never resolves a mutable registry head or
embeds editable registry records. Model vocabulary elements and Schema Concepts/Fields/Relationships
have dedicated list/Add/Edit contexts in the existing Models & taxonomies destination. Revisions
publish immutable releases before exact adoption; failed adoption can retry the same published
release. Archive remains an explicit registry lifecycle operation.
`CampaignDefinitionRevision` owns one complete
`CampaignDefinitionContent` payload—including its format version, authored premise, introduction,
Plot and placement references, preparation defaults, extensions, and exact Campaign-scoped
`modelSchemaReleaseIds`—and captures the replicated World snapshot against which it was authored.
Campaign releases layer over the exact releases in that World capture; neither revision resolves a
mutable upstream authoring head.

Manual World authoring uses canonical source records declared in
`packages/common/src/types/world-authoring.ts`. `WorldLocationDefinition` is the immutable source
Location captured by a World revision; it has server-owned versioned identity, human name and
description, open Location kind, containment placement, a human profile with discovery tags, and
a required map and optional scene notes/orientation/grid. `description` is player-facing; optional `gmDescription`
is private GM authoring text. `discoveries` is an optional array of the existing `DiscoveryClaim`
contract (`id`, `kind: "truth" | "rumor" | "belief"`, `statement`, optional provenance and claim
relationships). These authored discoveries are not automatically revealed to participants.
Location discovery and Creature/Item placement collections have dedicated list/Add/Edit
authoring contexts. Location claims remain this flat `DiscoveryClaim[]` contract; they do not
adopt the separate Plot Discovery facet schema. Claim identity, provenance and private extensions
are preserved. Removing a placement removes its owned placement record and membership, never
its referenced Creature/Item definition.
Optional `image: LocationImage` references the attached media asset with alternative text, dimensions,
MIME type, and scenic/overhead/side-on orientation; signed download URLs are resolved at read time.
When re-saving existing Location artwork that lacks orientation, authoring repairs it from the
existing image or map-scene orientation, falling back to `scenic`. Newly attached images must
still supply their orientation.
Optional `weather` contains an open, nonempty `condition`, optional finite
`temperatureCelsius`, and optional `wind: { speedKph, directionDegrees? }`. Wind speed
is nonnegative; direction is at least 0 and less than 360. These are authored World
defaults; they do not automatically change mechanical rules or schedule weather.
Optional `audiovisualEffects` contains up to 100 named cues with unique `id`, `name`,
`kind: "audio" | "visual"`, authorized `assetId`, `enabled`, and `loop`. Optional
`volume` is audio-only and `opacity` visual-only; both range from 0 to 1. Audio assets
must have audio MIME types; visual assets may be images or video. Do not fabricate
assets or persist signed URLs. These presentation cues are distinct from mechanical
Conditions/Effects. The GM Session table provides manual local audio/video controls and image cues; enabled cues use authorized media resolution, with no persisted signed URLs or automatic cross-participant playback.
Authoring requests preserve either field on omission and remove it on `null`; `[]`
explicitly clears the cue list. Known fields are replaced while unknown imported keys
survive updates to the same weather/wind or cue identity. Never expose cue/asset IDs
as GM-facing labels. Unchanged malformed legacy configuration may be preserved during
unrelated draft edits via a trusted baseline; new/changed values and publication remain
strictly validated. Explicit removal allows repair without exposing a raw JSON editor.
For example, after selecting a real authorized audio asset:
`{weather:{condition:"Rain",temperatureCelsius:8,wind:{speedKph:12}},
audiovisualEffects:[{id:"rainfall",name:"Rainfall",kind:"audio",assetId:"<selected-asset>",enabled:true,loop:true,volume:0.35}]}`.
The Location remains stored as a `locations` snapshot record, with no separate persisted Map resource.
`WorldLocationDefinition.map` selects `{ kind: "image" }` or an
`IsometricTerrainManifest` with `kind: "isometric"`. Legacy image-backed records remain readable;
`LocationImage.orientation` and the older `LocationState` contract are unchanged. Source images
remain independent illustrations. Location create/update may select a map whose terrain chunks already belong to the authorized
draft. New uploaded chunks are attached through the dedicated Location Map endpoint with capture
and hash checks; AI image generation does not invent terrain manifests.
The dedicated Location mutation accepts GM description, discoveries, and image metadata and verifies
new image references against media accessible to the GM. Location sections must use this mutation;
the generic draft save intentionally rejects changes to protected Location records.
Legacy `extensions["aow:gm-secrets"].secrets` remains preserved and supplies GM notes until canonical
`gmDescription` is authored. Generated Map proposals create owned World media and return an image
preview; they do not attach it until the GM explicitly saves the Map. Unedited map, scene, weather, effect, and extension data
is retained when the exposed fields are revised. It is not mutable Campaign Instance state.
`WorldCreatureDefinition` is the reusable captured source for independent runtime Creature
embodiments; it uses the common `Definition` identity/components envelope, exact Model conformance,
model-governed Attribute values and Equipment Slots, optional art direction and captured image
references, movement modes, references to World Skill and Profession Definitions, progressive
mechanics notes, and an explicit Instance embodiment policy.
`WorldItemDefinition` is the reusable captured source for Item Instances and placements. It composes
the canonical `ItemDefinition` with its artwork optional during World authoring: its identity, category,
construction quality, Equipment Slot compatibility, and attached catalog image use the existing
`Definition`/`ItemComponents`/`ItemImage` contracts. World-specific governance adds exact Model
conformance and records the selected Item family in `modelValues["aow:item-family"]`. These source
definitions are distinct from mutable `CreatureState` and `ItemInstance` runtime aggregates. Item
slot compatibility is stored as alternative complete slot sets, so a single alternative may require
multiple slots; editing the exposed fields preserves all other canonical Item mechanics.
When an ordinary Item edit canonicalizes a recovered noncanonical Item, the exact prior payload and
captured source revision are retained as
`extensions["aow:legacy-item"] = { resourceType: "definitions", sourceRevision?, payload }`, so
creative legacy data remains available for audit and later refinement. `payload` is the unmodified
pre-edit value; `sourceRevision` is omitted only when the captured record did not have one.

New manual source records are created or updated through nested World draft Location, Creature,
and Item commands. Each command requires the exact draft storage revision; the server owns record
identity, preserves stable identity on update, binds Creature and Item records to the effective
Model release/concept, transforms the complete draft, and advances it with optimistic concurrency.
Initial World creation accepts only World metadata and always creates the canonical server-owned
root draft; callers cannot inject draft content or records into that operation. The browser never
supplies a record ID or Model conformance. Legacy snapshot records remain
readable for migration and history. New manual commands emit canonical records, and editing a
legacy Creature or Item through those commands upgrades that record to the canonical envelope;
arbitrary bounded JSON is never accepted as a new Location, Creature, or Item.

AI-assisted World authoring is proposal-only. Location, Creature, and Item proposal commands are
nested beneath an owned working World draft and require its exact storage revision. The server
derives the draft context, parent Location, effective Model releases, concepts, Attribute keys,
Equipment Slot keys, and Item family keys; generated output cannot supply identity or conformance.
The proposal is normalized into the corresponding manual command fields and validated against an
in-memory candidate, but it does not mutate the draft. The GM edits and explicitly applies it via
the existing manual command. Item proposals contain textual fields only: a real square catalog
image and accessible description must be supplied by the GM before apply, and proposal creation
does not render, upload, reserve, or claim a media asset. Item Equipment Slot compatibility uses
alternative complete slot sets. Creature Skill and Profession reference fields remain absent from
AI output so the GM chooses named definitions in the editor instead of accepting invented opaque IDs.
Provider requests use the small, kind-specific `world-draft-proposal.md` contract plus bounded
World summaries; they never append this complete architecture guide.

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
names both its Campaign Instance and the Instance snapshot against which its records conform. Its
monotonic `revision` is the compare-and-swap token for runtime writes. Its canonical
`CampaignInstanceRuntimeState` owns Instance preparation, exact root/subplot progress overlays,
placement-realization decisions, independent Creature embodiments, Item instances, and an optional
campaign time string and optional `locationPresentationOverrides`. Each override names a captured `locationId`; omitted weather inherits its captured default, explicit `null` suppresses it, and removing the override restores inheritance. Weather uses the authored units and validation. Migration maps only the modeled Location reference; unknown/private data survives. Session records—not runtime JSON—are authoritative for active Session state.

Captured placement identity is provenance, never mutable identity. A
`CampaignInstancePlacementRealization` records a `planned`, `deferred`, `realized`, `replaced`, or
`removed` decision and may refer to a Campaign placement, captured World placement, or explicit
Instance-created content. Only realized/replaced decisions name an Instance-owned runtime Creature
or Item. `CampaignInstanceCreatureEmbodiment` gives every realized Creature a new Instance-scoped
runtime identity and exact source provenance. Its `creature` member is a bounded, server-owned
runtime overlay (`identity`, `entityId`, human name, optional captured `definitionId`, optional
current Location, optional `terrainPosition`, `equipment`, `activeEffects`, and namespaced extensions),
not a partial `CreatureState` produced by copying a
Creature Definition. The captured Definition remains the immutable source of descriptive and rules
content. Runtime Item creation likewise persists only defined `ItemInstance` fields and never
spreads an authored Item Definition into mutable state. Instance-created Creature and Item
replacement variants are intentionally absent from the public command in this slice; callers may
select an existing runtime entity or realize captured content, but cannot submit arbitrary entity
JSON. Two Campaign
Instances that use the same named or unique captured Creature therefore own two independent
embodiments.
Campaign-placement embodiments that name a captured Creature retain the same resolved embodiment
policy and count against the same per-source Instance maximum as direct World-placement
embodiments; Campaign provenance cannot bypass `one-per-instance` cardinality.

Instance migration rewrites only reference paths explicitly modeled by
`CampaignInstanceRuntimeState`: preparation, canvas and presentation-override Locations, Plot identities, placement source
and current Locations, captured Campaign/World placement identities, Creature source and overlay
Definition/Location identities, Item Definition/Location identities, and schema-declared Model or
extension references. Nested Objective, discovery claim, Plot Location context, and actor/Item
intent identities are scoped to their owning Plot and Location context; migration compares and maps
them with bounded, opaque hashed scope keys so long component IDs remain valid and equal local IDs
in different Plots cannot collide. Candidates and submitted mappings must remain within the mapped
parent Plot and Location context. The migration boundary permits mappings up to the same explicit
50,000-record limit enforced on the captured-plus-nested migration expansion. Runtime
actor, Item, Character, and placement-realization identities remain Instance-local and are validated
against the runtime graph rather than rewritten. Arbitrary prose and ungoverned
extension strings are never treated as identities. An extension schema may mark an exact string
node (or array item/property node) with `x-aow-reference-resource` to make that node a migratable,
target-validated captured resource reference. Structures deferred from this slice—full Character
state, Session scene/event state, combat, and Rules execution state—are not present in canonical
Instance runtime JSON and therefore are not claimed as migration coverage.

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
Editing an element—including changing its label, help, group, display order, value metadata, or
dependencies—publishes a new immutable element revision. Archival never rewrites an old release:
the lineage is marked archived and omitted from a direct successor. A dependency-only GM release
is valid when its last local element is archived because its exact dependency closure remains
explicit.

The GM-facing World editor exposes these same contracts through progressively disclosed schema
controls. It can author nested Concepts; Fields with owners, storage keys, typed values, literal
defaults, list uniqueness, and cardinality; and Relationships with source/target Concepts,
cardinality, inverse labels, and reference policy. It preserves supported payload and presentation
properties that the focused form does not change, publishes a direct successor, and adopts that
exact release into the World draft. It never mutates system or plugin registries.

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

Creature draft create, edit, and legacy-upgrade requests accept optional `images` replacements
for `portrait`, `overheadToken`, and `paperDollToken`. Omitted views retain their existing images;
replacements are stored in `components.art.images`. Older upgraded Creatures may retain artwork
only in `extensions["aow:legacy-creature"].payload.images`; rendering and subsequent saves recover
missing views from that preserved source while keeping newer canonical images. Newly attached assets must belong to the
requesting GM and World. The editor can generate individual artwork previews for Creatures and
square inventory images for Items, including new records. Applying a preview stages its reference;
only saving the editor changes the World draft. Generation is owner-scoped, revision-checked,
idempotent, rate-limited, and audited. Item images continue to use the existing `image` field.

`ProfessionExpertise` is a `NamespacedKey`, not a fixed rank union. A Profession Definition's
`expertiseOrder`, expertise-level `tier`, acquisition `startingExpertise`, and Character runtime
expertise values must use Profession Rank option keys from the exact Model Schema releases captured
by their governing World or Campaign snapshot. Novice, Apprentice, Journeyman, Master, and Grand
Master are the editable core seed, not an exhaustive list. A newly authored Profession starts at
the first selected available rank, while later ranks and full progression remain part of the rich
Profession Definition.

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
- `POST /model-registries/:id/releases` is the bounded release-publication workflow used by
  contextual World editors. It creates elements, publishes revisions (including presentation
  reorganization), archives lineages by omission, carries forward unchanged exact selections,
  locks the installed core release dependency, and validates the complete effective closure. Every
  non-initial successor also validates and persists its direct-lineage, all-or-nothing
  `ModelMigrationPlan` in the same transaction. The former `/releases/extend` command has been
  removed.
- `GET /model-registries/:id` includes current lineage state, complete immutable element revision
  history, and release history. `GET /model-registries/:id/migrations` returns readable migration
  history. `POST /model-registries/:id/migrations` may record a validated plan for an existing exact
  direct successor pair; only the owning GM may author one.
- `GET /worlds/:worldId/model-adoptions` reads the explicitly selected release roots from that GM's
  mutable World draft, compiles accessible exact releases and their locked dependencies, rejects
  overlapping stable keys, filters by global/World applicability, and returns human-readable
  Attribute, Equipment Slot, and general element projections. It does not infer a latest release
  and does not read a Campaign Instance-local schema. There is no top-level `effective` query;
  World ownership is required route context.

### Quick Start guidance and authoritative progress

`QuickStartActivityDefinition` is the versioned instructional contract for a core tutorial
activity. It owns its stable activity key, current revision, canonical launch route, ordered stable
step keys, human instructions, and whether each step is system-verified or self-confirmed. The
currently installed revision is adopted immediately; older per-GM progress is remapped only where
the current definition still permits it, and system predicates are always reevaluated.

`QuickStartProgress` is dedicated per-GM persistence keyed by user and activity. It stores the
activity revision, current step, sidebar collapse state, permitted qualitative confirmations, last
canonical route, and selected-target references. It does not store a copied World, Campaign,
Player, or Session, and it never grants access to a target. The server resolves retained targets
through the authenticated GM's normal ownership boundary and returns human-readable labels rather
than opaque identifiers.

The three authenticated GM endpoints are `GET /me/quick-start`,
`GET /me/quick-start/:activityKey`, and `PUT /me/quick-start/:activityKey`. Updates accept only
bounded navigation/progress metadata. Completion for the current core activities is derived live
from World publication and Atlas state, Campaign Definition content and publication, Campaign
Instance captured snapshots/runtime, Player profiles and participation, and the existing Session
readiness service. `QuickStartProgress` is dedicated relational persistence, not a generic
`DomainRecord` resource.

### Hosted-system administration and infrastructure provenance

`SystemSettingArea` is a closed navigation registry for the initial hosted-system administration
surface; the settings inside every area remain an extensible status collection. Each setting is
classified as `application-managed`, `secret-backed`, `deployment-managed`, or `observed`, and has
a human-readable `ready`, `attention`, `disabled`, or `unavailable` status. These projections never
contain stored secrets, credentials, encryption keys, database passwords, or provider subjects.
`GET /settings/system` and `GET /settings/system/:systemArea` require the active
`SystemAdministrator` capability independently of GM authority. A non-administrator GM has no
Settings navigation or API access; an administrator without GM authority may use Settings without
gaining World or Campaign access.

The first application-managed bindings are installation name, invitation lifetime, default OpenAI
model, and the OpenAI credential. `ConfigurationBinding` stores one effective override per static
definition key using `VALUE`, encrypted `SECRET`, explicit `DISABLED`, or `INHERIT` semantics.
Application values take effect immediately; `INHERIT` resumes the deployment value or product
default, while `DISABLED` intentionally suppresses even a configured deployment secret. Invitation
lifetime affects newly issued or reissued invitations, and OpenAI model and credential bindings are
resolved for each subsequent generation request.

Value updates, secret replacement/rotation, revocation, reset, connection test, and bounded history
live below `/settings/system/:systemArea/settings/:settingKey`. Every operation remains
System-Administrator-only and uses an expected revision to reject stale writes. Secret input is
encrypted before persistence and never appears in status projections, history, logs, AI context, or
ordinary exports. `ConfigurationRevision` is append-only and records the human operator, action,
optional reason, and configuration version without recording old or new protected values. A
connection test records only success or failure and is rate limited. Public addresses, Auth0
topology, contact-encryption root material, database/object-storage credentials, and other
infrastructure-sensitive values remain deployment-managed in this slice.

New `Generation` rows record the authenticated requester plus a bounded context kind and context
identity when the command has one. Raw prompts and generated outputs are not passed to audit
persistence or retained: legacy required content columns receive an explicit redaction marker. Generation history remains
requester-scoped and returns metadata with `contentRetained: false`; prompts, outputs, provider
response identities, Generation identities, and opaque context identities are not projected. Context-free generation and
legacy root-Location AI routes have been removed; they are not canonical aggregate authoring
operations.

`MediaAsset` records may carry creator and aggregate-scope provenance. New canonical World uploads
use `/worlds/:worldId/media`, validate World ownership before retaining metadata, and record the
World Definition scope. Top-level asset reads remain infrastructure-level and creator-scoped, but
top-level asset creation is not available. Old unscoped assets remain readable during data
compatibility. Host transfer retains the aggregate scope
but intentionally unbinds creator attribution when Users are not part of the archive.

Graph tuples are derived projections rather than domain authority. No raw graph HTTP API is
registered. Graph counts and readiness are observed through the Data & storage Settings area.
Internal aggregate persistence and explicit repair workflows may still use the graph projection
service.

### Relational World Definition API

The additive World lineage spine is persisted in the relational `WorldDefinition`,
`WorldDefinitionRevision`, and `WorldDefinitionSnapshot` models rather than the generic
`DomainRecord` resource table. This preserves referential constraints between a lineage, its
current immutable revision, direct revision ancestry, and content-addressed snapshots while the
legacy root-Location representation remains available during migration.

The GM-authorized `GET /worlds` endpoint lists every active and archived lineage owned
by the authenticated GM; another GM's lineage is neither listed nor returned by explicit lookup. Each
item includes its transport ID, human-readable name and description, lifecycle status, archive and
update metadata, and—when published—human-readable current-revision metadata. It deliberately omits
revision `content` and snapshot `manifest` payloads. The endpoint is a library query only: response
order does not establish a current World and clients must explicitly select a lineage.

`GET /worlds/:id` reads one explicitly selected lineage and returns its revisions and
their captured snapshots, including immutable revision content and snapshot manifests. Missing
lineages and persistence failures use neutral errors that do not echo the requested opaque ID.
`GET /worlds/:id/revisions` is the bounded revision collection, and
`GET /worlds/:id/revisions/:revisionId` resolves a revision only through its owned World lineage.

World authoring is draft-first. `POST /worlds` creates one independently selectable,
GM-owned World lineage and one mutable working draft in a serializable transaction; it does not
publish revision 1. When content and records are omitted, the service seeds a root World Location,
the complete top-level collections, and the installed core Model Schema Release. Optional supplied
content and records become the complete initial draft rather than a patch over another World.

Each World has at most one mutable draft:

- `POST /worlds/:id/draft` starts or resumes the authenticated owner's draft. If a
  draft already exists, it returns that draft without creating another. Otherwise the request must
  name the World's exact current `baseRevisionId`; the service verifies the current revision's
  canonical snapshot manifest and authoritative revision record, then seeds the draft from that
  immutable capture. A legacy revision without Model Schema selections receives the installed core
  release as its explicit draft selection; publication still requires normal validation and
  conformance. Archived Worlds and stale bases cannot start a draft.
- `GET /worlds/:id/draft` returns the authenticated owner's complete working content,
  snapshot records, base revision/snapshot metadata, optimistic storage revision, and validation
  status.
- `PUT /worlds/:id/draft` replaces the complete draft content and record collection. It
  requires `expectedStorageRevision`, increments that revision atomically, and invalidates any
  earlier validation report. A stale save conflicts rather than overwriting another edit.
- `POST /worlds/:id/draft/validate` validates the exact requested storage revision. It
  checks bounded JSON, reserved server records, collection/record completeness, the root Location,
  and the Location containment graph, then stores a report tied to that same revision.
- `GET /worlds/:id/draft/impact` compares the draft records with its captured base and
  reports additions, changes, removals, and human-readable downstream Campaign Definition
  migration eligibility. It is analysis only and changes no published state.
- `POST /worlds/:id/draft/publish` publishes the complete draft, never a partial patch.
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

Atlas Locations, Bestiary Creatures, Item Compendium Items, and Character model definitions have
canonical owner-scoped reads beneath `/worlds/:id/atlas`, `/worlds/:id/bestiary`,
`/worlds/:id/item-compendium`, and `/worlds/:id/character-model`. These are projections of the
selected World's mutable draft, not independently persisted aggregates. Authoritative edits still
replace the complete draft with its optimistic storage revision so a partial child write cannot
bypass whole-World validation.

World lineage lifecycle and copying are also explicit:

- `POST /worlds/:id/archive` and `POST /worlds/:id/restore` require the exact
  `expectedMetadataRevision`. Archiving hides the World from normal active selection and freezes
  draft editing, validation, and publication without deleting revisions, snapshots, or downstream
  Campaign captures.
- `POST /worlds/:id/forks` requires an explicit snapshot from a World owned by the GM.
  It creates a new World lineage and unpublished draft, remaps captured resource identities and
  references, and stores immutable fork provenance. It does not establish a live link or alter the
  source World.

All draft, lifecycle, fork, list, and detail operations are owner-scoped. Missing resources,
stale revisions, and unavailable dependencies use neutral human-readable errors without echoing
opaque identifiers.

### Relational Campaign Definition authoring API

Campaign authoring is persisted through `CampaignDefinition`, immutable
`CampaignDefinitionRevision` and `CampaignDefinitionSnapshot` records, and one mutable
`CampaignDefinitionDraft` per lineage. `GET /campaigns` is a compact, owner-scoped
library query. `GET /campaigns/:id` returns the selected lineage, human-readable current
revision and captured-World summaries, revision history, optional draft metadata, and a bounded
human-readable projection of captured Locations, Creatures, Items, and World Placements. It does
not return an editable copy of current revision content or follow the mutable World head.
`GET /campaigns/:id/revisions` is the bounded revision collection, and revision detail resolves
only beneath the same Campaign Definition lineage.

`POST /campaigns` requires a human-readable name and an explicit owned
`worldDefinitionSnapshotId`. It creates an active Campaign Definition lineage and an unpublished
draft capturing that exact immutable World snapshot; it does not create revision 1. The server
verifies World snapshot integrity and ownership before writing. Clients never submit an
authoritative snapshot manifest or content hash.

Draft operations are explicit and optimistic:

- `GET /campaigns/:id/draft` reads the owner-scoped working draft.
- `POST /campaigns/:id/draft` idempotently resumes an existing draft or starts one from
  the explicitly named current Campaign revision.
- `PUT /campaigns/:id/draft` replaces the complete draft using
  `expectedStorageRevision`, a revision name, canonical Campaign content, and complete Campaign-owned
  records. Saving invalidates prior validation.
- `POST /campaigns/:id/draft/validate` validates the exact storage revision, recursive
  Plot hierarchy, Campaign placements, preparation defaults, captured-World references, and model
  conformance.
- `POST /campaigns/:id/draft/publish` requires successful validation of that same storage
  revision, revalidates inside a serializable transaction, constructs the canonical manifest on the
  server, creates the immutable Campaign revision and snapshot, advances the lineage head with a
  compare-and-set guard, and advances the draft base. Existing Campaign Instances remain unchanged.
- `GET /campaigns/:id/draft/impact` reports human-readable draft changes and downstream
  Instance impact without exposing opaque identifiers as labels.

Canonical `/campaigns/:id/plots` and `/campaigns/:id/placements` reads project the recursively
nested Plots and authored placements from that Definition's mutable draft. They do not make these
records independently writable: edits remain part of the complete optimistic Campaign draft so
Plot lineage, placement references, and captured-World conformance validate together.

`POST /campaigns/:id/archive` and `/restore` require the exact metadata revision.
Archived definitions and their drafts are read-only, while historical revisions, snapshots, and
Instances remain intact. `POST /campaigns/:id/forks` creates a distinct lineage and draft
from an explicitly selected owned Campaign snapshot, records immutable provenance, and does not
create a live link to the source.

World adoption is a separate all-or-nothing workflow. `POST
/campaigns/:id/world-migrations/preview` accepts the exact draft storage revision, one
direct-successor World snapshot, bounded mappings, and independent bounded pagination offsets for
ordinary changes, impacts, and conflicts. It compares the complete immutable World manifests,
returns truthful human-readable page totals and reconciliation candidates, and computes a hash over
the complete semantic plan rather than its presentation pages. Large responses shrink the current
page without skipping unseen rows.
`POST /campaigns/:id/world-migrations/apply` requires that plan hash, recomputes the full
plan inside a serializable transaction, rejects unresolved or stale mappings, creates the next
Campaign revision/snapshot, and writes immutable migration audit provenance. It never cherry-picks
World changes, crosses World lineages, rewrites prior Campaign snapshots, or changes existing
Campaign Instances. Compatible World Model release changes rewrite exact Campaign-record
conformance release selections only when existing concept and field identities still validate;
incompatible changes or newly required Campaign concepts remain explicit blocking reconciliation
conflicts rather than failing after an apparently ready preview.

All Campaign Definition routes require GM authorization and constrain nested Campaign, World,
snapshot, and migration lookups to the authenticated owner. Missing or foreign-owned records,
stale revisions, and unavailable dependencies use neutral human-readable errors.
The former `/world-definitions` and `/campaign-definitions` route roots have been removed and must
not be generated.

### Campaign Instance creation

The GM-authorized `POST /campaigns/:campaignDefinitionId/instances` endpoint creates one played
Campaign Instance from an explicit immutable Campaign Definition snapshot. Its request contains a
human-readable `name`, `campaignDefinitionSnapshotId`, and a protected idempotency key. The selected
snapshot and every idempotent retry must belong to the Definition lineage named in the route. It
never accepts the ambiguous legacy `campaignId`, selects a snapshot by recency, or substitutes the
mutable current Campaign or World authoring head. Persistence stores only a hash of the idempotency
key, unique to the owning GM; the raw key is never retained.

Creation is one serializable transaction. The service loads a selected Campaign Definition
snapshot, its immutable Campaign revision, and the exact captured World snapshot and World revision
required by that Campaign snapshot, scoped through a Campaign Definition owned by the authenticated
GM. It verifies both source manifests and their persisted hashes before writing, and rejects missing,
foreign-owned, or inconsistent provenance.
It then creates a `PREPARING` Campaign Instance with explicit `ownerUserId` and optimistic
`metadataRevision`, an initial `CampaignInstanceSnapshot` with
`snapshotNumber: 1` and `reason: "INITIAL"`, a mutable `CampaignInstanceRuntime` bound to that
snapshot, a matching immutable initial runtime checkpoint, the owner's explicit GM participation
membership, and finally records the snapshot as the Instance's current snapshot. The authenticated
GM is recorded independently as owner, creator, checkpoint author, and initial GM participant;
ownership/audit identity is never accepted from the request body. Legacy Instances may temporarily
have no owner until explicit rollout assigns one, but newly created Instances may not.

The initial Instance snapshot manifest is a deterministic compatibility capture. It replicates the
complete Campaign Definition and World snapshot manifests together with their snapshot/revision
identities, capture times, revision numbers, and content hashes. Its own content hash is derived
from that complete manifest. This makes the Instance reproducible even after either authoring
lineage advances. Runtime initialization materializes Definition preparation as Instance-owned
values, creates `not-started` progress for every captured root Plot and subplot, and creates
explicit planned/deferred decisions for captured Campaign placement intent. Mutable play state is
not written into Definition snapshots. Failure rolls back the whole transaction, so no Instance,
snapshot, runtime, initial checkpoint, or owner GM membership may exist alone.

### Relational Campaign Instance read API

`packages/common/src/types/campaign-instance-api.ts` is the authoritative observable boundary for
Campaign Instance administration. API serializers and web consumers use its human-safe list,
detail, readiness, preparation, recursive Plot, placement, embodiment, roster, grouped Session,
continuation, version, migration, restore, invitation, Agent, lifecycle, and mutation projections
and requests rather than maintaining parallel response interfaces. `HumanRevisionReference`
always supplies a human name, revision number, and canonical `authoringHref`; an opaque Definition
identity may occur inside that URL but is never rendered as its label.
Placement realization commands resolve captured Creature or Item sources on the server. Explicit
replacement accepts only an existing Instance Creature or Item selected from the bounded,
human-labeled replacement-option list. The placement projection provides that list with
human names and type labels; opaque runtime identities are request or option values only and are
never labels. Migration preview changes, conflicts, and compatible mapping candidates have
independent bounded pages, totals, and next offsets. Mapping conflicts identify their resource
scope and expose human-labeled compatible successors while keeping source and target identities
as opaque command values. The plan hash always covers the complete semantic plan, never an
individual presentation page.

`GET /campaigns/:campaignDefinitionId/instances` lists the authenticated GM's played realizations
for one stable Definition lineage. `GET /me/campaign-instances` provides the bounded cross-Definition
locator projection needed by the Campaign library and intentionally shorter GM URLs. Both list by
human-readable name and lifecycle status, with compact names and revision numbers for the Campaign
Definition and World Definition captured by the current `CampaignInstanceSnapshot`. They omit
runtime state and snapshot manifests. Queries walk only stored snapshot relationships; they never
follow mutable Definition heads or select an Instance by recency.

`GET /campaigns/:campaignDefinitionId/instances/:campaignInstanceId` returns one explicitly selected
Instance beneath its stable Definition parent. `GET /me/campaign-instances/:campaignInstanceId` is
the read-only authenticated locator equivalent. Each returns immutable compatible Campaign/World
snapshot provenance and non-payload runtime metadata such as storage revision and last update time;
neither returns mutable runtime JSON. Active Session state comes only from the relational
Instance-to-Session relationship through the server-derived continuation projection; the API must
not guess through a legacy `campaignId` or accept a competing runtime field as authority. These
endpoints require GM authorization and use neutral not-found/unavailable responses that do not echo
opaque identifiers. Reads are scoped to Instances explicitly owned by the authenticated GM, and
canonical child operations additionally prove the Definition/Instance relationship. Selecting
another GM's Instance or presenting it beneath a different Definition behaves as not found.
`createdByUserId` remains audit provenance and is not the authorization boundary.

### Legacy realignment shadow materialization

The legacy conversion preflight inventories every generic `DomainRecord` resource. The deterministic
shadow planner assigns World-owned resources to exact World captures, rebinds known Instance
dependents, and explicitly retains resources whose target aggregate is deferred; it never silently
drops an unclassified record. Revision content hashes are computed from the exact JSON persisted in
the revision row, while every proposed snapshot uses the same canonical `SnapshotManifest` hash
contract as live publication.

Recovery also creates one editable draft beside each recovered World and Campaign lineage. These
drafts preserve the exact immutable legacy captures while projecting usable current authoring
content. Legacy Campaign discoveries, objectives, pressures, and resistances are surfaced in a
visible recovered root Plot; legacy Campaign placements become named placement records. A retained
legacy Session is materialized as a relational `CampaignInstanceSession` with its human name,
timestamps, lifecycle, and exact source payload preserved in a recovery extension. The legacy row
remains unchanged, and its identity map targets the recovered Session rather than a deferred
rebinding. Recovered editable Worlds select only the materialized core Model release and initially
declare no unverified legacy Definitions; recovered Campaign drafts add no Campaign-specific Model
release. Original legacy Definition membership and World/Campaign Model release selections remain
losslessly available in the namespaced recovery metadata, and every raw legacy record remains in
the draft capture for explicit later upgrade.

The generic whole-World-draft save operation cannot add, update, remove, or change membership for
Location, Creature, or Item records. Those protected resources use dedicated authoring operations,
which retain optimistic draft revision checks and enforce Item media ownership and exact World
scope. Validation and publication recheck declared canonical Item media, so a raw draft payload
cannot bypass authorization and a previously authorized asset cannot be published after its scope
changes. A legacy `creatures` record remains visible until the GM explicitly upgrades it; that
single atomic operation retains its stable identity and references, preserves the exact legacy
payload in an extension, replaces the legacy record with a canonical Creature `definitions` record,
and adds canonical Definition membership.

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
references a Location in the Campaign revision's captured World snapshot and may reference stable
`CampaignPlacementDefinitionId` values. The old nested actor and Item placement-intent arrays are
deprecated compatibility fields, not authoritative placement storage; validation rejects them in
new Campaign Definition drafts rather than publishing duplicate placement representations.
When an applicable selected Model Schema declares an `aow:plot` concept, each Plot carries exact
`conformance` and `modelValues` that publication validates against the selected World-plus-Campaign
release closure. Campaign placements follow the same rule for an applicable
`aow:campaign-placement` concept.

`WorldPlacementDefinition` is immutable World revision data: it locates captured Creature, Item, or
other registered content and owns its source position and presentation. `CampaignPlacementDefinition`
is a distinct Campaign-owned overlay associated with zero or more Plots. Its `independent` variant
places captured content without changing the World. Its `world-decoration` variant names a
`capturedWorldPlacementId` and owns only Campaign-specific meaning, presentation, or behavior. A
decoration uses the captured placement's Location. Objects, Traps, and Hazards remain Item families,
not separate placement kinds. Snapshot record names are exactly `world-placements`, `plots`, and
`campaign-placements`.

Plots and Campaign placements may carry `conformance` plus `modelValues`. When the selected
effective releases contain an applicable concept whose semantic role is `aow:plot` or
`aow:campaign-placement`, respectively, that carrier is required. `conformance` records the exact
ordered World-plus-Campaign release IDs and the selected concept ID; `modelValues` is keyed by the
declared fields' stable `storageKey`. Publication rejects missing required fields, undeclared keys,
wrong value types, and violated cardinality, uniqueness, range, length, pattern, or allowed-value
constraints. A record must not declare these values when no matching applicable concept exists.

Runtime realizations are deliberately separate. `PlotActorRealization` names a runtime entity,
`PlotItemRealization` names an Item instance, and both point back to their authored placement-intent
IDs. They occur only inside `CampaignInstancePlotProgress`, which is keyed by both
`CampaignInstanceId` and `PlotDefinitionId`. Instance progress owns status, Objective progress,
runtime realization links, per-Creature knowledge, revealed claims, and approved overrides. It does
not copy Plot parentage into a second runtime hierarchy or turn mutable actors and Items into
Campaign Definition content.

A `PlotDiscovery` is a composed epistemic object with exactly one `truth` facet and one or more
supporting or contradicting facets distributed across its `beliefs` and `rumors` arrays. Each belief
and rumor has its own stable `id`, `statement`, optional `provenance`, and required `relation` of
`supports` or `contradicts`; these facets are defined independently while remaining owned by the
Discovery. New writes must use this composed shape. The deprecated `claims` array is accepted only
when reading older snapshots so they can be migrated without losing content. Per-Creature knowledge
is separately discriminated as `knows-truth`, `holds-belief`, or `heard-rumor`; learning a facet never
changes its epistemic kind.

Authoring validates scoped `PlotDefinition` state before accepting a Plot set. It reports duplicate
identities, missing or cross-Definition parents and relationship targets, parent cycles, combined
prerequisite/dependency cycles, and unexplained cross-branch relationships without mutating input.
Common `validatePlotHierarchy` remains a compatibility helper for unmigrated consumers.
Plot and placement records are captured through the aggregate-specific Campaign Definition draft,
revision, and snapshot workflow. They are not unversioned generic domain resources.

### Relational Campaign Instance participation persistence

The participation spine persists the current Instance-scoped contracts without guessing how legacy
Campaign membership, invitation, Character draft, or `sessions` rows should be rebound. Legacy
Character drafts are timestamped as archived migration input and are not part of the live HTTP
workflow. These relational tables are not generic domain resources. Canonical first-launch, Player
directory, membership lifecycle, and Character association/import APIs now operate on this spine:

| Contract or protected boundary                  | Relational table                            | Integrity boundary                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemAdministrator`                           | `SystemAdministrator`                       | First-launch installation operator with protected required email/phone; authority is separate from the optional GM role even when both belong to one User                                                                                                                   |
| `PlayerProfile`                                 | `PlayerProfile`                             | One durable Player profile per authenticated User; standing is independent of Instance membership; Spectator-only Users have no profile; each non-null contact hash is unique installation-wide                                                                             |
| Protected authentication-provider association   | `AuthenticationProviderAssociation`         | Belongs to the durable User and optionally its Player profile, supporting administrators and Spectators without invented Player profiles; exact Auth0 subjects are encrypted/hashed, credentials remain external references, and no contact field may infer or claim a link |
| `CampaignInstanceHumanMembership`               | `CampaignInstanceHumanMembership`           | Explicit Instance FK; Player role requires a Player profile, while GM and Spectator roles forbid one                                                                                                                                                                        |
| Protected `CampaignInstanceInvitation` workflow | `CampaignInstanceInvitation`                | Explicit Instance FK; GM/Player/Spectator roles; contacts are encrypted/hashed and invitation credentials are hash-only; acceptance/revocation fields must agree with status and chronology                                                                                 |
| Invitation delivery attempt                     | `CampaignInstanceInvitationDeliveryAttempt` | Contact-free per-channel outcome and provider reference for one Instance invitation; recipient addresses and tokens are never stored in this audit row                                                                                                                      |
| Non-human Agent identity                        | `AgentIdentity`                             | GM-owned stable Agent identity with protected configuration reference rather than embedded credentials                                                                                                                                                                      |
| `CampaignInstanceAgentParticipation`            | `CampaignInstanceAgentParticipation`        | Explicit Instance and Agent FKs; observe and act capability arrays are stored separately and must be selected from the closed core Session capability registry                                                                                                              |
| `CampaignSession` / `CampaignInstanceSession`   | `CampaignInstanceSession`                   | Explicit Instance FK; named-command lifecycle, metadata CAS, schedule, captured snapshot/runtime boundary references, normalized event bounds, summary status, and idempotent creation key                                                                                  |
| `CampaignSessionParticipation`                  | `SessionParticipation`                      | Exactly one human membership or Agent participation; role/name plus separate immutable observe/act capability snapshots, invitation response, live presence, durable attendance, required classification, and acted state                                                   |
| Protected Session invitation workflow           | `CampaignSessionInvitation`                 | Existing human Instance membership only; hash-only credential, expiration, reissue lineage, response chronology, and same-Instance composite FKs                                                                                                                            |
| Session invitation delivery attempt             | `CampaignSessionInvitationDeliveryAttempt`  | Contact-free delivery outcome; protected contacts remain on the durable profile boundary                                                                                                                                                                                    |
| `SessionPresenceLease`                          | `SessionPresenceLease`                      | Renewable hashed connection lease; presence is neither invitation response nor durable attendance                                                                                                                                                                           |
| `CampaignSessionEvent`                          | `CampaignSessionEvent`                      | Append-only, ordered, bounded, attributed, visibility-scoped Session journal record with optional runtime revision transition and integrity-chain fields                                                                                                                    |
| `CampaignSessionRuntimeBoundary`                | `CampaignSessionRuntimeBoundary`            | Append-only reference to the owning Instance snapshot and runtime revision at start, pause, resume-after-migration, or conclusion                                                                                                                                           |
| `CampaignSessionSummary`                        | `CampaignSessionSummary`                    | Revisioned draft/approved/amended narrative against an exact sealed event sequence; approved revisions are immutable and private GM notes remain separately projected                                                                                                       |
| Session integration event                       | `CampaignSessionOutboxEvent`                | Durable outbox request such as `session-backup-requested`; emitting the request is atomic with summary approval while backup execution remains external                                                                                                                     |
| `CampaignInstanceCharacterAssociation`          | `CampaignInstanceCharacterAssociation`      | A Character ID belongs to one Instance and Player membership; active Character and one-way import provenance use same-Instance/source-lineage composite FKs                                                                                                                 |
| `CharacterCreationDraft`                        | `CampaignInstanceCharacterDraft`            | Resumable input is keyed to an already allocated Character and constrained to that Character's exact Instance and Player membership; captured-schema submission, GM review, and activation materialization are explicit transitions                                         |

Database checks enforce the role discriminants, provider/invitation/Session lifecycle chronology,
namespaced Agent capability arrays, protected JSON shapes, exactly-one participant, join/leave
chronology, append-only Session history, and complete one-way Character import provenance. A
PostgreSQL partial unique index permits many active Campaign Instances and many `PAUSED` Sessions,
but no more than one `ACTIVE` relational Session across the installation. Runtime code must not
infer an active or resumable Session from legacy `campaignId` data or record recency. A global
live-Session projection may expose the unique active Session; paused Sessions are selected only
within their owning Campaign Instance so the system never chooses among them by recency.

### Canonical Campaign Session lifecycle and journal

A `CampaignSession` belongs to exactly one Campaign Instance and never copies Instance runtime.
Its consistency anchors reference the Instance snapshot and runtime revision that applied at each
boundary. The canonical lifecycle is `planned → lobby → active ⇄ paused → concluded`, with
`planned|lobby → cancelled` and optional `lobby → planned`. Every transition is a named server
command; whole-document status replacement is forbidden. `Continue` is the user-facing action for
an active Session and `Resume` is the action for a paused Session.

The creating GM is atomically included as a required human Session participant. Selected Players
are required by default, Spectators are optional, and Agents are required only when explicitly
selected as such. At most eight participants including the GM may be selected. Removing someone
from a planned roster marks their participation as unselected so response and attendance history
are retained; only selected participations contribute to the current roster and readiness. Start
and resume recompute readiness against an exact Session metadata revision, Instance runtime revision,
captured snapshot, required roster, invitation responses, live presence generations, membership
standing, active Character readiness, and Agent authorization. A displayed readiness hash is an
optimistic token, never authorization to skip the transactional recheck.

Invitation response, live presence, and final attendance are independent facts. A Session
invitation can only name an existing human Campaign Instance membership. Presence uses a bounded,
renewable hashed connection lease; loading a page does not imply presence. Conclusion converts
observed participation into durable attendance without erasing earlier join/leave history. The
current persistence accumulates bounded lease durations; exact union accounting for overlapping
multi-device leases is deferred, so duration must not be treated as billing- or rules-grade time.

`CampaignSessionEvent` rows, not the legacy `eventLog` JSON field, are authoritative for new
history. Lifecycle, invitation response, roster, durable presence transitions, summary, and future
typed game commands append ordered, attributed, visibility-filtered, size-bounded records through
the server boundary; heartbeat lease renewals do not append, and clients cannot post arbitrary
event rows. Planning and lobby administration can precede play in that ordered history.
`firstEventSequence` remains absent until start and then identifies the start event that opens the
play segment; `lastEventSequence` identifies the latest event across the entire Session history.
Start, pause, resume after an Instance migration, and conclusion append immutable runtime boundary
records. Conclusion seals the event sequence and creates a summary draft. Approval/amendment adds
revisioned summary history and atomically emits a `session-backup-requested` outbox event; it does
not reset Instance runtime.

`CampaignInstance` also stores explicit nullable `ownerUserId` for an additive legacy rollout, a
positive `metadataRevision` for lifecycle compare-and-swap, and nullable `creationKeyHash`. New
creation requires an owner and stores only the hash of the protected idempotency key;
`(ownerUserId, creationKeyHash)` is unique. `createdByUserId` remains audit provenance.

`CampaignInstanceRuntimeCheckpoint` is an immutable exact state capture numbered within one
Instance. `INITIAL`, `MIGRATION_SOURCE`, `MIGRATION_RESULT`, `RESTORE_SOURCE`, and
`RESTORE_RESULT` reasons distinguish adoption boundaries. `CampaignInstanceMigrationAudit` binds
source/result snapshots and source/result runtime checkpoints to the same Instance through
composite foreign keys. Its result snapshot must directly name its source snapshot as predecessor.
The audit stores the complete object-shaped resolution plan and its hash and is append-only. A
restore creates a new snapshot/checkpoint pair from current runtime; it never rewinds a pointer or
deletes later Session history.

Campaign Instance projections carry their stable Campaign Definition lineage ID, and human-readable
captured-revision projections carry the corresponding World or Campaign Definition lineage ID.
These identifiers provide contextual route and command scope only: clients must use the accompanying
names and revisions as visible labels and must never render an opaque ID to a GM.
Campaign Instance list projections are deterministically ordered and expose bounded `limit`,
`offset`, and `total` pagination metadata.

## Persisted API resources

`/domain/:resource` is not an HTTP API or extension surface. Aggregate-specific APIs own all
external reads and writes. `DomainRecord` remains an internal persistence and migration mechanism
for legacy content, generated artifacts, and snapshot assembly while those records are absorbed by
their owning aggregates.

Internal generic persistence contains the legacy compatibility resources below. The identifier is
derived as shown. During additive realignment, an existing installation may still have
one legacy root `locations` World and one legacy `campaigns` record, but this is not the target
cardinality: the relational Definition APIs support multiple World and Campaign Definition
lineages. Versioned World lifecycle is archive-first; the former destructive root-Location World
endpoint and ambiguous `campaignId` HTTP contracts have been removed.

| Resource                                  | Aggregate                                            | Stored ID              | Stored kind/name                                |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `definitions`                             | `GameDefinition`                                     | `identity.id`          | `kind`, `identity.name`                         |
| `rule-variants`                           | `RuleVariant`                                        | `id`                   | `rule-variant`, `name`                          |
| `content-packs`                           | `ContentPackManifest`                                | `id`                   | `content-pack`, `name`                          |
| `extension-schemas`                       | `ExtensionSchema`                                    | `id`                   | `extension-schema`, `key`                       |
| `systems`                                 | `GameSystemDefinition`                               | `id`                   | `game-system`, `name`                           |
| `games`                                   | `GameState`                                          | `campaign.identity.id` | `game-state`, campaign name                     |
| `campaigns`                               | `CampaignDefinition` (legacy compatibility)          | `identity.id`          | name                                            |
| `sessions`                                | `SessionState`                                       | `identity.id`          | name                                            |
| `characters`                              | `CharacterState` or `CampaignInstanceCharacterSheet` | `identity.id`          | name                                            |
| `creatures`                               | `CreatureState`                                      | `identity.id`          | name                                            |
| `items`                                   | `ItemInstance`                                       | `id`                   | `item-instance`, name override or definition ID |
| `objects`                                 | `ObjectState`                                        | `identity.id`          | name                                            |
| `scenes`                                  | `SceneState`                                         | `identity.id`          | name                                            |
| `locations`                               | `LocationState`                                      | `identity.id`          | `kind`, name                                    |
| `location-connections` (legacy read-only) | `LocationConnectionState`                            | `identity.id`          | `kind`                                          |
| `encounters`                              | `EncounterState`                                     | `identity.id`          | name                                            |
| `pending-decisions`                       | `PendingDecision`                                    | `id`                   | `pending-decision`                              |
| `game-events`                             | `GameEvent`                                          | `id`                   | `type`                                          |

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

`SessionState` is a deprecated generic-resource compatibility aggregate, not the canonical
Campaign Instance Session. It has `identity`, a human-readable
`name`, required `worldId` and `campaignId`, a `status` of `planned`, `in-progress`, `completed`, or
`cancelled`, optional ISO timestamps (`scheduledFor`, `startedAt`, and `endedAt`), and arrays of
`sceneIds`, `encounterIds`, and `eventIds`. Optional `notes` and namespaced `extensions` hold session
material that does not yet have a first-class field. These references make selective host transfer
include the session's required campaign and play-state dependencies. New Session writes use the
relational `CampaignInstanceSession` aggregate and normalized journal described above; generic
Session mutation must not select or mutate canonical play state.

## Geography and world-building

Geography is normalized. Every world, plane, continent, ocean, region, nation, province, territory,
wilderness, settlement, district, and site is its own `LocationState`. Parentage is expressed by
`placement`. Legacy direct travel/adjacency uses `LocationConnectionState`, which is a retirement
target under the accepted hierarchy-only migration. Do not generate new travel edges. Do not nest child
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

### Internal legacy location-generation contract

The retained, non-routed legacy World generator accepts exactly one JSON object, parses it as the root
`LocationState`, forces `kind` to `world`, generates and stores its map, and persists it under the
`locations` resource. Return the root world only: no Markdown fence, prose, array,
`{ "world": ... }` wrapper, or full `LocationGraphState` wrapper. The API replaces generated
identity and image-storage metadata with authoritative values before persistence. Include a
two-sentence `description` suitable for the dashboard.

The retained, non-routed legacy Location generator combines `create-location.md`, this document, the
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

## Campaign Definition authored content and placements

`CampaignDefinitionContent` is the complete authored payload of a draft or immutable revision. It
contains no World hierarchy copy and no Instance or Session state. Its Location and source-content
references resolve only against the revision's explicit `capturedWorldSnapshotId`. The content lists
the exact Plot and Campaign-placement records included in the snapshot, plus exact Campaign-scoped
Model Schema releases and reusable preparation defaults.

```ts
interface CampaignDefinitionContent {
  formatVersion: 1;
  gmPremise: string;
  playerIntroduction: string;
  plotDefinitionIds: PlotDefinitionId[];
  placementDefinitionIds: CampaignPlacementDefinitionId[];
  modelSchemaReleaseIds: ModelSchemaReleaseId[];
  preparation?: {
    startingLocationId?: LocationId;
    startingContext?: string;
    mapVariations?: string;
    locationCanvases?: CampaignLocationCanvasConfiguration[];
  };
}

interface WorldPlacementDefinition {
  id: WorldPlacementDefinitionId;
  locationId: LocationId;
  source:
    | { kind: "world-creature"; creatureId: CreatureId }
    | { kind: "world-item"; itemDefinitionId: DefinitionId }
    | { kind: "registered-content"; definitionId: DefinitionId };
  name?: string;
  mapPosition?: NormalizedMapCoordinate;
  scale?: number;
  notes?: string;
  conformance?: ModelConformance;
  modelValues?: Record<NamespacedKey, JsonValue>;
}

type CampaignPlacementDefinition =
  | {
      id: CampaignPlacementDefinitionId;
      kind: "independent";
      locationId: LocationId;
      plotDefinitionIds: PlotDefinitionId[];
      source:
        | WorldPlacementDefinition["source"]
        | {
            kind: "actor-role";
            role: string;
            suggestedCreatureDefinitionId?: DefinitionId;
          };
      name?: string;
      mapPosition?: NormalizedMapCoordinate;
      scale?: number;
      notes?: string;
      conformance?: ModelConformance;
      modelValues?: Record<NamespacedKey, JsonValue>;
    }
  | {
      id: CampaignPlacementDefinitionId;
      kind: "world-decoration";
      locationId: LocationId;
      plotDefinitionIds: PlotDefinitionId[];
      capturedWorldPlacementId: WorldPlacementDefinitionId;
      name?: string;
      mapPosition?: NormalizedMapCoordinate;
      scale?: number;
      notes?: string;
      conformance?: ModelConformance;
      modelValues?: Record<NamespacedKey, JsonValue>;
    };
```

The Campaign authoring adapter checks exact record membership and delegates Plot hierarchy/ownership,
captured references, placement-to-Plot relationships and World-decoration consistency to entity state.
Common `validateCampaignDefinitionContent` retains its compatibility contract for unmigrated consumers.
Authoring validation additionally compiles the captured
World and Campaign Model releases. Human-readable validation issues never expose opaque IDs.

Campaign AI generation is proposal-only. The request identifies one immutable World Definition
snapshot; the server authorizes and verifies that snapshot and constructs the Location, Creature,
Item, and World Placement catalogs from its manifest. The result carries the same snapshot identity
and emits `plots` and `campaign-placements` records ready to apply to a Campaign Definition draft. It
does not persist through the legacy generic `campaigns` resource or infer the latest World.
`POST /ai/world-definition-snapshots/:worldDefinitionSnapshotId/campaign-definition-draft-proposals`
returns this proposal and records generation provenance without publishing a Campaign revision.

## Legacy Campaign compatibility (migration only; never generate)

The deprecated `CampaignDefinition` compatibility aggregate below historically represented a
singleton World's authored story and persistent play context in the generic `campaigns` resource.
It is retained only to read and migrate old records. New authoring, persistence, and AI output must
use `CampaignDefinitionLineage`, `CampaignDefinitionContent`, versioned snapshots, Plots, and
Campaign placements. The legacy shape contains `identity`, `name`, the root-world `worldId`, a
protected `gmPremise`, a `playerIntroduction`, the materialized world hierarchy in `locationIds`,
and a required `partyStartingLocationId` within that set. Every world descendant is in editable
scope; `locationIds` does not create a campaign-specific location silo. The premise and introduction are sanitized rich HTML
limited to paragraphs, second- and third-level headings, emphasis, lists, blockquotes, line breaks,
and safe links. It does not contain a party roster or starting clock and never prescribes player
actions.

Legacy Campaign records owned placement and location-discovery arrays that were shared by every
legacy session:

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

In this legacy shape, every campaign location reference had to appear in `locationIds`, every world descendant was
materialized there, and every entry resolved within the campaign's `worldId`. Migration must not invent creature, item,
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

The deprecated `CampaignState` is mutable play state embedded in a legacy `GameState`; migration
maps it to a Campaign Instance runtime, never to Campaign Definition content.

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
  (`active`, `retired`, or `dead`), advancement, heritage, background, alignment, features, feats,
  one or more professions with independent progression, death saves, biography, and other
  character-specific progression. Class and Subclass are not canonical domain concepts.
- `CreatureState` is the common runtime creature aggregate. For monsters and NPCs it includes an optional monster
  definition, three required image assets, an opposed-roll defense rating contributed by equipped
  armor, physical classification and local aliases, combat statistics, inventory/equipment,
  disciplines, communication capabilities, action definition IDs, effects, conditions, resources,
  damage adjustments, triggers, optional transformed form, disposition, and extensions.
- Every new canonical World `definitions` record whose payload `kind` is `creature` requires
  `instanceEmbodimentPolicy`. Its `strategy` is `one-per-instance`, `one-per-realization`, or a
  namespaced extension strategy, with optional positive `maximumPerCampaignInstance` and
  extensions. `one-per-instance` reuses one independent embodiment of the captured source across
  placements in that Instance; `one-per-realization` creates an independent embodiment for each
  realized placement. A namespaced strategy must be implemented by the effective captured
  model/plugin or Instance readiness blocks. Existing immutable snapshots without this field
  resolve deterministically to `one-per-instance` with maximum 1 and retain
  `source: "legacy-default"` provenance; no policy is inferred from a Creature's name.
- `CampaignInstanceAuditEvent` is append-only, bounded, and human-resolvable audit provenance for
  Instance creation, lifecycle/runtime administration, invitations, Agent grants, migration, and
  restore. Audit detail never contains plaintext contact data, invitation credentials, or protected
  Agent configuration references.
- Every `ItemDefinition` has a required construction quality of `ramshackle`, `standard`, `fine`,
  or `exquisite`. `ItemInstance` references an item definition and records its own required quality,
  quantity, current location,
  attunement-as-operator-synchronization, analysis state, capacity/ammunition/durability, custom
  values, and extensions. Item
  location is discriminated as `inventory`, `container`, `scene`, `location`, `carried`, or
  `destroyed`.
- `EncounterState` schema version 2 is the simultaneous planned-combat aggregate. It contains
  identity/name, optimistic revision, round/checkpoint, phase, pause state, authoritative combatants,
  simulated combatants, ordered per-actor plans, pending conflict, history, random cursor, processed
  command IDs, environment and private extensions. There is no initiative or active combatant turn.
  Encounter square coordinates are scene-local; the Instance adapter converts them to/from runtime
  feet at five feet per square. They do not replace strategic `LocationState` placement.
- `CombatProfile` explicitly captures attack, defense, damage, resistance and Might formulas with
  named source-bound signed dice and integer constants. Equipped Items, captured Attributes/Skills
  and active Conditions supply available source bindings; sparse actors do not receive fabricated
  statistics. GM setup supplies missing health and formulas explicitly. Defender wins ties, a fresh
  attack-minus-defense margin of at least 10 is critical, and critical damage doubles dice counts
  rather than constants. Damage taken is `max(0, damage - resistance)`.
- The `Encounter` Entity owns plan editing/submission, lock, guided stepping, pause/resume, conflict
  decisions, reopening, round publication and completion. Plans advance only when their current
  activity concludes. Six movement checkpoints are the default; diagonals and orthogonal moves each
  consume one five-foot square. Authored profile rules specify available actions and resource costs;
  unresolved interactions require explicit GM adjudication rather than an implicit order.
- `CombatProfile.resources` contains explicit remaining allowances. Only keys in optional
  `roundResourceLimits` reset at the next round; other resources persist as consumables. Attack
  costs are explicitly free or resource-backed. Activity costs are paid on completion; reaction
  costs on trigger. Empty formula arrays explicitly mean zero; missing formula fields are invalid.
- Reaction declarations bind a named captured rule, incoming-attack trigger, protected target and
  optional source filter. Before reactions add their separately sampled defense contribution;
  after/replace reactions require scoped GM custom consequences. Pending/armed/triggered/
  invalidated/expired states and matched reaction identities persist across pauses.
- Unconscious/dead is an explicit `incapacitation` state, also stored on sparse runtime `combat`.
  Unconscious actors may declare a configured death-save for GM resolution; no numerical death-save
  formula is invented. Discarded plans do not resume following resurrection. GM correction commands
  can set health, consciousness, presence or additional actor controllers within an open round.
- Summon rules activate an already captured inactive roster actor. A same-round summoned attack must
  be declared in the summoner's activity and consume its explicit configured capacity; otherwise
  that actor waits until the next round. Arbitrary same-round summoned activity trees are unsupported.
  Concurrency pairings explicitly label each side and use a captured winner-first contest; unspecified
  simultaneous interactions require a GM outcome.
- `CampaignInstanceRuntimeState.encounter` stores the active durable encounter. The API binds it to
  the selected active Session, validates controller membership and captured sources, and persists
  commands with revision checks and idempotency receipts. Private captured entropy makes resumed
  resolution reproducible. Authoritative Creature health/position changes occur atomically only
  when the round is published; concurrent actor/equipment changes prevent stale publication.
- Player projections expose visible actors, owned plans and named action choices, and released public
  history. They omit other plans, simulated outcomes, private roll formulas/entropy, conflicts and GM
  reasoning. Legacy turn events/durations/limits require explicit rules review; do not silently
  reinterpret them as rounds or generate new initiative encounters.

Character heritage records an origin region and zero to three immutable-at-creation heritage
selections. Character profession state records current expertise, how it was acquired, advancement
awards/spends, and action use counts.

Identity and participation have five separate scopes; never collapse them into one Campaign participant record:

- `SystemAdministrator` is the installation operator established exactly once through first launch
  with protected email and phone. The associated User may also have GM authority, but those roles
  remain independent. Authentication-provider associations belong to the User, so administrators
  and Spectator-only people do not require fabricated Player profiles.
- Auth0 is an authentication adapter over that durable identity boundary, not a source of Player
  ownership. Authorization Code with S256 PKCE establishes an Auth0 subject; sign-in resolves only
  an existing exact provider/subject association, while linking requires the same already-authenticated
  User throughout the redirect. Email and phone claims never select, merge, or claim a User or profile.
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
  Core Session integrations use closed registries: observe grants are `aow:event-stream`,
  `aow:presence`, or `aow:session-state`; act grants are `aow:draft-narrative`,
  `aow:suggest-content`, or `aow:suggest-plot-twist`. A grant in one registry never implies a grant
  in the other.
  The contract has no human user, membership, role, or impersonation target; implementations must
  never turn an Agent capability into human credentials or attribute Agent actions to a person.
- `CampaignSessionParticipation` separately records response, presence, attendance, role/name and
  immutable `observeCapabilities` / `actCapabilities` snapshots, required classification,
  first-join and last-leave timestamps, accumulated
  bounded presence duration, and whether a human
  membership or Agent acted in one Session. It always names the same Campaign Instance as the
  Session and the referenced membership/Agent authorization. The GM is both operator and a human
  Session participant; fictional GM actions are attributed to the Instance Creatures they control.

`CampaignInstanceCharacterAssociation` binds each Character to exactly one Campaign Instance and
one Player-role membership in that Instance. Its discriminated `origin` is either
`created-in-instance` or `one-way-import`. Import provenance records the source but creates a new
destination Character identity and destination-owned Character sheet record in a different
Campaign Instance, with no synchronization or back-transfer. The membership's optional
active Character must occur in its Character history and resolve to an association for that same
membership and Instance. Every Character in the membership's full history must likewise resolve to
an association owned by that membership in that Instance. A lifecycle transition to `active`
from `draft` requires a GM-approved draft whose `ownerMembershipId` is that same Instance membership.
Initial activation revalidates against the current captured World/Campaign schema, checks the current
snapshot and approved draft revision/status transactionally, consumes that draft revision, and
materializes a snapshot-stamped `campaign-instance-character-sheet` with the lifecycle transition.
Its `sourceDraftRevision` records the approved source revision. Reactivating an inactive Character
preserves the existing sheet, mutable runtime fields and acquired rolls; it does not rematerialize.
`validateParticipationConsistency` checks these Character invariants plus
same-Instance Session, human-membership, and Agent-participation relationships without putting
opaque identifiers into its human-readable issues.

`CharacterCreationDraft` is the resumable authoring state for an already allocated, Instance-bound
Character. Its `campaignInstanceId`, `ownerMembershipId`, and required `characterId` cannot be
rebound. Player operations use the collection
`/me/campaign-instances/:campaignInstanceId/characters` and member
`/me/campaign-instances/:campaignInstanceId/characters/:characterId`; create allocates the Character
association and draft in one transaction, reads and writes verify the authenticated active Player
membership, and optimistic revision checks prevent lost updates. Available Background and Profession
choices (with old Heritage fields retained only for compatibility) are read from the World snapshot
captured by the Campaign Instance's current
snapshot, never from the live evolving World Definition. Attribute requirements are resolved from
the immutable Model Schema releases selected by the captured World revision and their locked
dependency releases, including GM-authored Attribute elements rather than a closed built-in list.
A Player may edit only `in-progress`, then
submit for review; submitted and complete drafts are locked. The GM may approve a conformant draft
or request changes. Activation repeats validation against the current Instance snapshot before
materializing `CampaignInstanceCharacterSheet`, which is creation output rather than a fabricated
complete `CharacterState`. A bounded `character-imports/options` projection beneath the destination
Campaign Definition and Campaign Instance lists only human-labeled, previously activated source
Characters from another Instance owned by the same GM whose durable Player identity matches an
active destination Player membership. Import creates a new `in-progress` destination draft with a
new Character identity and provenance; it never moves, links, synchronizes, or auto-approves the
copy. The private nullable Prisma draft `sourceSheet` stores a detached original imported document;
it is not a client-editable field or a new public domain resource. Activation retains its unknown/private
fields, overwrites the authoritative reviewed identity/binding/content fields, and removes stale
optional biography/grants and nested sourceSheet metadata before applying current values. Repeated
imports do not accumulate nested source snapshots. The unscoped `/character-drafts` HTTP API has been removed.

The owning GM can also edit an in-progress draft beneath
`/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId/draft`,
including rolling Attributes and submitting for review. These operations authorize the actual GM,
retain the Player membership binding, and use the same revision and immutable-review checks as
Player editing. GM edits record the GM as audit actor. Partial saves may omit required choices.
Submission and approval require Background, Profession, valid Attribute allocation and three distinct
image assets. Heritage is no longer required or offered by the creator; existing optional Heritage
fields remain readable for compatibility, and `CharacterState.heritage` is optional.

`BackgroundComponents.modifierGrants` authors bounded `ModifierGrantDefinition` recipes for backstory
benefits. The World Background editor offers permanent rolled-once increases, per-check dice and
Skill proficiency grants using the same editor/validation as Profession benefits. Grant IDs are unique
within the Background. `ModifierGrantSource` accepts `{kind: "background", definitionId}` for explicit
provenance. Initial activation acquires captured Background grants, its explicitly granted Skills,
and the selected Profession's explicit character-creation starting tier. It never guesses a tier.
`CampaignInstanceCharacterSheet.modifierGrants` optionally stores the acquired results. Flat grants
use server-generated dice once; per-check/proficiency recipes stay unrolled. Exact imported source
and full recipe matches retain their original event, identity, active state and rolls; changed recipes
acquire new results, and deselected sources contribute no grant. Background choice previews show
the captured recipes without adding unrolled dice to the base Attribute scores.

`equipmentAssignments` is an optional Item-definition-to-slot-key map in Character creation API,
draft state and activated sheet output. It persists in `CampaignInstanceCharacterDraft.equipmentAssignments`
as JSON (empty object for existing drafts). Every assigned Item must be in `startingEquipmentIds`,
its occupied slot set must match one captured compatible set, and all slots must be captured and
unoccupied by another Item. Multi-slot sets are atomic; Items without assignments are carried.
Activation and one-way import retain the map. This is creation equipment intent; it does not create
runtime Item instance IDs. No new domain resource mapping is introduced.

Character options expose captured equipment slots, Item compatible slot sets and image references,
Background modifier recipes, and the owning World Definition link. Legacy Item slot spellings are
resolved to captured equipment-slot keys. Missing captured definitions require publication and
explicit capture migration; never substitute live World data into a Character sheet.

The draft API/persistence field `imageAssetIds` accepts `portrait`, `overheadToken`, and
`paperDollToken` references to image assets owned by the actor or scoped to that Character draft.
`paperDollToken` is labeled Side-on token in the UI. The GM action at `.../draft/artwork` takes one of
these roles (legacy `.../draft/portrait` defaults to portrait). Portraits use an opaque 1024×1536 image;
overhead and side-on tokens use transparent 1024×1024 images with distinct camera requirements shared
with Creature generation. Both token roles are strictly isolated map-position markers: only the body
and explicitly described worn/held equipment, with transparent pixels outside their silhouette.
Occupation and backstory must not invent props or decoration (a blacksmith does not get an anvil,
forge, workshop, or sparks). Exclude detached props, scenery, ground lines, bases, shadows, and effects.
These constraints override scene suggestions in authored briefs. Each generated asset has `character-draft` scope and Character ID as scope ID.
Generation returns a preview without changing the draft; explicit selection and revision-checked save
attach it. The shared process-local idempotency/rate gate and generation audit apply to all roles.

Invitation acceptance never claims a profile by heuristically matching recipient contact data. An
invitation is bound to a known User only when the GM explicitly selects that Player profile;
contacts can detect a collision but never select identity. Otherwise acceptance creates a new User
and an internal provider association. It creates a Player profile only for the `player` role.
`CharacterState.ownerMembershipId` is a `CampaignInstanceMembershipId`; the deprecated
singleton-Campaign membership identifier is not valid Character ownership.

`CampaignMembership`, `PlayerCampaignMembership`, and `NonPlayerCampaignMembership` remain
deprecated compatibility contracts because their `CampaignId` association conflates definition and
runtime scope. Existing migration tools may continue to inspect them, but new work uses Campaign
Instance contracts. `CharacterCreationDraft` is no longer one of those compatibility contracts.

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
illustration scale; it is not a headshot. `overheadToken` must use a strict orthographic plan view with the camera directly above,
looking vertically straight down at 90 degrees to the ground plane, with zero tilt or offset.
Three-quarter, isometric, and oblique token views are not suitable for overhead maps.
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

`EquipmentSlot` is the stable namespaced key of a vocabulary option in the applicable captured
Model Schema, such as `aow:equipment-slot-main-hand`. Core keys are editable seed content, not a
closed union. Custom slots such as Wings participate through the same contract.

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

### Internal legacy armor-generation contract

The retained, non-routed armor generator runs `create-armor.md` once for each
of `head`, `chest`, `arms`, `hands`, `legs`, and `feet`. Each model response is exactly one armor
`ItemDefinition`. The API supplies the authoritative world, creature, target slot, and user context;
then assigns authoritative IDs and source metadata, renders and stores each definition's inventory
image, persists a definition and inventory instance, equips it in the requested slot, and derives
the creature's defense contribution from the persisted armor dice. Generated JSON must not contain
an `ItemInstance`, equipment state, or creature defense contribution.

### Internal legacy item-generation contract

The retained, non-routed item generator combines `create-item.md`, the complete domain guide, the
authoritative root-world record, and user direction. It returns and persists exactly one
`ItemDefinition` in the `definitions` resource with `kind: "item"` and authoritative
`extensions["aow:worldId"]`. It also renders `extensions["aow:image-brief"]`, stores the result, and
sets the required authoritative `image` metadata. This catalog workflow does not create an
`ItemInstance` or put a copy in an inventory. IDs, keys, source metadata, and world ownership are
normalized by the API.

Its internal image-regeneration operation replaces only the stored inventory image for
an existing world-owned `ItemDefinition`. It uses the definition's description and saved
`extensions["aow:image-brief"]`, atomically replaces the definition's `image` metadata, removes the
previous media asset after a successful replacement, and removes the new asset if persistence
fails. It does not change item mechanics or create an `ItemInstance`.

The retained, non-routed weapon generator combines `create-weapon.md`, this guide, the authoritative
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
  characteristics. A Background Definition is World-authored content governed by the captured
  `aow:background` Model concept.
- `feat`: category, prerequisites, repeatability, traits, and choices.
- `heritage`: short description, paired beneficial/harmful modifiers, skill-proficiency and
  discipline-access grants, choices, and prerequisites. Heritage is any formative influence fixed
  at character creation, including regional industries, cohorts, families, clubs, and institutions.
- `profession`: ordered expertise tiers expressed as adopted Profession Rank option keys,
  acquisition rules, action progressions, prerequisites, choices, and mutual exclusions. A
  Profession Definition is World-authored content governed by the captured `aow:profession` Model
  concept; its ranks must resolve through that same exact model release set.
- `monster`: physical classification and aliases, creature statistics, defenses, senses,
  communication capabilities, actions, disciplines, gear, and encounter data.
- `item`: category, physical/economic properties, equipment/container rules, rarity, primary
  operating basis, understanding, attunement-as-synchronization, weapon/armor/tool/vehicle data,
  armor defense dice, capacity,
  traits/actions/modifiers, and crafting.
- `discipline`: one shared band, function tags, one primary operating basis, understanding, observed
  phenomenon, activation time, range/targets, inputs, duration/sustained operation, prerequisites,
  outcomes, scaling, training/source compatibility, and related skill definition IDs.
- `skill`: optional default Attribute option key. Skill identity supplies its stable ID, key, name,
  description, source, and tags; all other domain records reference the skill definition ID. A
  Skill Definition is World-authored content governed by the captured `aow:skill` Model concept,
  and any default Attribute must resolve through that same exact model release set.
- `hazard`, `trap`, `disease`, `poison`, or `environmental-effect`: detection/disarm tests,
  predicate-triggered effects, reset duration, and severity.
- `language`: script and rarity.
- `table`: optional dice roll and ranged/weighted entries.
- `custom`: namespaced custom kind, optional schema definition, and JSON data.

Authoring validation is owned by the concrete domain classes. `ItemDefinition` validates its
prerequisites and modifiers, attunement prerequisites/flags, capacity maximum and recharge
(`DiceExpression | NumericExpression`), and crafting time/cost/ingredients/tool requirements/
produced Items. Crafting ingredient quantities are scalar expressions; time and produced
quantities are numeric expressions. Ingredients may use an Item reference, a tag, both, or neither
according to the existing optional fields; do not invent an exclusive-or requirement.

`MonsterDefinition` owns the catalog `kind: "monster"` and validates `MonsterComponents`,
including each embedded Trait/Action collection through the respective child entity. This is
separate from governed World `kind: "creature"` and its numeric `skills` map: catalog Monsters
use `{skillDefinitionId, bonus}[]`. Speeds/restrictions, damage adjustments, senses, communication,
and Discipline source expressions are authored structure; no runtime evaluation is implied.
`CharacterDefinition` owns catalog `kind: "character-template"` Choices/Options/prerequisites,
Traits, and the existing standard-array, point-buy, roll, and custom attribute-generation variants.
It remains separate from flat World NPC templates and runtime Characters.

`ProfessionDefinition` owns recursive authoring validation for tiers, advancement windows and
cost expressions, benefits (rule modifiers, Trait references and resource maximums), acquisition,
Action progressions/improvements, UsageLimits, prerequisites, Choices and mutual exclusions.
Profession ranks remain adopted namespaced option keys; repeated order/tier identities are invalid.
Empty order/tier collections and missing nested ranks remain unresolved drafts; draft upsert still
requires exact Model conformance and validates every supplied rank against adopted options.
`BackgroundDefinition` validates Attribute option keys, proficiency/equipment/Feat/feature
references, language counts, characteristic string lists and nested Choices. Existing Model-backed
modifier grant validation remains separate from rule modifiers in both owners.

`FeatDefinition`, `HeritageDefinition` and `DisciplineDefinition` also validate their known nested
rules through the same shared grammar. Feat delegates embedded Traits to their owning class;
Heritage keeps nonempty balanced pairs and distinct pair identities; Discipline composes Action
costs, targets, Duration, Outcome Effects/predicates and scaling expressions. These validation
capabilities do not imply dedicated authoring entry points for these three resources. Missing
nested required values are repairable unresolved drafts; supplied malformed values are invalid.
Unknown imported rule discriminants and private extensions remain opaque and preserved.
Reference syntax validation does not assert that a referenced definition exists or implements
runtime acquisition, advancement, grants, discipline execution or choice selection.
For these five character-option owners, draft snapshot saves reject newly malformed fields and
preserve unchanged inherited fields. Their existing publication Condition-link projection and
Profession/Background Model/grant policy remain unchanged; broader publication policy is deferred.

These entities preserve private/unknown JSON and optional omission during serialization. Missing
required rule values are unresolved diagnostics; malformed supplied built-ins are invalid.
The World draft adapter consumes Item mechanics, catalog Character and Monster diagnostics,
rejecting invalid supplied structure while allowing incomplete drafts. During draft edits,
unchanged inherited malformed B02 fields remain preserved; changing those owner fields requires
valid supplied structure. Publication snapshots have no draft-baseline exemption. Unknown rule tags and
custom payloads retain the shared preserved-only extension boundary. Reference target existence,
publication policy, runtime evaluation and the remaining owner migration are separate work.
Resource storage remains `definitions`; no new persisted resource or common type is introduced.

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
- `SkillComponents.modifierGrants` uses the same reusable grants as profession tier benefits.
  Award them once on acquiring the Skill and record `source: {kind: "skill", definitionId}` in
  `CreatureState.modifierGrants`. A Skill's own check-dice benefit does not reacquire the Skill or
  recursively grant more modifiers; it contributes dice only to that Skill's checks.
  Optional `associatedProfessionIds` are distinct World Profession Definition references describing
  typical learning contexts. They do not grant the Skill automatically or impose prerequisites.
  World publication verifies that these references resolve to member Profession Definitions.
- `ModifierTarget` also supports `{kind: "speed", movementMode: MovementMode, unit: DistanceUnit}`
  for rolled-flat grants. The stored total adds distance to an existing movement speed in the
  declared unit; it does not grant a new movement mode. Units are foot, mile, square, hex, meter,
  or kilometer. Consumers must normalize compatible units before summing and must not infer a
  grid-to-distance conversion. Speed remains a flat value; per-check dice cannot target it.
  `SkillDefinition` validates association-list shape and delegates recipe validation to `Modifier`
  at save and publication. Both Skill and Profession schemas remain compatible with older omitted grant lists.
  These fields use existing Definition JSON storage; no resource mapping or SQL table is added.
- `ModifierGrantDefinition` is the reusable additive grant contract, separate from legacy
  `RuleModifier` expressions. `ProfessionTierBenefits.modifierGrants` holds grants awarded once
  when a tier is entered; earlier tier grants remain active. Missing grants mean an empty set for
  older content, not an automatic bonus. Grant IDs are unique across the source Definition's tiers.
  `stacking: "add"` is mandatory: sum flat contributions and concatenate dice from all distinct
  active grants, including multiple grants targeting the same attribute, Skill, or roll.
- A `rolled-flat` grant has a target and dice recipe; roll it once at acquisition and persist its
  result. Targets are `{kind: "attribute", attribute: NamespacedKey}`, `{kind: "health-maximum"}`,
  `{kind: "statistic", key: NamespacedKey}`, `{kind: "skill-check", skillDefinitionId}`, or
  `{kind: "roll", roll: "hit" | "defense" | "damage"}`. Health grants increase maximum health;
  they do not implicitly heal. Attribute and statistic keys resolve against the captured Model.
- `roll-dice` adds its dice to each hit, defense, damage, or Skill check. `skill-proficiency`
  exclusively targets a Skill check and grants additional dice, not a boolean proficiency flag
  or a fixed proficiency bonus. This does not define the base Skill check mechanic.
- Each recipe uses `dice: [{count, sides}]`: 1–32 groups, 1–100 dice per group, and 2–10,000 sides,
  all integer values. No rolls occur during authoring or preview. Flat authoring recipes specify
  dice rather than a predetermined constant; a +4 flat benefit is an acquired roll result.
- `CreatureState.modifierGrants` (also inherited by CharacterState) stores `GrantedModifier`
  instances with a unique instance ID, `active`, `grantedByEventId`, source, and captured definition.
  Sources are Background (`definitionId`), Skill (`definitionId`), profession (`definitionId`, `expertise`), equipment (`definitionId`, `itemInstanceId`),
  or other (`definitionId`, `instanceId`). Flat resolution is `{kind: "flat", rolls: [[4]], value: 4}`;
  faces must match the recipe and the total must equal their sum. Dice/proficiency resolution is
  `{kind: "per-check"}`. Retry the same actor/source/grant/event using its existing instance;
  never reroll on reload, recalculation, source edits, or reactivation. Different source instances
  contribute independently. Deactivation removes a contribution without deleting its rolled result.
- These are embedded JSON fields in existing Definition and Creature/Character state resources;
  `domain-resource.ts` mappings remain unchanged. The private Character draft `sourceSheet` column
  is the additive B08 import-preservation migration; acquired grants remain embedded JSON. No published snapshot is rewritten.
  Common `isModifierGrantDefinition`, `isGrantedModifier` and collection helpers remain for
  browser/runtime compatibility. World saves and publication use `SkillDefinition` and `Modifier`
  entity validation to reject malformed Skill, Profession and Background grants. Profession and
  Background editors use dedicated grant list/Add/Edit contexts, including multiple dice groups
  and named World Attribute/Skill targets. Saving a grant persists the owning Definition through
  a revision-pinned World draft write; Cancel leaves the saved list unchanged. Profession tier
  creation, reordering and removal synchronize the parallel expertise order without replacing
  unrelated child or private data. Grant execution,
  roll aggregation, and profession balancing are separate work: authored grants do not by themselves
  activate bonuses in gameplay.

Blacksmith example (inside its Apprentice tier's `benefits`):

```json
{
  "modifierGrants": [
    {
      "id": "forge-strength",
      "label": "Forge strength",
      "kind": "rolled-flat",
      "target": { "kind": "attribute", "attribute": "aow:attribute-might" },
      "stacking": "add",
      "dice": [{ "count": 1, "sides": 10 }]
    },
    {
      "id": "heavy-blow",
      "label": "Heavy blow",
      "kind": "roll-dice",
      "target": { "kind": "roll", "roll": "damage" },
      "stacking": "add",
      "dice": [{ "count": 1, "sides": 4 }]
    }
  ]
}
```

The example illustrates the contract, not an automatic change to the seeded Blacksmith's balance.

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

### Movement rules: executable preview prototype

Architectural target: all gameplay is defined by event-triggered rules, conditions over available
game state and event context, and ordered effects which may trigger further rules. A rule-free World
is inert. See the canonical architecture map and `docs/age-of-wonders-rules-engine-design.md`.
The implemented preview below does not yet fulfill that target: its implicit baseline movement,
fixed paths, and hard-coded budget checks are prototype behavior, not authoritative gameplay policy.
Do not use it as a Session movement executor. The separate captured `WorldRule` runtime is described below.

`packages/common/src/types/movement-rules.ts` defines the initial executable subset of the broader
prospective rule vocabulary. `MovementRule` is currently an **in-memory preview contract**, not a
persisted Definition, World snapshot resource, Action Declaration, or Session proposal. There is
no new mapping in `domain-resource.ts`. Do not generate these records into existing resource tables
or claim that World publication or Session approval executes them.

A rule contains `id`, `name`, optional `description`, lifecycle `state` (`enabled`, `disabled`, or
`archived`), exact trigger `aow:movement.declared:v1`, optional `condition`, and 1–16 `modifiers`.
IDs are internal references; display `name`. Names, identities, descriptions, and prohibition
reasons are bounded to 500 characters. Descriptions may be empty; names and reasons may not.

`MovementRuleValue` reuses the `constant`, `path`, and `arithmetic` shapes from NumericExpression.
Only `baseMovementCost`, `availableMovement`, and `difficultTerrainSegments` paths are allowed.
All distances are feet. The host supplies finite nonnegative costs and available movement, and a
nonnegative safe-integer segment count. These are aggregate preview facts, not a route or trusted
client authorization. Actor-state paths and schema field references are not implemented yet.
Arithmetic is binary `add`, `subtract`, `multiply`, `divide`, `min`, or `max`. No fallback, dice,
lookup, custom function, collection traversal, or other expression member is executable.

`MovementRuleCondition` permits `always`, `never`, `all`, `any`, `not`, and numeric `compare` with
`eq`, `ne`, `lt`, `lte`, `gt`, or `gte`. An omitted condition always matches. Boolean groups require
1–32 children. Validation permits at most 256 expression/condition nodes per rule and depth 12
(root depth zero); unknown fields are rejected as well as unsupported union members.

Numeric modifiers target only `movementCost` and require `value`. Operations are `add`, `subtract`,
`multiply`, `divide`, `set`, `minimum` (floor: max of baseline and value), and `maximum` (ceiling:
min of baseline and value). Capability modifiers target `movement`: `allow` has no value;
`prohibit` requires `reason`. Allow never bypasses available movement. Add/subtract compose from
a shared baseline; other multiple numeric writes conflict. Allow/prohibit conflict. Invalid
arithmetic or negative cost conflicts, with invalid isolated candidates explicitly marked
`valid: false`. Each matched rule is isolated before composition so another rule cannot rescue an
invalid rule. Runtime condition failures and invalid inputs fail closed with blocked diagnostics.

`previewMovementRules` accepts unknown inputs and validates before execution, for at most 64 rules
with distinct identities. It returns `MovementRulePreview`: `status` (`unchanged`, `adjusted`,
`blocked`, `conflicted`), `baseline`, optional `outcome`, `considered` traces, isolated `candidates`,
and `diagnostics`. Outcomes carry `movementCost`, `allowed`, and human-readable `reasons`.
Conflicted previews have no combined outcome; every matched rule is shown as an isolated candidate,
without combining other rules into it. Traces preserve internal rule references, names, match
results, and numeric condition explanations. This is GM-only diagnostic material until explicit
player projections exist. Returned values are readonly contracts, not persisted immutable history.

The proof rule uses a comparison of `difficultTerrainSegments` greater than constant 0 and an `add`
modifier whose arithmetic value multiplies constant 5 by that path. A base cost of 10 with 2 segments
becomes 20, blocked if available movement is below 20. Preview is deterministic and performs no I/O,
state mutation, authorization, snapshot selection, clock access, or persistence. World authoring,
provenance, publication/migration validation, declaration/decision idempotency, runtime concurrency,
and Session audit remain integration work.

## Isometric terrain (source authoring and immutable chunk capture)

`packages/common/src/types/isometric-terrain.ts` declares spatial values used by the pure geometry
and authoring helpers in `packages/common/src/spatial`. The initial GM editor uses these values;
Instance actor setup and Player Character binding are implemented below. Participant gameplay, movement, and rules-driven visibility remain pending.

`WorldLocationDefinition.map: LocationMap` is the persisted source map selection.
`LocationMap` is `{ kind: "image" } | IsometricTerrainManifest`. The isometric branch has
`kind: "isometric"`, `formatVersion: 1`, dimensions, five-foot `cellSize`, `chunkSize: 16`, materials,
and `chunks: readonly { address: TerrainAddress; contentHash: string }[]`. Each hash is lowercase
64-character SHA-256 of the canonical chunk payload. It must resolve to a captured component whose
address and content match, and the fully hydrated volume must validate. Empty maps have no chunks.
A `locations` record remains the aggregate owner. Snapshot-only `location-terrain-chunks` records
use the content hash as `sourceId` and an ordinary `TerrainChunk` as `payload`. They are deliberately
absent from `apps/api/src/domain/domain-resource.ts`'s generic CRUD registry. Do not invent these
hashes, register a competing Map aggregate, or embed inline cells in a Location manifest.

GM-owned endpoints below are relative to `/worlds/:worldId/atlas/locations/:locationId`:

| Operation               | Route and contract                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Stage a chunk           | `POST /map/chunks`: `expectedDraftId`, `expectedStorageRevision`, and `chunk`; returns canonical `contentHash` and address |
| Save source map         | `PUT /map`: `SaveLocationTerrainRequest` with expected draft identity/revision, `operationId`, and `map`                   |
| Read hydrated terrain   | `GET /map`: authorized complete `IsometricTerrainVolume`                                                                   |
| Read one captured chunk | `GET /map/chunks/:contentHash`: requires that exact chunk to be referenced by this Location's active draft map             |

`WorldTerrainUpload` is draft-scoped staging; it is not published terrain. `WorldTerrainSave` records
request hashes and revisions for idempotent saves. The save transaction advances the World draft,
updates the Location identity revision and map, captures all reachable chunk records, invalidates
validation, writes its receipt, and removes consumed uploads. Missing/invalid chunks and stale
revisions cannot partially apply a map. Replaying the same operation does not advance state;
reusing it for a different request is rejected. Draft deletion cascades both staging and receipts.
Abandoned uploads are removed after 24 hours during subsequent uploads, with a staging count cap.
Published snapshots contain actual chunk payloads and do not depend on staging lifetime. Forks
preserve chunk hashes/content. Ordinary Location mutations preserve `map`; generic draft saves
preserve server-owned chunk components and cannot submit replacements. Draft responses omit chunk
buffers so ordinary edits need not resend the whole terrain.

`IsometricTerrainVolume` is the working value: `kind: "isometric-terrain"`, `formatVersion: 1`,
`dimensions: { x, y, z }` (integer counts 1–100), `cellSize: { value: 5, unit: "ft" }`, `chunkSize: 16`,
`materials`, and sparse `chunks`. X/Y are horizontal and Z is up. Each occupied chunk has an integer
`address` in chunk units and `cells`. Cells use `offset = localX + 16*localY + 256*localZ` in 0–4095.
The last partial chunk cannot contain cells beyond the map dimensions. Empty chunks are omitted;
absent cells are air. Chunk addresses, cell offsets, palette keys, and opening identities must be
unique in their respective scopes. A volume has one to 256 material references.

`TerrainMaterialReference` contains `key: NamespacedKey`, positive integer `revision`, human `name`,
and `terrainType: NamespacedKey`. It identifies one versioned palette entry, not texture data or a
media URL. Every cell's `materialKey` must resolve in this palette. Changing a selected cell's
material changes its associated terrain type while preserving all geometry and opening fields.
Built-in revision 1 keys `terrain:grass`, `terrain:dirt`, `terrain:sand`, `terrain:rock`,
`terrain:wood`, and `terrain:stone` resolve through the web renderer's immutable local PBR registry;
`terrain:water` uses procedural ripple normals and transparent shading. The bundle includes pinned
source/delivery checksums and CC0 provenance in `apps/web/public/terrain/v1/sources.json`.
These are application assets, not new generic domain resources or MediaAsset records. Unknown keys
or revisions render neutral surfaces; the renderer must not substitute the newest material revision.
The custom uploaded material/media asset contract remains pending.

`TerrainCell` also has `shape: TerrainShape`, optional `smoothing` (0–1, visual only), and optional
`opening`. `TerrainShape.top` is a tuple of four heights ordered 00, 10, 11, 01. Heights lie in 0–1,
quantized to sixteenths; all-zero shapes are invalid. X/Y upper corners stay fixed; bottom corners
stay at zero. `diagonal` is `"00-11" | "10-01"`. A cube has `[1,1,1,1]`; a ramp `[0,1,1,0]`;
a ridge and valley both have `[1,0,1,0]`, with high `00-11` and low `10-01` diagonals respectively.
Quarter-turn helpers rotate corner heights and diagonal together. Persisted orientation is baked
into the shape rather than stored as a redundant shape rotation field. Nonuniform heights classify
the shape as difficult terrain; this is a geometry fact, not a movement cost or automatic effect.

`TerrainOpening` has `id`, integer `facing` 0–3, and `frameThickness` from 1/16 to 7/16 of a cell.
Its discriminated state is either `{ kind: "door", state: "open" | "closed" | "locked" }` or
`{ kind: "window", state: "open" | "closed" }`. An opening requires a full-height cube and zero
smoothing. The GM editor can apply/remove openings on selected cube cells, set initial state/facing/frame
thickness, and undo those edits while preserving existing opening identity. It renders procedural
frames, retracting door panels, locked crossbars, and closed-window glass. This is authoring
presentation only; runtime lock actions, transmission, and rule-produced transitions are not implemented. `terrainSolidTriangles` and
`intersectTerrainShape` operate on a shape's closed solid, not on door/window apertures, and cannot
serve as the final gameplay sight implementation for openings.

`TerrainAddress` denotes integer cell/chunk addresses or dimension counts according to its containing
field. `TerrainPoint` denotes a continuous local geometry point. Neither extends the existing
normalized image or geographic coordinate union. `TerrainRegion` has inclusive `minimum` and
`maximum` cell addresses. `TerrainCellWrite` has an `address` and `cell` without a chunk offset;
`cell: null` erases exactly that address. `applyTerrainWrites` validates the whole result before
returning a new volume plus inverse/redo writes; it performs no storage, authorization, revision
check, actor relocation, or gameplay effect. Selection editing supports disconnected addresses at
any elevation, deduplicates selection membership, and skips air. Removing terrain never deletes
actors or neighboring levels.

`TerrainGenerationSettings` contains:

- `version: 1`, unsigned 32-bit integer `seed`, and `preset: "plains" | "rolling-hills" | "mountains"`.
- Inclusive `region`, `minimumElevation`, `maximumElevation`, and `baseElevation`, in grid units,
  quantized to sixteenths and contained within the region's lower edge and upper surface boundary.
- `featureSize` (2–100 cells), `roughness` (0–1), a palette `materialKey`, and
  `mode: "fill-empty" | "replace-region"`.
- Optional `mask`, an exact list of writable cell addresses inside the region, including air.
  Missing mask means the whole region; an empty mask produces no writes.

Version 1 uses seeded multiscale coherent noise, preset weights, and a squared-magnitude bias
favoring elevations near the base. It fills supported columns with one sloped top block; when
corner elevations cross block levels, closed side faces form contour cliffs. It does not create
caves, simulate erosion, or perform a neighborhood-relaxation pass. `generateTerrainPreview` returns
writes and created/replaced/removed/skipped counts without changing the input. Fill Empty preserves
occupied cells; Replace Region may replace openings and erase existing cells above the generated
surface, but never modifies addresses outside the region/mask. Deterministic output requires the
same settings and source volume. Helpers remain synchronous; the initial editor invokes generation
in a cancellable worker, checks the draft revision before Apply, and saves ordinary generated cells.
Persisted generation provenance and the full set of generation controls remain pending. Play will
consume captured cells rather than regenerate them.

Example **working value only**, not a Location API payload:

```json
{
  "kind": "isometric-terrain",
  "formatVersion": 1,
  "dimensions": { "x": 100, "y": 100, "z": 100 },
  "cellSize": { "value": 5, "unit": "ft" },
  "chunkSize": 16,
  "materials": [
    {
      "key": "terrain:grass",
      "revision": 1,
      "name": "Grass",
      "terrainType": "terrain:grass"
    }
  ],
  "chunks": [
    {
      "address": { "x": 0, "y": 0, "z": 0 },
      "cells": [
        {
          "offset": 0,
          "materialKey": "terrain:grass",
          "shape": { "top": [1, 1, 1, 1], "diagonal": "00-11" }
        }
      ]
    }
  ]
}
```

Example persisted empty isometric map (the required `map` field on a source Location):

```json
{
  "kind": "isometric",
  "formatVersion": 1,
  "dimensions": { "x": 100, "y": 100, "z": 100 },
  "cellSize": { "value": 5, "unit": "ft" },
  "chunkSize": 16,
  "materials": [
    {
      "key": "terrain:grass",
      "revision": 1,
      "name": "Grass",
      "terrainType": "terrain:grass"
    }
  ],
  "chunks": []
}
```

The editor renders built-in textured terrain, procedural door/window apertures, and its preview actor.
Selection smoothing applies the existing 0–1 strength as shared area-weighted normal blending across
chunk/material boundaries; it moves no vertices and excludes openings. XY/XZ/YZ work planes support
placement and selection, with slicing along the fixed axis. Color/normal/roughness maps use the same
material on all faces. Texture quality (1K, 2K, or untextured) is local presentation state, not a new
persisted domain field. Custom texture assets, geometric edge rounding, and runtime actor visibility
remain pending. It is not an authorized player map renderer.

### Implemented actor terrain setup and participant binding

`CampaignInstanceCreatureStateOverlay.terrainPosition?: TerrainPoint` stores an actor's feet in
continuous grid units, with X/Y horizontal and Z up, at its `currentLocationId`. It is an Instance
runtime overlay, never a source Creature field or normalized image coordinate. The containing
runtime's captured Campaign/World pair determines the map; source draft terrain is never consulted.
Coordinates must be finite within 100-cell global bounds. A position requires a captured Location;
API validation also resolves that Location's captured isometric manifest/chunks, checks exact map
bounds, and requires a terrain support surface. Openings are not treated as support surfaces.
Actor body clearance, occupancy, and sight remain pending rule decisions. The reviewed GM movement path now evaluates authored cost and point-route geometry conditions.

`PUT /campaigns/:campaignDefinitionId/instances/:campaignInstanceId/creature-embodiments/:actorId/position`
accepts `PlaceCampaignInstanceActorRequest`: `expectedRuntimeRevision`, `locationId`, and `position`
(`TerrainPoint` or explicit `null` to remove placement while retaining the current Location).
It is GM-owned Instance setup, uses the existing audited revision transaction, advances Creature
identity version and runtime revision, and is blocked while a Session is active. It cannot be used
as a player movement action. `CampaignInstanceCreatureEmbodimentProjection` now exposes optional
`currentLocationId`, resolved `currentLocationName`, and `terrainPosition`; its list also exposes
optional `terrainLocations` with human names. No new resource mapping or database table is added:
these values remain in `CampaignInstanceRuntime.state.creatureEmbodiments[].creature`.
Captured-pair runtime validation checks support, so incompatible map changes are rejected rather
than silently relocating actors.

`GET /me/campaign-instances/:instanceId/sessions/:sessionId/spatial` returns
`ParticipantSpatialBinding`. It requires an accepted, selected Session participation and active
membership/Player standing. Only the Player role in an active Session resolves an actor. The server
uses that membership's active Character association and exactly one matching Character embodiment;
it accepts no client-selected observer identity. Missing, duplicate, unplaced, or invalid actors fail
closed. This is a binding/readiness endpoint, not a playable map projection.

The result is either `{ status: "unavailable", reason: "not-player" | "session-inactive" |
"no-active-character" | "actor-unplaced" }` or `{ status: "awaiting-visibility", runtimeRevision,
actor: { name, position } }`. It sends no terrain chunks/materials, other actors, runtime extensions,
source identities, or GM notes. The participant page displays the binding status and clears stale
binding data on failed authorization or Session changes. Actual actor-centered gameplay rendering,
GM random focus/switching, player-facing movement, fog/LOS projection, and camera terrain fading remain
pending. GM-reviewed rule effects now change Instance positions through the separate movement endpoints. Never infer player map access from a successful actor binding.

### Internal sight geometry and surface projection

`terrainOpeningParts` supplies canonical frame/panel/glass triangles shared by the GM renderer and
`createTerrainSightIndex`. The latter owns a validated volume copy, indexes occupied cells, caches
up to 4,096 cell meshes, and reports finite-segment surface contacts in grid-unit distances plus
strict starting-volume interiors. Grid boundary ties visit all touched cells; coplanar grazing is
conservative with a 1e-9 geometry tolerance. Sloped tops use canonical triangles; visual smoothing
has no effect. Traces reject nonfinite endpoints, coordinates beyond ±1,024, and zero length.
These are geometry capabilities, not a default sight policy. A closed window reports glass facts;
it does not automatically transmit or block sight. Captured rules must supply that decision.

The API-internal `projectAuthorizedTerrain` requires an evaluated decision matching Campaign Instance,
snapshot, runtime revision, Location, and observer. It validates surface grants against canonical geometry,
requires the selected actor, and explicitly constructs approved triangle/actor/material fields.
It strips unapproved surfaces, cell/opening state, source extensions, and palette labels. Missing,
stale, or invalid grants yield `awaiting-visibility`; malformed source volumes are validation errors.
The gate is not a public request contract and must never accept client-provided visibility grants.
Every future visibility-affecting mutation must advance the runtime revision. Exploration persistence
now composes this gate as described below; a rules evaluator and participant renderer remain pending.
Do not generate these internal query results as authored domain records.
`ParticipantSpatialBinding` remains the only implemented participant spatial DTO.

### Observer exploration snapshots (internal values and dedicated persistence)

`packages/common/src/types/terrain-exploration.ts` is the exact contract for these new values:

- `TerrainObservationContext`: `campaignInstanceId`, `snapshotId`, `locationId`, `observerId`, and
  positive safe-integer `runtimeRevision`. The server selects these identities; they are not user
  labels. Snapshot identity is part of the scope, so new captures do not inherit memory implicitly.
- `TerrainExploredSurface`: canonical `key`, `material: { key, revision }`, `treatment:
"terrain" | "glass"`, and a three-point `triangle` in grid units. Material revision belongs to
  each surface: remembered and current geometry can reference different versions of the same key.
- `TerrainExplorationObservation`: `context`, authorized `surfaces`, and `absentSurfaceKeys` for
  explicitly observed disappearances. This is an internal evaluated observation, never player input.
- `TerrainExplorationSnapshot`: `formatVersion: 1`, `context`, `visibleSurfaceKeys`, and `surfaces`
  with `lastSeenRuntimeRevision`. It contains no actors, full cells, opening state, labels, or notes.

`parseTerrainExplorationSnapshot` validates versioned JSON, rejecting unknown fields, duplicate or
malformed surface keys, invalid geometry coordinates, invalid material references, impossible
revision relationships, and values over 100,000 surfaces. It returns owned copies in deterministic
key order. `updateTerrainExploration` preserves last-known geometry without querying current terrain,
replaces only observed surfaces, and removes only explicitly observed absent keys. It rejects foreign
scope, backward revisions, contradictory grants, and conflicting same-revision updates; exact retries
are idempotent. Capacity failures reject the whole update, with no eviction or partial mutation.

`projectTerrainWithExploration` composes the existing server redaction gate with these helpers.
The gate's optional `observedAbsentSurfaceKeys` must be explicitly authorized and absent in canonical
current geometry; missing visible grants never imply observed absence. A successful composition
returns `{ status: "ready", exploration, projection }`. `exploration` is server-only storage output.
`projection` contains context, currently authorized actors, `visibleSurfaces`, and `rememberedSurfaces`;
each surface includes its own material reference. Last-seen revisions and disappearance grants are
not included in the participant projection. Missing decisions, invalid/foreign memory, and conflicting
revisions produce `awaiting-visibility` without partial current or remembered data.

These are serializable internal values, not new World records, Instance runtime fields, or endpoints.
`TerrainExplorationSnapshot` is persisted in `CampaignTerrainExploration.payload` as described below;
`apps/api/src/domain/domain-resource.ts` has no generic exploration resource mapping. Do not generate
exploration snapshots as authored content. A captured-rule evaluator and live participant delivery remain pending. Checkpoint-specific recovery
is implemented below. Existing `ParticipantSpatialBinding` and its readiness-only behavior are
unchanged. The surface budget is an implementation limit pending scalable storage, not a change
to the accepted 100³-cell map requirement.

### Exploration database storage

`TerrainExplorationSnapshot` maps to Prisma `CampaignTerrainExploration.payload`. Its composite
primary key is `(campaignInstanceId, snapshotId, locationId, observerId)`; `snapshotId` references
`CampaignInstanceSnapshot`, with a composite foreign key enforcing the owning Instance. The row
also stores `runtimeRevision`, canonical SHA-256 `contentHash`, `createdAt`, and `updatedAt`. SQL
checks require version-one JSON context to match every scope column and revision. This dedicated
derived-state table is not a `DomainRecord` resource and is never generated as authored content.

`TerrainExplorationStore.projectAndStore` is a Nest provider without a public controller. It accepts
an internal `EvaluatedVisibilityDecision`; the future rules executor must bind the participant and
observer and evaluate captured rules before calling it. The service does not accept caller-supplied
terrain, actor lists, or previous memory. A READ COMMITTED transaction locks the Instance runtime
row before reading the current adopted snapshot/revision, captured World terrain, runtime actor
embodiments, and matching stored memory. It validates the payload hash and composes through the
existing redaction/update helpers. Only successful results are upserted; identical retries preserve
timestamps. No projection is returned before commit. Storage errors roll back and propagate;
stale/invalid decisions and corrupt exploration produce no partial projection or write. These
derived writes do not increment gameplay runtime revision and serialize with runtime mutations.

Memory survives reconnects and Session transitions within the same capture. Migration and restore
create a new Instance snapshot and retain historical rows. Migration starts empty exploration;
restore recovers its departure checkpoint as described below. Later or foreign-snapshot knowledge
cannot be reused automatically. This table stores latest memory per scope; the checkpoint child
table stores immutable historical captures. Cross-capture remapping is not inferred. The participant spatial endpoint remains readiness-only until rule
evaluation and Session authority integration are implemented. The additive SQL migration is
`20260918000000_terrain_exploration`; it performs no automatic exploration backfill.

### Checkpoint exploration capture and predecessor recovery

`CampaignInstanceRuntimeCheckpoint` now declares optional `explorationHash` and `explorationCount`.
The matching nullable Prisma columns hold the canonical aggregate SHA-256 and number of observer/map
entries; both are absent/null for legacy unrecorded captures. New checkpoints always have both,
including count zero and the hash of an empty descriptor array. They are supplied at INSERT because
runtime checkpoints are immutable. `CampaignCheckpointExploration` stores `(checkpointId, locationId,
observerId)` as primary key, with `campaignInstanceId`, `snapshotId`, `payload`, and `contentHash`.
Its composite foreign key binds all three owning checkpoint/Instance/snapshot identities. Payload is
an exact `TerrainExplorationSnapshot` at capture time. UPDATE/DELETE are rejected by the database.
The aggregate hashes sorted `{locationId, observerId, contentHash}` descriptors and detects missing
or extra entries. Neither table is a generic `DomainRecord` resource or AI-authored content.

Initial Instance creation seals empty exploration. Migration/restore prepare the seal, insert the
checkpoint, and copy matching memory within the same transaction; source and result captures both
participate in rollback. The Session SHARE lock and Runtime EXCLUSIVE table lock precede all
SERIALIZABLE reads to include exploration commits already in flight. Runtime writers remain excluded
until adoption commits. This global lock is specific to snapshot adoption, not ordinary observations.

The existing direct-predecessor restore resolves `sourceRuntimeCheckpointId` from the adoption audit
whose result is the current Instance snapshot. It never picks the latest exploration rows. Recovery
checks descriptor count/hash, payload hashes and schema, owning scope, revision bounds, and exact
captured World/Campaign snapshot identities. It copies remembered surfaces into the newly created
Instance snapshot, preserves last-seen geometry/material revisions, and clears `visibleSurfaceKeys`.
Memory context revision becomes restored runtime revision minus one, leaving that new runtime
revision available for fresh visibility evaluation. It does not restore live creature visibility,
change observer identities, or replace the existing ongoing runtime-overlay restore semantics.

`CampaignInstanceMigrationPreviewProjection.explorationRecovery?` reports `{status: "checkpoint" |
"not-recorded" | "empty", checkpointNumber?, memoryCount}`. The GM sees a checkpoint number and
plain-language recovery behavior, never its internal ID. Checkpoint identity/hash/count are included
in the internal plan hash and rechecked at apply. Legacy unrecorded checkpoints start empty memory
with a preview notice; corrupt recorded captures abort rather than silently losing knowledge.
Rules, participant authority, and live visibility remain separate and deferred. Migration SQL is
`20260919000000_exploration_checkpoints`, with no historical discovery backfill.

### Unified map orientation authoring

`LocationMapOrientation` is now `LocationImageOrientation | "isometric"`, where
`LocationImageOrientation` remains `"scenic" | "overhead" | "side-on"`. `LocationImage.orientation`
uses the image-only type; image generation still accepts only image orientations. The Location's
`mapScene.orientation` and `WorldLocationMutationInput.mapOrientation` accept all four orientations.

Isometric is selected from the existing Map orientation selector. It immediately exposes a blank
manual terrain editor and optional generation controls. There is no separate Location-level map
feature toggle. Empty terrain manifests with zero chunks are valid and save without generation.
The internal `LocationMap` discriminant still selects the stored representation. Terrain saves
atomically set `mapScene.orientation` to `isometric`; explicit selection of an image orientation
through Location authoring replaces an active isometric manifest with `{kind:"image"}`. Ordinary
Location edits without an orientation change preserve terrain. Existing image assets remain intact.
Legacy isometric manifests lacking orientation metadata resolve to Isometric in the Map UI. No
resource mapping or database migration changes accompany this orientation workflow adjustment.

### GM Session table read projection

`CampaignSessionTableProjection` and recursive `CampaignSessionTablePlot` in
`packages/common/src/types/session-table.ts` describe the GM-only
`GET /campaigns/:campaignDefinitionId/instances/:instanceId/sessions/:sessionId/table`
response. Ownership and all three parent identifiers are checked together; only active or paused
Sessions expose this table. A repeatable-read transaction reads the Instance current captured
Campaign and World snapshots, their immutable revision labels, continuing runtime, and active
Character bindings. Mutable upstream authoring is never consulted. This projection adds no persisted
resource mapping to `domain-resource.ts`.

Optional `locationId` selects a captured Location for local GM viewing only. `focus` distinguishes
`requested`, `starting-location`, `first-available`, and `unavailable`; none declares an active scene,
party location, movement, or saved runtime mutation. Locations include human-readable names, captured
description/image, and verified hydrated isometric terrain when present. Missing or invalid maps
and missing content produce explicit unavailable messages.

`party` is a display collection of active membership Characters and remaining Instance creature
embodiments, not evidence of a persisted party relationship. Each entry resolves human-readable
Character/actor, Player, and Location labels; unresolved references use neutral descriptions. IDs
and keys are UI selection values only and must never become visible labels. Runtime coordinates
are read-only facts about each actor’s own Location; the table currently renders named Location
labels, not gameplay tokens. They must not be used to infer movement or place actors on another map.

`plots` preserves captured recursive Plot hierarchy and exposes objectives, pressures, resistances,
discoveries and truth/belief/rumor statements alongside same-Instance progress. `atFocusedLocation`
marks authored Location context relevance without hiding broader Plot cues. A claim's `revealed`
flag comes only from that Plot progress's `revealedClaimIds`; individual `creatureKnowledge` never
implies global revelation. Unrevealed claims are included solely because this endpoint is GM-only.
Encounter adjudication, authoritative Rules execution, Player/Spectator map delivery, and runtime
mutation remain unavailable; do not generate actions implying this read projection implements them.

### Captured executable World rules and reviewed GM movement

`WorldRule` in `packages/common/src/types/world-rules.ts` is the versioned executable wrapper,
separate from the `MovementRule` modifier prototype and broader prospective `RuleEffect` vocabulary.
`world-rules` is a World snapshot component resource, not generic `rule-variants` CRUD. A wrapper
contains `formatVersion: 1`, stable `id`, human `name`, optional `description`, positive `revision`,
`lifecycle` (`enabled`, `disabled`, `archived`), explicit integer `priority`, versioned namespaced
`trigger`, optional `condition`, ordered `effects`, and server-assigned `audit`. Dedicated World Rules
APIs assign lineage/revisions and creator/time metadata under expected draft identity and storage
revision checks. Publication and migration validate the supported profile and preserve exact captures;
old Worlds contain no implicit rule library. Generic draft saves cannot rewrite executable rules.
World Rules authoring uses separate list, rule, ordered-effect and nested-condition contexts.
These editors retain this strict WorldRule grammar, its dedicated APIs and expected draft/revision
checks; they do not translate it into Action predicates or expand execution semantics. Unsupported
imported structures remain read-only. Successful writes use the returned authoritative collection.

The supported expression profile includes literals/constants, event context, per-event local values,
scoped entity-field reads, arithmetic, and bounded equality-count queries over declared entity types.
Conditions support always/never, all/any/not, and comparisons. The host supplies a `RuleStateView` of
Instance and captured entities plus field types/writability; unknown references fail closed, absent
declared fields read as null, and no host credentials or ambient I/O are available. These contracts
do not imply that arbitrary legacy paths, predicates, effects, or scripts execute. The movement
adapter exposes actor position and numeric resources through canonical fields, omits duplicate
nested actor/progress aliases, and excludes bulk terrain chunks from scalar state; captured terrain
instead supplies bounded geometry facts.

Effects are typed runtime set/increment/point movement, local assignment, event emission, and recorded
dice requests. Lower priority stages run first. Rules in one stage evaluate a shared baseline;
effects within a rule observe preceding effects, and later stages observe merged earlier writes.
Competing attempted writes in one stage fail the whole chain. Unique human rule names determine FIFO
order for independent same-stage outputs; database IDs never resolve conflicts. Every effective field
change emits `aow:state-changed` with before/after and causal rule/effect provenance. Unchanged writes
emit no state-change event. Reserved host fact events cannot be forged by root declarations or emit
effects. Dice requests suspend pure execution until replay supplies the same recorded entropy tape;
retry never silently rerolls an already persisted proposal.

The bounded engine is pure and isolated: no applicable effects means no gameplay change. Failures,
conflicts, exceeded budgets, and missing entropy return the original state without committable writes.
Default ceilings are 128 events, 512 effects, 20,000 operations, causal depth 24, and 2,048 trace entries;
input/output budgets also apply. Emitted-event or recorded-dice chains remain reviewable even without
state writes; local-only evaluation is a no-op. Approval covers an entire root-event chain, not partial effects.

`starterMovementRules` is explicitly adopted through World → Rules, then published and migrated
normally. Its six authored rules initialize missing allowance/count resources, charge geometric
`distanceFeet` plus five feet per sloped support segment, check authored allowance and geometry
conditions, move/debit in order, and react to the position-change event by incrementing the move count.
The host provides bounded direct point-route geometry facts; it does not impose those costs or
traversability policy. This initial profile is not a swept creature-body collision model. Allowance
initialization is authored, not an implicit grant; no automatic turn or Session reset is implemented.
Initializer effects can occur even when the movement rule does not pass: an applied chain alone does
not prove that a position changed.

The actor overlay's `terrainPosition` can now change through approved captured-rule effects as well
as preparation. Authored numeric resource values `aow:movementRemaining` and `aow:moves` persist under
`creature.extensions['aow:rules']`; missing values confer no automatic allowance. The Instance runtime
remains the sole mutable owner. Location/position structure is validated against the captured map.

`SessionMovementRequest`, `SessionMovementDecisionRequest`, `SessionMovementContext`, and
`SessionMovementProposal` in `movement-execution-api.ts` define GM-only movement declarations,
review, and receipts. Context actors expose optional finite numeric `movementRemaining` and
`recordedMoves` read from committed `creature.extensions['aow:rules']` values
`aow:movementRemaining` and `aow:moves`. Absence means not initialized, never an implicit zero or
allowance. The GM Run panel displays these alongside committed position so preview and approval
outcomes can be compared; it never edits or resets these resources directly.
Movement context carries `snapshotNumber` and `runtimeRevision`; interactive
GM maps must match both against the displayed Session table, and select actors by the context
actor identity and matching Location. Table party keys are presentation identities and must not be
used as movement actor identities. Proposal `locationId` identifies the original coordinate space;
rebuilding requires the same actor Location and the viewed map. Legacy receipts resolve this from
their saved evaluated actor state; if unresolved, the field is omitted and rebuilding is unavailable.
A local Location selection does not move actors or authorize
requests against another map. The server selects captured rules and trusted actor/geometry context, records
entropy and the isolated resulting state, and persists them in `CampaignSessionMovementProposal`.
This relational table is scoped to the Instance, Session, and snapshot; it is not a generic domain
resource. Status is pending/approved/rejected/no-op/failed. Request keys are unique per Session;
conflicting reuse is rejected. Approval rechecks active Session, ownership, snapshot, and runtime
revision, then updates runtime, proposal decision, and causal Session journal in one transaction.
Rejection and no-rule outcomes never move an actor. A completed decision retry returns its receipt
without applying effects again; stale pending proposals require a new preview. GM history exposes
resolved names and explanations; raw causal payloads and runtime state remain GM-only. The explicit
GM overview renders real named actors, preserves one actor focus, and picks authored support surfaces
for candidate destinations; numeric controls remain available. Selection and pending markers do not
change runtime. Player map visibility, actor-relative sight, declared-body-height camera anchoring,
full combat, and automatic action execution remain pending.

Campaign Instance migration initializes progress only for newly introduced captured target Plots
(including subplots) and newly introduced Objectives, with `not-started` status and the exact
Instance scope. Migration preview and apply use the same transformation; restore does not initialize additions. Existing statuses and overlays
are preserved; missing progress for an already captured source Plot is not repaired. Explicit
Plot/Objective mappings retain their existing progress, and the complete result must pass target
capture validation before adoption. No actor embodiment or placement is fabricated by migration.
Removed Plot claims and Location contexts may be retired without a replacement only when neither
current runtime nor any target capture payload references their local or scoped identifiers. The
preview still lists these removals; prior snapshots and checkpoints preserve historical resolution.
Referenced removals continue to require explicit mappings. Restore does not use this exception.

### Instance opening Location choices

`CampaignInstancePreparationProjection.locations` is the named Location list from the Instance's
captured World snapshot. Both preparation reads and saves return these choices. The Instance
Overview edits `preparation.startingLocationId` using this captured list and an expected runtime
revision; out-of-capture references remain invalid. The chosen Location is the Session table's
initial view, not a movement command or an automatic actor placement. Definition preparation
supplies defaults on new Instance creation; existing Instances retain their own preparation.
No persisted resource mapping changes are introduced by this projection.

### GM-controlled Session play

`CampaignInstanceSession.gmControlsPlayers` is a persisted Boolean, default false. The
owning GM can set it through Session create/update while planned or in the lobby;
it is fixed once play starts. Session detail exposes `gmControlsPlayers`; participant
projections expose `controlledByGm` for selected Players. In this mode, an accepted,
active GM with a live presence lease covers Player acceptance/presence readiness.
Active Instance membership and active Character requirements still apply. Spectators
and Agents keep their normal gates. No Player login, response, presence lease, or
attendance is fabricated. Existing GM actor controls evaluate captured runtime rules
and record the GM as the actor. Turning the mode off restores normal Player readiness.
The mode participates in the readiness token; revision checks protect mode updates.
The GM Session page automatically establishes and renews the GM’s own presence while this
mode is enabled in a lobby, active Session, or paused Session. Expired connections are
rejoined; an explicit Leave stops automatic reconnection until the GM joins again or
reopens the page. Normal Player presence still requires explicit joining.

## World Codex authoring and collaboration

World Codex Characters are **world-owned NPC templates**, distinct from campaign-instance playable
Characters and realized Creature state. The TypeScript source is `types/world-codex.ts`.
`WorldCharacterTemplate` has an immutable `creatureDefinitionId` referencing a Creature Definition
in the same draft; numeric `attributes` and `skills`; `health` (`current`, `maximum`, `temporary`);
`movement` keyed by walk/run/sprint/jump/swim/climb/crawl/fly/burrow; day/night `vision`; `equipment`
entries `{slot,itemDefinitionId}`; `grantedConditions` entries `{conditionId}`; and optional
portrait/overheadToken/paperDollToken `images` using the existing Creature image contract.
Do not generate campaign-instance ownership fields on these templates.

`WorldEffectDefinition` is an authored reusable numeric modifier recipe, not an `ActiveEffect` or
an executable WorldRule. It contains `modifiers` with unique `id`, `propertyPath`, operation
`add | set | multiply`, finite `value`, optional `unit`, and `allowConditionOverride`.
Each modifier may set its own `duration`, using `{kind:"permanent"}` or
`{kind:"timed",amount,unit}` where the positive amount uses rounds/minutes/hours/days. The Effect-level
`duration` remains the compatibility default for any modifier that omits one; changing one
modifier duration must not change its siblings. Numeric paths are limited to health
(current/maximum/temporary), vision (day/night), supported movement modes, and
`attributes.<key>.value|modifier` or `skills.<key>.value|modifier` declared by a same-World
Creature/NPC numeric map (Skill Definition IDs/keys are also valid skill keys). Arbitrary paths
and references to unknown Attributes/Skills are rejected. `WorldConditionDefinition.effects` contains
`{effectId,modifierOverrides?}`; overrides map modifier IDs to numbers and are permitted only
when the referenced Effect modifier opts in. These recipes do not execute implicitly at runtime.
All three Codex entries have server-owned `id` and positive `revision`, `name`, and optional
`description`. References must resolve inside the same World draft; deleting a referenced recipe
is rejected. These collections are persisted as immutable captured snapshot components and have
list/create/update/delete APIs under `/worlds/:worldId/codex/{characters|conditions|effects}`.
Mutations include `expectedDraftId` and `expectedStorageRevision` for optimistic concurrency.

| Snapshot resource           | Payload                    | Ownership                     |
| --------------------------- | -------------------------- | ----------------------------- |
| `world-character-templates` | `WorldCharacterTemplate`   | World draft/captured revision |
| `world-conditions`          | `WorldConditionDefinition` | World draft/captured revision |
| `world-effects`             | `WorldEffectDefinition`    | World draft/captured revision |

These are dedicated World resources, intentionally excluded from generic `DOMAIN_RESOURCES` CRUD
in `domain-resource.ts`, just like `world-rules`. AI generators must use dedicated World APIs. Generic draft replacement cannot change these
Codex resources; their dedicated service owns identity/revision and World-scoped artwork checks.
Unchanged inherited Character artwork references retain their captured metadata when a fork is edited.
Example Effect: `{"name":"Haste","modifiers":[{"id":"speed","propertyPath":"movement.walk","operation":"add","value":10,"unit":"feet","allowConditionOverride":true}],"duration":{"kind":"timed","amount":1,"unit":"minutes"}}`.
Example Condition effect link: `{"effectId":"<same-world-effect>","modifierOverrides":{"speed":20}}`.

World Location types no longer expose related-Location links. Do not generate adjacency or
travel-connection content; containment is the sole authored Location relationship. Location `grantedConditions` remain part of the authored contract. Creature and Item components optionally carry the same Condition grants.
Creature components additionally support numeric `skills`, `health`, day/night `vision`, and
`equipmentPool` (same-World Item Definition IDs). Item components support `weight`, `cost`, and
private authoring `notes`; `weight` uses the existing Weight contract and cost uses CurrencyAmount
entries. A **World** Item's artwork may be omitted until attached; the generic runtime
`ItemDefinition.image` contract remains required. Omitted fields preserve existing authored data.

`WorldAccessEntry` is relational collaboration metadata (`WorldAccessEntry` table), never a
published World snapshot component. It links an active Player profile to a World with viewer or
editor role and a concurrency revision. The owner manages the roster. Viewers may read shared
Worlds; editors may change draft content. Publication, archival, fork management and access roster
management remain owner actions. Global authentication/GM role is not changed by World sharing.

Numeric Attribute/Skill display modifiers use a midpoint of **50** and steps of **10**, rounded to
nearest with halfway values away from zero: `sign(score - 50) * floor(abs(score - 50) / 10 + 0.5)`.
Examples: 50 → 0, 55 → +1, 45 → -1, 33 → -2, 83 → +3. Display modifiers are derived from stored
scores; do not persist a second independently editable modifier value. World NPC equipment is a
selected Item list: `slot: "carried"` may repeat for distinct Items; real named slots remain unique,
and the same Item Definition may not be selected twice.

B08 equipment uses exact captured Model revisions for labels and the Creature
Definition `components.equipmentSlots` (including an explicit empty list) for
availability. The open slot vocabulary supports authored Wrists; immutable core
release v1 is preserved and is not automatically extended/readopted.


### B10 runtime ownership and operational projections

`CampaignInstance` owns captured initialization, placement realization/decisions, progress patches and activation composition. Decoration suppresses duplicate inherited World placements. Realize/replace preserves stable realization IDs; defer/remove detaches references without destroying physical actors or Items. Objective patches merge by captured objective identity, retaining siblings/private fields. Discovery writes validate captured claim membership, Instance entity identity and the distinction between knows-truth, holds-belief and heard-rumor. Named GM projections expose captured claims, associated Location placements and individual knowledge; IDs remain hidden selection values.

`CampaignSession` owns the current lifecycle, readiness projection and presence policy: original transition/replay rules, captured start/end boundaries, ordered readiness blockers, accepted participation, lease renewal/throttling, attendance and bounded accumulated duration. `InstanceParticipation` owns human membership and Agent status/capability policy. Authentication, standing lookup, invitation delivery, lease credentials, clock/entropy acquisition, active-Session locks, relational CAS and journals remain API adapters. Editing configured/paused Agent capabilities uses old-grant/status CAS and returns the Agent to configured so authorization must be granted again.

`WorldRule` owns structural validation; `RuleExecution` exposes deterministic preview/replay results through command/state$. The existing interpreter still evaluates expressions and stages conflict-checked writes. Movement commits route through Creature/Character commands; no mutable captured record is exposed. There is no production encounter, decision, rest or downtime executor to migrate: their existing legacy value contracts remain preserved, and no combat/time algorithm or competing runtime World is introduced.

Weather changes use the GM-owned active/paused Session boundary, validate captured Location membership, CAS runtime and audit atomically. Local table focus remains viewing state. These changes add JSON fields and projections only: `CampaignInstanceRuntime`, Session, participation and existing rule capture storage remain authoritative. No generic DomainRecord resource or database schema migration is introduced.

## Definition and Model lifecycle ownership (B07)

`CampaignDefinition` owns complete authored content plus its Plot/placement records,
preparation (including per-Location canvas configuration), captured membership and
publication diagnostics. Draft replacement preserves incomplete/private content and
reports nonblocking draft diagnostics; exact publication validation remains required.
Forking rewrites Campaign-owned identities and references while retaining the captured
World and unknown/private fields. World reference rewriting preserves the existing
registered-reference grammar, including Skill keys/property paths and terrain capture
identity. Neither operation changes already published content or source drafts.

`DefinitionLineage` owns active/archive transitions and exact-predecessor publication
policy for World/Campaign Definitions. Publication requires the expected draft revision,
current base and validation of that exact draft; the adapter revalidates current captured
content and commits revision/capture/head changes with existing transaction/CAS guards.
IDs, timestamps, authorization, hashing, immutable snapshot storage and idempotent retries
remain adapter responsibilities. Direct-successor World adoption retains conflict review
and reference mappings; it does not silently select a new World or Model release.

`ModelElement` owns revision and cardinality/shape validity plus revise/archive commands.
`ModelSchema` owns exact dependency closure, publication validity and adopted-root
collision policy. `ModelMigration` owns direct-lineage mappings and typed backfill
validation. World/Campaign owners enforce their governed-record conformance using the
exact compiled selection. Compiler adapters supply hashing; services still authorize
registries/releases and persist immutable revisions atomically. Existing unsupported
expression/pattern constraints remain rejected rather than acquiring invented evaluators.

GM Campaign editors author independent placements and decorations, associate canonical
placement IDs with Plot Location contexts, and expose existing preparation layers,
lights, sounds, drawings, templates and notes. Deprecated inline intent arrays are
preserved, not used for new authoring. Canvas configuration is reusable preparation;
these controls do not add a rendering or synchronized playback engine. B07 changes
ownership and consumers without changing common payload schemas or resource mappings.
