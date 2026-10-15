# B04 — World structured collections

Completed selected AU-22–24 scope on 2026-10-13 (America/Los_Angeles).
Models retain the existing Models & taxonomies destination. No runtime semantics,
new libraries or domain migrations were added. B03's Feat, Heritage and Discipline
entry points remain explicitly deferred by the user.

## Consumer outcome and coverage

| Collection | Delivered authoring coverage |
| --- | --- |
| Location discoveries | Separate list/Add/Edit for truth, belief and rumor claims; statements, provenance, named conflict/related-truth references, preserved IDs/extensions and unrelated claims. Existing Location `DiscoveryClaim[]` remains authoritative; this is not a migration to Plot Discovery facets. |
| Location Creature/Item placements | Separate list/Add/Edit, named source selection, placement name, map position, token scale and presentation notes. Preserve source revision, private/unknown payload, membership and location ownership. Removal leaves referenced source definitions intact. Legacy unsupported-source placements remain visible and removable from the unfiltered legacy list. |
| Model vocabularies | Separate list/Add/Edit for Attributes, Equipment slots and Profession ranks, including existing supported vocabulary metadata. Immutable element revision publication, exact release adoption, failed-adoption retry without duplicate publication, and explicit archive remain intact. |
| Model schema | Separate Concept/Field/Relationship contexts with parent Concepts, value types/defaults, relationship endpoints/cardinality and presentation metadata. Unknown nested fields and omitted optional properties survive unrelated edits. Existing schema-literal JSON input remains; no additional raw JSON interface was introduced. |
| World rules | Separate rule list/Add/Edit, ordered-effect list/Add/Edit and recursive-condition list/Add/Edit. Existing trigger, lifecycle, priority, descriptions and expression controls remain. Ordering/removal preserve siblings. WorldRule stays separate from the Action grammar and engine semantics are unchanged. |
| Navigation | Named World/Location/Model/rule ancestry, safe missing-reference labels, direct child routes, Cancel/Back and preserved campaign/quick-start return query context. Locations encode existing entry IDs with an `entry-` prefix to distinguish them from `new`. |

Revision checks remain tied to the draft/source captured for editing. Model revisions
use their registry concurrency checks. World rules use their dedicated mutation API;
a successful response supplies the authoritative collection even if a later draft
refresh fails. Malformed or ambiguous imported owners are blocked, and imported
opaque text is masked with explicit replacement controls. Unknown extensions are
preserved only where the existing contract permits them; strict WorldRule validation
is not broadened to accept arbitrary fields.

The common TypeScript contracts and persisted resource mappings were compared with
the AI-facing domain guide. They remain unchanged. The guide was updated to describe
the new authoring contexts, Location claim boundary, Model lifecycle and separate
WorldRule grammar. The API rule upsert now retains its existing record envelope while
continuing to assign audit values server-side; dedicated regression coverage verifies it.

## Verification

- Full web suite: 1,083 tests passed. Final affected-route/model/navigation tests
  passed after review repairs: 247 tests across eight suites.
- API: 37 tests passed across rule preservation, Location migration/retired links,
  Model registry and compiler suites. API typecheck passed.
- Web production build, four prerendered pages and TypeScript check passed after
  integration repairs. Targeted ESLint, UI primitive boundaries and whitespace
  checks passed.
- Disposable HTTP browser fixtures exercised real UI/provider/router/client behavior
  at 1440 × 1000 and 390 × 1000. They do not establish authenticated database persistence.
- Location journeys: create/edit/save/read-back/reopen for three collections; named
  references; map positions; private and opaque imported data; explicit replacement;
  sourceRevision; source-safe supported/legacy removal; malformed/duplicate identities;
  read-only, Cancel, pending, 500 recovery and 409 retained edits.
- Model journeys: all three vocabularies and all three schema kinds; create, revision
  reopen, private metadata/payload preservation, optional omission, Cancel, registry
  500/409, failed-adoption retry, archive, read-only and malformed presentation guards.
  Browser coverage uses default new Field/Relationship examples and editable Concept
  revisions; it does not exhaust every schema datatype combination.
- World-rule journeys: rule creation/edit/reopen, nested not/group/comparison
  conditions, effect/condition ordering/removal, untouched sibling rule, Cancel,
  pending/500/409, viewer gate, strict import guards, masked opaque text and preserved
  structured literals. Existing rules-movement regression also passed.
- Controls meet 44 px and pages do not overflow horizontally at tested widths.
  Populated desktop/mobile screenshots were inspected for all three families.

Browser scripts: `apps/web/scripts/location-collections-smoke.mjs`,
`model-authoring-smoke.mjs`, `world-rule-contexts-smoke.mjs` and
`rules-movement-smoke.mjs`. Temporary screenshot prefixes are
`/tmp/b04-location-`, `/tmp/aow-B04-model-` and `/tmp/aow-B04-rule-`.

## Review and remaining scope

Frontend Developer, Backend Architect and Code Reviewer agent definitions were used,
with delegated Location, Model and World-rule implementation and independent review.
Consumer-perspective, bounded-refactor-slices, user-journey UX verification, focus/scope
and backlog-continuity guidance were applied.

Review closed malformed-rule access before validation, null-sibling handling,
authoritative save response adoption, fixed-segment route parsing and lost return
query context. Integration checks also caught and repaired strict fixture/input types
and a shadowed expression binding. The original dirty workspace was preserved.

B05 retains authenticated database acceptance, cross-surface preservation/navigation,
validation-policy reconciliation and the final selected-authoring coverage audit.
B06–12 remain deferred. No new Model destination, Plot-facet migration or runtime
execution change was included in B04.

## Measurement

Recorded active session: 2026-10-14 03:56:14–04:12:19 UTC
(16.09 minutes).

| Command category | Aggregate seconds | Runs | Flagged reruns |
| --- | ---: | ---: | ---: |
| tests | 57.88 | 13 | 3 |
| build | 71.60 | 3 | 2 |
| typecheck | 11.41 | 1 | 0 |
| browser | 239.13 | 21 | 10 |
| lint | 40.19 | 17 | 4 |

Aggregate verification command time: **420.21 seconds**. Union of
overlapping command intervals: **325.77 seconds** (33.7% of the recorded
active window). Parallel durations are not presented as user waiting time.
Implementation, review and documentation continued during checks; blocked waiting
was not separately instrumented. Builds include their TypeScript stage.

Captured manual review totals **122.12 seconds**, reported separately from
command runtime: independent World-rule/navigation review, final Location screenshot
review and a World-rule screenshot review. Earlier review, root screenshot inspection
and browser fixture preparation/debugging were not separately timed. Their effort is
unavailable, not zero; a total verification-effort percentage cannot be inferred.

Reruns covered local browser-port permission, fixture readiness/selectors, 44 px
controls, rule-creation default effects, read-only gate expectations, strict audit
fixture correction, API-supported placement metadata, imported-data preservation and
independent review fixes. Build reruns repaired strict input/fixture types, a shadowed
expression variable and optional Model-element handling. Some expanded browser
checks use new labels without the rerun flag; the table reports flags exactly and
includes all runs rather than treating the flag count as every repeated check.
Raw evidence: [timings](b04-timings.jsonl) and [measurement](b04-measurement.json).
