import { canonicalEquipmentSlotKey } from "@aow/common";
import { resolveEquipmentSlot } from "./equipmentPaperdollModel";
import type { WorldDraftRecord } from "./api";
import type {
  EquipmentPaperdollItem,
  EquipmentPaperdollSlot,
} from "./EquipmentPaperdoll";
import { recordPayload, recordsForLibrary } from "./worldAuthoringModel";
import { visibleRecordName, visibleRecordDescription } from "./recordDisplay";
import { recordThumbnail } from "./recordArtworkModel";
import { protectedComparisonText } from "./protectedAuthoringText";

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Human-readable authored bonuses, without evaluating conditional rules. */
export function equipmentBonuses(
  components: Record<string, unknown>,
  ids: ReadonlySet<string>,
): string[] {
  const safe = (v: unknown) =>
    typeof v === "string" && !protectedComparisonText(v, ids) ? v : "";
  const dice = (v: unknown) =>
    list(object(v).terms)
      .map((term) => {
        const t = object(term);
        if (
          t.kind === "dice" &&
          typeof t.count === "number" &&
          typeof t.size === "number"
        )
          return `${t.count}d${t.size}`;
        if (
          (t.kind === "constant" || t.kind === "flat") &&
          typeof t.value === "number"
        )
          return String(t.value);
        return "";
      })
      .filter(Boolean)
      .join(" + ");
  const bonuses: string[] = [];
  const humanize = (v: unknown) =>
    safe(v)
      .replace(/[._-]+/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  const defense = dice(object(components.armor).defenseDice);
  if (defense) bonuses.push(`Defense: ${defense}`);
  const hit = dice(object(components.weapon).hitDice);
  if (hit) bonuses.push(`Attack: ${hit}`);
  for (const raw of list(object(components.weapon).damage)) {
    const damage = object(raw),
      roll = dice(damage.damage);
    if (roll)
      bonuses.push(
        `Damage: ${roll}${safe(damage.damageType) ? ` ${safe(damage.damageType)}` : ""}`,
      );
  }
  for (const raw of list(components.modifiers)) {
    const modifier = object(raw);
    const label =
      safe(modifier.sourceLabel) ||
      humanize(modifier.target) ||
      "Item modifier";
    const value = object(modifier.value);
    const amount =
      typeof modifier.value === "number"
        ? modifier.value
        : typeof value.value === "number"
          ? value.value
          : undefined;
    const operation =
      modifier.operation === "add"
        ? "+"
        : modifier.operation === "subtract"
          ? "−"
          : modifier.operation === "multiply"
            ? "×"
            : modifier.operation === "divide"
              ? "÷"
              : modifier.operation === "set"
                ? "="
                : humanize(modifier.operation) + " ";
    bonuses.push(
      `${label}${amount === undefined ? " (authored rule)" : `: ${operation}${amount}`}${modifier.predicate ? " (conditional)" : ""}`,
    );
  }
  for (const raw of list(components.traits)) {
    const trait = object(raw);
    const name = safe(object(trait.identity).name) || safe(trait.name);
    if (name) bonuses.push(name);
  }
  return bonuses;
}

export function worldEquipmentItems(
  records: readonly WorldDraftRecord[],
): EquipmentPaperdollItem[] {
  const ids = new Set(records.map((r) => r.sourceId));
  return recordsForLibrary(records, "items").map((record) => {
    const payload = recordPayload(record),
      components = object(payload.components);
    return {
      id: record.sourceId,
      name: visibleRecordName(record, "Unnamed Item", ids),
      description: visibleRecordDescription(record, ids),
      image: recordThumbnail(payload),
      bonuses: equipmentBonuses(components, ids),
      combat: {
        attack: object(components.weapon).hitDice,
        defense: object(components.armor).defenseDice,
        ...(components.weapon
          ? {
              damage: list(object(components.weapon).damage).map((raw) => {
                const damage = object(raw);
                return {
                  amount: damage.damage,
                  conditional: damage.savingThrow !== undefined,
                  type:
                    typeof damage.damageType === "string" &&
                    !protectedComparisonText(damage.damageType, ids)
                      ? damage.damageType
                      : undefined,
                };
              }),
            }
          : {}),
        modifiers: list(components.modifiers).map((raw) => {
          const modifier = object(raw);
          return {
            target: typeof modifier.target === "string" ? modifier.target : "",
            operation:
              typeof modifier.operation === "string" ? modifier.operation : "",
            value: modifier.value,
            predicate: modifier.predicate,
            stacking:
              typeof modifier.stacking === "string"
                ? modifier.stacking
                : undefined,
            label:
              typeof modifier.sourceLabel === "string" &&
              !protectedComparisonText(modifier.sourceLabel, ids)
                ? modifier.sourceLabel
                : undefined,
          };
        }),
      },
      compatibleSlotSets: list(
        object(components.equippable).compatibleSlotSets,
      ).filter(
        (set): set is string[] =>
          Array.isArray(set) &&
          set.length > 0 &&
          set.every((slot) => typeof slot === "string"),
      ),
    };
  });
}

export function worldEquipmentSlots(
  supported: unknown,
  options: readonly { key: string; name: string }[],
): EquipmentPaperdollSlot[] {
  return [
    ...new Set(
      list(supported)
        .filter((id): id is string => typeof id === "string")
        .map(canonicalEquipmentSlotKey),
    ),
  ].map((id) => ({
    id,
    name:
      options.find(
        (option) =>
          option.key ===
          resolveEquipmentSlot(
            id,
            options.map((option) => ({ id: option.key, name: option.name })),
          ),
      )?.name ?? "Equipment slot",
  }));
}
