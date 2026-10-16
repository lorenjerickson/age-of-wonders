import { catalogRecordIssue } from "./catalog-validation";
import {
  LocationDefinition,
  CreatureDefinition,
  ItemDefinition,
  EffectDefinition,
  ConditionDefinition,
  CharacterTemplate,
  ProfessionDefinition,
  BackgroundDefinition,
  HeritageDefinition,
  DisciplineDefinition,
  FeatDefinition,
  ActionDefinition,
  TraitDefinition,
  CharacterDefinition,
  MonsterDefinition,
} from "@aow/domain";
import { WORLD_CODEX_RESOURCES, type WorldCodexCollection } from "@aow/common";
import { isObject } from "../domain/domain-resource";

type RecordEntry = { resourceType: string; sourceId: string; payload: unknown };
const text = (v: unknown, max = 240): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const array = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length <= 200;
const find = (records: readonly RecordEntry[], resource: string, id: unknown) =>
  records.find((r) => r.resourceType === resource && r.sourceId === id)
    ?.payload;
export function worldCodexEntryIssue(
  collection: WorldCodexCollection,
  value: unknown,
  records: readonly RecordEntry[],
  baseline?: unknown,
): string | undefined {
  try {
    const entity =
      collection === "effects"
        ? EffectDefinition.deserializePayload(value, { records })
        : collection === "conditions"
          ? ConditionDefinition.deserializePayload(value, { records })
          : CharacterTemplate.deserializePayload(value, { records, baseline });
    try {
      return entity.state.metadata.validity.issues.find(
        (issue) => issue.blocking !== false,
      )?.message;
    } finally {
      entity.dispose();
    }
  } catch {
    return "Provide a valid Codex name and description.";
  }
}

export function grantedConditionIssue(
  value: unknown,
  records: readonly RecordEntry[],
): string | undefined {
  if (value === undefined) return undefined;
  if (!array(value)) return "Choose a valid granted Condition list.";
  const ids = new Set<string>();
  for (const link of value) {
    if (
      !isObject(link) ||
      !text(link.conditionId) ||
      ids.has(link.conditionId) ||
      !find(records, WORLD_CODEX_RESOURCES.conditions, link.conditionId)
    )
      return "A granted Condition is duplicated or unavailable in this World.";
    ids.add(link.conditionId);
  }
}
export function worldCodexSnapshotIssue(
  records: readonly RecordEntry[],
  previousRecords?: readonly RecordEntry[],
  options: {
    readonly publication?: boolean;
    readonly definitionIds?: readonly string[];
  } = {},
): string | undefined {
  for (const record of records) {
    const collection = (
      Object.keys(WORLD_CODEX_RESOURCES) as WorldCodexCollection[]
    ).find((k) => WORLD_CODEX_RESOURCES[k] === record.resourceType);
    if (collection) {
      if (!isObject(record.payload) || record.payload.id !== record.sourceId)
        return "The Codex identity does not match its snapshot record.";
      const issue = worldCodexEntryIssue(
        collection,
        record.payload,
        records,
        previousRecords?.find(
          (previous) =>
            previous.resourceType === record.resourceType &&
            previous.sourceId === record.sourceId,
        )?.payload,
      );
      if (issue) return issue;
    }
    if (isObject(record.payload)) {
      const p = record.payload;
      if (record.resourceType === "locations") {
        try {
          const entity = LocationDefinition.deserializePayload(p, {
            sourceId: record.sourceId,
            records,
            baseline: previousRecords?.find(
              (previous) =>
                previous.resourceType === record.resourceType &&
                previous.sourceId === record.sourceId,
            )?.payload,
            mode:
              previousRecords && !options.publication ? "draft" : "publication",
          });
          try {
            const issue = entity.state.metadata.validity.issues.find(
              (issue) =>
                issue.code.startsWith("location-codex-") &&
                issue.blocking !== false,
            );
            if (issue) return issue.message;
          } finally {
            entity.dispose();
          }
        } catch {
          return "A Location Definition requires a bounded JSON object.";
        }
      }
      if (
        record.resourceType === "definitions" &&
        (isObject(p.components) ||
          p.kind === "monster" ||
          p.kind === "character-template" ||
          [
            "action",
            "trait",
            "item",
            "profession",
            "background",
            "feat",
            "heritage",
            "discipline",
          ].includes(p.kind as string))
      ) {
        const previous = previousRecords?.find(
          (entry) =>
            entry.resourceType === record.resourceType &&
            entry.sourceId === record.sourceId,
        )?.payload;
        if (
          (previousRecords !== undefined || options.publication) &&
          p.components !== undefined &&
          !isObject(p.components) &&
          (options.publication ||
            !isObject(previous) ||
            previous.kind !== p.kind ||
            JSON.stringify(previous.components) !==
              JSON.stringify(p.components))
        )
          return "Provide a valid Definition components object.";
        // Allow unchanged imported mechanics during draft edits; changed owner fields
        // and publication snapshots consume their entity's structural diagnostics.
        const changedMechanics = (path: string | undefined): boolean => {
          if (
            options.publication ||
            !previousRecords ||
            !isObject(previous) ||
            previous.kind !== p.kind
          )
            return true;
          const field = path?.match(/^components\.([^.[\]]+)/)?.[1];
          if (!field)
            return (
              JSON.stringify(previous.components) !==
              JSON.stringify(p.components)
            );
          return (
            !isObject(previous.components) ||
            !isObject(p.components) ||
            JSON.stringify(previous.components[field]) !==
              JSON.stringify(p.components[field])
          );
        };
        if (p.kind === "monster") {
          try {
            const entity = MonsterDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
              mode:
                previousRecords && !options.publication
                  ? "draft"
                  : "publication",
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  !issue.unresolved &&
                  issue.blocking !== false &&
                  changedMechanics(issue.path),
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Creature catalog Definition must contain valid JSON state.";
          }
        }
        if (p.kind === "character-template") {
          // Character-owned choices, Traits and generation grammar are validated by the entity.
          try {
            const entity = CharacterDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("character-definition-codex-") ||
                    (changedMechanics(issue.path) &&
                      (issue.code ===
                        "character-definition-components-invalid" ||
                        issue.code.startsWith("character-choice-") ||
                        issue.code.startsWith("character-generation-") ||
                        issue.code.startsWith(
                          "character-definition-traits-",
                        )))) &&
                  !issue.unresolved &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Character Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "trait") {
          // Preserve this legacy gate's Condition-link scope; the entity also
          // exposes richer Trait structure diagnostics to authoring callers.
          try {
            const entity = TraitDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("trait-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Trait Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "action") {
          // Preserve this legacy gate's Condition-link scope; the entity also
          // exposes richer Action structure diagnostics to authoring callers.
          try {
            const entity = ActionDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("action-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Action Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "feat") {
          // Preserve this legacy gate's Condition-link scope; the entity also
          // exposes richer Feat structure diagnostics to authoring callers.
          try {
            const entity = FeatDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("feat-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Feat Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "discipline") {
          // Preserve this legacy gate's Condition-link scope; the entity also
          // exposes richer Discipline structure diagnostics to authoring callers.
          try {
            const entity = DisciplineDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("discipline-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Discipline Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "heritage") {
          // Preserve this legacy gate's Condition-link scope; the entity also
          // exposes richer Heritage structure diagnostics to authoring callers.
          try {
            const entity = HeritageDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("heritage-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Heritage Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "background") {
          try {
            const entity = BackgroundDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("background-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Background Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "profession") {
          try {
            const entity = ProfessionDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("profession-codex-") ||
                    ((previousRecords !== undefined || options.publication) &&
                      !issue.unresolved &&
                      !issue.code.includes("-model-") &&
                      !issue.code.includes("-references-") &&
                      changedMechanics(issue.path))) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Profession Definition must be a bounded JSON object.";
          }
        }
        if (p.kind === "creature") {
          try {
            const entity = CreatureDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
              baseline: previous,
              mode:
                previousRecords && !options.publication
                  ? "draft"
                  : "publication",
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  issue.code.startsWith("creature-codex-") &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Creature Definition must contain valid JSON state.";
          }
        }
        if (p.kind === "item") {
          try {
            const entity = ItemDefinition.deserializePayload(p, {
              sourceId: record.sourceId,
              records,
              definitionIds: options.definitionIds,
              baseline: previous,
              mode:
                previousRecords && !options.publication
                  ? "draft"
                  : "publication",
            });
            try {
              const issue = entity.state.metadata.validity.issues.find(
                (issue) =>
                  (issue.code.startsWith("item-codex-") ||
                    ((issue.code.startsWith("item-mechanics-") ||
                      ((previousRecords !== undefined || options.publication) &&
                        /^(item-traits-|item-actions-|item-vehicle-)/.test(
                          issue.code,
                        ))) &&
                      changedMechanics(issue.path))) &&
                  (!issue.unresolved ||
                    (options.publication &&
                      issue.code ===
                        "item-vehicle-component-reference-unresolved")) &&
                  issue.blocking !== false,
              );
              if (issue) return issue.message;
            } finally {
              entity.dispose();
            }
          } catch {
            return "The Item Definition must contain valid JSON state.";
          }
        }
      }
      const grantIssue = grantedConditionIssue(
        record.resourceType === "definitions" &&
          p.kind !== "creature" &&
          p.kind !== "item" &&
          p.kind !== "profession" &&
          p.kind !== "background" &&
          p.kind !== "heritage" &&
          p.kind !== "discipline" &&
          p.kind !== "feat" &&
          p.kind !== "action" &&
          p.kind !== "trait" &&
          p.kind !== "character-template" &&
          isObject(p.components)
          ? p.components.grantedConditions
          : undefined,
        records,
      );
      if (grantIssue) return grantIssue;
    }
    try {
      const catalogIssue = catalogRecordIssue(
        record.resourceType,
        record.sourceId,
        record.payload,
        options.publication
          ? undefined
          : previousRecords?.find(
              (previous) =>
                previous.resourceType === record.resourceType &&
                previous.sourceId === record.sourceId,
            )?.payload,
      );
      if (catalogIssue) return catalogIssue;
    } catch {
      return "A catalog record requires valid JSON data.";
    }
  }
}
