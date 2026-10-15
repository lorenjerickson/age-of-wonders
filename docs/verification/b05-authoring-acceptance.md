# B05 — authoring integration and acceptance

B05 closes the selected B01–05 authoring milestone: AU-25, QA-01–04, DM-04's
active authored consumers, and the authoring portion of DM-02. The finite
[field matrix](b05-authoring-coverage.md) classifies supported fields as editable,
preserved-only or excluded. Feat, Heritage and Discipline (AU-19–21) are permanently removed from scope
by the subsequent user decision. B06–12, runtime execution and broader domain
migration remain deferred, excluding those concepts.

## Integration repairs

- The actual World parent router redirected dedicated editor paths into query
  views. Canonical authoring routes now stay reachable through direct entry,
  navigation and reload, within the existing responsive frame. A compact
  Authoring libraries disclosure links existing destinations.
- Supported root entries expose reference-aware, revision-pinned removal and
  explicit Cancel. API catalog removal verifies exact kind, authorization,
  root/reference constraints and the captured draft revision.
- Location discovery saves now use the dedicated Location endpoint. The generic
  draft endpoint correctly rejects protected Location rewrites; component fixtures
  previously concealed this integration error. The fixture now enforces that rule.
- Trait modifier edits reject malformed containers instead of rebuilding them.
  Nested Item saves preserve omitted descriptions and reject malformed required
  overview fields instead of coercing them. Clearing final equipment slots is
  rejected if doing so would discard custom equippable fields; the common
  nonempty-slot contract is unchanged.
- Display masking is separate from persisted values. Imported internal identifiers
  use neutral labels and explicit replacement controls; unrelated edits retain raw
  values. Canonical and primary Astra Item/Creature/Location surfaces share this
  boundary.
- Active browser policies delegate to World membership/hierarchy, Location map,
  Discovery claim and Plot hierarchy/association/removal projections. Legacy
  parent shapes are normalized only in read-only owner inputs; returned records
  retain their original payload and identity. Runtime Character selection and
  inactive legacy merge utilities are excluded, as detailed in the field matrix.

## Validation boundary

| Path | Malformed known supplied fields | Incomplete and imported data |
| --- | --- | --- |
| Owner hydration | Retained with structural diagnostics | Payload/extensions retained; no metadata injection |
| Current World draft save / dedicated upsert / applied AI proposal | New or changed malformed built-in structures rejected through owner validity | Sparse drafts accepted; unchanged inherited top-level mechanics can remain only against the same record kind |
| Exact World validation/publication | Structural checks recomputed, including nested Action/Trait/Item and character-option fields; no inherited exemption | Existing canonical membership, Model conformance and Condition policy retained; no blanket all-fields-required rule |
| Vehicle component references | Any captured declared Definition kind is allowed by common `DefinitionId[]` | Unresolved during draft, blocking during publication; no Item-only restriction or auto-creation |
| Compatibility adapters | Internal legacy Codex/service/generator/import paths retain their documented boundary | No current authoring HTTP bypass; remaining migration is B12 |

Custom/open extensions remain accepted. Structural validation does not execute
expressions, choices, costs, grants or effects. The AI-facing
[domain guide](../../apps/api/src/ai/prompts/domain-model.md) was compared with
common types and updated for these boundaries and owner projections. No common
persisted contract or resource mapping changed.

## Verification

- Full web suite: 1,109 tests passed before the last bounded owner/display repairs;
  affected tests were rerun after those repairs (final results below).
- Full API suite: 892 passed, 34 optional database tests skipped. Separate real
  PostgreSQL acceptance below covers representative authenticated persistence.
  Final affected policy/controller/service suites: 110 passed.
- Full domain suite: 298 passed, including build/declaration compilation. Domain
  source and type-contract checks passed.
- API typecheck passed. Production web bundling and prerender completed; the first
  compiler pass found narrowing errors, now repaired. One subsequent compiler run
  overlapped a temporary browser fixture's cleanup; final compilation is run after
  fixture cleanup.
- Focused preservation tests: 183 passed; Trait modifier desktop/mobile fixture
  covers malformed null/scalar/array containers, exact private/sibling preservation,
  retry and accessible controls. Expanded Location discovery fixture exercises the
  dedicated save API and retained map/private/profile fields at 1440/390 px.
- Final affected web suites: **195 passed** across nine files; the final SSR-only
  mock adjustment passed all 24 navigation tests. Final production build, prerender
  and TypeScript checks passed. Targeted lint, UI primitive check and `git diff --check`
  passed. Campaign Plot desktop/mobile fixture passed 35 writes, including CRUD,
  reparent/reference guards and failed-save behavior; stale fixture expectations were repaired.

### Authenticated disposable database journey

The real app, real API, fresh migrated PostgreSQL database and test-only MinIO
objects were exercised through Chrome at 1440 and 390 px. No live database was
copied. Existing development servers stayed running. A synthetic GM used the real
bootstrap/session flow. A second synthetic user/session was created in the test
DB, then granted viewer access through the normal authorized API.

The [acceptance script](../../scripts/b05-authoring-acceptance.mjs) exercises World
creation, Item image upload/create/edit/hard reload, Location map/private data and
discovery saves, mobile placement and WorldRule saves, export fidelity, outsider
and unauthenticated denial, viewer read-only access, stale and malformed atomic
rejection, unreferenced removal with sibling preservation, referenced removal
rejection, retained form input after failure and successful retry, required root
map setup, and immutable publication.

One HTTP 500 is deliberately injected by Playwright to test client recovery;
its retry uses the real API/database. Stale revisions, malformed writes,
permissions and referenced removal are rejected by the real API. This does not
claim infrastructure-outage recovery, exhaustive authenticated coverage of every
field combination, external AI generation or runtime behavior. B01–04 and the
focused fixtures retain their explicitly simulated HTTP evidence boundary.

The first publication attempt correctly rejected the newly created root Location
without a map. The journey was amended to complete the existing Atlas map setup
before publication. All **16 checks passed**, with no browser exceptions. See the
[database receipt](b05-database-receipt.json), [desktop Item view](b05-item-desktop.png)
and [mobile placement view](b05-placement-mobile.png). Screenshots were visually
reviewed; the mobile viewport had no document overflow and primary controls remained readable.

### Reproduction prerequisites

Use only a fresh disposable database named `aow_b05_disposable_20261014`; the script
asserts that name. Apply Prisma migrations. Run the API on 3109 and web on 5198,
with `API_INTERNAL_URL=http://127.0.0.1:3109/api`, matching web origins, a separate
Vite cache, a test-only S3 bucket, captured email/SMS and external AI disabled.
Bootstrap a synthetic GM using a new temporary bootstrap/encryption key. Store
`{ "cookie": "aow_session=..." }` in a mode-0600 file selected by `B05_AUTH_FILE`
and the isolated process environment in a mode-0600 JSON file selected by
`B05_ENV_FILE`. These credentials are temporary, never repository artifacts.

```sh
python3 scripts/measure-verification.py --batch B05 --category browser \
  --label authenticated-database --log /tmp/aow-B05-verification.jsonl \
  -- node scripts/b05-authoring-acceptance.mjs
```

The runner defaults to local Chrome; `CHROME_PATH` selects another Chromium binary.
After verification, stop only the isolated processes, delete only the media keys
recorded by the disposable DB, drop that database, and remove temporary credentials,
config/cache and test bucket if empty. Cleanup completed: 14 recorded test media
objects deleted, empty bucket removed, disposable database dropped, isolated
processes stopped, and temporary credentials/config/cache removed.

## Review and measurements

Frontend Developer, Backend Architect, Code Reviewer and API Tester definitions
were applied. Independent preservation/policy reviews found no remaining blocking
source issue after the reported repairs. The finite matrix was reconciled against
common types and active consumers.

Measured command time, failed attempts and reruns are retained in
[b05-timings.jsonl](b05-timings.jsonl); [b05-measurement.json](b05-measurement.json)
separates aggregate command-seconds from the union of overlapping intervals.
Manual policy review captured 145.43 seconds and owner-projection review 43 seconds;
these are separate from command runtime. Initial audit, fixture/environment setup,
debugging and some visual/manual review were not individually timed and must not be
counted as zero. Work continued during overlapping test/build/browser commands;
blocked-wait time was not separately instrumented.

Active session: 04:17:27–04:46:56 UTC on 2026-10-14
(29.48 minutes). Aggregate verification: 795.44
command-seconds; overlapping interval union: 542.05 seconds
(30.64% of active wall time). This share is occupied
verification time, not an assertion that the user waited idle for that duration.

| Category | Command seconds | Runs | Marked reruns | Failed attempts |
| --- | ---: | ---: | ---: | ---: |
| browser | 460.78 | 24 | 19 | 18 |
| build | 70.98 | 4 | 2 | 2 |
| lint | 39.58 | 14 | 3 | 2 |
| tests | 200.22 | 28 | 16 | 5 |
| typecheck | 23.88 | 2 | 0 | 0 |

Reruns covered source repairs, obsolete fixture labels/navigation/save outcomes,
isolated port/cache setup, required root-map setup, type narrowing, SSR mock identity
and the temporary-fixture/compiler race. All final checks passed; failed attempts
remain in the raw log rather than being omitted from the cost.
