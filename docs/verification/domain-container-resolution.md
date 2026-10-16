# Domain package resolution in containers

2026-10-15. User reported Vite failing to resolve `@aow/domain` from
`locationWorkspaceModel.ts`. Reproduced the exact module URL inside the running web
container: HTTP 500 with “Failed to resolve import”.

The package symlink existed, but Domain was missing from the development supervisor's
shared-package build/watch list and manifest fingerprint. Unlike Common/UI, Domain's
output and dependencies were host bind-mounted. Host build success therefore did not
establish a usable container module. Both Dockerfiles also omitted Domain from the
manifest-only installation layer, and API production omitted the package copy.

Changes:

- Build/watch Common → Domain for API; Common → Domain → UI for web.
- Include Domain's manifest in dependency fingerprints and both image install layers.
- Isolate Domain dependencies/output in each app's Compose volumes.
- Include Domain in API production's copied workspace packages.
- Exclude ignored local recovery backups from Docker image contexts.

Verification: both development images rebuilt and containers recreated successfully.
The exact `/src/locationWorkspaceModel.ts` request and `/src/AstraCodex.tsx` now return
HTTP 200 without import failures. Web `/healthz` returns 200; API loads WorldDefinition
from `@aow/domain` and `/api/health` reports 200/database connected. The authenticated
browser renders the World list and all six migrated Character cards with artwork,
with no console errors. Script syntax and diff checks
pass. The global scaffold skill now records this verified regression lesson.
Host package checks from the preceding task remain valid; no host startup configuration
changed. Production package-copy paths were reviewed, but production image runtime was
not exercised. No application/domain semantics or stored data changed for this repair.
Backend Architect performed a bounded configuration review.
