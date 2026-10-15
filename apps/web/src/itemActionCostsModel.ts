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
export interface CostRoute {
  action: MechanicsRoute;
  actionPath: string;
  costIndex?: string;
}
export function parseCostRoute(path: string): CostRoute | undefined {
  const parts = path.split("/").filter(Boolean);
  const at =
    parts[0] === "actions"
      ? 2
      : parts[0] === "vehicle"
        ? 3
        : parts[0] === "traits"
          ? 4
          : -1;
  if (at < 0 || parts[at] !== "costs" || parts.length > at + 2) return;
  const actionPath = parts.slice(0, at).join("/"),
    action = parseMechanicsRoute(actionPath),
    costIndex = parts[at + 1];
  if (
    !action ||
    action.collection !== "actions" ||
    !action.childId ||
    action.childId === "new" ||
    (costIndex && costIndex !== "new" && !/^(0|[1-9]\d*)$/.test(costIndex))
  )
    return;
  return { action, actionPath, costIndex };
}
export function actionCostsPatch(
  components: MechanicsObject,
  route: CostRoute,
  costs: MechanicsObject[],
) {
  const actions = mechanicsEntries(
    mechanicsOwner(components, route.action).actions,
  );
  if (!actions.some((a) => mechanicsId(a) === route.action.childId))
    throw new Error("This Action is no longer available.");
  return mechanicsPatch(
    components,
    route.action,
    actions.map((a) =>
      mechanicsId(a) === route.action.childId
        ? { ...a, components: { ...mechanicsObject(a.components), costs } }
        : a,
    ),
  );
}
export const costKinds = [
  "economy",
  "resource",
  "capacity",
  "item-use",
  "hit-die",
  "movement",
];
export function newActionCost(kind: string): MechanicsObject {
  switch (kind) {
    case "economy":
      return { kind, activation: "action" };
    case "resource":
      return {
        kind,
        cost: { resource: "", amount: { kind: "constant", value: 0 } },
      };
    case "capacity":
      return { kind, band: "chosen" };
    case "item-use":
      return { kind, item: "" };
    case "hit-die":
      return { kind, amount: 1 };
    case "movement":
      return { kind, distance: { value: 0, unit: "foot" } };
    default:
      throw new Error("Unsupported cost kind.");
  }
}

// Imported identifiers are retained without exposing them as author-facing labels.
export { isOpaqueItemBinding } from "./protectedAuthoringText";
