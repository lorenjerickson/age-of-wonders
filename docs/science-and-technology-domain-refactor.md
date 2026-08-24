# Science and Technology Domain Refactor

**Status:** Implementation complete; local rollout complete, other environments pending  
**Last updated:** 2026-08-24  
**Scope:** Shared domain types, persisted domain records, rules execution, AI generation contracts, and GM-facing web terminology

## Purpose

Age of Wonders has no magic. Every apparently supernatural event is a physical phenomenon, biological capability, scientific process, or technology that is poorly understood by some or all people in the setting. The current domain model instead carries fifth-edition fantasy assumptions such as spells, magical items, schools of magic, spell slots, attunement, and concentration.

This document defines how to remove those assumptions without reducing the range of phenomena the game can represent. It is both the design contract and the implementation ledger for the refactor.

## Implementation status

The planned implementation slices are complete:

- Shared types now use disciplines, `SkillDefinition` references, universal capacity bands, sustained operation, scientific item metadata, normalized damage terminology, and analysis terminology.
- Standard skill definitions have stable built-in IDs; legacy Arcana references migrate to Science rather than remaining a supernatural competency.
- Legacy domain reads apply a compatibility migration. Former spell definitions and actor spellcasting state are exposed through the discipline model, deterministic terminology is normalized, and unresolved cases are attached to the record under `extensions["aow:science-refactor-exceptions"]`. Ordinary writes reject legacy contracts rather than silently migrating newly authored content.
- Item creation and editing use operating basis and understanding state. AI-created items must provide both, and a `composite` basis must include a mechanism description.
- The AI-facing domain guide and generation prompts now require scientific or technological explanations.
- Creature and monster records now separate physical nature and morphology from cultural aliases. Communication capabilities replace numeric telepathy, extraordinary senses carry scientific metadata, and the creature editor authors the new classification directly.
- Canonical conditions now use `influenced` and `immobilized-transformed`. Damage-defense bypasses use predicates, with unstructured legacy labels preserved as compatibility metadata and exceptions.
- Travel connections can record operating basis, understanding, observed operation, infrastructure, activation requirements, and failure modes. Legacy portals receive an explicit unresolved mechanism and exception instead of being silently accepted.
- Plane-like locations now record their physical environment kind, understanding, observed properties, and optional mechanism, infrastructure, boundaries, access constraints, and provenance. Manual and AI authoring require at least one observed property; legacy planes receive an explicit unknown environment and review exception.
- The versioned `2026-08-23-science-and-technology-v1` persistence runner provides dry-run inventory, human-readable failures and exception reports, idempotent application, optimistic revision updates, and per-record graph projection replacement. It was applied to the configured local development database on 2026-08-24: 26 of 60 aggregates changed, all 26 graph projections were rebuilt, and the follow-up audit reported zero changes, failures, or exceptions with `compatibilityRetirementReady: true`.
- A versioned `aow:science-domain-archive` codec and persistence-facing CLI normalize legacy aggregates, reject duplicate canonical identities, report unresolved exceptions using human-readable names, and round-trip representative discipline, creature, and plane records. Import is a merge, defaults to dry-run, applies optimistic replacements, and rebuilds every imported graph projection.
- Ordinary create and replace operations reject legacy science-domain contracts. Legacy normalization is confined to compatibility reads, the versioned migration, and archive ingestion.
- Migration reports expose `compatibilityRetirementReady`. It becomes true only when a dry run finds no changed records, failures, or unresolved exceptions.

All implementation required for operational rollout is complete, and the configured local development environment has passed the full rollout procedure. Other environments remain environment-specific: export and secure a backup, stop writes, dry-run and apply the migration, review and resolve every content exception, and confirm a subsequent dry run reports `compatibilityRetirementReady: true`. Only after every environment passes may the compatibility reader and legacy query allowance be removed in a cleanup release; removing them earlier could make unmigrated persisted content inaccessible.

## Design principles

1. **The domain model describes reality, not folklore.** Authoritative fields use scientific and technological language. A character may call a device a wand or an effect a curse, but those terms belong in names, descriptions, beliefs, aliases, and tags rather than mechanical discriminants.
2. **Unknown does not mean magical.** When a mechanism is not understood, represent its understanding as `unknown`, `hypothesized`, or `classified`, while retaining the fact that it has a physical mechanism.
3. **Technology is relative to its setting.** Do not assume modern Earth categories or a linear technology ladder. A discipline can be ancient, biological, handcrafted, industrial, computational, recovered, or beyond contemporary understanding.
4. **Observation and mechanism are separate.** The model should be able to state what an effect does even when its operating principle is uncertain.
5. **Mechanics remain composable.** Damage, healing, conditions, movement, fabrication, deployment, and persistent effects remain generic rule effects. Only their magical framing changes.
6. **Religion remains part of culture.** Beliefs, deities, rituals, and religious institutions may exist as social facts. The model must not treat belief as proof of a supernatural mechanism.
7. **In-world vocabulary is preserved as presentation data.** Terms such as “spell,” “spirit,” “demon,” or “enchanted” may remain in quoted speech, local names, cultural classifications, and historical records.
8. **Difficult cases become explicit exceptions.** A concept that cannot be recast without changing its behavior, balance, or setting implications must be retained in the migration inventory as an unresolved exception. It must not be omitted, silently generalized, or given a scientific-sounding name without a defensible physical interpretation.

## Recommended core vocabulary

Use **discipline** as the replacement for the current mechanical meaning of a spell: a learnable, configurable, or integrated applied-science capability used by a trained organism, device, biological system, or combination of these. This is the capability itself, not a classification family; an individual use is an activation.

Use **activation** for using a discipline, **input** for required speech/movement/material, **sustained operation** for concentration, and **capacity** for limited uses.

Describe each discipline along three independent axes:

1. **What the phenomenon does:** protection, transport, sensing, fabrication, projection, restoration, or another functional tag.
2. **How it works:** neurology, optics, energy systems, materials, computation, or another operating basis.
3. **What competency operates or understands it:** an existing skill such as science, engineering, medicine, or technology.

Function, mechanism, and operator competency must not be collapsed into one replacement for a magic school. A discipline may have several functions and involve several mechanisms, but stores one primary operating basis. Different referenced skills may govern operation, analysis, maintenance, targeting, or countermeasures.

The word “technology” should not become a boolean replacement for “magical.” Nearly every manufactured item is technology. Items and disciplines instead need structured descriptions of their operating basis, provenance, sophistication, and degree of understanding.

Recommended operating bases are open-ended but should begin with:

- `mechanical`
- `chemical`
- `electrical`
- `thermal`
- `optical`
- `acoustic`
- `biological`
- `neurological`
- `computational`
- `field-effect`
- `materials`
- `composite`
- `unknown`

Store one primary `operatingBasis`. This favors simple authoring, filtering, and migration over a complete engineering model. For example, an optical camouflage system is classified as `optical` even if it also uses computation, electrical power, and specialized materials. Use `composite` when no single basis is honestly primary, and explain the mixture in `mechanismDescription`. Supporting mechanisms can be promoted into structured data later only if gameplay needs component failure, repair, substitution, or supply-chain mechanics.

Recommended understanding states are:

- `understood`: the relevant community has a reliable causal model.
- `empirical`: operation is repeatable, but the causal model is incomplete.
- `hypothesized`: one or more unconfirmed mechanisms are recorded.
- `unknown`: only observations and operating procedures are known.
- `classified`: the mechanism is known to some party but unavailable to the current observer.

These are not technology levels. Provenance and availability should be represented independently.

Understanding is contextual rather than an intrinsic universal fact. Use a default understanding state on the definition, then derive a character's understanding from capabilities granted by formative influences, skills, training, traits, equipment, and discipline access. Do not create a complete actor-by-discipline matrix.

Treat Heritage as a broad aggregation of formative influence, not ancestry or socioeconomic grouping alone. A coal-mining community, retired royal flying corps, family tradition, neighborhood institution, or weekend bowling league can all be heritages when their influence is part of the character at creation. The existing location-to-heritage-candidate relationship can make a coalfield upbringing available in mining towns; selecting it can grant proficiency in explosives, machinery, and related disciplines.

This interpretation retains two existing constraints: a character selects at most three heritages, and those selections are locked at character creation. An affiliation or experience acquired or abandoned during play should instead use a profession, trait, faction/relationship, or another mutable state mechanism. Regional knowledge is represented economically through available heritage candidates, training, institutions, traits, and definitions rather than a dense regional-understanding matrix.

## Exception policy

Some existing concepts encode more than fantasy vocabulary: they assume supernatural causation, violate ordinary physical constraints, or depend on a universal magic subsystem. These require design decisions rather than mechanical renaming.

Every unresolved exception should record:

- The current definition, field, or behavior using a human-readable name.
- The observable behavior that must be preserved.
- The assumption that prevents an easy scientific or technological interpretation.
- Any plausible hypotheses, clearly labeled as hypotheses.
- The interim representation used during migration.
- The owner and design decision needed to resolve it.
- Whether preserving the behavior would change the setting's scientific laws.

Use a migration report or namespaced compatibility metadata for these records. Do not introduce an `unknown` operating basis merely to conceal an unexamined magical assumption. `Unknown` is valid only when the phenomenon is observable and the game intentionally asserts that some physical explanation exists.

### Known model-level exceptions

| Exception                             | Why it cannot be mechanically renamed                                                                                                                     | Required treatment                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traditional magic schools             | The schools group effects by fantasy convention, not shared functions, causal mechanisms, or operator competencies.                                       | Preserve the old school as a legacy classification during migration, provisionally assign function tags, operating bases, and applicable existing skills, and require content review.                                                                                   |
| Spell levels and slot levels          | One number currently mixes complexity, power, training gate, and resource cost.                                                                           | Preserve the behavior through one shared universal `band` for now. Record this mixed semantic explicitly so complexity and output can be separated later without pretending they were already distinct.                                                                 |
| Universal spell slots                 | Abstract slots do not identify energy, material, thermal, cognitive, biological, or infrastructure costs.                                                 | Recast them as the universal capacity-band mechanic. Concrete power, material, heat, fatigue, and infrastructure costs are additional fiction and mechanics; do not rename every capacity to a battery.                                                                 |
| Pact slots and pact access            | The model assumes a fantasy source relationship but does not describe the actual provider, connection, or exchange.                                       | Flag every pact source. Recast only after deciding whether it is training, remote infrastructure, an implant, a symbiote, social sponsorship, or another physical arrangement.                                                                                          |
| Innate spellcasting                   | “Innate” says where access resides but not how the phenomenon works.                                                                                      | Preserve observable capabilities while requiring a biological, engineered, implanted, symbiotic, or other source hypothesis.                                                                                                                                            |
| Verbal and somatic components         | Speech and gestures may be arbitrary magical requirements rather than controls with a physical function.                                                  | Retain the requirements as observed operating procedures; mark their causal role unknown until they can be explained as commands, signals, calibration, motor sequences, or safety protocols.                                                                           |
| Ritual casting                        | Ritual may combine time, symbolism, participants, materials, and supernatural causation.                                                                  | Preserve its full procedure as data. Recast individual steps only when their operational role is known; cultural ceremony may coexist with a technical process.                                                                                                         |
| Concentration                         | The existing boolean does not say whether interruption is cognitive, neurological, radio/control-link, energetic, or merely a game-balance rule.          | Keep a legacy sustained-operation constraint until the maintaining process and interruption conditions are specified.                                                                                                                                                   |
| Magical-versus-mundane damage         | The boolean may control resistance bypass without identifying any physical difference between sources.                                                    | Preserve outcomes through compatibility rules, inventory every affected defense, and replace the boolean only after typed mechanisms reproduce the same results.                                                                                                        |
| Attunement and its universal limit    | Attunement combines ownership, compatibility, activation, identification, and a global item limit without a physical basis.                               | Retain one universal `attunement` mechanic for simplicity, but redefine it as operator-item synchronization. Each item may explain that synchronization as calibration, pairing, authorization, biological tolerance, interface bandwidth, or another physical process. |
| Dispellable permanent effects         | “Dispel” assumes a universal cancellation operation across unrelated phenomena.                                                                           | Preserve the current removability behavior, then define phenomenon-specific neutralization, reversal, treatment, shutdown, or destruction procedures.                                                                                                                   |
| Definition-granted divine power       | Religion is easy to retain as culture, but a deity that objectively grants capabilities is not.                                                           | Treat the claimed deity as an in-world explanation. Flag the capability source until it can be modeled as an organism, technology, institution, remote actor, environment, or unresolved physical phenomenon.                                                           |
| Cross-source discipline compatibility | `classLists`, sources, books, focus items, and preparation modes currently interact through fantasy rules that may not map to one technical architecture. | Preserve compatibility references and review them as training, software/procedure compatibility, interface standards, or biological constraints.                                                                                                                        |
| Existing extension payloads           | Namespaced JSON can contain magic semantics that static field searches cannot discover.                                                                   | Inventory extension keys and inspect payload content; unresolved payloads remain explicit migration exceptions.                                                                                                                                                         |

### Known content-level exceptions

The source types permit effects whose individual records may be impossible to recast faithfully without establishing new physical laws. The migration must catalog every occurrence of the following rather than assuming the generic replacement is sufficient:

- Discontinuous teleportation, portals, extradimensional spaces, or “planes.”
- Creation of matter, creatures, or complex objects without identified inputs.
- Summoning an entity from an unspecified location or source.
- Resurrection, reanimation with retained identity, or reversal of biological death.
- Transformation that changes mass, composition, species, or identity without inputs and waste products.
- Reliable prophecy, remote knowledge, mind reading, or information acquisition without a transmission path.
- Direct control of another mind, memory rewriting, or personality alteration.
- Illusions that affect perception without a signal, projection, chemical, or neural mechanism.
- Persistent effects that survive without energy, material change, or an identified stable state.
- Effects whose range, targeting, or selectivity depend on abstract categories such as ally, enemy, alignment, soul, true name, or moral status.
- Damage or healing that distinguishes magical from nonmagical sources while remaining physically identical.
- Creatures whose continued existence requires souls, incorporeality, divine creation, or other unmodeled ontology.
- Objects larger, heavier, or more numerous internally than their external geometry permits.
- Time travel, time reversal, stopped time, or changes to prior events.
- Luck, fortune, fate, or probability manipulation when modeled as objective causation rather than character belief or statistical uncertainty.

For each occurrence, choose one of four outcomes:

1. **Explain:** supply a physical mechanism supported by the setting.
2. **Constrain:** preserve the apparent effect but add inputs, limits, transmission paths, conservation rules, failure modes, or observer-relative uncertainty.
3. **Reclassify:** retain it as folklore, mistaken observation, propaganda, simulation, hallucination, or unreliable narration rather than authoritative state.
4. **Register an exception:** preserve the behavior temporarily with legacy compatibility and an explicit unresolved-science record.

Deletion is not an acceptable automatic migration outcome. Removing a capability or changing its gameplay behavior requires a separate product decision.

## Core type refactor

Rename `packages/common/src/types/magic.ts` to `disciplines.ts`. The following is the recommended conceptual mapping.

| Current concept        | Replacement                                     | Reframed meaning                                                                                                                    |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `MagicSchool`          | Remove after migration                          | Split its former role among function tags, operating bases, and existing skills; preserve the old value only as migration metadata. |
| `SpellComponent`       | `DisciplineInput`                               | A required operator action, signal, material, device, or environmental condition.                                                   |
| `SpellScaling`         | `DisciplineScaling`                             | Increased output produced by more capacity, operator development, equipment, or custom conditions.                                  |
| `SpellComponents`      | `DisciplineComponents`                          | Complete activation and outcome contract for a discipline.                                                                          |
| `SpellDefinition`      | `DisciplineDefinition`                          | Catalog definition with `kind: "discipline"`.                                                                                       |
| `SpellPreparationMode` | `DisciplineAccessMode`                          | How an actor gains access to or configures a discipline.                                                                            |
| `SpellcastingSource`   | `DisciplineSource`                              | Training, organism, implant, device, facility, or other source that enables disciplines.                                            |
| `SpellSlotState`       | `CapacityBandState`                             | Universal limited operational capacity using the shared capability band.                                                            |
| `PactSlotState`        | Remove or replace with ordinary source capacity | “Pact” encodes a magical fiction and should not remain a core mechanic.                                                             |
| `SpellcastingState`    | `DisciplineState`                               | An actor's available sources, capacity, configuration, and active operation.                                                        |

### Discipline classification and skills

Do not treat `DisciplineDefinition` as a one-for-one classification replacement for `MagicSchool`. Traditional schools currently mix function, mechanism, and competency. Existing records can be decomposed provisionally as follows, then reviewed against their actual behavior:

| Existing school | What it does: provisional function tags                | How it works: possible operating bases                    | Competencies that may apply                                                 |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `abjuration`    | `protection`, `countermeasure`                         | `field-effect`, `materials`, `electrical`, `composite`    | `engineering`, `technology`, `science`                                      |
| `conjuration`   | `fabrication`, `deployment`, `transport`               | `mechanical`, `computational`, `field-effect`, `unknown`  | `engineering`, `technology`, `science`                                      |
| `divination`    | `sensing`, `analysis`, `prediction`                    | `optical`, `electrical`, `computational`, `neurological`  | `science`, `investigation`, `perception`, `technology`                      |
| `enchantment`   | `behavioral-influence`, `communication`, `control`     | `neurological`, `acoustic`, `chemical`, `computational`   | `medicine`, `science`, `technology`, and sometimes `persuasion`             |
| `evocation`     | `energy-projection`, `area-control`, `damage`          | `electrical`, `thermal`, `acoustic`, `field-effect`       | `engineering`, `technology`, `demolition`, `marksmanship`                   |
| `illusion`      | `sensory-manipulation`, `projection`, `camouflage`     | `optical`, `acoustic`, `computational`, `neurological`    | `technology`, `engineering`, and situationally `deception` or `performance` |
| `necromancy`    | `restoration`, `reanimation`, `tissue-manipulation`    | `biological`, `chemical`, `neurological`, `computational` | `medicine`, `science`, `technology`                                         |
| `transmutation` | `material-transformation`, `fabrication`, `adaptation` | `materials`, `chemical`, `biological`, `field-effect`     | `science`, `engineering`, `medicine`, `technology`                          |

This mapping is intentionally many-to-many and provisional. A migration must not claim that two disciplines share a function or mechanism merely because the old model put them in the same school.

Use skills only when actor competency has mechanical meaning. Skills participate in character and creature skill state, proficiency, passive scores, expressions, backgrounds, heritage grants, and `D20TestDefinition`. Associating a skill therefore implies that it may be trained, rolled, granted, or improved; it is not merely a catalog label.

Promote the current open-string `Skill` into a first-class `SkillDefinition` included in `GameDefinition`. Its definition identity supplies the stable ID, key, name, description, source, and tags. Initial components should remain small:

- `defaultAttribute?: Attribute`, used when a test does not override the governing attribute.
- Optional rules metadata only when it has demonstrated mechanical use; do not copy actor-specific proficiency or bonus state into the definition.

Replace skill string fields with `DefinitionId` references whose names make their target explicit:

- `SkillState.skill` becomes `skillDefinitionId`.
- `D20TestDefinition.skill` becomes `skillDefinitionId`.
- `ScalarExpression.kind: "skill-bonus"` references `skillDefinitionId`.
- Background skill proficiencies become `skillProficiencyIds`.
- Monster and creature skill entries reference skill definition IDs.
- Discipline associations become `relatedSkillIds`.

A discipline may reference different skills for different activities. Operation might use technology, analysis science, repair engineering, clinical application medicine, and targeting marksmanship. Store `relatedSkillIds: readonly DefinitionId[]`; do not embed copies of skill definitions or actor-specific rank, bonus, passive score, or proficiency state. The role of each skill is expressed by the actions and `D20TestDefinition` records that actually use it.

Do not infer discipline access from skill proficiency. Access remains a property of training, configuration, biology, implants, equipment, facilities, or other `DisciplineSource` records. A skilled engineer may understand a device without possessing it; an implanted operator may activate a discipline without being able to explain or repair it.

Migrate every standard skill string to a stable definition and preserve its existing key. Validation must reject missing skill references after migration. Skill names shown to the GM must be resolved from definitions; opaque definition IDs must never appear in visible content.

### Discipline inputs

Replace component terminology with explicit inputs:

- `verbal` becomes `vocal-command` or `acoustic-signal`.
- `somatic` becomes `manual-operation`, `gesture-control`, or `body-sequence`.
- `material` becomes `material`, `consumable`, or `device` input while retaining description, cost, consumption, and item reference.
- Add open custom input kinds for environmental conditions, connected infrastructure, assistants, samples, power sources, and calibration tools.

### Discipline components

Refactor the current spell fields as follows:

| Current field     | Replacement                                   | Notes                                                                                                                                                                           |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`           | `band`                                        | One shared band represents both complexity and output for now; separate dimensions only if later gameplay requires them.                                                        |
| `school`          | Split into function, basis, and skill data    | Use function tags and `operatingBasis`; associate existing skills only where competency is mechanically relevant. Preserve the old school as migration metadata until reviewed. |
| `ritual`          | `extendedProcedure`                           | Indicates a longer, procedural activation rather than a religious rite.                                                                                                         |
| `castingTime`     | `activationTime`                              | Continues to use action costs.                                                                                                                                                  |
| `reactionTrigger` | `reactionTrigger`                             | Already neutral.                                                                                                                                                                |
| `range`           | `range`                                       | Already neutral.                                                                                                                                                                |
| `targets`         | `targets`                                     | Already neutral.                                                                                                                                                                |
| `components`      | `inputs`                                      | Uses `DisciplineInput`.                                                                                                                                                         |
| `duration`        | `duration`                                    | Already neutral, subject to `dispellable` changes below.                                                                                                                        |
| `concentration`   | `sustainedOperation`                          | Means continued operator attention, control, or active regulation.                                                                                                              |
| `prerequisites`   | `prerequisites`                               | Already neutral.                                                                                                                                                                |
| `outcomes`        | `outcomes`                                    | Already neutral.                                                                                                                                                                |
| `scaling`         | `scaling`                                     | Uses `DisciplineScaling`.                                                                                                                                                       |
| `classLists`      | `trainingProgramIds` or `compatibleSourceIds` | Reference actual sources of access rather than fantasy class lists.                                                                                                             |

Every discipline should also be able to record:

- `functionTags`
- `operatingBasis`
- `understanding`
- `observedPhenomenon`
- optional `mechanismDescription`
- optional `provenance`
- optional safety and failure information

Descriptions must separate observation from explanation. For example, “moves a subject between two points without traversing the intervening space” is an observation; “folds local geometry using a controlled field gradient” is a mechanism claim.

### Discipline access and state

Replace preparation modes as follows:

| Current value     | Replacement                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `known`           | `trained`                                                                                                           |
| `prepared`        | `configured`                                                                                                        |
| `always-prepared` | `standard-configuration`                                                                                            |
| `spellbook`       | `manual` or `procedure-library`                                                                                     |
| `pact`            | Migrate according to the actual source: `linked-device`, `sponsored-training`, `remote-service`, or a custom value. |
| `innate`          | `biological` or `integrated`                                                                                        |

Rename source and state fields:

- `attribute` remains the governing operator attribute.
- `attackBonus` becomes `targetingBonus`.
- `saveDifficultyClass` becomes `resistanceDifficulty`.
- `spellsKnown` becomes `disciplinesLearned`.
- `spellsPrepared` becomes `disciplinesConfigured`.
- `spellbook` becomes `procedureLibrary`.
- `focusItemId` becomes `controlInterfaceItemId` or `requiredToolItemId`.
- `ritualCasting` becomes `extendedProcedureAccess`.
- `ignoresComponents` becomes `bypassesInputs`.
- `slots` becomes `capacityBands`.
- `pactSlots` is folded into capacity belonging to its actual source.
- `innateUses` becomes `integratedUses` or ordinary source resources.
- `currentlyCasting` becomes `currentlyActivating`.

`ResourcePool` remains suitable for batteries, reactants, fatigue, thermal limits, biological reserves, bandwidth, and other capacity. Resource keys and descriptions must identify what is actually being consumed.

Capacity bands are a universal rules mechanic. Every capability uses the same ordered band scale and pays banded capacity through the same action-cost mechanism. Capacity remains stored on an actor's state and can identify the sources that contribute to or authorize its use. Individual definitions may add concrete fictional costs such as power, reactants, heat, fatigue, or equipment wear, but those do not replace the universal band cost unless a later rules revision explicitly changes this decision.

## Rules engine refactor

The generic effects system already supports most required outcomes. Preserve generic mechanics and rename only magical assumptions.

| Current rule concept                 | Replacement                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `ActionCost.kind: "spell-slot"`      | `kind: "capacity"` with a band and optional contributing source                      |
| `pact` on spell-slot cost            | Remove; identify the actual capacity source                                          |
| `EventType: "spell-cast"`            | `"discipline-activated"`                                                             |
| `RuleEffect.damage.magical`          | Replace with structured source/effect tags; never use a magic-versus-mundane boolean |
| `ActionComponents.concentration`     | `sustainedOperation`                                                                 |
| `ActiveEffect.concentrationOwner`    | `operatorId` or `sustainingEntityId`                                                 |
| `CombatantState.concentratingOn`     | `sustainingOperations`                                                               |
| `Predicate.kind: "is-concentrating"` | `"is-sustaining-operation"`                                                          |

Reframe generic effects by mechanism without making them less capable:

- `teleport` becomes `displace` or `transit`. The effect describes discontinuous movement; the discipline or device explains the mechanism.
- `summon` becomes `deploy`. It can deploy a drone, organism, remote platform, fabricated construct, or transported entity.
- `heal` becomes `restore-health`; its source may be medical treatment, drugs, nanotechnology, surgery, stimulation, or biological regeneration.
- `create-object` remains valid for fabrication and deployment.
- `apply-condition`, `apply-modifier`, movement, sensing, and damage remain generic.

`Duration.kind: "permanent"` currently has `dispellable`. Rename that field to `reversible` or `neutralizable`. Which term applies should be decided at the effect level: a removable implant, interruptible field, treatable biological change, and reversible chemical process are not the same operation.

Predicates such as `is-attuned` and `has-definition` must be updated consistently with the item terminology below.

## Damage, conditions, and defenses

Canonical damage types represent distinct injury mechanisms. Do not retain separate types that are synonyms, delivery descriptions, visual descriptions, or fantasy labels for the same mechanism. Local names may remain in presentation data without becoming mechanical damage types.

Apply these initial normalizations:

| Current type | Canonical treatment                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lightning`  | Migrate to `electrical`; lightning describes a visible delivery form, not a separate injury mechanism.                                         |
| `thunder`    | Migrate to `concussive`; thunder describes an acoustic pressure wave.                                                                          |
| `force`      | Remove as a generic type and migrate each effect to `concussive`, `ballistic`, or another measured mechanism; unresolved cases are exceptions. |
| `necrotic`   | Remove as an outcome label and migrate by cause, such as `chemical`, `poison`, cold, heat, or a new scientifically defined mechanism.          |
| `psychic`    | Replace with a scientifically defined neurological or cognitive damage type if it remains mechanically distinct.                               |
| `radiant`    | Migrate by mechanism, such as thermal injury or a scientifically defined ionizing-radiation type.                                              |
| `acid`       | Review against `chemical`; keep only if corrosive injury has intentionally distinct defense and treatment rules.                               |

`ballistic`, `bludgeoning`, `chemical`, `cold`, `concussive`, `electrical`, `explosive`, `fire`, `piercing`, `poison`, and `slashing` already describe plausible mechanisms or intentionally distinct delivery/injury rules. Even these require overlap review: for example, `explosive` may combine concussive, thermal, fragmentation, and chemical outcomes. A composite attack can apply multiple canonical damage components instead of inventing a broad duplicate type.

The practical test is defensive equivalence. If the same insulation, resistance, treatment, and immunity rules apply, two labels should normally be one damage type. A Faraday enclosure therefore interacts with `electrical`; an attack described locally as “lightning” uses that same type rather than requiring duplicate lightning defenses.

Conditions that are authoritative mechanics are normalized as follows:

- `charmed` becomes `influenced`.
- `invisible` can remain as an observed optical state, with camouflage or projection as its mechanism.
- `petrified` becomes `immobilized-transformed`; literal mineral conversion belongs in the effect's mechanism description.

`DamageAdjustment.bypassPredicate` now lets defenses distinguish frequencies, materials, energy bands, delivery methods, or countermeasures without relying on “magical damage.” Compatibility migration preserves old `bypassedBy` labels under `extensions["aow:legacy-bypass-labels"]` and registers an exception for manual conversion.

## Items and equipment

Remove `ItemComponents.magical`. Replace it with structured technical metadata shared with disciplines:

- `operatingBasis`
- `understanding`
- optional `mechanismDescription`
- optional `provenance`
- optional `requiresPower` or explicit resource references

Reframe item concepts as follows:

| Current concept                  | Replacement                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `spellcasting-focus`             | `control-interface`, `technical-instrument`, or `procedure-tool`            |
| `potion`                         | `compound`, `medicine`, `injectable`, or generic `consumable`               |
| `scroll`                         | `schematic`, `procedure-record`, `data-medium`, or `field-manual`           |
| `wondrous-item`                  | `device` or a mechanism-specific category                                   |
| `artifact` rarity                | `unique`, `prototype`, `relic`, or provenance metadata                      |
| `AttunementRequirement`          | Retain and define as a requirement for operator-item synchronization        |
| `attunement`                     | Retain as one universal mechanic with a scientific operating description    |
| `ItemInstance.attunedBy`         | Retain as the entity for whom the item is synchronized                      |
| `InventoryState.attunementLimit` | Retain as a universal operator synchronization limit                        |
| `ItemInstance.identified`        | `analyzed` with an optional understanding state                             |
| `charges`                        | `capacity`, with an explicit energy, material, thermal, or biological basis |

`ring`, `rod`, `staff`, and `wand` may remain as physical form factors if the setting actually uses them. They should not imply magic. Prefer functional categories when their shape is incidental.

The item editor currently exposes magical/mundane filters, badges, and checkboxes. Replace them with useful filters such as operating basis, understanding, provenance, power source, or contemporary availability. Do not replace the label “Magical item” with “Technological item,” because ordinary armor, tools, and carts are also technologies.

## Characters, classes, creatures, and species

Rename the character and class integration points:

- `ClassComponents.spellcastingProgression` becomes `disciplineProgression` or a source-specific progression reference.
- `ClassLevelDefinition.spellSlots` becomes universal `capacityByBand`; source records may identify which training or equipment contributes that capacity.
- `CharacterState.spellcasting` becomes `disciplines`.
- `MonsterComponents.spellcasting` and `CreatureState.spellcasting` become `disciplines`.

Innate-looking capabilities must be represented as biological, neurological, cybernetic, symbiotic, environmental, or otherwise physical sources. A capability can remain unexplained without becoming supernatural.

`MonsterComponents.telepathy` has been replaced by structured communication capabilities recording range, medium, directionality, requirements, operating basis, and understanding. Possible explanations include neural transmission, radio, chemical signaling, shared implants, or an unknown but measurable field.

Traditional creature types migrate into a physical `classification` with `nature`, optional morphology, and coexisting aliases. They still require content-sensitive review:

- `celestial`, `fiend`, and `fey` become cultural aliases or tags unless they identify a defensible taxonomy.
- `undead` becomes a presentation term for a concrete state such as reanimated organism, parasitized body, reconstructed person, or autonomous corpse-like machine.
- `elemental` becomes an organism, construct, or field phenomenon with composition metadata.
- `construct` remains valid but should distinguish manufactured machines, engineered organisms, and composites.
- `dragon`, `aberration`, and `monstrosity` may remain colloquial taxonomic labels while authoritative taxonomy records origin and biology.

Scientific categorization and local terminology should coexist. An entity keeps one authoritative classification and may carry multiple aliases qualified by culture, location, language, historical period, or source. “Fiend,” “river devil,” and a formal biological classification can therefore identify the same kind of organism without making the slang term authoritative. User interfaces should prefer the locally appropriate name while exposing scientific categorization where the viewer has sufficient understanding.

Senses are observation-based and can record operating basis, understanding, and mechanism. Legacy `truesight` becomes `unresolved-advanced-sensing` plus an exception; new records use explicit capabilities such as multispectral imaging, material penetration, field detection, or projection discrimination. `darkvision`, `blindsight`, and `tremorsense` can remain if their physical mechanisms are recorded or intentionally unknown.

`CharacterState.deity`, location `religions`, and religious skills remain valid cultural information. Replace `deity?: string` with structured beliefs or religious affiliations if mechanics need to distinguish personal belief, institutional membership, and claimed entities. No rule should infer that a claimed deity exists from these fields.

## Worlds and locations

`LocationKind: "plane"` and connection kind `portal` may remain only with scientific semantics:

- A plane is a physically real environment, dimension, simulation, isolated habitat, or culturally named region—not evidence of a supernatural realm. Its `physicalEnvironment` records the environment kind, understanding state, at least one observed property, and optional operating basis, mechanism, sustaining infrastructure, boundary conditions, access constraints, and provenance.
- A portal is a transit mechanism. Its connection record can identify operating basis, understanding, observed operation, infrastructure, activation requirements, and failure modes; those mechanism fields are required by contract for portal authoring.

Planes and portals that cannot identify a physical environment or transit mechanism remain content-level exceptions; they must not be dropped or relabeled as ordinary geography.

World-generation content should describe how phenomena affect geography, culture, economics, politics, and conflict while distinguishing observed effects from local explanations. A population may organize religion around an artificial sun without the generated world asserting divine causation.

## Generic definitions and extensions

Traits, actions, hazards, professions, heritages, feats, active effects, and custom definitions can already represent scientific and technical capabilities. They do not require magic-specific replacements, but authored records must be reviewed for magical terminology and unsupported supernatural causation.

Heritage needs explicit grant variants so formative influences can reference the new catalog definitions without encoding them as path strings or duplicating their data:

- A skill-proficiency grant references `skillDefinitionId` and the granted proficiency rank.
- A discipline-access grant references `disciplineDefinitionId` and the source or access mode it supplies.
- Existing rule-modifier, action, trait, choice, and custom variants remain available for other consequences.

Locations and cultures continue to expose candidate heritage definition IDs. Selection places the resulting capability grants into character state; the heritage does not embed copies of skill or discipline definitions.

Namespaced extensions remain an escape hatch, not the primary home for core discipline semantics. New standardized fields should be promoted into source types once their meaning is stable.

## Persisted-data migration

This refactor changes discriminants, field names, and semantics and therefore requires an explicit versioned migration. Do not rely on TypeScript aliases alone.

The repository implements this as `2026-08-23-science-and-technology-v1`. `pnpm --filter @aow/api domain:migrate:science` performs a non-mutating dry run; `pnpm --filter @aow/api domain:migrate:science:apply` applies it. The dry run lists every changed aggregate by human-readable name for content review. Apply mode must run with API writes stopped and a current database backup. It replaces the derived graph projection before optimistically updating each changed aggregate, increments the aggregate revision, continues past human-review exceptions, and reports safe failures without exposing internal identifiers. Rerunning after a complete application is a no-op. A clean dry run sets `compatibilityRetirementReady` to true only when there are no changes, failures, or exceptions. The configured local development database reached that state on 2026-08-24; this does not assert the state of any other environment.

Use `pnpm --filter @aow/api domain:archive:export -- --output=/secure/backup/domain-archive.json` to create a non-overwriting portable backup. Use `pnpm --filter @aow/api domain:archive:import -- --input=/secure/backup/domain-archive.json` for a dry run, then `pnpm --filter @aow/api domain:archive:import:apply -- --input=/secure/backup/domain-archive.json` with writes stopped to apply the merge. Import never deletes records merely because they are absent from the archive. It rebuilds graph projections for new, changed, and unchanged imported aggregates so it can safely repair a partial prior run.

The exception-review workflow is deliberately content-driven: export or dry-run the migration, assign each human-readable exception entry for review, edit the aggregate to supply defensible physical semantics, remove only exception messages that the edit actually resolves, and rerun the dry run. An empty exception register—not renaming or suppressing an exception—is the retirement gate.

1. Inventory all persisted `kind: "spell"` definitions, skill string values, and references to both.
2. Create stable `SkillDefinition` records for every standard and persisted custom skill, then migrate character, creature, test, expression, background, heritage, and discipline fields to definition references.
3. Convert each spell definition into a discipline definition while preserving its stable definition ID where the persistence layer permits a semantic migration.
4. Decompose school into function tags, one primary operating basis, and mechanically relevant skill definition references; translate components, preparation, source, slot, concentration, and effect terminology.
5. Require a human or generation-assisted review of function, mechanism, competency, operating basis, and understanding. Automated school decomposition is provisional only.
6. Migrate character, creature, monster, class, item, combat, and active-effect fields in the same versioned snapshot transition.
7. Replace magical damage flags with typed mechanism/source metadata, normalize duplicate damage types, and review resistance predicates.
8. Preserve the universal attunement state and limit while redefining attunement as operator-item synchronization. Record the concrete calibration, pairing, interface, authorization, biological tolerance, or other process where known.
9. Preserve culturally meaningful fantasy terms in names, descriptions, aliases, and tags rather than authoritative fields.
10. Produce an exception register containing every record that could not be recast without changing behavior or inventing unsupported causation.
11. Preserve unresolved records through an explicit compatibility representation; do not omit them from migrated snapshots.
12. Reject newly authored legacy discriminants after the migration boundary. Temporary readers may accept legacy records and explicit exceptions only for migration and resolution work.
13. Rebuild derived graph tuples after records are migrated so predicates reflect the new field and kind names.

Migration logs and errors must use human-readable record names in GM-facing output and must never expose opaque internal identifiers.

## Repository changes required

Implementation must update all of the following together:

- `packages/common/src/types/magic.ts`, renamed to `disciplines.ts`.
- Exports in `packages/common/src/types/index.ts`.
- `GameDefinition` in `packages/common/src/types/catalog.ts`, including the new `SkillDefinition`.
- Character, creature, combat, expression, rule, item, primitive, and location types described above.
- Persisted resource validation and any import/export migration code.
- `apps/api/src/domain/domain-resource.ts` if definition discriminants or resource presentation change.
- `apps/api/src/ai/prompts/domain-model.md`, which must remain synchronized with the source types.
- All generation prompts. They currently instruct models to preserve or invent magic, magical baselines, magical items, supernatural transitions, spellcasting, and attunement.
- API generation services and fixtures that emit magical fields.
- Web item filters, labels, form fields, badges, and category lists.
- Creature creation defaults and prompts that include spellcasting or attunement fields.
- Tests and fixtures containing `kind: "spell"`, magical items, spellcasting state, attunement, or fantasy damage terminology.

The HTML `spellCheck` property in the web application is unrelated and must not be renamed.

## Suggested implementation sequence

### Phase 1: Introduce scientific semantics

- Agree on `DisciplineDefinition`, operating-basis metadata, understanding states, capacity, and sustained-operation semantics.
- Add the new types alongside legacy read compatibility.
- Update the AI-facing domain guide and generation prompts so no new magical content is created.

### Phase 2: Migrate definitions and state

- Implement deterministic persisted-data migrations.
- Create skill definitions and migrate all skill references.
- Convert disciplines, sources, classes, actor state, items, rules, combat state, and predicates.
- Generate and review the unresolved-science exception register.
- Add validation preventing new legacy fields.

### Phase 3: Update interfaces and generated content

- Replace magical filters and labels with scientific metadata.
- Update creation and editing flows.
- Regenerate or manually revise existing descriptions that assert supernatural causation.

### Phase 4: Remove compatibility

- Remove legacy type aliases and dual readers.
- Remove `magic.ts` and all magical discriminants.
- Rebuild graph projections.
- Run a repository and persisted-data audit for prohibited authoritative terminology.

## Acceptance criteria

The refactor is complete when:

- No authoritative source type uses `magic`, `magical`, `spell`, `spellcasting`, `cast`, `attunement`, or `concentration` with a magical meaning.
- No persisted discriminant or required field asserts a supernatural mechanism.
- Every former spell is represented as a discipline with an observed effect and an operating basis, an honest understanding state, or an explicit unresolved exception.
- Every concept or record that could not be faithfully recast appears in the exception register with its observable behavior preserved.
- No migrated capability, field, extension payload, or persisted record is silently omitted because it lacks an easy scientific interpretation.
- Limited uses consume the universal capacity-band mechanic, with contributing sources and concrete costs recorded where applicable.
- Item behavior uses mechanism, power/capacity, attunement-as-synchronization, and provenance instead of a magical boolean.
- Damage and defenses use normalized physical mechanisms rather than magical-versus-mundane or synonymous parallel types.
- Every skill is a catalog definition, and all skill usage is represented by validated definition references.
- Creature capabilities and world phenomena are biological, scientific, technological, or explicitly unknown-but-physical.
- Religion and folklore remain representable without becoming authoritative cosmology.
- AI prompts consistently generate poorly understood science and technology and never introduce real magic.
- `apps/api/src/ai/prompts/domain-model.md` matches the implemented TypeScript types and persisted resource mappings.
- Migration, typecheck, lint, unit tests, generation-contract tests, and representative import/export round trips pass.

## Recorded design decisions

1. **Catalog term: `discipline`.** A discipline is one learnable, configurable, or integrated applied-science capability that replaces one former spell definition; it is not the classification axis previously called a school. An individual use is an activation. “Directed Plasma Projection” is therefore a discipline, `energy-projection` is its function, `field-effect` is its primary operating basis, thermal injury is an outcome, and technology or marksmanship skill definitions are referenced competencies. This deliberately gives `discipline` a narrower meaning than an academic field but a broader meaning than one sequence of procedural steps.
2. **One shared band.** A single `band` represents complexity and output for now. Capacity costs use the same band scale. Complexity and output can be separated later only if gameplay demonstrates a need.
3. **One primary operating basis.** Store one `operatingBasis` for simple authoring and filtering. Use `composite` plus `mechanismDescription` when no single basis is honestly primary. Supporting mechanisms remain descriptive until gameplay requires structured components.
4. **Heritage represents formative influence.** Heritage may represent any aggregation of influence that establishes current capability at character creation, including regional industries, military cohorts, families, clubs, institutions, and cultural communities. Locations already expose heritage candidates, so a coal-mining town can offer a coalfield upbringing that grants relevant skill proficiency and discipline access. The maximum-three and creation-locked constraints remain; mutable affiliations acquired during play use other systems.
5. **Universal capacity bands.** Capacity bands and their action cost are shared rules mechanics rather than unrelated resources invented by each source. Sources may additionally explain concrete power, material, fatigue, heat, or infrastructure costs.
6. **One attunement mechanic.** Retain `attunement`, `attunedBy`, and the universal attunement limit. Authoritative documentation redefines attunement as operator-item synchronization; individual items may explain its physical implementation differently.
7. **Damage types are normalized mechanisms.** Do not retain separate but equivalent damage types. `lightning` maps to `electrical`, and `thunder` maps to `concussive`; fantasy or outcome labels such as `force`, `necrotic`, and `radiant` are migrated according to their actual mechanisms or registered as exceptions.
8. **Scientific and local classifications coexist.** Authoritative taxonomy is stored separately from slang, cultural labels, historical names, and aliases. Presentation can select terminology appropriate to a viewer and region.
9. **Skills become definitions and are referenced.** Add `SkillDefinition` to the catalog and replace skill strings with `DefinitionId` references. A discipline stores `relatedSkillIds`; it never embeds skill definitions or actor-specific rank, bonus, passive value, or proficiency state. Actions and tests determine how a referenced skill is used.

Implementations should avoid one-for-one renames that preserve fantasy assumptions under scientific-sounding labels.
