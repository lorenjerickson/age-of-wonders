import { CreatureDefinition, ItemDefinition } from "@aow/domain";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

describe("Raw authored resource hydration", () => {
  it.each(["creature", "item"] as const)(
    "does not unwrap envelope-shaped %s resource fields",
    (kind) => {
      const inner =
        kind === "item"
          ? ItemDefinition.authorPayload(
              "entry",
              {
                name: "Key",
                itemFamilyKey: "world:tool",
                category: "tool",
                quality: "standard",
                compatibleEquipmentSlotSets: [],
              },
              {
                conceptId: "item" as never,
                modelSchemaReleaseIds: ["model"] as never,
              },
            )
          : CreatureDefinition.authorPayload(
              "entry",
              {
                name: "Raven",
                attributes: {},
                equipmentSlots: [],
                instanceEmbodimentPolicy: { strategy: "one-per-instance" },
              },
              {
                conceptId: "creature" as never,
                modelSchemaReleaseIds: ["model"] as never,
              },
            );
      const value = {
        ...inner,
        type: `${kind}-definition`,
        schemaVersion: 1,
        data: inner,
        components: {},
      };
      expect(
        canonicalWorldRecordIssue("definitions", "entry", value),
      ).toContain("components");
      const scalar = {
        ...inner,
        type: `${kind}-definition`,
        schemaVersion: 1,
        data: inner,
        components:
          kind === "item"
            ? { weight: { value: -1, unit: "pound" } }
            : { health: { current: 10, maximum: 2, temporary: 0 } },
      };
      expect(
        worldCodexSnapshotIssue([
          { resourceType: "definitions", sourceId: "entry", payload: scalar },
        ]),
      ).toContain(kind === "item" ? "weight" : "health");
      const Class = kind === "item" ? ItemDefinition : CreatureDefinition;
      const validOuter = {
        ...inner,
        type: `${kind}-definition`,
        schemaVersion: 99,
        data: { retained: true },
      };
      expect(Class.deserializePayload(validOuter).serializePayload()).toEqual(
        validOuter,
      );
    },
  );
});
