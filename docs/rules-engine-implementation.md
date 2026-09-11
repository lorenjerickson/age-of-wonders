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

## Implemented

- `packages/common/src/types/movement-rules.ts`: narrow numeric expression and predicate subsets,
  proposal modifiers, rule lifecycle, movement facts, outcomes, traces, and candidates.
- `packages/common/src/rules/movement-rule-engine.ts`: unknown-input supported-profile validator,
  bounded pure evaluation, condition explanations, compatible addition/subtraction, conflicts,
  isolated candidates, fail-closed diagnostics, and movement-budget enforcement.
- `apps/api/src/rules/movement-rule-engine.spec.ts`: movement proof case and boundary coverage using
  the public common package exports.

There are no new HTTP routes, database tables, persisted resource mappings, or GM screens yet.
The AI-facing domain guide describes precisely this implemented scope.

## Next implementation gate

Before extending runtime integration, compare existing `TriggerDefinition`, `Predicate`,
`NumericExpression`, `RuleEffect`, game event/command, and runtime types with these contracts:

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

First fixtures must prove inert behavior with no rules, an action → effect → state-change event →
second rule chain, ordered effects, a dice result triggering a rule, a condition reading non-actor
state, context-bound effect targeting, retry, and bounded cyclic behavior. The movement proof should
run on these general contracts with authored movement and budget rules.

## Subsequent integration

World draft services currently store `snapshotRecords`. Extend canonical draft/publication and
migration validation to the new supported rule profile and capture its wrapper immutably. Existing
snapshots without rules remain empty rule libraries and must not gain implicit mechanics. Any starter
rules must be explicitly authored/adopted and reach downstream Instances through normal migration.

Build World → Rules structured trigger/condition/effect authoring, lifecycle, duplicate, and preview
operations under existing draft ownership and optimistic revision checks. Display human names and
resolved provenance, never internal IDs.

Add Instance/Session-scoped root-event submission, execution proposals, decisions, and causal history.
Select rules from the Instance's captured World server-side. Persist source inputs, resolved labels,
captured versions, effects, resulting events, recorded entropy, and expected runtime revision.
Atomic approval must recheck Session state and authority, apply approved effects, record the decision,
and append history once. Rejection or a no-rule event applies no gameplay changes. A GM override, if
supported, must have explicit rule/effect semantics rather than invoke a hidden normal-action path.

Complete GM review and player-safe projections, then verify publish → migrate → event → chain →
review → commit, competing decisions, stale runtime, retries, and failure behavior against PostgreSQL.
The movement modifier prototype is not a substitute for these acceptance tests.
