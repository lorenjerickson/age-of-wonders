import {
  mechanicsEntries,
  mechanicsId,
  mechanicsObject,
  mechanicsOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
  type MechanicsRoute,
} from "./itemMechanicsModel";
import { effectEntries } from "./itemActionOutcomesModel";
import { isOpaqueItemBinding } from "./itemActionCostsModel";
export interface ChoiceRoute {
  entity: MechanicsRoute;
  entityPath: string;
  ownerKind: "action" | "trait";
  choiceId?: string;
  options: boolean;
  optionId?: string;
}
export function parseChoiceRoute(path: string): ChoiceRoute | undefined {
  const parts = path.split("/").filter(Boolean);
  const at =
    parts[0] === "actions"
      ? 2
      : parts[0] === "vehicle"
        ? 3
        : parts[0] === "traits"
          ? parts[2] === "choices"
            ? 2
            : 4
          : -1;
  if (at < 0 || parts[at] !== "choices") return;
  const entityPath = parts.slice(0, at).join("/"),
    entity = parseMechanicsRoute(entityPath),
    tail = parts.slice(at + 1);
  if (
    !entity ||
    (entity.collection !== "actions" && entity.collection !== "traits") ||
    !entity.childId ||
    entity.childId === "new" ||
    tail.length > 3 ||
    (tail.length > 1 && (tail[1] !== "options" || tail[0] === "new"))
  )
    return;
  try {
    if (tail.length > 1 && decodeURIComponent(tail[0]) === "new") return;
    return {
      entity,
      entityPath,
      ownerKind: entity.collection === "traits" ? "trait" : "action",
      choiceId: tail[0] && decodeURIComponent(tail[0]),
      options: tail[1] === "options",
      optionId: tail[2] && decodeURIComponent(tail[2]),
    };
  } catch {
    return;
  }
}
export function choiceEntries(value: unknown): MechanicsObject[] {
  const entries = effectEntries(value),
    ids = entries.map((v) => v.id);
  if (
    ids.some((id) => typeof id !== "string" || !id || id === "new") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "Choices and options need unique identities before editing. Existing data has been preserved.",
    );
  return entries;
}
export function choiceEntity(
  components: MechanicsObject,
  route: ChoiceRoute,
): MechanicsObject | undefined {
  return mechanicsEntries(
    mechanicsOwner(components, route.entity)[route.entity.collection],
  ).find((entry) => mechanicsId(entry) === route.entity.childId);
}
export function itemChoicesPatch(
  components: MechanicsObject,
  route: ChoiceRoute,
  choices: MechanicsObject[],
) {
  const entities = mechanicsEntries(
    mechanicsOwner(components, route.entity)[route.entity.collection],
  );
  if (!entities.some((entity) => mechanicsId(entity) === route.entity.childId))
    throw new Error(
      `This ${route.ownerKind === "trait" ? "Trait" : "Action"} is no longer available.`,
    );
  return mechanicsPatch(
    components,
    route.entity,
    entities.map((entity) =>
      mechanicsId(entity) === route.entity.childId
        ? {
            ...entity,
            components: { ...mechanicsObject(entity.components), choices },
          }
        : entity,
    ),
  );
}
export function newChoice(): MechanicsObject {
  return { id: crypto.randomUUID(), prompt: "", minimum: 1, maximum: 1 };
}
export function newChoiceOption(): MechanicsObject {
  return { id: crypto.randomUUID(), label: "", value: "" };
}
export function editableOptionValue(
  value: unknown,
  recordIds: ReadonlySet<string>,
): boolean {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      !isOpaqueItemBinding(value) &&
      !recordIds.has(value))
  );
}
