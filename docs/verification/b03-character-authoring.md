# B03 — Character-option authoring verification

Completed approved scope on 2026-10-13 (America/Los_Angeles).
The user selected built-in field coverage and explicitly deferred Feat, Heritage,
and Discipline entry points. AU-16–18 are delivered; AU-19–21 retain their editor
and entry-point work. No runtime advancement or execution was added.

## Consumer outcome and field coverage

Existing World Profession and Background libraries now open the shared structured
owner editor. Creation, Cancel, contextual return links and direct child routes
retain the World and owner. Rich owned collections have separate list/Add/Edit
contexts with ordering/removal. Scalar selections remain form fields.

| Source contract | Authoring coverage |
| --- | --- |
| Profession root | Expertise tiers/order, acquisition, Action progressions, prerequisites, Choices/Options and mutually exclusive named Professions. |
| Expertise level | Adopted rank key, numeric rank, advancement point cost, all advancement-window variants, prerequisites and benefits. Intentional tier edits synchronize `expertiseOrder`; unrelated child saves preserve imported order. |
| Tier benefits | Modifier grants/dice/targets, rule modifiers/predicates, named Traits and numeric resource maximum expressions. |
| Acquisition | Character creation with Choices; during-play prerequisites, training duration/Action; adopted starting rank. |
| Action progression | Named Action, unlock rank, advancement-point expression, usage limits, qualifying predicate; improvements with rank, rule modifiers, replacement Action and description. |
| Background | Named Attribute/Skill/equipment/Feat/feature references, tool proficiencies, language-choice count, characteristic categories/suggestions, Choices/Options and modifier grants. |
| Feat / Heritage / Discipline | Shared class-owned recursive built-in validation added. Dedicated UI and entry points remain deferred; no new destinations exposed. |
| Unknown/private/imported fields | Preserved through structural copies. Unsupported containers block writes; deliberate scalar/variant replacement remains explicit. No raw JSON editor. |

Common TypeScript contracts and persisted resource mappings are unchanged. The
AI-facing domain-model guide was compared with those contracts and updated for the
five classes' recursive validation and the UI/deferred boundary. The shared cost
validator was moved from Action to its shared base without changing the grammar.

Drafts permit missing/incomplete fields for subsequent authoring. Supplied malformed
built-in values reject new writes; unchanged inherited diagnostics are preserved
using the existing draft projection pattern. Exact Model conformance applies to
Profession and Background editing, including direct child links. Missing effective
Models disable saves; legacy absent conformance is stamped from the adopted Model.
An empty new Profession can be saved before its first tier is authored. Publication
policy is unchanged and its broader reconciliation remains QA-02/B05.

## Observed verification

- Web suite: 1,050 tests passed. After final review fixes, 223 affected routing,
  ownership and rule-model tests passed again.
- Domain: 289 tests passed in the full suite, plus the added nested-choice ownership
  regression (290 unique). Domain build and typecheck passed.
- API: 79 unique tests across eight affected suites passed; API typecheck passed.
  A full `service.save()` test verifies empty Profession create/read-back and rejects
  a malformed follow-up before a second mocked database write.
- Production web build, four prerendered pages and TypeScript check passed after
  the final Model-gate/label fixes. Targeted ESLint, UI primitive boundary and diff
  whitespace checks passed.
- `apps/web/scripts/character-authoring-smoke.mjs` passed at 1440 × 1000 and
  390 × 1000. It exercises real components, provider, router and client against
  disposable HTTP persistence, not authenticated database storage.
- Browser journeys cover new Profession/Background creation, first-tier creation,
  benefits/grants, acquisition, Action progression/improvement, Background references,
  characteristics and Choices, authoritative read-back/reopen, private/sibling data,
  unrelated-reference filtering, 500 retry, 409 retained edits, read-only/malformed
  owners, missing-Model direct entry and legacy conformance stamping.
- Visible controls meet 44 px and pages do not overflow horizontally. Ten populated
  screenshots were captured; representative mobile tier/Background/characteristics
  and desktop Profession/grant screens were visually inspected. Final screenshots
  use readable child labels such as “Expertise tier.”

Evidence screenshots are under `/tmp/aow-B03-` with names `profession-root`,
`profession-tier`, `profession-grant`, `background-root`, and
`background-characteristics`, each suffixed `-1440.png` or `-390.png`.

## Review and limits

Frontend Developer, Backend Architect and Code Reviewer agent definitions were used.
Independent review found and closed malformed conformance coercion, overly broad
Skill/Feat reference menus, and the direct-child effective-Model gate. Verification
uses the consumer-perspective and user-journey UX verification skills.

Authenticated/database journeys remain QA-03/B05. Full cross-surface navigation,
publication policy, remaining malformed-data audit and final authoring coverage are
B05. Feat/Heritage/Discipline editor entry points remain AU-19–21 by user decision.
The already-dirty checkout was preserved; no commit or real user data mutation was
performed for this batch.

Timing and instrumentation limits are recorded below; raw measured commands are
retained in `b03-timings.jsonl`.

## Measurement

Recorded active session: 2026-10-14 03:39:18–03:53:14 UTC
(13.95 minutes). Initial discovery preceded instrumentation, so this is a
partial active-session window, not a claim of complete task elapsed time.

| Command category | Aggregate seconds | Runs | Flagged reruns |
| --- | ---: | ---: | ---: |
| tests | 67.09 | 18 | 7 |
| build | 60.90 | 5 | 3 |
| typecheck | 63.83 | 7 | 2 |
| browser | 70.15 | 5 | 4 |
| lint | 7.38 | 3 | 0 |

Aggregate verification command time: **269.35 seconds**. Union of overlapping
verification intervals: **231.56 seconds** (27.7% of the recorded active
window). Parallel commands are not added together as user waiting time. Implementation,
review and documentation continued while package checks ran; blocked waiting time was
not separately instrumented and cannot be reconstructed reliably.

Reruns covered TypeScript fixture/adapter repairs, domain fixture corrections, a
Background fixture assertion update, the full-save database mock/read-back fix,
sandbox localhost binding for browser/prerender, browser reference-label selectors,
added responsive/filter/create acceptance checks, and final reviewed Model-gate and
human-label changes. Early parallel web typechecks ran against in-progress integration;
these duplicate checks are included rather than hidden. Two early ad hoc agent records
lack command timing fields (one reports a 5.88-second runner phase and one no duration)
and are excluded from aggregate/union totals. The `unit` category is normalized to tests
in this summary. Build commands include their declared typecheck stages; domain test
commands that invoke builds remain under tests to avoid double counting.

Browser fixture preparation/debugging and manual code/visual review were performed but
not independently clocked. Their duration is **unavailable**, not zero, and is not
silently included in command timing. This instrumentation gap prevents claiming a total
verification-effort percentage. Full records: `b03-timings.jsonl` and
`b03-measurement.json`.
