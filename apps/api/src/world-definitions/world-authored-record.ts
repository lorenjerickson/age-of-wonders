import { catalogRecordIssue } from "./catalog-validation";
import {
  LocationDefinition,
  CreatureDefinition,
  ItemDefinition,
  SkillDefinition,
  ProfessionDefinition,
  BackgroundDefinition,
} from "@aow/domain";

/** Compatibility adapter; Location owns construction and retained private state. */
export const worldLocationPayload =
  LocationDefinition.authorPayload.bind(LocationDefinition);

/** Compatibility adapters for existing authoring and artwork callers. */
export const preservedCreatureImages =
  CreatureDefinition.preservedImages.bind(CreatureDefinition);
export const worldCreaturePayload =
  CreatureDefinition.authorPayload.bind(CreatureDefinition);

export const worldItemPayload =
  ItemDefinition.authorPayload.bind(ItemDefinition);

export function canonicalWorldRecordIssue(
  resourceType: string,
  sourceId: string,
  payload: unknown,
  baseline?: unknown,
): string | undefined {
  const catalogIssue = catalogRecordIssue(resourceType, sourceId, payload);
  if (catalogIssue) return catalogIssue;
  if (resourceType === "locations") {
    try {
      const entity = LocationDefinition.deserializePayload(payload, {
        sourceId,
        ...(baseline === undefined ? {} : { mode: "draft" as const, baseline }),
      });
      try {
        return entity.state.metadata.validity.issues.find((issue) =>
          issue.code.startsWith("location-canonical-"),
        )?.message;
      } finally {
        entity.dispose();
      }
    } catch {
      return "A Location Definition requires a bounded JSON object.";
    }
  }
  if (resourceType !== "definitions" || !isObject(payload)) return undefined;
  if (payload.kind === "background") {
    try {
      const entity = BackgroundDefinition.deserializePayload(payload, {
        sourceId,
      });
      try {
        return entity.state.metadata.validity.issues.find(
          (issue) => issue.code === "background-canonical-components",
        )?.message;
      } finally {
        entity.dispose();
      }
    } catch {
      return "The Background Definition must be a bounded JSON object.";
    }
  }
  if (payload.kind === "skill") {
    try {
      const entity = SkillDefinition.deserializePayload(payload, { sourceId });
      try {
        return entity.state.metadata.validity.issues.find(
          (issue) => issue.code === "skill-canonical-components",
        )?.message;
      } finally {
        entity.dispose();
      }
    } catch {
      return "The Skill Definition must be a bounded JSON object.";
    }
  }
  if (payload.kind === "profession") {
    try {
      const entity = ProfessionDefinition.deserializePayload(payload, {
        sourceId,
      });
      try {
        return entity.state.metadata.validity.issues.find(
          (issue) => issue.code === "profession-canonical-components",
        )?.message;
      } finally {
        entity.dispose();
      }
    } catch {
      return "The Profession Definition must be a bounded JSON object.";
    }
  }
  if (payload.kind !== "creature" && payload.kind !== "item") return undefined;
  if (payload.kind === "creature") {
    try {
      const entity = CreatureDefinition.deserializePayload(payload, {
        sourceId,
      });
      try {
        return entity.state.metadata.validity.issues.find((issue) =>
          issue.code.startsWith("creature-canonical-"),
        )?.message;
      } finally {
        entity.dispose();
      }
    } catch {
      return "The Creature Definition components or embodiment policy are invalid.";
    }
  }
  try {
    const entity = ItemDefinition.deserializePayload(payload, { sourceId });
    try {
      return entity.state.metadata.validity.issues.find((issue) =>
        issue.code.startsWith("item-canonical-"),
      )?.message;
    } finally {
      entity.dispose();
    }
  } catch {
    return "The Item Definition components, family, or image are invalid.";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
