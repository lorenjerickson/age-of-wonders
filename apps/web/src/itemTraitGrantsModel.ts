import {
  mechanicsId,
  mechanicsTraitOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
} from "./itemMechanicsModel";

export function parseTraitGrantRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "traits" || parts[2] !== "grants" || parts.length > 4)
    return;
  const traitPath = parts.slice(0, 2).join("/"),
    trait = parseMechanicsRoute(traitPath);
  if (!trait?.childId || trait.childId === "new") return;
  try {
    const grantIndex =
      parts[3] === undefined ? undefined : decodeURIComponent(parts[3]);
    if (
      grantIndex !== undefined &&
      grantIndex !== "new" &&
      !/^(0|[1-9]\d*)$/.test(grantIndex)
    )
      return;
    if (
      grantIndex !== undefined &&
      grantIndex !== "new" &&
      !Number.isSafeInteger(Number(grantIndex))
    )
      return;
    return { trait, traitPath, grantIndex };
  } catch {
    return;
  }
}
export type TraitGrantRoute = NonNullable<
  ReturnType<typeof parseTraitGrantRoute>
>;
export function grantEntries(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
    throw new Error(
      "These grants cannot be edited safely. Existing data has been preserved.",
    );
  return value;
}
export function traitGrantOwner(
  components: MechanicsObject,
  route: TraitGrantRoute,
) {
  const owner = mechanicsTraitOwner(components, route.trait.childId!);
  return { ...owner, grants: grantEntries(owner.components.grants) };
}
export function traitGrantsPatch(
  components: MechanicsObject,
  route: TraitGrantRoute,
  grants: string[],
) {
  const { traits, components: ownedComponents } = traitGrantOwner(
    components,
    route,
  );
  grantEntries(grants);
  return mechanicsPatch(
    components,
    route.trait,
    traits.map((trait) =>
      mechanicsId(trait) === route.trait.childId
        ? {
            ...trait,
            components: { ...ownedComponents, grants },
          }
        : trait,
    ),
  );
}
export function moveGrant(
  grants: string[],
  index: number,
  delta: -1 | 1,
): string[] {
  const next = [...grants],
    destination = index + delta;
  if (
    index < 0 ||
    index >= next.length ||
    destination < 0 ||
    destination >= next.length
  )
    return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
