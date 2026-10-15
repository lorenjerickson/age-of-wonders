import type {
  CombatActivity,
  CombatContribution,
  CombatProfile,
} from "@aow/common";

export const combatFormulaNames = [
  "attack",
  "defense",
  "damage",
  "resistance",
  "might",
] as const;
export type CombatFormulaName = (typeof combatFormulaNames)[number];
/** Explicit GM input only: blank values never become fabricated zeroes. */
export function parseCombatTerms(value: string): CombatContribution["terms"] {
  const compact = value.replace(/\s/g, "");
  if (
    !compact ||
    !/^[+-]?(?:\d+d\d+|\d+)(?:[+-](?:\d+d\d+|\d+))*$/i.test(compact)
  )
    throw new Error("Enter dice and whole numbers, for example 1d20 + 2 or 0.");
  return (compact.match(/[+-]?(?:\d+d\d+|\d+)/gi) ?? []).map((term) => {
    const match = /^([+-]?)(\d+)d(\d+)$/i.exec(term);
    if (!match) return { kind: "constant" as const, value: Number(term) };
    const count = Number(match[2]),
      sides = Number(match[3]);
    if (count < 1 || count > 100 || sides < 2 || sides > 1000)
      throw new Error("Use 1–100 dice with 2–1000 sides.");
    return {
      kind: "dice" as const,
      count,
      sides,
      sign: (match[1] === "-" ? -1 : 1) as 1 | -1,
    };
  });
}
export function formatCombatTerms(terms: CombatContribution["terms"]): string {
  return terms
    .map((term) =>
      term.kind === "constant"
        ? String(term.value)
        : `${term.sign < 0 ? "-" : ""}${term.count}d${term.sides}`,
    )
    .join(" + ")
    .replace(/\+ -/g, "− ");
}
export function reorderCombatActivities(
  activities: readonly CombatActivity[],
  index: number,
  direction: -1 | 1,
): CombatActivity[] {
  const next = [...activities],
    to = index + direction;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length)
    return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
export function emptyCombatProfile(): CombatProfile {
  return {
    attackCost: { kind: "free" },
    reactions: [],
    attack: [],
    defense: [],
    damage: [],
    resistance: [],
    might: [],
    reachSquares: 1,
    movementCheckpoints: 6,
    resources: {},
    rules: [],
    pairings: [],
  };
}
