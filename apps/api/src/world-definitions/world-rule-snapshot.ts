import { validateWorldRules, WORLD_RULE_RESOURCE } from "@aow/common";

/** World rules are snapshot-owned components, never generic mutable rule-variant resources. */
export function worldRuleSnapshotIssue(
  records: readonly {
    resourceType: string;
    sourceId: string;
    sourceRevision?: number;
    payload: unknown;
  }[],
): string | undefined {
  const rules = records.filter(
    (record) => record.resourceType === WORLD_RULE_RESOURCE,
  );
  const report = validateWorldRules(rules.map((record) => record.payload));
  if (!report.valid) return report.issues.join(" ");
  for (const record of rules) {
    const rule = record.payload as { id: string; revision: number };
    if (
      rule.id !== record.sourceId ||
      (record.sourceRevision !== undefined &&
        rule.revision !== record.sourceRevision)
    )
      return "A World rule's captured identity or revision is inconsistent.";
  }
  return undefined;
}
