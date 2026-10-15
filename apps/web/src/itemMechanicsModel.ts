import { protectedComparisonText } from "./protectedAuthoringText";
import type { CreateWorldItemDraftRequest, JsonValue } from "@aow/common";
export type MechanicsObject = Record<string, JsonValue>;
export function mechanicsObject(value: unknown): MechanicsObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as MechanicsObject)
    : {};
}
export function mechanicsName(
  value: unknown,
  fallback: string,
  recordIds: ReadonlySet<string> = new Set(),
) {
  const identity = mechanicsObject(mechanicsObject(value).identity);
  const ids = new Set(recordIds);
  if (typeof identity.id === "string") ids.add(identity.id);
  const name = identity.name;
  return typeof name === "string" &&
    name.trim() &&
    !protectedComparisonText(name, ids)
    ? name
    : fallback;
}
export function mechanicsId(value: unknown) {
  const id = mechanicsObject(mechanicsObject(value).identity).id;
  return typeof id === "string" ? id : "";
}
export function mechanicsEntries(value: unknown): MechanicsObject[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
  )
    throw new Error(
      "This collection contains unsupported content. Its existing data has been preserved.",
    );
  const entries = value as MechanicsObject[];
  const ids = entries.map(mechanicsId);
  if (ids.some((id) => !id || id === "new") || new Set(ids).size !== ids.length)
    throw new Error(
      "This collection needs unique record identities before it can be edited. Its existing data has been preserved.",
    );
  return entries;
}
/** Resolve a Trait once without turning supplied malformed components into an empty owner. */
export function mechanicsTraitOwner(
  components: MechanicsObject,
  traitId: string,
) {
  const traits = mechanicsEntries(components.traits);
  const trait = traits.find((entry) => mechanicsId(entry) === traitId);
  if (!trait) throw new Error("This Trait is no longer available.");
  if (
    trait.components !== undefined &&
    trait.components !== mechanicsObject(trait.components)
  )
    throw new Error(
      "This Trait cannot be edited safely. Existing data has been preserved.",
    );
  return { traits, trait, components: mechanicsObject(trait.components) };
}
export function newItemMechanic(action: boolean, id: string): MechanicsObject {
  return {
    identity: {
      id,
      key: `homebrew:${id}`,
      name: "",
      source: { namespace: "homebrew", edition: "1" },
    },
    kind: action ? "action" : "trait",
    components: action ? { activation: "action", outcomes: [] } : {},
  };
}
export interface MechanicsRoute {
  collection: "traits" | "actions" | "vehicle";
  childId?: string;
  traitId?: string;
  vehicleActions?: boolean;
}
export function parseMechanicsRoute(path: string): MechanicsRoute | undefined {
  let parts: string[];
  try {
    parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
  if (parts[0] === "vehicle") {
    if (parts.length === 1) return { collection: "vehicle" };
    if (parts[1] === "actions" && parts.length <= 3)
      return { collection: "actions", vehicleActions: true, childId: parts[2] };
  }
  if (parts[0] === "traits" && parts[2] === "actions" && parts.length <= 4)
    return { collection: "actions", traitId: parts[1], childId: parts[3] };
  if ((parts[0] === "traits" || parts[0] === "actions") && parts.length <= 2)
    return { collection: parts[0], childId: parts[1] };
}
export function mechanicsOwner(
  components: MechanicsObject,
  route: MechanicsRoute,
): MechanicsObject {
  if (route.traitId) {
    const trait = mechanicsEntries(components.traits).find(
      (t) => mechanicsId(t) === route.traitId,
    );
    if (!trait) throw new Error("This Trait is no longer in the Item.");
    if (
      trait.components !== undefined &&
      trait.components !== mechanicsObject(trait.components)
    )
      throw new Error(
        "This Trait contains unsupported components. Its existing data has been preserved.",
      );
    return mechanicsObject(trait.components);
  }
  if (route.vehicleActions) {
    if (!components.vehicle)
      throw new Error("Save Vehicle details before adding its Actions.");
    if (components.vehicle !== mechanicsObject(components.vehicle))
      throw new Error(
        "This Vehicle contains unsupported content. Its existing data has been preserved.",
      );
    return mechanicsObject(components.vehicle);
  }
  return components;
}
export function mechanicsPatch(
  components: MechanicsObject,
  route: MechanicsRoute,
  value: JsonValue,
): Pick<CreateWorldItemDraftRequest, "traits" | "actions" | "vehicle"> {
  mechanicsOwner(components, route);
  if (route.traitId)
    return {
      traits: mechanicsEntries(components.traits).map((t) =>
        mechanicsId(t) === route.traitId
          ? {
              ...t,
              components: { ...mechanicsObject(t.components), actions: value },
            }
          : t,
      ) as unknown as CreateWorldItemDraftRequest["traits"],
    };
  if (route.vehicleActions)
    return {
      vehicle: {
        ...mechanicsObject(components.vehicle),
        actions: value,
      } as unknown as NonNullable<CreateWorldItemDraftRequest["vehicle"]>,
    };
  return { [route.collection]: value } as Pick<
    CreateWorldItemDraftRequest,
    "traits" | "actions" | "vehicle"
  >;
}
export function itemMechanicsSaveInput(
  payload: MechanicsObject,
  revision: number,
  patch: Pick<CreateWorldItemDraftRequest, "traits" | "actions" | "vehicle">,
): CreateWorldItemDraftRequest {
  const identity = mechanicsObject(payload.identity),
    components = mechanicsObject(payload.components),
    modelValues = mechanicsObject(payload.modelValues),
    equippable = mechanicsObject(components.equippable);
  if (
    payload.kind !== "item" ||
    typeof modelValues["aow:item-family"] !== "string"
  )
    throw new Error("Save this Item’s Overview before editing its mechanics.");
  // The compatibility endpoint requires overview fields even for a nested edit.
  // Never manufacture replacements for supplied malformed imported values.
  if (
    payload.identity !== identity ||
    payload.components !== components ||
    payload.modelValues !== modelValues ||
    typeof identity.name !== "string" ||
    (identity.description !== undefined &&
      typeof identity.description !== "string") ||
    typeof components.category !== "string" ||
    typeof components.quality !== "string" ||
    (components.equippable !== undefined &&
      components.equippable !== equippable) ||
    (components.equippable !== undefined &&
      (!Array.isArray(equippable.compatibleSlotSets) ||
        equippable.compatibleSlotSets.some(
          (set) =>
            !Array.isArray(set) || set.some((slot) => typeof slot !== "string"),
        )))
  )
    throw new Error(
      "This Item’s Overview contains unsupported data. Existing data has been preserved.",
    );
  return {
    expectedStorageRevision: revision,
    name: identity.name,
    ...(identity.description !== undefined
      ? { description: identity.description as string }
      : {}),
    itemFamilyKey: modelValues[
      "aow:item-family"
    ] as CreateWorldItemDraftRequest["itemFamilyKey"],
    category: components.category,
    quality: components.quality as CreateWorldItemDraftRequest["quality"],
    compatibleEquipmentSlotSets: (equippable.compatibleSlotSets ??
      []) as unknown as CreateWorldItemDraftRequest["compatibleEquipmentSlotSets"],
    ...patch,
  };
}
