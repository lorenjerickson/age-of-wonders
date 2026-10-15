export interface CombatCompatibilityIssue {
  readonly code:
    "legacy-encounter" | "turn-event" | "turn-usage" | "turn-duration";
  /** Machine path for diagnostics; human projections should use the supplied message. */
  readonly path: string;
  readonly message: string;
}
/** Historical content remains decodable; these semantics cannot execute in plan-based combat. */
export function combatCompatibilityIssues(
  value: unknown,
): readonly CombatCompatibilityIssue[] {
  const issues: CombatCompatibilityIssue[] = [];
  const visit = (node: unknown, path: string, depth: number) => {
    if (depth > 64 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) =>
        visit(entry, `${path}[${index}]`, depth + 1),
      );
      return;
    }
    const data = node as Record<string, unknown>;
    if (
      ("turnIndex" in data ||
        "activeCombatantId" in data ||
        Array.isArray(data.initiative)) &&
      Array.isArray(data.combatants)
    )
      issues.push({
        code: "legacy-encounter",
        path,
        message:
          "This saved encounter uses individual turns. Preserve its history and start a new planned encounter from reviewed current positions and health.",
      });
    if (
      [data.event, data.resetsOn].some(
        (event) => event === "turn-start" || event === "turn-end",
      )
    )
      issues.push({
        code: "turn-event",
        path,
        message:
          "A selected rule depends on a combatant turn. Author an explicit round or activity trigger before using it in planned combat.",
      });
    if (data.kind === "once-per-turn")
      issues.push({
        code: "turn-usage",
        path,
        message:
          "A selected rule has a once-per-turn limit. Choose an explicit round or activity limit before using it in planned combat.",
      });
    if (
      data.kind === "measured" &&
      (data.unit === "turn" || data.unit === "turns")
    )
      issues.push({
        code: "turn-duration",
        path,
        message:
          "A selected effect lasts for individual turns. Choose an explicit round or event duration before using it in planned combat.",
      });
    for (const [key, child] of Object.entries(data)) {
      // Private notes/extensions may contain arbitrary text or unrelated imported metadata.
      if (key !== "extensions" && key !== "sourceSheet")
        visit(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  visit(value, "", 0);
  return issues;
}
