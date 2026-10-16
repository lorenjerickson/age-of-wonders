import type { WorldDraftRecord } from "./api";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { visibleRecordName } from "./recordDisplay";

export const characterBenefitKinds = [
  {
    key: "grantedConditions",
    reference: "conditionId",
    resource: "world-conditions",
    noun: "Condition",
  },
  {
    key: "grantedEffects",
    reference: "effectId",
    resource: "world-effects",
    noun: "Effect",
  },
] as const;
export type CharacterBenefitKind = (typeof characterBenefitKinds)[number];

export function characterBenefitOptions(
  records: readonly WorldDraftRecord[],
  kind: CharacterBenefitKind,
) {
  const ids = new Set(records.map((record) => record.sourceId));
  const matches = records.filter(
    (record) => record.resourceType === kind.resource,
  );
  return matches
    .filter(
      (record) =>
        matches.filter((other) => other.sourceId === record.sourceId).length ===
        1,
    )
    .map((record) => ({
      id: record.sourceId,
      label: visibleRecordName(
        record,
        `Unnamed ${kind.noun.toLowerCase()}`,
        ids,
      ),
    }));
}

/** Change only the chosen reference; retained imported metadata belongs to its grant. */
export function replaceCharacterBenefitReference(
  entry: unknown,
  kind: CharacterBenefitKind,
  id: string,
): MechanicsObject {
  const current = mechanicsObject(entry);
  if (entry !== current)
    throw new Error(
      "Replace the unsupported grant explicitly before choosing a reference.",
    );
  return { ...current, [kind.reference]: id };
}

export function characterBenefitSummary(
  components: MechanicsObject,
  records: readonly WorldDraftRecord[],
): string[] {
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  const tiers = Array.isArray(components.expertiseLevels)
    ? components.expertiseLevels
    : [];
  const modifierCount =
    count(components.modifierGrants) +
    count(components.modifiers) +
    tiers.reduce((total: number, tier) => {
      const benefits = mechanicsObject(mechanicsObject(tier).benefits);
      return total + count(benefits.modifierGrants) + count(benefits.modifiers);
    }, 0);
  const summary = modifierCount
    ? [`${modifierCount} modifier${modifierCount === 1 ? "" : "s"}`]
    : [];
  for (const kind of characterBenefitKinds) {
    const grants = components[kind.key];
    if (grants === undefined) continue;
    if (!Array.isArray(grants)) {
      summary.push(`Existing ${kind.noun.toLowerCase()} grants preserved`);
      continue;
    }
    const options = characterBenefitOptions(records, kind);
    if (grants.length)
      summary.push(
        `${kind.noun}s: ${grants.map((grant) => options.find((option) => option.id === mechanicsObject(grant)[kind.reference])?.label ?? `Unavailable ${kind.noun.toLowerCase()}`).join(", ")}`,
      );
  }
  return summary;
}
