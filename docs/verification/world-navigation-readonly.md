# World navigation and read-only model reference

2026-10-15. Current accepted navigation (including the user's follow-up):
Atlas, Bestiary, Characters, Codex, Items, Overview, Rules. Codex's left-nav children
are Backgrounds, Conditions, Effects, Professions and Skills. All lists are alphabetical.
Items is independent of Codex. No category tabs or Authoring libraries section remain.

Atlas uses the complete location collection, including old authoring-library routes.
Rules is the existing full World Rules editor/collection with rule-system settings;
old system/Codex-rule links redirect and retain the selected rule. Versions remains
reachable from Overview. Character options needed for Professions, Skills and Backgrounds
retain their authored-data routes with appropriate Codex navigation selection.

Profession Ranks, Equipment Slots, Attributes and Schema Structure are retained as
read-only World model references. Old creation/edit URLs show reference views, with
no publishing/adoption/mutation controls. World draft save rejects changes to adopted
model releases; independent Model Registry editing and initial creation/fork capture
remain supported. Actor attribute values and equipment assignments remain editable.
Profession Rank data is not deleted or redesigned in this navigation task.

## Verification

- 98 API tests and 5 read-only UI tests pass; API/web typechecks pass for that slice.
- Live desktop read-only checks passed for all four old `/new` routes with no mutators.
- Legacy Atlas renders all 20 locations; Rule system alias opens Rules with its full tools.
- Professions and Skills routes show the correct Codex child selection; no Codex tabs.
- 248 scoped navigation/router/model tests passed; 61 focused count/navigation follow-up
  tests passed. Final web typecheck, targeted ESLint and diff checks passed.
- Live old Codex Items link redirects to the standalone Items destination; Codex parent
  opens Backgrounds. Alphabetical hierarchy verified at 1440 px and 390 px. Mobile drawer
  controls are 44 px high, correct active child is selected, and no horizontal overflow.
- Retired-definition data remains intact: final revision 176, 258 records, same hash.
- Some live navigations timed out during heavy local load; settled pages were inspected
  successfully. No claim that this task resolves the deferred save-performance issue.
- No DB writes are required. Initial World revision 176, 258 records, record hash
  `e1194e8498aac44926f27bdb750fff46b70f9e6bc9094db29552ba763d4f52af`.

Frontend Developer and Backend Architect guidance applied with bounded navigation and
read-only implementation assignments. Canonical IA and AI guide workflow statements
updated; domain field types and existing definition payloads are unchanged.
