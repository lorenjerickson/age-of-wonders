# Campaign definition foundation

This document intentionally defines only the minimum foundation of a campaign. It separates the
reusable context authored before play from the choices and events that emerge at the table.

## Definition boundary

A campaign definition provides:

- a GM-facing premise describing the campaign's starting situation;
- a player-facing introduction suitable for session zero;
- a reference to one world instance;
- the party's starting location in that world;
- initial placements of creature instances within that world;
- initial placements of item instances within that world;
- initial placements of object instances within that world;
- discoveries associated with world locations; and
- the value or knowledge those discoveries can grant.

A campaign definition provides context, not a script. It does not prescribe what party members can
or should do with the creatures, locations, or discoveries it presents.

This foundation does not require story arcs or another narrative hierarchy. Placements and
discoveries belong directly to the campaign and its world locations.

The campaign definition does not contain a party roster. Each campaign instance assembles its own
party as a session-zero activity. Party composition is entirely at the GM's discretion; the
campaign definition does not impose party size, level, role, class, or membership requirements.

The campaign definition also does not prescribe a starting world date or time. The campaign
instance or session establishes its own clock when play begins.

## 1. Campaign premise

A campaign includes a GM-facing premise or overview. It explains the campaign's starting situation
and provides enough context for the GM to understand what makes the campaign distinctive.
It is stored as constrained rich text so the GM can use headings, emphasis, lists, and quotations
while polishing generated or hand-authored material.

The premise may describe important circumstances, tensions, and people, but it does not prescribe
what the party must do or how events must unfold.

The campaign also includes a separate player-facing introduction that the GM may share during
session zero. It uses the same constrained rich-text format as the premise and establishes what the
players may safely know at the outset without exposing
GM-only context, hidden discoveries, or other protected information. The introduction may invite
engagement with the starting situation, but it does not prescribe character creation choices or
party actions.

## 2. World reference

A campaign references exactly one instance of a world. The world supplies the locations in which
campaign content can be placed and encountered.

All campaign location references must resolve within that world. A campaign does not combine
locations from unrelated worlds.

## 3. Party starting location

A campaign defines the world location where the party begins. The starting location must be a valid
location in the campaign's referenced world.

When the campaign instance begins, its session-zero party is placed at this location. Different
instances of the same campaign may begin with different parties at the same authored starting
location.

This establishes only the party's initial position. It does not prescribe where the party travels
or what the party does after play begins.

## 4. Creature placement

A campaign may create creature instances and place each instance at any valid location in its
referenced world. Every creature instance must be created from a creature definition supplied by
that world; the campaign definition cannot introduce a new creature definition.

The same world creature definition may be instantiated any number of times in one campaign. This is
expected to be common. Each resulting creature is a distinct campaign creature instance with its
own initial placement, even when several instances begin at the same location.

A placement establishes only the creature's initial context:

- which creature instance is present; and
- the world location where that creature begins.

Placement does not require combat or prescribe an interaction. The party may converse with, avoid,
observe, rescue, pursue, fight, or otherwise respond to the creature according to play at the table.

## 5. Item placement

A campaign may create item instances from item definitions supplied by its referenced world and
place those instances at any valid world location. The campaign cannot introduce a new item
definition.

An item placement selects the world-defined item and its location. The campaign does not customize
the world-defined item.

A placed item exists independently of discovery grants. Reaching its location does not
automatically reveal the item, transfer it to a party member, or prescribe how it can be found or
used. Those events remain subject to play and GM discretion.

## 6. Object placement

A campaign may create object instances from object definitions supplied by its referenced world and
place those instances at any valid world location. The campaign cannot introduce a new object
definition.

Objects represent environmental content such as doors, wells, containers, or machinery rather than
ordinary inventory. Reaching an object's location does not prescribe whether or how the party
interacts with it.

## 7. Location discoveries

A world location may have zero or more campaign discoveries associated with it. A discovery is
information or value that may become available through play at that location.

Discovery definitions are authored by the campaign, not supplied by the world. The campaign uses
world locations as the physical context for its discoveries without modifying those locations or
the world itself.

Presence at a location does not reveal its discoveries automatically. The GM decides whether, when,
to whom, and how a discovery is revealed.

## 8. Discovery grants

A discovery may grant one or more of the following:

- monetary value;
- a rumor;
- a fact;
- general knowledge; or
- an item.

A single discovery may combine several grant kinds. For example, searching an abandoned desk might
reveal a rumor recorded in a letter, establish a fact about its author, and uncover hidden coins.

An item grant references an item definition supplied by the campaign's world. Revealing or awarding
the grant creates an item instance from that definition; the campaign does not author a new item
definition.

A monetary grant specifies an amount in a currency supplied by the campaign's world. The campaign
does not introduce a new currency definition.

The campaign definition describes what the discovery can grant. The grant becomes part of campaign
play only when the GM reveals or awards it.

## 9. Unprescribed party action

Campaign context never defines a closed list of allowed, expected, or correct party actions.
Creature placements and discoveries provide material with which the party may interact, but they do
not encode a required solution or sequence of actions.

The GM interprets the context and adjudicates the consequences of the party's choices. The campaign
definition supports that discretion without replacing it.

## Foundational invariants

- A campaign references one world instance.
- A campaign includes a GM-facing premise describing its starting situation.
- A campaign includes a separate player-facing introduction suitable for session zero.
- The player-facing introduction does not expose GM-only campaign information.
- The premise provides context without prescribing party action or campaign outcomes.
- Every referenced location belongs to that world.
- A campaign defines one valid starting location for the party in that world.
- Party membership belongs to the campaign instance and is assembled during session zero.
- Different instances of one campaign may have different party rosters.
- The campaign definition does not constrain party composition; the GM has full discretion.
- The campaign definition does not prescribe a starting world date or time.
- The starting location does not constrain subsequent party movement or action.
- A creature instance may be initially placed at any valid location in that world.
- Every placed creature instance is created from a creature definition supplied by the referenced
  world.
- Campaign definitions cannot introduce creature definitions.
- A campaign may create multiple distinct creature instances from the same world creature
  definition.
- Each creature instance has its own initial placement.
- Creature placement does not imply combat or prescribe party behavior.
- A campaign may initially place instances of world-defined items at valid world locations.
- Campaign definitions cannot introduce item definitions.
- Campaign definitions cannot customize world-defined items.
- An item placement does not automatically reveal or award the item.
- A campaign may initially place instances of world-defined objects at valid world locations.
- Campaign definitions cannot introduce object definitions.
- Objects remain environmental context and are distinct from inventory items.
- Object placement does not prescribe party interaction.
- Discoveries are associated with locations.
- Discovery definitions are owned and authored by the campaign.
- Associating a discovery with a world location does not modify the world.
- A location may contain any number of discoveries, including none.
- Discovery is never automatic; revelation remains at the GM's discretion.
- A discovery may grant money, rumors, facts, general knowledge, items, or a combination of them.
- Every discovery item grant uses an item definition supplied by the referenced world.
- Every monetary grant uses a currency supplied by the referenced world.
- Campaign definitions cannot introduce currencies.
- Campaign context does not enumerate or constrain the actions available to party members.
- Campaign content does not require story arcs or a narrative hierarchy.
- Placements and discoveries may belong directly to the campaign.
- Each included location may have one campaign-owned canvas preparation record.
- Canvas preparation persists only ordered layer visibility and opacity defaults.
- World locations remain authoritative for map images, walls, transitions, and orientation.
- Token positions, fog exploration, rounds, reveals, and other mutable play state belong to sessions,
  not reusable campaign preparation.

## Deferred topics

Everything beyond this foundation remains open. In particular, this document does not yet define
campaign or world versioning, optional story organization, milestones, objectives, urgency, rewards
beyond discovery grants, per-character knowledge tracking, ad hoc session content, migration,
snapshots, publication workflow, or persistence structures beyond the campaign preparation defaults
defined above.
