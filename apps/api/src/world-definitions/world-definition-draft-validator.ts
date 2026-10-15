import { catalogPublicationIssues } from "./catalog-validation";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { terrainSnapshotIssue } from "./terrain-snapshot";
import { worldRuleSnapshotIssue } from "./world-rule-snapshot";
import {
  CreatureDefinition,
  PlacementDefinition,
  SkillDefinition,
  WorldDefinition,
  type WorldDefinitionValidationIssue,
} from "@aow/domain";
import type { WorldDraftRecordDto } from "./dto/world-definition-authoring.dto";
import { canonicalWorldRecordIssue } from "./world-authored-record";

export interface WorldDraftValidationIssue {
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
}

export interface WorldDraftValidationReport {
  readonly valid: boolean;
  readonly issues: readonly WorldDraftValidationIssue[];
}

export function validateWorldDefinitionDraft(
  content: unknown,
  records: readonly WorldDraftRecordDto[],
): WorldDraftValidationReport {
  const issues: WorldDraftValidationIssue[] = [];
  const add = (code: string, subject: string, detail: string) =>
    issues.push({ code, subject, detail });
  let world: WorldDefinition;
  try {
    world = WorldDefinition.deserializePayload(content, { records });
  } catch {
    add(
      "content-invalid",
      "World draft",
      "The complete World content must be bounded JSON.",
    );
    return { valid: false, issues };
  }
  try {
    const { locationIds: locations, definitionIds: definitions } =
      world.publicationCollections();
    for (const issue of catalogPublicationIssues(content, records))
      add(issue.code, issue.subject, issue.detail);
    const codexIssue = worldCodexSnapshotIssue(records, undefined, {
      publication: true,
      definitionIds: definitions,
    });
    if (codexIssue) add("world-codex-invalid", "World Codex", codexIssue);
    const ruleIssue = worldRuleSnapshotIssue(records);
    if (ruleIssue) add("world-rule-invalid", "World rules", ruleIssue);
    const byId = new Map<string, WorldDraftRecordDto>();
    for (const record of records) {
      byId.set(
        `${record.resourceType.trim()}\0${record.sourceId.trim()}`,
        record,
      );
    }
    for (const id of locations) {
      const record = byId.get(`locations\0${id}`);
      if (!record) continue;
      const detail = canonicalWorldRecordIssue("locations", id, record.payload);
      if (detail)
        add("location-definition-invalid", recordName(record), detail);
    }
    for (const id of definitions) {
      const record = byId.get(`definitions\0${id}`);
      if (!record) continue;
      const detail = canonicalWorldRecordIssue(
        "definitions",
        id,
        record.payload,
      );
      if (detail)
        add("authored-definition-invalid", recordName(record), detail);
      if (
        isObject(record.payload) &&
        record.payload.kind === "skill" &&
        isObject(record.payload.components)
      ) {
        try {
          const skill = SkillDefinition.deserializePayload(record.payload, {
            records,
            definitionIds: definitions,
          });
          try {
            for (const issue of skill.state.metadata.validity.issues)
              if (issue.code === "skill-profession-missing")
                add(issue.code, recordName(record), issue.message);
          } finally {
            skill.dispose();
          }
        } catch {
          // The canonical resource adapter reports malformed payloads above.
        }
      }
    }
    validateCreatureDefinitions(definitions, records, byId, add);
    const terrainIssue = terrainSnapshotIssue(records);
    if (terrainIssue)
      add("terrain-capture-invalid", "Location terrain", terrainIssue);
    validateWorldPlacements(locations, definitions, records, add);
    world.validate({
      mode: "publication",
      records,
      relatedValidation: {
        content,
        records,
        issues: issues.map(({ code, subject, detail }) => ({
          code,
          subject,
          message: detail,
        })),
      },
    });
    issues.length = 0;
    for (const issue of world.state.metadata.validity.issues) {
      add(
        issue.code,
        (issue as WorldDefinitionValidationIssue).subject,
        issue.message,
      );
    }
  } finally {
    world.dispose();
  }
  issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject),
  );
  return { valid: issues.length === 0, issues };
}

/** Translate entity-owned publication diagnostics to the existing API report. */
function validateCreatureDefinitions(
  definitionIds: readonly string[],
  records: readonly WorldDraftRecordDto[],
  byId: ReadonlyMap<string, WorldDraftRecordDto>,
  add: (c: string, s: string, d: string) => void,
): void {
  for (const id of definitionIds) {
    const record = byId.get(`definitions\0${id}`);
    if (
      !record ||
      !isObject(record.payload) ||
      record.payload.kind !== "creature"
    )
      continue;
    try {
      const entity = CreatureDefinition.deserializePayload(record.payload, {
        sourceId: id,
        mode: "publication",
        definitionIds,
        records,
      });
      try {
        for (const issue of entity.state.metadata.validity.issues) {
          if (
            issue.code === "creature-definition-reference-invalid" ||
            issue.code === "creature-embodiment-policy-invalid"
          )
            add(issue.code, recordName(record), issue.message);
        }
      } finally {
        entity.dispose();
      }
    } catch {
      // The bounded-JSON and canonical-record adapters report decode failures above.
    }
  }
}

function validateWorldPlacements(
  locationIds: readonly string[],
  definitionIds: readonly string[],
  records: readonly WorldDraftRecordDto[],
  add: (c: string, s: string, d: string) => void,
): void {
  const placementRecords = records.filter(
    (record) => record.resourceType.trim() === "world-placements",
  );
  for (const record of placementRecords) {
    const subject = recordName(record);
    const id = record.sourceId.trim();
    let placement: PlacementDefinition;
    try {
      placement = PlacementDefinition.deserializePayload(record.payload, {
        scope: "world",
        sourceId: id,
        capturedLocationIds: locationIds,
        capturedDefinitionIds: definitionIds,
        records,
      });
    } catch {
      add(
        "world-placement-invalid",
        subject,
        "The World placement shape, presentation, or coordinates are invalid.",
      );
      continue;
    }
    try {
      const issues = placement.state.metadata.validity.issues;
      if (issues.length) {
        for (const issue of issues) add(issue.code, subject, issue.message);
        continue;
      }
    } finally {
      placement.dispose();
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordName(record?: WorldDraftRecordDto): string {
  if (record && isObject(record.payload)) {
    const name = record.payload.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    const identity = record.payload.identity;
    if (
      isObject(identity) &&
      typeof identity.name === "string" &&
      identity.name.trim()
    )
      return identity.name.trim();
  }
  return "World resource";
}
