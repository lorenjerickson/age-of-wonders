# World equipment paperdoll

Creature and World Character editors now share a silhouette-based equipment picker.
Supported body slots appear as 48px icons. Populated slots show the Item artwork
alone; missing artwork uses an icon fallback. Clicking a slot opens a compact named,
illustrated compatible-item list. Hover/focus shows name, authored bonuses and a short
description; the dialog retains full current-item details for touch users. Native modal
focus handling, Escape, and focus restoration support keyboard use.

Creature authoring now persists optional `components.equipment` assignments, with
omission preserving existing values and an explicit empty array clearing them.
Characters use their existing equipment list, and selecting a Creature for a new
Character copies its explicit equipment. Existing pool data remains preserved.
The Creature editor also exposes supported slot selection from the captured vocabulary.

Each assignment identifies a slot and Item. Multi-slot Items occupy one complete
compatible alternative and are replaced/cleared atomically. Other occupied slots block
conflicting choices. Validation checks same-World Item references and supported slots.
Only known core bare/namespaced aliases are interchangeable; custom slots retain exact
identity and appear separately when they lack a known anatomical position. Unchanged
legacy associations and carried entries are preserved. No live data migration was run.

Verification:

- Common/domain builds and API/web typechecks passed.
- 24 domain and 30 API tests cover assignment compatibility, core aliases, multi-slot
  occupancy, references, preservation and explicit clear behavior.
- 7 scoped web model/presentation tests pass, covering atomic selection, blocked
  conflicts, metadata preservation, compatible choices and readable bonus details.
- Isolated browser smoke at 1440px and 390px exercises icons, hover details, compact
  modal selection, Escape/focus return, blocked conflicts, multi-slot equip/clear,
  carried metadata, custom slots and read-only mutation controls. No overlap or
  horizontal overflow; icons are 48px. This uses fixture state, not live persistence.
- Live mobile Cedric editor: all 16 supported slots and six existing equipment images
  resolved correctly. Head picker showed compatible named Items and Defense 1d4;
  choosing a replacement changed the head slot and retained the other five. The edit
  was discarded without saving. Live desktop Human editor showed 16 supported slots
  and no old pool checklist. Both layouts had no horizontal overflow.
- Targeted lint and diff whitespace checks passed. No user records were changed.
- AI domain guide updated alongside common types. Existing runtime Item materialization
  is unchanged; this change authors explicit World template equipment.

Guidance used: Frontend Developer and Backend Architect definitions, consumer perspective,
and user-journey UX verification. Player Character creation and runtime inventory screens
are separate flows and were not redesigned in this World-authoring change.
