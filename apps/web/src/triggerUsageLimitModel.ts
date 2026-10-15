import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";

export const usageLimitKinds = [
  ["uses", "Uses"],
  ["recharge", "Recharge"],
  ["once-per-turn", "Once per turn"],
  ["once-per-round", "Once per round"],
  ["once-per-encounter", "Once per encounter"],
  ["resource", "Resource"],
] as const;

export function newUsageLimit(kind: string): MechanicsObject {
  switch (kind) {
    case "uses":
      return { kind, maximum: { kind: "constant", value: 1 } };
    case "recharge":
      return { kind, die: 6, succeedsOn: [6] };
    case "resource":
      return { kind, resource: "" };
    case "once-per-turn":
    case "once-per-round":
    case "once-per-encounter":
      return { kind };
    default:
      throw new Error("Select a supported usage limit.");
  }
}

export function withoutUsageField(
  value: MechanicsObject,
  key: string,
): MechanicsObject {
  const next = { ...value };
  delete next[key];
  return next;
}

export function replaceUsageLimitKind(
  value: unknown,
  kind: string,
): MechanicsObject {
  const previous = mechanicsObject(value);
  if (previous.kind === kind) return previous;
  const next = { ...previous };
  for (const key of ["maximum", "resetsOn", "die", "succeedsOn", "resource"])
    delete next[key];
  return { ...next, ...newUsageLimit(kind) };
}

export function editableMaximum(value: unknown): boolean {
  const maximum = mechanicsObject(value);
  return maximum.kind === "constant" || maximum.kind === "path";
}
