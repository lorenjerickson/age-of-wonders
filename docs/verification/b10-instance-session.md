# B10 — Instance, Session and existing execution

Delivered 2026-10-14 (America/Los_Angeles). B10 closes the selected existing-runtime
integration and operational journeys. B07, B11 and B12 remain deferred; Feat,
Heritage and Discipline remain permanently excluded.

## Delivered behavior

- CampaignInstance owns captured-pair initialization, preparation, Plot/objective
  progress, Discovery knowledge, stable placement realization and presentation
  overrides. Updating one objective preserves its siblings and private extensions.
  Removing/defering a placement detaches it without destroying its runtime actor/Items.
- Approved Character activation composes Character and equipment owners, then commits
  embodiment, physical starting Items, approved revision and status atomically under
  the existing transaction, active-Session guard and runtime/capture compare-and-swap.
  Reactivation preserves existing runtime and avoids rerolling or duplicating Items.
- CampaignSession owns lifecycle, readiness and presence policy; InstanceParticipation
  owns human/Agent transitions. Adapters retain authorization, locks, persistence,
  tokens, clocks and audit. Edited Agent capabilities require reauthorization and
  compare against both prior grants and status.
- Existing WorldRule evaluation, actor placement/movement and exploration updates use
  domain owners and commands. Pure geometry remains external. Existing replay,
  privacy, event-ordering and capture boundaries remain intact.
- Instance collections lead to named Plot, placement, actor, Item, member, invitation,
  Agent and Session destinations. Plot detail supports objective status/notes and
  Discovery knowledge. Individual Items retain existing equipment/quantity controls.
- The Session table supports scoped weather overrides, clear/reset to captured defaults
  and manual GM media controls. Media has no autoplay or participant broadcast.

## Verification

| Gate | Result |
| --- | --- |
| Domain suite | 375 passed; new WorldRule contract cases subsequently passed (2). Focused Instance/Session/participation cases also passed after final changes. |
| Web suite | 76 files, 1,122 tests passed. |
| API broad run | 134 suites passed, 918 tests passed, 43 environment-dependent tests skipped; one exploration suite failed to load because its describe callback was accidentally async. |
| API repair/final checks | Corrected the exploration harness; affected rerun passed 61 tests with 6 skipped. Final five affected suites passed all 25 tests after actor-placement and presentation changes. The broad run was not repeated. |
| Compilation | Common/domain builds, API and web typechecks, final web production build and four prerendered pages passed. |
| Static checks | Affected API/web lint passed after removing unnecessary assertions and unused bindings; diff whitespace check passed. |
| Browser journeys | Playwright passed at 1440px and 390px: collection/detail navigation, objective note/status save and reload with sibling retention, knowledge, member/Agent detail, capability editing, Session planning/Cancel, weather save, Item quantity save, media volume/no autoplay and JSON request headers. No horizontal overflow or visible opaque identifiers in checked views. |

Browser checks use a mocked API transport; they verify controls, requests and reload
behavior, not a live PostgreSQL transaction. No new live-database acceptance was run
for B10. The skipped environment-dependent tests remain a verification limitation.
API tests cover authorization/state guards, stale-write rejection and audit behavior.
The final mobile Plot screenshot was visually inspected. Temporary fixture files and
browser/server resources were cleaned up; no user database records were created.

The AI-facing guide at `apps/api/src/ai/prompts/domain-model.md` was updated and
compared with affected common types and `apps/api/src/domain/domain-resource.ts`.
New runtime weather/operational projections are documented; persisted DomainRecord
resource mappings did not change for B10.

## Retained boundaries

Instance owns runtime; no competing runtime World or new party/Clock root was added.
Existing legacy value contracts remain preserved. Combat/rest/downtime algorithms
absent from production were not invented. B11 owns combat redesign and B12 owns
universal writer/compatibility retirement and final migration acceptance. UX-08's
new proficiency/profession screens remain an unselected decision; existing Character
review/import/selections/equipment integrate through B08/B10. Automatic visibility
sharing and media broadcasting remain outside this delivery.

## Measurement and workflow

Raw command intervals: [b10-timings.jsonl](b10-timings.jsonl).

| Category | Commands | Aggregate seconds | Marked reruns |
| --- | ---: | ---: | ---: |
| Build | 12 | 101.81 | 1 |
| Tests | 16 | 110.17 | 7 |
| Typecheck | 3 | 41.52 | 0 |
| Lint | 5 | 28.08 | 2 |
| Browser | 5 | 50.79 | 3 |

Total measured command time: **332.37 seconds**. Union of overlapping verification
intervals: **265.00 seconds**. These are command timings, not total task duration or
usage attribution. The log spans 02:32:05–02:59:35 UTC on October 15; handoff evidence
was finalized around 03:03 UTC. The earlier audit and resumed work did not have a
reliable contiguous active-session marker. Active wall time, verification share,
manual preparation/review and blocked-wait time therefore cannot be reconstructed
honestly; these are instrumentation gaps.

Reruns followed concrete fixes: JSON-cloned domain context lost Maps/Sets/functions;
activation fixtures and API expectations needed the new captured-runtime contract;
an async test-suite callback was invalid; a WorldRule fixture lacked formatVersion;
lint found unused bindings/assertions; browser selectors exposed missing accessible
labels, and a request-header assertion initially included bodyless POSTs. Review also
caught missing JSON headers on the two new API clients; the final browser and build
runs verify that repair. Some incremental/extended checks were not marked as reruns,
so 13 is the recorded rerun count, not a count of all repeated coverage.

Reused completed audits and one bounded existing Session/participation subagent.
Applied Backend Architect, Frontend Developer and Code Reviewer definitions, with
bounded-refactor, scope/continuity, consumer, domain-rules and UX-verification guidance.
No additional broad review cycle, commit, push or next batch was started.
