# B06 — Entity graph and catalog foundation

Status: complete, 2026-10-14 (America/Los_Angeles). User selected B06 after B08.
Feat, Heritage and Discipline remain permanently excluded.

## Delivered boundaries

| Coverage | Ownership and real consumer | Verification |
| --- | --- | --- |
| DM-01 scoped graph | EntityGraph owns graph-local identity, exact reference resolution, transitive validity, reference cycles, ownership cycle rejection, isolated hydration, mode/context preservation, persistent child instances, removal/disposal and registration rollback. | Eight graph tests plus existing Entity protocol tests |
| DM-01 publication and commands | CatalogCapture supplies live graph records to owner validation; schema edits update dependent Custom validity. Rejected commands publish no new state/events. World publication consumes exact declared catalog/schema capture. | Capture tests and actual World publication adapter tests |
| DM-03 Language/Table/Custom | Independent definition owners, lossless raw/envelope codecs, local validation and replacement. Language rarity stays open; Table entries remain values and use existing dice grammar without rolling. Custom resolves exact applicable registered schema, rejecting ambiguous key-only registration at publication. | Owner tests, draft preservation and publication scope tests |
| DM-03 shared catalog | ExtensionSchema, RuleVariant, ContentPack and GameSystem roots own their contracts. Nested schemas, patches, dependencies and catalog members remain values. Variant selection enforces captured presence/requires/conflicts; required pack namespaces must be present, optional missing dependencies remain allowed. | Atomic owner selection/adoption tests |
| Internal writers/imports | DomainService create validates structure; replace delegates commands and persists serialized owner state through existing CAS. Sequential archives may import Custom before schema. Reads retain original data. | Service/archive regressions and actual PostgreSQL caller acceptance |

Graph dependency validation is scoped, not an authorization mechanism or global lookup.
The caller supplies an already authorized capture. World publication excludes undeclared
schema records, even if they happen to be in the snapshot input. No external schema fetch
or another World's catalog is consulted.

API owners/graphs are isolated and disposed per request. Prisma remains durable authority;
failed CAS discards the candidate and makes no GraphService projection call. This does
not claim a transaction shared between an exposed live graph and the database. The
existing LevelGraph indexing/recovery boundary remains unchanged.

The same ExtensionSchema shape is an entity under `extension-schemas` and a value when
embedded in a ContentPack. Table values can be arbitrary JSON: strings are not guessed
to be references. JSON Schema payload execution, semantic-version range solving, rule
patch execution, implicit variant enabling and new gameplay mechanics are not added.
Common types and persisted resource mappings are unchanged; the AI-facing guide was
compared to catalog/game/primitives/dice sources and updated for ownership semantics.

B07 lineage/Model lifecycle, B09 maps, B10 runtime/Instance orchestration and B12 remaining
writer retirement stay deferred. Existing standalone owners and historical type-only
compatibility exports remain supported; this batch does not claim the entire original
migration complete.

## Evidence

Final domain tests: **345 passed**. Web suite: **1,114 passed**. API suite: **914 passed**, 43 optional environment tests skipped; the two B06
PostgreSQL tests were separately enabled and passed.
Two real PostgreSQL acceptance tests passed on a fresh migrated disposable database:
custom-before-schema archive ordering, exact private-data readback, concurrent revision
writes with one winner, rejected replacement unchanged and rejected creation absent.
The external LevelGraph projector was stubbed in those DB tests; Prisma/DomainService/
archive execution were real. No new browser UI or public catalog controller was added,
so consumer acceptance follows the service/library path. Production web build/prerender
and web/API/domain compiler checks exercise the affected shared package integration.

Review repaired prototype-like codec dispatch, dynamic capture context, duplicate schema
registration ambiguity, required pack presence and preservation of legacy grant-error
precedence. Full API initially found six diagnostic-order failures; those were corrected
without adding work for excluded concepts. A focused compatibility run passed 66 tests.

Used Backend Architect and Code Reviewer definitions, with independent graph, catalog,
and writer/verification assignments. No common schema migration or development data
change is required for B06.

## Cleanup and measurement

The disposable B06 database was removed and absence verified. No browser auth/test
server was needed; no live development database or media was changed. AI guide,
documentation authority index, source inventory and BACKLOG.md are synchronized.

Measured active session: **9.64 minutes**. Aggregate verification: **250.25 command-seconds**; overlapping interval union: **158.65 seconds** (**27.42%** of measured active wall). This is not blocked waiting time.

| Category | Command seconds | Commands | Marked reruns | Failed attempts |
| --- | ---: | ---: | ---: | ---: |
| typecheck | 41.851 | 7 | 0 | 0 |
| lint | 37.634 | 5 | 3 | 2 |
| build | 39.064 | 5 | 2 | 1 |
| tests | 131.703 | 12 | 3 | 1 |

Reruns addressed the graph scope-accessor name collision, new codec-map declaration
compatibility, fixture lint typing, bound compatibility methods, and the six legacy
diagnostic-order regressions. Later checks covered actual new schema/pack boundary
corrections. Raw logs retain failed attempts. A shared build emitted JavaScript before
its declaration check failed; focused behavior tests were followed by a corrected
complete build and final suites. Initial instruction reading before the marker and
manual review/preparation durations were not individually captured; no estimates
were substituted. Implementation continued alongside checks.

[Raw timings](b06-timings.jsonl) and [measurement receipt](b06-measurement.json).
