import {
  characterAuthorKind,
  characterAuthorTitle,
} from "./characterAuthoringModel";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { resolveItemOwnerNode } from "./itemOwnerModel";
import { resolveRuleNode, type RuleNodeType } from "./ruleNodeModel";
import { mechanicsObject } from "./itemMechanicsModel";
import {
  CAMPAIGN_PLOT_COLLECTIONS,
  campaignPlotNavigation,
  plotObject,
  plotLabel,
} from "./campaignPlotNavigationModel";
import { locationAncestry, locationHref } from "./locationWorkspaceModel";
import type { WorldDraftRecord } from "./api";
import {
  PRIMARY_NAVIGATION,
  worldNavigationForPath,
} from "./gmNavigationModel";
import { campaignDefinitionNavigationForPath } from "./campaignAuthoringModel";
import { campaignInstanceNavigationForPath } from "./campaignInstanceModel";

export interface NavigationLink {
  label: string;
  href: string;
  active?: boolean;
}
export interface SidebarFrame extends NavigationLink {
  kind: string;
  links: NavigationLink[];
  groups?: readonly {
    label: string;
    href?: string;
    children: readonly { label: string; href?: string; note?: string }[];
    active: boolean;
  }[];
}
export interface NavigationData {
  worldName?: string;
  modelElements?: readonly { elementId: string; name: string }[];
  campaignName?: string;
  instanceName?: string;
  locations?: readonly { id: string; name: string }[];
  records?: readonly {
    sourceId: string;
    resourceType: string;
    payload: unknown;
  }[];
}
const labels: Record<string, string> = {
  atlas: "Atlas",
  bestiary: "Bestiary",
  "item-compendium": "Item Compendium",
  characters: "Characters",
  models: "Models & taxonomies",
  model: "Model",
  skills: "Skills",
  professions: "Professions",
  backgrounds: "Backgrounds",
  rules: "Rules",
  versions: "Versions",
  draft: "Working draft",
  review: "Review & publish",
  migrate: "Migration",
  plots: "Plots",
  placements: "Placements",
  preparation: "Preparation defaults",
  roster: "Roster",
  agents: "Agents",
  sessions: "Sessions",
  run: "Run",
  map: "Map",
  "quick-start": "Quick Start",
  "session-canvas-lab": "Session canvas",
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function navigationRecordName(
  data: NavigationData,
  id: string,
  fallback: string,
) {
  const record = data.records?.find((entry) => entry.sourceId === id);
  const payload = object(record?.payload);
  const name = object(payload.identity).name ?? payload.name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

/** The URL is the stack's durable state: parent links pop one or more frames,
 * and deep links/refresh/history reconstruct the same ancestry. IDs are URLs only. */
export function contextualNavigationStack(
  pathname: string,
  data: NavigationData = {},
): SidebarFrame[] {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const path = (count: number) =>
    "/" + parts.slice(0, count).map(encodeURIComponent).join("/");
  const stack: SidebarFrame[] = [
    {
      label: "GM Workspace",
      kind: "Workspace",
      href: "/",
      links: [
        ...PRIMARY_NAVIGATION,
        { label: "Session canvas", href: "/session-canvas-lab" },
      ],
    },
  ];
  if (!parts.length) return stack;
  const root = parts[0];
  const label =
    PRIMARY_NAVIGATION.find((item) => item.key === root)?.label ??
    labels[root] ??
    "Workspace";
  const push = (
    label: string,
    kind: string,
    href: string,
    links: NavigationLink[] = [{ label: "Overview", href }],
  ) => stack.push({ label, kind, href, links });
  push(label, "Library", path(1), [{ label, href: path(1) }]);
  if (root === "worlds") {
    stack[1].links.push({ label: "Create World", href: "/worlds/new" });
    if (!parts[1]) return stack;
    if (parts[1] === "new") {
      push("Create World", "World", path(2));
      return stack;
    }
    push(data.worldName?.trim() || "World", "World", path(2), [
      ...worldNavigationForPath(parts[1], pathname),
    ]);
    // Record ancestry is separate from the owning World's destination navigation.
    if (parts[2] === "atlas" && parts[3] === "locations" && parts[4]) {
      const ancestry = locationAncestry(
        (data.records ?? []) as WorldDraftRecord[],
        parts[4],
      );
      if (!ancestry.length || parts[4] === "new") {
        push(
          parts[4] === "new" ? "Create Location" : "Location",
          "Location",
          path(5),
        );
      } else {
        for (const record of ancestry) {
          push(
            navigationRecordName(data, record.sourceId, "Location"),
            "Location",
            locationHref(parts[1], record.sourceId),
            [],
          );
        }
      }
      if (
        ["discoveries", "creatures", "items"].includes(parts[5]) &&
        parts[6]
      ) {
        const section = parts[5];
        const title =
          section === "discoveries"
            ? "Discoveries"
            : section === "creatures"
              ? "Creatures"
              : "Items";
        const noun = section === "discoveries" ? "Discovery" : "Placement";
        push(title, "Collection", path(6));
        const entryId = parts[6].startsWith("entry-")
          ? parts[6].slice(6)
          : undefined;
        const location = data.records?.find(
          (r) => r.resourceType === "locations" && r.sourceId === parts[4],
        );
        const claims = object(location?.payload).discoveries;
        const entry =
          section === "discoveries" && Array.isArray(claims)
            ? object(claims.find((c) => object(c).id === entryId))
            : object(
                data.records?.find(
                  (r) =>
                    r.resourceType === "world-placements" &&
                    r.sourceId === entryId,
                )?.payload,
              );
        const label = section === "discoveries" ? entry.statement : entry.name;
        const ids = new Set(data.records?.map((r) => r.sourceId) ?? []);
        if (Array.isArray(claims))
          for (const claim of claims)
            if (typeof object(claim).id === "string")
              ids.add(object(claim).id as string);
        push(
          parts[6] === "new"
            ? `Add ${noun}`
            : typeof label === "string" &&
                label.trim() &&
                !protectedComparisonText(label, ids)
              ? label
              : noun,
          noun,
          path(7),
        );
      }
      return stack;
    }
    if (
      (parts[2] === "bestiary" && parts[3] === "catalog-monsters") ||
      (parts[2] === "characters" && parts[3] === "catalog-characters")
    ) {
      const kind =
        parts[3] === "catalog-monsters" ? "monster" : "character-template";
      push(
        kind === "monster"
          ? "Catalog creatures"
          : "Catalog Character templates",
        "Library",
        path(4),
      );
      if (parts[4]) {
        push(
          parts[4] === "new"
            ? "Create template"
            : protectedComparisonText(
                  navigationRecordName(data, parts[4], "Template"),
                  new Set(data.records?.map((r) => r.sourceId) ?? []),
                )
              ? "Template"
              : navigationRecordName(data, parts[4], "Template"),
          "Template",
          path(5),
        );
        if (parts[5] === "rule") {
          const record = data.records?.find(
            (r) =>
              r.sourceId === parts[4] &&
              r.resourceType === "definitions" &&
              object(r.payload).kind === kind,
          );
          for (let end = 7; end <= parts.length; end++) {
            try {
              const node = resolveRuleNode(
                mechanicsObject(object(record?.payload).components),
                kind,
                parts.slice(6, end),
              );
              push(node.label, "Rule", path(end));
            } catch {
              push("Rule unavailable", "Rule", path(end));
              break;
            }
          }
        }
      }
      return stack;
    }
    if (parts[2] === "characters" && characterAuthorKind(parts[3])) {
      const kind = characterAuthorKind(parts[3])!;
      const title = characterAuthorTitle(kind);
      push(`${title}s`, "Library", path(4));
      if (parts[4]) {
        const ids = new Set(data.records?.map((r) => r.sourceId) ?? []);
        const name = navigationRecordName(data, parts[4], title);
        push(
          parts[4] === "new"
            ? `Create ${title}`
            : protectedComparisonText(name, ids)
              ? title
              : name,
          title,
          path(5),
        );
        if (parts[5] === "rule") {
          const record = data.records?.find(
            (r) =>
              r.resourceType === "definitions" &&
              r.sourceId === parts[4] &&
              object(r.payload).kind === kind,
          );
          for (let end = 7; end <= parts.length; end++) {
            try {
              const node = resolveRuleNode(
                mechanicsObject(object(record?.payload).components),
                kind,
                parts.slice(6, end),
              );
              push(node.label, "Rule", path(end));
            } catch {
              push("Rule unavailable", "Rule", path(end));
              break;
            }
          }
        }
      }
      return stack;
    }
    if (parts[2] === "rules" && parts[3]) {
      push("World rules", "Library", path(3));
      if (parts[3] === "new") {
        push("Create rule", "Rule", path(4));
        return stack;
      }
      const record = data.records?.find(
        (r) => r.resourceType === "world-rules" && r.sourceId === parts[3],
      );
      const name = object(record?.payload).name;
      const ids = new Set(data.records?.map((r) => r.sourceId) ?? []);
      push(
        typeof name === "string" &&
          name.trim() &&
          !protectedComparisonText(name, ids)
          ? name
          : "Rule",
        "Rule",
        `${path(4)}/edit`,
      );
      if (parts[4] === "effects") {
        push("Effects", "Effect collection", path(5));
        if (parts[5])
          push(
            parts[5] === "new"
              ? "Add effect"
              : /^[1-9]\d*$/.test(parts[5])
                ? `Effect ${Number(parts[5])}`
                : "Effect",
            "Effect",
            path(parts[6] === "edit" ? 7 : 6),
          );
      }
      if (parts[4] === "conditions") {
        push("Conditions", "Condition collection", path(5));
        for (let i = 5; i < parts.length; i++) {
          if (
            parts[i] === "children" &&
            /^[1-9]\d*$/.test(parts[i + 1] ?? "")
          ) {
            push(`Condition ${Number(parts[i + 1])}`, "Condition", path(i + 2));
            i++;
          } else if (parts[i] === "new")
            push("Add condition", "Condition", path(i + 1));
          else if (parts[i] === "edit")
            push("Edit condition", "Condition", path(i + 1));
        }
      }
      return stack;
    }
    // Library tabs stay in their owning World; individual records drill down.
    if (parts[2] === "characters" && parts[3] === "model" && parts[5]) {
      // Lists remain facets; editing an element creates a durable owner context.
      if (parts[5] !== "effective") {
        const title =
          parts[4] === "structure"
            ? "Schema structure"
            : parts[4] === "attributes"
              ? "Attributes"
              : parts[4] === "equipment-slots"
                ? "Equipment slots"
                : "Profession ranks";
        push(title, "Model collection", `${path(5)}/effective`);
        const name = data.modelElements?.find(
          (e) => e.elementId === parts[5],
        )?.name;
        const ids = new Set(data.modelElements?.map((e) => e.elementId) ?? []);
        push(
          parts[5] === "new"
            ? "Add Model element"
            : typeof name === "string" &&
                name.trim() &&
                !protectedComparisonText(name, ids)
              ? name
              : "Model element",
          "Model element",
          path(6),
        );
      }
      return stack;
    }
    if (
      parts[4] &&
      ["bestiary", "item-compendium", "characters"].includes(parts[2])
    ) {
      const fallback =
        parts[2] === "bestiary"
          ? "Creature"
          : parts[2] === "item-compendium"
            ? "Item"
            : "Definition";
      push(
        parts[4] === "new"
          ? `Create ${fallback}`
          : navigationRecordName(data, parts[4], fallback),
        fallback,
        path(5),
      );
      if (parts[2] === "item-compendium" && parts[3] === "items") {
        const item = object(
          data.records?.find(
            (record) =>
              record.resourceType === "definitions" &&
              record.sourceId === parts[4] &&
              object(record.payload).kind === "item",
          )?.payload,
        );
        const components = object(item.components);
        if (parts[5] === "owner") {
          push("Item rules", "Rules", path(6));
          for (let end = 7; end <= parts.length; end++) {
            try {
              const node = resolveItemOwnerNode(
                mechanicsObject(components),
                parts.slice(6, end),
              );
              push(node.label, "Rule", path(end));
            } catch {
              push("Rule unavailable", "Rule", path(end));
              break;
            }
          }
          return stack;
        }

        const child = (values: unknown, id: string | undefined) =>
          object(
            Array.isArray(values)
              ? values.find((value) => object(object(value).identity).id === id)
              : undefined,
          );
        const childLabel = (value: unknown, fallback: string) => {
          const name = object(object(value).identity).name;
          return typeof name === "string" && name.trim()
            ? name.trim()
            : fallback;
        };
        const pushValueCollection = (
          values: unknown,
          marker: number,
          prerequisite: boolean,
          singlePredicate = false,
        ) => {
          const noun = prerequisite ? "Prerequisite" : "Cost";
          push(
            singlePredicate
              ? "Predicate"
              : prerequisite
                ? "Prerequisites"
                : "Costs",
            `${noun} collection`,
            path(marker + 1),
          );
          let valuesOfAction = values;
          let offset = marker + 1;
          while (parts[offset] !== undefined) {
            const entryIndex = parts[offset];
            const entries = Array.isArray(valuesOfAction) ? valuesOfAction : [];
            const index = /^(0|[1-9]\d*)$/.test(entryIndex)
              ? Number(entryIndex)
              : -1;
            const entryNoun =
              singlePredicate && offset === marker + 1 ? "Predicate" : noun;
            push(
              entryIndex === "new"
                ? `New ${entryNoun}`
                : index >= 0 && index < entries.length
                  ? singlePredicate && offset === marker + 1
                    ? "Predicate"
                    : `${noun} ${index + 1}`
                  : entryNoun,
              entryNoun,
              path(offset + 1),
            );
            if (!prerequisite || parts[offset + 1] !== "children") break;
            push(
              "Nested prerequisites",
              "Prerequisite collection",
              path(offset + 2),
            );
            const selected = object(entries[index]);
            valuesOfAction =
              selected.kind === "all" || selected.kind === "any"
                ? selected.predicates
                : selected.kind === "not" && selected.predicate !== undefined
                  ? [selected.predicate]
                  : [];
            offset += 2;
          }
        };
        const pushChoices = (choices: unknown, marker: number) => {
          push("Choices", "Choice collection", path(marker + 1));
          const choiceId = parts[marker + 1];
          if (choiceId === undefined) return;
          const choice = object(
            Array.isArray(choices)
              ? choices.find((value) => object(value).id === choiceId)
              : undefined,
          );
          const label = (value: unknown, fallback: string) =>
            typeof value === "string" && value.trim() ? value.trim() : fallback;
          push(
            choiceId === "new" ? "New Choice" : label(choice.prompt, "Choice"),
            "Choice",
            path(marker + 2),
          );
          if (parts[marker + 2] !== "options") return;
          push("Options", "Option collection", path(marker + 3));
          const optionId = parts[marker + 3];
          if (optionId === undefined) return;
          const option = object(
            Array.isArray(choice.options)
              ? choice.options.find((value) => object(value).id === optionId)
              : undefined,
          );
          push(
            optionId === "new" ? "New Option" : label(option.label, "Option"),
            "Option",
            path(marker + 4),
          );
          if (parts[marker + 4] === "prerequisites")
            pushValueCollection(option.prerequisites, marker + 4, true);
        };
        const pushRuleNodes = (
          root: unknown,
          type: RuleNodeType,
          marker: number,
        ) => {
          for (let end = marker + 2; end <= parts.length; end++) {
            try {
              const node = resolveRuleNode(
                mechanicsObject(root),
                type,
                parts.slice(marker + 1, end),
              );
              push(
                node.label,
                node.list ? `${node.type} collection` : node.type,
                path(end),
              );
            } catch {
              push("Rule unavailable", "Rule", path(end));
              break;
            }
          }
        };
        const pushActions = (values: unknown, count: number) => {
          push("Actions", "Action collection", path(count));
          const id = parts[count];
          if (id)
            push(
              id === "new"
                ? "New Action"
                : childLabel(child(values, id), "Action"),
              "Action",
              path(count + 1),
            );
          if (parts[count + 1] === "rule") {
            pushRuleNodes(child(values, id).components, "action", count + 1);
            return;
          }
          if (parts[count + 1] === "choices") {
            pushChoices(
              object(child(values, id).components).choices,
              count + 1,
            );
            return;
          }
          if (["costs", "prerequisites"].includes(parts[count + 1] ?? "")) {
            const prerequisite = parts[count + 1] === "prerequisites";
            pushValueCollection(
              object(child(values, id).components)[
                prerequisite ? "prerequisites" : "costs"
              ],
              count + 1,
              prerequisite,
            );
            return;
          }
          if (parts[count + 1] !== "outcomes") return;
          push("Outcomes", "Outcome collection", path(count + 2));
          const outcomeId = parts[count + 2];
          if (!outcomeId) return;
          const valuesOfAction = object(child(values, id).components).outcomes;
          const outcomes = Array.isArray(valuesOfAction) ? valuesOfAction : [];
          const outcomeIndex = outcomes.findIndex(
            (value) => object(value).id === outcomeId,
          );
          const outcome = object(outcomes[outcomeIndex]);
          push(
            outcomeId === "new"
              ? "New Outcome"
              : outcomeIndex >= 0
                ? `Outcome ${outcomeIndex + 1}`
                : "Outcome",
            "Outcome",
            path(count + 3),
          );
          if (parts[count + 3] === "predicate") {
            pushValueCollection(
              outcome.when === undefined ? [] : [outcome.when],
              count + 3,
              true,
              true,
            );
            return;
          }
          if (parts[count + 3] !== "effects") return;
          push("Effects", "Effect collection", path(count + 4));
          const effectIndex = parts[count + 4];
          if (effectIndex === undefined) return;
          const effects = Array.isArray(outcome.effects) ? outcome.effects : [];
          const index = /^(0|[1-9]\d*)$/.test(effectIndex)
            ? Number(effectIndex)
            : -1;
          push(
            effectIndex === "new"
              ? "New Effect"
              : index >= 0 && index < effects.length
                ? `Effect ${index + 1}`
                : "Effect",
            "Effect",
            path(count + 5),
          );
        };
        if (parts[5] === "traits") {
          push("Traits", "Trait collection", path(6));
          if (parts[6]) {
            const trait = child(components.traits, parts[6]);
            push(
              parts[6] === "new" ? "New Trait" : childLabel(trait, "Trait"),
              "Trait",
              path(7),
            );
            if (parts[7] === "actions")
              pushActions(object(trait.components).actions, 8);
            else if (parts[7] === "choices")
              pushChoices(object(trait.components).choices, 7);
            else if (parts[7] === "triggers") {
              push("Triggers", "Trigger collection", path(8));
              const triggerIndex = parts[8];
              if (triggerIndex !== undefined) {
                const values = object(trait.components).triggers;
                const triggers = Array.isArray(values) ? values : [];
                const index = /^(0|[1-9]\d*)$/.test(triggerIndex)
                  ? Number(triggerIndex)
                  : -1;
                push(
                  triggerIndex === "new"
                    ? "New Trigger"
                    : index >= 0 && index < triggers.length
                      ? `Trigger ${index + 1}`
                      : "Trigger",
                  "Trigger",
                  path(9),
                );
                if (parts[9] === "rule") {
                  pushRuleNodes(triggers[index], "trigger", 9);
                } else if (parts[9] === "predicate") {
                  const predicate = object(triggers[index]).predicate;
                  pushValueCollection(
                    predicate === undefined ? [] : [predicate],
                    9,
                    true,
                    true,
                  );
                } else if (parts[9] === "effects") {
                  push("Effects", "Effect collection", path(10));
                  const effectIndex = parts[10];
                  if (effectIndex !== undefined) {
                    const effects = object(triggers[index]).effects;
                    const at = /^(0|[1-9]\d*)$/.test(effectIndex)
                      ? Number(effectIndex)
                      : -1;
                    push(
                      effectIndex === "new"
                        ? "New Effect"
                        : Array.isArray(effects) &&
                            at >= 0 &&
                            at < effects.length
                          ? `Effect ${at + 1}`
                          : "Effect",
                      "Effect",
                      path(11),
                    );
                  }
                }
              }
            } else if (parts[7] === "grants") {
              push("Grants", "Grant collection", path(8));
              const grantIndex = parts[8];
              if (grantIndex !== undefined) {
                const values = object(trait.components).grants;
                const index = /^(0|[1-9]\d*)$/.test(grantIndex)
                  ? Number(grantIndex)
                  : -1;
                push(
                  grantIndex === "new"
                    ? "New Grant"
                    : Array.isArray(values) &&
                        index >= 0 &&
                        index < values.length
                      ? `Grant ${index + 1}`
                      : "Grant",
                  "Grant",
                  path(9),
                );
              }
            } else if (parts[7] === "modifiers") {
              push("Modifiers", "Modifier collection", path(8));
              const modifierId = parts[8];
              if (modifierId !== undefined) {
                const values = object(trait.components).modifiers;
                const modifiers = Array.isArray(values) ? values : [];
                const index = modifiers.findIndex(
                  (value) => object(value).id === modifierId,
                );
                push(
                  modifierId === "new"
                    ? "New Modifier"
                    : index >= 0
                      ? `Modifier ${index + 1}`
                      : "Modifier",
                  "Modifier",
                  path(9),
                );
                if (parts[9] === "predicate") {
                  const predicate = object(modifiers[index]).predicate;
                  pushValueCollection(
                    predicate === undefined ? [] : [predicate],
                    9,
                    true,
                    true,
                  );
                }
              }
            } else if (parts[7] === "prerequisites")
              pushValueCollection(
                object(trait.components).prerequisites,
                7,
                true,
              );
          }
        } else if (parts[5] === "actions") {
          pushActions(components.actions, 6);
        } else if (parts[5] === "vehicle") {
          // Vehicle is a scalar property group, but is the owning context for its Actions.
          push("Vehicle", "Vehicle", path(6));
          if (parts[6] === "actions")
            pushActions(object(components.vehicle).actions, 7);
        }
      }
    }
    return stack;
  }
  if (root === "campaigns") {
    stack[1].links.push(
      {
        label: "Create Campaign Definition",
        href: "/campaigns/definitions/new",
      },
      { label: "Create Campaign Instance", href: "/campaigns/instances/new" },
    );
    if (!parts[2]) return stack;
    const instance = parts[1] === "instances";
    const kind = instance ? "Campaign Instance" : "Campaign Definition";
    if (parts[2] === "new") {
      push(`Create ${kind}`, kind, path(3));
      return stack;
    }
    push(
      (instance ? data.instanceName : data.campaignName)?.trim() || kind,
      kind,
      path(3),
    );
    stack.at(-1)!.groups = instance
      ? campaignInstanceNavigationForPath(parts[2], pathname)
      : campaignDefinitionNavigationForPath(parts[2], pathname);
    if (!instance && parts[3] === "plots") {
      push("Plots", "Plot collection", path(4));
      if (!parts[4]) return stack;
      const navigation = campaignPlotNavigation(pathname, data.records);
      push(
        parts[4] === "new" ? "New Plot" : (navigation?.label ?? "Plot"),
        "Plot",
        path(5),
      );
      if (navigation) stack.at(-1)!.links = navigation.links;
      const collection = CAMPAIGN_PLOT_COLLECTIONS.find(
        (entry) => entry.key === parts[5],
      );
      if (!collection) return stack;
      push(collection.label, "Plot collection", path(6));
      if (navigation) stack.at(-1)!.links = navigation.links;
      if (!parts[6]) return stack;
      const payload = plotObject(
        data.records?.find(
          (record) =>
            record.resourceType === "plots" && record.sourceId === parts[4],
        )?.payload,
      );
      const items =
        payload[
          collection.key === "locations" ? "locationContexts" : collection.key
        ];
      const child = plotObject(
        Array.isArray(items)
          ? items.find((value) => {
              const object = plotObject(value);
              return (
                object.id === parts[6] || object.plotDefinitionId === parts[6]
              );
            })
          : undefined,
      );
      let label = plotLabel(child.name, collection.singular);
      if (
        collection.key === "subplots" ||
        collection.key === "prerequisites" ||
        collection.key === "dependencies"
      )
        label = navigationRecordName(data, parts[6], collection.singular);
      if (collection.key === "locations")
        label =
          data.locations?.find((location) => location.id === child.locationId)
            ?.name ?? "Location context";
      push(
        parts[6] === "new" ? `New ${collection.singular.toLowerCase()}` : label,
        collection.singular,
        path(7),
      );
      if (collection.key === "locations" && parts[7] === "placements") {
        push("Placement associations", "Location context placements", path(8));
        if (parts[8])
          push(
            parts[8] === "new"
              ? "New placement association"
              : navigationRecordName(data, parts[8], "Campaign placement"),
            "Placement association",
            path(9),
          );
      }
      if (collection.key === "discoveries" && parts[7] === "claims") {
        push("Claims", "Discovery claims", path(8));
        if (parts[8]) {
          const claim = plotObject(
            Array.isArray(child.claims)
              ? child.claims.find((value) => plotObject(value).id === parts[8])
              : undefined,
          );
          push(
            parts[8] === "new"
              ? "New claim"
              : plotLabel(claim.statement, "Claim"),
            "Claim",
            path(9),
          );
        }
      }
      if (navigation) stack.at(-1)!.links = navigation.links;
      return stack;
    }
    if (parts[4] && ["plots", "sessions", "run"].includes(parts[3])) {
      const kind = parts[3] === "plots" ? "Plot" : "Session";
      push(navigationRecordName(data, parts[4], kind), kind, path(5));
    }
    return stack;
  }
  for (let index = 1; index < parts.length; index++)
    push(labels[parts[index]] ?? "Details", "Details", path(index + 1));
  return stack;
}

/** World record property groups belong to the record view, never its sidebar. */
export function contextualSidebarFrame(stack: SidebarFrame[]): SidebarFrame {
  return (
    stack.find((frame) => frame.kind === "World" && frame.links.length > 1) ??
    stack.at(-1)!
  );
}

export function contextualBreadcrumbs(
  _pathname: string,
  stack: SidebarFrame[],
): NavigationLink[] {
  const crumbs: NavigationLink[] = stack.map(({ label, href }) => ({
    label,
    href,
  }));
  return crumbs;
}
