---
name: combat-system-requirements
description: Story-centric requirements for ordered combat plans and GM adjudication
status: draft
---

# Combat system requirements

## Purpose and status

This document defines the intended combat experience and the minimum behavioral contracts needed
for a concrete technical design. It is a requirements baseline, not a description of the current
implementation.

Combat is facilitated by the VTT and adjudicated by the GM. The system records declared plans,
enforces order within each plan, tracks movement, identifies interactions between plans, and
presents useful facts and possible resolutions. It is not responsible for turning a messy fictional
situation into a deterministic game-engine result.

Statements under **Confirmed requirements** are product requirements. The final section records
rules-content and technical-design work that remains without reopening the confirmed product
decisions.

## Design intent

Combat abandons initiative and individual turns in favor of one ordered plan per combatant. Plans
from different combatants unfold alongside one another. When their activities interact, the system
should resolve the interaction only when an explicit rule makes the result clear. Otherwise it
should create an adjudication item and put the GM at the center of choosing what best serves the
fiction.

A round remains a six-second movement window, but it is not a six-slot budget into which every
activity must fit. Resolution advances through logical slots that evaluate the current activity from
each plan together. A movement activity advances one 5-foot checkpoint in a slot; a non-movement
activity occupies a slot and completes according to its own contract. Logical slots order and align
activities but do not assign one-second durations to non-movement activities. Resolution may use
more than six logical slots, while no plan may receive more than six baseline movement checkpoints.

The desired experience is closer to a well-prepared GM assistant than a combat simulator. The VTT
should make intent, state, uncertainty, rolls, and consequences legible while leaving genuinely
ambiguous chronology and narrative causality to human judgment.

## Goals

- Let each combatant declare an ordered plan for the round.
- Execute activities within each plan strictly in declared order.
- Evaluate the current activity from each plan together in successive logical resolution slots.
- Let plans belonging to different combatants overlap without inventing hidden initiative.
- Track the one bounded resource tied to the round clock: movement at 5 feet per second for six
  seconds, subject to rules-defined modifiers.
- Arm reactions at their declared position and retain them until they trigger or the round ends.
- Detect apparent concurrency, spatial uncertainty, and mutually dependent outcomes.
- Resolve only interactions whose outcome follows clearly from declared facts and configured rules.
- Present all other conflicts to the GM with relevant facts, candidate resolutions, and likely
  consequences.
- Preserve the GM's decisions and reasoning in an explainable audit history.
- Support player-controlled characters, GM-controlled creatures, and multiple controllers safely.

## Non-goals for the first implementation

- Treating logical resolution slots as six universal one-second ticks.
- Proving that all declared actions fit into six seconds.
- Constructing a deterministic total order across different combatants' plans.
- Automatically resolving ambiguous attacks against moving targets.
- Simulating real-time physics or sub-second movement.
- Treating the system as an autonomous rules judge or replacing GM judgment with opaque AI output.
- Treating concurrency advantages or disadvantages as D&D 5e mechanics.
- Supporting unrestricted natural-language plans. Activities and conflict annotations must have
  typed semantics, although human-readable explanations may accompany them.

## Terminology

- **Encounter**: the combat aggregate, including its roster, environment, current round, plans,
  adjudications, and authoritative history.
- **Round**: a six-second planning window used to limit and measure movement. It is not a universal
  duration budget for non-movement activities.
- **Movement checkpoint**: a one-second position checkpoint used to account for movement at 5 feet
  per second. It does not imply that every other activity lasts one second.
- **Resolution slot**: one logical evaluation step containing at most one current activity from each
  plan. A slot is not a second except for movement accounting within that slot.
- **Plan**: one combatant's ordered declarations for the round.
- **Activity**: a typed declared movement, attack, spell, interaction, reaction reservation, or
  other rules-defined choice.
- **Plan cursor**: the first activity in a plan that has not completed, been armed, been skipped, or
  been adjudicated to a conclusion.
- **Reaction reservation**: a conditional activity that becomes armed when the plan cursor reaches
  it and may interrupt or modify a later event when its trigger matches.
- **Conflict**: an interaction between otherwise valid activities for which chronology, position,
  exclusivity, or outcome matters.
- **Concurrency modifier**: a typed advantage or disadvantage produced by the combination of
  activities in an apparent concurrency conflict. It is distinct from D&D 5e advantage and
  disadvantage and applies according to the contested roll defined for that activity pairing.
- **Adjudication item**: a structured conflict the GM must resolve, including relevant facts,
  possible interpretations, and consequences.
- **Proposal**: the system's non-authoritative account of clear outcomes plus pending adjudications.
- **Published outcome**: the GM-approved result committed to encounter state and made visible
  according to information permissions.

## Confirmed requirements

### Ordered plans

- Every participating combatant may declare one ordered plan before resolution begins.
- Activities within a combatant's plan execute in the order declared.
- An activity cannot begin until the preceding activity in the same plan has concluded, been armed
  if it is a reaction reservation, been clearly skipped, or been resolved by the GM.
- Each resolution slot evaluates the current eligible activity from every non-idle plan. When an
  activity remains ongoing, that plan contributes the same activity to the next slot; when it
  concludes, the next declared activity becomes eligible in the following slot.
- Activities from different plans may overlap. Plan submission order, array order, opaque
  identifiers, and network arrival order never grant gameplay priority.
- Reordering a draft changes its meaning and must be explicit. Locked plans are immutable unless the
  GM reopens planning.
- Non-movement activities have no generic round-time budget, but each occupies at least one logical
  resolution slot. Rules may impose prerequisites, consumable resources, usage limits, fictional
  constraints, and activity-specific completion conditions. The resolver must not reject a plan
  solely because its logical slots do not fit inside six seconds.

### Movement

- Movement is the only activity governed by the six-second round budget.
- The baseline movement rate is 5 feet per second for six seconds, for a maximum of 30 feet per
  round. Rules may modify the rate, maximum, terrain cost, or available movement.
- The authoritative grid uses 5-foot squares. Orthogonal and diagonal movement each costs one
  square. Fractional-square distances are not tracked.
- Movement progresses by one 5-foot square per resolution slot, up to six movement checkpoints,
  stopping sooner when required by the route, stop condition, or remaining budget.
- A movement activity concludes when its declared destination or stop condition is reached, its
  budget is exhausted, it becomes clearly impossible, or the GM adjudicates it to a conclusion.
- A later activity in the same plan waits for movement to conclude.
- Position checkpoints help the system explain where a combatant could be while another plan is
  unfolding. They do not automatically establish when an activity in another plan occurs.
- Tokens may pass through the same square during movement. If two tokens end movement in the same
  square, they collide and make the contested Might rolls defined for collision; the losing token is
  knocked prone. Ties favor the target or defender under the general contested-roll rule.

### Reactions

- Reaction reservations are encountered and armed in declared plan order.
- A reservation cannot arm until all preceding activities in that plan have concluded.
- Arming a reservation advances the plan cursor; the reservation then remains active while later
  activities in the same plan execute.
- A first-listed reaction is armed at the beginning of plan resolution and may trigger at any point
  in the round.
- A reaction listed after movement cannot trigger until that movement has concluded.
- Once armed, a reaction is durable through the rest of the round until it triggers, is invalidated
  by an explicit rule, or expires at round end.
- A trigger that occurred before the reaction armed is not remembered and cannot trigger it
  retroactively.
- Trigger timing such as before, replace, or after applies relative to the triggering activity; it
  does not grant the reaction eligibility before its plan position is reached.
- A reaction is a fully declared deferred action, not permission to invent a response when a trigger
  occurs. Its declaration must name the specific response, such as dodge or block, and its trigger.
- At most one reaction may be planned for each player-controlled token in a round.
- When one event triggers valid reactions belonging to multiple player-controlled tokens, all of
  those reactions apply. Their interaction becomes an adjudication item only if their combined
  results are not clear.

### Conflict detection and GM authority

- The system identifies activities from different plans that may overlap or whose relative order
  changes the outcome.
- Conflict detection must be conservative in the sense of preserving meaningful uncertainty for the
  GM, but it must not flag immaterial or merely theoretical interactions so aggressively that combat
  becomes pedantic.
- A potential conflict is material when at least one plausible resolution changes activity
  eligibility, target, position, roll, modifier, resource use, effect, or a later plan activity. If
  every plausible interpretation produces the same relevant state, the interaction need not be
  adjudicated.
- When an attack is made against a target whose movement may still be occurring, the system creates
  an adjudication item unless an explicit rule or an earlier decision in the current resolution has
  already established the relevant fact.
- The system may suggest plausible resolutions, but suggestions are not authoritative and must not
  conceal uncertainty.
- A clear configured rule may resolve a conflict automatically. The explanation must name the rule
  and the facts that made it applicable.
- If no clear rule selects one result, the GM chooses the chronology or outcome, may modify the
  candidate resolutions, and records the authoritative decision.
- A conflict is resolved immediately before any dependent activity advances, because the decision
  may change all subsequent resolution.
- The resolver must never use processing order, identifiers, submission timing, or an undocumented
  heuristic to settle a gameplay conflict.
- The GM may accept clear outcomes, resolve each adjudication, amend proposed consequences, reject
  the proposal, or reopen planning.
- A GM adjudication applies only to the current conflict. The system must not silently promote it to
  a reusable ruling for future conflicts.
- GM-visible and player-visible content must use human-readable combatant, activity, item, and effect
  names. Opaque internal identifiers must never appear as visible labels or error text.

## Concurrency modifiers

Concurrency advantage and disadvantage help resolve apparent concurrency between particular pairs
or sets of activities. They must be modeled separately from D&D 5e advantage and disadvantage.

- A modifier belongs to the interaction between activities, not inherently to one activity in every
  context. Evade is not always disadvantaged; pursue paired with evade may produce different
  modifiers than evade paired with another activity.
- The applicable action, item, or conflict rule defines the contested roll and the modifiers created
  by the activity combination.
- Modifiers apply only after the GM or a clear rule determines that the activities are simultaneous.
- Applicable advantages and disadvantages are applied independently to every side. If both sides
  are disadvantaged, both penalties apply; they cancel only when the defined roll mechanic says
  they cancel. Otherwise the dice determine the result with both penalties present.
- A concurrency modifier answers only the disputed concurrency question. Any subsequent attack,
  defense, damage, save, or effect resolution still follows its action or item definition.
- The UI and event log must label these as **concurrency advantage** or **concurrency disadvantage**
  and explain their source so they are not confused with D&D 5e mechanics.

Specific activity pairings and their concurrency modifiers remain rules-content work. The resolver
must support data-driven assignments without assuming that all instances of a named activity, such
as evade, use the same modifier.

## Encounter and round lifecycle

The technical design should support this conceptual flow:

1. **Setup**: the GM selects combatants, controllers, starting positions, environment, and rules.
2. **Planning**: authorized controllers draft, validate, reorder, and submit one plan per combatant.
3. **Locked**: the GM closes planning and captures immutable encounter, plan, ruleset, and random
   state revisions.
4. **Guided resolution**: the system evaluates logical slots, advances each plan in order, accounts
   for movement, arms reactions, applies clear rules, and identifies conflicts.
5. **Adjudication**: resolution pauses immediately wherever a GM decision is needed. The GM chooses
   or authors a result, and the system continues from that decision.
6. **Review**: the GM reviews the complete proposed history and any consequences.
7. **Published**: the accepted result is committed, events are appended exactly once, and the
   player-safe account is released.
8. **Next round or completed**: movement budgets and round-scoped reaction reservations reset, or
   the GM completes the encounter.

Pausing and resuming must preserve plan cursors, movement spent, armed reactions, resolved facts,
pending adjudications, GM decisions, rolls, and unpublished consequences.

### Planning permissions and concurrency

- A controller may edit only combatants they control. The GM may plan for any combatant, including
  unassigned NPCs.
- A spectator or unassigned user is read-only and receives only the player-safe projection.
- A combatant has one canonical draft per round. Draft writes use optimistic revisions; stale writes
  are rejected without silently overwriting another controller's work.
- Static errors such as an unknown activity, missing required target, invalid route declaration, or
  incomplete deferred reaction prevent submission.
- Apparent conflicts with another plan are not submission errors. They are discovered during guided
  resolution and presented for adjudication.

The GM may end planning at any time. A player-controlled token without a complete submitted plan is
idle for the round; an incomplete draft is not partially executed. Plans are visible only to the
owning player and the GM. Planning has no automatic timeout.

## Declaration contract

Each plan must carry its encounter and round, revision, status, and ordered activities. Each
activity must contain enough typed data to validate, explain, resume, and replay it:

- stable internal key and explicit plan order;
- activity kind and rules definition;
- actor, targets, declared choices, and human-readable description;
- prerequisites, resource costs, and usage limits, if any;
- route, movement rate, budget, and stop conditions for movement;
- trigger, timing, target filters, and expiry for a reaction reservation;
- applicable data-driven concurrency modifier rules;
- activity-specific completion conditions;
- clear-success, clear-failure, contested-roll, and conflict-detection facts supplied by the rules
  definition; and
- an explicit policy for clearly impossible execution.

The contract must not require a generic duration for non-movement activities. It must define what
completion means for each activity. Quaffing a potion completes when its effects have been applied
to state, even when an applied effect begins later. An attack completes when all required attack and
defense rolls have been made and damage, if any, has been applied. Internal references may use
identifiers, but every human-facing projection must resolve them to names or a neutral human-readable
fallback.

## Guided resolution responsibilities

The system is responsible for:

1. Preserving the declared order within each plan.
2. Building successive logical slots from each plan's current activity.
3. Advancing plan cursors only after activities conclude, reactions arm, or the GM resolves a
   blocker.
4. Accounting for movement at 5 feet per slot against the six-checkpoint movement budget.
5. Maintaining current and possible positions derived from declared movement.
6. Arming, matching, consuming, and expiring reactions according to their plan position.
7. Applying rules whose prerequisites and outcomes are unambiguous.
8. Detecting cross-plan interactions whose outcome depends on chronology, position, exclusivity, or
   another unresolved fact.
9. Building adjudication items with relevant facts, rolls already made, applicable rules and
   modifiers, candidate resolutions, and downstream consequences.
10. Pausing immediately for the GM whenever a conflict affects unresolved activities.
11. Applying the GM's decision and continuing resolution from the resulting state.
12. Producing an accessible, human-readable account of clear outcomes and GM decisions.

The system is not responsible for:

- treating a resolution slot as a one-second duration for non-movement activities;
- deciding that one combatant acted first merely to continue processing;
- forcing every activity into the six-second movement window;
- choosing among equally plausible fictional interpretations;
- automatically retargeting, reordering, or rewriting a declared plan; or
- presenting a guessed outcome as rules-derived certainty.

## Clear outcomes, conflicts, and runtime failure

An activity may be clearly executable, clearly impossible, or dependent on an unresolved conflict.

- A clearly executable activity proceeds under its configured rules.
- A clearly impossible activity is skipped or stopped according to its declared failure policy and
  receives a human-readable explanation.
- If impossibility depends on disputed chronology or position, it is an adjudication item rather
  than an automatic skip.
- Costs are paid at the rules-defined point. The resolver must not infer payment timing from plan
  order.

The system must recognize at least these potential conflicts:

- an attack or targeted effect against a combatant who is moving;
- a target that may be entering or leaving range, reach, sight, or cover;
- attacks or effects that may incapacitate one another;
- opposing movement, path crossing, swaps, and constrained occupancy;
- mutually exclusive effects or claims on the same object;
- an activity, target, route, or resource that may become invalid because of another plan;
- forced movement or a condition that may interrupt declared movement;
- multiple reactions whose combined application is unclear; and
- any interaction for which no configured rule selects a single result.

An adjudication item must include:

- the involved combatants and activities using human-readable labels;
- the current plan position and completed activities for each participant;
- relevant movement checkpoints, ranges, line of sight, cover, effects, and resources;
- armed reactions and applicable concurrency modifiers;
- why chronology or outcome is uncertain;
- plausible choices such as before, after, simultaneous, interrupted, or impossible;
- the immediate and known downstream consequences of each choice; and
- the GM's selected or authored resolution and optional explanation.

Candidate resolutions are decision support, not a requirement that the system enumerate every
fictionally possible outcome.

## Attack, defense, and damage

- Every attack uses a freshly rolled defense. There is no static defense value.
- The required attack, defense, damage, and other contested rolls are defined by the action or item
  being resolved rather than by a universal scheduler rule.
- Ties favor the target or defender.
- A critical hit doubles the number of damage dice rolled, not the numeric result after rolling.
- Damage is applied immediately after its damage roll within the simulated round state.
- Applying damage and any resulting state changes completes the attack activity.
- Block is a specifically declared reaction triggered by an incoming attack. Its action definition
  determines how it modifies the contested defense resolution.

## Reactions

A reaction reservation must declare:

- a typed trigger and predicate;
- eligible source and target filters;
- before, replace, or after timing relative to its trigger;
- the exact deferred action to execute and any choices required to make it fully specified at plan
  declaration time;
- rules-defined costs and when they are paid; and
- expiry, which defaults to the end of the current round.

The resolver must retain explicit reaction states: pending, armed, triggered, invalidated, and
expired. It must record the plan activity after which the reaction armed so pause, resume, replay,
and GM-facing explanations preserve eligibility exactly.

When one event triggers reactions declared by multiple player-controlled tokens, all matching
reactions execute. The system creates an adjudication item only if their interaction is unclear; it
must not ask players to replace their declared deferred actions with newly chosen responses. An
untriggered reservation expires at round end without carrying into the next round.

## Proposal, adjudication, and publication

A proposal must retain:

- captured encounter, plan, ruleset, and random-state revisions;
- ordered activities and their resolution status;
- movement spent and relevant position checkpoints;
- reaction arming, triggering, and expiry events;
- rolls and modifiers;
- clear outcomes and causal explanations;
- conflicts, candidate resolutions, and GM decisions;
- resulting state changes; and
- distinct GM-safe and player-safe projections.

Adjudications are resolved immediately when encountered. A GM decision must show its resulting state
change and may include a human-readable reason. It applies only to that conflict. Reopening an earlier
decision invalidates dependent proposed outcomes and reruns only the affected resolution where
practical.

Resolution uses a simulated round state. Effects, damage, death, resurrection, removal, and other
changes apply immediately within that simulation so they can affect later activities, but they are
not committed piecemeal to authoritative encounter state. After every plan is complete or discarded
and all conflicts are reconciled, publication atomically applies only the resulting end-of-round
state plus its audit history. For example, a combatant killed early and resurrected later is alive in
the committed state, while both transient events remain in the round history.

Corrections after publication are explicit subsequent GM events rather than silent history rewrites.

## Persistence and API requirements

- There is at most one active encounter.
- Choose one canonical owner for active encounter state. Independently persisted encounter and game
  state must not become unsynchronized sources of truth.
- Draft plans are not required to survive a session restart. Locked plans, partial resolution, and
  adjudications are required to survive because they affect an active round.
- Locking must atomically capture all included plans and input revisions.
- Plan advancement, movement accounting, reaction transitions, adjudication decisions, rejection,
  publication, pause, and completion must be auditable and idempotent.
- Random state must be captured well enough to reproduce rolls, but reproducible randomness does not
  require the system to make the same discretionary GM decision.
- Locked inputs, partial resolution, GM decisions, and pending adjudications must survive process
  restart.
- Player projections must omit hidden combatants, unrevealed plans, GM-only modifiers, private
  rolls, adjudication reasoning, and alternative outcomes that reveal hidden facts.

The eventual technical design will likely need concepts equivalent to RoundPlan, DeclaredActivity,
PlanCursor, MovementProgress, ReactionReservationState, Conflict, AdjudicationDecision, and
ResolutionProposal. These are requirements vocabulary, not approved TypeScript API names.

## Incapacitation, removal, control, and summons

- When a combatant dies, all of its remaining planned activities are discarded immediately. A later
  resurrection restores the combatant's resulting state but does not restore the discarded plan.
- Removing a combatant from the encounter or changing its controller discards its outstanding
  activities.
- A summoned combatant may act in the round in which it is summoned only when both the summon and
  the summoned activity were declared within and consume the summoner's available plan capacity.
  Otherwise the summoned combatant waits until the next round to receive a plan.
- Summons, mounts, legendary or lair activities, free interactions, and other extended activity
  systems need no additional first-release behavior beyond the summon rule above.

## Relationship to the current domain model

The source-of-truth types in `packages/common/src/types` currently model initiative and turns:

- `EncounterState` has an initiative phase, turn index, active combatant, and initiative list.
- `CombatantTurnState` and ready actions assume per-turn execution.
- `GameCommand` contains turn advancement and standalone movement but no ordered-plan lock,
  conflict, or adjudication workflow.
- Rule events, durations, and usage limits include turn-based concepts.
- Attack resolution contains assumptions that may not match the intended contested-roll model.

These are design gaps rather than compatible implementations of this document. Plan-based combat
replaces initiative order and per-combatant turns completely; it is not a selectable alternate mode.
The technical design must therefore include persistence migration, command and event replacement,
and compatibility handling for existing turn-based rule definitions.

Whenever implementation changes a domain type or its semantics, update
`apps/api/src/ai/prompts/domain-model.md` in the same change, as required by repository policy.

## Worked example: logical resolution slots

### Plans

- Combatant A: move 5 feet; quaff a potion; arm dodge.
- Combatant B: move 10 feet; throw a lasso; hogtie the target.

### Resolution

| Slot | Combatant A                                              | Combatant B                                                  |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | Move 5 feet and conclude movement                        | Move 5 feet; movement remains ongoing                        |
| 2    | Quaff the potion; conclude after its effects are applied | Move the remaining 5 feet and conclude movement              |
| 3    | Arm the fully declared dodge reaction                    | Throw the lasso and resolve its required rolls and effects   |
| 4    | Idle                                                     | Hogtie the target and resolve its required rolls and effects |

The slots preserve order without claiming that quaffing, arming dodge, throwing a lasso, or hogtying
each lasts exactly one second. Dodge cannot trigger during slots 1 or 2 because it has not armed. It
may trigger after slot 3 and remains durable through the rest of the round.

## Worked example: attack during evade

### Initial state

- Attacker and defender begin 20 feet apart.
- Both have the baseline 5-feet-per-second movement rate.
- The attacker can strike within 5 feet.
- The pursue-and-evade activity pairing defines rules-authored concurrency modifiers; evade does not
  carry the same modifier in every possible pairing.
- Block is a reaction triggered by an incoming attack and modifies the normal contested defense
  roll.

### Plans

- Attacker: approach until within reach; strike; arm parry.
- Defender: arm block; evade up to 30 feet; take cover.

### Guided resolution

1. Block is the defender's first activity, so it arms immediately and remains available while the
   rest of the defender's plan unfolds.
2. The attacker approaches while the defender evades. The system accounts for each movement at 5
   feet per second and exposes the relevant possible positions.
3. The attacker's approach concludes when the attacker reaches a position from which a strike may
   be possible. Strike becomes the attacker's current activity. The defender may still be evading.
4. Because strike and evade belong to different plans and their relative timing changes the result,
   the system creates an adjudication item. It presents range, movement progress, block's armed
   state, applicable pursue-and-evade modifiers, and choices such as:
   - strike occurs before the defender reaches the next position;
   - evade completes first and the defender is out of reach; or
   - strike and evade are simultaneous.
5. If the GM selects simultaneous, the system applies every modifier defined for the pursue-and-evade
   pairing to its contested concurrency roll. Both sides' penalties remain in force unless that roll
   definition says they cancel. The dice determine the resulting position and whether strike may
   connect. If it may, block can trigger and a fresh contested attack and defense roll determines
   whether the strike succeeds.
6. The attacker's parry does not arm until strike concludes. Once armed, it remains available for
   the rest of the round.
7. The GM's choice, the contested roll, any block consumption, and the resulting positions are
   recorded in the published account.

This example intentionally has no engine-selected canonical chronology. Before, after, and
simultaneous are narrative interpretations for the GM unless a clear configured rule removes the
ambiguity.

## User experience requirements

- Keep the current blocking adjudication central and visible during guided resolution.
- Show the GM every combatant's ordered plan, current activity, completed activities, movement
  remaining, and armed reactions. Show a player only the equivalent details for tokens they own.
- Visually distinguish clear outcomes, possible conflicts, pending adjudications, and GM decisions.
- For a conflict, show the smallest useful set of facts and candidate resolutions without implying
  that the first suggestion is preferred.
- Label concurrency advantages and disadvantages explicitly, identify the activity combination that
  produced them, and explain which contested roll they change.
- Let the GM select a candidate, author another result, add a reason, and preview consequences before
  continuing.
- Explain why an activity was blocked, skipped, interrupted, or modified without exposing internal
  identifiers or hidden information.
- Publish an accessible activity and decision log. Essential state may not depend on animation,
  color, or motion.

## Acceptance criteria

- Controllers can draft and reorder only their permitted plans; stale and post-lock writes are
  rejected without data loss.
- Activities in each plan become eligible strictly in declared order.
- The logical-slot fixture resolves as move/move, quaff/move, arm dodge/throw lasso, then idle/hogtie.
- Non-movement activities are neither assigned generic one-second durations nor rejected because
  they do not fit within six seconds.
- Potion and attack fixtures advance the plan only after their documented completion conditions are
  satisfied.
- Baseline movement is limited to one 5-foot square per slot and six squares per round; diagonal
  movement costs one square and fractional distances never occur.
- Tokens may cross the same square, while ending movement in the same square invokes contested Might
  rolls and knocks the loser prone.
- A first-listed reaction can trigger throughout the round; a reaction after movement cannot arm
  before that movement concludes; an armed reaction remains durable until triggered or round end.
- A planned reaction contains a specific deferred action, and a shared trigger applies every valid
  reaction declared by different player-controlled tokens.
- An attack against a target with unresolved movement produces an adjudication item rather than an
  engine-invented chronology.
- Resolution pauses at each material conflict and does not evaluate dependent activities until the
  GM decides it.
- The attack-during-evade fixture offers before, after, and simultaneous interpretations with
  relevant positions and consequences.
- Simultaneous activity fixtures obtain concurrency modifiers from the combination of activities,
  apply both sides' modifiers, and let the defined dice mechanic determine whether they cancel.
- Every attack rolls a fresh defense, ties favor the defender, critical hits double damage dice,
  and rolled damage applies immediately in simulated state.
- Ambiguous simultaneous attacks, crossings, mutually exclusive effects, and unclear interactions
  among multiple reactions produce adjudication items unless an explicit rule clearly resolves
  them.
- A token without a complete submitted plan is idle when the GM ends planning, and its draft is not
  partially executed.
- Plans are visible only to the owning player and the GM.
- Death, removal, and control change discard outstanding activities. Resurrection later in the round
  does not restore a discarded plan.
- A summon acts in its creation round only when its declared activity consumes the summoner's plan
  capacity; otherwise it waits for the next round.
- No gameplay outcome depends on iteration order, opaque identifiers, network timing, or suggestion
  ordering.
- GM decisions apply only to their current conflict, are retained with their consequences, and
  survive pause/reload/resume.
- A death followed by resurrection is represented as transient round history with the resurrected
  end state committed at publication.
- Publication applies the reconciled end-of-round state atomically and player-safe projections do
  not leak hidden facts, plans, modifiers, private rolls, GM-only reasoning, or opaque identifiers.
- Plan-based combat contains no initiative order, active-combatant turn, or selectable legacy combat
  mode.
- Only one active encounter is permitted; draft plans may be lost across session restart, while
  locked or resolving rounds must resume exactly.

## Remaining rules-content and technical-design work

The product-policy questions above are resolved. The following work remains without changing those
decisions:

- Define completion contracts for every supported action, item, spell, and interaction. Potion use
  and attacks are the reference patterns.
- Author the activity-pairing rules that produce concurrency advantages, disadvantages, contested
  rolls, and cancellation behavior. These assignments remain intentionally TBD and data-driven.
- Tune conservative conflict detection against play examples so it catches materially different
  outcomes without surfacing pedantic no-op choices.
- Define elevation, terrain, route choice, and line-of-sight details on the confirmed 5-foot square
  grid.
- Define how summoner plan capacity represents a declared same-round summoned activity.
- Define the migration from existing initiative and per-combatant turn state to the sole plan-based
  combat model.
