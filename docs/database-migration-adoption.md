# Database migration adoption

Age of Wonders now uses checked-in Prisma migrations for production startup. The first migration,
`20260824000000_initial`, describes tables that older development databases created with
`prisma db push`; the second adds campaign participation, invitations, and character drafts.

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

Do not mark `20260901000000_invitation_foundation` as applied unless its tables and indexes already
exist. Production startup intentionally fails instead of falling back to `db push` when migration
history is inconsistent.

The development Compose profile remains a local-only convenience. Its ports bind to loopback, and
its source-known credentials must never be reused for a remotely reachable deployment.
