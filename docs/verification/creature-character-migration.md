# Named Creature → Character migration

2026-10-15. User requested every current authored Creature except Lamprey become a
Character and explicitly approved a Human base and editable required-field defaults.
The target is the **Turn of the Century** World draft; unrelated smoke-test Worlds,
legacy actor records and immutable published captures are outside this migration.

## Data transformation

`scripts/migrate-named-creatures-to-characters.mjs` defaults to a read-only dry run.
It requires the exact six expected names, checks identity collisions, validates the
new resources through CharacterTemplate/CreatureDefinition, and preserves unrelated
records by deep comparison. `--apply` writes a private full-draft backup under ignored
`.recovery/` before a transactional storage-revision compare-and-swap. The transaction
reads the result back and compares all content/records; repeat application is a no-op.
Draft validation is invalidated so normal publication validation runs on the new draft.

- Elyena Munteanu, Count Dimitri Vargova, Madam Petrovka, Mother, Sherlock Holmes,
  and Dr. James Watson move to `world-character-templates`, retaining source IDs.
- Human is created as a reusable Creature base; Sewer Lamprey remains unchanged.
- Original identity, components, extensions, conformance and embodiment policy remain
  intact as preserved fields. Name/description and attributes populate Character fields.
- All three existing image views for each Character are recovered using the existing
  Creature artwork-preservation helper, including older archived image metadata.
- Eighteen explicitly associated Item/slot links become Character equipment (six each
  for Count, Holmes and Watson); unassigned equipment pools are not interpreted as gear.
- Missing health defaults to 20/20 with zero temporary health; missing skills to an empty
  map; vision to day 60/night 0. Movement defaults to walk 30/run 60/jump 5/crawl 10/
  swim 15/climb 10/fly 0/burrow 0, retaining authored foot-based overrides.
- The Count's placement retains its ID, location, position, label and scale and points
  to the same authored actor ID through the new `world-character` source grammar.

## Verification

Dry run and live transactional execution/readback passed for six Characters, eighteen
image views, eighteen equipment links and one changed placement. Draft storage revision
advanced from 171 to 172. A second invocation returned “Already migrated; no changes.”
The private pre-migration backup is `.recovery/creature-character-1792102489652.json`.

Common/domain builds, API/web typechecks, 33 focused domain tests, 35 web model tests and 38 API tests
passed. Runtime coverage verifies that two Characters sharing Human remain distinct,
retain their health/attribute overrides and reuse the correct actor on placement.
API health returned 200 with the database connected. The subsequent container-resolution repair verified the authenticated Characters
page: all six cards and their artwork render, with two remaining Creature entries
and no console errors.

The AI domain guide is updated with the added Character placement contract. The
Character/Creature field contracts are unchanged. Backend Architect guidance was used;
one bounded agent handled the placement contract and its consumers.
