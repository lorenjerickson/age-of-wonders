---
name: isometric-maps-design
description: proposed spatial map model, GM authoring and actor-centered play, with phased delivery
status: active
---

# Isometric maps: design and implementation plan

This accepted design covers the requested isometric map capability. Implementation has begun with
the shared terrain foundation described below. The remaining design is target behavior, not proof
of implementation. `packages/common/src/types` remains the authority for exact implemented
contracts; the AI-facing guide distinguishes working terrain values from supported Location payloads.

## Map orientation workflow

Isometric is one of the Location Map orientations, alongside Scenic, Overhead, and Side-on.
The single Map orientation selector controls the authoring workspace. Selecting Isometric opens
an empty grid immediately, with manual placement and optional terrain-generation controls. No
separate Location option or generation step is required to create or save a blank isometric map.
Image orientations show image picking/upload/generation instead. Switching orientation protects
unsaved edits; saving the new orientation updates the selected map representation.

`mapScene.orientation` records the selected orientation. The `map.kind` discriminant remains an
internal storage distinction for image references versus sparse terrain manifests, not a second
GM-facing choice. Older terrain maps without orientation metadata reopen as Isometric. Existing
image assets remain preserved as image metadata when authoring terrain; image orientation metadata
continues to describe those assets, not the active volumetric map.

## Implementation status

The first slice implements `types/isometric-terrain.ts` and `spatial/terrain-*.ts` in the common
package: sparse 16³ chunks inside 100³ bounds, fixed five-foot cells, palette references, validated
shapes and opening states, shape meshes/support/ray queries, arbitrary selection edits with inverse
and redo patches, and seeded weighted terrain generation with region/mask boundaries. Common tests
cover edge addresses, stacked levels, openings, invalid atomic batches, generation reproducibility,
and generation/removal of a full million-cell volume.

The next slice adds `WorldLocationDefinition.map`, a Location-owned image/isometric discriminant,
and a Three.js authoring viewport on the existing Location Map page. The editor supports an always
focused preview actor, continuous orbit and zoom, XY work-level placement/erasure, a wireframe
rectangle cursor, highlighted arbitrary selections, cross-level box selection, material changes,
removal, undo/redo, and worker-based generation with preview/apply/cancel. GPU startup is client-only
and has a recoverable failure state. The built-in revision-one palette now uses locally bundled PBR textures as described below.

Terrain uploads are staged by draft and canonical content hash. Save Map verifies all referenced
chunks, then atomically advances the draft and writes a retry receipt. Location metadata contains
an immutable chunk manifest; `location-terrain-chunks` components carry the exact content in World
snapshots. Draft responses omit the chunk buffers, and generic saves preserve them server-side.
Normal Location edits preserve its map. Published captures are self-contained, and forks preserve
content hashes while remapping Location identities. Full terrain/chunk reads are GM-owned authoring
endpoints, not participant endpoints. New `WorldTerrainUpload` and `WorldTerrainSave` tables require
the checked-in `20260917000000_isometric_terrain_drafts` migration.

This remains an authoring slice, not completion of phases 0–2 or playable isometric Sessions.
The opening authoring slice adds selection-based door/window conversion, initial state, facing, and
frame thickness controls. It preserves opening identity through edits, supports removal/undo, and
rejects incompatible sloped/smoothed selections atomically. Procedural frames remain open; closed
doors have panels/handles, locked doors have crossbars, and closed windows have glass. Aperture
clearance is shown in feet. This presentation does not implement runtime passage or transmission.

XY/XZ/YZ work planes now drive the grid, ray picking, rectangular strokes, cube cursor,
and slicing along the plane's fixed axis. Changing plane or level cancels an active stroke.
Selection smoothing supports none/light/medium/full strengths with atomic validation and undo.
The current renderer uses normal-only smoothing: shared area-weighted normals across chunk/material
boundaries, blended by per-cell strength. No vertex moves, so support surfaces and gaps remain exact;
openings are excluded. Edge rounding remains deferred until visual displacement budgets are proven.

The built-in revision-one materials now resolve to local 1K/2K color, OpenGL normal, and roughness
WebP maps for grass, dirt, sand, rock, wood, and stone. Poly Haven CC0 provenance, physical sizes,
source checksums, and delivery checksums live in `apps/web/public/terrain/v1/sources.json`.
All faces use the same set with world-aligned dominant-axis UV projection; ramps remain within
that projection (triplanar seam blending remains deferred). Water uses periodic analytic ripple
normals and transparent shading; this is not a fluid simulation. Normal/roughness data remain linear,
color is sRGB, and filtering uses mipmaps and capped anisotropy. The viewer offers 1K Balanced,
2K High, and Untextured modes; this device preference does not change persisted terrain.
Only used materials load; mesh rebuilds reuse textures, quality switches/unmount release them,
and missing assets/revisions remain neutral with a status and retry control. The current revision
must retain these files; changed art must use a new material revision. Custom uploaded materials
and a persisted media-asset contract remain pending. WebP compresses delivery but is decoded on GPU:
all six sets use roughly 96 MiB at 1K or 384 MiB at 2K including mipmaps, before other GPU allocations.
KTX2/Basis GPU compression and formal device budgets remain future work. Run `smoke:materials`
for the seven-material gallery, both quality levels, and missing-asset recovery.

The first gameplay foundation adds an optional Instance Creature `terrainPosition`, GM setup
controls on Instance Placements, and support validation against immutable captured terrain. The
existing runtime revision/audit transaction blocks setup edits during active Sessions. A Player
Session binding endpoint resolves only the membership's active Character embodiment and exposes
its name/feet position. It deliberately returns `awaiting-visibility` without any terrain or other
actors: the authoritative rule/visibility runtime is not yet implemented. The participant page
shows that readiness state, not the GM authoring viewport. This does not complete gameplay phases.

The visibility foundation now shares canonical opening frames, panels, and glass between rendering
and server geometry. `createTerrainSightIndex` traces finite 3D segments through sparse occupied
cells, reports ordered surface contacts and starting-volume interiors, and handles slopes, stacked
levels, and conservative edge/corner grazing. Its owned snapshot prevents subsequent source edits
from changing query results; generated surface geometry is immutable with a bounded cache. These
are geometry facts, not visibility decisions: glass/water transmission, senses, lighting, range,
and target sampling still require captured rules.

The internal API `projectAuthorizedTerrain` accepts a server-evaluated decision tied to the exact
snapshot, runtime revision, Location, and observer. It emits only approved triangles, approved actor
fields, and used material references; raw cells, unseen faces, opening metadata, and GM labels are
excluded. Missing/stale decisions or invalid grants return `awaiting-visibility`. It is not exposed
as an endpoint and accepts no client grants. No rules evaluator or live participant map is wired yet,
so the participant endpoint continues to return binding/readiness only. Every future visibility-
affecting mutation must advance the revision before this projection can be integrated.

The exploration-memory slice adds a version-one JSON snapshot contract and a pure atomic update.
Memory is isolated by Campaign Instance, captured snapshot, Location, and observer; revisions cannot
move backward or accept conflicting observations at the same revision. Each remembered triangle
retains its last-seen material revision and geometry. Unseen live terrain is never consulted to
refresh memory, and creatures are never remembered. Explicitly authorized observations of absent
surfaces remove stale geometry; merely losing sight does not. Separate roof/underside triangles
remain separate discoveries. The internal API composition returns current actors/current surfaces
and remembered surfaces separately, keeping its next exploration snapshot outside the player payload.

Serialization validation and projection composition now have transactional PostgreSQL storage as
described below. Live Session delivery and participant request DTOs remain pending. Future Session
integration must revalidate caller authority. Checkpoint recovery is described below. Snapshot adoption
requires separate memory; cross-snapshot copying is not automatic. The temporary 100,000-surface
budget rejects an entire update at capacity rather than silently forgetting explored areas; paged
storage and a larger-map budget are needed before production rollout. Missing decisions still return
`awaiting-visibility` with no remembered payload. Rules evaluation remains the next runtime dependency.

`CampaignTerrainExploration` now stores the latest validated JSON snapshot for each Instance,
captured Instance snapshot, Location, and observer. The additive migration
`20260918000000_terrain_exploration` enforces same-Instance snapshot ownership, positive revisions,
content-hash shape, and agreement between JSON context and row columns. There is no discovery backfill.
`TerrainExplorationStore.projectAndStore` accepts only an internal evaluated decision, locks the
Instance runtime row, verifies the current adopted snapshot/revision, and resolves terrain and actors
from database captures/runtime. It loads, checks, merges, and writes memory in one transaction before
returning the redacted projection. Exact retries do not rewrite timestamps; conflicting same-revision
observations, stale runtime, invalid grants, and corrupt memory do not write or return partial data.
Exploration is derived state and does not advance gameplay runtime revision.

Existing Session transitions retain memory while the Instance snapshot stays the same. Migration
and restore create a new Instance snapshot: historical exploration rows are retained and stale-scope
requests are rejected. Migration starts empty; restore recovers the predecessor departure checkpoint
as described below. The current table is not an exploration event journal. Cross-capture remapping
is not inferred. This service has no public
controller and does not authorize a participant or evaluate visibility rules. The live participant
endpoint therefore remains readiness-only. PostgreSQL tests cover reconnects, write-free retries,
competing observations, runtime lock races, constraints, rollback, and snapshot isolation.

Checkpoint-specific recovery is now implemented by `20260919000000_exploration_checkpoints`.
Each new runtime checkpoint records `explorationHash` and `explorationCount` at insertion; immutable
`CampaignCheckpointExploration` rows store each observer/map payload and hash. A new Instance has
a recorded empty capture. Migration and restore capture both source and result exploration in the
same transaction as runtime, snapshot, and audit changes. No checkpoint is updated after insertion.
Before the transaction's first SERIALIZABLE read, migration takes the existing Session SHARE lock
and a Runtime EXCLUSIVE table lock. The latter waits for in-flight exploration writers before the
snapshot is established, so a just-committed observation is included. This short global lock also
blocks unrelated Instance runtime writes during snapshot adoption; transactions have a 30-second
limit and fail atomically rather than accept incomplete captures.

The existing direct-predecessor Restore action resolves its exact departure checkpoint through the
current snapshot's migration audit. Its preview identifies the checkpoint number and whether any
exploration was recorded; checkpoint identity/hash/count bind the plan hash. Recovery validates the
aggregate and each payload hash, Instance/snapshot ownership, revision bounds, and identical captured
World/Campaign versions. It copies only checkpoint memory into the new snapshot, retaining historical
material versions and last-seen geometry. Current sight is cleared; the memory context is rebased to
one revision before the new runtime so a fresh observation can be accepted at the restored revision.
Current actor/runtime overlays continue through the existing restore semantics; exploration does
not reintroduce removed actors or authorize player access.

Legacy checkpoints keep null exploration metadata. They cannot be backfilled from later knowledge:
the restore preview explains that remembered terrain will start empty. Missing or corrupt recorded
entries block recovery, and a late failure rolls back recovered memory, runtime, checkpoints, and
audits together. The result checkpoint captures recovered memory for subsequent restores. Rules
execution and current visibility evaluation remain deferred; no rule defaults are introduced.

Pending work includes configurable generation controls/provenance, scalable asynchronous meshing,
formal GPU budgets, source spatial placements, gameplay actor focus, movement, and authoritative visibility.
The preview actor is an editor proxy; it does not move any authored creature. Source image metadata
remains independent and unchanged by terrain saves.

Generator version 1 uses coherent multiscale noise and weighted elevation distributions. It fills
solid ground with a single supported surface block and closed contour cliffs where heights cross
block levels. It does not yet perform neighborhood relaxation or a visual realism acceptance pass.
Shape rotations are baked into corner heights/diagonals; opening orientation remains explicit.
These details supersede the corresponding proposed representations for the implemented contracts.
The remaining sections retain target requirements where they go beyond this initial authoring slice.

## 1. Outcome and scope

Add a volumetric, textured terrain map to a Location, with an orthographic camera that always
orbits a selected actor. Support stacked floors, bridges, caves, sloped blocks, doors, windows,
actor-relative visibility, weighted random terrain generation, and bulk terrain authoring. Existing scenic, overhead, and side-on maps
continue to work. Isometric maps are constructed geometry, not an image orientation trick.

The initial token presentation is upright paperdoll artwork facing the camera. Animated skeletal
creatures, destructible physics, fluid simulation, procedural generation of whole Worlds and their
content, and arbitrary mesh sculpting are outside this delivery. Bounded random terrain generation
inside a Location map, static water cells, door/window state changes, selection-wide terrain type
changes/removal, and optional terrain smoothing are included.

### Confirmed physical size

The requirement “50 cubic feet (100 cells in each direction)” contains incompatible dimensions
unless extremely small cells are intended. The user clarified that the intended scale is
**5-foot cells, with a maximum of 500 feet per side**. The hard structural limit is **100 × 100 × 100 cells**,
or 1,000,000 addressable cells. Occupancy is sparse and may be empty in any portion of that volume.

| Interpretation                     | Cell edge                  | Maximum bounding volume                       |
| ---------------------------------- | -------------------------- | --------------------------------------------- |
| 50 feet on each side               | 0.5 feet                   | 125,000 cubic feet                            |
| Conventional 5-foot tactical cells | 5 feet                     | 125,000,000 cubic feet; 500 feet on each side |
| Literally 50 cubic feet total      | approximately 0.03684 feet | 50 cubic feet                                 |

**Accepted scale:** each cell edge is 5 feet, with a maximum bounding volume of 125,000,000 cubic
feet. The other interpretations above are retained only to explain the clarification. Persist the
cell edge as an explicit distance, validated as 5 feet for this release;
never infer feet from camera zoom or pixel size. Terrain cells and tactical movement distances are
separate concepts: a creature can occupy multiple cells. Changing physical scale is an explicit
map revision and downstream migration, not a display preference.

## 2. Repository baseline and architectural fit

The following are source-verified integration points, not claims that isometric support exists:

| Area                | Current implementation                                                                                                                       | Required change                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Location geometry   | `locations.ts`: runtime Location image and normalized 2D geometry; `world-authoring.ts`: canonical source Location image is already optional | Add an explicit spatial-map branch with 3D geometry and destinations                   |
| World map editing   | `apps/web/src/WorldMapPage.tsx`, `worldMapModel.ts`: image/media editing and map-scene notes                                                 | Add terrain authoring inside the existing Location Map workspace                       |
| Placement intent    | `packages/common/src/types/placements.ts`: World/Campaign placement `mapPosition` is normalized 2D                                           | Introduce discriminated spatial positions without reinterpreting existing coordinates  |
| Canvas presentation | `packages/common/src/types/campaign.ts`: layer controls, normalized lights/sounds/annotations, pixel-based measurement                       | Add spatial presentation data and world-unit measurement; retain existing 2D behavior  |
| Play state          | `packages/common/src/types/campaign-instance.ts`: Instance-native creature state and placement realizations                                  | Add durable spatial actor positions and map interaction overlays to Instance runtime   |
| Canvas rendering    | `apps/web/src/SessionCanvasHarness.tsx`: SVG layers, token selection, pan/zoom, selected-token visibility                                    | Extract a renderer boundary; implement a separate spatial renderer and mandatory focus |
| Visibility          | `apps/web/src/mapGeometry.ts`: planar ray intersections and visibility polygon                                                               | Add authoritative 3D geometry queries and participant-safe visibility projection       |
| Player entry        | `apps/web/src/CampaignSessionParticipantPage.tsx`: participation and event surface                                                           | Integrate the authorized gameplay map and actor binding                                |
| Rules               | Active rules design requires event-triggered effects; README records runtime as pending                                                      | Deliver map mechanics through the rules runtime, with explicit dependencies            |

Source maps, terrain, initial openings, and source presentation belong to the **World Location**.
Campaign Definitions capture that World and own placement intent/preparation overlays. Campaign
Instances capture those definitions and own actor positions, changed opening states, exploration,
and any later rule-produced terrain changes. Sessions own participation, decisions, and event
history; ending a Session does not reset terrain or exploration. Camera preferences belong to the
viewing user and do not mutate a World or move an actor.

Reuse the World → Atlas → Location → Map navigation. Campaign preparation places actors against
captured terrain; it cannot silently edit that terrain. Geometry authoring occurs in a World draft.
Runtime terrain modification, if introduced later, must be an Instance overlay produced by effects.
No new standalone scene aggregate may become a competing map owner.

## 3. Mandatory actor focus and camera behavior

### Selection invariants

Every mounted interactive isometric viewport has exactly one valid `focusActor`. Inspector
selection is separate: inspecting a cell, door, note, or creature never clears camera focus.
Clicking empty space and pressing Escape clear tools/inspection only.

| Context         | Initial focus                                                                             | Subsequent selection                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GM gameplay     | Uniform random choice among placed actors on the current map, once per fresh map opening  | GM may select another actor on that map                                                 |
| Player gameplay | Server-resolved runtime actor bound to that player's active Character                     | Cannot select another actor, even if another actor is visible or otherwise controllable |
| World authoring | Random placed actor when available; otherwise a clearly labeled temporary “Preview actor” | GM may select a placed actor or reposition the preview actor                            |

The preview actor is an editor-only actor proxy, with a position and eye height. It is not a
published creature, placement, or gameplay entity. It allows a completely empty map to be authored
without adding unwanted World content. Its existence is an explicit interpretation of the
always-selected requirement for authoring.

Gameplay does not invent an actor when none is available. Resolve actor binding and map membership
before mounting the viewport. Show a named readiness state such as “Place an actor to open this
map” or “Waiting for your character to enter this location.” Spectators without a bound actor get
this non-map surface in the first release. Do not briefly render an unfocused or unrestricted map.

A GM's random choice occurs once at map entry, not on React renders, incremental updates, or
reconnection within the mounted view. Preserve the chosen actor while valid. When removed or moved
to another map, atomically select a random remaining actor or unmount to readiness. A player follows
their actor through a map transition; they never fall back to another actor. A dead or incapacitated
actor can remain focused while still placed; rules determine its senses. Revocation of the binding
immediately removes the map projection and clears cached private data.

### Camera

Use orthographic projection, initially at 45° azimuth and approximately 35.264° elevation: the
canonical isometric view. Free orbit changes azimuth continuously through 360° and allows elevation
within a proposed 10°–80° range. This makes the broader experience an orbitable orthographic view;
only the reset angle is mathematically isometric. A Reset View control restores that angle.

The orbit target is a stable anchor at the selected actor's body center, derived from its foot
position and declared height. It stays at the center of the actual viewport, excluding inspectors.
Actor movement updates camera and actor using the same interpolation so they remain aligned.
Orbit and zoom change only camera offset/projection size; there is no independent pan. Resizing,
opening an inspector, keyboard orbit, and zooming must retain this invariant. Clamp zoom and clipping
planes for the map bounds without moving the target. Terrain may pass between camera and actor;
handle that through visual occlusion treatment rather than moving the focus off-center.

Use right-button drag to orbit in both authoring and play. Wheel/pinch zooms toward the actor,
not the pointer. Provide keyboard orbit, zoom, and reset controls, plus a touch orbit mode. Suppress
the context menu only inside the viewport and distinguish a drag from a right click.

### Gameplay interaction

The selected actor has a name, portrait, and ground/foot marker. A GM can focus another actor by
clicking its billboard or choosing its name in an actor list; changing focus changes the actor
whose vision is being shown. Players may inspect or target visible creatures through a separate
interaction mode, but this never changes focus, camera target, or sight authority.

Clicking a reachable surface proposes movement with a 3D route and physical distance. Where surfaces
overlap on screen, highlight the exact hit surface and show a readable level/elevation label;
provide a cycle-surface control. Movement is not committed by client raycasting. Keyboard movement
also submits an action for the focused actor. Doors/windows offer named interaction controls whose
availability comes from authoritative rules and permissions. Locked state is shown only if known.

GM play defaults to the selected actor's vision. An explicit, visibly labeled GM overview toggle
may show GM-authorized hidden content while preserving actor focus. “Preview as actor” uses the
same filtered projection as a player. Neither mode changes what players receive.

## 4. Spatial domain proposal

### Map representation and coordinates

Introduce an explicit `LocationMap` discriminated representation: an image-map branch containing
current image/wall/transition data, and an `isometric` branch containing a versioned spatial map.
Retain a Location illustration independently so an isometric map never needs a fake background
image. `WorldLocationDefinition.image` is already optional; preserve that behavior. Final map field
names and compatibility for the older required-image `LocationState` are phase 1 work.

A spatial map contains format version, dimensions (each integer 1–100), positive finite cell-edge
distance, material palette, sparse terrain chunks, and spatial transitions. An absent cell means
air; water must be explicitly occupied terrain. The bounding box does not imply a solid floor,
filled ground, or automatically generated perimeter walls.

Use right-handed map-local coordinates: X/Y horizontal, Z up. Cell address `(x,y,z)` is integer,
zero-based, with each component less than its corresponding dimension. A cell occupies its unit
box before deformation. World positions use continuous grid units with an explicit spatial
coordinate discriminant and map association. Surface points may reach the outer boundary at 100;
cell indices may not. Validate complete actor bounds, not just the foot point.

Persist feet/anchor position, footprint, body height, and eye offset for each runtime actor through
the existing Instance ownership model. Do not reuse artwork scale as collision size. Distinguish
standing support from the actor's body occupancy; positions above bridges and below them remain
different even when X/Y match. Flying/swimming positions need not have ground support if rules
permit them. Placement intent, transitions, lights, sounds, notes, templates, and measurements need
explicit spatial variants. Reject mixed coordinate kinds rather than interpreting normalized XY
as grid units. Conversion of an existing 2D map is an explicit GM-authored operation, not inferred
elevation or automatic voxelization of its image.

### Sparse storage

Use proposed 16³-cell chunks with palette-indexed occupancy and compact shape data. A 100-cell edge
has a partial final chunk; padding outside the map is never addressable. Omit empty chunks. Index
chunks by location/map revision plus integer chunk coordinate, and cells by local offset. These
storage keys remain internal. A cell's address is not a globally durable opening identity.

A Location-owned manifest references immutable chunk content; draft edits produce new chunks and
update the manifest atomically. Downstream captures reference exact content and assets, not mutable
URLs or the latest draft. Store runtime opening changes in a sparse Instance overlay keyed by stable
opening identity and captured map identity. Persist exploration separately per authorized observer;
never store it in authored terrain. Coordinate replacement must not inherit an old door's state.

If chunk storage needs new tables or resource mappings, add migrations, snapshot/export support,
reference validation, retention, and authorized retrieval together. The current `locations`
resource mapping in `apps/api/src/domain/domain-resource.ts` remains the aggregate entry point.
Large geometry must not be embedded repeatedly into generic retrieval text or AI prompt context.

### Cell shape

A cell has a terrain/material reference, shape, optional smoothing strength, and optional opening.
Represent the four upper vertices as normalized local vectors, with X/Y pinned to their unit-square
corners and Z in `[0,1]`. Bottom vertices stay on Z=0. This interprets “unit vectors” as coordinates
within the unit cube, not mathematical unit-length direction vectors. Constrain deformation to
avoid overhangs, crossing faces, and unpredictable collision; overlapping levels come from separate
cells with air between them.

Store the upper heights in counterclockwise order `h00, h10, h11, h01`, plus an explicit top diagonal
and quarter-turn orientation. Triangulation is part of the domain geometry, not a renderer choice.

| Preset | Heights before rotation | Top diagonal / meaning                                   |
| ------ | ----------------------- | -------------------------------------------------------- |
| Cube   | `[1,1,1,1]`             | Either canonical diagonal; flat top                      |
| Ramp   | `[0,1,1,0]`             | Canonical diagonal; rises along X                        |
| Ridge  | `[1,0,1,0]`             | High diagonal `00–11`; two surfaces descend from crest   |
| Valley | `[1,0,1,0]`             | Low diagonal `10–01`; two surfaces descend toward trough |

Ridge/valley presets are diagonal creases made with four upper corners. Rotate to change direction.
A ridge along the midpoint of opposing edges would require additional vertices; it is not implied
by this four-corner format. Permit quantized corner adjustments, proposed in sixteenths of a cell,
within the same valid format. Omit zero-area faces at collapsed corners; reject fully zero-volume
cells (use erase instead). The same triangle construction feeds rendering, collision, picking,
support, and sight queries.

Any cell with a non-horizontal traversable surface is classified as **difficult terrain**. This
fact is derived from the shape and exposed to the rules engine; users cannot uncheck it to bypass
the requirement. Movement cost, entry permissions, climbing, falling, and exemptions are captured
rules. A rule-free World remains inert, consistent with the active rules architecture.

### Terrain and materials

Ship named presets for water, sand, dirt, grass, rock, wood, and stone wall, with an extensible
namespaced terrain vocabulary. Terrain describes semantic facts; the material describes surface
appearance. Rules interpret facts such as water, slope, solidity, and opening state. Sight, movement,
sound, and environmental transmission remain separate channels rather than one opaque/solid flag.

Each cell uses one material set on all faces, including slopes and undersides. Grass does not
silently use a separate dirt side texture. Use physically based albedo, normal, roughness, and
optional ambient-occlusion maps, with consistent physical texel density and edge-safe repetition.
Propose seamless 2K source assets with compressed mipmapped delivery, adjustable device quality,
and modest deterministic variation per cell. Water uses the same water material around its cell,
with surface shading and transparency; it is not a fluid simulation.

Pin material versions and media provenance in the captured map. Missing assets render a neutral
material and human-readable status. A visual acceptance scene must demonstrate convincing stone,
wood grain, soil, and grass at normal play zoom; resolution alone does not establish quality.
World-space/triplanar mapping is a candidate for slopes and smoothing, evaluated in the render spike.
Material shading must not change gameplay geometry or line of sight.

### Doors and windows

An opening is a tagged cell variant, initially restricted to a cube shape with no smoothing. Store
stable identity, kind, orientation/facing, aperture dimensions, frame thickness, material, and authored
initial state. Use procedural frame/panel geometry so a door or window is recognizable, not merely
a textured full cube. All frame/panel faces use the cell's material set; a window can additionally
use a glass rendering treatment as an explicit aperture component.

Door state is exactly `open | closed | locked`; locked implies closed. Window state is
`open | closed`. Opening a locked door requires a rule-produced unlock/state effect. Locking an
open door cannot silently create an invalid combination; the rule must close and lock it through
valid transitions. Frames remain in all states. State changes update the effective aperture geometry
and per-channel facts atomically. The initial door-open presentation may retract the panel into
its frame, avoiding a swing volume that extends beyond the cell. Animation is visual only.

A closed glazed window can transmit sight while obstructing movement; an open window exposes an
aperture whose size still matters. Actual passage, sound transmission, and interaction distance are
rule decisions over these geometry facts. An open door is not equivalent to removing its frame.
Multi-cell doors/windows can be deferred. Validate frame and aperture dimensions in phase 0:
a 5-foot cell provides less than 5 feet of clearance once its frame is included. Rules must account
for actual creature dimensions. Grouped openings become required before play release if the intended
actor sizes cannot pass through the single-cell aperture.

### Smoothing

Persist a strength in `[0,1]`, with 0 meaning exact block geometry. The first implementation uses
bounded edge rounding and normal blending on exposed terrain faces. Clamp visual displacement
within the cell and to a proposed maximum of 0.1 cell; never bridge air gaps, close an aperture,
merge stacked levels, or move structural corners/support surfaces. Compute a shared boundary rule
with neighbor data, including across chunks, to avoid cracks.

Gameplay uses the canonical unsmoothed triangles, with surface/foot markers showing that support
where needed. This is an explicit visual-only smoothing contract: it cannot erase slope difficulty
or alter visibility. If playtesting finds the discrepancy misleading, reduce displacement or use
normal-only smoothing. More extensive geometry-changing sculpting would require a later versioned
shape contract shared by every geometry subsystem.

## 5. GM authoring experience

The Map page offers map representation, terrain palette, shape/rotation, smoothing, opening
settings, work plane/elevation, cell selection, Generate Terrain, undo/redo, save status, and
“Preview as actor.” Human labels, images,
physical measurements, and coordinates may be displayed; opaque storage/definition IDs may not.

Start a new map with bounds and cell size, a selected preview actor, and an empty work grid. Default
work plane is XY at Z=0. A compact elevation control moves it by whole cells; XZ and YZ planes make
walls easy to author. A plane is always one cell thick. An elevation list can name useful levels
(e.g. “Ground,” “Bridge,” “Gallery”), but names do not replace continuous Z geometry.

The wireframe cube cursor snaps to the candidate address and remains readable against terrain.
Show the selected shape inside its unit-box outline, terrain swatch, and a text reason when invalid.
Raycast to the explicit work plane or use an “Adjacent face” placement mode. This choice prevents
unpredictable jumps onto roofs when building under them. A temporary authoring slice hides geometry
above the work level, with a visible slice indicator; it does not delete cells or affect play fog.

| Input/tool                   | Result                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Left click, Place            | Place one cell at the cursor                                                                       |
| Left drag, Plane             | Preview an inclusive rectangular area of the selected terrain on the chosen plane; release commits |
| Right drag                   | Pivot around the selected actor; never place terrain                                               |
| Wheel / zoom controls        | Zoom around that actor                                                                             |
| Escape during a stroke       | Cancel the entire preview                                                                          |
| Erase tool + left click/drag | Preview removal using the same plane semantics                                                     |
| Inspect tool + left click    | Inspect cell/actor without clearing focus                                                          |
| Undo / Redo                  | Reverse/reapply the whole committed stroke, including overwritten content                          |

Dragging from `(2,3,4)` to `(5,7,4)` on XY previews 20 cells, not an extruded box. Capture pointer and
plane at stroke start; keep those stable while dragging. Show affected count and bounds errors.
Default Place fills empty cells; occupied cells are skipped with a preview count. Explicit Replace
includes occupied cells and previews opening removal as well. Apply a single material and current
shape settings consistently across the stroke. Do not silently clip out-of-bounds operations:
mark the stroke invalid until corrected. Pointer cancellation/window blur cancels an uncommitted
stroke, and returning from orbit cannot accidentally complete a paint stroke.

The inspector exposes corner heights for advanced shape editing, preset rotation, smoothing, and
opening state. Bulk edits work on a visible selection with one undo transaction. Door/window tools
show orientation and a preview of the opening. Authoring edits initial state; gameplay controls
edit only Instance state through rules.

### Arbitrary cell selections and bulk edits

Provide a dedicated Select Cells tool with single-cell picking, plane rectangle, and 3D box
selection, plus additive and subtractive selection. These compose arbitrary, disconnected sets
across materials, chunks, and elevations. Selection is an explicit set of cell addresses, not all
cells sharing an X/Y coordinate or material. Provide Select All occupied cells and Clear Selection;
clearing this selection never clears the focus actor.

Default picking selects the visible hit cell on the active slice. A clearly labeled Through Volume
mode selects occupied cells within an explicit 3D box, including occluded cells. Show selected count,
level range, and outlines/slice previews so a GM can verify the extent before applying an edit.
Support keyboard selection and accessible counts. Selection tools do not change the Place tool's
left-click behavior or the global right-drag orbit gesture.

The selection inspector provides **Change Terrain Type** and **Remove Cells** for every nonempty
selection, including cells on multiple levels and cells marked as doors/windows:

- Change Terrain Type assigns the chosen terrain type and its default material set to every selected
  cell, using that material on every face. Preserve address, shape/corner heights, smoothing, opening
  identity, orientation, and initial state. A custom material can be chosen explicitly afterward.
  The preview reports the affected count and resulting material. Do not silently reset a ramp to a
  cube, remove a window, or clear difficult-terrain classification when changing its material.
- Remove Cells deletes exactly the selected cells and any openings contained in them, leaving air.
  It does not remove an entire column, neighboring cells, or actors/placements. Report affected
  openings and newly unsupported placements in the preview. Allow the draft edit; mark invalid
  placements for explicit relocation before publication/play readiness. Do not silently relocate
  authored actors or refill holes. The editor preview actor can remain floating so focus stays valid.

Each operation previews its complete effect, then applies as one undoable local transaction and
one atomic save batch. Undo restores the exact cells, materials, opening identities/states, and
selection; redo reapplies the same result. Removing a selection clears its deleted addresses from
active selection. Empty selections disable these actions. These operations apply only to the World
draft and do not alter captured maps or active Instance state.

### Weighted random terrain generation

Generate Terrain creates a proposed terrain patch inside the map or a GM-defined bounded region.
The GM chooses a terrain preset (Plains, Rolling Hills, or Mountains), base elevation, minimum and
maximum surface elevation, relief/roughness, feature size, terrain type, and a seed. Show elevations
in both grid units and feet. A New Seed control produces a different candidate; the same seed,
parameters, generator version, and input map revision reproduce the same cells exactly. This is
local procedural authoring, without an external AI service or changes to the selected actor.

Generation must favor coherent, plausible landforms rather than independent random heights per
column. Proposed algorithm, to validate visually in phase 0:

1. Generate a seeded, spatially correlated multiscale height field over the region's X/Y footprint.
   Large features dominate; smaller features contribute progressively less amplitude. Sample in
   map coordinates so chunk boundaries do not create artificial seams.
2. Shape the height distribution around the preset's base elevation. Plains strongly favor low
   relief, Rolling Hills favor moderate broad rises/depressions, and Mountains allow higher relief
   with less frequent peaks. Persist explicit numeric weights and ranges with the generator version;
   preset names alone must not determine an unstable algorithm.
3. Apply bounded neighborhood relaxation with preset-specific slope targets to reduce isolated
   spikes and pits while retaining occasional steep terrain. Derive all randomness from the seed;
   worker scheduling and chunk processing order must not change the result. This approximates
   natural elevation patterns; physical erosion simulation is not required.
4. Convert the field to occupied columns above the chosen lower fill boundary, capped by the region
   and 100³ map bounds. Fit surface cells to the existing cube/ramp/ridge/valley corner-height and
   triangulation contract; reconcile shared edge heights or produce a deliberate closed cliff face.
   Classify generated slopes as difficult terrain exactly like manually authored slopes. Optional
   visual smoothing remains separate from this elevation generation.
5. Build a cell patch and report created, changed, removed, and skipped cells, elevation range,
   steep-slope frequency, and any affected openings/placements. Never generate out-of-range cells
   or silently change the physical scale.

Default generation is **Fill Empty**: existing cells, structures, openings, and authored terrain
remain intact. Offer explicit **Replace Region** with a preview of removals and changes, including
existing terrain above the proposed surface. For an arbitrary cell selection, treat those exact
addresses as the write mask; outside cells may inform edge matching but may never be modified.
A region selection may include air addresses to generate new land. No selected mask implies a
clearly displayed whole-map region. Validate all region/elevation inputs before generation.

Show a ghosted preview over the current draft with Generate Again, Apply, and Cancel. Apply commits
one undoable batch to the local draft; Save Map persists it. Cancel, failed generation, and stale
results change nothing. If the map revision changes while a worker is generating, require a new
preview against the updated map before applying. Background work has progress and cancellation,
so even full-volume generation leaves orbit and the surrounding editor responsive.

Store the resulting ordinary cells as the authoritative map data, with optional generation metadata
(seed, version, resolved parameters, region/mask reference, and input revision) as authoring
provenance. Playback never regenerates terrain. Persist or retain the exact mask if regeneration
is offered; a reference to a transient selection is insufficient. Editing generated cells uses the
same selection/type-change/removal tools as hand-placed cells.

The initial generator produces a connected surface with filled ground where requested. It does not
create caves, buildings, or overlapping walkable levels automatically. Those remain authorable with
ordinary cells; generation cannot collapse an existing bridge/cave unless its cells are explicitly
included in Replace Region. “Realistic” means the preset passes visual review and measurable
height/slope distribution targets, not a claim of geological simulation. Include a fixed seed suite
and inspect neighboring elevation differences, isolated spikes/pits, shared edges, and boundary
transitions. Ratify numerical distribution targets in phase 0 and check them over multiple seeds.

To reach distant regions without camera pan, the GM can reposition the editor preview actor using
a named “Move preview actor” tool or a coordinate/level control. This is an editor action and remains
available when real placements are present. Selecting that proxy preserves the focus invariant
without moving an authored creature. A staged actor move is a separate placement edit.

Maintain a local working draft with explicit Save Map, an unsaved-change indicator, and undo/redo.
Save one atomic, version-checked patch batch with an operation identity. Rejected/stale saves retain
the local work and show a comparison/reload option. A second tab cannot silently overwrite a newer
map. Keyboard alternatives provide placement, plane/elevation changes, palette choice, and orbit;
status must use text as well as cursor color. Preview mode uses isolated play state so trying a door
or movement never changes authored terrain.

## 6. Visibility, stacked levels, and camera obstruction

### Authoritative sight

Extend the existing planar concept into 3D; do not project the whole map onto XY. Spatial queries
use chunk traversal to find candidate occupied cells, followed by exact canonical shape/aperture
intersection. Test roofs, slopes, frames, narrow gaps, and shared-boundary rays with deterministic
epsilon conventions. Eye height, sense range, light, opening transmission, and concealment are
inputs to captured visibility rules; the camera is never the observer.

Expose bounded geometry primitives to the rules runtime. Rules define what counts as visible,
including partial target visibility and transmission through water/glass. A proposed baseline rule
set tests multiple canonical points on a target body (feet/body/head and footprint samples) and
requires an unobstructed in-range sample. Freeze sample locations and edge behavior in versioned
contracts; they must not depend on artwork alpha, GPU pixels, or camera direction. Stacked surfaces
get independent discovery: seeing a roof never automatically reveals its underside or a room below.

Represent visibility as currently visible, explored but not currently visible, and unknown. Store
explored terrain/surfaces per observer and captured map revision; sharing exploration is a rule or
explicit policy, not a union of all connected clients. Explored areas show last-known terrain, not
live unseen door changes or creature locations. Current creatures require current authorization.
GM-only information remains separate from each actor's projection.

The server returns only authorized entities, visible/remembered terrain surfaces, and permitted
asset references. A full secret map plus a client fog shader is insufficient. Player chunk payloads
must not disclose hidden rooms, occupancy, doors, labels, shadows, or picking targets. Use filtered
surface geometry or redacted chunk projections with neutral fog boundaries. Blocker-only geometry
must likewise be sanitized so it cannot encode secret layouts. GM authoring can receive full chunks.

Revision visibility with effective terrain, opening states, actor positions/senses, and relevant
rules/light changes. Publish coherent runtime/visibility snapshots; on invalidation, suppress newly
uncertain entities until the replacement arrives. Never combine new positions with an older,
more-permissive visibility result. Fog compositing and picking both use the authorized projection.

### Obscuring terrain becomes transparent

Compute this only **after** determining which creatures the selected actor can see:

1. Build the authorized visible-creature set, including the focused actor for camera readability.
2. For each creature, test the orthographic camera rays through several points on its displayed
   silhouette/footprint against the renderable terrain. Rays start on the camera plane and remain
   parallel; rays from a perspective-style single eye are incorrect here.
3. Collect every intersecting foreground terrain fragment/cell, including multiple floors or roofs.
   Use a small screen-space silhouette expansion to avoid missing partial occluders.
4. Fade those surfaces to a proposed 15–25% opacity with short, configurable transitions. Preserve a
   faint outline so their shape is understandable; disable conflicting shadow/depth artifacts.
5. Restore normal opacity when no authorized visible creature needs that surface faded. Use modest
   hysteresis to avoid flicker. Respect reduced-motion preferences.

Terrain fading is a camera-local presentation mask. It never changes movement, world sight,
exploration, door state, other clients, or transmitted visibility. A creature hidden from the actor
cannot become visible because the camera can see it. Unknown space revealed behind faded terrain
remains fogged, and faded cells remain correctly pickable in authoring. Fading a large merged mesh
must not expose an entire chunk: retain per-cell/per-face fade addressing or split affected faces
into a small dynamic render batch. Apply this treatment to visible creatures at all elevations,
not just the focused actor.

## 7. Rendering and service implementation

### Client modules

Introduce a client-only renderer adapter selected by the map discriminant. Keep the existing 2D
renderer intact while extracting shared toolbars, actor lists, and inspectors. Do not add another
large mode branch throughout `SessionCanvasHarness.tsx`.

Proposed components/services: `IsometricMapViewport`, `ActorFocusController`, `TerrainChunkRenderer`,
`TerrainAuthoringController`, `SpatialPicking`, `BillboardActorRenderer`, and `CameraOcclusionMask`.
Keep deterministic geometry independent of React and GPU libraries so server queries and client
previews use the same shape construction. Use workers for expensive meshing/query preparation.

Use Three.js as the proposed render foundation, subject to the phase 0 spike. Its
[OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html) provides the required
projection; [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) supports batching
repeated geometry. These are capability references, not performance guarantees. Pin an evaluated
version during implementation; no 3D dependency is installed by this design change.

Cull internal faces only where neighboring canonical solids actually cover them. Partial ramp
faces, glass apertures, and view-dependent fades prevent naive full-cube culling. Batch exposed
static faces by chunk/material; instance repeated openings and special shapes where appropriate.
Use actor-facing upright billboards with alpha cutout, depth handling, contact markers, and optional
contact shadows. Artwork pivot stays at the feet even as the camera orbits. Presentation scale and
physical footprint remain separate.

Mount GPU code after client hydration; preserve the current SSR route shell and accessible loading
state. Handle unavailable WebGL/context loss with a clear noninteractive map status and retry while
retaining the surrounding Session UI. Reduced texture/shadow quality cannot reduce fog correctness.
Dispose geometry, textures, workers, and listeners on map changes.

### Server boundaries

Extend existing World Location authoring and Campaign Instance/Session API ownership paths; final
route names follow the active API hierarchy. Required capabilities are:

- Read a versioned draft manifest/chunks and save a validated atomic terrain patch for the owning GM.
- Publish/capture exact geometry and material references, with missing-reference validation.
- Read a GM map projection or a participant projection bound to the authenticated player's actor.
- Submit spatial movement/opening declarations with expected runtime revision and idempotency key.
- Execute captured rules, record causal events, and atomically commit approved effects through the
  rules runtime's review boundary; return the resulting authorized projection.

Do not accept a client-supplied observer as authority. The server derives player ownership from
membership/Character binding and verifies Session access on every action/projection request.
Rate-bound expensive geometry work, validate all finite numbers and dimensions, reject duplicate
cell addresses, and bound patch size (one plane may contain up to 10,000 cells; full-volume selections and generation
may touch up to 1,000,000 cells). Stage large batches in bounded chunk payloads and validate the
complete result before an atomic manifest swap. Generation/type changes/removal share version
checks, authorization, and idempotency with manual placement. Multi-part transport
may stage a batch, but no partially applied stroke becomes visible.

Movement primitives return support surfaces, clearances, collision facts, and terrain classifications.
Pathfinding uses a surface/volume graph capable of distinguishing multiple surfaces at the same XY;
a 2D height map is insufficient. Rules determine allowed edges, costs, steps, swimming, climbing,
and flight. Preview and commit use the same geometry and captured rules. Unsupported mechanics show
an explicit unavailable action, not a direct token-position write. A no-rule action changes nothing.

Use runtime revisions and incremental changed-chunk/opening/entity projections through the existing
transport boundary, adding a realtime channel if required. Reconnect obtains a coherent snapshot
before applying subsequent deltas. Migrations map stable opening/actor references, compare changed
support/clearance, and require explicit relocation decisions for stranded actors. Checkpoints and
rollback preserve Instance overlays and exploration without rewriting later Session history.

### Performance validation targets

Targets are proposed acceptance budgets, to be ratified against named hardware in phase 0. At
1080p on the agreed desktop baseline, aim for 60 FPS orbit in a representative 100,000-cell map
with 50 actors; require at least 30 FPS on the agreed lower tier. Keep cursor feedback below 50 ms
and a 10,000-cell plane preview below 100 ms. Target warm map entry under 3 seconds on the agreed
network, and steady map GPU memory below 512 MiB on the desktop baseline. Full-volume generation and selection edits must support progress/cancellation and remain within
measured worker-memory budgets; ratify generation latency limits in phase 0. Record p95 frame/query
latency, draw calls, upload size, memory, and cold versus warm load separately.

Benchmark a fully occupied million-cell volume, a sparse bridge/cave map, and an adversarial
checkerboard with many exposed faces. All legal volumes must remain loadable; use chunk scheduling,
mesh caching, quality tiers, and coarse display LOD as needed. LOD must preserve picking/authoritative
geometry and concealment. If budgets fail, address exposed-face and projection costs before increasing
texture detail. Do not silently reduce the 100-cell limit or omit authorized terrain to pass a test.

## 8. Phased delivery and exit gates

Phases are dependency-ordered vertical slices. Estimates should follow phase 0; the rules runtime,
participant projection, and worst-case rendering costs make calendar promises premature.

| Phase                                | Deliverables                                                                                                                                                                                                                                                                                                                                                                         | Exit gate and dependencies                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — Decisions and technical proof    | Validate opening dimensions against the confirmed 5-foot cell scale; ratify preview-actor interpretation, camera limits, shape presets, smoothing contract, visibility baseline, and hardware budgets. Prototype weighted elevation generation with seed-suite distribution targets, orthographic orbit, bridge/cave geometry, billboard, high-quality materials, and per-cell fade. | Demonstrate two stacked walkable levels, stable focused orbit, and fading without fog leaks. Benchmark dense and exposed-face workloads. Record stack decision; no production schema yet.                                                                    |
| 1 — Domain and persistence           | Spatial map/coordinate types, shape builder, material references, versioned generation parameters/provenance, atomic volume patch contracts, Location-owned chunks, World save/publish/capture, Instance overlay contracts, validators and migration/read compatibility. Update AI guide and resource mappings together.                                                             | Round-trip sparse/maximum bounds; reject invalid shapes/coordinates; existing 2D maps unchanged; capture remains immutable. Requires phase 0 decisions.                                                                                                      |
| 2 — Usable GM authoring              | Client renderer, preview actor, mandatory focus, wireframe cursor, plane drag, arbitrary multi-level selections, selection terrain type changes/removal, seeded weighted terrain generation with preview, elevation/slice tools, material/shape/opening controls, smoothing, undo/redo, atomic Save Map.                                                                             | Build and reload a textured two-level map with a ramp, ridge, valley, door, and window; regenerate identical seeds, bulk-change/remove disconnected cells, and undo/save/reload exact results; stale saves and canceled work lose no data. Requires phase 1. |
| 3 — Authoritative spatial play       | Runtime actor embodiment/positions, rule geometry primitives, 3D path preview, slope classification, door/window effects, Session event/review integration, checkpoint/reconnect.                                                                                                                                                                                                    | Rule-free map actions are no-ops; captured rules produce valid movement and opening transitions; under-bridge and over-bridge routes stay distinct. Requires phases 1–2 and an executable event/effect runtime.                                              |
| 4 — Player experience and visibility | Server actor binding, participant-safe spatial projections, 3D sight/exploration, GM actor preview, billboard interactions, camera occlusion fading, coherent visibility invalidation.                                                                                                                                                                                               | Two player accounts cannot change observer or read each other's hidden information; orbit never changes actor sight; obscured visible creatures remain readable. Requires phase 3; no production player-map rollout before this gate.                        |
| 5 — Quality, scale, and rollout      | Material art pass, boundary smoothing polish, transparency/shadow fixes, accessibility/touch controls, GPU cleanup, maximum-volume generation/selection and migration tests, feature-gated rollout.                                                                                                                                                                                  | Meet ratified budgets and full acceptance matrix; verify SSR/context-loss recovery and existing 2D regressions. Enable progressively by map kind; preserve data on feature rollback.                                                                         |

A prototype or authoring-only release may precede the rules runtime. Label it accordingly and keep
player gameplay disabled. Phases 3–4 constitute the minimum playable release; phase 5 is the full
requested quality/release gate. Do not substitute the existing movement modifier preview for an
implemented rules execution path.

## 9. Acceptance and verification matrix

| Requirement/risk                      | Required evidence                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Always selected and centered          | Initial GM random choice from eligible actors; player binding before first frame; empty-map readiness/author proxy; deletion/transition/reconnect; Escape and inspection retain focus; orbit/zoom/resize keep center                                                                                                                                                                |
| Players cannot select others          | UI tests plus forged observer/action requests rejected; visible-target inspection leaves focus unchanged; binding revocation clears cached data                                                                                                                                                                                                                                     |
| 100³ sparse volume                    | Edge indices 0 and 99 accepted; 100 rejected; nonfinite/duplicate coordinates rejected; empty chunks omitted; million-cell and checkerboard fixtures load                                                                                                                                                                                                                           |
| Overlapping levels                    | Cave beneath bridge with independent actors, support, paths, light/sight, picking, and exploration; no XY flattening                                                                                                                                                                                                                                                                |
| Four shapes and difficult terrain     | Preset/rotation/diagonal fixtures agree across mesh, ray hit, and support; all sloped walkable surfaces report difficult terrain to rules                                                                                                                                                                                                                                           |
| Materials                             | Same material set on every terrain face; approved close/normal-zoom reference scenes; repeat seams and missing-asset fallback reviewed                                                                                                                                                                                                                                              |
| Doors/windows                         | Every state and forbidden transition; frame/aperture collision and sight; locked state disclosure; geometry revision invalidation; persistence across Sessions                                                                                                                                                                                                                      |
| Camera transparency                   | Multiple foreground walls/roofs fade only for actor-visible creatures, restore after orbit, and do not change collision or reveal unknown space; water/glass coexist correctly                                                                                                                                                                                                      |
| Fog/LOS                               | Under-roof, slope-edge, narrow-window, partial-body, darkness/range, last-known opening, and two-account network payload tests; camera orbit cannot expand authorized entity set                                                                                                                                                                                                    |
| Authoring                             | Single click; inclusive 2D drag in all planes; shape cursor; right drag never paints; plane lock; invalid bounds; erase/replace preview; full-stroke undo; retry idempotency; stale save                                                                                                                                                                                            |
| Arbitrary selections and type changes | Disconnected cells across chunks/levels; visible versus Through Volume selection; exact selection membership; type/material update preserves shapes, slopes, openings and states; no unselected cell changes; keyboard operation                                                                                                                                                    |
| Selection removal                     | Any selected terrain/opening can be removed; exact cells become air; no actor/column deletion or automatic refill; unsupported placement readiness; empty selection; whole-operation undo/redo and save/reload                                                                                                                                                                      |
| Weighted random generation            | Same seed/version/parameters/input reproduce exact cells; different seeds produce variation; preset height/slope targets across a fixed seed suite; no isolated noise spikes or chunk cracks; legal shapes/bounds; Fill Empty preserves structures; Replace Region and masks change only previewed cells; cancellation/stale output is a no-op; million-cell batch atomically saved |
| Rules and ownership                   | No-rule no-op; reviewed effect commit; no direct client state mutation; source World remains unchanged through play; snapshots/migrations/checkpoints preserve map state                                                                                                                                                                                                            |
| Smoothing                             | Cross-chunk seams and adjacent strengths; no aperture closure/air-gap bridging; gameplay triangles and difficulty unchanged; foot marker matches canonical support                                                                                                                                                                                                                  |
| Compatibility and operation           | 2D fixture/save/load regression; SSR loading shell; GPU context loss/recovery; device quality tier; keyboard operation; readable labels without opaque IDs                                                                                                                                                                                                                          |

Run focused common-type/geometry unit tests, API authorization/persistence tests, and browser
interaction/visual tests for each delivered slice. Visibility authorization requires inspecting
actual participant responses and caches, not only screenshots. Performance fixtures and hardware
results accompany the release gate rather than becoming assumed guarantees.

## 10. Documentation impact and references

The implementation adds shared terrain types, the optional canonical source Location `map` field,
and snapshot-only chunk components. The AI-facing guide has been updated with the hydrated value
contract, persisted manifest example, save/read boundaries, and gameplay exclusions. The generic
DomainRecord resource registry remains unchanged; chunk components cannot be read or written through
generic CRUD. During further phase 1
implementation, actively compare all affected common types and
`apps/api/src/domain/domain-resource.ts` against `apps/api/src/ai/prompts/domain-model.md`, updating
its examples, resource table, coordinates, openings, and subsystem summaries in the same change.
Update the canonical architecture if accepting this proposal changes an existing invariant.

Repository authority and supporting scope:

- [Documentation authority](README.md)
- [Canonical architecture and ownership](information-architecture-domain-model-realignment.md)
- [Event-driven rules architecture](age-of-wonders-rules-engine-design.md)
- [Rules implementation status](rules-engine-implementation.md)
- [Implemented Location types](../packages/common/src/types/locations.ts)
- [Implemented placement types](../packages/common/src/types/placements.ts)
- [Implemented Instance types](../packages/common/src/types/campaign-instance.ts)
- [AI-facing implemented domain guide](../apps/api/src/ai/prompts/domain-model.md)

No deprecated documents informed this proposal.
