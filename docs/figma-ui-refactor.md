---
name: figma-ui-refactor
status: active
date: 2026-10-11
scope: World authoring UI, local sign-in, and retained-feature placement proposals
---

# Figma-led World authoring

The [Age of Wonders Figma document](https://www.figma.com/design/zRxEmjYZ0tuKOG9xj60Gtm/Age-of-Wonders?node-id=4-1667)
is the authoritative visual and visible-navigation source for this refactor. It supersedes the
previous application's UI as a design reference for these surfaces. It does not replace the
TypeScript domain contract, ownership boundaries, capture semantics, or runtime architecture.
See [the documentation authority index](README.md) and
[the canonical architecture](information-architecture-domain-model-realignment.md).

The user approved deriving responsive mobile layouts from the desktop designs; completing Rule
system, People & access, Export world, world switching, and Add rule with the supplied patterns;
account-name/password sign-in; and World-owned NPC templates, Conditions, and Effects. The user
also required features absent from the design to leave the new view while retaining their code.
The placement suggestions below are proposals, not additional accepted requirements.

## Delivered surfaces

- Account-name/password login and account credential management, with existing identity integration
  retained for migration and compatibility.
- World selection and creation; World overview and metadata editing; a compact mobile navigation
  drawer using the same responsive components as desktop.
- Atlas cards and search; Location detail, creation, editing, and guarded deletion; hierarchy,
  public descriptions, GM notes, discoveries, connected Locations, and granted Conditions.
- Location map type selection, image upload/library selection, generation previews for saved and
  unsaved Locations, and a display grid for overhead maps. Generating an unsaved Location's map
  does not create the Location; saving its form attaches the chosen image.
- Codex libraries for Items, Creatures, Characters, Conditions, Effects, and Rules. Item and
  Creature editors preserve unexposed source fields while exposing the designed descriptions,
  artwork, statistics, equipment pool, and Condition grants. New Items can omit artwork.
- World-authored NPC templates, reusable Conditions referencing Effects, reusable Effects with
  numeric modifiers and durations, and structured World rule editing.
- Supporting screens for Rule system name and adopted-model summaries, World access management,
  World export, and account credentials.

Attribute and Skill modifiers use the confirmed formula: subtract 50, divide by 10, and round to
nearest integer with halfway values away from zero. Thus 55 gives +1, 45 gives −1, 33 gives −2,
and 83 gives +3. These displayed automatic modifiers do not introduce automatic gameplay
application of Conditions, Effects, or duration countdowns.

## Domain boundaries

Codex Characters are World-owned NPC templates. They are separate from playable Characters and
Character histories owned by a Campaign Instance. A template selects a World Creature; its
editable statistics belong to that template. Choosing or editing a World NPC does not create a
playable Character or silently change an existing campaign capture.

Conditions and Effects are World authoring resources. A Condition references reusable Effects;
per-modifier overrides are accepted only when the referenced Effect permits them. Grants on
Locations, Items, Creatures, and World NPC templates reference Conditions rather than duplicating
those definitions. Deletion rejects references that would become dangling.

Location `connectedLocationIds` are authored same-World links, including links across hierarchy
levels. They are not automatically equivalent to strategic traversal edges or encounter
transitions. Existing runtime graph constraints remain in force.

Exact fields, resource mappings, and validation are owned by `packages/common/src/types`,
`apps/api/src/domain/domain-resource.ts`, and the implementation. The synchronized AI-facing guide
is `apps/api/src/ai/prompts/domain-model.md`.

## Features excluded from the new view and proposed destinations

“Excluded” describes the new Figma-led World workspace and its navigation. Existing implementations
and domain data are retained; it does not mean the underlying capability or every legacy route
was deleted. Proposed destinations require follow-up design before being exposed.

| Excluded feature or control                                                                                                              | Proposed place in the new design                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign Definition authoring, recursive Plots, and captured-World migration controls                                                    | A separate Campaigns workspace reached through the workspace switcher; retain the World overview as authoring context.                     |
| Campaign Instance preparation, roster, playable Characters, Agents, progression, and restore                                             | A campaign-specific Play workspace, separate from Codex Characters.                                                                        |
| Session planning, lobby, runtime GM table, movement review, event history, and summaries                                                 | A focused Session workspace launched from Play.                                                                                            |
| Global Player directory, invitations, Character submission/review, and account linking administration                                    | A People workspace; keep World-specific roles in the existing People & access screen.                                                      |
| Quick Start guide, progress checklist, and supporting instructional panels                                                               | An optional Help/Get started drawer; avoid another persistent mobile bar.                                                                  |
| World publication, revision history, captures, restore, archive/fork, and downstream impact comparison                                   | A World actions menu with a dedicated Versions screen. Export remains in the new navigation.                                               |
| Full editable model registries, adoption/revision controls, schema structure editing, and governed Skill/Profession/Background libraries | Advanced sections under Rule system, using dedicated editor screens. Current Rule system summaries are not replacements for these editors. |
| Location kind, profile, tags, map scene notes, and advanced connection mechanics                                                         | An Advanced section in Location editing and a connection-details drawer.                                                                   |
| World/map placement tools and Location Creature/Item placement tabs                                                                      | A contents drawer on Location detail and contextual placement actions on the map.                                                          |
| Terrain, isometric geometry/material tools, walls, doors, windows, lighting, and encounter-map authoring                                 | A focused Map editor launched from the Location map, with task status and Cancel replacing mobile navigation during placement.             |
| Creature embodiment/governance policy, profession/skill-definition associations, art-direction notes, and richer equipment-slot controls | An Advanced section in the Creature editor; keep routine statistics in the designed form.                                                  |
| Item quality, equipment compatibility, and richer item mechanics outside the supplied form                                               | An Advanced section in the Item editor and reusable mechanics under Rule system.                                                           |
| AI text-proposal workflows for Locations, Creatures, and Items                                                                           | Optional Generate draft actions in the relevant editor; keep review/apply explicit. Image generation is already exposed.                   |
| Hosted Setup, installation settings, operator diagnostics, AI/provider configuration, and credential operations                          | A separate administrator Settings destination accessed from the account menu.                                                              |

## Verification scope

The refactor adds modifier boundary tests and backend tests for new authoring/authentication
contracts. Build, typechecking, browser checks, and their final results belong to the change's
verification report. This document records accepted structure and implemented surfaces; it is not
an assertion that every preserved legacy feature or every possible live backend configuration was
exercised during UI verification.

### Verification results — 2026-10-11

- Web production build, web/API TypeScript checks, targeted lint, and UI primitive checks passed.
- Web suite: 320 tests passed. API suite: 623 tests passed, 34 database-dependent tests skipped;
  three additional focused access-control tests passed.
- Browser verification passed at desktop and 390 px mobile widths: Login/Overview rendering,
  Effect/Condition/Creature/NPC/Location creation, NPC updates and deletion, mobile drawer
  navigation, and a downloaded export containing the authored NPC. The final run had no browser
  console errors. Disposable verification Worlds were archived afterward.
- A large existing World exposed an SSR payload problem. Historical snapshot manifests are now
  fetched on demand for export rather than included in every authoring page's hydration payload.
- The AI-facing domain model guide was updated and compared with the new TypeScript resources,
  modifier durations, Condition references, Location connections, and collaboration metadata.
