import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import type { WorldRule, WorldRulePredicate } from "@aow/common";
export type WorldRuleRoute = {
  kind:
    | "list"
    | "new"
    | "edit"
    | "effects"
    | "effect"
    | "conditions"
    | "condition"
    | "invalid";
  ruleId?: string;
  index?: number;
  path: number[];
  adding?: boolean;
};
export function parseWorldRuleRoute(pathname: string): WorldRuleRoute {
  const segments = pathname.split("/");
  const invalid: WorldRuleRoute = { kind: "invalid", path: [] };
  if (segments[1] !== "worlds" || !segments[2] || segments[3] !== "rules")
    return invalid;
  const pieces = segments.slice(4).filter(Boolean);
  if (!pieces.length) return { kind: "list", path: [] };
  if (pieces.length === 1 && pieces[0] === "new")
    return { kind: "new", path: [] };
  let ruleId: string;
  try {
    ruleId = decodeURIComponent(pieces.shift()!);
  } catch {
    return invalid;
  }
  const base = { ruleId, path: [] as number[] };
  if (pieces.join("/") === "edit") return { ...base, kind: "edit" };
  if (pieces[0] === "effects") {
    if (pieces.length === 1) return { ...base, kind: "effects" };
    if (pieces.length === 2 && pieces[1] === "new")
      return { ...base, kind: "effect", adding: true };
    if (
      pieces.length === 3 &&
      /^[1-9]\d*$/.test(pieces[1]!) &&
      pieces[2] === "edit" &&
      Number.isSafeInteger(Number(pieces[1]))
    )
      return { ...base, kind: "effect", index: Number(pieces[1]) - 1 };
    return invalid;
  }
  if (pieces.shift() !== "conditions") return invalid;
  const path: number[] = [];
  while (
    pieces[0] === "children" &&
    /^[1-9]\d*$/.test(pieces[1] ?? "") &&
    Number.isSafeInteger(Number(pieces[1]))
  ) {
    pieces.shift();
    path.push(Number(pieces.shift()) - 1);
  }
  if (!pieces.length) return { ruleId, path, kind: "conditions" };
  if (pieces.length === 1 && (pieces[0] === "edit" || pieces[0] === "new"))
    return { ruleId, path, kind: "condition", adding: pieces[0] === "new" };
  return invalid;
}
export function worldRuleConditionAt(
  rule: WorldRule,
  path: readonly number[],
): WorldRulePredicate | undefined {
  let value = rule.condition;
  for (const index of path) {
    if (!value || !Number.isSafeInteger(index) || index < 0) return undefined;
    if (value.kind === "all" || value.kind === "any")
      value = Array.isArray(value.predicates)
        ? value.predicates[index]
        : undefined;
    else if (value.kind === "not" && index === 0) value = value.predicate;
    else return undefined;
  }
  return value;
}
export function replaceWorldRuleCondition(
  rule: WorldRule,
  path: readonly number[],
  next: WorldRulePredicate | undefined,
): WorldRule | undefined {
  if (!path.length) {
    const result = { ...rule };
    if (next === undefined) delete result.condition;
    else result.condition = next;
    return result;
  }
  const parent = worldRuleConditionAt(rule, path.slice(0, -1));
  const index = path.at(-1)!;
  if (!parent || !worldRuleConditionAt(rule, path)) return undefined;
  if (
    (parent.kind === "all" || parent.kind === "any") &&
    Array.isArray(parent.predicates)
  )
    return replaceWorldRuleCondition(rule, path.slice(0, -1), {
      ...parent,
      predicates:
        next === undefined
          ? parent.predicates.filter((_, i) => i !== index)
          : parent.predicates.map((entry, i) => (i === index ? next : entry)),
    });
  if (parent.kind === "not" && index === 0 && next)
    return replaceWorldRuleCondition(rule, path.slice(0, -1), {
      ...parent,
      predicate: next,
    });
  return undefined;
}
export function worldRuleConditionChildren(
  value: WorldRulePredicate | undefined,
): readonly WorldRulePredicate[] | undefined {
  if (value?.kind === "all" || value?.kind === "any")
    return Array.isArray(value.predicates) ? value.predicates : undefined;
  if (value?.kind === "not")
    return value.predicate ? [value.predicate] : undefined;
  return undefined;
}

export function worldRuleVisibleText(
  value: unknown,
  fallback: string,
  ids: readonly string[] = [],
): string {
  return typeof value === "string" &&
    value.trim() &&
    !protectedComparisonText(value, new Set(ids))
    ? value
    : fallback;
}
