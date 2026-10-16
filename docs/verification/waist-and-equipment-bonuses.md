# Waist consolidation and equipment bonuses

Belt is an exact legacy equipment-slot alias of Waist. The public core vocabulary,
effective World options, paperdoll and assignment/compatibility checks expose one Waist
slot. Historical immutable core Model release data retains its hashes. Belt Item and
container kinds retain their separate meanings.

The dry-run migration found three records in Turn of the Century with Belt references:
Human, Elyena Munteanu and Count Dimitri Vargova. No assignments conflicted. Apply backed
up the draft in `.recovery/waist-slot-1792109485776.json`, updated revision 176 to 177 with
a revision compare-and-swap, and verified exact persisted records/content. A second dry
run reported zero changes. Immutable captures and releases were not modified.

The paperdoll includes a net equipment bonus panel for Attack, Defense, Damage and
Resistance. Only equipped Items contribute, once per Item even if occupying several
slots. Carried Items are excluded. Armor defense dice combine; weapon attack/damage
are alternatives, with shared equipment modifiers included. Conditional, variable or
non-additive rules are identified separately instead of silently treated as constant
bonuses. These are equipment contributions, not full actor combat totals or automatic
runtime combat execution.

Verification:

- Common/domain builds and API/web typechecks passed.
- 68 domain and 13 API tests passed for alias compatibility, occupancy, Character
  creation, conformance and immutable effective-model projection.
- 10 equipment model tests plus 3 presentation tests passed, including independent
  signed dice, equipped-only aggregation, multi-slot deduplication, conditional and
  non-additive rules, aliases and named projections.
- Isolated component browser smoke passed at 1440px and 390px. A two-slot Longbow
  contributes 2d6 damage once; armor adds 1d4 defense. Existing selection, conflict,
  clear, Escape/focus, touch sizing and overflow checks remain passing.
- Live Cedric editor at 1440px and 390px shows 15 slots with exactly one Waist and no
  Belt; all six saved equipped Items remain. Totals are Attack 0, Defense 1d8 +3d4 +2d2,
  Damage 0 and Resistance 0. Mobile screenshot inspected; no horizontal overflow.
- Targeted lint and whitespace checks passed. Only the backed-up consolidation
  migration wrote live records; bonus-panel verification did not save equipment edits.
- AI-facing domain guide updated for canonical Waist aliases and unchanged Belt
  container semantics. Totals are a display projection of existing Item fields;
  no combat contract or execution semantics changed.
