import type { JsonValue } from "@aow/common";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";

export const numericExpressionKinds = [
  "constant",
  "path",
  "attribute-modifier",
  "proficiency-bonus",
  "level",
  "resource",
  "arithmetic",
  "conditional",
] as const;
export const scalarExpressionKinds = [
  ...numericExpressionKinds,
  "literal",
  "dice",
  "attribute-score",
  "skill-bonus",
  "collection-count",
  "lookup",
  "choice-value",
  "event-value",
] as const;
export const ruleLabel = (value: string) =>
  value
    .replace(
      /([a-z])([A-Z])/g,
      (_, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`,
    )
    .replaceAll("-", " ")
    .replace(/^./, (s) => s.toUpperCase());
export function newRuleExpression(kind: string): MechanicsObject {
  const fields: Record<string, MechanicsObject> = {
    constant: { value: 0 },
    path: { path: "" },
    "attribute-modifier": { attribute: "aow:attribute-might" },
    "attribute-score": { attribute: "aow:attribute-might" },
    resource: { resource: "" },
    arithmetic: { operator: "add", operands: [] },
    conditional: {
      predicate: "",
      whenTrue: { kind: "constant", value: 0 },
      whenFalse: { kind: "constant", value: 0 },
    },
    literal: { value: "" },
    dice: { expression: { terms: [] } },
    "skill-bonus": { skillDefinitionId: "" },
    "collection-count": { path: "" },
    lookup: { table: "", key: { kind: "literal", value: "" } },
    "choice-value": { choiceId: "" },
    "event-value": { path: "" },
  };
  return { kind, ...fields[kind] };
}
/** Kind replacement removes only the known grammar fields; extension fields survive. */
export function replaceRuleKind(
  value: unknown,
  next: MechanicsObject,
  knownFields: readonly string[],
): MechanicsObject {
  const result = { ...mechanicsObject(value) };
  for (const key of knownFields) delete result[key];
  return { ...result, ...next };
}
export function setRuleField(
  value: MechanicsObject,
  key: string,
  next: JsonValue | undefined,
): MechanicsObject {
  const result = { ...value };
  if (next === undefined) delete result[key];
  else return { ...value, [key]: next };
  return result;
}
export function moveRuleEntry(
  values: readonly JsonValue[],
  index: number,
  direction: -1 | 1,
): JsonValue[] {
  const next = [...values],
    destination = index + direction;
  if (
    index >= 0 &&
    index < next.length &&
    destination >= 0 &&
    destination < next.length
  ) {
    [next[index], next[destination]] = [next[destination]!, next[index]!];
  }
  return next;
}
export function renameJsonProperty(
  value: MechanicsObject,
  previous: string,
  next: string,
): MechanicsObject {
  if (previous === next) return value;
  if (Object.hasOwn(value, next))
    throw new Error("A field already uses this name.");
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key === previous ? next : key,
      entry,
    ]),
  );
}
