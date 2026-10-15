# B08 — actors, Characters and equipment

Status: completed 2026-10-13 (America/Los_Angeles); verification recorded below. User-selected batch;
Feat, Heritage and Discipline are permanently excluded. Capacity decision: explicit
per Item/quality/rarity rows, with exact rarity match before authored quality-only
fallback and no default game-wide capacity table.

## Delivered ownership and consumers

| Boundary | Implemented behavior and consumers | Evidence |
| --- | --- | --- |
| DM-09 runtime actors/Items | Creature owns sparse captured overlays, factory/cardinality, placement, rule fields and named resources. Item owns runtime payload/quantity. Actual Instance realization, placement and movement adapters delegate. Imported/private fields remain intact. | Runtime actor, movement-state, actor-position and movement-service tests |
| DOM-01 Character specialization | Character extends Creature and uses shared placement/rule behavior with single-instance constraints and an approved-sheet binding/realization port. Existing common CharacterState already extends CreatureState. | Runtime owner inheritance, cardinality, binding and state$ tests |
| DM-10 Character lifecycle | CharacterCreation owns captured selection, roll allocation, equipment fit, review/edit/import/activation policy. API retains entropy, authorization, media checks, persistence and transactions. First activation consumes approval revision atomically; reactivation preserves the entire existing sheet. | Domain and API lifecycle tests; three actual PostgreSQL tests |
| DM-11 acquisitions | GrantedModifier captures source/recipe/event/entropy once, supports active/removal/additive contributions, and preserves matching imported rolls. Explicit captured Background/Skill and Profession creation expertise grants are consumed by activation. | Actor/grant tests and lifecycle import/activation DB test |
| DM-11 effects/conditions | ActiveEffect owns explicit same-unit elapsed/event expiry; Creature owns apply/remove/advance and unions intrinsic and independent effect conditions. Existing rule projection consumes effective conditions. | Duration, idempotency, conditions and serialization tests |
| EQ-01 equipment | ActorEquipment owns exact compatible slot sets, occupancy, containment, quality/rarity capacity, Belt acceptance, quantity and retrieval costs. Pack retrieval requires one explicitly available bonus action; equipped Belt retrieval costs none. No allowance/reset is invented. Existing optional inventory membership stays synchronized. | Domain invariants, API protection/CAS, four PostgreSQL tests, responsive fixture and real browser journey |
| Authoring and UI | Canonical Item editor authors storage and rarity with explicit removals/preservation. Embodiment Equipment disclosure uses named captured Items/slots, revision-pinned commands and server readback. | Item authoring tests, real placements route at 1440 and 390 px |

## Preservation and operating boundaries

- No fabricated complete CreatureState replaces sparse overlays. Existing World and
  Instance capture identity remains authoritative; equipment writes reject stale
  runtime/capture/status and commit Items, actor slots and action cost together.
- Imported Character source data is retained privately in additive draft `sourceSheet`
  storage, then flattened into the reviewed sheet without recursive sourceSheet data.
  Apply migration `20261014000000_character_import_source_sheet` before using this on
  an existing database. Verification applied it only to the disposable database.
- B10 retains actual approved-Character activation → Instance embodiment/starting
  physical Item integration, membership/session participation and orchestration.
  B08 exposes the owner ports; it does not claim automatic realization is complete.
- Wrists are accepted as an authored captured equipment-slot Model key. Existing
  immutable core release v1 lacks a seeded Wrists option and is not rewritten or
  automatically readopted; use existing Model authoring for that slot. An attempted
  seed edit was reverted after the restart check rejected its changed release hash.
- Effect scheduling, implicit turn/time conversions and a new combat interpreter are
  not added. B11 combat redesign remains deferred. No mechanics are invented for
  unspecified proficiency acquisition or special effect descriptions.
- AI-facing guide compared against common Item/storage, sparse actor, Character and
  participation types and updated. Persisted domain resource mapping is unchanged.

## Verification

- Domain suite: **326 passed**; web suite: **1,114 passed**.
- API suite: **899 passed**, 40 optional tests skipped in default environment.
  Equipment and lifecycle PostgreSQL suites were separately enabled: **7 passed**.
- Final domain contract typecheck, API typecheck, targeted API/web lint and UI
  primitive boundary checks passed. Final equipment/Model bootstrap API regressions
  passed (6); movement/placement regressions passed (9).
- Production web bundle, prerender and typecheck passed; initial sandbox invocation
  could not bind prerender port 3103, then passed with local-server permission.
- Real authenticated API/database browser journey: **7 checks passed**, no page errors
  or failed HTTP requests. Pack retrieve/equip consumed one action; hard reload
  preserved state; mobile equipped-Belt stow/retrieve consumed zero actions. Both
  widths passed overflow and internal-label checks. The component fixture additionally
  verified recoverable server conflict and retry.
- Real database tests cover competing runtime writes, frozen/foreign scope, capture
  races, atomic rejection, source/private/grant preservation and inactive reactivation.
  Tests use a freshly migrated disposable PostgreSQL database, not development data.
- Definitions used: Backend Architect, Frontend Developer and Code Reviewer, with
  independent implementation/review assignments. Review repaired canonical Creature
  slot resolution and existing inventory index synchronization.

Evidence scripts: `scripts/b08-equipment-acceptance.mjs`,
`apps/web/scripts/equipment-b08-smoke.mjs`, and the focused domain/API tests.
Screenshots and measured receipts are adjacent to this report. Manual fixture setup,
review and debugging were not separately instrumented; command durations are not
presented as total engineering effort. Implementation continued during parallel checks.

## Cleanup and measurements

The disposable database `aow_b08_disposable_20261014`, isolated API/web processes,
temporary browser auth and Vite config/cache were removed. No media uploads or
live development database changes were made. The final browser rerun after captured
slot corrections passed all seven checks again.

Active session: 05:00:36–05:27:24 UTC, **26.80 minutes**. Verification aggregate:
**526.09 command-seconds**; union of overlapping intervals: **400.32 seconds**,
**24.89%** of active wall time. Parallel implementation continued; this share is
not a blocked-wait percentage.

| Category | Command seconds | Commands | Marked reruns | Failed attempts |
| --- | ---: | ---: | ---: | ---: |
| build | 67.935 | 9 | 4 | 2 |
| tests | 240.283 | 30 | 15 | 11 |
| typecheck | 83.476 | 6 | 2 | 3 |
| lint | 71.002 | 15 | 6 | 6 |
| browser | 63.394 | 5 | 3 | 2 |

Reruns repaired integration typing/stale bundles, test fixture cloning/role values,
assertion contracts, lint errors, a guessed test filename, browser harness setup and
the prerender sandbox bind. Final review added canonical captured slot/inventory
regressions and repeated affected DB/browser checks. One crossed-message domain
build duplicated work. Failed attempts remain in the raw log. Server startup's
immutable-seed rejection was manually diagnosed and reverted; its duration is part
of active wall time but not a separately measured command.

[Raw timings](b08-timings.jsonl), [measurement](b08-measurement.json),
[browser receipt](b08-browser-receipt.json), [desktop](b08-equipment-desktop.png),
[mobile](b08-equipment-mobile.png).
