import { ProfessionDefinition } from "@aow/domain";
import type { JsonValue } from "./api";

export type ProfessionModifierLevel = Record<string, JsonValue>;
export function modifierObject(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}
export function professionModifierLevels(
  components: Record<string, JsonValue>,
): ProfessionModifierLevel[] {
  return Array.isArray(components.expertiseLevels) &&
    components.expertiseLevels.length
    ? components.expertiseLevels.map(modifierObject)
    : [{ rank: 0, benefits: {} }];
}
export function levelModifierGrants(
  level: ProfessionModifierLevel,
): Record<string, JsonValue>[] {
  const grants = modifierObject(level.benefits).modifierGrants;
  return Array.isArray(grants) ? grants.map(modifierObject) : [];
}
export function withLevelModifierGrants(
  levels: ProfessionModifierLevel[],
  index: number,
  grants: Record<string, JsonValue>[],
) {
  return ProfessionDefinition.withLevelModifierGrants(levels, index, grants);
}
export function professionModifiersValid(levels: ProfessionModifierLevel[]) {
  const profession = ProfessionDefinition.deserializePayload({
    kind: "profession",
    components: { expertiseLevels: levels },
  });
  try {
    // This editor validates grants only; publication resolves the full Model context.
    return !profession.state.metadata.validity.issues.some(
      (issue) => issue.code === "profession-canonical-components",
    );
  } finally {
    profession.dispose();
  }
}
