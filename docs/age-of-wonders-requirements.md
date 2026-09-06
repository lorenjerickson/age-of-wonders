---
name: age-of-wonders-requirements
description: Deprecated singleton-era product requirements retained only for historical archaeology
status: deprecated
last-validated: 2026-09-01
deprecated-on: 2026-09-06
superseded-by: docs/information-architecture-domain-model-realignment.md
exclude-from-analysis-and-generation: true
---

# Age of Wonders product requirements

> **DEPRECATED — EXCLUDED FROM FUTURE ANALYSIS AND GENERATION.** This document describes the
> superseded singleton World/Campaign and blended authoring/play architecture. Do not use it as
> requirements, design evidence, planning input, retrieval context, or AI-generation context. Read
> it only when the user explicitly requests historical analysis or migration archaeology. The
> replacement is `docs/information-architecture-domain-model-realignment.md`.

## Purpose and authority

This document is the working product-requirements baseline for Age of Wonders. It is intended to
become the definitive source for completing the MVP design and implementation.

For this first distillation, requirements were derived in this order:

1. the current implementation, especially `packages/common/src/types`, the committed web
   experience, API behavior, and AI-facing domain guide;
2. explicit product decisions embodied by the current implementation;
3. very recent requirements and project-state documents, principally
   `docs/combat-system-requirements.md` and
   `docs/project-state-gap-analysis-2026-08-31.md`; and
4. older documents only where they remain consistent with the first three sources.

When this document conflicts with older campaign or design prose, this document and the current
implementation take precedence. `docs/campaign-design.md` describes an older reusable-campaign
model and is not authoritative where it conflicts with the single-world, single-campaign model
below.

`packages/common/src/types` remains the implementation source of truth for domain types. A change
to a domain type or its semantics must update `apps/api/src/ai/prompts/domain-model.md` in the same
change.

### Requirement status

- **Established**: current product behavior or an invariant represented by current code and types.
- **Confirmed next-state**: a recent explicit product decision that intentionally changes or
  extends current behavior but is not yet implemented completely.
- **MVP hardening**: required to make the established product complete, correct, or robust enough
  for its stated MVP use.
- **Open decision**: unresolved; listed for iteration and not yet a definitive requirement.

Requirement IDs are stable references for future design, implementation, and acceptance coverage.

## Product definition

Age of Wonders is an AI-assisted virtual tabletop and persistent world workspace for a game master
(GM). It combines world building, campaign preparation, location and map authoring, persistent play
state, session journaling, content creation, and GM-guided play in one application.

The product is not primarily a deterministic simulation engine. It should help the GM prepare and
operate a coherent world, make state and rules legible, record what happened, and resolve ambiguity
without replacing human judgment.

### Product goals

- **PRD-001 — Established:** Let a GM create a setting from a short idea, refine it into a connected
  hierarchy of places, and return to it over many sessions.
- **PRD-002 — Established:** Keep design-time and play-time tools in one location-centered workspace
  so the GM can create or change world content during play without leaving the current context.
- **PRD-003 — Established:** Preserve changes to the world, campaign, locations, placements, and
  location presentation across session boundaries until the GM changes them or resets the world.
- **PRD-004 — Established:** Use AI to accelerate authoring while keeping generated content editable,
  world-scoped, and subordinate to GM intent.
- **PRD-005 — Confirmed next-state:** Facilitate story-centric, plan-based combat while putting the GM
  at the center of ambiguous chronology and outcomes.
- **PRD-006 — Established:** Present human-readable names and context to the GM; never expose opaque
  internal identifiers in application content.
- **PRD-007 — Confirmed next-state:** Plan-based combat is a critical product pillar and must be
  complete enough for end-to-end play in every alpha release; an alpha may not substitute or expose
  the legacy initiative model as the intended combat experience.

### Current product boundary

- One installed workspace contains at most one root world and one campaign.
- The workspace may contain many sessions.
- The GM is the only complete user experience currently implemented.
- The MVP must provide a complete remote session experience for the GM, players, and spectators,
  although identity, authentication, authorization, player-facing screens, and real-time media are
  not yet implemented.
- The first MVP supports one active session and one party, with no more than eight concurrent
  participants in total, including the GM, players, and spectators.

## Core operating model

### Single persistent world

- **CORE-001 — Established:** An active installation must contain at most one root `LocationState`
  whose kind is `world`.
- **CORE-002 — Established:** Ordinary creation must reject a second root world.
- **CORE-003 — Established:** The root world owns a hierarchy of descendant locations, world-scoped
  creatures, item definitions and instances, rules definitions, media-backed maps, and related
  authored content.
- **CORE-004 — Established:** World and location state persists across sessions.
- **CORE-005 — Established:** The GM can permanently reset the world. The current reset deletes the
  root location hierarchy, owning campaigns, related sessions and game snapshots, location
  connections, world creatures, and world-tagged item and definition records.
- **CORE-006 — MVP hardening:** Reset must use a complete ownership inventory and be interruption
  safe, retryable, and convergent across authoritative records, derived graph data, and media
  references.

### Single persistent campaign

- **CORE-007 — Established:** An active installation must contain at most one campaign.
- **CORE-008 — Established:** Ordinary creation must reject a second campaign until the world is
  reset.
- **CORE-009 — Established:** The campaign is the singleton world's GM-authored story and persistent
  play context, not a reusable template instantiated into separate campaigns.
- **CORE-010 — Established:** Every descendant world location is in campaign editing scope. The
  campaign's `locationIds` materializes that hierarchy; it does not create a separate location silo.
- **CORE-011 — Established:** Ending a session does not reset placements, discoveries, map state, or
  location-canvas presentation.

### Definitions and state

- **CORE-012 — Established:** Reusable rules and content belong in definitions; mutable facts belong
  in state records.
- **CORE-013 — Established:** Definitions use stable identities, namespaced extension data, sources,
  tags, and typed components. State records use revisioned identities.
- **CORE-014 — Established:** The rules catalog can contain actions, backgrounds, characters,
  classes, conditions, feats, hazards, heritages, items, languages, monsters, professions,
  disciplines, skills, subclasses, tables, traits, custom definitions, variants, content packs, and
  extension schemas.
- **CORE-015 — Confirmed next-state:** Environmental objects are required for the MVP. An
  environmental object is a persistent, placeable, potentially interactive non-creature entity that
  is not already represented as a wall or door, item, hazard, drawing, or note—for example furniture,
  a chest or other container, a lever, machinery, a well, or destructible cover. The domain model
  must add first-class object definitions and independently stateful placed instances.
- **CORE-016 — Confirmed next-state:** The world has exactly one currency, named `credits`. Credits
  have no exchange or conversion system and may take physical form as paper bills or metal coins.

## Users, roles, and information boundaries

- **ROLE-001 — Established:** The GM can view and edit all authored world and campaign content.
- **ROLE-002 — Established:** GM-only campaign premise, discoveries, notes, hidden content, and
  authoring controls must remain distinguishable from player-safe content.
- **ROLE-003 — Established:** The campaign includes a separate player introduction that can be
  shared without exposing the GM premise or hidden discoveries.
- **ROLE-004 — Confirmed next-state:** A controller may edit plans only for combatants they control.
- **ROLE-005 — Confirmed next-state:** The GM may plan for any combatant and resolve every
  adjudication.
- **ROLE-006 — Confirmed next-state:** Spectators cannot mutate authoritative game state or use any
  player-facing communication channel. They receive only spectator-safe projections, may change
  their own local viewing perspective, and may use the private spectator chat defined in
  `SPECTATOR-011`.
- **ROLE-007 — Confirmed next-state:** A player's draft and submitted combat plan is visible only to
  that plan's owner and the GM until publication rules expose its results.
- **ROLE-008 — MVP hardening:** Any networked or player-facing deployment must authenticate actors
  and enforce ownership, authorization, and projection filtering on the server. Client-side hiding
  is insufficient.
- **ROLE-009 — Established:** Internal GUIDs, UUIDs, definition IDs, entity IDs, media IDs, and other
  opaque identifiers may appear in URLs and storage but never in visible GM labels, tables, cards,
  forms, empty states, or error text. Failed resolution uses a neutral human-readable fallback.

## Information architecture and interaction model

- **UX-001 — Established:** The primary application navigation is a left-side GM workspace drawer.
- **UX-002 — Established:** Primary navigation contains Location, Campaign, Sessions, Creatures, and
  Items. The rules system is not a primary GM navigation destination.
- **UX-003 — Established:** The application does not use a world/campaign/session mode switch in a
  global top navigation. The GM moves through one continuous workspace.
- **UX-004 — Established:** General views use the available browser frame width. The location
  workspace occupies the viewport rather than sitting inside a constrained content well.
- **UX-005 — Established:** In the location workspace, breadcrumbs and session controls overlay the
  map, the left panel provides primary context/tools, and the right panel inspects or configures the
  current selection.
- **UX-006 — Established:** The left and right location panels are visually translucent so the map
  remains the primary spatial context.
- **UX-007 — Established:** Only the primary left panel and right inspector scroll in the location
  workspace; the underlying canvas remains spatially stable.
- **UX-008 — Established:** Navigation becomes a drawer on smaller viewports.
- **UX-009 — Established:** Loading, empty, save-progress, saved, and failure states must be visible
  for primary authoring operations.
- **UX-010 — Confirmed next-state:** The MVP is bespoke development for one known audience; formal
  accessibility conformance or certification is not an acceptance requirement. Ordinary browser
  semantics, legibility, and usable focus behavior should still be preserved where practical.
- **UX-011 — MVP hardening:** Unsaved campaign or canvas preparation must be made explicit. Starting
  a session must flush and validate pending preparation, explicitly discard it with confirmation,
  or refuse to start.
- **UX-012 — Confirmed next-state:** During a session, each player sees a live video stream of
  themselves and the other participating players.
- **UX-013 — Confirmed next-state:** During a session, each player hears audio broadcast by the
  other participating players.

## World and location authoring

### World creation and hierarchy

- **WORLD-001 — Established:** The GM can create the root world from a natural-language prompt using
  AI.
- **WORLD-002 — Established:** World creation establishes a structurally complete root location with
  a human-readable name, description, image, physical profile, and root placement.
- **WORLD-003 — Established:** The GM can inspect the complete location hierarchy and select any
  location for editing.
- **WORLD-004 — Established:** The GM can add a child location manually or generate it with AI using
  the parent and world as context.
- **WORLD-005 — Established:** A child location has a `within-parent` placement, parent reference,
  optional normalized map pin, and a border expressed in the parent's coordinate space.
- **WORLD-006 — Established:** World-editor changes save with optimistic revisions. Conflicting
  writes must not silently overwrite newer state.
- **WORLD-007 — Established:** The GM can delete the world only through an explicit destructive
  confirmation.

### Location model

- **LOC-001 — Established:** A location has identity, name, optional description, an open location
  kind, placement, image, terrain/culture/politics profile, scene references, and extension data.
- **LOC-002 — Established:** Supported location kinds include world, plane, continent, ocean, region,
  nation, province, territory, wilderness, settlement, district, and site, while allowing
  namespaced or setting-specific kinds.
- **LOC-003 — Established:** A location image records accessible alt text, dimensions, media type,
  optional focal point, and an orientation of scenic, overhead, or side-on.
- **LOC-004 — Established:** Location profiles can describe terrain, climates, waterways, resources,
  hazards, cultures, population, heritage candidates, languages, political influences,
  relationships, laws, and stability.
- **LOC-005 — Established:** Locations can be connected by typed, directed or bidirectional travel
  relationships with distance, duration, costs, requirements, and traversal effects.
- **LOC-006 — Established:** Location hierarchy, travel connections, encounter walls, and map
  transitions are distinct concepts and must not be conflated.
- **LOC-007 — Established:** Site locations may own encounter-scale walls and token transitions.
  Other location kinds use strategic placement and connections.

### Maps, walls, doors, and transitions

- **MAP-001 — Established:** The GM can generate or regenerate location maps with AI.
- **MAP-002 — Established:** Map pins, walls, doors, transition triggers, tokens, and canvas objects
  use normalized coordinates so they remain aligned across display sizes.
- **MAP-003 — Established:** Map imagery and wall geometry must use the same transform and scale.
- **MAP-004 — Established:** A wall can block sight, sound, movement, and environmental effects
  independently.
- **MAP-005 — Established:** Walls may be ordinary walls, doors, or invisible walls. Doors have open
  or closed state; an open door does not block any channel.
- **MAP-006 — Established:** A transition is a circular map trigger with a destination location and
  normalized destination position. It may move a token within one location or between locations.
- **MAP-007 — Established:** The GM can author and persist walls and doors from the location
  workspace.
- **MAP-008 — Established:** Map wheel zoom is centered on the current pointer position. Pan, reset,
  and keyboard navigation remain scoped to the canvas rather than hijacking page-level input.

## Persistent location canvas

- **CANVAS-001 — Established:** Adding or opening a campaign location uses the canvas-first location
  workspace, with layer configuration primary and content placement secondary.
- **CANVAS-002 — Established:** World locations remain authoritative for map images, walls,
  transitions, and orientation.
- **CANVAS-003 — Established:** The campaign owns persistent per-location presentation state shared
  by every session.
- **CANVAS-004 — Established:** Each location canvas stores ordered layer configurations with a
  stable key, visibility, and opacity from zero through one.
- **CANVAS-005 — Established:** Supported layers include background, background effects, tiles, grid,
  regions, drawings, templates, walls, tokens, sounds, lighting, notes, controls, special effects,
  illumination, coloration, darkness, visibility, particles, weather, filters, and interface.
- **CANVAS-006 — Established:** The layer inspector behaves as a single-open accordion. Layer
  visibility remains independently controllable.
- **CANVAS-007 — Established:** A location canvas can persist measurement scale, light sources,
  positional sound sources, drawings, area templates, and GM notes.
- **CANVAS-008 — Established:** Every authored canvas object has a stable internal identity and a
  human-readable name. Positions are normalized; ranges and drawing/template sizes are normalized
  against the smaller map dimension.
- **CANVAS-009 — Established:** Sound sources support distance-based or constant volume, a bounded
  volume, a loop flag, and a spatial range.
- **CANVAS-010 — Established:** The GM can inspect, create, move, configure, and remove supported
  canvas placeables through the tool rail and right inspector.
- **CANVAS-011 — Established:** Creature token artwork depends on map orientation: overhead maps use
  overhead tokens and side-on maps use paper-doll tokens. Illustrated tokens use visual separation
  from the background without an unnecessary base decoration.
- **CANVAS-012 — Established:** Creature token positions and scale persist across sessions.
- **CANVAS-013 — Established:** On a side-on map, gravity resolves a creature to the nearest eligible
  floor below it. Movement-blocking horizontal walls can provide floor support.
- **CANVAS-014 — Established:** A completed side-on fall uses the configured pixels-per-five-feet
  scale to calculate fall distance and damage. The final position and hit-point change are persisted.
- **CANVAS-015 — MVP hardening:** One semantic fall operation must not partially save position while
  failing to save damage, or vice versa.
- **CANVAS-016 — MVP hardening:** Lighting, darkness, observer selection, line of sight, and visibility
  must have one authoritative lifecycle and an integrated acceptance test before they are relied on
  for hidden information during play.
- **CANVAS-017 — Confirmed next-state:** The following canvas layers must be fully functional for the
  MVP: background, tiles, walls and doors, tokens, sounds, special effects, illumination, darkness,
  and fog of war. Other represented layer categories are forward-compatible until promoted by a
  later requirement.
- **CANVAS-018 — Confirmed next-state:** Fog-of-war visibility is evaluated from each observing
  creature's current position and vision range. Details currently visible to that creature render in
  their current state.
- **CANVAS-019 — Confirmed next-state:** The GM can create, position, configure, and remove persistent
  light sources on the canvas. Each source emits configured light within its range and contributes
  to current visibility independently of the canvas's natural ambient illumination state.
- **CANVAS-020 — Confirmed next-state:** Illumination and darkness are complementary representations
  of natural ambient light, including the world's day/night cycle. Their authoritative value is
  derived from the current game time in `GameState` and the world's day/night rules.
- **CANVAS-021 — Confirmed next-state:** When a creature moves away from previously revealed map
  details, static or immobile details remain rendered in a dimmed state to communicate that their
  current state is unknown. Mobile details are hidden whenever they fall outside the creature's
  current vision range.
- **CANVAS-022 — Confirmed next-state:** Fog exploration and last-known static detail are persisted as
  authoritative `GameState` so reconnecting or crossing a session boundary does not reveal, forget,
  or refresh map knowledge incorrectly.

## Creature authoring and state

- **CREATURE-001 — Established:** Creatures are world-owned mutable instances with identity,
  world reference, optional monster definition, name, controllers, statistics, state, inventory,
  equipment, actions, effects, conditions, resources, and extensions.
- **CREATURE-002 — Established:** The GM can browse, create, inspect, and edit world creatures.
- **CREATURE-003 — Established:** The GM can create a creature manually or generate it with AI using
  world context.
- **CREATURE-004 — Established:** AI creature generation produces three required images: a portrait,
  an overhead token, and a side-on paper-doll token.
- **CREATURE-005 — Established:** The GM can create a creature with AI from inside the active location
  workspace and place that creature in the current location without leaving the location context.
- **CREATURE-006 — Established:** A campaign creature placement references a world creature instance,
  its current world location, optional normalized map position, and optional positive display scale.
- **CREATURE-007 — Established:** Multiple placements may exist, but each persistent creature that
  can carry independent hit points or inventory needs an independent state identity.
- **CREATURE-008 — Established:** Creature classification separates observed physical nature and
  morphology from cultural aliases. Fantasy labels may be retained as aliases but are not
  authoritative physical categories.
- **CREATURE-009 — Established:** Extraordinary senses and communication abilities record an
  operating basis and state of understanding; unknown mechanisms remain explicit rather than being
  falsely explained.
- **CREATURE-010 — Established:** Creature defense is a fresh opposed roll derived from equipped
  armor contributions rather than a single static armor-class value.
- **CREATURE-011 — Established:** The GM can use AI to generate an armor set, create the corresponding
  item definitions and instances, add them to the creature inventory, and equip them into compatible
  slots.
- **CREATURE-012 — Confirmed next-state:** A creature definition declares whether it describes a
  repeatable creature type or one unique creature identity.
- **CREATURE-013 — Confirmed next-state:** A repeatable definition, such as Giant Rat, may create many
  independently stateful creature instances. A unique definition, such as Sherlock Holmes, may
  create at most one creature instance in the world. Placement and generation workflows must enforce
  the declared policy.

## Character creation

- **CHARACTER-001 — Confirmed next-state:** When a player accepts an invitation to a new campaign,
  the application invites that player to create a new player character in the owning world and
  campaign. A player without an active character, including one whose previous character died, may
  enter this workflow again to create a replacement.
- **CHARACTER-002 — Confirmed next-state:** The player selects a background, profession, and heritage
  for the new character from the choices available in the campaign.
- **CHARACTER-003 — Confirmed next-state:** For `N` character attributes, attribute generation
  produces `N + 2` independent d100 rolls. The player discards one highest and one lowest result,
  then assigns the remaining `N` values to the attributes in any order.
- **CHARACTER-004 — Confirmed next-state:** The player supplies three required character images by
  uploading or generating each one: a portrait, a horizontal side-view token represented by the
  creature model's `paperDollToken`, and an overhead token.
- **CHARACTER-005 — Confirmed next-state:** The player selects starting equipment only from the list
  approved by the GM for that campaign.
- **CHARACTER-006 — Confirmed next-state:** The player provides a brief character biography.
- **CHARACTER-007 — Confirmed next-state:** The player explicitly indicates when the character profile
  is complete and ready for validation.
- **CHARACTER-008 — Confirmed next-state:** The system validates that every required selection,
  attribute assignment, image, equipment choice, biography, and completion indication is present and
  valid before marking the character profile complete.
- **CHARACTER-009 — Confirmed next-state:** Every required player's character profile must pass
  completeness validation before the campaign can begin its first play session.
- **CHARACTER-010 — Confirmed next-state:** `CharacterState` extends `CreatureState`. Every property,
  invariant, and capability that applies to a creature also applies to a character, including world
  ownership, classification, imagery, controllers, attributes, opposed-roll defense, hit points,
  movement, senses, communication, inventory, equipment, actions, effects, conditions, resources,
  and damage adjustments. Character state adds player ownership, advancement, heritage, background,
  professions, biography, and other character-specific progression.
- **CHARACTER-011 — Confirmed next-state:** A player campaign membership owns a history of zero or
  more characters and identifies at most one active character at a time. Dead and retired characters
  remain associated with that membership rather than being overwritten or reassigned.
- **CHARACTER-012 — Confirmed next-state:** Character death does not terminate campaign membership.
  The player may create and complete a replacement character, after which the replacement becomes
  the membership's active character and the prior character remains recorded as dead.

## Item authoring, inventory, and equipment

- **ITEM-001 — Established:** The GM can browse, search, create, inspect, and edit world item
  definitions.
- **ITEM-002 — Established:** The GM can create an item manually or generate an item or weapon with AI
  using world context.
- **ITEM-003 — Established:** The GM can generate or replace an item's inventory image with AI.
- **ITEM-004 — Established:** Every item definition has a construction quality of ramshackle,
  standard, fine, or exquisite.
- **ITEM-005 — Established:** Item instances reference definitions and track their own quality,
  quantity, location, synchronization/attunement, analysis, capacity, ammunition, durability, and
  custom state.
- **ITEM-006 — Established:** Item location distinguishes inventory, container, scene, strategic
  location, carried, and destroyed state.
- **ITEM-007 — Established:** Equipment supports compatible slots, multi-slot occupancy, containers,
  equipping, unequipping, stowing, and retrieving.
- **ITEM-008 — Established:** A campaign item placement references a world item definition and current
  world location. Presence does not automatically reveal, grant, or transfer the item.
- **ITEM-009 — MVP hardening:** The definition-versus-instance transition for placed or granted items
  must be explicit wherever independent quantity, owner, durability, or inventory state is required.
- **ITEM-010 — Confirmed next-state:** Every placed item has a GM-controlled visible or invisible
  state. Invisible items remain available to the GM but are omitted from player and spectator map
  projections, including when they are inside a creature's current vision range, until made visible.
- **ITEM-011 — Confirmed next-state:** Placed-item visibility is mutable authoritative state owned by
  `GameState` and persists across movement, reconnection, and session boundaries.

## Environmental-object authoring and state

- **OBJECT-001 — Confirmed next-state:** The rules catalog supports reusable environmental-object
  definitions, and `GameState` supports independently revisioned instances created from them.
- **OBJECT-002 — Confirmed next-state:** The GM can browse, create, inspect, and edit environmental
  object definitions and can place, inspect, move, configure, and remove their instances from a
  location canvas.
- **OBJECT-003 — Confirmed next-state:** A definition owns the object's reusable identity,
  description, presentation, and default capabilities. A placed instance owns its current location,
  position, visibility, open or locked state, damage state, inventory, and other mutable facts that
  apply to that object.
- **OBJECT-004 — Confirmed next-state:** Environmental-object instances and their mutable state
  persist across movement, reconnection, and session boundaries until changed through an
  authoritative game-state operation.

## Campaign authoring and discoveries

- **CAMPAIGN-001 — Established:** The GM can generate the singleton campaign from a natural-language
  prompt grounded in the existing world.
- **CAMPAIGN-002 — Established:** The generated campaign remains fully editable.
- **CAMPAIGN-003 — Established:** A campaign contains a human-readable name, root-world reference,
  protected GM premise, player introduction, the materialized world hierarchy, party starting
  location, persistent placements, discoveries, location canvases, and extensions.
- **CAMPAIGN-004 — Established:** GM premise and player introduction use constrained rich text. Safe
  markup includes paragraphs, second- and third-level headings, emphasis, lists, blockquotes, line
  breaks, and safe links.
- **CAMPAIGN-005 — Established:** Campaign content provides starting context, not a prescribed story.
  It must not dictate player actions or automatically trigger encounters, revelations, or rewards.
- **CAMPAIGN-006 — Established:** Campaign generation may reference only records supplied in the
  owning-world context and must not invent dangling location, creature, item, object, or other
  identifiers. Generated monetary content uses the canonical credits currency from `CORE-016`.
- **CAMPAIGN-007 — MVP hardening:** Every campaign reference must be validated server-side against the
  owning world and the intended definition/state category.
- **CAMPAIGN-008 — Established:** A discovery has a human-readable GM name, a world location, and zero
  or more grants.
- **CAMPAIGN-009 — Established:** Discovery grants may contain money, a rumor, a fact, general
  knowledge, or an item definition reference.
- **CAMPAIGN-010 — Established:** Arriving at a discovery's location does not reveal or grant it
  automatically. The GM decides whether, when, how, and to whom it is revealed.
- **CAMPAIGN-011 — Established:** Creature and item placements can be managed in the location
  workspace. Existing object placements are preserved and counted.
- **CAMPAIGN-012 — Confirmed next-state:** Environmental-object definitions and placed instances are
  first-class campaign preparation and in-session content, as specified by `CORE-015` and
  `OBJECT-001` through `OBJECT-004`.
- **CAMPAIGN-013 — Confirmed next-state:** Every monetary discovery, reward, price, inventory balance,
  and rules effect is denominated in credits. The product does not offer a currency selector,
  free-form denomination, exchange rate, or currency-conversion workflow.
- **CAMPAIGN-014 — Confirmed next-state:** A player is invited to join the campaign through a campaign
  invitation link sent by SMS, email, or both. Campaign membership persists independently of the
  invitations used to join individual play sessions.
- **CAMPAIGN-015 — Confirmed next-state:** When a player accepts a campaign invitation, the application
  guides them through player onboarding and the creation of their character as a creature in the
  owning world and campaign.
- **CAMPAIGN-016 — Confirmed next-state:** During character creation and equipment selection, a player
  can use the same underlying AI-assisted authoring capabilities available to the GM, constrained to
  the player's permitted character and equipment scope and grounded in the owning world and campaign.
- **CAMPAIGN-017 — Confirmed next-state:** Character creation is a persistent, resumable workflow. A
  player can leave and return across multiple visits to create and equip the character before play,
  then continue refining the character between later play sessions without losing completed work.
- **CAMPAIGN-018 — Confirmed next-state:** If a player's character remains incomplete before the
  campaign's first scheduled session, the application reminds the player by SMS, email, or both to
  return and complete character creation.
- **CAMPAIGN-019 — Confirmed next-state:** The GM can invite spectators to join the campaign through
  an SMS and/or email link. Accepting that invitation begins the role-appropriate spectator flow in
  `SPECTATOR-001` through `SPECTATOR-011` and does not start player character creation.
- **CAMPAIGN-020 — Confirmed next-state:** Campaign membership is owned by the participant, not by one
  character. A player membership persists across character death and may own multiple characters
  over the campaign's lifetime, while exposing no more than one active character at a time.

`CAMPAIGN-015` through `CAMPAIGN-018` establish the campaign integration points for the character
creation requirements in `CHARACTER-001` through `CHARACTER-012`. Further character-creation detail
may be added without changing that ownership boundary.

## Spectator experience

- **SPECTATOR-001 — Confirmed next-state:** A spectator joins only through an invitation issued by the
  GM and delivered by SMS, email, or both.
- **SPECTATOR-002 — Confirmed next-state:** Invited and present spectators appear by human-readable
  name in the lobby participant list, but the application never publishes a spectator's camera or
  microphone feed in the lobby or active session.
- **SPECTATOR-003 — Confirmed next-state:** A spectator has no character, token, or other symbolic
  presence in the game and cannot communicate with players through voice, video, chat, map tools, or
  any other in-session channel.
- **SPECTATOR-004 — Confirmed next-state:** A spectator can see and hear every player's published
  video and audio in the lobby and throughout the active session while remaining receive-only.
- **SPECTATOR-005 — Confirmed next-state:** During an encounter, a spectator can select a player
  character token and view the scene from that token's current perspective. This changes only the
  spectator's local view and grants no control over the token.
- **SPECTATOR-006 — Confirmed next-state:** On a map where the party is represented by one group
  position rather than individual player tokens, a spectator sees the entire map.
- **SPECTATOR-007 — Confirmed next-state:** A spectator can voluntarily leave and rejoin an active
  session at any time while their invitation remains valid and they are not banned.
- **SPECTATOR-008 — Confirmed next-state:** The GM can eject a spectator from the current lobby or
  active session and can separately ban that spectator.
- **SPECTATOR-009 — Confirmed next-state:** A banned spectator cannot join or rejoin any current or
  future session in the installation.
- **SPECTATOR-010 — Confirmed next-state:** The application preserves a banned spectator's email
  address and phone number and uses both identifiers to deny future campaign and session access.
- **SPECTATOR-011 — Confirmed next-state:** Spectators can communicate with one another through a
  private spectator chat channel. The GM can view this channel; players cannot view or participate
  in it.

## Sessions and persistent play

- **SESSION-001 — Established:** The campaign may have many session records.
- **SESSION-002 — Established:** A session records identity, name, world and campaign references,
  status, optional schedule/start/end timestamps, scene references, encounter references, event
  references, optional notes, and extensions.
- **SESSION-003 — Established:** Session status is planned, in-progress, completed, or cancelled.
- **SESSION-004 — Established:** The GM can start a session from the location workspace and complete
  the active session.
- **SESSION-005 — Established:** A session marks a period of play and provides a journal/timing
  boundary. It does not snapshot or reset the persistent world and campaign.
- **SESSION-006 — Established:** The Sessions view lists records belonging to the current campaign
  and distinguishes active, scheduled, completed, and cancelled state through human-readable
  status.
- **SESSION-007 — Confirmed next-state:** Session lifecycle rules are enforced server-side, including
  valid transitions, at most one in-progress session, and safe recovery after interruption.
- **SESSION-008 — Confirmed next-state:** Visible session data consists of the session date, start
  time, end time, and participants. During invitation and lobby flow, participant invitation,
  response, and presence status is also visible. Other mutable play facts and history belong to the
  authoritative `GameState`, not to a parallel session-owned model.
- **SESSION-009 — Confirmed next-state:** `GameState` is the sole owner of party composition, party
  location, current game time, scene state, and the active encounter. Session records may identify
  or index the associated state but may not become a second authority for those facts.
- **SESSION-010 — Confirmed next-state:** The MVP session experience supports remote players and
  spectators as first-class participants, including the role-specific real-time media requirements
  in `UX-012`, `UX-013`, and `SPECTATOR-002` through `SPECTATOR-004`.
- **SESSION-011 — Confirmed next-state:** The GM invites each intended participant to a new session
  with a join link sent by SMS, email, or both.
- **SESSION-012 — Confirmed next-state:** Session participants have one of three roles: GM, player, or
  spectator.
- **SESSION-013 — Confirmed next-state:** Opening a session invitation takes the participant to that
  session's join lobby. The lobby asks them either to confirm entry or send a message indicating that
  they are unable or unavailable to join.
- **SESSION-014 — Confirmed next-state:** The lobby lists every invited participant and clearly
  distinguishes who is present, who has not yet arrived, and who has reported that they cannot join.
- **SESSION-015 — Confirmed next-state:** The GM and every invited player are required participants.
  Spectators are optional and never block session start.
- **SESSION-016 — Confirmed next-state:** Before the session starts, present participants wait in the
  lobby until all required participants are present or the GM cancels the session.
- **SESSION-017 — Confirmed next-state:** Lobby camera and voice integration lets the GM and present
  players see, hear, and speak with one another while waiting. Present spectators can receive every
  player's audio and video but publish neither audio nor video.
- **SESSION-018 — Confirmed next-state:** Once all required participants are present, the GM can begin
  the session with a **Start session** function in the lobby. Only the GM can use this function, and
  it cannot start the session while a required participant is absent. For the campaign's first play
  session, it also remains unavailable until every required player has a complete character profile
  under `CHARACTER-009`.
- **SESSION-019 — Confirmed next-state:** A spectator may join after the session has begun and is not
  required to have been present in the lobby at session start.
- **SESSION-020 — Confirmed next-state:** When an invited spectator follows the join flow after the
  session has begun, the application recognizes the in-progress session and joins them directly to
  its current spectator-safe state rather than waiting for another start event.
- **SESSION-021 — Confirmed next-state:** The GM can cancel the session from the lobby when required
  participants are unavailable. Cancellation does not begin or advance authoritative play state.

## Plan-based combat

This section distills the very recent confirmed combat requirements. It is a **confirmed
next-state** requirement set, not a description of current `EncounterState`. The existing
initiative, `turnIndex`, active-combatant, and `advance-turn` model is legacy implementation to be
replaced rather than a second supported combat mode.

### Combat intent and lifecycle

- **COMBAT-001 — Confirmed next-state:** Combat uses one ordered plan per participating combatant and
  contains no initiative order or individual active-combatant turns.
- **COMBAT-002 — Confirmed next-state:** Activities within one plan become eligible strictly in their
  declared order. Activities from different plans unfold together in logical resolution slots.
- **COMBAT-003 — Confirmed next-state:** A logical slot aligns current activities but does not assign
  a one-second duration to non-movement activities.
- **COMBAT-004 — Confirmed next-state:** The encounter lifecycle is setup, planning, locked, guided
  resolution, blocking adjudication, review, publication, and next round or completion.
- **COMBAT-005 — Confirmed next-state:** The GM may close planning at any time. A combatant without a
  complete submitted plan is idle for that round; an incomplete draft is never partially executed.
- **COMBAT-006 — Confirmed next-state:** There is at most one active encounter.

### Movement and space

- **COMBAT-007 — Confirmed next-state:** Movement is the only activity governed by the six-second
  round budget.
- **COMBAT-008 — Confirmed next-state:** Baseline movement is 5 feet per movement checkpoint for no
  more than six checkpoints, or 30 feet, subject to explicit rule modifiers.
- **COMBAT-009 — Confirmed next-state:** The authoritative combat grid uses 5-foot squares. Orthogonal
  and diagonal movement each costs one square; fractional-square distance is not tracked.
- **COMBAT-010 — Confirmed next-state:** A later activity in the same plan waits until declared
  movement reaches its destination or stop condition, exhausts its budget, becomes clearly
  impossible, or is adjudicated to conclusion.
- **COMBAT-011 — Confirmed next-state:** Tokens may cross the same square during movement. If two
  tokens end movement in the same square, a contested Might roll determines which is knocked prone;
  ties favor the target or defender.

### Reactions and plan ordering

- **COMBAT-012 — Confirmed next-state:** A reaction is a fully declared deferred action with a typed
  trigger, predicate, timing, target filters, costs, exact response, and expiry.
- **COMBAT-013 — Confirmed next-state:** A reaction arms only after every preceding plan activity has
  concluded. It remains armed while later plan activities execute, until triggered, invalidated, or
  expired at round end.
- **COMBAT-014 — Confirmed next-state:** A trigger that occurred before a reaction armed cannot trigger
  it retroactively.
- **COMBAT-015 — Confirmed next-state:** At most one reaction may be planned for each
  player-controlled token in a round.
- **COMBAT-016 — Confirmed next-state:** When one event triggers valid reactions from multiple
  player-controlled tokens, all matching declared reactions apply. Players do not replace them with
  newly invented responses.

### Conflict detection and GM adjudication

- **COMBAT-017 — Confirmed next-state:** The resolver detects material conflicts in chronology,
  movement, range, line of sight, cover, occupancy, target validity, mutually exclusive effects,
  resources, forced movement, and interacting reactions.
- **COMBAT-018 — Confirmed next-state:** Conflict detection preserves meaningful uncertainty without
  flooding the GM with immaterial or purely theoretical choices.
- **COMBAT-019 — Confirmed next-state:** A clear configured rule may resolve a conflict automatically
  and must explain the rule and facts used.
- **COMBAT-020 — Confirmed next-state:** If no configured rule selects one result, resolution pauses
  immediately and the GM chooses or authors the authoritative outcome before dependent activities
  continue.
- **COMBAT-021 — Confirmed next-state:** Candidate resolutions are decision support, not an
  authoritative ranking or a claim that every fictional outcome was enumerated.
- **COMBAT-022 — Confirmed next-state:** A GM adjudication applies only to its current conflict and is
  not silently promoted into a reusable rule.
- **COMBAT-023 — Confirmed next-state:** Concurrency advantage or disadvantage is defined by the
  interaction between specific activities, not as an inherent property copied from D&D 5e.
- **COMBAT-024 — Confirmed next-state:** Applicable concurrency modifiers are applied independently to
  each side and cancel only when the defined contested-roll mechanic says they cancel.

### Attacks, damage, and transient state

- **COMBAT-025 — Confirmed next-state:** Every attack uses a fresh opposed defense roll. There is no
  static defense value.
- **COMBAT-026 — Confirmed next-state:** Required attack, defense, damage, and contested rolls come
  from the action or item definition rather than from the scheduler.
- **COMBAT-027 — Confirmed next-state:** Ties favor the target or defender. A critical hit doubles the
  number of damage dice rolled, not the final numeric result.
- **COMBAT-028 — Confirmed next-state:** Damage applies immediately to simulated round state after its
  roll so it can affect later activities.
- **COMBAT-029 — Confirmed next-state:** Death, removal, or controller change discards the affected
  combatant's remaining plan. Resurrection later in the round restores resulting state but not the
  discarded plan.
- **COMBAT-030 — Confirmed next-state:** A summon may act in its creation round only when the summon
  and summoned activity were both declared within and consume the summoner's plan capacity.

### Persistence, privacy, and publication

- **COMBAT-031 — Confirmed next-state:** Draft plans need not survive restart. Locked plans, plan
  cursors, movement spent, armed reactions, rolls, conflicts, adjudications, and unpublished
  consequences must survive pause, reload, and process restart.
- **COMBAT-032 — Confirmed next-state:** Locking atomically captures all included plans and relevant
  encounter, ruleset, and random-state revisions.
- **COMBAT-033 — Confirmed next-state:** Resolution uses simulated round state. It does not commit
  intermediate damage, death, resurrection, movement, or other transient changes piecemeal to the
  authoritative encounter.
- **COMBAT-034 — Confirmed next-state:** After every plan is complete or discarded and all conflicts
  are reconciled, publication atomically commits only the resulting end-of-round state and its audit
  history.
- **COMBAT-035 — Confirmed next-state:** Plan transitions, rolls, clear outcomes, conflicts, GM
  decisions, publication, pause, and completion are auditable and idempotent.
- **COMBAT-036 — Confirmed next-state:** The system produces distinct GM-safe and player-safe
  projections. Player projections omit hidden combatants, other private plans, GM-only modifiers,
  private rolls, alternative outcomes, and adjudication reasoning that reveals hidden facts.
- **COMBAT-037 — Confirmed next-state:** No gameplay result may depend on array order, opaque IDs,
  network arrival order, or suggestion order.

### Combat experience

- **COMBAT-038 — Confirmed next-state:** The GM sees each combatant's ordered plan, current and
  completed activities, movement remaining, armed reactions, conflicts, decisions, and consequences.
- **COMBAT-039 — Confirmed next-state:** A player sees the equivalent information only for tokens they
  control plus published player-safe results.
- **COMBAT-040 — Confirmed next-state:** The conflict UI shows the smallest useful set of facts,
  plausible interpretations, and known downstream consequences without presenting the first option
  as preferred.
- **COMBAT-041 — Confirmed next-state:** The GM can choose a candidate, author another result, add an
  explanation, preview consequences, and then continue resolution.
- **COMBAT-042 — Confirmed next-state:** The system publishes an accessible activity and decision log.
  Essential combat state does not depend on animation, color, or motion.

## Rules, characters, and authoritative game state

- **RULES-001 — Established:** The rules engine represents dice, numeric and logical expressions,
  actions, costs, choices, predicates, effects, modifiers, triggers, durations, conditions, traits,
  and rule executions as typed data.
- **RULES-002 — Established:** Skills are definitions with stable IDs, never free-form strings in
  actor state or rules tests.
- **RULES-003 — Established:** Character state can represent controllers, advancement, heritage,
  background, attributes, skills, proficiencies, hit points, movement, senses, languages, inventory,
  equipment, disciplines, features, feats, professions, effects, conditions, resources, biography,
  and extensions.
- **RULES-004 — Established:** Heritage selections are chosen at character creation from candidates
  supplied by the character's origin region and are immutable after creation.
- **RULES-005 — Established:** Profession state records expertise, acquisition, advancement awards and
  spends, and action-use counts.
- **RULES-006 — Established:** `GameState` is the complete authoritative snapshot for mutable rules
  state, including campaign state, entities, geography, optional active encounter, pending
  decisions, pending executions, events, and reproducible random state.
- **RULES-007 — Confirmed next-state:** `GameState`, including the campaign state embedded within it,
  is the sole authoritative owner of mutable play state. `CampaignDefinition` supplies authored
  starting content and session records supply lifecycle metadata; neither duplicates mutable party,
  location, time, scene, or encounter state.
- **RULES-008 — Confirmed next-state:** Legacy initiative and per-turn commands, events, duration
  assumptions, and encounter state must be migrated or replaced when plan-based combat is
  implemented.

## Science and technology setting contract

- **SCI-001 — Established:** The authoritative domain model describes observable phenomena,
  capabilities, inputs, mechanisms, operating bases, and uncertainty rather than asserting magic as
  unexplained objective causation.
- **SCI-002 — Established:** Disciplines replace spells as the core capability definition. Discipline
  data includes function tags, operating basis, understanding, observed phenomenon, inputs,
  activation, range, targets, duration, outcomes, scaling, access sources, and safety/failure data as
  applicable.
- **SCI-003 — Established:** Unknown or poorly understood mechanisms remain explicitly unknown. The
  system must not fabricate a scientific explanation merely to remove fantasy vocabulary.
- **SCI-004 — Established:** Existing capability and gameplay behavior is preserved through
  explanation, constraint, reclassification, or a registered compatibility exception. Automatic
  deletion is not an acceptable migration outcome.
- **SCI-005 — Established:** Attunement remains as operator-item synchronization and may represent
  calibration, pairing, authorization, biological tolerance, interface bandwidth, or another
  setting-specific physical process.
- **SCI-006 — Established:** Current writes must use the science-and-technology vocabulary. Legacy
  data is handled through the versioned migration and archive compatibility paths.

## AI-assisted authoring

- **AI-001 — Established:** AI authoring combines the GM's prompt with authoritative product/domain
  guidance and relevant world context.
- **AI-002 — Established:** Supported specialized flows include world creation, child-location and
  map generation, creature generation with images, item and weapon generation, item-image
  regeneration, creature armor-set generation, and campaign generation.
- **AI-003 — Established:** AI output is not written directly as arbitrary prose. Specialized services
  parse, normalize, assign authoritative IDs/context, create related media where required, and
  persist domain records.
- **AI-004 — Established:** Generated records remain editable through the same interfaces as manually
  authored content.
- **AI-005 — Established:** AI must not invent references to locations, definitions, creatures,
  items, skills, currencies, or other records that are not present in supplied context.
- **AI-006 — Established:** Generation history records the generation kind, combined prompt, output,
  model, provider response ID, and timestamps.
- **AI-007 — MVP hardening:** Generation requests that can mutate data must be timeout-bounded,
  idempotent, observable, and recoverable from provider failure or client retry without duplicating
  content or cost.
- **AI-008 — MVP hardening:** Stored prompts and outputs require defined ownership, access, retention,
  deletion, and redaction behavior before any networked or multi-user deployment.
- **AI-009 — Established:** Invalid structured AI output is logged with bounded, sanitized previews;
  request bodies and credentials are not included in ordinary failure logs.

## Persistence, graph, media, and transfer

### Domain persistence

- **DATA-001 — Established:** Domain aggregates are available through versioned JSON-document create,
  list, read, replace, and delete APIs.
- **DATA-002 — Established:** Lists support kind, world, search, sort, order, limit, and offset where
  applicable, with deterministic ID ordering as a tiebreaker.
- **DATA-003 — Established:** Replace requests may use an expected revision. The web authoring flows
  use optimistic revisions and reject stale writes rather than silently overwriting them.
- **DATA-004 — MVP hardening:** Every ingestion path—including generic CRUD, AI, science archive,
  host transfer, migrations, backfills, and bulk tools—must validate the complete resource contract
  and cross-resource invariants before authoritative data is accepted.
- **DATA-005 — MVP hardening:** The one-world and one-campaign invariants must be enforced atomically at
  the database boundary rather than through a race-prone count followed by create.
- **DATA-006 — MVP hardening:** The repository must contain reviewed relational migrations and a
  reproducible create, upgrade, drift-check, and restore or forward-fix procedure.

### Derived world graph

- **GRAPH-001 — Established:** Domain writes derive graph tuples for resource identity, type, name,
  containment, and fields whose names end in `Id` or `Ids`.
- **GRAPH-002 — Established:** Derived graph entries use PostgreSQL-backed LevelGraph storage in the
  same database installation. Manually managed tuples are also supported.
- **GRAPH-003 — MVP hardening:** Authoritative domain writes and derived projection intent must be
  committed atomically. Projection delivery may be asynchronous but must be idempotent,
  attributable, observable, retryable, auditable, and repairable.
- **GRAPH-004 — MVP hardening:** Reconciliation must distinguish derived from manual tuples and must
  never erase manual data while repairing a projection.

### Media

- **MEDIA-001 — Established:** Maps, creature views, item images, audio, and other binary assets are
  stored in S3-compatible object storage with searchable metadata in PostgreSQL.
- **MEDIA-002 — Established:** Media metadata includes original name, media type, MIME type, purpose,
  size, tags, and a generated storage key. Downloads use time-limited URLs.
- **MEDIA-003 — Established:** Upload purpose and MIME type determine the storage folder structure;
  generated opaque storage names are not shown as GM-facing labels.
- **MEDIA-004 — MVP hardening:** An exposed deployment must authenticate uploads, validate actual
  content, enforce safe size/rate/quota limits, and provide cleanup or repair for object/metadata
  divergence.

### Migration, archives, and host transfer

- **TRANSFER-001 — Established:** Science-domain migration defaults to dry run, reports human-readable
  changes/failures/exceptions, uses optimistic revisions, is idempotent, and can report compatibility
  retirement readiness.
- **TRANSFER-002 — Established:** Science archives can export all persisted domain aggregates and
  import them as an idempotent merge after a non-mutating dry run.
- **TRANSFER-003 — Established:** Host transfer can select worlds, campaigns, and sessions. An empty
  selector exports all domain records.
- **TRANSFER-004 — Established:** A host-transfer archive includes selected records and dependencies,
  complete media metadata and object bytes, checksums, and the exact Prisma schema. Derived graph
  entries are rebuilt rather than copied.
- **TRANSFER-005 — Established:** Import supports `ours`, `theirs`, and `both` conflict strategies;
  `both` remaps copied identities and internal references.
- **TRANSFER-006 — Established:** Host-transfer import defaults to dry run, validates the complete
  artifact before mutation, can upgrade an empty or older destination schema, stages object writes,
  commits database changes transactionally, rebuilds graph projections, and attempts rollback of
  staged/overwritten objects on failure.
- **TRANSFER-007 — MVP hardening:** Transfer-service orchestration, compensation, schema upgrade, and
  restore behavior must be verified against real PostgreSQL and S3-compatible storage before it is
  treated as a production backup/restore guarantee.

## Quality, security, and operational requirements

- **QUAL-001 — Established:** The web, API, and common packages must typecheck, lint, test, and build
  from the workspace scripts.
- **QUAL-002 — Established:** API DTO handling whitelists declared fields, transforms inputs, and
  rejects non-whitelisted DTO fields.
- **QUAL-003 — Established:** Failed API requests emit structured logs with request ID, method, path,
  status, exception type, message, and server stack where appropriate. Request bodies and credentials
  are not logged.
- **QUAL-004 — Established:** The request ID is returned to the client for support correlation.
- **QUAL-005 — MVP hardening:** A minimum CI workflow must enforce formatting, lint, typecheck, unit
  tests, builds, migration validity, and schema-drift checks on every change.
- **QUAL-006 — MVP hardening:** Critical world, campaign, location, session, AI, media, transfer, and
  combat journeys require component, API integration, and browser end-to-end coverage in proportion
  to their risk.
- **QUAL-007 — MVP hardening:** Runtime configuration must be typed, fail fast for required production
  values, and avoid silently using development credentials or exposure defaults in production.
- **QUAL-008 — MVP hardening:** Liveness and readiness must be separate. Readiness must cover the
  database, schema version, object storage, projection backlog/drift, and required AI configuration.
- **QUAL-009 — MVP hardening:** Release procedures must include reviewed migrations, backup and
  restoration, rollback or forward-fix, graph repair, reset recovery, and active-combat recovery.
- **QUAL-010 — Confirmed next-state:** The MVP supports modern browsers on desktop, tablet, and mobile
  devices and is deployed as a Docker container. Its initial operating envelope is one active
  session, one party, and no more than eight concurrent participants including the GM, players, and
  spectators.
- **QUAL-011 — Confirmed next-state:** Completing a session triggers a new backup. The system retains
  the backups from the three most recently completed sessions, and recovery from one of those
  backups restores the exact authoritative `GameState` captured at that session boundary.
- **QUAL-012 — Confirmed next-state:** The product imposes no fixed numeric limits on world size, map
  content, entity count, or event-history length. These collections are bounded only by available
  persistent storage; no smaller application-level quota is part of the MVP contract.

## MVP boundary

The following capabilities are required together. Remote participation and plan-based combat are
not optional tiers or post-alpha additions.

### Complete alpha and MVP experience

- One world and one campaign can be created, edited, and deliberately reset.
- The full location hierarchy and world-scoped creatures, items, and environmental objects can be
  authored and placed through their required workflows.
- The location canvas fully supports background, tiles, walls and doors, tokens, sounds, special
  effects, illumination, darkness, and fog-of-war layers, alongside persisted map state and side-on
  gravity behavior.
- Placed items can be marked visible or invisible, placeable light sources affect the canvas, natural
  illumination follows game time, and fog of war distinguishes currently visible, previously seen
  static, and currently hidden mobile details.
- Players and spectators can accept campaign invitations delivered through SMS and/or email. Player
  onboarding provides resumable, AI-assisted character creation, attribute generation, required
  imagery, biography, and GM-approved equipment preparation, with reminders when a character remains
  incomplete before the first scheduled session; spectator onboarding remains role-appropriate and
  does not require character creation.
- The GM can start and complete sessions without losing or silently discarding persistent
  preparation; at most one session is in progress.
- Remote participants receive SMS and/or email invitation links and enter a lobby that exposes
  invitation and presence status, provides camera and voice conversation for the GM and players,
  gives spectators receive-only access to player media, requires the GM and all players before
  start, and lets the GM start or cancel the session.
- The campaign's first session cannot start until every required player's character profile passes
  the completeness requirements in `CHARACTER-001` through `CHARACTER-012`. A returning player whose
  previous character died must complete a replacement before that player is required for a later
  session.
- Remote players and spectators can join the session experience, see participant video, hear player
  audio, and receive only the controls and information permitted by their role. Spectators do not
  block session start and can join an in-progress session at its current spectator-safe state.
- Spectators have no in-world presence or player communication channel. They can select a player
  token's encounter perspective, see the entire map for group-position scenes, leave and rejoin,
  participate in GM-visible spectator-only chat, and be ejected or permanently banned by the GM.
- The plan-based combat requirements in `COMBAT-001` through `COMBAT-042` are implemented end to end;
  the legacy initiative model is not presented as an alpha alternative.
- `GameState` is the sole authority for party composition, location, current time, scene state,
  active encounter, and other mutable play state.
- Domain data is runtime-validated, singleton creation is race-safe, and reset is recoverable.
- Actor identity, controller assignment, server authorization, and privacy projections are active.
- Locked and resolving combat rounds survive restart exactly and publish atomically.
- Browser tests cover world creation, campaign/location preparation, remote session participation,
  plan-based combat, session completion, backup creation, and exact `GameState` restoration.
- Export/import restoration has been rehearsed against representative data and media.
- Every sensitive read, write, generation, upload, reset, graph, transfer, and history endpoint has
  server-enforced authentication and authorization.
- Stored AI prompts/outputs follow an enforced ownership and retention policy.
- Destructive and multi-record operations are atomic or durably recoverable.
- Reviewed database migrations, CI, deployment, readiness, monitoring, backup, restore, and incident
  runbooks are demonstrated.
- The application runs in a Docker container and supports modern desktop, tablet, and mobile
  browsers for a single party of at most eight concurrent participants.
- Critical GM, player, and spectator journeys pass automated privacy, opaque-ID, and end-to-end
  tests.
- World, map, entity, and event-history collections have no product-defined capacity limit below the
  available persistent storage.

## Explicitly deferred or excluded from the current MVP baseline

- Reusable campaign definitions or multiple campaigns within one active installation.
- Story arcs or another prescribed narrative hierarchy.
- Automatic discovery reveal or automatic reward granting merely from location presence.
- Reusable GM combat rulings that silently affect future conflicts.
- A selectable legacy initiative combat mode after plan-based combat ships.
- Unrestricted natural-language combat plans without typed semantics.
- Deterministic automatic resolution of fictionally ambiguous combat chronology.
- Advanced first-release behavior for mounts, legendary/lair activities, free interactions, and
  summon systems beyond `COMBAT-030`.
- Campaign publication/versioning, per-character knowledge, and ad hoc content migration unless a
  later decision moves them into MVP scope.
- Formal accessibility certification or conformance to a strict external accessibility standard.

## Open decisions for the next iteration

None of the currently enumerated product questions remain unresolved. The environmental-object,
visibility, accessibility, and capacity decisions are now owned by `CORE-015`, `CANVAS-018` through
`CANVAS-022`, `UX-010`, and `QUAL-012` respectively. New implementation-level questions should be
added here only when they require a product decision rather than a technical design choice.

## Traceability map

| Area                         | Primary implementation evidence                                           | Recent supporting source                                |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Product shell and navigation | `apps/web/src/App.tsx`                                                    | Project-state gap analysis                              |
| World/location authoring     | `packages/common/src/types/locations.ts`, `apps/web/src/WorldEditor.tsx`  | AI domain guide                                         |
| Persistent campaign/canvas   | `packages/common/src/types/campaign.ts`, `apps/web/src/Campaigns.tsx`     | Project-state gap analysis                              |
| Creatures and images         | `packages/common/src/types/creatures.ts`, `apps/web/src/Creatures.tsx`    | AI domain guide                                         |
| Character creation           | `packages/common/src/types/character.ts`, `participation.ts`              | Current requirements baseline                           |
| Items and equipment          | `packages/common/src/types/items.ts`, `apps/web/src/Items.tsx`            | AI domain guide                                         |
| Environmental objects        | `packages/common/src/types/world.ts`, campaign object placements          | Project-state gap analysis                              |
| Sessions/game state          | `packages/common/src/types/world.ts`, `packages/common/src/types/game.ts` | Project-state gap analysis                              |
| Combat next state            | Current legacy types in `packages/common/src/types/combat.ts`             | `docs/combat-system-requirements.md`                    |
| Rules and science contract   | `packages/common/src/types`, science migration code                       | AI domain guide and science refactor                    |
| Domain/API behavior          | `apps/api/src/domain`, `apps/api/src/ai`                                  | README and project-state gap analysis                   |
| Graph projection             | `apps/api/src/graph`, domain write paths                                  | Graph reliability design and project-state gap analysis |
| Media                        | `apps/api/src/media`, web media helpers                                   | README and project-state gap analysis                   |
| Migration and transfer       | `apps/api/src/domain/*migration*`, `apps/api/src/transfer`                | README and project-state gap analysis                   |

## Governance for future edits

- Change this document when a product requirement, scope boundary, or open decision changes.
- Update affected source types and the AI-facing domain guide together when domain semantics change.
- Link detailed technical designs from the relevant requirement IDs instead of duplicating them here.
- Keep implementation status and release blockers in the project-state document; keep the intended
  product behavior here.
- When an open decision is resolved, replace it with one or more stable requirements and record the
  superseded alternative explicitly rather than silently deleting the decision context.
