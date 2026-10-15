import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
export type ProfessionRankOption = { key: string; name: string };
export const professionRuleTypes = [
  "profession",
  "profession-tier",
  "profession-benefits",
  "profession-acquisition",
  "profession-action",
  "profession-improvement",
  "profession-window",
  "modifier-grant",
] as const;
export type ProfessionRuleType = (typeof professionRuleTypes)[number];
export function newProfessionRule(
  type: ProfessionRuleType,
  ranks: readonly ProfessionRankOption[] = [],
): MechanicsObject {
  const tier = ranks[0]?.key ?? "";
  switch (type) {
    case "profession-tier":
      return { tier, rank: 1, benefits: {} };
    case "profession-acquisition":
      return { kind: "character-creation", startingExpertise: tier };
    case "profession-action":
      return {
        actionId: "",
        unlocksAt: tier,
        advancementPointsOnUse: { kind: "constant", value: 1 },
      };
    case "profession-improvement":
      return { atExpertise: tier };
    case "profession-window":
      return { kind: "any-time" };
    case "modifier-grant":
      return {
        id: crypto.randomUUID(),
        label: "",
        kind: "rolled-flat",
        stacking: "add",
        target: { kind: "health-maximum" },
        dice: [{ count: 1, sides: 4 }],
      };
    default:
      return {};
  }
}
/** Only intentional tier collection/identity edits reconcile its parallel order. */
export function syncProfessionTierOrder(
  before: MechanicsObject,
  next: MechanicsObject,
  segments: readonly string[],
): MechanicsObject {
  if (
    segments[0] !== "expertiseLevels" ||
    segments.length > 2 ||
    !Array.isArray(next.expertiseLevels)
  )
    return next;
  const changed =
    segments.length === 1 ||
    segments[1] === "new" ||
    !Array.isArray(before.expertiseLevels) ||
    before.expertiseLevels.length !== next.expertiseLevels.length ||
    next.expertiseLevels.some(
      (entry, i) =>
        mechanicsObject(entry).tier !==
        mechanicsObject((before.expertiseLevels as unknown[])[i]).tier,
    );
  if (!changed) return next;
  const tiers = next.expertiseLevels.map(
    (entry) => mechanicsObject(entry).tier,
  );
  if (
    tiers.some((tier) => typeof tier !== "string" || !tier) ||
    new Set(tiers).size !== tiers.length
  )
    throw new Error("Each Profession tier must use a distinct available rank.");
  return { ...next, expertiseOrder: tiers as string[] };
}
