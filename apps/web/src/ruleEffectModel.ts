import type { MechanicsObject } from "./itemMechanicsModel";

export const ruleEffectKinds = [
  "narrative",
  "damage",
  "heal",
  "temporary-hit-points",
  "change-resource",
  "set-value",
  "apply-condition",
  "remove-condition",
  "apply-modifier",
  "remove-effect",
  "move",
  "transit",
  "grant-action",
  "award-profession-points",
  "make-test",
  "repeat-save",
  "choose",
  "branch",
  "for-each",
  "deploy",
  "create-object",
  "destroy-entity",
  "emit-event",
] as const;
export const effectChildCollections = (
  kind: string,
): readonly { key: string; label: string }[] => {
  if (kind === "branch")
    return [
      { key: "whenTrue", label: "When true Effects" },
      { key: "whenFalse", label: "When false Effects" },
    ];
  if (kind === "repeat-save")
    return [{ key: "onSuccess", label: "Success Effects" }];
  if (kind === "for-each") return [{ key: "effects", label: "Loop Effects" }];
  return [];
};
export function createRuleEffect(kind: string): MechanicsObject {
  const scalar = { kind: "constant", value: 0 };
  const amount = { terms: [{ kind: "constant", value: 0 }] };
  const test = { kind: "attribute-check" };
  switch (kind) {
    case "narrative":
      return { kind, text: "" };
    case "damage":
      return { kind, target: "", amount, damageType: "" };
    case "heal":
      return { kind, target: "", amount };
    case "temporary-hit-points":
      return { kind, target: "", amount: scalar };
    case "change-resource":
      return { kind, target: "", resource: "", delta: scalar };
    case "set-value":
      return { kind, target: "", path: "", value: scalar };
    case "apply-condition":
    case "remove-condition":
      return { kind, target: "", condition: "" };
    case "apply-modifier":
      return {
        kind,
        target: "",
        modifier: { id: crypto.randomUUID(), target: "", operation: "add" },
      };
    case "remove-effect":
      return { kind, effectId: "" };
    case "move":
      return { kind, target: "", distance: { value: 0, unit: "foot" } };
    case "transit":
      return { kind, target: "", destination: "" };
    case "grant-action":
      return { kind, target: "", actionId: "" };
    case "award-profession-points":
      return { kind, target: "", professionId: "", amount: scalar };
    case "make-test":
      return { kind, actor: "", test };
    case "repeat-save":
      return { kind, target: "", test };
    case "choose":
      return {
        kind,
        chooser: "",
        choice: { id: crypto.randomUUID(), prompt: "", minimum: 1, maximum: 1 },
        bindAs: "",
      };
    case "branch":
      return { kind, predicate: { kind: "always" }, whenTrue: [] };
    case "for-each":
      return {
        kind,
        collection: { kind: "path", path: "" },
        bindAs: "",
        effects: [],
      };
    case "deploy":
    case "create-object":
      return { kind, definitionId: "" };
    case "destroy-entity":
      return { kind, target: "" };
    case "emit-event":
      return { kind, event: "" };
    default:
      throw new Error(
        "This Effect kind is not available for structured editing.",
      );
  }
}
