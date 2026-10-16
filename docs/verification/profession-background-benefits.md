# Structured Profession and Background authoring

The selected scope adds description and optional modifier, Condition and Effect
benefits to Profession and Background authoring. Existing modifier semantics remain:
Background grants are on acquisition; Profession grants belong to expertise tiers.
Condition and Effect associations reference reusable definitions in the same World.
Automatic runtime application and redesign of Profession Ranks are not part of this change.

Both active editors retain existing components and extensions. Lists expose descriptions
and benefit summaries. Reference validation rejects invalid or duplicate associations;
referenced definitions must remain protected from removal and references survive copying.

Verification:

- Common/domain builds and API/web typechecks passed.
- 21 focused domain tests and 45 API tests passed, including unavailable and duplicate
  grants, unresolved capture context, deletion protection and namespace-safe fork rewriting.
- 67 scoped web tests passed: actual route rendering, description/benefit summaries,
  named selectors, duplicate-choice avoidance, absent-field preservation, and JSON
  edit/round-trip/reopen retaining descriptions, modifiers and private grant metadata.
- Live existing Background and Profession editors inspected at 390px; no horizontal
  overflow, grant buttons 44px high. Background add/remove worked with the explicit
  empty-source state. Desktop Profession list/editor inspected at 1440px; existing
  Blacksmith description and two-modifier summary rendered correctly.
- `CHARACTER_BENEFITS_ONLY=1 node apps/web/scripts/character-authoring-smoke.mjs`
  passed with real page/provider/router/API client and intercepted HTTP persistence at
  1440px and 390px for both kinds. Selected named Condition/Effect grants, edited
  Description, submitted Save, reopened the route, and verified selected values,
  summaries, private metadata and existing modifiers. No page errors or overflow;
  grant controls remained at least 44px. Screenshots inspected by the frontend agent.
- No live grant write was performed: the target World has no Condition or Effect
  definitions. End-to-end form evidence uses disposable HTTP fixtures.
- AI-facing domain guide synchronized with the new optional common type fields;
  persisted resource mappings and runtime semantics remain unchanged.
- Git diff whitespace check passed. Existing user records were not changed.

Guidance used: Backend Architect and Frontend Developer agent definitions, with
incremental domain design and scoped consumer/UX verification.
