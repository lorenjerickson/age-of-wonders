---
status: active
---

# Rules engine implementation

## Design review and scope

The target is the event-driven architecture in `age-of-wonders-rules-engine-design.md` and the
canonical architecture map: all gameplay behavior comes from event-triggered rules, conditions over
available game state/context, and ordered effects which may trigger further rules. A rule-free World
is inert. Movement is a proof case, not an independent built-in gameplay path.

The existing shared movement preview is a prototype. Its useful validation and arithmetic tests do
not establish the architecture. It must not be connected to authoritative Session execution as-is.

## Prototype constraints and target gaps

- The prototype assumes a baseline action, allows unchanged movement with no applicable rule, and
  hard-codes movement-budget enforcement. The target must express all of these mechanics as rules;
  an event with no applicable rule produces no gameplay effects.
- Fixed movement paths do not satisfy conditions over all available game state. Add typed,
  schema-aware state and relationship queries scoped to the captured Campaign Instance.
- Numeric modifiers do not represent an ordered gameplay effect sequence. The target needs typed
  effects and capability invocation, including state-change and result events.
- There is no event dispatcher, causal chain, recorded roll/result cycle, or map-event integration.
  These must be exercised by the first runtime, together with bounded chain execution.
- The prototype's isolated candidate policy is specific to modifier previews. It does not decide
  ordering, state visibility, or conflicts across general rules and effects.
- Feet, binary arithmetic, and minimum/maximum semantics are current prototype details. They do not
  constrain the general engine's domain contracts beyond this supported preview profile.

## Retained prototype

- `packages/common/src/types/movement-rules.ts`: narrow numeric expression and predicate subsets,
  proposal modifiers, rule lifecycle, movement facts, outcomes, traces, and candidates.
- `packages/common/src/rules/movement-rule-engine.ts`: unknown-input supported-profile validator,
  bounded pure evaluation, condition explanations, compatible addition/subtraction, conflicts,
  isolated candidates, fail-closed diagnostics, and movement-budget enforcement.
- `apps/api/src/rules/movement-rule-engine.spec.ts`: movement proof case and boundary coverage using
  the public common package exports.

The prototype remains in-memory and has no authoritative Session execution route. The separate
WorldRule runtime below does not call it.

## Executable runtime contracts

The first supported runtime now uses `WorldRule`, `WorldRuleEvent`, and `RuleStateView`, alongside
`executeWorldRules`. Existing constant/arithmetic and grouped predicate concepts are reused as a
closed supported profile. Legacy unscoped paths, unversioned triggers, and distance/direction effects
do not imply support in this exact-position capability. The implemented contracts are:

1. Versioned event envelope with typed context, trusted source, root event, causal parent, captured
   rule provenance, and idempotency identity.
2. World rule wrapper with lineage, lifecycle, trigger, state/context conditions, **ordered effects**,
   and audit metadata. Choose the snapshot resource mapping explicitly, separate from rule variants.
3. Typed state view and bounded queries over all available game state in the owning scope, with
   explicit visibility of preceding effects and no cross-Campaign or host-secret access.
4. Versioned effect/capability contracts for state writes, geometry, recorded dice requests/results,
   and emitted events. Gameplay permission, costs, and consequences belong to rules.
5. Deterministic queue and rule scheduling, effect ordering, suspension/resumption, state-change event
   granularity, and competing-write semantics. Do not infer precedence from database IDs.
6. Bounded events, conditions, queries, effects, causal depth, and trace output; explained failure
   and explicit transaction/rollback or resumable execution semantics for runaway chains.
7. Preview and GM review boundary, causal audit, exactly-once application through idempotency,
   optimistic runtime revision checks, and authority revalidation.

Engine fixtures prove inert behavior with no rules, an action → effect → state-change event →
second rule chain, ordered effects, a dice result triggering a rule, a condition reading non-actor
state, context-bound effect targeting, retry, and bounded cyclic behavior. The movement proof should
run on these general contracts with authored movement and budget rules.

## World authoring and Session integration

World → Rules provides structured triggers, conditions, ordered effects, lifecycle controls,
duplication, and isolated tests. Starter movement mechanics require explicit GM adoption; publication
and normal downstream migration preserve exact wrapper identity/revision. The `world-rules` snapshot
component is separate from generic `rule-variants`. Dedicated saves use expected draft identity and
revision; general draft saves preserve executable rule records unchanged. Publication and target
runtime validation reject unsupported rules.

Session movement is a GM-only declaration → isolated preview → reviewed approval/rejection path.
Captured rules, source input, entropy, result, expected runtime revision, and exact resulting state
are stored in `CampaignSessionMovementProposal`. Approval atomically checks Session/owner/capture and
runtime revision, changes Instance state, records its decision, and appends causal journal events.
A retry returns the original receipt. No-rule and rejected declarations do not move actors; failed
chains cannot commit partial effects. The existing preparation position endpoint remains unavailable
during active play.

## Determinism and first movement profile

Lower authored priorities execute first. Rules in one priority stage share a baseline; each rule's
ordered effects see its own preceding writes, and later stages see merged prior stages. Competing
attempted writes fail the whole chain, including equal-value writes. Unique authored names order
independent same-stage outputs; IDs never decide conflict precedence. Events use FIFO delivery,
per-event locals, causal root/parent references, and effective field-change granularity. Recorded dice
suspend pure execution and resume through replay with the same root and supplied entropy tape.
The Session adapter supplies entropy once for the durable proposal, never again on approval.

Execution is bounded to 128 events, 512 effects, 20,000 operations, depth 24, and 2,048 trace entries,
with additional bounded JSON and output budgets. Failure returns original state and no committable
writes/events. Review applies an entire successful chain; partial chain approval is unsupported.

The six explicitly adopted starter rules initialize missing allowance and move count, compute cost
as geometric distance plus five feet per sloped support segment, apply authored geometry/allowance
conditions, move and debit in order, then count the resulting position-change event. Initializers
may produce effects without moving the actor; review distinguishes this outcome. Allowance persists
as an authored resource with no implicit Session/turn reset.

The host adapter exposes scoped captured/runtime fields and bounded direct point-route geometry.
Bulk terrain chunks are queried by the geometry capability instead of duplicated into scalar state.
Movement is currently within one captured isometric Location; valid support/bounds remain structural
integrity constraints. This is not swept-volume body clearance, locomotion, gravity, or full pathfinding.
These mechanics require additional authored rules/capabilities rather than hidden movement defaults.

## Remaining delivery

Player/Spectator-safe live map projection and actor-focused gameplay rendering remain separate work.
The Run map now renders named actors in an explicit full-map GM overview. Actor selection and
surface picking populate the shared movement declaration, with a pending destination and route
segment; the numeric controls, human-readable effect review, decisions, and history remain
available. Matching snapshot and runtime revisions are required before map interaction. Actors
move only after approved server effects refresh authoritative state. No-actor maps show readiness;
Player/Spectator access and actor-relative sight filtering remain pending. Full combat, turn/resource-renewal
mechanics, arbitrary event sources, richer schema query catalogs, and automated execution remain
unsupported until explicitly implemented and authored.


## First GM game-time evaluation loop — 2026-09-16

Run → Table exposes a three-step declaration/review/commit guide and the selected actor's
**committed** position, movement remaining, and recorded moves. The latter two are optional finite
numeric projections of the existing authored resources in `creature.extensions['aow:rules']`;
missing values display as uninitialized. Preview does not grant an allowance, and pausing or
resuming does not reset resources. No new persistence resource or automatic rule execution was added.

To exercise the loop:

1. In World → Rules, explicitly adopt the starter movement rules (or keep a rule-free World for
   the inert control). Publish and capture/migrate that revision through the Campaign and Instance.
2. Prepare an Instance actor at a supported position on a captured isometric Location, then start
   or resume its Session and open Run → Table at that Location.
3. Select the actor and a destination on the map, or enter coordinates. Preview movement; inspect
   proposed effects and the causal explanation. Committed state must remain unchanged.
4. Reject a proposal to check the no-change case. Preview again and approve to commit the whole
   chain; confirm position, remaining movement, and recorded moves against the listed effects.
   Initializer-only chains may change resources without moving the actor.
5. Try an exhausted allowance or unsupported destination, a stale preview after another committed
   change, and a paused Session. Inspect the explanation instead of assuming movement occurred.

The rules browser smoke passed no-rule, failed-chain, reject, exactly-once approval retry,
stale rebuild, paused controls, human labels, and committed resource readouts. Its Session HTTP
responses are fixtures; the World editor preview executes the real common engine. The map browser
smoke separately passed actor focus, Location filtering, surface picking, preview-before-approval,
authoritative refresh, empty-map readiness, runtime coherence, and pause guards. Pure engine tests
cover real authored chains, dice replay, conflicting writes, and bounded rollback.

Player-safe live maps, broader event declarations/adjudication, turns/resource renewal, combat,
and automatic execution remain subsequent slices. This first loop is GM-reviewed movement.


All eight `campaign-session-movement.postgres.spec.ts` cases passed against a fresh disposable
database with all 20 migrations applied: isolated preview, exactly-once commit, inert/rejected
outcomes, paused/foreign scope, competing approvals, stale revisions, bounded failure and journal
rollback, durable dice entropy, capture invalidation, other-actor effects, event-only chains, and
legacy proposal coordinate resolution. The committed context is asserted to show the real
post-approval position, 25 remaining movement, and one recorded move for the starter fixture.
The 12 pure engine tests passed. The AI-facing domain guide was updated for the optional context
resource fields and checked against `movement-execution-api.ts`; persisted resource mappings remain
unchanged.

Final checks: common package build, web/API typechecks, web production build (including prerender),
and `git diff --check` passed. The disposable verification database was removed after the tests.

## Campaign beginning before movement exploration — 2026-09-16

The user clarified that game-time exploration should begin with the Campaign's GM, Players,
Characters, and designated opening Location. A movement-testing panel alone is insufficient.
The Darkness Within's authored introduction still opens beneath Scotland Yard. Definition
preparation and the new-Instance copy path retained `startingLocationId`, but this migrated
Instance had empty preparation and no human memberships, including its owner as GM.

The local development Instance was explicitly repaired: its owner Loren Erickson now has an
active GM membership, Test Player — Ada and Test Player — Theo have active Player profiles and
Instance memberships, and missing Instance preparation now selects captured Scotland Yard.
Existing plot progress, historical Sessions, snapshots, and authored content were retained.
`apps/api/src/cli/seed-campaign-opening.ts` provides an explicit Instance/Location dry run and
`--apply` path, is restricted to development, validates the captured runtime, uses a serializable
transaction and revision check, and records an audit event. A repeated apply returned unchanged.
It creates no credentials, Characters, active Session, or simulated attendance. These are test
roster entries for GM setup, not authenticated real Players.

Instance Overview now exposes a named Starting Location selector from its captured World; both
preparation read/save projections include `locations`. The existing revision/ownership/runtime
validation remains authoritative, and selecting an opening does not move actors. The preparation,
invitation, and Character draft buttons were also corrected to submit their forms. Local email
and SMS providers were confirmed to be `capture`; no external delivery was attempted or configured.

Verification: 279 web tests, 10 Instance-management tests, common build, web/API typechecks, and
`smoke:campaigns` passed. The browser fixture exercises opening selection/save/remount, invitation
submission with mocked delivery, and Character draft submission, alongside 16 Campaign views.
API tests verify human-readable captured choices and rejection of out-of-capture starting Locations.
The AI-facing guide was updated for the projection; persisted domain resource mappings are unchanged.

Remaining: assign/create Characters for the test roster, stage the opening scene, and establish the
Player entry experience. Captured Scotland Yard has legacy scene/image content without isometric
terrain; the current movement evaluator cannot be tested there until the appropriate spatial
representation is authored and captured. Do not silently replace the narrative opening with the
unrelated isometric test Location. Real email invitations and Player authentication remain deferred.


### GM Character authoring follow-through (2026-09-16)

Roster Character names now open the same draft editor used by Players, with owner-authorized GM
API routes. GM authoring supports partial saves, captured Background/Profession/Heritage choices,
server-generated Attribute rolls and assignment, starting Item selections, biography, and generated
portrait preview with explicit attachment on save. Submitted and approved sheets remain locked.
Portrait generation uses the configured provider through the shared paid-request gate; test coverage
uses a mocked provider and incurs no image generation charges.

The Darkness Within capture contains Items and Professions but no Background or Heritage definitions.
The editor identifies missing choices and permits partial work, but final review remains blocked until
its capture includes those definitions. Starting Item selection is creation output, not runtime slot
equipment. Runtime inventory materialization/equipping remains a separate game-time requirement.

Verification: browser regression exercises roster-to-editor navigation, partial save, Attribute rolls,
starting equipment, mocked portrait preview/attachment, and persistence across remount. API tests cover
GM ownership, review immutability, image ownership, stale portrait requests and idempotent retries.
The AI-facing domain guide was compared with common Character draft/sheet types and updated for the
GM authoring and Media scope conventions; no common persisted Character fields were added.


### Backgrounds and character sheet (2026-09-17)

Supersedes the preceding Character authoring limitations: Heritage is no longer required. World
Backgrounds now author shared modifier grant recipes; the sheet previews the captured Background
benefits. The GM editor has a character-sheet layout, Attribute score boxes, biography, slot-based
paper-doll equipment selection with carried inventory, and separate portrait/overhead/side-on artwork
preview and attachment. Submission requires three distinct assets. Equipment assignments persist in
the draft and activated sheet, survive import, and reject incompatible or overlapping slots.

The local development database uses schema push rather than migration history. The single additive
`20260917060000_character_equipment_assignments` SQL change was applied directly there, with the
migration retained for migration-managed deployments. Existing draft data was preserved.

This is authoring and sheet output: Background grant execution and runtime Item instance materialization
still belong to the runtime compiler. No rolled-once Background benefits are fabricated in the editor.
New World Backgrounds must be published and explicitly adopted by the Campaign capture before selection.
The AI-facing domain model guide and canonical architecture were updated against the common source
contracts; the existing resource mapping remains unchanged.
