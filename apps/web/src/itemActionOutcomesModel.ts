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
export interface OutcomeRoute {
  action: MechanicsRoute;
  actionPath: string;
  outcomeId?: string;
  effects: boolean;
  effectIndex?: string;
}
export function parseOutcomeRoute(path: string): OutcomeRoute | undefined {
  const parts = path.split("/").filter(Boolean);
  const at =
    parts[0] === "actions"
      ? 2
      : parts[0] === "vehicle"
        ? 3
        : parts[0] === "traits"
          ? 4
          : -1;
  if (at < 0 || parts[at] !== "outcomes") return;
  const actionPath = parts.slice(0, at).join("/");
  const action = parseMechanicsRoute(actionPath);
  if (
    !action ||
    action.collection !== "actions" ||
    !action.childId ||
    action.childId === "new"
  )
    return;
  const tail = parts.slice(at + 1);
  if (
    tail.length > 3 ||
    (tail.length > 1 && tail[1] !== "effects") ||
    (tail[2] && tail[2] !== "new" && !/^(0|[1-9]\d*)$/.test(tail[2]))
  )
    return;
  try {
    return {
      action,
      actionPath,
      outcomeId: tail[0] && decodeURIComponent(tail[0]),
      effects: tail[1] === "effects",
      effectIndex: tail[2],
    };
  } catch {
    return;
  }
}
export function outcomeEntries(value: unknown): MechanicsObject[] {
  const values = effectEntries(value);
  const ids = values.map((v) => v.id);
  if (
    ids.some((id) => typeof id !== "string" || !id || id === "new") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "Outcomes need unique identities before editing. Existing data has been preserved.",
    );
  return values;
}
export function effectEntries(value: unknown): MechanicsObject[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
  )
    throw new Error(
      "This collection contains unsupported data. Existing data has been preserved.",
    );
  return value as MechanicsObject[];
}
export function actionOutcomesPatch(
  components: MechanicsObject,
  route: OutcomeRoute,
  outcomes: MechanicsObject[],
) {
  const actions = mechanicsEntries(
    mechanicsOwner(components, route.action).actions,
  );
  const action = actions.find((a) => mechanicsId(a) === route.action.childId);
  if (
    action?.components !== undefined &&
    action.components !== mechanicsObject(action.components)
  )
    throw new Error(
      "This Action contains unsupported data. Existing data has been preserved.",
    );
  if (!action) throw new Error("This Action is no longer available.");
  return mechanicsPatch(
    components,
    route.action,
    actions.map((a) =>
      mechanicsId(a) === route.action.childId
        ? { ...a, components: { ...mechanicsObject(a.components), outcomes } }
        : a,
    ),
  );
}
export function moveEntry<T>(entries: T[], index: number, delta: number): T[] {
  const next = [...entries],
    target = index + delta;
  if (
    index < 0 ||
    index >= entries.length ||
    target < 0 ||
    target >= entries.length
  )
    return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
export { createRuleEffect as newRuleEffect } from "./ruleEffectModel";
