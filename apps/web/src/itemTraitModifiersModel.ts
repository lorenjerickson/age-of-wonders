import {
  mechanicsId,
  mechanicsTraitOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { effectEntries } from "./itemActionOutcomesModel";
export function parseTraitModifierRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "traits" || parts[2] !== "modifiers" || parts.length > 4)
    return;
  const traitPath = parts.slice(0, 2).join("/"),
    trait = parseMechanicsRoute(traitPath);
  if (!trait?.childId || trait.childId === "new") return;
  try {
    return {
      trait,
      traitPath,
      modifierId: parts[3] ? decodeURIComponent(parts[3]) : undefined,
    };
  } catch {
    return;
  }
}
export type TraitModifierRoute = NonNullable<
  ReturnType<typeof parseTraitModifierRoute>
>;
export function modifierEntries(value: unknown): MechanicsObject[] {
  const entries = effectEntries(value),
    ids = entries.map((entry) => entry.id);
  if (
    ids.some((id) => typeof id !== "string" || !id || id === "new") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "Modifiers need unique identities before editing. Existing data has been preserved.",
    );
  return entries;
}
export function traitModifierOwner(
  components: MechanicsObject,
  route: TraitModifierRoute,
) {
  const owner = mechanicsTraitOwner(components, route.trait.childId!);
  return { ...owner, modifiers: modifierEntries(owner.components.modifiers) };
}
export function traitModifiersPatch(
  components: MechanicsObject,
  route: TraitModifierRoute,
  modifiers: MechanicsObject[],
) {
  const { traits, components: ownedComponents } = traitModifierOwner(
    components,
    route,
  );
  modifierEntries(modifiers);
  return mechanicsPatch(
    components,
    route.trait,
    traits.map((trait) =>
      mechanicsId(trait) === route.trait.childId
        ? {
            ...trait,
            components: { ...ownedComponents, modifiers },
          }
        : trait,
    ),
  );
}
export const modifierOperations = [
  "add",
  "subtract",
  "multiply",
  "divide",
  "set",
  "minimum",
  "maximum",
  "grant-advantage",
  "grant-disadvantage",
  "grant-proficiency",
  "grant-expertise",
  "allow",
  "prohibit",
];
export const modifierStacking = [
  "stack",
  "highest",
  "lowest",
  "replace",
  "unique-by-source",
];
export function newTraitModifier(): MechanicsObject {
  return { id: crypto.randomUUID(), target: "", operation: "add" };
}
