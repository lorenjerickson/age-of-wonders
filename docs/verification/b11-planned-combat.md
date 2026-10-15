# B11 — Contested rolls and planned combat

Implemented and verified within the execution boundary below, 2026-10-14
(America/Los_Angeles). B07 changes remain uncommitted alongside this batch.

## Confirmed rules and boundaries

The user selected damage equal to `max(0, damage - resistance)`, critical hits at an
attack-over-defense margin of at least 10, and critical damage dice-count doubling.
Defenders win ties. Signed formula contributions bind to named captured actor,
equipment, Attribute, Skill and Condition sources. Sparse actors require explicit
health and roll setup; no default ability scores or armor ratings are fabricated.

Encounter owns ordered plan editing/submission, lock, checkpoint resolution, durable
conflicts, GM choices, pause/resume, reopening and publication. Instance owns atomic
application of final health/position; Session adapters enforce membership and revision
checks. Authoritative actor/equipment drift prevents stale round publication.
Private entropy and cursors preserve sampled outcomes across reload/retry.

Player projections omit other actors' plans, GM formulas, simulated outcomes,
adjudication reasoning, private history and hidden roster entries. Only owned plans,
named action choices, visible committed actors and released public history are shown.

Existing catalog content still needs explicit formulas, completion contracts and
concurrency assignments. Elevation, terrain and line-of-sight rules remain the
content decisions identified in the confirmed requirements. Unsupported turn-based
rules are diagnosed rather than silently reinterpreted as round-based rules.

## First-release execution boundary

- Resources explicitly distinguish per-round capacity resets from persistent consumables.
- Before reactions execute captured defense formulas. After/replace reactions pause for exact
  GM consequences and consume only the matched declared reservations.
- Unconscious actors can declare a configured death-save; the GM supplies its outcome without an
  invented save formula. Death/removal/controller loss discard outstanding plans, and resurrection
  does not reinstate them.
- Summons activate an already captured inactive actor. One explicitly declared same-round attack
  consumes the summoner's configured capacity; other summoned activity shapes wait for the next
  round. This does not create runtime actors or implement arbitrary nested activity trees.
- Authored concurrency contests explicitly identify the winner-first interpretation. Generic
  activity-specific concurrency bonuses, terrain, elevation and line of sight are content work.
- Reopening invalidates the whole current proposal; superseded history remains private. API audit
  additionally preserves discarded round snapshots and completed encounters when replaced.

## Verification record

- Domain regression checkpoint: **408 passed**. After final controller/reopen/projection changes,
  **22 focused tests passed** against freshly built common/domain output. Independent compatibility
  tests passed; signed dice, critical constants and numeric overflow are included in focused coverage.
- API: **13 targeted tests passed**; final TypeScript and affected-file ESLint passed.
- Web: **9 helper tests passed**; final TypeScript and affected-file ESLint passed.
- Browser at **1440px and 390px** passed explicit setup, all five formulas, resource-backed rules,
  death-save/summon configuration, player reaction privacy, plan reorder, stale-state retention,
  lock, custom HP/position/prone/presence outcomes, simulated-versus-committed state, publication,
  next round, pause/resume and GM unconscious correction. Desktop/mobile screenshots were inspected;
  controls retain 44px targets and no horizontal overflow was observed. Fixtures were cleaned up.
  Harness: `apps/web/scripts/b11-combat-smoke.mjs`.
- Web production build and all four prerendered routes passed after retrying with permission
  to open the local preview port. The initial sandbox-restricted attempt failed at prerendering.

API service tests use mocked Prisma transactions. Browser acceptance
uses the real React component and HTTP client against a disposable mocked transport;
it is not a live PostgreSQL acceptance claim. No live transactional race test has
been performed for this batch.

## Measurement

First explicit clock marker: 2026-10-15 03:32:20 UTC. The measurement ledger records
subprocess intervals; several initial agent builds, API tests/typechecks and lint
checks were not instrumented. Those runs must not be included in measured totals or
represented as a complete task-duration measurement. Manual fixture preparation,
review and documentation time are not independently instrumented.

Applied Backend Architect, Frontend Developer and Code Reviewer definitions with
bounded-refactor, domain-rules, scope/continuity, consumer and UX-verification skills.
Delegation covered the combat owner, Session/API integration and responsive UI;
main-agent work covered rule decisions, integration review, compatibility diagnostics,
independent dice acceptance and documentation. B12 remains deferred. Feat, Heritage
and Discipline remain permanently excluded. No commit or push was requested for B11.

The AI-facing domain guide was compared with `packages/common/src/types/combat.ts`,
`campaign-instance.ts`, `game.ts`, `session-table.ts` and the persisted mapping in
`apps/api/src/domain/domain-resource.ts`. It was updated for schema-version-2 Encounter,
activity/cost/reaction contracts, sparse incapacitation, publication and privacy.
The `encounters` archive resource still uses `identity.id`; active Session combat is
persisted in canonical Instance runtime. No database schema migration was needed.

Raw normalized intervals: [b11-timings.jsonl](b11-timings.jsonl).

| Category | Commands | Aggregate seconds | Explicit rerun flags |
| --- | ---: | ---: | ---: |
| browser | 8 | 86.84 | 7 |
| build | 11 | 65.33 | 5 |
| lint | 2 | 15.46 | 0 |
| tests | 8 | 14.90 | 3 |
| typecheck | 8 | 142.39 | 5 |

Measured command-seconds: **324.92**; union of overlapping intervals:
**258.78 seconds**. Agent wall-clock records were normalized without inventing
rerun flags; repeated labels/builds may exceed the explicit rerun count. Initial
unmeasured runs and manual work are excluded. The recorded active marker span is
03:32:20–03:54:34 UTC on October 15 (**22 minutes 14 seconds**); measured verification
occupied 19.4% of that span, with implementation continuing during some checks.
Discovery before the first marker, final documentation afterward, and approval-only
waiting were not independently measured. This is not account-usage attribution.

Reruns addressed changing cross-package declarations, exact reaction scoping,
controller/reopen state, fixture accessibility and mocked command handling, unsafe
TypeScript lint narrowing, a test's order-sensitive expectation, and the preview-port
sandbox restriction. The full domain suite was run once; only affected combat cases
were repeated after final changes. Browser evidence uses the final stable contracts.
