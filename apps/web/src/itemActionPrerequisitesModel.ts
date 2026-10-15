import {
  mechanicsEntries,
  mechanicsId,
  mechanicsObject,
  mechanicsOwner,
  mechanicsPatch,
  parseMechanicsRoute,
  type MechanicsObject,
  type MechanicsRoute,
} from "./itemMechanicsModel";
import { choiceEntries, parseChoiceRoute } from "./itemActionChoicesModel";
import {
  modifierEntries,
  parseTraitModifierRoute,
} from "./itemTraitModifiersModel";
import {
  parseTraitTriggerRoute,
  traitTriggerOwner,
} from "./itemTraitTriggersModel";
import {
  effectEntries,
  outcomeEntries,
  parseOutcomeRoute,
} from "./itemActionOutcomesModel";
import type { WorldDraftRecord } from "./api";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";

export interface PrerequisiteDefinitionOption {
  id: string;
  label: string;
}
const definitionKindLabels: Record<string, string> = {
  action: "Action",
  background: "Background",
  character: "Character",
  condition: "Condition",
  custom: "Custom definition",
  feat: "Feat",
  hazard: "Hazard",
  heritage: "Heritage",
  item: "Item",
  language: "Language",
  monster: "Monster",
  profession: "Profession",
  discipline: "Discipline",
  skill: "Skill",
  table: "Table",
  trait: "Trait",
};
/** Only persisted draft definitions can supply a DefinitionId. */
export function prerequisiteDefinitionOptions(
  records: readonly WorldDraftRecord[],
): PrerequisiteDefinitionOption[] {
  const recordIds = new Set(records.map((record) => record.sourceId));
  const seenIds = new Set<string>();
  const options = records
    .filter((record) => {
      if (
        record.resourceType !== "definitions" ||
        !record.sourceId ||
        seenIds.has(record.sourceId)
      )
        return false;
      seenIds.add(record.sourceId);
      return true;
    })
    .map((record) => {
      const payload = mechanicsObject(record.payload);
      const name = mechanicsObject(payload.identity).name;
      const kind =
        typeof payload.kind === "string" &&
        Object.hasOwn(definitionKindLabels, payload.kind)
          ? definitionKindLabels[payload.kind]
          : "Definition";
      return {
        id: record.sourceId,
        label: `${typeof name === "string" && name.trim() && !protectedComparisonText(name, recordIds) ? name.trim() : "Unnamed definition"} · ${kind}`,
      };
    });
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const option of options)
    totals.set(option.label, (totals.get(option.label) ?? 0) + 1);
  return options.map((option) => {
    const count = (counts.get(option.label) ?? 0) + 1;
    counts.set(option.label, count);
    return {
      ...option,
      label:
        totals.get(option.label)! > 1
          ? `${option.label} (${count})`
          : option.label,
    };
  });
}
export interface PrerequisiteRoute {
  ownerKind: "action" | "option" | "trait" | "modifier" | "trigger" | "outcome";
  entity: MechanicsRoute;
  entityPath: string;
  ownerPath: string;
  outcomeId?: string;
  modifierId?: string;
  triggerIndex?: number;
  choiceId?: string;
  optionId?: string;
  prerequisiteIndex?: string;
  parentIndices: number[];
  collectionPath: string;
}
export function parsePrerequisiteRoute(
  path: string,
): PrerequisiteRoute | undefined {
  const parts = path.split("/").filter(Boolean);
  const traitEntity =
    parts[0] === "traits" &&
    ["prerequisites", "choices", "modifiers", "triggers"].includes(parts[2]);
  const traitOwner = traitEntity && parts[2] === "prerequisites";
  const at = traitEntity
    ? 2
    : parts[0] === "actions"
      ? 2
      : parts[0] === "vehicle"
        ? 3
        : parts[0] === "traits"
          ? 4
          : -1;
  if (at < 0) return;
  const triggerOwner = traitEntity && parts[2] === "triggers";
  const trigger = triggerOwner
    ? parseTraitTriggerRoute(parts.slice(0, 4).join("/"))
    : undefined;
  if (
    triggerOwner &&
    (trigger?.triggerIndex === undefined || trigger.triggerIndex === "new")
  )
    return;
  const modifierOwner = traitEntity && parts[2] === "modifiers";
  const modifier = modifierOwner
    ? parseTraitModifierRoute(parts.slice(0, 4).join("/"))
    : undefined;
  if (modifierOwner && (!modifier?.modifierId || modifier.modifierId === "new"))
    return;
  const optionOwner = !traitOwner && parts[at] === "choices";
  const outcomeOwner = !traitEntity && parts[at] === "outcomes";
  const outcome = outcomeOwner
    ? parseOutcomeRoute(parts.slice(0, at + 2).join("/"))
    : undefined;
  if (outcomeOwner && (!outcome?.outcomeId || outcome.outcomeId === "new"))
    return;
  const prerequisiteAt =
    modifierOwner || triggerOwner
      ? 4
      : optionOwner
        ? at + 4
        : outcomeOwner
          ? at + 2
          : at;
  if (
    parts[prerequisiteAt] !==
    (modifierOwner || triggerOwner || outcomeOwner
      ? "predicate"
      : "prerequisites")
  )
    return;
  const ownerPath = parts.slice(0, prerequisiteAt).join("/");
  const choice = optionOwner ? parseChoiceRoute(ownerPath) : undefined;
  if (
    optionOwner &&
    (!choice?.options ||
      !choice.choiceId ||
      choice.choiceId === "new" ||
      !choice.optionId ||
      choice.optionId === "new")
  )
    return;
  const parentIndices: number[] = [];
  let cursor = prerequisiteAt + 1;
  while (parts[cursor + 1] === "children") {
    if (
      !/^(0|[1-9]\d*)$/.test(parts[cursor] ?? "") ||
      !Number.isSafeInteger(Number(parts[cursor]))
    )
      return;
    parentIndices.push(Number(parts[cursor]));
    cursor += 2;
  }
  if (parts.length > cursor + 1) return;
  const entityPath = parts.slice(0, at).join("/"),
    entity = parseMechanicsRoute(entityPath),
    prerequisiteIndex = parts[cursor];
  if (
    !entity ||
    entity.collection !== (traitEntity ? "traits" : "actions") ||
    !entity.childId ||
    entity.childId === "new" ||
    (prerequisiteIndex &&
      prerequisiteIndex !== "new" &&
      (!/^(0|[1-9]\d*)$/.test(prerequisiteIndex) ||
        !Number.isSafeInteger(Number(prerequisiteIndex))))
  )
    return;
  return {
    ownerKind: outcomeOwner
      ? "outcome"
      : triggerOwner
        ? "trigger"
        : modifierOwner
          ? "modifier"
          : traitOwner
            ? "trait"
            : optionOwner
              ? "option"
              : "action",
    entity,
    entityPath,
    ownerPath,
    outcomeId: outcome?.outcomeId,
    modifierId: modifier?.modifierId,
    triggerIndex:
      trigger?.triggerIndex === undefined
        ? undefined
        : Number(trigger.triggerIndex),
    choiceId: choice?.choiceId,
    optionId: choice?.optionId,
    prerequisiteIndex,
    parentIndices,
    collectionPath: parts.slice(at, cursor).join("/"),
  };
}
export const compoundPrerequisiteKinds = ["all", "any", "not"];
export function prerequisiteChildren(
  parent: MechanicsObject,
): MechanicsObject[] {
  if (parent.kind === "all" || parent.kind === "any")
    return effectEntries(parent.predicates);
  if (parent.kind === "not")
    return parent.predicate === undefined
      ? []
      : effectEntries([parent.predicate]);
  throw new Error(
    "This Prerequisite has no editable children. Existing data has been preserved.",
  );
}
export function prerequisiteCollection(
  root: unknown,
  parentIndices: readonly number[],
): { entries: MechanicsObject[]; parent?: MechanicsObject } {
  let entries = effectEntries(root),
    parent: MechanicsObject | undefined;
  for (const index of parentIndices) {
    parent = entries[index];
    if (!Number.isSafeInteger(index) || index < 0 || !parent)
      throw new Error(
        "This Prerequisite is unavailable. Existing data has been preserved.",
      );
    entries = prerequisiteChildren(parent);
  }
  return { entries, parent };
}
function replacePrerequisiteCollection(
  root: unknown,
  parentIndices: readonly number[],
  next: MechanicsObject[],
): MechanicsObject[] {
  const ancestors: {
    entries: MechanicsObject[];
    parent: MechanicsObject;
    index: number;
  }[] = [];
  let entries = effectEntries(root);
  for (const index of parentIndices) {
    const parent = entries[index];
    if (!Number.isSafeInteger(index) || index < 0 || !parent)
      throw new Error(
        "This Prerequisite is unavailable. Existing data has been preserved.",
      );
    ancestors.push({ entries, parent, index });
    entries = prerequisiteChildren(parent);
  }
  let result = next;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const { entries: siblings, parent, index } = ancestors[i];
    let updated: MechanicsObject;
    if (parent.kind === "not") {
      if (result.length > 1)
        throw new Error("A not prerequisite has one child.");
      updated = { ...parent };
      if (result.length) updated.predicate = result[0];
      else delete updated.predicate;
    } else updated = { ...parent, predicates: result };
    result = siblings.map((entry, at) => (at === index ? updated : entry));
  }
  return result;
}
/** Resolve an actual Trait or Action, never a synthetic Action for a Trait. */
export function prerequisiteEntity(
  components: MechanicsObject,
  route: PrerequisiteRoute,
): MechanicsObject {
  if (route.ownerKind === "trigger") {
    const triggerRoute = parseTraitTriggerRoute(route.ownerPath);
    if (!triggerRoute) throw new Error("This Trigger is no longer available.");
    return traitTriggerOwner(components, triggerRoute).trait;
  }
  const entries = mechanicsEntries(
    route.entity.collection === "traits"
      ? components.traits
      : mechanicsOwner(components, route.entity).actions,
  );
  const entity = entries.find(
    (entry) => mechanicsId(entry) === route.entity.childId,
  );
  if (!entity)
    throw new Error(
      `This ${route.entity.collection === "traits" ? "Trait" : "Action"} is no longer available.`,
    );
  return entity;
}
/** Resolve the exact owner before reading or writing its prerequisites. */
export function prerequisiteOwner(
  entity: MechanicsObject,
  route: PrerequisiteRoute,
): MechanicsObject {
  if (route.ownerKind === "trigger") {
    const triggerRoute = parseTraitTriggerRoute(route.ownerPath);
    if (!triggerRoute) throw new Error("This Trigger is no longer available.");
    const trigger = traitTriggerOwner({ traits: [entity] }, triggerRoute)
      .triggers[route.triggerIndex!];
    if (!trigger)
      throw new Error(
        "This Trigger is no longer available. Existing data has been preserved.",
      );
    return trigger;
  }
  const components = mechanicsObject(entity.components);
  if (route.ownerKind === "outcome") {
    if (entity.components !== undefined && entity.components !== components)
      throw new Error(
        "This Action contains unsupported data. Existing data has been preserved.",
      );
    const outcome = outcomeEntries(components.outcomes).find(
      (entry) => entry.id === route.outcomeId,
    );
    if (!outcome)
      throw new Error(
        "This Outcome is no longer available. Existing data has been preserved.",
      );
    return outcome;
  }
  if (route.modifierId !== undefined) {
    const modifier = modifierEntries(components.modifiers).find(
      (entry) => entry.id === route.modifierId,
    );
    if (!modifier)
      throw new Error(
        "This Modifier is no longer available. Existing data has been preserved.",
      );
    return modifier;
  }
  if (route.choiceId === undefined && route.optionId === undefined)
    return components;
  const choice = choiceEntries(components.choices).find(
    (entry) => entry.id === route.choiceId,
  );
  if (!choice)
    throw new Error(
      "This Choice is no longer available. Existing data has been preserved.",
    );
  const option = choiceEntries(choice.options).find(
    (entry) => entry.id === route.optionId,
  );
  if (!option)
    throw new Error(
      "This Option is no longer available. Existing data has been preserved.",
    );
  return option;
}
/** Adapt an optional single predicate only at the editor boundary. */
export function prerequisiteRoot(
  owner: MechanicsObject,
  route: PrerequisiteRoute,
): unknown {
  if (route.ownerKind === "outcome")
    return owner.when === undefined ? [] : [owner.when];
  return route.ownerKind === "modifier" || route.ownerKind === "trigger"
    ? owner.predicate === undefined
      ? []
      : [owner.predicate]
    : owner.prerequisites;
}
export function itemPrerequisitesPatch(
  components: MechanicsObject,
  route: PrerequisiteRoute,
  prerequisites: MechanicsObject[],
) {
  const entity = prerequisiteEntity(components, route);
  const entries = mechanicsEntries(
    route.entity.collection === "traits"
      ? components.traits
      : mechanicsOwner(components, route.entity).actions,
  );
  const owner = prerequisiteOwner(entity, route);
  const next = replacePrerequisiteCollection(
    prerequisiteRoot(owner, route),
    route.parentIndices,
    prerequisites,
  );
  const updatedOwner: MechanicsObject = { ...owner };
  if (route.ownerKind === "outcome") {
    if (next.length > 1)
      throw new Error("An Outcome has one optional predicate.");
    if (next.length) updatedOwner.when = next[0];
    else delete updatedOwner.when;
  } else if (route.ownerKind === "modifier" || route.ownerKind === "trigger") {
    if (next.length > 1)
      throw new Error(
        `A ${route.ownerKind === "trigger" ? "Trigger" : "Modifier"} has one optional predicate.`,
      );
    if (next.length) updatedOwner.predicate = next[0];
    else delete updatedOwner.predicate;
  } else updatedOwner.prerequisites = next;
  const original = mechanicsObject(entity.components);
  const updatedComponents =
    route.outcomeId !== undefined
      ? {
          ...original,
          outcomes: outcomeEntries(original.outcomes).map((outcome) =>
            outcome.id === route.outcomeId ? updatedOwner : outcome,
          ),
        }
      : route.triggerIndex !== undefined
        ? {
            ...original,
            triggers: effectEntries(original.triggers).map((trigger, index) =>
              index === route.triggerIndex ? updatedOwner : trigger,
            ),
          }
        : route.modifierId !== undefined
          ? {
              ...original,
              modifiers: modifierEntries(original.modifiers).map((modifier) =>
                modifier.id === route.modifierId ? updatedOwner : modifier,
              ),
            }
          : route.optionId === undefined
            ? updatedOwner
            : {
                ...original,
                choices: choiceEntries(original.choices).map((choice) =>
                  choice.id === route.choiceId
                    ? {
                        ...choice,
                        options: choiceEntries(choice.options).map((option) =>
                          option.id === route.optionId ? updatedOwner : option,
                        ),
                      }
                    : choice,
                ),
              };
  return mechanicsPatch(
    components,
    route.entity,
    entries.map((entry) =>
      entry === entity ? { ...entry, components: updatedComponents } : entry,
    ),
  );
}
export const prerequisiteFields: Record<string, readonly string[]> = {
  always: [],
  never: [],
  "has-condition": ["subject", "condition"],
  "has-tag": ["subject", "tag"],
  "has-definition": ["subject"],
  "is-proficient": ["subject", "proficiency"],
  "is-attuned": ["subject", "item"],
  "is-sustaining-operation": ["subject"],
  "damage-type": ["damage", "damageType"],
  "within-distance": ["source", "target"],
  visible: ["observer", "target"],
  "has-cover": ["observer", "target", "cover"],
  relation: ["source", "target", "relation"],
};
export const prerequisiteKinds = [
  ...Object.keys(prerequisiteFields),
  ...compoundPrerequisiteKinds,
  "compare",
];
export function newActionPrerequisite(kind: string): MechanicsObject {
  if (kind === "compare")
    return {
      kind,
      left: { kind: "constant", value: 0 },
      operator: "eq",
      right: { kind: "constant", value: 0 },
    };
  if (kind === "all" || kind === "any") return { kind, predicates: [] };
  if (kind === "not") return { kind, predicate: { kind: "always" } };
  if (!Object.hasOwn(prerequisiteFields, kind))
    throw new Error("Unsupported prerequisite kind.");
  const value: MechanicsObject = { kind };
  for (const field of prerequisiteFields[kind]) {
    if (kind !== "is-attuned" || field !== "item") value[field] = "";
  }
  if (kind === "within-distance") value.distance = { value: 0, unit: "foot" };
  return value;
}
