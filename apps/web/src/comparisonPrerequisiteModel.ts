import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
export { protectedComparisonText } from "./protectedAuthoringText";

export const comparisonOperators = {
  eq: "Equals",
  ne: "Does not equal",
  lt: "Less than",
  lte: "Less than or equal",
  gt: "Greater than",
  gte: "Greater than or equal",
  includes: "Includes",
  matches: "Matches",
};
export const comparisonOperandKinds = {
  constant: "Number",
  literal: "Literal value",
  path: "Value from a path",
  "event-value": "Event value",
  "collection-count": "Collection count",
};
export function newComparisonOperand(kind: string): MechanicsObject {
  if (kind === "constant") return { kind, value: 0 };
  if (kind === "literal") return { kind, value: "" };
  if (["path", "event-value", "collection-count"].includes(kind))
    return { kind, path: "" };
  throw new Error("Unsupported comparison operand.");
}
export function editableComparisonOperand(value: unknown): boolean {
  const operand = mechanicsObject(value);
  if (
    typeof operand.kind !== "string" ||
    !Object.hasOwn(comparisonOperandKinds, operand.kind)
  )
    return false;
  return (
    operand.kind !== "literal" ||
    operand.value === null ||
    ["string", "number", "boolean", "undefined"].includes(typeof operand.value)
  );
}
export function updateComparisonOperand(
  value: unknown,
  key: string,
  next: MechanicsObject[string],
): MechanicsObject {
  return { ...mechanicsObject(value), [key]: next };
}
