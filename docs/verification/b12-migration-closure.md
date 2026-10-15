# B12 — Remaining consumers and migration closure

Delivered 2026-10-14 (America/Los_Angeles), following commit `faa88cb`.
DM-16/17 and UX-09–11 are closed for the existing migrated behavior and explicit
boundaries below. Feat, Heritage and Discipline remain permanently excluded.
This closes the twelve-batch plan; it does not authorize new gameplay or the
previously unselected specialization/proficiency screens.

## Usable outcomes and retained boundaries

People profiles, Settings areas and individual settings now have stable URLs,
including refresh, browser Back and named membership/Character links. Identity
provider subjects and credential material stay private; existing protected command
controls are retained. World library creation uses the canonical `/worlds/new`
journey. Existing Campaign lineage, create/cancel and immutable history destinations
were reconciled with B05/B07 evidence and focused tests, without duplicating editors.
Location Hierarchy replaces Connections; historical deep links redirect while
preserving query context. All new navigation is shared responsive UI with 44px controls.

Current owner predicates/codecs are reused for manual, generated and runtime
mutations. Common remains the TypeScript DTO source of truth; former aggregate
validation and lifecycle exports moved behind the appropriate domain owners.
`RuleExecution.run` now subscribes before executing, consumes only a committed
result, returns an isolated copy, and unsubscribes/disposes on success, rejection
and exceptions. This is a request-scoped execution contract, not a persistent
cross-request engine or a pre-transaction shared graph.

Historical `DomainRecord` and host archives are intentionally storage-only restore
boundaries. They preserve sparse, retired and private payloads under metadata/codec,
revision and hash checks. They do not publish a World/Campaign revision or update
canonical Instance runtime. Keep them until a lossless replacement covers those
archives. Generic mutation methods and legacy generator source fixtures have no
current controller/provider consumers; remove those sources when equivalent
historical fixtures replace them. This is explicit compatibility retention, not
universal semantic revalidation of old archives.

## Concept reconciliation

Delivered means source and named B05–12 evidence support the migrated existing behavior. Explicit boundaries retain values, infrastructure and historical decoding without creating competing owners.

| Row | Current implementation evidence / explicit boundary |
| --- | --- |
| D01 | `entity-runtime.ts`, `entity-graph.ts`, CatalogCapture; B06 graph isolation/identity/dependencies/disposal. Entity tests cover command atomicity, immutable exposed metadata, no-op suppression and event order. B12 RuleExecution now observes committed state. |
| D02 | WorldDefinition content owner + DefinitionLineage, World/Campaign service consumers; B07. Captures, CAS, hashes and transactions remain adapter I/O. B12 closes remaining active writer reachability; historical storage restoration is explicitly retained. |
| D03 | LocationDefinition→owned Map, map-required/grid/image/presentation policy; B09. CampaignInstance realizes captured locations B10. |
| D04 | Map, Wall, Door, Window parent-routed element commands/codecs; B09. Mesh/geometry/chunk storage remain external. |
| D05 | CreatureDefinition, Creature sparse runtime/realization/position/resources; B08/B10. No fabricated full statistics. |
| D06 | CharacterTemplate, CharacterDefinition, Character extends Creature, CharacterCreation; B08 lifecycle/import preservation plus B10 atomic activation/items. Schema captures are values. |
| D07 | ItemDefinition, Item, ActorEquipment; B05 authored structure, B08 equipment/container/quantity, B10 activation. Legacy Object/Hazard remain Item compatibility shapes; no new peer roots. |
| D08 | Attribute + ModelElement/ModelSchema; B07. Runtime values/pools remain Creature/Character owned. |
| D09 | SkillDefinition authoring + CharacterCreation captured selections; B05/B08. Arbitrary proficiency advancement not implemented or authorized; existing captured proficiency values remain owned data. |
| D10 | Modifier + GrantedModifier, captured acquisition/resolution; B08. Expression execution remains shared pure machinery; B12 retains pure value guards while moving lifecycle policy to owners. |
| D11 | EffectDefinition/ConditionDefinition + ActiveEffect grant/duration behavior, Creature effective-condition projection; B08. Scheduling/implicit time conversion not authorized. |
| D12 | ProfessionDefinition/BackgroundDefinition authoring and CharacterCreation acquisition; B05/B08. Heritage permanently excluded. Unspecified advancement mechanics not required migration additions. |
| D13 | ActionDefinition/TraitDefinition nested validity B05; CharacterDefinition/Item/Creature capture ownership B08, explicit combat action execution B11. Feat/Discipline permanently excluded. No universal arbitrary-action executor claim. |
| D14 | LanguageDefinition/TableDefinition/CustomDefinition + CatalogCapture; B06. Entries are owned values; no invented JSON Schema interpreter. |
| D15 | Discovery claims/facets, Plot ownership and Creature knowledge, CampaignInstance progress; B05/B08/B10. Browser campaignPlotCollectionModel delegates Discovery. |
| D16 | PlotDefinition + CampaignDefinition membership/preparation + CampaignInstance objective/discovery progress/realization; B07/B10. Objectives/facets remain owned values. |
| D17 | PlacementDefinition + World/Campaign membership + Instance realization; B05/B07/B10. Captured inherited/independent identity remains stable. |
| D18 | CampaignDefinition, DefinitionLineage and campaign-migration owner policy; B07. Immutable captures/provenance/CAS remain repository. |
| D19 | CampaignInstance owns runtime composition/lifecycle/progress; B10, B11 atomic combat publication. B12 restore validates same owner; checkpoints immutable storage values. |
| D20 | CampaignSession, InstanceParticipation; B10. Auth, token delivery, presence clocks/outbox/database uniqueness remain adapters. |
| D21 | Encounter, combat-rolls, CampaignInstance publication + Session service; B11. Existing explicitly bounded execution and manual consequence decisions retained. Dice/formula/event values need no root. |
| D22 | Existing scene/party/clock/preparation values are preserved under CampaignDefinition/CampaignInstance B07/B10. No production rest/downtime/social executor exists to migrate; legacy shapes remain codecs, not new roots/mechanics. |
| D23 | GameSystem, RuleVariant, ContentPack, ExtensionSchema; B06 captured catalog dependencies/variant checks. Automatic enabling/version solver/patch executor excluded from existing migration scope. |
| D24 | ModelElement, ModelSchema, ModelMigration, definition-conformance; B07 compiler/runtime-validator consumers. Compiled releases are immutable projections. |
| D25 | WorldRule/RuleExecution, API world-rules/snapshot and movement services; B10 plus B12 result observation. DSL evaluation is shared machinery, actor commits use owners. |
| D26 | MapExploration, Map/Creature position commands; B09/B10. Geometry/picking/redaction/persistence are explicit boundaries. |
| D27 | InstanceParticipation + CampaignSession human/Agent policy; B10. Player profile/standing/credential/provider association remains identity platform (`PlayersService` CAS), explicitly accepted boundary; no gameplay credential root. B12 provides addressable profile/identity/membership navigation. |
| D28 | Location authored weather/media B09, Instance runtime overrides/manual playback B10. spatialAudioGain remains presentation math. |
| D29 | Legacy connection/travel DTOs remain historical decoding only; /connections redirects to canonical /hierarchy, visible Connections copy and generation travel-edge guidance removed. No historical deletion or adjacency resurrection. |
| D30 | Media/AI/auth/settings/Quick Start/graph/transfer remain infrastructure/application concerns. Current generated domain candidates use owners; historical archive restore is an explicit storage-only compatibility boundary. |

## Consumer reconciliation

| Row | Delivered evidence or B12 condition |
| --- | --- |
| C01 | world-authored-record, World draft validator and Definition authorPayload/conformance use owners; B05/B07. API media/auth/CAS retained. |
| C02 | world-codex-validation constructs concrete definition owners and disposes every Creature/Item branch (confirmed source); B05/B06. Resource routing and issue translation retained; excluded concepts remain compatibility. |
| C03 | PlacementDefinition + WorldDefinition and browser World membership delegation; B05/B07/B10 runtime realization. |
| C04 | Map policy B09, WorldRule policy B10; terrain chunk hashes/authorized capture closure remain I/O. |
| C05 | Discovery/PlotDefinition + CampaignDefinition validator B07; browser Discovery/Plot helpers delegate, Instance progress B10. |
| C06 | campaign-definition-policy.ts and CampaignDefinition own preparation/canvas/rich-text constraints B07. UI parsing, transport limits remain boundaries. |
| C07 | DefinitionLineage and definition-references/campaign-migration B07; B12 retires unused generic generator reachability and explicitly retains historical storage restore. Hashes/provenance/immutable captures/CAS remain adapters. |
| C08 | CampaignInstance factories/commands plus Creature/Item B08/B10. Captured selection/transaction persistence retained. |
| C09 | CharacterCreation + Character and atomic CampaignInstance activation B08/B10; B12 confirms current import ownership and preserves historical archive storage separately. Entropy/media/Player authorization retained. |
| C10 | Instance restore uses CampaignInstance.validateRuntime and captured compatibility checks. Campaign migration policy is domain-owned; checkpoint hashes, rollback and transactional CAS remain adapters. |
| C11 | CampaignSession/InstanceParticipation B10; DB uniqueness/tokens/clock retained. |
| C12 | session-movement-state apply uses Creature/Character commands B08/B10; revision/replay/visibility adapters retained. |
| C13 | ModelElement/ModelSchema/ModelMigration, compiler/runtime-validator delegates B07. Hashes/storage/lookup retained. |
| C14 | Active World candidates use LocationDefinition/canonicalWorldRecordIssue and World validation; Campaign generation uses PlotDefinition.validateHierarchy. Six unused direct generators and ContentPipeline are no longer injectable. Active scoped proposals/artwork remain. |
| C15 | Generic live runtime mutation is disabled. Retained generic authored methods are inaccessible to production controllers/providers and owner-gated where supported. Science/host archive restore is explicitly historical storage-only, with codec/metadata checks, private payload preservation and revision/hash conflict handling. It never publishes Definitions or mutates live Instance state. |
| C16 | World membership uses WorldDefinition; embodiment authoring now uses CreatureDefinition.embodimentPolicyForSave and Item image validation uses ItemDefinition.imageDimensionsIssue. Form state/request construction stay presentation concerns. |
| C17 | locationWorkspaceModel imports LocationDefinition/WorldDefinition, Map editor routes owner B09. Parent candidate convenience is nonauthoritative projection. |
| C18 | CharacterCreation applySelections/selectionsComplete delegate; option factory, Profession/Background helpers use owners B05/B08. Scalar field editing remains form state. |
| C19 | campaignPlotCollectionModel Discovery, referencesModel PlotDefinition and campaignAuthoringModel semantic merge helpers delegate; B05/B07. Labels/read projections remain local. |
| C20 | Pure common interpreters retained; B10 actor command commits, B11 Encounter, B12 RuleExecution scoped observable result. B12 removes duplicate common aggregate validators. |
| C21 | Map/isometricEditorModel command delegation B09; exploration authoritative update B10. Geometry/generation/meshing remain pure. |
| C22 | Actual viewport/canvas geometry, spatial audio and HTTP coherence retained. sideOnFallDamageDice only demo harness, explicitly retained demo-only mechanical policy, no live executor. |
| C23 | Duplicate common validators retired: CampaignDefinition.validateCapturedContent, CampaignInstance.validateRuntime/canTransition, CampaignSession.canTransition, InstanceParticipation.validateConsistency and PlotDefinition.validateHierarchy own retained policy. API, generation, browser and tests migrated. Pure numeric/value guards and historical DTOs remain common; no common→domain dependency. |


## Original acceptance and verification

All D01–30 and C01–23 rows above map to production owners, delivered prior evidence,
or an explicit value/I/O/legacy/excluded boundary. I00–I10 are reconciled. Existing
Entity/graph tests cover readonly metadata, command atomicity, no-op suppression,
event ordering, bindings, isolation, private round trips and teardown. B05–11 cover
manual authoring, immutable captures, hierarchy-only maps, Character extends Creature
and the sole Instance runtime owner; B12 adds the actual scoped observable consumer.
A class count or a successful build alone is not the completion criterion.

- Domain: **412 tests passed** across the package run and affected Session rerun.
  The first run passed 407 cases but one suite could not import a retired common
  helper; its five tests passed after updating that test-only import. Domain types passed.
- API: **137 suites / 937 tests passed; 8 suites / 43 tests skipped** under existing
  environment prerequisites. All 53 moved-contract tests passed after fixing test
  imports to use the package's single branded-type identity. Final API typecheck passed.
- Web: **78 files / 1,134 tests passed**; TypeScript passed. Production build and
  four prerendered routes passed. Affected API/web ESLint passed, including cleanup of previously unsafe Session test mocks;
  its 32 tests passed again after typing-only changes.
- Browser: **1440px and 390px** People profile refresh/Back, private provider subject
  exclusion, membership/Character links, Settings area/detail refresh/Back and
  unknown-area recovery passed. Screenshots were inspected; no horizontal overflow.
  Harness: `apps/web/scripts/b12-navigation-smoke.mjs`. The real components/client
  use disposable HTTP fixtures; this is not a live-database acceptance run.
- Historical archive tests preserve sparse Locations/private extensions while rejecting
  the same payload as a new live authoring write. Full API tests retain the existing
  authorization/CAS/restore regression coverage. No new live transactional race test
  was performed; skipped database tests are not represented as passing.

The AI-facing guide was compared with changed common declarations, owner methods and
`apps/api/src/domain/domain-resource.ts`; it was updated for owner routing and historical
travel/archive boundaries. Payload fields/resource mappings are unchanged. No database
migration or user-data rewrite was needed. Backend Architect, Frontend Developer and
Code Reviewer guidance was used, with audit, bounded-refactor, scope/continuity,
consumer and UX-verification skills. No commit or push was requested for B12.

## Measurement

Raw intervals: [b12-timings.jsonl](b12-timings.jsonl).

| Category | Commands | Aggregate seconds | Reruns |
| --- | ---: | ---: | ---: |
| browser | 4 | 24.89 | 0 |
| build | 3 | 32.50 | 0 |
| lint | 6 | 36.05 | 0 |
| tests | 12 | 134.49 | 2 |
| typecheck | 6 | 106.99 | 0 |

Measured command-seconds: **334.91**. Union of overlapping verification intervals:
**186.90 seconds**, not the sum of parallel commands. Recorded active-work markers:
03:58:15–04:08:23 UTC on October 15 (**10m 8s**).
Verification occupied 30.7% of that span while implementation/documentation
continued in parallel. Initial discovery before the marker, final handoff afterward,
manual fixture preparation/review, and blocking-only waits were not independently
instrumented; this is not account-usage attribution or a complete productivity metric.

Reruns addressed branded source-versus-package test types, a retired helper import,
readonly generic type depth, typed Session test mocks, and a disposable TypeScript
browser fixture discovered by a concurrent check. The fixture now uses JSX and is
cleaned up. Package suites and production build ran once; only affected checks were
repeated after fixes. Prior B05–11 audit and verification evidence was reused.
