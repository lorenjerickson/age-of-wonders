import { canonicalEquipmentSlotKey } from "@aow/common";
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
/** Shared authoring policy. Availability pools never imply an assignment. */
export function authoredEquipmentIssue(
  value: unknown,
  context: {
    records?: readonly {
      resourceType: string;
      sourceId: string;
      payload: unknown;
    }[];
    slots?: unknown;
    preserveCompatibility?: boolean;
  },
): string | undefined {
  if (!Array.isArray(value) || value.length > 200)
    return "Choose a valid equipment list.";
  const occupied = new Set<string>();
  const assignments = new Map<string, string[]>();
  for (const entry of value) {
    const link = object(entry);
    if (
      typeof link.slot !== "string" ||
      !link.slot.trim() ||
      (link.slot !== "carried" && occupied.has(link.slot))
    )
      return "Choose one Item for each equipment slot.";
    if (
      typeof link.itemDefinitionId !== "string" ||
      !link.itemDefinitionId.trim()
    )
      return "Choose each equipment Item only once.";
    const slots = assignments.get(link.itemDefinitionId) ?? [];
    if (
      slots.includes(link.slot) ||
      (slots.length && (slots.includes("carried") || link.slot === "carried"))
    )
      return "Choose each equipment Item only once.";
    slots.push(link.slot);
    assignments.set(link.itemDefinitionId, slots);
    occupied.add(link.slot);
  }
  if (!context.records) return;
  const available = Array.isArray(context.slots)
    ? context.slots
        .filter((slot): slot is string => typeof slot === "string")
        .map(canonicalEquipmentSlotKey)
    : [];
  const coreSlots = new Set([
    "arms",
    "feet",
    "head",
    "legs",
    "neck",
    "chest",
    "hands",
    "left-finger",
    "off-hand",
    "main-hand",
    "pack",
    "shoulders",
    "back",
    "waist",
    "right-finger",
  ]);
  const canonical = (slot: unknown) => {
    if (typeof slot !== "string") return undefined;
    const key = canonicalEquipmentSlotKey(slot);
    if (available.includes(key)) return key;
    if (coreSlots.has(key) && available.includes(`aow:equipment-slot-${key}`))
      return `aow:equipment-slot-${key}`;
    const bare = key.startsWith("aow:equipment-slot-")
      ? key.slice("aow:equipment-slot-".length)
      : "";
    return coreSlots.has(bare) && available.includes(bare) ? bare : key;
  };
  const canonicalOccupied = new Set<string>();
  for (const [id, rawSlots] of assignments) {
    const slots = rawSlots.map((slot) => canonical(slot)!);
    const item = object(
      context.records.find(
        (record) =>
          record.resourceType === "definitions" && record.sourceId === id,
      )?.payload,
    );
    if (item.kind !== "item")
      return "An equipped Item is unavailable in this World.";
    if (slots[0] === "carried" || context.preserveCompatibility) continue;
    if (slots.some((slot) => canonicalOccupied.has(slot)))
      return "Choose one Item for each equipment slot.";
    slots.forEach((slot) => canonicalOccupied.add(slot));
    if (
      new Set(slots).size !== slots.length ||
      slots.some((slot) => !available.includes(slot))
    )
      return "Choose an equipment slot supported by this Creature.";
    const sets = object(object(item.components).equippable).compatibleSlotSets;
    if (
      !Array.isArray(sets) ||
      !sets.some((set) => {
        if (!Array.isArray(set) || new Set(set).size !== set.length)
          return false;
        const normalized = [...new Set(set.map(canonical))];
        return (
          normalized.length === slots.length &&
          normalized.every(
            (slot) => typeof slot === "string" && slots.includes(slot),
          )
        );
      })
    )
      return "The Item does not fit that complete slot assignment.";
  }
}
