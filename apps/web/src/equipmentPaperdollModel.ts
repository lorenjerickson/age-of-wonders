import {
  CORE_EQUIPMENT_SLOT_KEYS,
  canonicalEquipmentSlotKey,
} from "@aow/common";

export type EquipmentPaperdollSlot = { id: string; name: string };
export type EquipmentCombatBonuses = {
  attack?: unknown;
  defense?: unknown;
  damage?: readonly { amount: unknown; type?: string; conditional?: boolean }[];
  modifiers?: readonly {
    target: string;
    operation: string;
    value: unknown;
    predicate?: unknown;
    label?: string;
    stacking?: string;
  }[];
};
export type EquipmentPaperdollItem = {
  id: string;
  name: string;
  description?: string;
  image?: unknown;
  bonuses?: readonly string[];
  combat?: EquipmentCombatBonuses;
  compatibleSlotSets: readonly (readonly string[])[];
};
export type EquipmentAssignment = { slot: string; itemDefinitionId: string };
const aliases = new Map<string, string>();
for (const key of CORE_EQUIPMENT_SLOT_KEYS) {
  aliases.set(key, key);
  aliases.set(key.slice("aow:equipment-slot-".length), key);
}
/** Only core aliases are interchangeable. Custom slot identifiers are exact. */
export function resolveEquipmentSlot(
  id: string,
  slots: readonly EquipmentPaperdollSlot[],
): string | undefined {
  id = canonicalEquipmentSlotKey(id);
  if (slots.some((slot) => slot.id === id)) return id;
  const canonical = aliases.get(id);
  return canonical
    ? slots.find((slot) => aliases.get(slot.id) === canonical)?.id
    : undefined;
}
export function equipmentAtSlot(
  equipment: readonly EquipmentAssignment[],
  slot: string,
  slots: readonly EquipmentPaperdollSlot[],
) {
  return equipment.filter(
    (entry) => resolveEquipmentSlot(entry.slot, slots) === slot,
  );
}
export function clearEquipmentSlot(
  equipment: readonly EquipmentAssignment[],
  slot: string,
  slots: readonly EquipmentPaperdollSlot[],
): EquipmentAssignment[] {
  const owners = new Set(
    equipmentAtSlot(equipment, slot, slots).map(
      (entry) => entry.itemDefinitionId,
    ),
  );
  return equipment.filter(
    (entry) => entry.slot === "carried" || !owners.has(entry.itemDefinitionId),
  );
}
export function equipmentChoices(
  item: EquipmentPaperdollItem,
  slot: string,
  slots: readonly EquipmentPaperdollSlot[],
  equipment: readonly EquipmentAssignment[],
) {
  const occupants = equipmentAtSlot(equipment, slot, slots);
  const owner =
    occupants.length === 1 ? occupants[0].itemDefinitionId : undefined;
  const seen = new Set<string>();
  return item.compatibleSlotSets.flatMap((candidate) => {
    const resolved = candidate.map((id) => resolveEquipmentSlot(id, slots));
    if (
      !resolved.length ||
      resolved.some((id) => !id) ||
      new Set(resolved).size !== resolved.length ||
      !resolved.includes(slot)
    )
      return [];
    const set = resolved as string[];
    const key = [...set].sort().join("\u0000");
    if (seen.has(key)) return [];
    seen.add(key);
    const blocked =
      occupants.length > 1 ||
      equipment.some((entry) => {
        const target = resolveEquipmentSlot(entry.slot, slots);
        return (
          target !== undefined &&
          set.includes(target) &&
          entry.itemDefinitionId !== item.id &&
          entry.itemDefinitionId !== owner
        );
      });
    return [{ slots: set, blocked }];
  });
}
export function equipPaperdollItem(
  equipment: readonly EquipmentAssignment[],
  slot: string,
  slots: readonly EquipmentPaperdollSlot[],
  item: EquipmentPaperdollItem,
  requested: readonly string[],
): EquipmentAssignment[] {
  const choice = equipmentChoices(item, slot, slots, equipment).find(
    (candidate) =>
      !candidate.blocked &&
      candidate.slots.length === requested.length &&
      candidate.slots.every((id) => requested.includes(id)),
  );
  if (!choice)
    throw new Error(
      "These slots are unavailable. Clear conflicting equipment first.",
    );
  const cleared = clearEquipmentSlot(equipment, slot, slots).filter(
    (entry) => entry.itemDefinitionId !== item.id,
  );
  return [
    ...cleared,
    ...choice.slots.map((id) => ({ slot: id, itemDefinitionId: item.id })),
  ];
}
const positions: Record<string, { x: number; y: number }> = {
  head: { x: 50, y: 8 },
  neck: { x: 50, y: 18 },
  shoulders: { x: 27, y: 23 },
  chest: { x: 50, y: 30 },
  arms: { x: 24, y: 38 },
  wrists: { x: 78, y: 45 },
  hands: { x: 21, y: 51 },
  "main-hand": { x: 12, y: 65 },
  "off-hand": { x: 88, y: 65 },
  "left-finger": { x: 33, y: 61 },
  "right-finger": { x: 67, y: 61 },
  waist: { x: 50, y: 45 },
  legs: { x: 50, y: 73 },
  feet: { x: 50, y: 92 },
  back: { x: 78, y: 31 },
  pack: { x: 78, y: 13 },
};
export function equipmentSlotPosition(slot: EquipmentPaperdollSlot) {
  const key = aliases.get(canonicalEquipmentSlotKey(slot.id));
  return key ? positions[key.slice("aow:equipment-slot-".length)] : undefined;
}

type BonusTerms = Map<number, number>;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
/** Only concrete additive expressions can be combined without a roll or actor context. */
function concreteTerms(value: unknown): BonusTerms | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return new Map([[0, value]]);
  const record = object(value);
  if (!record) return undefined;
  if (["constant", "literal"].includes(String(record.kind)))
    return concreteTerms(record.value);
  if (record.kind === "dice" && record.expression !== undefined)
    return concreteTerms(record.expression);
  if (
    record.kind === "dice" &&
    Number.isInteger(record.count) &&
    Number(record.count) > 0 &&
    Number.isInteger(record.size) &&
    Number(record.size) > 0 &&
    (!Array.isArray(record.modifiers) || !record.modifiers.length) &&
    (record.sign === undefined || record.sign === 1 || record.sign === -1)
  )
    return new Map([
      [
        Number(record.size) * (record.sign === -1 ? -1 : 1),
        Number(record.count),
      ],
    ]);
  if (!Array.isArray(record.terms)) return undefined;
  const total: BonusTerms = new Map();
  for (const term of record.terms) {
    const parsed = concreteTerms(term);
    if (!parsed) return undefined;
    addTerms(total, parsed);
  }
  return total;
}
function addTerms(total: BonusTerms, terms: BonusTerms, sign = 1) {
  for (const [size, count] of terms) {
    const key = size * sign;
    total.set(key, (total.get(key) ?? 0) + (size === 0 ? sign * count : count));
  }
}
function formatTerms(terms: BonusTerms): string {
  const parts = [...terms]
    .filter(([, count]) => count !== 0)
    .sort(([a], [b]) => b - a);
  return (
    parts
      .map(
        ([size, count], index) =>
          `${size < 0 || count < 0 ? "−" : index ? "+" : ""}${size ? `${Math.abs(count)}d${Math.abs(size)}` : Math.abs(count)}`,
      )
      .join(" ") || "0"
  );
}
export function equipmentCombatSummary(
  equipment: readonly EquipmentAssignment[],
  items: readonly EquipmentPaperdollItem[],
) {
  const totals = {
    attack: new Map(),
    defense: new Map(),
    damage: new Map(),
    resistance: new Map(),
  } as Record<"attack" | "defense" | "damage" | "resistance", BonusTerms>;
  const notes: string[] = [];
  const weapons: { name: string; attack: string; damage: string }[] = [];
  const active = [
    ...new Set(
      equipment
        .filter((row) => row.slot !== "carried")
        .map((row) => row.itemDefinitionId),
    ),
  ];
  let incomplete = false;
  const equipped = active.flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      incomplete = true;
      return [];
    }
    return [item];
  });
  const add = (value: unknown, total: BonusTerms, label: string, sign = 1) => {
    const terms = concreteTerms(value);
    if (terms) addTerms(total, terms, sign);
    else notes.push(`${label}: variable bonus not included.`);
  };
  for (const item of equipped) {
    const combat = item.combat;
    if (!combat) continue;
    if (combat.defense !== undefined)
      add(combat.defense, totals.defense, `${item.name} defense`);
    for (const modifier of combat.modifiers ?? []) {
      const target = modifier.target.replace(/^combat\./, "");
      if (!(
        target === "attack" ||
        target === "defense" ||
        target === "damage" ||
        target === "resistance"
      ))
        continue;
      const label = `${item.name} ${target}`;
      if (
        modifier.predicate !== undefined &&
        object(modifier.predicate)?.kind !== "always"
      ) {
        notes.push(`${label}: conditional bonus not included.`);
        continue;
      }
      if (
        (modifier.stacking !== undefined && modifier.stacking !== "stack") ||
        !["add", "subtract"].includes(modifier.operation)
      ) {
        notes.push(`${label}: rule-dependent bonus not included.`);
        continue;
      }
      add(
        modifier.value,
        totals[target],
        label,
        modifier.operation === "subtract" ? -1 : 1,
      );
    }
  }
  for (const item of equipped) {
    const combat = item.combat;
    if (!combat || (combat.damage === undefined && combat.attack === undefined))
      continue;
    const attack = new Map(totals.attack);
    if (combat.attack !== undefined)
      add(combat.attack, attack, `${item.name} attack`);
    const damage = new Map<string, BonusTerms>();
    for (const part of combat.damage ?? []) {
      if (part.conditional) {
        notes.push(`${item.name} damage: conditional bonus not included.`);
        continue;
      }
      const type = part.type ?? "";
      const terms = damage.get(type) ?? new Map();
      add(part.amount, terms, `${item.name} damage`);
      damage.set(type, terms);
    }
    const damageText =
      [...damage]
        .map(
          ([type, terms]) => `${formatTerms(terms)}${type ? ` ${type}` : ""}`,
        )
        .join(" + ") || "0";
    const adjustment = formatTerms(totals.damage);
    weapons.push({
      name: item.name,
      attack: formatTerms(attack),
      damage: `${damageText}${adjustment !== "0" ? `; ${adjustment} bonus` : ""}`,
    });
  }
  return {
    attack: formatTerms(totals.attack),
    defense: formatTerms(totals.defense),
    damage: formatTerms(totals.damage),
    resistance: formatTerms(totals.resistance),
    weapons,
    notes: [...new Set(notes)],
    incomplete,
  };
}
