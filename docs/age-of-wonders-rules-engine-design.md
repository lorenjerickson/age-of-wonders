---
name: age-of-wonders-rules-engine-design
description: event-driven rules architecture and initial delivery direction for Age of Wonders
status: active
---

# Age of Wonders rules engine

## Architectural intent

**All game-engine behavior is defined by event-triggered rules and their effects. A World without
rules is inert.** Rules are the source of game mechanics, including the ordinary behavior of actions,
movement, dice, combat, resources, time progression, and map interactions. They are not merely
modifiers layered onto built-in mechanics. A declared action has no implicit successful outcome.
If no applicable rule produces an effect, no gameplay state changes.

The runtime model is:

1. An event occurs, carrying typed context where appropriate.
2. Rules subscribed to that event are triggered.
3. Each rule evaluates its applicable conditions using game state and event context.
4. If all applicable conditions are satisfied, the rule executes an ordered sequence of one or more
   effects. A rule with no conditions is eligible whenever its trigger matches.
5. Effects may change game state, request capabilities such as dice rolls, or emit events.
6. Resulting events trigger further rules. The resulting chain defines the net runtime behavior.

Explicit `all`, `any`, and `not` groups may express a condition; all top-level applicability gates
must pass. Event context can be referenced both in conditions and when determining effect values,
subjects, targets, locations, and scope.

Movement is an initial proof case for this architecture, not the engine's permanent event or effect
boundary. Event chaining and ordered effects are foundational requirements for the first executable
runtime, even if it initially exposes only a small catalog.

## Event sources and context

Events may originate from game-state changes, declared player or GM actions, dice roll results,
map triggers, rule effects, and other registered sources. Session lifecycle, time/timer sources, and
external integrations can supply events through defined contracts as they are implemented.

Event types are namespaced and versioned. Context describes the particular occurrence: for example,
actor, requested action, origin/destination, changed field and before/after values, roll request and
result, or map region and entering entity. The server establishes provenance and authority; a client
cannot manufacture a trusted dice result, state-change event, or captured rules revision.

The runtime must preserve root-event and causal-parent references so that every effect and subsequent
event can be explained. A state-change event represents an actual effective change, not merely a
request to write an unchanged value. Its exact emission granularity must be explicit in the event
contract. Events without matching applicable rules cause no gameplay effects.

## Conditions and state access

Conditions can reference **all available game state** in the owning Campaign Instance's execution
scope, together with captured World/Campaign definitions and the triggering event context. This
includes entities other than the actor, relationships, locations, resources, conditions, encounters,
and other modeled subsystems. The architecture must not limit conditions to a fixed set of movement
aggregates or actor-only properties.

State access is typed and schema-aware. Validate paths, types, relationships, and supported queries
against captured schema and event contracts. Bounded query evaluation and registered references are
execution safeguards, not a reason to permanently exclude a game subsystem. All available game state
does not mean unrelated Campaign Instances, operator credentials, host environment, or arbitrary I/O.
The trusted engine may evaluate hidden game facts; player/spectator projections must not reveal them.

Conditions are read-only. Effects are the only rule execution step that changes gameplay state.
The implementation plan must define which state version each condition observes, including how
subsequent events observe changes made by preceding effects. Reading stale baseline state throughout
an entire chain is not an acceptable implicit default.

## Effects and host capabilities

A satisfied rule executes an authored, ordered sequence of effects. Effect values and target scope
may depend on event context and state. The effect vocabulary grows to cover gameplay state updates,
movement, rolls, resources, damage/healing, conditions, creation/destruction, and explicit event
emission. Unsupported effects are rejected at validation, not silently skipped.

The host implements execution primitives: typed state access and writes, geometry and path queries,
recorded randomness, event delivery, identity and authorization, persistence, concurrency, and audit.
Rules decide when to invoke those primitives and what their gameplay consequences are. The host must
not independently decide movement cost, whether terrain is traversable, what counts as a hit, damage,
or resource consumption. For example, geometry can describe an intersected obstacle; rules determine
whether it blocks a creature or causes some other effect.

Security and structural integrity remain host obligations. A rule cannot bypass authorization,
write a malformed record, cross Campaign ownership, or corrupt storage. A finite number requirement
can be a numeric execution constraint; forbidding a negative resource balance or over-budget movement
is game policy and must be expressed through rules and the game's authored model. If a primitive
includes domain-specific semantics, those semantics must be explicit in its versioned contract and
must not create an independent default gameplay path.

Dice rolling is an invoked capability whose recorded result becomes an event. Rules determine why
to roll and how to interpret the result. Re-evaluation or retry must not silently obtain new entropy.
Map detection similarly emits a fact; a rule supplies the consequence.

## Ownership and authoring

- World drafts own GM-authored rules. Publish captures them in immutable World revisions.
- Campaign Definition revisions capture their selected World revision and rules.
- Campaign Instance snapshots capture exactly one Campaign Definition revision and its required
  World revision. Execution uses these captured rules, never current authoring heads.
- Downstream adoption uses the existing optional, all-or-nothing, direct-lineage migration flow.
- Session owns play decisions and event history; Campaign Instance runtime owns mutable play state.
- System catalogs and reusable plugin content remain separate from World authoring. Any adopted
  default mechanics must be represented as captured rules, not hidden engine defaults.

Under World → Rules, a GM lists, creates, edits, duplicates, enables/disables, archives, validates,
and tests rules through structured controls. A rule has stable lineage identity, human-readable name
and description, lifecycle, versioned trigger, optional conditions, ordered effects, and audit and
revision provenance. No opaque identifier is displayed as a label or error message.

The editor expresses trigger → conditions → effects, including explicit effect order and event-context
bindings. YAML, arbitrary code, and a free-form expression language are not required authoring UI.
Campaign Definition and Instance preparation show captured provenance read-only. Session play shows
execution, causal explanations, proposals, and decisions rather than authoring World rules.

## Execution, review, and reliability

The target engine needs an event dispatcher, condition evaluator, ordered effect executor, typed
capability registry, and causal execution record. Rule-generated and state-change-generated events
are processed through the same dispatcher as other events.

Before implementing the runtime, specify deterministic event queue ordering, rule scheduling, effect
visibility, suspension/resumption for rolls and choices, competing state writes, and transaction
boundaries. Authored effect order is meaningful; it is not an automatic precedence mechanism between
separate rules. Database IDs and incidental iteration order must not settle competing rules.

Bound total events, triggered rules, condition/query cost, effect steps, causal depth, and output per
execution. Detect or safely terminate runaway chains with an explained failure. Recursion and cycle
controls are required from the first runtime implementation. Do not expose a partially applied failed
chain as successful play. Define rollback or resumable transaction semantics explicitly.

The initial delivery retains GM review as an execution/commit boundary. Preview can simulate a chain
against isolated state; approval commits the approved effects through the runtime transaction. Review
must not create an alternative host-defined action outcome. Rejection does not apply effects.
A no-rule execution is a no-op, not a fallback movement command. Approval must recheck Session state,
authority, and expected runtime revision; stale previews require re-evaluation. Root-event submission
and decisions must be idempotent, with causal events and state changes recorded exactly once at the
application boundary.

Whether review occurs for an entire root-event chain or selected suspension points, and whether
particular execution paths may later proceed automatically, remain explicit product decisions. These
choices must not remove rule causality or introduce mechanics outside the rule system.

## Initial proof and acceptance criteria

The first runtime should demonstrate a deliberately small **complete event/effect chain**:

1. With no enabled applicable rules, a movement declaration produces no gameplay change.
2. A captured movement rule defines the ordinary movement behavior as effects. There is no implicit
   baseline movement supplied by the host.
3. A difficult-terrain rule uses event context and state to determine movement cost. With an authored
   base cost of ten feet and two segments charged five feet each, the result is twenty feet.
4. A budget rule determines whether that cost is permitted. This check is not hard-coded into the
   movement primitive. Interactions with other movement rules use explicitly defined scheduling and
   conflict semantics, not accidental processing order.
5. A movement effect changes position and generates the defined state-change/map event. A second
   triggered rule uses that event's context to apply another observable effect.
6. A roll request produces a recorded result event, and a rule reacts to that result. This may be a
   separate engine fixture before the full dice authoring UI exists.
7. A condition can reference state beyond the actor and movement context; an effect can use an
   event-context binding to select its target.
8. Effect sequence order and state visibility are tested and explained in the causal trace.
9. Preview changes no authoritative state; approval applies the selected chain once. Rejection,
   stale runtime, retry, and failed/runaway chains cannot produce unintended partial gameplay.
10. Publication and explicit downstream migration preserve captured-rule consistency. The GM can
    create and test the first example through structured controls and inspect human-readable history.

## Delivery direction and existing implementation gap

`packages/common/src/types` remains the implemented contract authority. Existing `Predicate`,
`NumericExpression`, `RuleEffect`, `TriggerDefinition`, game commands, and events provide vocabulary
to compare with the target. Reuse compatible concepts with explicit supported-profile validation;
do not assume every member is executable. Update the AI-facing domain guide with implemented type
or persisted mapping changes.

The current `MovementRule`/`previewMovementRules` implementation is a limited modifier preview
prototype. It has no generic event dispatcher, ordered gameplay effects, state queries, or causal
chains. Its hard-coded baseline movement, available-movement enforcement, isolated candidate policy,
and fixed paths are prototype behavior, not the target engine contract. Do not connect this prototype
to authoritative runtime as the game's default movement path.

The next implementation plan must establish the event envelope, rule/effect contracts, state view,
capability invocation, queue semantics, execution budgets, and causal transaction model before wiring
World authoring and Session execution. Movement fixtures can then test those general abstractions.
Publication, migration, provenance, and GM review remain required delivery work.

A full combat catalog, rich map/dice authoring surfaces, plugin marketplace, AI-generated rules,
arbitrary scripts, and a general replay UI can be staged later. The event-driven execution model,
state-aware conditions, ordered effects, effect-generated events, and inert rule-free World cannot
be deferred behind a movement-only architectural boundary.
