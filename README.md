# Age of Wonders

A Docker-first full-stack scaffold for building AI-enabled products.

## Stack

- NestJS API with validation and Swagger
- PostgreSQL 17 with Prisma
- S3-compatible object storage with MinIO
- React 19, React Compiler, Vite, and Tailwind CSS 4
- OpenAI Responses API with single-shot generation and a reusable multi-stage pipeline
- Docker Compose development environment with hot reload
- Node inspector, browser source maps, and exposed PostgreSQL for debugging

## Start the stack

Docker is the only local runtime requirement.

```bash
cp .env.example .env
# Add OPENAI_API_KEY to .env to enable generation.
docker compose up --build
```

Then open:

- Web app: http://localhost:5173
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs
- PostgreSQL: `localhost:5432`

The API runs `prisma db push` on development startup, so the initial database schema is created automatically.

## Domain API

The aggregate roots in `packages/common/src/types` are available through a
versioned JSON-document API at `/api/domain/:resource`:

```text
POST   /api/domain/:resource
GET    /api/domain/:resource?kind=&search=&limit=&offset=
GET    /api/domain/:resource/:id
PUT    /api/domain/:resource/:id
DELETE /api/domain/:resource/:id
```

Create and replace requests use `{ "data": { ... } }`. A replace may also send
`expectedRevision` to prevent lost updates. Supported resources are documented
in Swagger and include catalog definitions and metadata, systems and game
snapshots, campaigns, characters, creatures, items, objects, scenes, locations,
location connections, sessions, encounters, pending decisions, and game events. Since a
`GameState` has no separate ID, game snapshots use `campaign.identity.id`.

### Science-domain data migration

The science-and-technology refactor includes an idempotent, versioned data migration. Run it with
API writes stopped so graph replacement and optimistic record updates see stable source revisions.
The default command is a dry run and never writes:

```bash
pnpm --filter @aow/api domain:migrate:science
```

Review the human-readable `changes`, `failures`, and `exceptions` arrays in its JSON report. Apply
the same version only after resolving failures and backing up the database:

```bash
pnpm --filter @aow/api domain:migrate:science:apply
```

Both commands accept `--batch-size=100` (bounded to 1–500). Apply mode migrates only changed
aggregates, increments their revisions optimistically, and replaces their derived graph tuples. It
does not remove manually managed graph tuples. The command is rerunnable; a fully migrated database
reports zero changed records. Do not remove the compatibility reader until an apply run and its
exception review are complete in every environment. A clean follow-up dry run reports
`compatibilityRetirementReady: true`; this requires zero changed records, failures, and unresolved
exceptions.

### Science-domain archives

Export all persisted domain aggregates to a new versioned archive file:

```bash
pnpm --filter @aow/api domain:archive:export -- --output=/secure/backup/domain-archive.json
```

Export refuses to overwrite an existing file. It normalizes legacy aggregates in the archive but
does not alter the database. Review its human-readable exception report and secure the archive as a
database backup because aggregate identifiers and game content are necessarily present in the file.

Import is a merge operation: records absent from the archive are not deleted. The default command
is a non-mutating dry run:

```bash
pnpm --filter @aow/api domain:archive:import -- --input=/secure/backup/domain-archive.json
```

After reviewing `toCreate`, `toUpdate`, `failures`, and `exceptions`, stop API writes and apply:

```bash
pnpm --filter @aow/api domain:archive:import:apply -- --input=/secure/backup/domain-archive.json
```

Apply mode creates missing aggregates, optimistically replaces changed aggregates, and rebuilds
every imported graph projection—including unchanged records so reruns repair partial graph failures.
The operation is idempotent and reports failures using human-readable names rather than internal
identifiers.

### Complete host-transfer archives

Use the host-transfer archive to copy selected worlds, campaigns, and sessions to another host. An
empty selector exports all domain records. Selectors are comma-separated and may be combined:

```bash
pnpm --filter @aow/api transfer:export -- \
  --output=/secure/backup/host-transfer.aow.tar.gz \
  --worlds=world-one,world-two --campaigns=campaign-one --sessions=session-one
```

The command refuses to overwrite a file. The gzip-compressed tar contains full selected database
rows, referenced dependencies, all media metadata, every object currently in S3-compatible
storage with its folder structure and bytes, SHA-256 checksums, and the exact Prisma schema. Media
is intentionally not filtered, so plan disk capacity accordingly. Derived graph projections are
rebuilt on import rather than copied.

Import defaults to a non-mutating dry run. `ours` keeps destination conflicts, `theirs` replaces
them, and `both` creates remapped copies while updating references within the imported records:

```bash
pnpm --filter @aow/api transfer:import -- \
  --input=/secure/backup/host-transfer.aow.tar.gz --conflicts=ours

# Stop API writes before apply. --upgrade-schema uses the checksummed bundled
# declarative schema and supports an empty or older destination database.
pnpm --filter @aow/api transfer:import:apply -- \
  --input=/secure/backup/host-transfer.aow.tar.gz \
  --conflicts=both --upgrade-schema
```

Apply validates the complete artifact before writing, stages storage changes, commits database
rows in one transaction, and rebuilds graph projections. If a staged write or database transaction
fails, newly written objects are removed and overwritten objects are restored. Keep the source
archive until the destination has been verified.

## World concept graph

Domain writes automatically create LevelGraph tuples for resource metadata and
every `...Id`/`...Ids` reference in the aggregate. LevelGraph's hexastore keys
are stored in PostgreSQL's `GraphEntry` table, so graph and application data use
the same database instance and Docker volume—no separate LevelDB process or
filesystem is required.

```text
GET    /api/graph/tuples?subject=&predicate=&object=&limit=
POST   /api/graph/tuples
DELETE /api/graph/tuples
```

For example, a location containing `parentLocationId: "location:town"`
produces `{ subject: "location:inn", predicate: "aow:parentLocation", object:
"location:town" }`. The graph endpoints also support manually managed tuples.

## Media and file storage

Uploads are streamed to S3-compatible object storage with searchable metadata
kept in PostgreSQL. Local Docker development includes MinIO at
`http://localhost:9000`, with its console at `http://localhost:9001`.

```text
POST   /api/media?purpose=maps&tags=world-map,outdoors
GET    /api/media?mediaType=images&purpose=maps&tags=world-map&tagMode=all
GET    /api/media/:id
GET    /api/media/:id/download
DELETE /api/media/:id
```

`POST /api/media` accepts `multipart/form-data` with one `file` field. The MIME
type determines the top-level prefix, the required `purpose` query parameter
determines the second prefix, and the stored filename is a generated UUID. For
example, a PNG uploaded with `purpose=maps` is stored as
`images/maps/{uuid}.png`. Comma-separated or repeated `tags` query parameters
are normalized and can be filtered with `any` or `all` matching.

## Development and hot reload

The repository is bind-mounted into both application containers. Nest and Vite use polling so edits made on the host are detected reliably across Docker Desktop platforms.

Each container has isolated dependency and shared-package build volumes. The development supervisor
(`scripts/dev-container.mjs`) installs the locked dependencies and builds shared JavaScript and
TypeScript declarations before starting the app. It watches shared-package sources and configuration,
rebuilds them, and restarts the consuming app. Host builds cannot erase a running container's package
declarations. App source edits continue to use Nest watch or Vite hot reload. The web supervisor
waits for API health before starting, avoiding startup requests against an API still compiling.

Dependency manifest or lockfile changes trigger a fresh frozen-lockfile install. Prisma schema changes
regenerate the API client; database schema changes after startup still require an explicit migration
or `db:push`. Build/install failures stop the app and remain visible in its logs until an input is fixed.

```bash
docker compose logs -f api web
docker compose down
docker compose down -v # also removes the development database volume
```

Ordinary source and dependency edits refresh automatically. After changing Dockerfiles or Compose
configuration, rebuild and recreate the application containers (database and artwork volumes remain):

```bash
docker compose up -d --build api web
```

## Debugging

The API inspector listens on `localhost:9229`. The checked-in VS Code launch configuration provides:

- **API: Attach to Docker** — attaches to Nest inside its container.
- **Web: Debug in Chrome** — launches the Vite app with source maps.
- **Full stack: Docker** — starts both debugger configurations together after Compose is running.

Database queries can be inspected with any PostgreSQL client using the credentials in `.env`.

### Failure logs

Every failed API request emits a structured `service_failure` log entry with a request ID, method,
path, HTTP status, exception type, message, and stack for server errors. The request ID is also
returned in the `x-request-id` response header so a UI failure can be matched to the server log.
Request bodies and credentials are not logged.

Invalid structured AI output additionally emits an `invalid_ai_output` entry with the generation
kind, OpenAI response ID, output length, and a sanitized preview limited to 2,000 characters. View
these records during local development with `docker compose logs -f api`.

## OpenAI integration

`POST /api/ai/generate` performs a direct content-generation call. `POST /api/ai/pipelines/content` runs a composable outline → draft → editorial review pipeline. Generation records and OpenAI response IDs are saved to PostgreSQL.

High-quality image generation has a separate four-minute provider deadline; text generation keeps
its existing bounded deadlines. Image timeouts return HTTP 504 with a retryable editor message,
and automatic provider retries remain disabled to avoid duplicating paid image requests.

The OpenAI API key exists only in the API container. `OPENAI_MODEL` defaults to `gpt-5.6-terra` and can be changed in `.env` without rebuilding.

Example pipeline request:

```bash
curl -X POST http://localhost:3000/api/ai/pipelines/content \
  -H 'Content-Type: application/json' \
  -d '{"topic":"How agentic systems improve operations","audience":"product leaders"}'
```

Add new pipelines under `apps/api/src/ai/pipelines`. Keep tool implementations and privileged credentials in the API, then expose only validated DTOs through controllers.

## Useful commands

Commands can run inside the API container when you do not want Node installed locally:

```bash
docker compose exec api pnpm lint
docker compose exec api pnpm test
docker compose exec api pnpm build
docker compose exec api pnpm --filter @aow/api db:migrate
docker compose exec api pnpm --filter @aow/api domain:migrate:science
```

For production images, both Dockerfiles include a `production` target:

```bash
docker build -f apps/api/Dockerfile --target production -t aow-api .
docker build -f apps/web/Dockerfile --target production -t aow-web .
```
