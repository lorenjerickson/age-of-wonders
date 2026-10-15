# Project backlog

Updated 2026-10-14. This is the consolidated **known outstanding work from this
conversation and its active supporting inventories**, checked against current source.
It replaces the previous practice of showing only the next slice. Existing completed
records are retained below the horizontal rule; their historical “remaining” notes
are superseded by this open-work register.

## Current status and next step

**B12 complete — remaining consumers, navigation and migration closure.**
DM-16/17 and UX-09–11 are closed for existing migrated behavior. Remaining aggregate
validators/lifecycle predicates now use owners, rule execution consumes committed
observable state, unused direct generators are no longer injectable, and historical
archive restoration is explicitly isolated from live publication/runtime mutation.
People profiles and Settings area/detail destinations are addressable; World library
creation uses the canonical journey; legacy Connections links redirect to Hierarchy.
See [B12 closure evidence](docs/verification/b12-migration-closure.md) for every D/C/I
row, verification, measurement and retained boundaries. All twelve batches are closed
for their selected scope. Unselected product decisions/content work remain below;
Feat, Heritage and Discipline remain permanently excluded. B12 is included in the user-requested commit.

**B11 complete — contested rolls and simultaneous planned combat.**
Encounter now owns ordered plans, source-bound contested dice, durable reactions,
guided conflicts and simulated round publication. Session/API and responsive GM/player
consumers enforce ownership, revision checks, private projections and stale-state protection.
Confirmed: damage is max(0, damage minus resistance); attack margin >=10 triggers
critical damage dice doubling. Sparse actors require explicit health/profile setup.
See [B11 evidence](docs/verification/b11-planned-combat.md) for verification, bounded
summon/death-save/reaction execution, remaining rules-content decisions and measurement.
B07/B11 work is included together in the user-requested commit. B12 is completed above.

**B07 complete — Definition and Model lifecycles.**
Campaign aggregate/preparation, World/Campaign lineage and reference migration, and
Model element/schema/migration policy now have domain owners and real service consumers.
Campaign overlays and Plot Location actor/Item intents are editable through canonical
placements. The explicitly selected per-Location canvas controls cover all existing
built-in fields, with private content and captured data preserved.
See [B07 evidence](docs/verification/b07-definition-model-lifecycles.md) for verification,
measurement and the live-database limitation. B11 is completed above; B12 is completed above.

**B10 complete — Instance, Session and existing execution.**
Instance realization/progress, atomic Character/starting-Item activation, Session
lifecycle/readiness/presence, membership/Agent policy and existing rule/movement/
exploration consumers now use owners. Operational collection/detail destinations,
Discovery knowledge, Instance weather overrides and manual GM media controls are
implemented. Verification and its limits are recorded in [B10 evidence](docs/verification/b10-instance-session.md).
B11 combat redesign is completed above; B12 retirement is completed above.
UX-08's unselected new proficiency/profession screens remain a decision; existing
Character review/import/selections/equipment integrate through the B08/B10 boundary.

**B09 complete — Maps and authored Location capabilities.** Map/Wall/Door/Window
ownership, parent-routed Location/element mutations, intrinsic exploration policy and
weather/audiovisual configuration now have real editor/API consumers. Both map formats,
private fields, undo and capture boundaries are preserved. Instance runtime integration,
weather overrides and manual GM media playback are integrated in B10.

The map-image side quest is complete: empty local files caused the failed replacements.
Both editors and storage now reject them clearly; same-filename retry works, and the
standalone Map route's missing tools were restored. Valid replacements were verified
through preview, save and reload on desktop/mobile.

B01–12 are complete for their selected scope. Feat, Heritage
and Discipline remain permanently excluded. See [B09 evidence](docs/verification/b09-maps-location.md)
and [map-upload repair evidence](docs/verification/map-image-upload.md).
Next step: await user direction; no further batch or new gameplay is automatically selected.

## Consolidated delivery plan — 12 batches, not hundreds of slices

The earlier micro-slice estimates are withdrawn as the delivery plan. They fragmented
shared controls, owners and repeated verification. The detailed AU/QA/DM/UX/LOC entries
remain a coverage checklist, **not separate turns or separate full verification cycles**.
A batch can span several working sessions; internal checkpoints do not require another
“next slice” request. This reduces handoffs and duplicated work, not the actual scope
by a fictional factor of ten. No elapsed-time estimate is credible until measured.

**Five authoring batches** cover the currently selected direction. Seven further
batches organize the retained migration/features; B06–12 are complete for their selected scope. Decision-tagged
fields/libraries/custom extensions remain decisions, not automatic new requirements.
There is no unlisted “whatever comes later” category: all current open IDs map below.

| Batch / status | Complete deliverable | Coverage |
| --- | --- | --- |
| B05 Complete — authoring integration and acceptance | Existing editor routes, removal/Cancel, malformed/private preservation, current structural validation and owner delegation closed; representative authenticated database acceptance and finite field matrix recorded. | AU-25, QA-01–04, authored DM-04; authoring portion of DM-02 |
| B06 Complete — Entity graph and catalog foundation | Complete scoped graph hydration/reference validity/commands/observables/disposal and remaining catalog owners; settle entity-versus-value boundaries. | DM-01, DM-03 |
| B07 Complete — Definition and Model lifecycles | Complete World/Campaign/Model ownership, publication/fork/adoption/capture policy, Campaign overlays/intents and agreed preparation configuration. | DM-05–07, UX-01–03 |
| B08 Complete — actors, Characters and equipment | Migrate Creature/Character/Item runtime ownership, grants/acquisitions and Character lifecycle together with Character specialization and slot/Belt/Pack behavior. Establish Instance interfaces early; integrate activation in B10. | DM-09–11, DOM-01, EQ-01 |
| B09 Complete — maps and Location capabilities | Deliver Map/Wall/Door/Window ownership and accepted weather/A/V configuration, preserving both map formats. Map runtime visibility integrates with Instance in B10. | DM-08, DM-15, LOC-01–02 |
| B10 Complete — Instance, Session and existing execution | Complete Instance realization/progress, Session/membership, existing runtime command/state$ cutover and their operational views. Integrate B08/B09 against the Instance contract; preserve existing gameplay behavior. | DM-12–14, UX-04–08; integration of DM-10/15 |
| B11 Complete — combat redesign | Contested formulas, ordered plans, guided durable adjudication, atomic publication and GM/player consumers; bounded first-release contracts and content decisions recorded in B11 evidence. | COM-01–02 |
| B12 Complete — remaining consumers and operational navigation | Complete remaining import/restore/generator/legacy cutovers, People/Settings/library navigation and original migration acceptance audit. Authoring navigation already closed in B05 is not repeated. | DM-16–17, UX-09–11 |

B01–05 are the authoring finish line, excluding permanently retired AU-19–21. B06–12 do not become prerequisites for declaring
that milestone complete. B08–10 have cross-owner dependencies and share an integration
checkpoint. B11 is a new gameplay feature, not a requirement for migration acceptance.
Every batch closes its documentation and evidence; no surprise verification-only tail.

### Verification budget and measurement

All implementation batches time verification commands
using `scripts/measure-verification.py`, writing to a shared per-batch JSONL log:

```sh
python3 scripts/measure-verification.py --batch B01 --category tests --label web-focused --log /tmp/aow-B01-verification.jsonl -- pnpm --filter @aow/web exec vitest run <affected-tests>
```

Use categories tests, build, typecheck, browser and lint; flag repeated checks with
`--rerun` and record their reason in the handoff. The wrapper records UTC start/end,
monotonic elapsed duration and exit status, without logging arguments/environment.
Also record the batch's active work-session start/end times, excluding idle time
between user messages. Browser fixture preparation/debugging and manual review time
must be reported separately from subprocess runtime rather than treated as free.

Report at each batch boundary:

- Command durations by category and rerun count/reason.
- Total verification command-seconds (aggregate compute) and the **union of overlapping
  verification intervals** (wall-clock occupied by verification); never sum parallel
  runs and call that user waiting time.
- Active batch wall time and verification interval share; distinguish time when useful
  implementation continued in parallel from time blocked waiting on verification.
- Verification preparation/repair/review time when captured, plus instrumentation gaps.
  Do not backfill missing values from guesses or file modification timestamps.

Verification policy: focused checks while implementing; shared-control behavior tested
once with data-driven cases, owner adapters tested for their distinct boundaries.
At the stable batch boundary run affected package suites, one production build/typecheck
and representative desktop/mobile journeys. Retain meaningful owner-specific coverage
for persistence/identity/privacy/concurrency differences. Re-run only affected checks
when fixes justify it; don't rebuild unchanged production code for test-only fixes.
Required repository checks still apply. Do not rerun builds now merely to benchmark.

**Partial retrospective evidence (SE-19 logs):** web suite 6.23s; focused web run 2.05s;
focused rerun 0.774s; API run 17.197s; domain test-runner phase 1.083s. Vite reported
2.70s, 1.45s and 0.614s for three bundle phases. Those are runner/phase timings,
**not complete verification wall time**: browser setup/runs, whole build/prerender,
typechecks, prior reruns and manual inspection were not comprehensively timed.
A verification percentage or claimed time saving cannot be reconstructed honestly.
Compare measured batches to this limitation, not a fabricated historical baseline.

### Inventory status labels

Pending means selected-direction work remains. Decision means a known gap whose
product boundary is not settled. Deferred means retained work outside the current
priority. Partial/unverified is not completion. The Batch column below replaces all
micro-slice estimates; see the mapping above for shared ownership and dependencies.

### Scope and completion rules

The user selected authoring and structured editing, starting with Items, after
requesting entity-owned domain behavior. **B06 graph/catalog and B08 actor/equipment work are complete; unrelated runtime/experience
work stays paused until selected.** Built-in TypeScript capability gaps are evidence of missing coverage;
they are not permission to invent behavior, new constraints, arbitrary custom JSON
editors, or a new UI for every interface.

For each selected authoring package, completion includes owning-class validation,
AI-domain-guide comparison/update, correct consumer/owner integration, preservation
of optional/private/imported data, human-readable references, focused tests and
responsive save/read-back/reopen/error/conflict checks. Do not count those as a
fresh surprise slice after the feature. Live database closure is separately QA-03.

**Maintenance rule:** keep all in-progress, pending, decision and deferred entries
above the horizontal rule. On completion, move the whole entry below the rule with
verification and date; update totals/dependencies. Add newly discovered work above
the rule with its source and scope classification before proposing to implement it.
Never leave the full outstanding scope hidden behind a link or a completed entry.

## Permanent scope exclusions

Feat, Heritage and Discipline are permanently removed from scope by user decision
on 2026-10-13. AU-19 (Feat), AU-20 (Heritage) and AU-21 (Discipline) are retired,
not deferred or awaiting entry-point decisions. Do not reintroduce their editors,
libraries or further concept-specific implementation through B06–12 or older
inventories. This scope decision supersedes earlier deferral notes.

Existing implemented types, validation and persisted references remain historical
implementation facts; this scope update does not itself delete code or stored data.
No selected structured-authoring work remains outstanding.

## Selected authoring verification closure

QA-01–04 are complete in B05; the closure record is below. No verification-only
follow-up remains for B01–05. The explicit preserved-only and deferred fields in
the final matrix remain boundaries, not claims of universal field editability.

## Deferred original domain migration

These are existing obligations from the original OOP/self-validating/observable entity
request and active concept inventory, **not newly requested gameplay features**.
Authoring priority defers their execution; it does not mark them complete. Source:
`docs/domain-concept-consumer-inventory.md` D01–30/C01–23/I01–I10 and
`docs/entity-architecture-and-migration.md`, checked against domain exports and service
consumers. Exact entity-versus-owned-value boundaries remain decisions where noted.

The base Entity already implements generics, codecs, immutable observable state,
validation metadata, typed commands/events and bind-time mapping. Remaining production
integration is substantial: authoring classes largely expose validation/codecs/rename;
B06 now supplies scoped graph hydration/reference validity and remaining catalog owners;
B08 exports executable Creature/Character/Item and acquisition/equipment owners.
B09 supplies Location/Map element owners; B10 integrates Instance/Session owners and
existing rule, movement and exploration commands. Universal writer retirement remains B12.

| ID / status | Outstanding work / inventory coverage | Dependencies and completion boundary | Batch |
| --- | --- | --- | --- |
| DM-02 Authoring portion complete; remaining semantics deferred | B01–05 close supplied built-in structure, current publication policy and Vehicle component targets. Broader expression/reference/catalog resolution remains, excluding permanently removed Feat/Heritage/Discipline work. | Count authored validation once; B06 graph/catalog foundation and B08 acquisition ownership are complete; remaining adapter migration follows DM-16 and runtime execution DM-14. Missing editor does not imply a new root entity. | B06/B08/B10/B12 |
| DM-05 Complete in B07 — Campaign Definition | I06/D18/C05–07: content/readiness/membership/preparation and canvas layers/lights/sounds/drawings/templates/notes. | Existing Plot/Discovery/Placement classes; saves/publication delegate policy, preserve rich/private content. | B07 |
| DM-06 Complete in B07 — World/Campaign lineage | I06/D02/D18/C07: create/publish/fork/adoption/capture migration/reference rewrite. | Definition owners; retain immutable captures, provenance and external transaction/CAS/hash adapters. | B07 |
| DM-07 Complete in B07 — Model lifecycle | I06/D08/D24/C13: element/revision/schema dependencies, cardinality, release/adoption/conformance/migration. ModelElement/ModelSchema/ModelMigration own existing policy. | Compiler coordinates owners; preserve releases and compatibility; overlaps AU-23 UI but not same deliverable. | B07 |
| DM-08 Complete in B09 — Map, Wall, Door, Window | I05/D03–04: settle owned Map/Terrain boundary; concrete geometry/blocking/opening behavior; 2D legacy and 3D formats. | Preserve required maps, hierarchy position, image/terrain formats, private fields, scenic-grid exclusion and current spatial editing/captures. | B09 |
| DM-10 Complete in B08/B10 | Approved Character → Instance embodiment/physical starting Items now commits with approval and runtime/capture CAS; reactivation preserves runtime. Creation/review/import/status and existing membership binding remain intact. | B08 realization/binding ports; preserve schema capture, entropy/audit/provenance/private data. | B10 |
| DM-12 Implemented in B10 — Instance composition/progress | I07/D15–19: captured-pair realization, stable Placement identities, Plot/Discovery/knowledge progress, party/clock/inventory/checkpoints/migration/restore. | Runtime/definition owners; **Instance owns runtime**, no competing runtime World root. | B10 |
| DM-13 Implemented in B10 — Session/membership | I08/D20/D27/C11: Session status/readiness/participation/event boundaries, standing/membership/Agent transitions. | Instance; preserve active-session constraints, privacy/presence/auth boundaries. | B10 |
| DM-14 Implemented in B10 — existing execution cutover | I08/D19–22/D25: WorldRule owner, Encounter/Decision/Scene/rest/clock/downtime state; interpreter issues entity commands and observes scoped state$. | Runtime owners; preserve deterministic preview/replay/conflict behavior. COM features explicitly excluded. | B10 |
| DM-15 Existing B09/B10 integration implemented — map runtime/visibility | I08/D26/C21–22: actor positions, exploration/reveals/openings and stateful visibility mutations. | DM-08/09/12; preserve capture/redaction/recovery/current movement. Pure geometry/rendering stays external. | B09/B10 |
| DM-16 Complete — remaining writers/retirement | I09/C14–15/C23/D29–30: imports/restores/AI candidates/legacy generators/archive/raw writers and compatibility exports; retire stale Connections/travel terminology and behavior. | Every retained adapter gets consumer/removal conditions. Preserve historical decoding; no adjacency/travel graph resurrection or historical data deletion. | B12 |
| DM-17 Complete — migration closure | I10 and all D/C rows: verify original Entity/class ownership, codecs, state-only metadata, commands/events/binding, privacy/concurrency/observable lifecycle and source/guide/resource-map alignment. | Delivered evidence or accepted exclusions for every row before domain migration is called complete. Does not itself resume gameplay features. | B12 |

Primitives, expressions, immutable snapshots/events, DTOs, projections and geometry
are not automatically live entities. Objects/Traps/Hazards must reconcile with Item
families/capabilities rather than acquire invented peer roots. Authentication,
credentials, media I/O, provider calls, storage/hash/CAS and transport remain adapters.
These boundaries are retained decisions, not unimplemented entities.

## Deferred broader collection/navigation scope

The active one-to-many document includes this wider earlier application scope. It is
listed so it cannot disappear, but it is **not silently included in the current World
editing milestone**. Its baseline table predates delivered Plot work. Proposed
workspaces/destinations in `docs/figma-ui-refactor.md` require design reconciliation;
this inventory does not approve them or restart experience work.

| ID / status | Retained outstanding scope | Boundary / dependency | Batch |
| --- | --- | --- | --- |
| UX-01 Complete in B07 | Campaign placement overlay list/Add/Edit/removal | Preserve independent/inherited/decoration source ownership and named impact. | B07 |
| UX-02 Complete in B07 | Plot Location context actor/Item intent editing | Canonical placements author actor/Item intents and reciprocal context associations; deprecated inline intents remain preserved. | B07 |
| UX-03 Complete in B07 — selected | Per-Location preparation canvas configurations | All existing built-in layers/light/sound/drawing/template/note fields exposed; ordinary notes stay scalar forms. No new canvas runtime. | B07 |
| UX-04 Implemented in B10 | Instance Plot/objective progress and Location realization/knowledge detail | Supported audited commands, no editing captured Definitions. | B10 |
| UX-05 Implemented in B10 | Placement realizations/embodiments/Item instances | Supported realize/defer/replace/remove operations; runtime ownership first. | B10 |
| UX-06 Implemented in B10 | Instance members/invitations/Character review/import and Agents | Authority, revoke/review lifecycle and profile/assignment distinctions preserved. | B10 |
| UX-07 Implemented in B10 | Session plan/detail flow | Preserve lobby/start/pause/conclude/cancel and history; no new combat flow. | B10 |
| UX-08 Existing Character/equipment integration complete; new screens decision/deferred | Player Character rich selections/inventory/proficiency/profession | Owner and runtime/equipment dependencies; no forced pages for scalar allocation. | B10 |
| UX-09 Complete | Player directory profile and identity/membership navigation | Read-only or command-controlled identity; no generic credential CRUD. | B12 |
| UX-10 Complete | Settings area/setting addressability | Fixed taxonomy; credential rotation/revocation remains protected. | B12 |
| UX-11 Complete | World/Campaign library lifecycle navigation | Verify selected lineage, create/cancel and immutable history destinations; overlaps AU-25. | B12 |

Previously delivered Campaign root/subplots, Objectives/Pressures/Resistances,
Discovery facets, Location contexts/placement associations and Plot prerequisites/
dependencies are **not reopened**. See the completed Plot-slice evidence in
`docs/campaign-authoring-verification.md`. Read-only revisions/events/receipts and
spatial terrain cells do not need generic CRUD. Broader product gaps such as Player
live maps, automatic execution, operations tooling and unrelated generated media
are not added as obligations of this conversation.

## Deferred explicit Location capabilities

| ID / status | Accepted requirement still outstanding | Re-entry / completion boundary | Batch |
| --- | --- | --- | --- |
| LOC-01 Complete in B09 — authored weather | Open condition, optional temperatureCelsius, wind speedKph and optional directionDegrees. Authored defaults and Instance runtime overrides implemented in B09/B10. | Authored Location owner, commands/codecs, API and responsive editors/read-only summary verified. Source: accepted Location ledger. | B09 |
| LOC-02 Complete in B09 — authored audiovisual | Named asset-backed audio/visual effects, enabled/loop and audio volume or visual opacity in 0–1; preserve current spatial-audio consumers. | Authored World configuration and scoped media UI verified; manual GM playback is implemented in B10; automatic/cross-participant dispatch is not introduced. Distinct from mechanical Conditions/Effects. | B09 |

## Deferred user-requested feature changes

The four existing entries below retain the user's requirements verbatim in substance.
They are outside the authoring milestone and original existing-behavior migration.
DOM-01 overlaps actor composition; EQ-01 depends on actor/Item ownership; COM-01
formula contributions depend on equipment/skills/attributes; COM-02 depends on agreed
combat timing/reconciliation. No reliable implementation estimate is assigned before
those mechanics and integration boundaries are resolved. That uncertainty is visible,
not a claim these entries are small or finished.

## COM-01 — Contested combat rolls (complete, 2026-10-14)

User-requested future combat change: determine hits through contested attack and
defense rolls, and damage taken through contested damage and resistance rolls.
Compose each roll formula from contributions supplied by equipped armor, weapons,
skills and attributes, including applicable condition modifiers.

Reference scenario: Actor A strikes Actor B with a sword. A's attack formula is
base `1d20 + 1d4` from high Dexterity `- 1d2` from being poisoned. B's defense
formula is `1d10` from chainmail `+ 1d6` from plated gloves `+ 1d8` from a helmet
`+ 1d2` from bracers. A rolls `13 + 4 - 2 = 15`; B rolls
`10 + 4 + 1 + 2 = 17`; A misses.

Selected for B11. Confirmed resolution: defenders win ties; damage taken is
max(0, damage minus resistance); attack minus defense >=10 doubles damage dice
counts without doubling constant terms. Formula contributions bind to captured
actor, equipment, Attribute, Skill and Condition sources. Implemented and verified;
see [B11 evidence](docs/verification/b11-planned-combat.md).

## COM-02 — Simultaneous evaluation of planned orders (complete, 2026-10-14)

User-requested future combat change: account for simultaneous evaluation of orders
given during turn planning. Requirements are recorded in
[Simultaneous combat requirements](docs/simultaneous-combat-requirements.md).
Selected with COM-01 for B11. The confirmed guided-resolution requirements in
[Combat system requirements](docs/combat-system-requirements.md) govern ordered
plans, simultaneous checkpoints, durable GM adjudication and atomic round
publication. Implemented and verified within the explicit first-release execution
boundary in [B11 evidence](docs/verification/b11-planned-combat.md).


---

## B06 — Entity graph and catalog foundation (complete, 2026-10-14)

DM-01: graph-local identities/references, dynamic dependency validity, isolated
hydration, persistent child ownership, explicit validation modes, mutation rejection,
commit-only state/events, registration rollback and cascading disposal are implemented.
CatalogCapture integrates the graph with actual World publication. Prisma/CAS remains
the durable authority; request-local candidate state is discarded on failure.

DM-03: Language, Table, Custom, ExtensionSchema, RuleVariant, ContentPack and GameSystem
have concept-specific owners/codecs/commands. Table entries, patches, dependencies and
nested catalog/schema structures are owned values. Internal archive create/replace and
World draft/publication consumers delegate, preserving private fields and draft forward
references. Exact registration/variant/required-pack checks do not invent JSON Schema
execution, version-range solving or patch execution.

Verification: 345 domain, 914 API and 1,114 web tests passed; two real PostgreSQL
archive/persistence/concurrency checks passed. Build/prerender, typechecks and targeted
lint passed. Disposable database removed; common types/resource mapping unchanged and
AI guide synchronized. Measured session 9.64 minutes (initial instruction reading before
marker excluded); verification union 2.64 minutes, aggregate command time 4.17 minutes.
See [evidence, boundaries and raw timings](docs/verification/b06-entity-graph-catalog.md).


## B08 — actors, Characters and equipment (complete, 2026-10-13)

DM-09 and DM-11 owners now serve actual realization, placement, movement, Character
activation and equipment adapters. DM-10 draft/selection/review/import/status policy
is complete; its Instance integration remains B10 above. Entity commands retain
immutable state, observable commit publication and private/imported source data.

Verification: domain 326, web 1,114, API 899 passed; seven actual PostgreSQL checks and
seven authenticated desktop/mobile browser checks passed. Production build and
compiler checks passed; AI domain guide updated. Apply the additive draft sourceSheet
migration on deployment. See [B08 evidence](docs/verification/b08-actors-equipment.md)
for precise boundaries, checks, cleanup and measured verification time.

## EQ-01 — Slot-based equipment for Creatures and Characters (complete in B08, 2026-10-13)

User-requested equipment feature: items declare compatible equipment slot(s).
Actor slots include head, neck, shoulders, arms, wrists, hands, main hand, off hand,
waist, legs, feet and back. A helmet must be equipped to a head slot.

Belts and Packs are containers with their own slots. Consumables, Tools and other
items may be configured for belt slots, granting immediate access during combat.
The same items may be equipped in a pack; retrieving an item from the pack and
equipping it requires a bonus action. Belt/Pack slot counts vary by quality and
rarity. Preserve this requirement alongside COM-01/COM-02; do not infer exact
capacity tables, compatibility rules or transfer semantics beyond those stated.

Implemented shared owner, canonical storage authoring and Instance Equipment UI.
Capacity is explicitly authored by item/quality/rarity. Pack retrieval atomically
consumes one explicit bonus action; equipped Belt retrieval is immediate. Verified
in domain/API/PostgreSQL tests and desktop/mobile authenticated browser journeys.

## DOM-01 — Character specialization of Creature (complete in B08, 2026-10-13)

User-requested domain direction: Characters and Creatures share almost all behavior.
Characters are single-instance entities, conceptually an instantiation of a Creature
template; Creatures can be replicated as needed. The Character domain type should
extend the Creature domain type. Aliasing Creature type parameters for Character
is acceptable.

Runtime Character now extends Creature, sharing placement, rules, effects and
equipment behavior; uniqueness/factory/binding policies preserve sparse captures.
Actual activation-to-embodiment integration remains explicitly B10.


## B05 — authoring integration and acceptance (complete, 2026-10-13)

AU-25 and QA-01–04 are closed with real-router reachability, supported Cancel/removal,
malformed/private/unknown preservation, explicit draft/publication structural policy,
and the finite common-field audit. Active authored DM-04 policies now delegate to
World, Location, Discovery and Plot owners; played Character selection remains under
DM-10, and inactive legacy merge helpers are not active domain consumers.
DM-02's selected authoring portion is complete; broader graph/catalog/execution and
legacy adapter migration remain deferred under the open mappings above.

Sixteen real authenticated PostgreSQL/MinIO desktop/mobile checks passed, including
save/reload/export, viewer/outsider protection, stale/malformed atomic rejection,
reference-safe removal, an injected client failure with real retry, and immutable
publication. Full suites: web 1,109, API 892 (34 optional skips), domain 298; affected
final checks and compiler results are in the verification report. Disposable database,
14 test media objects, empty test bucket, isolated processes and credentials removed.
AI-facing domain guide synchronized; no common persisted type/resource mapping change.

See [acceptance, policy, evidence and measurements](docs/verification/b05-authoring-acceptance.md)
and [field/DM04 matrix](docs/verification/b05-authoring-coverage.md). AU-19–21 are permanently retired;
B06–12 remain deferred with those concepts excluded. This closes the selected authoring milestone, not the original
whole-domain migration or engine work.

# Completed work

Move completed entries here, retaining their IDs, date, outcome and verification.
Historical follow-up text inside these records does not supersede the open register.

## B04 — World structured collections (complete, 2026-10-13)

Location claims and Creature/Item placements, Model vocabularies/schema elements,
and World rules/effects/conditions now have dedicated list/Add/Edit contexts.
Named references, responsive controls, revision-pinned persistence, source-safe
removal and imported/private data preservation are covered. Existing Model destination,
immutable release/adoption/archive, flat Location claim schema and separate WorldRule
grammar remain intact. Common types and resource mappings are unchanged; the AI
model guide was compared and updated for the authoring boundary.

Verification: 1,083 full web tests, 247 final affected tests and 37 API tests passed.
API typecheck and final web build/prerender/typecheck passed, as did targeted lint,
UI primitive and whitespace checks. Desktop/mobile HTTP-fixture journeys cover
save/read-back/reopen, Cancel, pending/500/409, read-only, malformed/opaque imports,
ordering/removal and preservation. Independent review findings were fixed. Existing
rules/movement regression passed. Authenticated database evidence remains QA-03/B05.

See [B04 coverage, measurements and limitations](docs/verification/b04-world-collections.md).

| Completed coverage | Deliverable | Done criterion | Batch |
| --- | --- | --- | --- |
| AU-22 Complete — Location owned collections | Dedicated supported claim and Creature/Item placement list/Add/Edit. Location claims retain DiscoveryClaim[]; Plot facets are separate. | Identity/provenance/private content, source-safe removal, required-map/hierarchy/scenic-grid behavior preserved. | B04 |
| AU-23 Complete — Models | Vocabulary elements/revisions and Schema Concepts/Fields/Relationships use dedicated contexts. Existing Models & taxonomies destination retained; no move under Rule system. | Exact adoption, immutable releases, failed-adoption retry and archive preserved. | B04 |
| AU-24 Complete — existing World rules UI | Dedicated rule/ordered-effect/recursive-condition contexts. | Separate WorldRule contract, revision checks and engine semantics preserved. | B04 |

## B03 — Profession and Background authors (approved scope complete, 2026-10-13)

Existing Profession and Background libraries now expose built-in fields with
separate tier/grant/acquisition/Action-improvement and shared rule/Choice contexts.
Exact Model rank keys, named references, revision-pinned saves, Model gates on direct
entry, optional/private/malformed-data preservation and responsive navigation are
implemented. New Professions can save before their first tier is added. Common types
and persisted resource mappings are unchanged; the AI domain guide was compared and
updated. Feat, Heritage and Discipline received recursive owner validation only;
their entry points were initially deferred and are now permanently removed from scope
under retired AU-19–21.

Verification: 1,050 web tests; 289 full-suite domain tests plus one added regression
(290 unique); 79 unique API tests across eight affected suites. Final affected web
regression run: 223 tests. Domain/API typechecks, domain/web builds, web prerender and
typecheck, targeted lint, UI primitive and whitespace checks passed. Browser journeys
passed at 1440/390 px with save/read-back/reopen, filtering/preservation, 500/409,
read-only/malformed owners, missing-Model direct-entry gates and legacy conformance
stamping. Screenshots inspected; controls meet 44 px and no horizontal overflow.
Browser evidence uses disposable HTTP persistence; live database closure remains QA-03.
Independent review findings were fixed. No runtime work resumed.

Measured verification: 269.35 command-seconds; overlapping interval union
231.56s, 27.7% of the 13.95-minute recorded active-session window.
Initial discovery, manual preparation/review duration and blocked waiting were not
fully instrumented. Category durations, rerun reasons and limits are in
[the B03 verification record](docs/verification/b03-character-authoring.md).

| Completed coverage | Deliverable | Done criterion | Batch |
| --- | --- | --- | --- |
| AU-16 Complete — Profession tiers/grants | Dedicated expertise-level and grant contexts, order/costs/windows/prerequisites/benefits, including modifier grants/rule modifiers/Trait references/resource maximums. Dedicated tier and benefit contexts delivered. | Exact adopted rank identity, owner validation, shared expressions/predicates. | B03 |
| AU-17 Complete — Profession progression | Acquisition, Actions/improvements, advancement points/limits/qualifying predicates, Choices/prerequisites/mutual exclusions. | AU-16 and shared rules; no runtime advancement. | B03 |
| AU-18 Complete — Background | Attribute/skill/tool/language/equipment/Feat/feature references, characteristics and Choices beyond description/modifier grants. | Named references; owned child editors only where appropriate, not pages for scalar selections. | B03 |

## B02 — Item, Creature and Character authors (complete, 2026-10-13)

Delivered AU-13–15 together. Item `owner/` list/detail contexts cover prerequisites,
modifiers/predicates, attunement, capacity maximum/recharge, crafting time/check,
currency costs, ingredients, tool proficiencies and products. Nested edits preserve
private/imported fields, optional omission, siblings and other draft records.

Settled the catalog boundary against common source: richer Creature mechanics use
`MonsterComponents` (`kind: monster`), separate from governed World `kind: creature`
and its numeric skills map. Bestiary now links Catalog Creatures; Characters links
Catalog Character templates (`kind: character-template`), separate from World NPCs
and Instance Characters. Both support list/create/edit; new records are indexed in
World membership. Existing governed World Creature/NPC editors remain intact.

Creature collections include all six Action collections, Traits/regional Traits,
skills, speeds/restrictions, damage adjustments/predicates, senses, communication
and Discipline sources/references. Character templates expose Traits, Choices/
Options/prerequisites and all existing attribute-generation variants. Shared nested
rule pages cover owned Action/Trait rules, including triggers, costs, modifiers and
Choices. Full-draft writes use pinned revisions, preserve records and rely on the
existing server-side terrain-chunk preservation boundary. Custom/unknown data stays
preserved-only. No runtime combat, slot equipment or Character inheritance work resumed.

Added concrete MonsterDefinition and completed owning-class Item/Character grammar.
Draft validation permits unchanged malformed inherited B02 fields, rejects newly
malformed supplied fields and retains unresolved incomplete-draft diagnostics.
Publication has no baseline exemption. Common types and persisted resource mappings
were compared and remain unchanged; the AI-facing domain guide was updated for
validation ownership and the catalog/World distinctions.

Verification: full web run1017 passed; two additional focused regressions passed
(1019 unique tests covered). Domain264 and relevant API138 tests covered/passed.
Production bundling/prerender passed; its typecheck exposed three integration/test
annotation issues, repaired and verified by standalone web typecheck without
rebundling unchanged behavior. Domain/API typechecks, focused ESLint and UI primitive
checks passed. Desktop1440px/mobile390px disposable-HTTP browser journeys passed:
Item fields, six Creature Action owners, Trait/regional rules, skills/speeds/senses,
Character rules, catalog creation/indexing, save/read-back, pending saves,500retry,
409 protection, read-only behavior, masking,44px controls and no overflow. Browser
verification found and verified a fix for top-level catalog singleton saves failing
to return to the owner. Live authenticated database acceptance remains QA-03/B05.

Used Frontend Developer, Software Architect and Code Reviewer definitions with
bounded parallel implementation/review. One owner ran each package-wide check.

Measured verification including failures: tests 55.1s; builds
27.5s; standalone typechecks 34.0s; browser subprocesses
79.2s; lint/UI checks 18.7s. Aggregate command time
**214.4s**; union of overlapping verification intervals **173.7s**,
25.5% of the instrumented active session (11.3 minutes,
2026-10-14T03:24:07.230875+00:00 through 2026-10-14T03:35:27.886060+00:00). This is occupied verification
wall time, not blocked waiting: other implementation continued in parallel.
Initial browser fixture preparation was separately measured at107.6s; later fixture
repairs/manual review and initial reads/delegation were not separately measured.
Do not add overlapping preparation time and command runtime into a waiting-time claim.
Final documentation handoff occurs after this cutoff.

13 commands flagged as reruns: domain Dice fixtures/old validation expectations,
baseline-preservation policy and diagnostic paths, unused imports, owner-guard
regression checks, browser label/membership fixture assumptions and the real catalog
return-navigation fix, final integration lint and web type annotations. Package-wide
web checks were centrally owned; the successful bundle was not repeated for type-only
repairs. Raw command records: `docs/verification/b02-timings.jsonl`; initial browser
preparation: `docs/verification/b02-browser-preparation.json`. Next: B03.

### Closed coverage checklist: AU-13–15

Original audited gaps retained for scope traceability; the completion and explicit
catalog boundary above supersede their former limitations and pending decisions.

| ID / status | Original audited gap | Completion boundary | Batch |
| --- | --- | --- | --- |
| AU-13 Complete — Item owner reuse | Item prerequisites, modifiers, attunement prerequisites; capacity maximum/recharge expressions; crafting time/cost/ingredients (Item/tag/quantity/consumed), tool proficiencies/check/produces. Current mechanics routes primarily cover Traits/Actions/Vehicle. | Reuse AU-01/04 and existing collections; reconcile already editable base fields before adding controls. New slot mechanics belong EQ-01, not this row. | B02 |
| AU-14 Complete — Creature mechanics | Traits, Actions, bonus Actions, Reactions, legendary/mythic/lair Actions, regional Traits; richer authored skills/speeds/damage adjustments/senses/communication/Discipline references beyond current routine statistics. | Reuse shared rule editors for actual MonsterComponents owners, preserve imported content and supported existing selections. Runtime actor behavior excluded. | B02 |
| AU-15 Complete — catalog Character templates | Traits, Choices/Options/prerequisites and attribute-generation variants. Distinct from flat World NPC template and Instance Character creation. | Set explicit entry point/field boundary; reuse editors without conflating the three owners. DOM-01 remains separate. | B02 |

## B01 — Shared rule authoring (complete, 2026-10-13)

Delivered AU-01–12 as one batch. Shared controls cover all built-in Numeric/Scalar
expressions, dice terms/modifiers, D20/opposed tests, Duration and sustaining,
Action targets/areas/filters, all 23 noncustom Effect kinds, and Choice catalog
references/named values/structured JsonValue. Integrated direct Item, Trait and
Vehicle Actions and Trait Triggers, comparisons, modifiers, resource costs and
usage maxima. Nested rule collections have focused addressable list/Add/Edit
contexts; singleton predicates, Modifiers and Choices retain their owner ancestry.
Vehicle ancestry now reconstructs on direct entry as well as child navigation.

AU-11 closes with named catalog selection and structured JSON value controls;
catalog execution/resolution semantics remain deferred. AU-12 closes with the
accepted preserved-only boundary: custom Predicate/Cost/Effect/Area payloads and
unknown tags remain opaque; emit-event names are editable while payloads are
preserved. No arbitrary custom schema editor or runtime interpreter was added.

Class-owned recursive validation follows the common types, retains diagnostic
paths and distinguishes missing required values from malformed supplied values.
Common wire contracts and resource mappings are unchanged. The AI-facing domain
model guide was compared against affected source types and updated for validation.
Private/optional/imported data, sibling collections, named references and revision
conflicts remain protected.

Verification: 979 web tests across the full run and affected-file reruns (the full
run passed 877 tests but found a new navigation-test syntax error; its corrected
file passed 101, plus one subsequently added target regression). Full domain suite
260 and relevant API suite90 passed. Domain/API typechecks, web production build
including typecheck, targeted ESLint and UI primitive checks passed. Browser checks
at1440px/390px exercised complex rules, four owners, nested save/read-back, private/
sibling/custom preservation, pending saves,500/409 recovery, read-only handling,
identifier masking,44px targets and overflow. This used a disposable HTTP fixture,
not authenticated live-database acceptance; QA-03 remains open in B05.

Frontend Developer, Software Architect and Code Reviewer guidance supported the
implementation and delegated checks; Sprint Prioritizer guidance informed batching.

Measured verification (including failures): tests 39.1s; builds
26.8s (web production build/typecheck21.0s); standalone typechecks
57.4s; browser subprocesses 46.2s; lint/UI checks
14.4s. Aggregate command time **183.8s**; union of overlapping
verification intervals **161.1s**, 22.1% of the measured active session
(12.2 minutes, 2026-10-14T00:56:36.078819+00:00 through 2026-10-14T01:08:45.589946+00:00).
This interval share is not blocked waiting time: implementation continued in parallel.
Initial reads/delegation preceded instrumentation; fixture preparation, repairs and
manual review were not separately timed, so no total-overhead or time-saving claim
is made. Final documentation handoff occurs after this measurement cutoff.

There were 13 flagged rerun commands. Reasons: expanded domain grammar/fixtures,
React-version SSR harness mismatch and label repairs, target/label review, JSX and
navigation-test syntax repairs, Vehicle breadcrumb regression/expectation repair,
lint repairs, and two browser fixture selector/wait corrections. Two agents also
ran overlapping early web typechecks; B02 will assign package-wide verification to
one owner to avoid that duplication. Raw command records are preserved in
`docs/verification/b01-timings.jsonl`; temporary detailed logs remain under
`/tmp/aow-B01-*`. Next batch is B02; no deferred engine work resumed.

### Closed coverage checklist: AU-01–12

The following original audit details are retained as the pre-batch gap record;
the completion and custom-payload boundary above supersede their former limitations.

| ID / status | Original audited gap | Completion boundary | Batch |
| --- | --- | --- | --- |
| AU-01 Complete — shared expressions | Numeric attribute-modifier, proficiency-bonus, level, resource, arithmetic (add/subtract/multiply/divide/floor/ceil/min/max and operands), conditional (string predicate and branches). Scalar dice, attribute-score, skill-bonus, lookup/table/key, choice-value, structured literals. Current controls cover constant, primitive literal, path, event-value, collection-count; usage maximums only constant/path and resource costs only constant. | Named references/bindings; reuse one grammar across comparisons, modifiers, costs, usage maximums and Effects. Structured/open values depend on AU-11/12. No expression execution. | B01 |
| AU-02 Complete — dice | Expression/term labels, expression-valued counts and roll terms; keep/drop highest/lowest, reroll/once, explode/maximum-extra, minimum/maximum modifiers. Current Effect controls only handle constants and simple dice without modifiers. | AU-01; reuse existing weapon/armor dice controls where applicable. Preserve order and imported terms. | B01 |
| AU-03 Complete — Action targets | Count, area, filters, requiresSight, canTargetSelf, relationship; cone/cube/cylinder/emanation/sphere/line/wall dimensions. Current inline editor covers kind/range only. Dedicated target collection contexts remain missing. | AU-01, existing predicates; custom area is AU-12. Integrate direct Item/Trait/Vehicle owners. | B01 |
| AU-04 Complete — Action tests | D20 test kind, attribute, Skill reference, proficiency, numeric difficultyClass, opposedBy, roll mode, critical ranges, ties. Currently preserved, shallow validation. | AU-01 and named references. Author declarations only; this does not implement COM-01/02. | B01 |
| AU-05 Complete — duration and sustaining | sustainedOperation and Duration: instantaneous, until-event, permanent/neutralizable, measured amount/unit, special description. | Shared duration editor/validator used by Action and Effects; preserve event/binding values. | B01 |
| AU-06 Complete — scalar Effects | temporary-hit-points (target/amount/replaceOnly), change-resource (target/resource/delta/allowOverflow), set-value (target/path/value). | AU-01; same controls under Outcomes and Triggers. This was the proposed next slice, not work already started. | B01 |
| AU-07 Complete — condition/modifier Effects | apply-condition (duration/saveEnds), remove-condition, apply-modifier (embedded modifier/duration). | AU-04/05 plus existing modifier/predicate controls; no runtime grant execution. | B01 |
| AU-08 Complete — reference/lifecycle Effects | remove-effect, transit, grant-action, award-profession-points, deploy, create-object, destroy-entity; their target/reference/count/amount/duration/position/distance fields. | AU-01/05, named references and runtime binding policy. Transit must not restore retired Location adjacency or travel graphs. | B01 |
| AU-09 Complete — test/choice Effects | make-test, repeat-save with onSuccess Effects, choose with embedded Choice and result binding. | AU-04, Choice controls, recursive Effect child paths. | B01 |
| AU-10 Complete — flow Effects | branch with predicate/whenTrue/whenFalse; for-each with collection/binding/Effects. | AU-01 and shared predicates; nested ownership/navigation. Runtime interpreter remains deferred. | B01 |
| AU-11 Complete — catalog/structured Choice values | optionCatalog selection/resolution, named DefinitionId values, object/array values. Primitive values and Option prerequisites are already editable. | Decide catalog authority and supported structured-value UX; do not turn an arbitrary JsonValue into invented domain fields. Included only within the agreed Choice boundary. | B01 |
| AU-12 Complete — custom extension authoring | Custom Predicate rule/payload, ActionCost key/payload, Effect emit-event/payload and custom rule/payload, custom AreaShape key/payload. Current opaque imports preserved/read-only. | Choose registered schema-backed editing versus explicit preservation-only support. Unknown discriminants remain preserved, not an unbounded implementation promise. | B01 |

## PLAN-02 — Consolidated batches and verification timing (complete, 2026-10-13)

Replaced micro-slice scheduling with 12 mapped delivery batches: five authoring,
seven deferred migration/feature batches. Retained all59 inventory entries and four
user feature requirements. Sprint Prioritizer review checked coverage/dependencies.
Added a lightweight verification timer; verified success/failure exit propagation
and timing records with no-op commands. Existing logs provide only partial phase
runtime, not historical end-to-end overhead. No application feature implementation
resumed; domain contracts and AI guide remain unchanged.

## PLAN-01 — Consolidated outstanding-work inventory (complete, 2026-10-13)

Reconciled this conversation, active documentation and current source with separate
Code Reviewer, Product Manager and Software Architect audits. Enumerated remaining
Item/rule fields, other authoring owners, verification/policy closure, original domain
migration, broader inherited collection scope, Location deferrals and user-requested
features. Separated pending work from product decisions and deferrals; added dependency,
completion and rough slice ranges without fabricating a calendar ETA. Preserved
SE-01–19, ART-01 and all four user-added feature entries. No application code or domain
contracts changed. The AI-facing guide remains accurate because this is backlog-only.

## SE-01 — Structured Item editing foundation (done, 2026-10-12)

Items now expose addressable Trait and Action lists and Add/Edit pages, including
Trait-owned and Vehicle-owned Actions. Forms edit names/descriptions, Action
activation and targets/ranges, and Vehicle type/size/defenses, movement speeds,
crew/passengers, cargo, and named component Item references. Save/Cancel, confirmed
removal, named ancestry, and stale-write recovery are implemented. Unexposed rules,
identity tags, private metadata, extensions, and sibling records are preserved.
API requests preserve omitted sections, clear lists explicitly, and remove Vehicle
only through explicit null. AI-facing domain guide updated alongside the request
contract; underlying Trait/Action/Vehicle types remain unchanged.

Verification: 363 web tests, 28 Item domain tests, 40 authoring-service tests;
common/domain builds, web production build, web/API typechecks, targeted lint,
and UI primitive checks passed. Browser journeys passed at 1440 and 390 px,
including save/reopen, nested editing/removal, cancellation, failure/409 recovery,
44 px Vehicle controls and no horizontal overflow. The browser harness exercises
real components and the API client against an in-memory HTTP fixture, not a live
database or the complete authenticated application shell. Production route and
breadcrumb behavior has separate tests. Script: `apps/web/scripts/item-mechanics-smoke.mjs`.

## SE-02 — Action outcomes and effects (done, 2026-10-13)

Direct Item, Trait-owned and Vehicle-owned Actions now expose addressable ordered
Outcome/Effect lists and Add/Edit pages. Forms cover narrative, damage, healing
and movement effects; simple constant/dice terms; unspecified/always/never Outcome
conditions. Save/Cancel, confirmed removal, consecutive reorder, revision-pinned
stale-write rejection and in-flight navigation protection are implemented. Parent
ancestry uses named Actions and ordinal Outcome/Effect labels, never internal IDs.

Advanced effects/expressions/conditions and private/sibling data remain preserved.
Unsupported effects are read only with explicit reorder/removal. Imported ambiguous
Outcome identities are safely blocked from editing rather than normalized or lost.
Action owns indexed validation of exposed effect fields; missing information is
unresolved while malformed supplied values are invalid. The AI-facing domain guide
was compared with common source and updated for validation ownership/limits;
common types and persisted mappings remain unchanged.

Verification: 390 web tests, 214 domain tests, 44 API authoring tests, domain and web
production builds, web/API typechecks, targeted lint and UI primitive checks passed.
Browser journeys passed at 1440/390 px for nested ownership, save/read-back/reopen,
consecutive ordering/removal, dice-count clear/retype, delayed saves, cancellation,
500/409 recovery and preservation. Screenshots confirm responsive stacked fields.
Script: `apps/web/scripts/item-outcomes-smoke.mjs`. Browser checks exercise real
components/client against authoritative in-memory HTTP fixtures, not live database
or authenticated-shell persistence. Route/breadcrumb behavior has separate tests.

## SE-03 — Structured Action costs (done, 2026-10-13)

Delivered dedicated ordered cost list/Add/Edit under direct Item, Trait and
Vehicle Actions at each Action's `/costs`, `/costs/new` and `/costs/:index` paths.
Economy, resource constant amounts, capacity band, item-use, hit-die and movement
fields support save, cancel, confirmed removal and reorder. Custom costs and
advanced expressions remain preserved; replacing an advanced amount is explicit.
Optional values, sibling data, private fields and capacity source references are
retained. Known internal references and UUID bindings use neutral labels and
require confirmation before replacement. Action owns indexed cost validation;
missing fields remain unresolved, while malformed supplied values are rejected.
Common contracts and persisted mappings are unchanged; the AI-facing domain guide
was compared with the common types and updated for validation ownership/limits.

Verification: 423 web tests, 217 domain tests and 47 API authoring tests passed;
domain build/typecheck, web build/prerender, web/API typechecks, targeted UI lint and UI primitive
boundary checks passed. `apps/web/scripts/item-costs-smoke.mjs` passed at 1440 and
390 px: six cost forms, all three owners, repeated ordering, numeric clear/retype,
Cancel, pending-save protection, 500/409 recovery, private/advanced data retention,
opaque-reference preservation/replacement, 44px controls and no overflow. Browser
checks exercised real React controls and API client against an authoritative
in-memory HTTP fixture, not authenticated database persistence.

## SE-04 — Structured Action choices (done, 2026-10-13)

Delivered Choice and Option lists/Add/Edit for direct Item, Trait and Vehicle
Actions at `/choices/:choiceId` and `/choices/:choiceId/options/:optionId` beneath
each Action (collection roots and `new` supported). Forms expose prompts, selection
limits, optional visibility/duplicates, labels and text/number/boolean/null values.
Catalog references, prerequisites, complex values and private/sibling data remain
preserved; protected values require explicit confirmed replacement. Internal
identities stay hidden and stable. Ambiguous imported identities safely block
editing. Save/Cancel, confirmed removal, consecutive reorder, stale-write guards
and pending navigation protection are implemented.

Action owns indexed Choice/Option structural diagnostics; missing fields remain
unresolved and malformed supplied fields are invalid. Common types and persisted
mappings are unchanged. The AI-facing domain guide was compared with common types
and updated for validation ownership and deferred selection semantics.

Verification: 475 web tests, 219 domain tests and 50 API authoring tests passed;
domain build/typecheck, web build/prerender/typecheck, API typecheck, targeted UI lint and UI primitive checks
passed. `apps/web/scripts/item-choices-smoke.mjs` passed at 1440/390 px for all
three owners, primitive values, saved-number clear/retype, consecutive ordering,
removal, Cancel, pending-save Cancel protection, 500/409 recovery, protected-value
replacement and preservation. Populated screenshots confirmed responsive fields;
visible controls meet 44px with no overflow. Real React/provider/router/API client
checks use authoritative in-memory HTTP persistence; live database, authenticated
shell and read-only permission boundaries remain outside this fixture coverage.

## SE-05 — Structured Action prerequisites (done, 2026-10-13)

Implemented ordered prerequisite lists/Add/Edit beneath direct Item, Trait and
Vehicle Actions at `/prerequisites`, `/prerequisites/new` and `/prerequisites/:index`.
Twelve atomic forms cover always/never, condition, tag, proficiency, attunement,
sustaining-operation, damage type, distance, visibility, cover and relationship.
Existing binding values, optional item omission and private/sibling data are
preserved. Opaque references stay hidden behind explicit replacement; optional
item removal is confirmed. Numeric repair, save/revision guards, Cancel, confirmed
removal and consecutive reorder follow the existing authoring pattern. Compound
predicates, comparisons, definition references and custom rules remain read only
with explicit reorder/removal.

Action owns indexed top-level prerequisite validation; missing required atomic
fields are unresolved and malformed values invalid. Option/Trait prerequisite
internals remain deferred. Common types and persistence mappings are unchanged;
the AI-facing domain guide was compared with Predicate/Distance source contracts
and updated for validation ownership and limits.

Verification: 519 web tests, 222 domain tests, 53 API authoring tests,
domain build/typecheck, API typecheck, targeted UI lint and UI primitive checks pass.
`apps/web/scripts/item-prerequisites-smoke.mjs` passed at 1440/390 px for all twelve
forms, all three owners, save/read-back/reopen, omitted item binding, masked
reference preservation/replacement, advanced/private/sibling data retention,
consecutive reorder, removal, numeric repair, Cancel, pending-save protection,
500/409 recovery and disabled read-only controls. Populated screenshots were
visually inspected; visible controls meet 44px with no overflow. These checks use
real React/provider/router/API client with disposable authoritative HTTP fixtures,
not live database or authenticated-shell integration. Web build/prerender and
typecheck also passed.

## SE-06 — Compound Action prerequisites (done, 2026-10-13)

Implemented nested child lists and editors for `all`, `any`, and `not` beneath
Item, Trait and Vehicle Actions. Repeated `/prerequisites/:index/children/:index`
paths support focused atomic or compound editing at each depth. Immutable updates
preserve ancestor/private data and untouched siblings. Empty groups remain valid;
`not` holds one child, with explicit removal leaving a repairable incomplete draft.
Malformed or unsupported child collections safely refuse edits. Existing atomic
fields, opaque-reference protection, save/revision guards and ordinal navigation
are retained. Comparisons, references and custom predicates remain preserved.

Action recursively validates supported descendants with precise field paths;
missing child fields remain unresolved and malformed supplied fields invalid.
Common types and persistence mappings are unchanged. The AI-facing guide was
compared with the common Predicate contract and updated for recursive ownership.
No combat or predicate execution changes are included.

Verification: 549 web tests, 224 domain tests, 56 API authoring tests,
domain build/typecheck, API typecheck, targeted UI lint and UI primitive checks
pass. Independent review found no path-update or preservation defects.
`apps/web/scripts/item-compound-prerequisites-smoke.mjs` and the existing atomic
prerequisite smoke both pass at 1440/390 px. Verified nested all/any/not for all
three owners, parent navigation, save/read-back/reopen, consecutive ordering,
not singleton guard/removal/re-add, Cancel, pending saves, 500/409 recovery,
read-only controls, numeric repair and advanced/private preservation. Populated
screenshots were visually inspected; controls meet 44px without overflow. These
use real React/provider/router/client with disposable HTTP fixtures, not live
database/auth integration. Web production bundling/prerender passed; its TypeScript
step found two test-fixture type errors, which were corrected. The subsequent
web typecheck and all 53 prerequisite model tests passed.

## SE-07 — Comparison Action prerequisites (done, 2026-10-13)

Implemented `compare` at root and nested prerequisite paths for Item, Trait and
Vehicle Actions. Forms expose all eight common operators and constant, primitive
literal, path (with optional fallback), event-value and collection-count operands.
Field edits preserve operand metadata and the other operand. Advanced operands,
complex literals and hidden references remain intact until explicit confirmed
replacement. Existing save/revision, nested ownership, numeric repair and read-only
protections apply. Action owns recursive operator/operand structural validation;
missing fields remain unresolved, malformed supplied fields invalid. No expression
execution, operator compatibility or binding semantics were introduced.

Common types and persisted mappings are unchanged. The AI-facing guide was compared
with Predicate, ScalarExpression and NumericExpression and updated for supported
validation and deferred semantics.

Verification: 569 web tests, 226 domain tests and 59 API authoring tests
passed; domain build/typecheck, web production build/prerender/typecheck, API
typecheck, targeted UI lint and UI primitive checks passed.
`apps/web/scripts/item-comparison-prerequisites-smoke.mjs` and the atomic/compound
prerequisite browser scripts passed at 1440/390 px using disposable HTTP
fixtures. Verified all operators and operand forms, nested owner preservation,
saved-number clear/retype, optional fallback omission/removal, Cancel, pending save,
500/409 recovery, read-only controls and 44px controls without overflow. Populated
screenshots were inspected. Final comparison runs also passed after strengthening
embedded UUID/known-ID masking: unchanged saves retain references, replacement
requires confirmation. The 73 affected model tests, lint and web typecheck passed again. Browser
evidence uses real React/provider/router/API client with disposable HTTP state,
not live database or authenticated-shell integration.

## SE-08 — Definition-reference prerequisites (done, 2026-10-13)

Implemented `has-definition` at root/nested prerequisite paths for Item, Trait
and Vehicle Actions. Named selection uses only persisted definition records in
the current World draft, with human kind labels, ordinal duplicate disambiguation,
and neutral missing-name/reference fallbacks. No automatic first selection or raw
ID entry. Missing/unknown imported references remain unchanged until selected;
replacing any existing reference requires confirmation. Subject bindings retain
opaque-ID protection, including embedded UUIDs. Private/ancestor/sibling data and
existing save/revision/Cancel/removal/reorder protections remain intact.

Action validates subject/definitionId strings recursively, reporting missing
fields as unresolved and malformed supplied fields as invalid. Empty/unknown
string references remain allowed; catalog existence and runtime possession are
not inferred. The AI-facing guide was compared with Predicate/DefinitionId and
resource mapping sources and updated; common types/mappings are unchanged.

Verification: 576 web tests, 228 domain tests, 62 API authoring tests, domain
build/typecheck, API typecheck, targeted UI lint and UI primitive checks passed.
`apps/web/scripts/item-reference-prerequisites-smoke.mjs` and atomic/compound
regressions passed at 1440/390 px: named/duplicate/missing selection, unrelated
resource exclusion, confirmed replacement, masked subject, nested ownership,
save/read-back/reopen, private/sibling preservation, Cancel/pending/500/409 and
read-only behavior. Populated screenshots inspected; controls meet 44px with no
overflow. Browser evidence uses real components/provider/router/client against
disposable HTTP fixtures, not live database/authentication. Web production
build/prerender and typecheck also passed.

## SE-09 — Choice Option prerequisites (done, 2026-10-13)

Implemented shared prerequisite lists/editors for Action Choice Options beneath
Item, Trait and Vehicle owners, including atomic checks, nested groups, comparisons
and named definition references. Routes extend each Option with `/prerequisites`
and the existing ordinal/nested child paths. Manage Prerequisites and Back to
Option retain context; malformed, missing and ambiguous owners safely refuse
updates. Immutable updates preserve complex Option values, catalog/private data,
sibling Choices/Options and the Action's own prerequisites. Unset optional
prerequisites remain absent until an explicit edit.

Action reuses its recursive validator with full Choice/Option diagnostic paths;
missing fields remain unresolved and malformed values invalid. Common types and
resource mappings are unchanged. The AI guide was compared with ChoiceOption and
Predicate source and updated for validation ownership.

Verification: 613 web tests, 230 domain tests, 65 API authoring tests,
domain build/typecheck, API typecheck, targeted lint and UI primitive checks pass.
`apps/web/scripts/item-option-prerequisites-smoke.mjs`, existing Choices and atomic
prerequisite browser regressions passed at 1440/390 px. Verified all three owners,
Manage/Back navigation, nested all/not/comparison/reference editing, numeric repair,
absent prerequisite preservation, complex Option values/private/sibling/Action-root
preservation, encoded and marker IDs, repeated reorder/removal, Cancel and dirty
navigation, pending/500/409/read-only guards, and missing/ambiguous-owner write
blocking. Populated screenshots inspected; controls meet 44px without overflow.
Evidence uses real components/provider/router/client against disposable HTTP
fixtures, not live database/authentication. Production bundling/prerender passed;
typecheck found test-fixture inference errors, which were corrected. Final web
typecheck and all 87 prerequisite model tests then passed.

## SE-10 — Trait prerequisites (complete, 2026-10-13)

Item-owned Traits now expose prerequisite lists and editors using the existing
atomic, nested all/any/not, comparison and definition-reference controls. Navigation
returns to the named Trait. Edits preserve embedded Actions/Options, private rules,
grants, modifiers, triggers and siblings. Missing or ambiguous owners block writes.

An internal abstract RuleDefinitionEntity shares the recursive prerequisite grammar;
Trait and Action retain their own validation state and diagnostic codes. Item,
Character and Feat propagate Trait diagnostics. Common types and resource mappings
are unchanged; the AI-facing domain guide was compared with the source and updated
for Trait validation ownership.

Verification: 644 web tests, 235 domain tests and 66 API authoring tests passed,
with domain build/typecheck, API typecheck, web production build/prerender/typecheck,
targeted lint and UI primitive checks.
Trait prerequisite, Item mechanics and Option prerequisite browser checks passed at
1440/390 px: nested editing, numeric repair, absent-field preservation, encoded and
marker IDs, opaque-binding masking and explicit replacement, reorder/removal, Cancel,
dirty navigation, pending saves, 500/409 recovery and read-only guards. Populated
screenshots were inspected; controls meet 44px without horizontal overflow. Browser
evidence uses real components/provider/router/client with disposable HTTP fixtures,
not live database/authentication.

## SE-11 — Trait Choices and Options (complete, 2026-10-13)

Item-owned Traits now expose structured Choice and Option lists and editors, with
ordering/removal, primitive Option values and nested Option prerequisites. Named
ancestry returns to the owning Trait. Edits preserve complex values, catalog
references, existing prerequisites/Actions, grants, modifiers, triggers, private
fields and siblings. Missing/ambiguous identities block writes.

Trait owns Choice/Option diagnostics through RuleDefinitionEntity's shared grammar;
Action behavior and codes remain intact. Common types and persisted mappings are
unchanged; the AI guide was compared with source and updated for Trait ownership.

Verification: 677 web tests, 238 domain tests, 67 API authoring tests,
domain build/typecheck, API typecheck, targeted lint and UI primitive checks pass.
Focused ownership/routing review found no defects. Trait Choice/Option browser
checks and existing Action Choices/Trait prerequisites regressions passed at
1440/390 px, covering editing/order/removal, nested prerequisites, save/read-back/
reopen, malformed identities, Cancel/dirty navigation, pending/500/409/read-only
behavior and preservation. Populated screenshots were inspected: controls meet
44px with no overflow. Browser evidence uses real components/provider/router/client
with disposable HTTP fixtures, not live database/authentication. Web production
build, prerender and typecheck passed.

## SE-12 — Trait modifiers (complete, 2026-10-13)

Item-owned Traits now expose modifier list/Add/Edit/order/remove routes with target,
all 13 operations, optional priority, stacking and source label. Scalar controls
support constants, primitive literals, paths with fallback, event values and
collection counts. Optional values stay absent until added. Advanced values require
explicit replacement/removal; predicates, private fields and sibling rules survive
edits. Missing/ambiguous identities block writes, and visible navigation uses named
Traits and ordinal modifier labels.

Trait owns RuleModifier diagnostics, distinct from Model-backed modifier grants.
Common types and persisted mappings are unchanged; the AI-facing guide was compared
with source and updated for validation ownership and supported scalar shapes.

Verification: 705 web tests, 241 domain tests, 68 API authoring tests, domain
build/typecheck, API typecheck, targeted lint and UI primitive checks pass. Focused
review found no ownership/preservation/save defects. Trait modifier browser checks,
Trait Choices and comparison prerequisite regressions passed at 1440/390 px:
scalar variants, numeric repair, optional omission/removal, identity guards, opaque
reference masking, save/read-back/reopen, ordering/removal, Cancel/dirty navigation,
pending/500/409/read-only behavior and deep sibling/private/predicate preservation.
Populated screenshots were inspected; controls meet 44px without overflow. Evidence
uses real components/provider/router/client with disposable HTTP fixtures, not live
database/authentication. Web production build, prerender and typecheck passed.

## SE-13 — Trait modifier predicates (complete, 2026-10-13)

Saved Item-owned Trait modifiers now expose one optional root Predicate, with
atomic, comparison, named-definition and nested all/any/not editing. Root addition
is blocked when occupied; root removal deletes the optional field. Nested child
lists retain their normal behavior. Named Trait/ordinal Modifier ancestry and Back
to Modifier preserve context. Edits retain modifier values, private data and sibling
rules; missing/ambiguous identities block writes.

Trait owns recursive diagnostics at components.modifiers[index].predicate without
a synthetic root array index. Common types and persisted mappings are unchanged;
the AI guide was compared with source and updated.

Verification: 738 web tests, 243 domain tests, 68 API authoring tests, domain
build/typecheck, API typecheck, targeted lint and UI primitive checks passed.
Modifier predicate browser checks and existing Modifier/Trait prerequisite
regressions passed at 1440/390 px: singleton absence/occupied-create/removal,
nested editing, named references, ordering, save/read-back/reopen, Cancel/dirty
navigation, pending/500/409/read-only behavior, identity guards and preservation.
Populated screenshots were inspected; controls meet 44px without overflow. Evidence
uses real components/provider/router/client with disposable HTTP fixtures, not live
database/authentication. Production bundling/prerender passed; typecheck found test
fixture typing/parameterization errors, which were corrected. Final web typecheck
and all 145 prerequisite model tests then passed.

## SE-14 — Trait grants (complete, 2026-10-13)

Item-owned Traits now expose grant list/Add/Edit/order/remove with named definition
selection and ordinal, revision-pinned routes. Unknown and duplicate references are
preserved; unavailable references use neutral labels and require explicit replacement
or removal. No initial reference is selected automatically. Optional omission, private
fields and sibling rules survive editing. Malformed grant lists or supplied Trait
components block writes instead of coercing imported data into empty objects.

Existing Trait string-list validation was sufficient; no domain implementation,
common type or persisted mapping changed. Added domain/API regression coverage and
updated the AI guide after comparison with source.

Verification: 778 web tests, 245 domain tests, 69 API authoring tests, domain build,
domain/API typechecks, targeted lint and UI primitive checks passed. Grants and
existing modifier browser checks passed at 1440/390 px: named/duplicate/unavailable
references, save/read-back/reopen, order/removal, omission, malformed-owner guards,
private/sibling preservation, Cancel/dirty navigation, pending/500/409/read-only
behavior. Populated screenshots inspected; controls meet 44px without overflow.
The modifier regression harness now waits for HTTP writes before reorder assertions.
Evidence uses real components/provider/router/client with disposable HTTP fixtures,
not live database/authentication. Web production build, prerender and typecheck passed.

## SE-15 — Trait triggers and effects (complete, 2026-10-13)

Item-owned Traits now expose ordered Trigger lists and metadata editors: event,
custom event, timing, optionality and priority. Nested ordered Effects reuse the
narrative/damage/heal/move editors. Ordinal routes are revision-pinned. Imported
binding identifiers are masked and preserved until explicit replacement; advanced
Effects are read only with deliberate removal/reordering. Predicates, usage limits,
private fields and sibling rules survive edits. Malformed imported components and
collections block edits instead of being coerced into empty data.

Trait owns Trigger metadata and shares Effect grammar with Action through the
internal rule base. Missing required values are unresolved; malformed values reject
Item saves. Common types and persisted mappings are unchanged; the AI guide was
compared with source and updated for validation ownership and limits.

Verification: 824 web tests, 248 domain tests, 70 API authoring tests, domain build/
typecheck, API typecheck, targeted lint and UI primitive checks passed. Focused review
found no blocking ownership/preservation issue. New Trait Trigger browser checks and
existing Action Outcomes/Trait Grants regressions passed at 1440/390 px: metadata,
optional clearing, numeric repair, all four supported Effect variants, ordering/
removal, read-back/reopen, advanced/private/predicate/limit preservation, identity/
malformed-data guards, Cancel/dirty/pending/500/409/read-only behavior and opaque
reference masking with explicit replacement. Populated screenshots inspected;
controls meet 44px with no horizontal overflow. Evidence uses real components/
provider/router/API client against disposable HTTP state, not database/authentication.
Web production build, prerender and typecheck passed.

## SE-16 — Trigger predicates (complete, 2026-10-13)

Saved Item-owned Trait Triggers now expose one optional root Predicate through the
shared recursive editor, including atomic predicates, comparisons, named references
and nested all/any/not groups. Root removal deletes the optional field and occupied
root creation is blocked. Effects, usage limits, private fields and sibling rules
survive edits. Safe ordinal routes, guarded Trait/Trigger lookup and revision-pinned
saves protect the selected Trigger. Contextual navigation returns to the Trigger.

Trait owns recursive diagnostics at components.triggers[index].predicate. Common
types and persisted mappings are unchanged; the AI guide was compared with source
and updated. Verification: 866 web tests, 250 domain tests, 71 API authoring tests,
domain build, domain/API typechecks, targeted lint and UI primitive checks pass.
Focused review found no blocking ownership/preservation issue. New Trigger predicate
and existing Trigger/Modifier predicate browser regressions passed at 1440/390 px:
singleton omission/add/remove, occupied-root guards, nested editing, named references,
private/sibling preservation, malformed owners, Cancel/dirty/pending/500/409/read-only
behavior. Draft reorder during editing rejects the pinned old revision with 409,
retains local edits, and mutates neither Trigger. Four populated screenshots were
inspected; controls meet 44px without overflow. Evidence uses real UI/provider/router/
API client with disposable HTTP persistence, not database/authentication. Web production
build, prerender and typecheck passed.

## SE-17 — Trigger usage limits (complete, 2026-10-13)

Trigger metadata now includes optional UsageLimit editing for uses, recharge,
once-per-turn/round/encounter and resource. Uses support constant/path maximums,
optional fallbacks and reset events including homebrew rests. Recharge supports a
die and ordered numeric success results, including duplicates/empty lists. Resource
bindings are masked when opaque. Omitted limits remain absent; replacement/removal
is explicit. Advanced expressions, private fields, predicates, effects and sibling
rules survive edits. Numeric edits update dirty state immediately, including blanks.

Trait owns structural limit validation with exact nested diagnostics. NumericExpression
maximums remain distinct from ScalarExpression; no positivity/integer/range/uniqueness
or nonempty-string rules were added. Common types and persisted mappings are unchanged;
the AI guide was compared with source and updated. Runtime counters, recharge rolls
and reset behavior remain deferred.

Verification: 887 web tests, 253 domain tests, 80 API tests (72 Item authoring + eight
Trait migration), domain build/typecheck, API typecheck, targeted lint and UI
primitive checks pass. Usage-limit browser checks and existing Trigger/Trigger
predicate regressions passed at 1440/390 px: all six kinds, numeric repair, recharge
ordering/duplicates/empty lists, optional fields, confirmation, empty binding/path/
homebrew preservation, advanced data, read-back/reopen, Cancel/dirty/pending/500/409/
read-only behavior and sibling rules. Four populated screenshots inspected; controls
meet 44px without overflow. Evidence uses real UI/provider/router/API client with
disposable HTTP persistence, not database/authentication. Web production build,
prerender and typecheck passed.

## SE-18 — Action usage limits (complete, 2026-10-13)

Direct Item Actions, Trait-owned Actions and Vehicle Actions now share the six-kind
Trigger usage-limit editor. Shared class-owned validation retains Trait diagnostics
and lets incomplete Action limits remain repairable drafts. Omission, advanced/imported
values, private fields and sibling rules are preserved. Malformed supplied Item/Action
components and Trait/Vehicle owners block editing rather than being coerced to empty
objects. Runtime usage counting, resets and recharge remain deferred.

Verification: 909 web tests, 255 domain tests and 83 API tests passed; domain build,
domain/API typechecks, targeted ESLint, UI primitive check and diff whitespace check
passed. Action-limit browser journeys and Trigger-limit/Item-mechanics regressions
passed at 1440px and 390px, covering all owners, preservation, numeric repair, reference
masking, save/reopen, Cancel, dirty navigation, pending/500/409/read-only behavior,
44px controls and no overflow. Browser evidence uses disposable HTTP persistence,
not live database/authentication integration. AI-facing domain guide updated against
the affected validation contracts; common types and persisted mappings are unchanged.
Production web bundle and prerender passed; final web typecheck and focused test rerun
passed after correcting a test-fixture type mismatch.

## SE-19 — Outcome predicates (complete, 2026-10-13)

Saved Outcomes under direct Item, Trait-owned and Vehicle Actions now expose the
shared singleton predicate editor. Atomic conditions, nested all/any/not groups,
comparisons and named definition references persist in optional `when`; root removal
omits the field. Outcome Effects, private/imported data and sibling records survive
edits. Malformed Item/Action components and ambiguous Outcome collections are guarded.
Simple Always/Never changes preserve extensions. Contextual navigation retains the
correct Action ancestry and ordinal Outcome labels.

Action now owns recursive Outcome predicate diagnostics, retaining legacy malformed
root diagnostics and allowing incomplete fields within tagged predicates as repairable
drafts. Common types and persisted mappings are unchanged; the AI-facing guide was
compared with source and updated. Runtime evaluation and complex expression authoring
remain deferred.

Verification: 945 web tests, 257 domain tests/build and 86 API tests passed;
domain/API typechecks, targeted ESLint, UI primitive and diff whitespace checks passed.
New Outcome predicate browser journeys plus Outcome and shared Trigger predicate
regressions passed at 1440/390px, covering all three owners, nested editing,
save/read-back/reopen, omission/removal, private/effects/sibling preservation,
reference masking, malformed/missing/duplicate owners, Cancel/dirty/pending/500/409/
read-only behavior. Screenshots inspected; 44px controls and no horizontal overflow.
Evidence uses disposable HTTP persistence, not live database/authentication. Focused
Code Reviewer review found no blocking issues.
Production bundle and prerender passed; final web typecheck and 210 focused model
tests passed after correcting new test-fixture type annotations.

## ART-01 — The Enemy Within campaign title (done, 2026-10-12)

Created `output/imagegen/the-enemy-within-title.png` with Victorian gothic engraved
gold lettering and industrial scientific ornament, following existing project
art direction. Built-in generation prompts saved alongside it in
`the-enemy-within-prompt.md`. Visually verified exact title and period styling;
1536 × 1024 output. The generator retained a dark gradient background despite
transparency requests. Asset creation is complete; application integration and
an optional transparent cutout are outside this request. Authoring priorities
above remain unchanged.


### B10 retained scope boundaries

Canonical Instance runtime has preparation, progress, placements, embodiments, Items,
optional campaign time and presentation overrides. It does not gain a competing runtime
World, party/Clock root, fabricated full Character statistics, or combat/rest/downtime
algorithms absent from production. Existing legacy value data is preserved. The authorized
exploration store uses MapExploration commands; the existing evaluator/participant endpoint
boundary remains unchanged. No automatic visibility sharing or media broadcasting is added.
B12 subsequently closed remaining writer/compatibility boundaries and final migration acceptance; see its closure evidence above.
