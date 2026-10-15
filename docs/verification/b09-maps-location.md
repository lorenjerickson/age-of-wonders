# B09 — Maps and Location capabilities

Delivery date: 2026-10-14 (America/Los_Angeles). The user selected B09 after the
[Location map-upload repair](map-image-upload.md). Feat, Heritage and Discipline
remain permanently excluded.

## Delivered boundaries

| Coverage | Owner and consumer | Evidence |
| --- | --- | --- |
| DM-08 Location/Map | LocationDefinition exposes a stable Map view. Replacement routes through the parent command, validates atomically, serializes with the Location and shares teardown. Actual terrain-save API uses it. | Required-map, invalid replacement, private fields, image/grid retention and disposal tests; terrain save/capture tests |
| DM-08 elements | Map owns stable element views; changes route through the parent aggregate. Wall/Door/Window codecs retain normalized legacy 2D and cell-based 3D formats. Open 2D doors block no channels; 3D windows cannot be locked. | Isolated same-ID maps, atomic rejection, one parent emission, state stream/disposal, explicit format tests |
| DM-08 terrain | Existing terrain editor and opening/smoothing helpers delegate to Map. Geometry kernels remain common utilities. Selection batches retain opening identity, preserve imported cell/chunk fields and capture complete undo cells. | Editor model tests, undo/private-data regressions, terrain browser editing/preview/save/reload, malformed capture/hash tests |
| DM-15 intrinsic exploration | MapExploration owns the strict existing snapshot codec and observe policy. The server-authorized projection delegates to it. Scope/revision checks, material memory and explicit absence remain unchanged. | Owner conflict/isolation/idempotency tests and existing projection privacy/recovery cases |
| LOC-01 authored weather | Optional open condition, Celsius temperature, Kph wind and optional direction in [0,360). Location owns commands and validation. | Domain and API boundary tests; actual desktop save/readback and mobile edit/reload |
| LOC-02 authored audiovisual | Named audio/image/video cues with authorized assets, enabled/loop, audio volume or visual opacity in [0,1]. Shared responsive controls and read-only summary resolve media filenames. | MIME/access checks, private preservation, actual audio/visual uploads and explicit removal |

No new canonical 2D wall authoring UI was introduced: `WorldLocationDefinition`
still has no walls collection; the normalized-wall adapter explicitly serves the
legacy LocationState representation. Terrain remains the existing functional
spatial editor. No coordinate conversion, invented opening geometry or stored
Map resource was added.

Map/element views have a single persistence authority. Their exposed mutations
route through the parent rather than writing independent child copies. Terrain
hash verification, manifest/chunk authorization, CAS and snapshot capture remain
API adapters. Removing the last cell retires an empty chunk under the existing
format; this introduces no chunk tombstone schema.

Weather and media cues are authored World defaults captured with Location records.
Omission preserves either field; null removes it, and an empty cue list explicitly
clears entries. Updates retain unknown imported weather/wind and same-ID cue fields.
Unchanged malformed legacy presentation can survive unrelated draft edits; new or
changed malformed values fail. Publication validates without that baseline exemption.
These settings are separate from mechanical Conditions/Effects. Existing spatial
audio calculations are unchanged.

B10 retains Instance realization, actor integration, authoritative visibility
dispatch, Session commands, exploration persistence orchestration, presentation
playback and runtime overrides. B09 adds no participant endpoint or automatic
weather mechanics, visibility sharing, cue positioning or playback schedule.

## Verification and review

Authenticated acceptance used a migrated disposable PostgreSQL database and isolated
MinIO bucket. Desktop Atlas authored weather and uploaded WAV/SVG cues; save/readback
and reload retained them. The mobile Map editor changed weather while retaining cues;
explicit removal cleared configuration while retaining the original map image. Browser
page errors were absent. Screenshots were visually inspected; the summary panel gained
padding and checkbox labels retain 44 px hit areas.

Responsive component fixtures cover both editors at 1440 and 390 px, omission/removal,
private fields, upload failures/retry and save/reload. Their transport is mocked. The
existing terrain browser fixture edited/generated terrain, uploaded 49 chunks, saved
and reloaded 73,957 cells; its transport is also mocked. Separate API tests retain real
capture policy, malformed chunk rejection and authorization boundaries.

Backend Architect, Frontend Developer and Code Reviewer definitions informed bounded
implementation and independent cross-review. Review repaired nested private-data loss,
independently writable map-child copies, missing Location→Map ownership, complete undo
capture, and legacy presentation preservation before handoff.

Common `world-authoring.ts`, Location/terrain/exploration types and
`apps/api/src/domain/domain-resource.ts` were actively compared with the updated
AI-facing domain guide. Weather/cue contracts and owner semantics are documented;
resource mappings remain unchanged. No database migration or user data rewrite is
required.

Final integrated checks: **361 domain tests**, **919 API tests** and **1,121 web tests**
passed. The API suite retains 43 optional environment skips; the dedicated real B09
PostgreSQL acceptance was run separately and passed. Subsequent focused web tests and
responsive browser runs covered unchanged malformed-data omission and explicit repair.
Final API/web/domain compiler checks and the final production web build/prerender passed.
Targeted API/web lint passed; domain files have no applicable ESLint configuration and
were compiler-checked. Existing unrelated API lint findings were not changed.

Real PostgreSQL terrain acceptance additionally verified image→cube-door 3D capture,
exact stored chunk hashes, hydrated reload, weather/image/private retention, invalid
locked-window and missing-hash rejection without revision/data mutation, and restoration
of the image map.

## Cleanup and measurement

The isolated API/web servers stopped; 13 test media objects and their empty bucket were
removed. The disposable database is absent, and temporary credentials/image/config/cache
files were deleted. Normal development servers and application data remain intact.

Measured active interval: **13.95 minutes**. Aggregate verification:
**544.61 command-seconds**; overlapping interval union: **402.82 seconds**
(**48.13%** of active wall). These are not blocked-waiting estimates.
Implementation continued alongside checks. Initial scope analysis overlapped MAPFIX.

| Category | Command seconds | Commands | Marked reruns | Failed attempts |
| --- | ---: | ---: | ---: | ---: |
| typecheck | 137.456 | 12 | 4 | 3 |
| build | 59.001 | 7 | 1 | 1 |
| tests | 148.223 | 20 | 6 | 3 |
| lint | 60.449 | 14 | 4 | 5 |
| browser | 139.479 | 7 | 1 | 1 |

Reruns addressed source typing, new test fixture shape/command usage, nested private-data
preservation, legacy weather baseline behavior, lint invocation paths and an existing
terrain browser fixture's missing inline-tools option. One API command exited zero with
no tests due argument forwarding; it supplies no coverage. Concurrent temporary fixture
cleanup interrupted a web compiler scan, and a domain rebuild briefly removed the package
while two API suites imported it. Dependent checks were sequenced and rerun successfully.
The real terrain harness initially attempted a prohibited raw-draft Location write, then
used the dedicated endpoint. All failed attempts remain in the timing log.
One agent reported a 2.92-second source compiler check without wrapper timestamps; it is
excluded from aggregate/union calculations. Manual preparation/review/cleanup time was
not separately captured; no estimates were fabricated.

[Raw timings](b09-timings.jsonl) and [measurement receipt](b09-measurement.json).
