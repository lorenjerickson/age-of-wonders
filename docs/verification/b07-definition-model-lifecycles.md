# B07 — Definition and Model lifecycles

Delivered 2026-10-14 (America/Los_Angeles), following baseline commit `7e765a8`.
The user selected B07 and explicitly included existing per-Location canvas controls.
B11/B12 remain deferred; Feat, Heritage and Discipline remain excluded.

## Delivery and preservation

| Coverage | Implemented boundary |
| --- | --- |
| DM-05 Campaign aggregate | CampaignDefinition owns authored membership, Plot/placement diagnostics, captured references, rich-text/preparation/canvas policy, replacement and fork rewriting. Incomplete drafts keep nonblocking diagnostics so they remain repairable; publication still requires complete validity. |
| DM-06 lineage and migration | DefinitionLineage supplies exact draft/base/validation publication and archive transitions to World/Campaign services. Domain-owned World/Campaign fork reference rewriting retains private data, Skill keys/property paths and captured identities. Campaign World adoption planning owns direct-successor matching, conflicts, bounded impact review and reference/conformance rewriting. |
| DM-07 Models | ModelElement owns shape/cardinality/revision and revise/archive commands; ModelSchema owns dependency closure, exact release publication and adopted-root collisions; ModelMigration owns direct-lineage mapping and typed backfill policy. World/Campaign governed conformance moved to owners. API compiler/runtime validator remain adapters. |
| UX-01 overlays | Deliberate Add/Edit, inherited placement list, independent actor/Item sources, World decorations, notes, normalized position/scale and named removal impact. Captured World records remain immutable. |
| UX-02 Plot Location intents | Canonical placements support actor roles and Items with reciprocal context association; incompatible Location/supporting Plot changes are blocked. Deprecated inline intent arrays and private extensions remain intact. |
| UX-03 preparation | Named Location selection; all 22 built-in layers, pixels-per-five-feet, lights, sounds, drawings, templates and notes; existing position/radius/color/volume/mode/loop/text fields. Save, Cancel and dirty guards use existing draft persistence. |

Authorization, hash/integrity checks, timestamps, generated IDs, immutable capture
storage, transaction boundaries, optimistic concurrency and HTTP error adaptation
remain in adapters. No database migration or common payload schema change was needed.
No new expression interpreter, automatic Model selection, canvas renderer, playback
synchronization or combat behavior was introduced. B12 retains universal writer and
compatibility retirement.

Before editing, existing Campaign/World lifecycle and persistence tests, common types,
canonical architecture and existing fixtures established the preservation baseline.
Added owner cases verify isolated copies, codecs, private canvas/record fields,
nonblocking draft diagnostics, stale/unvalidated rejection, immutable Model revision
IDs and existing reference grammar. Browser fixtures use two named captured Locations
and retain unrelated/private/legacy content through changed drafts.

## Verification

- Domain suite: **385 passed**. After final lineage/Model edits, all **8 focused
  lifecycle/Model cases passed** again. Final domain build passed.
- API suite: **136 suites, 924 tests passed; 8 suites/43 tests skipped** because their
  environment prerequisites were unavailable. This final run includes Campaign
  migration planning after extraction and direct World publication integration.
- Web suite: **77 files, 1,125 tests passed**. Production build and four prerendered
  routes passed. API and web TypeScript checks passed.
- Affected API/web ESLint passed after unused import/parameter cleanup. Final
  `git diff --check` passed.
- Playwright at **1440px and 390px** passed placement create/edit, decoration,
  inherited list, actor/Item associations, named removal, private/legacy/position
  preservation, dirty Cancel and mocked authoritative read-back/reload. Preparation
  note/light save, read-back/reload and Cancel passed. No horizontal overflow or
  browser console errors were observed. The mobile preparation screenshot was also
  visually inspected.

Browser entrypoint: `apps/web/scripts/b07-campaign-intents-smoke.mjs`.
It uses mocked HTTP transport and disposable local fixtures; it is not a live
PostgreSQL acceptance test. No new live-database acceptance was run, and the skipped
API tests remain a limitation. Source authorization/CAS paths and existing API tests
provide supporting evidence, not a substitute claim of live database execution.
Temporary browser fixtures were cleaned up. No user records were created or deleted.

`apps/api/src/ai/prompts/domain-model.md` was updated and compared with affected
`packages/common/src/types` and `apps/api/src/domain/domain-resource.ts`. Common
payload contracts and persisted resource mappings remain unchanged and accurate.

## Measurement and workflow

Raw intervals: [b07-timings.jsonl](b07-timings.jsonl).

| Category | Commands | Aggregate seconds | Recorded reruns |
| --- | ---: | ---: | ---: |
| Build | 9 | 66.74 | 3 |
| Tests (including one `unit` label) | 15 | 133.86 | 2 |
| Typecheck (including one `types` label) | 6 | 77.65 | 2 |
| Lint | 5 | 28.89 | 2 |
| Browser | 9 | 109.91 | 7 |

Total command-seconds: **417.04**. Union of overlapping verification intervals:
**307.46 seconds**, not the sum of parallel command times. There are **16 recorded
reruns**; incremental checks with new labels also repeat some coverage.

The explicit work-session clock markers span **03:05:25–03:18:12 UTC on October 15**,
12 minutes 47 seconds, without an intervening user pause. Verification intervals occupy
40.1% of that recorded span; implementation and documentation continued during some
checks. Initial discovery before the first marker and final handoff writing afterward
were not separately timed. Manual preparation/repair/review and blocked-only waiting
were not independently instrumented; this is a partial active-session interval, not
an invented total task-duration or account-usage attribution.

Failures/reruns addressed concrete integration issues: abstract validation and recursive
return annotations, correct Entity command invocation, nonblocking draft diagnostics,
Model hash callbacks kept outside JSON context, immutable revision checks, UI fixture
inference/accessible-name selectors, and unused imports/parameters after extraction.
Browser fixture retries account for seven reruns. No unchanged broad suite was repeated
for benchmarking; final API breadth was justified by the shared migration helper cutover.

Applied Backend Architect, Frontend Developer and Code Reviewer definitions, together
with bounded-refactor, scope/continuity, consumer, domain-rules and UX-verification skills.
Delegation was bounded to Model policy, placement UI and the newly selected independent
canvas editor. Final integration/review stayed with the main agent. No commit, push or
next batch was started.
