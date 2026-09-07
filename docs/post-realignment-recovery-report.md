---
name: post-realignment-recovery-report
description: Evidence and rollback record for the 2026-09-07 legacy-content recovery and authoring repair
status: gate-2-review
date: 2026-09-07
plan: docs/post-realignment-recovery-and-authoring-repair-plan.md
---

# Post-realignment recovery report

## Outcome

The retained **Turn of the Century** corpus has been materialized additively into the current
World, Campaign Definition, Campaign Instance, and Session structures. **Age of Wonders** remains a
separate World lineage. The original legacy rows, AI-generation history, media records, and stored
objects remain in place; the recovery did not delete or overwrite them.

The repair also restores canonical manual and AI-assisted draft authoring for Locations, Creature
Definitions, and Item Definitions. AI generation returns an editable proposal and cannot change a
World draft until the GM explicitly applies it through the same optimistic-concurrency command as
manual authoring.

## Recovered inventory

| Recovered content                                    | Result |
| ---------------------------------------------------- | -----: |
| Locations, including the World root                  |     17 |
| Creature records                                     |     15 |
| Item Definitions                                     |     50 |
| Item instances retained in snapshot/runtime evidence |     30 |
| Campaign Definitions                                 |      1 |
| Campaign Instances                                   |      1 |
| Historical Sessions                                  |      1 |
| AI generation records retained unchanged             |     67 |
| Media records with matching stored objects           |    112 |

The recovered Campaign Definition is **The Darkness Within**. It includes a recovered root Plot,
six Discoveries, fourteen Claims, six Location contexts, and eighteen named placements. Its
Campaign Instance captures the applicable Campaign and World snapshots. **Session 1** is retained
as a concluded Session beneath that Instance.

## Conversion behavior

- A published recovered World revision and immutable snapshot were created, followed by an
  editable draft based on that snapshot.
- A recovered Campaign Definition revision and immutable snapshot were created, followed by an
  editable draft based on its captured World snapshot.
- A Campaign Instance snapshot and runtime record were created from the recovered Campaign
  Definition; the historical Session was rebound beneath that Instance.
- Nine deterministic legacy identity mappings were created for relationships required by current
  reads.
- Legacy Definition, Creature, Item-instance, generation, and media rows were retained unchanged.
- The materializer is idempotent: repeated rehearsal application produced no duplicate aggregate,
  snapshot, Session, or mapping rows.
- Legacy Creature and Item shapes remain available as recovery evidence. Item instances are not
  misrepresented in the Item Compendium, and a legacy Creature must pass through its explicit
  in-place upgrade command before canonical editing.

## Preservation and rollback

The final pre-conversion preservation set is stored under the ignored local directory
`.recovery/20260907Tfinal-gate1/`:

| Artifact                      | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| PostgreSQL custom-format dump | `cfa6c5c3a400bc9ad93710c421250fc4771cee9a8eee1a11774a9310841f10b6` |
| Complete MinIO data archive   | `ddc8b60e814745bbca81e4eab36251c9168873483df38bbd602b3bcd5c9c0d10` |

The object-store archive contains all 112 object payloads plus MinIO metadata. Earlier forensic and
repeat-rehearsal evidence remains under `.recovery/20260907T130215Z-wave1-2/`.

Rollback is a coordinated restore of both the PostgreSQL dump and the matching object-store
archive while application writers are stopped. The host-transfer archive is not a substitute for
this rollback because it cannot round-trip every new relational aggregate. Retain these backups and
the original legacy rows until the GM explicitly accepts the recovered result.

## Verification

- The conversion was rehearsed from the original backups in multiple disposable databases.
- Dry run, first apply, and repeat idempotent apply succeeded in the final rehearsal.
- A fresh authoritative backup was taken before the live operation.
- Live preflight and dry run reported no blockers; the additive live conversion succeeded.
- Post-conversion reads show both World lineages, the recovered Campaign Definition and Instance,
  the concluded Session, and unchanged legacy inventories.
- After restart, the API health endpoint reports a connected database and the web, API, database,
  and object-storage services are running.
- Common, API, web, and UI tests/checks are recorded in the Gate 2 review for the repair plan.

## Known limits

- The first restored AI slice is text proposal generation. Generated images, maps, tokens, weapon
  sets, and armor sets remain later media work.
- Paid-request idempotency is process-local. It prevents duplicate provider calls within the
  current single hosted process but does not yet coordinate across restarts or multiple replicas.
- The recovered legacy records are preserved faithfully; optional conversion of their richer
  noncanonical shapes into current canonical editing contracts remains explicit, per-record work.
