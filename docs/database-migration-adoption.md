# Database migration adoption

Age of Wonders uses checked-in Prisma migrations for production startup. The baseline migration,
`20260824000000_initial`, describes tables that older development databases created with
`prisma db push`; subsequent migrations establish the Definition/Instance, participation, Session,
identity, system-boundary, and Instance-native Character-sheet spines.

## Fresh database

Run `pnpm --filter @aow/api db:deploy`, or start the production API container. Prisma applies both
migrations before the API starts.

## Existing database created with `db push`

Back up the database first. Confirm that the existing `Generation`, `DomainRecord`, `GraphEntry`, and
`MediaAsset` tables match `apps/api/prisma/migrations/20260824000000_initial/migration.sql`. Then mark
only that baseline as already applied:

```sh
pnpm --filter @aow/api exec prisma migrate resolve --applied 20260824000000_initial
pnpm --filter @aow/api db:deploy
```

Do not mark any later migration as applied unless its tables, columns, constraints, and indexes
already exist. `20260911000000_instance_character_sheets` archives legacy Campaign-scoped draft
rows in place and creates the constrained Instance-bound draft table; it never guesses an Instance
mapping for old data. Production startup intentionally fails instead of falling back to `db push`
when migration history is inconsistent.

`20260912000000_character_completion_review` adds submission/review provenance and creates an
`in-progress` Instance draft for any existing Character association that predates the authoritative
completion gate. Legacy materialized fields may prefill that draft, but the migration never marks
it reviewed or approved; the current captured schema must validate it through the normal workflow.

The development Compose profile remains a local-only convenience. Its ports bind to loopback, and
its source-known credentials must never be reused for a remotely reachable deployment.


## Isometric terrain authoring

`20260917000000_isometric_terrain_drafts` adds only `WorldTerrainUpload` (draft-scoped,
content-addressed staging) and `WorldTerrainSave` (idempotency receipts). Both reference the existing
World draft and cascade when that draft is deleted. Committed chunk content is stored in the
self-contained World snapshot, not in these staging tables. Abandoned uploads expire during later
upload requests after 24 hours; committed uploads are removed by the successful save transaction.
Apply this migration through the normal deployment flow on baselined installations. An existing
local database maintained with `db push` must not run the full unbaselined migration chain merely
to enable terrain authoring; the new table DDL is additive, and baseline adoption remains the
separate process described above.


## Isometric exploration memory

`20260918000000_terrain_exploration` adds `CampaignTerrainExploration` without altering existing rows.
Its composite key isolates an observer's latest last-known geometry by Instance, adopted snapshot,
and Location. Foreign keys prevent cross-Instance snapshot references; check constraints bind JSON
context to row columns. Existing Worlds gain no exploration implicitly. Apply with `db:deploy` on
baselined installations. For an unbaselined local `db push` database, use only this additive DDL after
checking that the table is absent; do not run or mark the entire migration chain as adopted.

Run `test:terrain-exploration:postgres` with `TERRAIN_EXPLORATION_TEST_DATABASE_URL` pointing to a
separate migrated database whose name contains `test`, `verify`, or `disposable`. The test creates
isolated fixture lineages; it must never target a live database. Full database backups include this
table. Existing domain-record/media transfer archives do not represent Instance runtime or its
exploration and must not be described as an exploration backup. Migration retains old-snapshot rows and starts empty memory in the new snapshot. Restore now uses
checkpoint-specific recovery as described below.


## Exploration checkpoint recovery

`20260919000000_exploration_checkpoints` adds nullable `explorationHash`/`explorationCount` to immutable
runtime checkpoints and creates `CampaignCheckpointExploration` with same-Instance checkpoint/snapshot
foreign keys and an UPDATE/DELETE rejection trigger. The migration defines its own immutability
function and protects checkpoint exploration metadata from updates, including on older local
db-push databases. New checkpoints include their exploration seal
on initial insertion. Existing checkpoint metadata stays null: there is deliberately no backfill from
mutable latest-memory rows. A recorded zero count is distinct from legacy unrecorded exploration.

Use `db:deploy` on a baselined installation. For an unbaselined local `db push` database, verify the
columns and child table are absent, then apply only the additive checked-in DDL atomically. Keep
checkpoint tables and their child rows together in database backups; missing recorded entries cause
restore to fail closed. The existing predecessor Restore action recovers the departure checkpoint,
not an arbitrary timestamp or latest snapshot cache. A legacy checkpoint restores empty exploration
with an explicit preview notice. No gameplay rules runtime is needed for capture or recovery.

## Reviewed Session movement

`20260920000000_session_movement_proposals` adds `CampaignSessionMovementProposal` with
same-Instance Session/snapshot foreign keys, bounded status values, and per-Session request-key
uniqueness. It does not move actors or grant rules/resources to existing Worlds. Apply with
`db:deploy` on baselined installations. For a local unbaselined `db push` database, back up first,
verify that the proposal table is absent, and apply only this checked-in additive DDL in one
transaction. Do not mark unrelated migrations as applied.

After schema deployment, explicitly adopt starter rules or author mechanics in World → Rules,
validate and publish the World draft, migrate the Campaign Definition to that World capture, and
preview/apply the Campaign Instance migration while no Session is active. Existing unpublished
content must pass publication validation; enabling movement does not bypass that gate. Rule
adoption changes neither actor positions nor Session lifecycle. Keep the proposal table with
Instance runtime and Session journal records in full database backups.

Recovered Instances whose only runtime field is `legacyGamePayload: null` require a separate,
explicit initialization before migration. `initializeEmptyLegacyInstanceRuntime` is a guarded pure
helper, not an automatic read-time repair: callers must verify ownership, unchanged snapshot/revision,
no active Session or related Character/Agent state, preserve a source checkpoint, and write the
runtime plus audit atomically. It rejects non-null legacy payloads and additional runtime/extension
state. Nonempty legacy games require an explicit conversion plan; the helper must never reset them.
