import {
  mechanicsEntries,
  mechanicsId,
  mechanicsObject,
  mechanicsOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
} from "./itemMechanicsModel";
import { choiceEntries } from "./itemActionChoicesModel";
import { effectEntries, outcomeEntries } from "./itemActionOutcomesModel";
import {
  parseTraitTriggerRoute,
  traitTriggerOwner,
  traitTriggersPatch,
} from "./itemTraitTriggersModel";

import type { ProfessionRuleType } from "./professionAuthoringModel";
import type { CharacterOptionFieldType } from "./characterOptionFieldsModel";

export type RuleNodeType =
  | ProfessionRuleType
  | CharacterOptionFieldType
  | "monster"
  | "character-template"
  | "trait"
  | "action-definition"
  | "trait-definition"
  | "cost"
  | "skill"
  | "speed"
  | "damage-adjustment"
  | "sense"
  | "communication"
  | "discipline-source"
  | "discipline-state"
  | "attribute-generation"
  | "action"
  | "trigger"
  | "outcome"
  | "effect"
  | "predicate"
  | "modifier"
  | "choice"
  | "option"
  | "target"
  | "test"
  | "duration";
/** User-facing names for the character authoring family. */
export function ruleNodeName(type: RuleNodeType): string {
  const names: Partial<Record<RuleNodeType, string>> = {
    "profession-tier": "Expertise tier",
    "profession-benefits": "Benefits",
    "profession-acquisition": "Acquisition",
    "profession-action": "Action progression",
    "profession-improvement": "Improvement",
    "profession-window": "Advancement window",
    "modifier-grant": "Modifier grant",
    "background-characteristics": "Characteristics",
  };
  return names[type] ?? type;
}
export interface RuleChild {
  key: string;
  label: string;
  type: RuleNodeType;
  list?: boolean;
}
const child = (
  key: string,
  label: string,
  type: RuleNodeType,
  list = false,
): RuleChild => ({ key, label, type, list });
export function ruleChildren(type: RuleNodeType, value: unknown): RuleChild[] {
  const kind = mechanicsObject(value).kind;
  switch (type) {
    case "profession":
      return [
        child("expertiseLevels", "Expertise tiers", "profession-tier", true),
        child("acquisition", "Acquisition", "profession-acquisition", true),
        child("actions", "Action progression", "profession-action", true),
        child("prerequisites", "Prerequisites", "predicate", true),
        child("choices", "Choices", "choice", true),
      ];
    case "profession-tier":
      return [
        child("benefits", "Benefits", "profession-benefits"),
        child("advancementWindow", "Advancement window", "profession-window"),
        child("prerequisites", "Prerequisites", "predicate", true),
      ];
    case "profession-benefits":
      return [
        child("modifierGrants", "Modifier grants", "modifier-grant", true),
        child("modifiers", "Rule modifiers", "modifier", true),
      ];
    case "profession-acquisition":
      return kind === "character-creation"
        ? [child("choices", "Choices", "choice", true)]
        : kind === "during-play"
          ? [
              child("prerequisites", "Prerequisites", "predicate", true),
              child("trainingDuration", "Training duration", "duration"),
            ]
          : [];
    case "profession-action":
      return [
        child("improvements", "Improvements", "profession-improvement", true),
        child("qualifyingUse", "Qualifying use", "predicate"),
      ];
    case "profession-improvement":
      return [child("modifiers", "Rule modifiers", "modifier", true)];
    case "profession-window":
      return kind === "custom"
        ? [child("predicate", "Predicate", "predicate")]
        : [];
    case "background":
      return [
        child("modifierGrants", "Modifier grants", "modifier-grant", true),
        child("choices", "Choices", "choice", true),
        child(
          "characteristics",
          "Characteristics",
          "background-characteristics",
        ),
      ];
    case "monster":
      return [
        ...[
          "actions",
          "bonusActions",
          "reactions",
          "legendaryActions",
          "mythicActions",
          "lairActions",
        ].map((key) =>
          child(key, key.replace(/([A-Z])/g, " $1"), "action-definition", true),
        ),
        child("traits", "Traits", "trait-definition", true),
        child("regionalEffects", "Regional Traits", "trait-definition", true),
        child("skills", "Skills", "skill", true),
        child("speeds", "Speeds", "speed", true),
        child(
          "damageAdjustments",
          "Damage adjustments",
          "damage-adjustment",
          true,
        ),
        child("senses", "Senses", "sense", true),
        child(
          "communicationCapabilities",
          "Communication",
          "communication",
          true,
        ),
        child("disciplines", "Disciplines", "discipline-state"),
      ];
    case "character-template":
      return [
        child("traits", "Traits", "trait-definition", true),
        child("choices", "Choices", "choice", true),
        child(
          "attributeGeneration",
          "Attribute generation",
          "attribute-generation",
        ),
      ];
    case "action-definition":
      return [child("components", "Action rules", "action")];
    case "trait-definition":
      return [child("components", "Trait rules", "trait")];
    case "trait":
      return [
        child("actions", "Actions", "action-definition", true),
        child("prerequisites", "Prerequisites", "predicate", true),
        child("choices", "Choices", "choice", true),
        child("modifiers", "Modifiers", "modifier", true),
        child("triggers", "Triggers", "trigger", true),
      ];
    case "speed":
      return [child("restrictions", "Restrictions", "predicate", true)];
    case "damage-adjustment":
      return [
        child("predicate", "Predicate", "predicate"),
        child("bypassPredicate", "Bypass predicate", "predicate"),
      ];
    case "discipline-state":
      return [child("sources", "Sources", "discipline-source", true)];
    case "action":
      return [
        child("costs", "Costs", "cost", true),
        child("prerequisites", "Prerequisites", "predicate", true),
        child("choices", "Choices", "choice", true),
        child("targets", "Targets", "target", true),
        child("outcomes", "Outcomes", "outcome", true),
        child("test", "Test", "test"),
        child("duration", "Duration", "duration"),
      ];
    case "trigger":
      return [
        child("effects", "Effects", "effect", true),
        child("predicate", "Predicate", "predicate"),
      ];
    case "outcome":
      return [
        child("effects", "Effects", "effect", true),
        child("when", "Predicate", "predicate"),
      ];
    case "target":
      return [child("filters", "Filters", "predicate", true)];
    case "modifier":
      return [child("predicate", "Predicate", "predicate")];
    case "choice":
      return [child("options", "Options", "option", true)];
    case "option":
      return [child("prerequisites", "Prerequisites", "predicate", true)];
    case "predicate":
      return kind === "all" || kind === "any"
        ? [child("predicates", "Children", "predicate", true)]
        : kind === "not"
          ? [child("predicate", "Child", "predicate")]
          : [];
    case "effect":
      return kind === "branch"
        ? [
            child("predicate", "Predicate", "predicate"),
            child("whenTrue", "When true", "effect", true),
            child("whenFalse", "When false", "effect", true),
          ]
        : kind === "for-each"
          ? [child("effects", "Effects", "effect", true)]
          : kind === "repeat-save"
            ? [child("onSuccess", "On success", "effect", true)]
            : kind === "apply-modifier"
              ? [child("modifier", "Modifier", "modifier")]
              : kind === "choose"
                ? [child("choice", "Choice", "choice")]
                : [];
    default:
      return [];
  }
}
export function parseRuleNodeRoute(path: string) {
  const p = path.split("/").filter(Boolean);
  const trigger = p[0] === "traits" && p[2] === "triggers";
  const at = trigger
    ? 4
    : p[0] === "actions"
      ? 2
      : p[0] === "vehicle"
        ? 3
        : p[0] === "traits" && p[2] === "actions"
          ? 4
          : -1;
  if (at < 0 || p[at] !== "rule" || p.length <= at + 1) return;
  const ownerPath = p.slice(0, at).join("/");
  if (trigger) {
    const t = parseTraitTriggerRoute(ownerPath);
    if (!t || t.triggerIndex === undefined || t.triggerIndex === "new") return;
  } else {
    const a = parseMechanicsRoute(ownerPath);
    if (!a || a.collection !== "actions" || !a.childId || a.childId === "new")
      return;
  }
  return {
    ownerPath,
    trigger,
    segments: p.slice(at + 1),
    rootPath: `${ownerPath}/rule`,
  };
}
export type RuleNodeRoute = NonNullable<ReturnType<typeof parseRuleNodeRoute>>;
function object(value: unknown): MechanicsObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "This rule contains unsupported data. Existing data has been preserved.",
    );
  return value as MechanicsObject;
}
export function ruleOwner(components: MechanicsObject, route: RuleNodeRoute) {
  if (route.trigger) {
    const t = parseTraitTriggerRoute(route.ownerPath)!;
    const owner = traitTriggerOwner(components, t);
    const root = owner.triggers[Number(t.triggerIndex)];
    if (!root) throw new Error("This Trigger is no longer available.");
    return { root, type: "trigger" as const };
  }
  const a = parseMechanicsRoute(route.ownerPath)!;
  const action = mechanicsEntries(mechanicsOwner(components, a).actions).find(
    (v) => mechanicsId(v) === a.childId,
  );
  if (!action) throw new Error("This Action is no longer available.");
  return {
    root: action.components === undefined ? {} : object(action.components),
    type: "action" as const,
  };
}
function ruleEntries(value: unknown, type: RuleNodeType) {
  if (type === "action-definition" || type === "trait-definition") {
    const entries = mechanicsEntries(value);
    const expected = type === "action-definition" ? "action" : "trait";
    if (entries.some((e) => e.kind !== undefined && e.kind !== expected))
      throw new Error(
        "This collection contains unsupported definitions. Existing content is preserved.",
      );
    return entries;
  }
  return type === "outcome"
    ? outcomeEntries(value)
    : type === "choice" || type === "option"
      ? choiceEntries(value)
      : effectEntries(value);
}
export function resolveRuleNode(
  root: MechanicsObject,
  type: RuleNodeType,
  segments: readonly string[],
) {
  let value: unknown = root,
    list = false,
    label = "Rules";
  const labels: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (list) {
      const entries = ruleEntries(value, type);
      if (segment === "new" && i === segments.length - 1) {
        value = undefined;
        list = false;
        labels.push(`New ${ruleNodeName(type)}`);
        continue;
      }
      if (
        !/^(0|[1-9]\d*)$/.test(segment) ||
        !Number.isSafeInteger(Number(segment)) ||
        !entries[Number(segment)]
      )
        throw new Error("This rule is no longer available.");
      value = entries[Number(segment)];
      list = false;
      label = `${ruleNodeName(type)[0].toUpperCase() + ruleNodeName(type).slice(1)} ${Number(segment) + 1}`;
    } else {
      const node = object(value);
      const spec = ruleChildren(type, node).find((c) => c.key === segment);
      if (!spec) throw new Error("This rule path is unavailable.");
      value = node[segment];
      type = spec.type;
      list = !!spec.list;
      label = spec.label;
      if (value !== undefined) {
        if (list) {
          ruleEntries(value, type);
        } else object(value);
      }
    }
    labels.push(label);
  }
  return { value, type, list, label, labels, isNew: segments.at(-1) === "new" };
}
export function replaceRuleNode(
  root: MechanicsObject,
  type: RuleNodeType,
  segments: readonly string[],
  next: unknown,
): MechanicsObject {
  resolveRuleNode(root, type, segments);
  function replace(value: unknown, at: number): unknown {
    if (at === segments.length) return next;
    const key = segments[at];
    if (Array.isArray(value)) {
      const result = [...value];
      if (key === "new") result.push(next);
      else if (at === segments.length - 1 && next === undefined)
        result.splice(Number(key), 1);
      else result[Number(key)] = replace(result[Number(key)], at + 1);
      return result;
    }
    const node = object(value);
    const result = { ...node };
    if (at === segments.length - 1 && next === undefined) delete result[key];
    else
      result[key] = replace(
        node[key] === undefined && segments[at + 1] === "new" ? [] : node[key],
        at + 1,
      ) as MechanicsObject[string];
    return result;
  }
  return replace(root, 0) as MechanicsObject;
}
export function ruleNodePatch(
  components: MechanicsObject,
  route: RuleNodeRoute,
  next: unknown,
) {
  const owner = ruleOwner(components, route);
  const root = replaceRuleNode(owner.root, owner.type, route.segments, next);
  if (route.trigger) {
    const t = parseTraitTriggerRoute(route.ownerPath)!;
    const original = traitTriggerOwner(components, t);
    return traitTriggersPatch(
      components,
      t,
      original.triggers.map((v, i) =>
        i === Number(t.triggerIndex) ? root : v,
      ),
    );
  }
  const a = parseMechanicsRoute(route.ownerPath)!;
  const actions = mechanicsEntries(mechanicsOwner(components, a).actions);
  return mechanicsPatch(
    components,
    a,
    actions.map((v) =>
      mechanicsId(v) === a.childId ? { ...v, components: root } : v,
    ),
  );
}
