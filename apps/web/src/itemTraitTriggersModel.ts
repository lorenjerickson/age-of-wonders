import {
  mechanicsId,
  mechanicsTraitOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { effectEntries } from "./itemActionOutcomesModel";
export const triggerEvents: readonly string[] = [
  "before-d20-test",
  "after-d20-test",
  "before-attack",
  "after-attack",
  "hit",
  "miss",
  "critical-hit",
  "before-damage",
  "after-damage",
  "damage-taken",
  "healed",
  "reduced-to-zero-hp",
  "death",
  "turn-start",
  "turn-end",
  "round-start",
  "round-end",
  "move",
  "enter-area",
  "leave-area",
  "condition-applied",
  "condition-removed",
  "discipline-activated",
  "rest-start",
  "rest-complete",
  "resource-spent",
  "profession-action-used",
  "profession-advanced",
  "custom",
];
export function parseTraitTriggerRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (
    parts[0] !== "traits" ||
    parts[2] !== "triggers" ||
    parts.length > 6 ||
    (parts.length > 4 && parts[4] !== "effects")
  )
    return;
  const traitPath = parts.slice(0, 2).join("/"),
    trait = parseMechanicsRoute(traitPath);
  if (!trait?.childId || trait.childId === "new") return;
  try {
    const triggerIndex =
        parts[3] === undefined ? undefined : decodeURIComponent(parts[3]),
      effectIndex =
        parts[5] === undefined ? undefined : decodeURIComponent(parts[5]);
    for (const index of [triggerIndex, effectIndex])
      if (
        index !== undefined &&
        index !== "new" &&
        (!/^(0|[1-9]\d*)$/.test(index) || !Number.isSafeInteger(Number(index)))
      )
        return;
    if (parts[4] && triggerIndex === "new") return;
    return {
      trait,
      traitPath,
      triggerIndex,
      effects: parts[4] === "effects",
      effectIndex,
    };
  } catch {
    return;
  }
}
export type TraitTriggerRoute = NonNullable<
  ReturnType<typeof parseTraitTriggerRoute>
>;
export function traitTriggerOwner(
  components: MechanicsObject,
  route: TraitTriggerRoute,
) {
  const owner = mechanicsTraitOwner(components, route.trait.childId!);
  return { ...owner, triggers: effectEntries(owner.components.triggers) };
}
export function traitTriggersPatch(
  components: MechanicsObject,
  route: TraitTriggerRoute,
  triggers: MechanicsObject[],
) {
  const { traits, components: ownedComponents } = traitTriggerOwner(
    components,
    route,
  );
  effectEntries(triggers);
  return mechanicsPatch(
    components,
    route.trait,
    traits.map((trait) =>
      mechanicsId(trait) === route.trait.childId
        ? { ...trait, components: { ...ownedComponents, triggers } }
        : trait,
    ),
  );
}
