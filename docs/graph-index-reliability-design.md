# Graph Index Reliability and Reconciliation Design

**Status:** Proposed  
**Last updated:** 2026-08-23  
**Scope:** API graph persistence, domain-to-graph indexing, reconciliation, and operations

## Purpose

Age of Wonders already uses LevelGraph to maintain a concept graph. LevelGraph's six-way hexastore is persisted in PostgreSQL through a custom Prisma adapter; there is no separate LevelDB directory, graph server, or graph container.

This document records the work recommended to make that graph a reliable, observable, and reproducible projection of the application's domain records. It is intended as an implementation plan that can be resumed later, not as documentation of completed functionality.

## Current architecture

The implementation currently consists of:

- `GraphService`, which creates a LevelGraph database over `PostgresLevelAdapter` and exposes tuple query, insertion, deletion, and domain-resource replacement operations.
- `PostgresLevelAdapter`, which translates LevelGraph's ordered key/value operations into transactional Prisma operations against `GraphEntry`.
- `GraphEntry`, which stores LevelGraph's six index permutations for each logical triple in the same PostgreSQL database as application records.
- `tuplesForDomainResource`, which adds resource, kind, and name metadata and discovers references by recursively inspecting fields ending in `Id` or `Ids`.
- `DomainService` hooks that update graph tuples after domain records are created, replaced, or deleted.
- `/api/graph/tuples` endpoints for querying and directly managing triples.

A database audit on 2026-08-23 found 51 domain records, 51 corresponding `aow:resource` subjects, no missing resource subjects, and no orphaned resource subjects. The graph contained 379 logical triples represented by 2,274 hexastore rows. This confirms current record-level coverage, but it does not prove that every intended domain relationship is represented correctly.

## Problems to solve

### 1. Domain and graph writes are not atomic

`DomainService` first commits a `DomainRecord` mutation and then performs a separate graph mutation. If the second operation fails, the request fails but the domain record has already changed. Create, replace, and delete can therefore leave the graph inconsistent with the source record.

### 2. There is no rebuild or reconciliation path

No command currently regenerates graph tuples from all persisted domain records. Records created through direct Prisma access, imports, one-off scripts, or an interrupted request can remain unindexed indefinitely.

### 3. Relationship extraction is heuristic

The tuple generator assumes that references are represented by fields named `...Id` or `...Ids`. This convention is convenient, but it is not a complete semantic description of the domain model. It can miss references with different representations and may assign a misleading predicate when a field name does not describe the relationship precisely.

The current recursive identity handling also creates self-referential `aow:contains` triples for some aggregate roots. The audit found 39 such logical triples. These should be removed unless a specific domain relationship requires them.

### 4. Derived and manually authored triples are not distinguished

The graph API permits direct tuple insertion and deletion, while domain indexing writes into the same namespace. A destructive rebuild cannot safely tell which tuples should be regenerated and which manually authored assertions must be preserved.

### 5. Graph health is not observable

The health endpoint verifies PostgreSQL connectivity but does not perform a LevelGraph read, measure indexing lag, expose reconciliation results, or report failed graph work.

### 6. Test coverage is incomplete

Tuple generation has unit coverage, but the PostgreSQL adapter, complete domain mutation lifecycle, failure recovery, rebuild behavior, and drift detection need integration tests.

## Target architecture

Treat the domain record store as the source of truth and the LevelGraph data as a reproducible projection. Domain mutations and the intent to update that projection must be committed atomically. Graph projection itself may be eventually consistent for a short, observable interval.

The recommended flow is:

1. Validate and mutate the `DomainRecord` inside a Prisma transaction.
2. In the same transaction, insert an idempotent graph-index outbox job describing the affected resource and revision.
3. A worker claims pending jobs and reads the current domain record.
4. The worker deterministically generates the desired derived tuple set.
5. It replaces the previously derived tuple set, leaving manually authored tuples untouched.
6. On success, it records completion and indexing metadata. On failure, it records the error and retries with bounded backoff.
7. A reconciliation command periodically compares source records with their derived tuples and repairs drift through the same indexing code path.

This design favors an outbox over attempting one transaction across `DomainRecord` and LevelGraph calls. LevelGraph generates multiple adapter operations asynchronously, and coupling those operations to a caller-owned Prisma transaction would add substantial complexity without addressing retries or writes that bypass `DomainService`.

## Proposed data model

The exact names can be adjusted during implementation, but the persistence layer needs the following concepts.

### Graph index job

Store one durable unit of projection work with:

- Stable job identifier.
- Domain resource and resource identifier.
- Requested domain revision, or an explicit tombstone for deletion.
- State: `pending`, `processing`, `completed`, or `failed`.
- Attempt count and next-attempt timestamp.
- Creation, claim, completion, and update timestamps.
- Sanitized last-error category and message.
- An idempotency key unique to resource, identifier, revision, and operation.

The domain mutation and job insertion must share one Prisma transaction. The worker must tolerate duplicate delivery and jobs arriving out of order. When processing an old revision, it should index the latest committed state or safely mark the job superseded.

### Derived tuple ownership

Derived tuples need provenance. Viable approaches are:

1. Add a separate ownership table keyed by the canonical logical triple plus source resource and source revision.
2. Store derived and manual graphs in separate LevelGraph stores/tables.
3. Encode a provenance namespace into storage outside the logical subject/predicate/object values.

The preferred approach is a separate ownership table. It preserves ordinary LevelGraph query behavior, supports more than one source asserting the same logical triple, and permits removal of only the assertions previously derived from a particular resource. A physical LevelGraph triple should be removed only when no derived or manual owner remains.

### Projection status

Record enough per-resource status to answer:

- Which domain revision is currently indexed?
- When was it indexed?
- How many derived logical triples were produced?
- What generator/schema version produced them?
- Did the last attempt fail?

A generator version is essential because changing tuple semantics should cause affected records to be reindexed even when their domain revision has not changed.

## Work plan

### Phase 1: Correctness baseline

1. Fix root identity traversal so an aggregate does not automatically contain itself.
2. Add regression tests for root identities, nested identities, `...Id`, `...Ids`, duplicate references, and empty identifiers.
3. Define and document canonical predicate naming and escaping rules.
4. Inventory domain references in `packages/common/src/types` and compare them with generated tuples.
5. Identify relationships that cannot be expressed accurately through the suffix convention.
6. Decide whether those relationships will use an explicit relationship registry, field decorators/metadata, or resource-specific tuple projectors.

Acceptance criteria:

- No unintended self-`contains` triples are generated.
- Every known persisted relationship is either deliberately indexed or explicitly documented as excluded.
- Tuple output is deterministic for identical domain input.

### Phase 2: Reindex and audit tooling

Implement an API-owned CLI command with dry-run, audit, and repair modes. It should:

1. Read `DomainRecord` rows in stable, bounded pages.
2. Generate the expected derived logical triples for each record.
3. Compare expected tuples with tuples currently owned by that record.
4. Report missing, stale, orphaned, and malformed tuples.
5. In repair mode, add missing tuples and remove only stale derived tuples.
6. Detect graph subjects whose source domain record no longer exists.
7. Emit machine-readable totals and a non-zero exit code for unresolved drift.
8. Support filtering by resource type, record identifier, and generator version.
9. Use bounded batches and resumable checkpoints so it is safe for large worlds.

Do not implement repair as an unconditional `GraphEntry` table truncation. That would erase manually authored tuples and makes interrupted rebuilds risky. If a full rebuild is later required, build into a shadow store and switch only after validation.

Acceptance criteria:

- Dry-run makes no database changes.
- Running repair twice produces no changes on the second run.
- Interrupting and restarting repair is safe.
- The command verifies one canonical `aow:resource` assertion per existing domain record and reports zero orphaned derived subjects.
- Logical triple counts are reported separately from LevelGraph's six physical index rows.

### Phase 3: Transactional outbox and worker

1. Add the graph-index job schema and migration.
2. Refactor domain create, replace, and delete operations so the record mutation and job insertion share a transaction.
3. Build a worker with safe row claiming, bounded concurrency, retry backoff, and graceful shutdown.
4. Make projection idempotent and revision-aware.
5. Add terminal failure handling and an operator-controlled retry mechanism.
6. Route imports and bulk domain writes through the same transactional service or explicitly enqueue their affected records.
7. Decide whether graph queries may return slightly stale data and document that consistency contract.

Acceptance criteria:

- A simulated graph failure cannot lose the intent to index a committed domain mutation.
- Retrying a job never duplicates logical triples.
- A create followed rapidly by multiple updates converges on the newest revision.
- A deletion removes only tuples derived from the deleted record and preserves unrelated/manual assertions.

### Phase 4: Provenance and graph API safety

1. Implement tuple ownership/provenance.
2. Mark direct API writes as manual assertions with actor and timestamp metadata where appropriate.
3. Require graph deletion to target manual assertions or an explicitly authorized ownership scope.
4. Prevent callers from deleting domain-derived assertions accidentally.
5. Add authorization appropriate to graph inspection and mutation; graph mutation should not be a generally available client capability.
6. Add pagination or cursors instead of relying on the current bounded tuple query limit for administrative work.

Acceptance criteria:

- Reindexing cannot remove manual assertions.
- Direct graph operations cannot silently corrupt derived projection state.
- Administrative queries can traverse more than one response page deterministically.

### Phase 5: Health, metrics, and logging

1. Extend health checks with a lightweight LevelGraph write-independent query.
2. Expose pending-job count, oldest pending age, retry count, terminal failures, last successful reconciliation, and detected drift.
3. Add structured logs for job creation, processing failure, retry, completion, and reconciliation repair.
4. Avoid logging complete domain aggregates or sensitive generated content.
5. Establish thresholds for degraded and unhealthy states.
6. Add an operator runbook covering audit, repair, job retry, and recovery from adapter/database failures.

Acceptance criteria:

- Operators can distinguish database unavailability, adapter/query failure, processing backlog, and data drift.
- Every failed projection can be traced to its resource, revision, and request/job context without exposing user-facing GUIDs in the application UI.

### Phase 6: Integration and failure testing

Add automated coverage for:

- LevelGraph put, get, delete, and batch replacement through PostgreSQL.
- All six physical indexes representing one logical triple.
- Domain create, replace, and delete projection lifecycle.
- Transaction rollback before outbox creation.
- Failure after the domain transaction but before graph application.
- Duplicate and out-of-order jobs.
- Worker restart while a job is claimed.
- Reindex dry-run and repair idempotency.
- Preservation of manually authored assertions.
- Generator-version upgrades.
- Concurrent updates to the same domain resource.

Tests should use a real PostgreSQL instance for adapter and transaction behavior. Mock-based unit tests remain useful for tuple projection rules but cannot validate the reliability guarantees in this design.

## Existing-content indexing procedure

Once Phases 1 through 3 are implemented, index existing content as follows:

1. Back up the PostgreSQL database.
2. Deploy the corrected tuple generator, ownership schema, outbox, and worker without deleting existing graph data.
3. Run the audit command in dry-run mode and retain its machine-readable report.
4. Review unexpected predicate changes and classify existing non-derived tuples as manual where necessary.
5. Run repair in bounded batches, recording generator version and projection revision for every source record.
6. Wait for queued jobs to drain.
7. Run the audit again and require zero missing, stale, orphaned, or malformed derived tuples.
8. Compare representative graph queries before and after repair.
9. Enable drift monitoring and schedule periodic reconciliation.

Because the 2026-08-23 audit found complete `aow:resource` coverage, this migration is primarily about relationship correctness, provenance, and recoverability rather than populating an empty graph.

## Deployment and rollback

Deploy additively:

1. Add new tables and nullable status fields.
2. Deploy code that writes outbox jobs while retaining current synchronous graph updates if a short transition period is needed.
3. Start the worker and verify it in shadow/audit mode.
4. Backfill ownership and projection status.
5. Switch graph maintenance to the worker.
6. Remove synchronous maintenance only after lag and drift remain at zero.

Rollback should disable the worker without discarding pending jobs. Domain writes can continue because their projection intent remains durable. Avoid schema rollback while unprocessed jobs or ownership records exist.

## Security and operational constraints

- Treat graph mutation endpoints as privileged administrative operations.
- Validate tuple lengths and allowed namespaces to prevent unbounded or hostile keys.
- Bound worker concurrency and batch sizes to protect the primary database.
- Use database locking or leases so multiple workers cannot apply the same job concurrently.
- Do not expose internal record identifiers to the GM except where identifiers are required in URLs.
- Ensure error logs contain identifiers only for operational correlation and never render them in GM-facing messages.

## Open decisions

Before implementation, resolve:

1. Whether manually authored tuples are a supported product feature or should be removed from the public API.
2. Whether graph reads are permitted to be eventually consistent and, if so, the acceptable lag target.
3. Whether relationship definitions belong in a centralized registry or in resource-specific projectors near the domain types.
4. How long completed and failed outbox jobs should be retained.
5. Whether reconciliation runs on a schedule, deployment, operator command, or some combination.
6. Whether a graph schema/generator version is global or tracked independently per resource family.

## Definition of done

This initiative is complete when:

- Every committed domain mutation durably records graph projection intent.
- Projection processing is idempotent, retryable, and revision-aware.
- Existing content can be audited and repaired without erasing manual assertions.
- Known domain relationships are explicitly and deterministically projected.
- Graph drift, backlog, and failures are visible through health signals and structured logs.
- Recovery and reindex procedures are documented and tested.
- Integration tests demonstrate convergence after partial failure and concurrent updates.

