---
name: age-of-wonders-rules-engine-design
description: requirements and technical direction for the minimal viable Age of Wonders rules engine
status: draft
---

# Age of Wonders rules engine MVP

## Purpose

Age of Wonders needs game mechanics that a GM can author and revise without application code. A
player's declared action should be evaluated against the rules captured by that Campaign Instance,
and the GM should be able to understand and approve the proposed outcome before it changes play
state.

The first release is deliberately smaller than a general-purpose RPG programming platform. It must
prove one complete loop:

1. A GM authors and tests a rule in a World.
2. Publishing the World captures that rule in an immutable World revision.
3. A Campaign Definition and Campaign Instance capture the rule through the existing snapshot and
   migration chain.
4. During an active Session, a player or GM declares a supported action.
5. The engine finds applicable rules and produces an explained outcome proposal without mutating
   authoritative state.
6. The GM approves, rejects, or selects among conflicting outcomes.
7. Approval applies the action atomically and records what happened in the Session event history.

If that loop is understandable, reliable, and pleasant for a movement rule, the architecture will
have earned expansion to attacks, reactions, state triggers, and richer effects.

## Product outcome

The MVP succeeds when a GM can create, publish, and use a simple movement rule without writing code
or seeing internal identifiers, and can tell from the play UI:

- which rule applied;
- why it applied;
- how it changed or blocked the declared action; and
- what will change if the proposal is approved.

A useful initial usability target is that a GM familiar with the product can create and test the
example rule in under ten minutes. Correctness requires that no evaluated proposal changes
authoritative Campaign Instance state before the GM approves it.

## Product stance

The goal is to make **game policy declarative**, not to remove all application logic. The host
application continues to own capabilities and invariants such as path finding, geometry, identity,
permissions, validation, persistence, atomic updates, and audit logging. Rules receive bounded,
typed facts from those capabilities and decide whether or how a proposed action should change.

For example, the movement service calculates a route and describes its terrain segments. A rule may
increase the movement cost for difficult terrain, but the rule does not implement path finding or
iterate an arbitrary map structure itself.

The GM remains the final authority. The MVP is an explainable resolution assistant, not an
autonomous game master or an unrestricted scripting environment.

## Relationship to established architecture

This document is the dedicated Rules exploration deferred by
`information-architecture-domain-model-realignment.md`. It refines the reserved **Rules** World
navigation group and **Rules execution** boundary without changing the established ownership model:

- GM-authored rules in the MVP belong to a World draft and are published as part of an immutable
  World revision.
- A Campaign Definition revision captures its selected World revision, including that revision's
  rules.
- A Campaign Instance snapshot captures exactly one Campaign Definition revision and its required
  World revision. Runtime evaluation uses those captured rules, never a World's current authoring
  head.
- Publishing or editing a World rule does not change an existing Campaign Definition or Campaign
  Instance. The rule reaches each downstream scope only through the existing optional,
  all-or-nothing, direct-lineage migration flow.
- A Session owns proposals, GM decisions, and resulting event history; mutable outcomes belong to
  Campaign Instance runtime.

The system-level rules catalog, editions, plugin content, and reusable base definitions remain
separate from World-authored rules. Plugin authoring and versioning remain outside any World or
Campaign and are not part of this MVP.

## MVP scope

### Authoring

Under **World → Rules**, a GM can:

- list, create, edit, duplicate, enable or disable, and archive rules in the current World draft;
- give a rule a human-readable name and description;
- choose the supported trigger, conditions, and outcome modifiers through structured controls;
- validate a rule and preview it against a supplied example context;
- see plain-language validation and preview explanations; and
- publish the rule with the rest of the World revision.

Rule editing uses a sentence-like structured builder, for example:

```text
When [movement is declared]
If [difficult terrain segments] [is greater than] [0]
Then [add] [5 feet × difficult terrain segments] to [movement cost]
```

YAML, source code, and a free-form expression editor are not GM-facing MVP authoring surfaces. The
builder produces a typed expression tree which can be validated before publication.

### Runtime

The first supported trigger is a movement declaration during an active Campaign Session. The host
movement capability supplies a typed evaluation context containing at least:

- the acting Creature's human-readable identity and relevant captured state;
- origin, destination, and movement mode;
- the host-calculated route and aggregate terrain facts needed by the rule;
- base movement cost and available movement; and
- the current Campaign Instance runtime revision.

The MVP engine can:

- allow the proposed movement unchanged;
- adjust numeric fields of the proposed movement outcome; or
- block the proposed movement with a human-readable reason.

Rule effects modify only the **proposed action outcome**. They do not directly mutate arbitrary
Creature, World, Campaign, or Session state. The normal movement command applies the approved
outcome through the authoritative Campaign Instance runtime boundary.

### GM review

For the MVP, every rules-adjusted or rules-blocked action pauses at an outcome proposal for GM
approval. An action for which no rule applies may follow the normal action path. This intentionally
conservative policy keeps the first engine observable and makes incorrect rule behavior recoverable;
automatic approval can be considered after real play validates the model.

The GM review shows:

- the declared action;
- the unmodified outcome;
- each matching rule, its source World revision, and why its conditions matched;
- the proposed outcome and field-level changes; and
- controls to approve or reject the proposal.

When rules conflict, the review additionally shows side-by-side candidate outcomes. The GM can
select one candidate, reject them all, or allow the original action. Free-form editing of a candidate
outcome is deferred; the GM can instead reject it and use an existing GM action to establish the
desired state.

## Minimal rule model

The following concepts describe relationships and responsibilities, not approved TypeScript field
names.

### World rule definition

A World Rule Definition contains:

- stable internal identity and revision provenance;
- human-readable name and description;
- lifecycle state: enabled, disabled, or archived;
- one supported trigger;
- zero or more conditions, combined with explicit `all`, `any`, and `not` groups;
- one or more proposal modifiers;
- an optional author-facing explanation; and
- creation and modification audit metadata.

Rule identity remains stable across World revisions so migrations and Session history can explain
which lineage produced an outcome. Internal identities may be used in storage and URLs but must not
be displayed to the GM.

### Trigger

An MVP trigger identifies one namespaced, versioned event contract. The initial contract is
equivalent to `aow:movement.declared:v1`. Versioning the contract prevents a later payload change
from silently changing the meaning of published rules.

The MVP evaluates only the **before-action** phase. Replace/after phases, state-change triggers, and
rules triggered by other rules are deferred.

### Conditions and values

The rule builder emits a restricted subset of the existing `Predicate`, `ScalarExpression`, and
`NumericExpression` vocabulary:

- literal values;
- allowlisted event-context values;
- allowlisted actor-state values;
- numeric arithmetic: add, subtract, multiply, divide, minimum, and maximum;
- comparisons: equal, not equal, less than, less than or equal, greater than, and greater than or
  equal; and
- boolean `all`, `any`, and `not` groups with bounded nesting.

Paths are selected from human-readable schema-aware controls and stored as stable registered
references where available. The engine rejects unknown, incompatible, or unauthorized paths at
publication and evaluation. Pattern matching, arbitrary collection traversal, custom functions,
dynamic code, I/O, wall-clock access, and unseeded randomness are outside the MVP.

This typed tree is distinct from the restricted CEL profile reserved for model/schema expressions.
The MVP does not require introducing a second executable language.

### Proposal modifiers

The MVP uses a small subset of the existing modifier vocabulary:

- numeric `add`, `subtract`, `multiply`, `divide`, `minimum`, `maximum`, and `set` operations on an
  allowlisted proposal field;
- `allow`; and
- `prohibit`, accompanied by a human-readable explanation.

Damage, healing, conditions, resource mutation, choices, branching, loops, deployment, entity
creation/destruction, emitted events, custom effects, and direct state mutation remain valid future
vocabulary but are not executable by the MVP engine.

### Action declaration and evaluation proposal

An Action Declaration records the requested action, actor, targets or destination, parameters,
captured rule and runtime revisions, and an idempotency key.

Evaluating a declaration produces an immutable Rule Evaluation Proposal containing:

- the declaration and baseline outcome;
- every considered rule and whether it matched;
- human-readable condition results;
- compatible applied modifiers;
- detected conflicts and isolated candidate outcomes;
- final status: unchanged, adjusted, blocked, or conflicted;
- the proposed state change, if any; and
- the runtime revision against which it was evaluated.

Evaluation never changes authoritative state. Approval succeeds only if the Session is still active,
the actor remains authorized, and the Campaign Instance runtime revision still matches. Otherwise
the proposal becomes stale and must be evaluated again.

### Decision and audit

A GM Decision records approval, rejection, the selected conflict candidate when applicable, the
GM's human-readable identity, and time. Approval atomically applies the normal action command and
appends the resulting Session events exactly once. Session history retains enough resolved labels,
rule provenance, inputs, changes, and decision data to explain the outcome after definitions evolve.

## Evaluation behavior

For one declaration, the engine performs this bounded flow:

1. Validate the declaration, permissions, active Session, captured definition snapshots, and
   runtime revision.
2. Select enabled rules from the Campaign Instance's captured World snapshot whose trigger contract
   matches the declaration.
3. Evaluate every selected rule against the same immutable baseline context.
4. Discard nonmatching rules while retaining explanation data for GM inspection.
5. Group matched modifiers by target proposal field.
6. Compose clearly compatible modifiers and identify conflicts using the MVP rules below.
7. Produce and persist an immutable proposal; do not mutate runtime state.
8. On GM approval, recheck the runtime revision and apply the selected result atomically.
9. Append a human-readable Session event and mark the proposal decided.

### Minimal composition and conflict policy

The MVP must not use processing order, database identifiers, or an undocumented heuristic to choose
an outcome.

- Modifiers to different proposal fields are compatible.
- Add and subtract modifiers to the same numeric field are compatible and compose from the shared
  baseline.
- Any other combination that writes the same field is a conflict in the MVP.
- `allow` and `prohibit` applied to the same capability are a conflict.
- A modifier that produces an invalid value is a conflict rather than a partial result.

For a compatible multi-rule result, the GM sees and approves the combined proposal. For a conflict,
the engine evaluates each conflicting rule in isolation and displays those candidate outcomes side
by side. More sophisticated precedence, stacking, and conflict reconciliation are deferred until
observed play supplies concrete requirements.

## Movement proof case

The first end-to-end acceptance scenario is movement across difficult terrain:

1. The GM creates a rule named **Difficult terrain costs extra movement**.
2. Its trigger is movement declared.
3. Its condition is that the host-calculated difficult-terrain segment count is greater than zero.
4. Its modifier adds five feet multiplied by that count to the proposed movement cost.
5. Previewing the rule with two difficult-terrain segments explains that a base cost of ten feet
   becomes twenty feet.
6. The GM publishes the World and explicitly migrates any downstream Campaign Definition and
   Campaign Instance that should adopt the new revision.
7. In an active Session, a matching movement declaration produces the same explained proposal.
8. Approving it applies the movement and its cost once and appends a Session event.
9. If the adjusted cost exceeds available movement, the proposal is blocked with a human-readable
   explanation.

Route calculation, terrain classification, collision detection, and movement application remain
host capabilities. This rule consumes their typed outputs.

## User experience boundaries

Authoring and play remain discretely separate experiences:

- **World → Rules** is the authoring library and editor.
- **Campaign Definition** exposes captured World rule provenance read-only; it does not edit World
  rules.
- **Campaign Instance preparation** exposes the captured rule revision and migration status
  read-only.
- **Session play** shows only evaluation, explanation, conflict comparison, and GM decisions.

Advanced implementation details stay behind progressive disclosure. The primary editor should read
like a sentence, preview results beside the rule, and resolve internal references to names. A
diagnostics panel may show expression-tree details for troubleshooting, but never opaque identifiers
as visible labels or error text.

## API and persistence boundaries

The MVP API follows the established aggregate hierarchy rather than accepting parent relationships
from mutable payloads:

- World rule authoring is scoped beneath a specific World draft and is published through the World
  revision workflow.
- Action declarations, evaluation proposals, and decisions are scoped beneath the owning Campaign
  Instance and Session.
- The server derives the applicable Campaign Definition, World snapshot, and rules from the
  Campaign Instance. Clients cannot select a different rules snapshot in an evaluation payload.

Exact routes and storage tables belong in the implementation gate plan. At minimum, persistence must
support World rules inside revision snapshots, pending/decided proposals, idempotent GM decisions,
and Session events that preserve human-readable explanations and source provenance.

## Safety and operational constraints

- Evaluation is pure, deterministic, and side-effect free until approval.
- The engine has explicit limits for matched rules, conditions, expression depth, arithmetic
  operations, and output size.
- Event and state paths are allowlisted by the versioned trigger contract and captured schema.
- Rules cannot access the network, filesystem, environment variables, wall clock, or arbitrary
  application services.
- Invalid published or migrated rules prevent publication or migration; an unexpected runtime
  failure produces a blocked proposal and a GM-readable diagnostic, never a partial mutation.
- Proposal creation and decision are idempotent.
- Approval uses optimistic concurrency against the Campaign Instance runtime revision.
- Player and spectator projections omit GM-only facts and rule explanations that would reveal
  hidden state.

The MVP has no rule-generated events and therefore no recursive evaluation path. Recursion guards
are required only when state-change triggers or event-emitting effects are introduced later.

## Acceptance criteria

The MVP is complete when all of the following are demonstrable:

1. A GM can create the difficult-terrain rule with structured controls and no code.
2. Invalid fields, types, or expressions cannot be published and produce useful diagnostics.
3. Rule preview shows whether conditions matched and the exact before/after movement outcome.
4. Publishing creates an immutable World revision; existing downstream snapshots remain unchanged.
5. Explicit migration makes the rule available to a selected Campaign Instance while preserving its
   captured Campaign/World consistency.
6. A movement declaration in an active Session evaluates only the rules in that Instance's captured
   snapshot.
7. Evaluation does not mutate runtime state.
8. A GM can approve or reject an adjusted or blocked proposal.
9. Two compatible numeric modifiers produce one explained combined proposal for GM approval.
10. Two conflicting modifiers produce side-by-side candidates and require an explicit GM decision.
11. Approval is atomic and idempotent; stale proposals cannot overwrite newer runtime state.
12. Session history explains the declaration, applicable rules, GM decision, and resulting change
    using human-readable labels.

## Explicit non-goals for the MVP

- A complete implementation of every current `EventType`, `RuleEffect`, `ActivationType`, action,
  trait, condition, or combat type.
- Concurrent-round planning, reaction scheduling, action economy, attack/defense resolution, or the
  general encounter resolver described in `combat-system-requirements.md`.
- Rules triggered by state changes, dice results, other rules, Session lifecycle events, or emitted
  custom events.
- Chained rule outputs, loops, arbitrary collection traversal, reusable functions, or recursive
  evaluation.
- Arbitrary scripting, YAML execution, unrestricted CEL, or plugin-provided executable functions.
- Campaign Definition-, Campaign Instance-, Character-, or Session-local rule authoring and
  overrides.
- Automatic conflict precedence, configurable stacking policy, or learned rulings.
- Free-form candidate-outcome editing, undoing published history, or a general replay debugger.
- AI-generated rules, rule packs, import/export, marketplace distribution, or collaborative editing.
- Fully automatic rules execution without GM review.

These capabilities may be valuable. They are excluded because none is needed to validate the first
author-to-play loop.

## Existing domain model impact

`packages/common/src/types` remains the source of truth for implemented contracts. It currently
contains a much broader prospective vocabulary in `rules.ts`, `expressions.ts`, `game.ts`, and
related combat types. This document does not claim that the entire vocabulary is implemented or in
MVP scope.

Implementation should reuse compatible concepts—particularly predicates, numeric expressions,
modifiers, game commands, and events—but expose an explicit supported-profile validator so an
existing future-oriented union member cannot accidentally become executable. A later Gate 1 plan
must compare the proposed World Rule, Action Declaration, Evaluation Proposal, and GM Decision
contracts with those source types and identify the smallest additive or semantic changes required.
Any implemented domain-model change must update `apps/api/src/ai/prompts/domain-model.md` in the same
change, per repository policy.

## Recommended delivery slices

1. **Authoring slice:** World Rule list/editor, supported-profile validation, preview fixtures, and
   World revision capture.
2. **Single-rule runtime slice:** movement declaration, evaluation proposal, GM approve/reject,
   optimistic concurrency, atomic application, and Session audit event.
3. **Composition slice:** compatible numeric composition, minimal conflict detection, side-by-side
   candidates, and explicit GM selection.

Each slice should be independently demonstrable. Expanding the event or effect catalog should wait
until all three slices have been exercised in an actual Session workflow.

## Assumptions to validate during Gate 1

The document recommends two deliberately conservative starting decisions:

1. Movement is the only first-release trigger because it proves authoring, contextual evaluation,
   outcome modification, blocking, approval, persistence, and explanation without depending on the
   unfinished combat resolver.
2. Every adjusted or blocked result requires GM approval during the MVP. Once real play establishes
   trust and desired pacing, a later design can define narrowly scoped automatic approval.

Neither assumption requires a broader engine design before implementation planning begins.
