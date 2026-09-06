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
