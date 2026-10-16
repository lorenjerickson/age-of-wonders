# Bestiary and Characters consolidation

2026-10-15. User requested one Creature authoring destination, Bestiary and Characters
as first-class World navigation alongside Codex, and migration of remaining humanoids.
The user explicitly kept Ionic Wight in Bestiary.

## Delivered behavior

Bestiary and Characters now have dedicated collection/create/edit destinations. Codex
contains Items, Conditions, Effects and Rules. Its old Creature/Character deep links
retain the selected entry and redirect. Old Bestiary list/create/edit paths use the
same canonical editor, including the existing upgrade path for legacy data in other
Worlds. Character options and Models remain separate tools. Mobile uses the shared
navigation drawer rather than an extra persistent bar.

## Live data

`scripts/consolidate-world-actor-libraries.mjs` validates a dry run, archives the full
original payloads, writes a private backup, compares the current storage revision,
and checks the transaction's persisted content and records before commit.

- Constable O'Malley, Harold Fink, Cedric Munteanu and Ser Roderick now use Characters
  backed by Human. There are ten authored Characters total.
- Feral Dog, Feral Cat, Black Adder, Ionic Wight and Giant Rat were upgraded to canonical
  Creature records without changing IDs. With Human and Sewer Lamprey, Bestiary has seven.
- All 27 existing image views, twelve equipped Item links, authored health and attribute
  scores were preserved; legacy will projects to the existing Wisdom attribute.
- Cedric's innkeeper placement now references his Character ID. Other records, including
  the previously migrated six Characters and Human's subsequent user edits, are unchanged.
- Full original custom/private data stays in the legacy preservation extension. Unsupported
  wheelchair movement remains there and in Roderick's retained source fields; it is not
  mislabeled as walking. Ionic Wight's hover speed populates flight while retaining its
  exact original mode in the archive.
- Missing skills and grants default to empty; missing day vision defaults to 60 and night
  vision to zero. Published captures and existing runtime sessions remain untouched.

Applied draft revision 173 → 174; readback passed. A second invocation was a no-op.
Backup: `.recovery/actor-library-consolidation-1792104806850.json` (ignored/private).

## Verification

117 focused navigation/router tests, web typecheck and targeted ESLint passed. Live
browser legacy Codex Creature link redirects to Bestiary and shows all seven cards.
Live create → HTTP 201 → list → reopen/refresh passed using a temporary Creature,
then supported UI deletion removed it. Final authoritative revision 176 has ten
Characters, seven Creatures and no test entry. Mobile 390×844 has no horizontal overflow;
Codex/Bestiary/Characters drawer links have 44 px targets and correct active state.
Old Codex Character links redirect and all ten Character cards render. The create/delete
requests were unusually slow (minutes); this separate performance issue is recorded in
BACKLOG.md with unproven hypotheses explicitly labeled. No new domain type semantics were
introduced; the AI-facing domain guide remains accurate. Canonical IA documentation
records the user's new navigation decision. Frontend Developer and Backend Architect
guidance were applied, with UI implementation delegated and data/browser work by root.
