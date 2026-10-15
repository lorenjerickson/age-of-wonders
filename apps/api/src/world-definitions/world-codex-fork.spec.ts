import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import {
  buildSnapshotManifest,
  isCanonicalSnapshotManifest,
} from "../domain/snapshot-manifest";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

it("captures, exports and forks Codex links without mutating the original snapshot", async () => {
  const records = [
    {
      resourceType: "definitions",
      sourceId: "skill",
      payload: {
        kind: "skill",
        identity: { id: "skill", key: "aow:tracking" },
      },
    },
    {
      resourceType: "definitions",
      sourceId: "item",
      payload: { kind: "item", identity: { id: "item" }, components: {} },
    },
    {
      resourceType: "definitions",
      sourceId: "creature",
      payload: {
        kind: "creature",
        identity: { id: "creature" },
        components: {
          attributes: {},
          skills: { skill: 50 },
          equipmentPool: ["item"],
        },
      },
    },
    {
      resourceType: "world-effects",
      sourceId: "effect",
      payload: {
        id: "effect",
        revision: 1,
        name: "Practice",
        duration: { kind: "permanent" },
        modifiers: [
          {
            id: "bonus",
            propertyPath: "skills.skill.modifier",
            operation: "add",
            value: 1,
            allowConditionOverride: true,
            duration: { kind: "timed", amount: 1, unit: "hours" },
          },
        ],
      },
    },
    {
      resourceType: "world-conditions",
      sourceId: "condition",
      payload: {
        id: "condition",
        revision: 1,
        name: "Prepared",
        effects: [{ effectId: "effect", modifierOverrides: { bonus: 2 } }],
      },
    },
    {
      resourceType: "world-character-templates",
      sourceId: "npc",
      payload: {
        id: "npc",
        revision: 1,
        name: "Guide",
        creatureDefinitionId: "creature",
        attributes: {},
        skills: { skill: 50 },
        health: { current: 10, maximum: 10, temporary: 0 },
        movement: { walk: 30 },
        vision: { day: 60, night: 0 },
        equipment: [{ slot: "carried", itemDefinitionId: "item" }],
        grantedConditions: [{ conditionId: "condition" }],
      },
    },
  ];
  const manifest = buildSnapshotManifest(1, records);
  const exported = JSON.parse(JSON.stringify(manifest));
  expect(isCanonicalSnapshotManifest(exported)).toBe(true);
  expect(exported.records).toHaveLength(records.length);
  const before = JSON.stringify(manifest);
  let mapping: Record<string, Record<string, string>> = {};
  const now = new Date();
  const tx = {
    worldDefinitionSnapshot: {
      findFirst: jest.fn().mockResolvedValue({
        id: "snapshot",
        worldDefinitionId: "world",
        manifest,
        worldDefinitionRevision: {
          name: "Source",
          content: { definitionIds: ["skill", "item", "creature"] },
        },
      }),
    },
    worldDefinition: {
      create: jest.fn(async ({ data }: { data: object }) => ({
        ...data,
        metadataRevision: 1,
      })),
    },
    worldDefinitionDraft: {
      create: jest.fn(async ({ data }: { data: object }) => ({
        ...data,
        id: "draft",
        storageRevision: 1,
        validationStatus: "NOT_VALIDATED",
        createdAt: now,
        updatedAt: now,
      })),
    },
    worldDefinitionForkProvenance: {
      create: jest.fn(
        async ({ data }: { data: { identityMapping: typeof mapping } }) => {
          mapping = data.identityMapping;
        },
      ),
    },
  };
  const service = new WorldDefinitionAuthoringService(
    { $transaction: (run: (value: typeof tx) => unknown) => run(tx) } as never,
    {} as never,
  );
  const result = await service.fork(
    "world",
    { sourceSnapshotId: "snapshot", name: "Copy" },
    "gm",
  );
  expect(JSON.stringify(manifest)).toBe(before);
  expect(worldCodexSnapshotIssue(result.draft.records)).toBeUndefined();
  const creature = result.draft.records.find(
    (r) => r.sourceId === mapping.definitions!.creature,
  )?.payload as {
    components: { equipmentPool: string[]; skills: Record<string, number> };
  };
  expect(creature.components.equipmentPool).toEqual([
    mapping.definitions!.item,
  ]);
  expect(creature.components.skills[mapping.definitions!.skill!]).toBe(50);
  const effect = result.draft.records.find(
    (r) => r.resourceType === "world-effects",
  )?.payload as { modifiers: { propertyPath: string; duration: unknown }[] };
  expect(effect.modifiers[0]!.propertyPath).toBe(
    `skills.${mapping.definitions!.skill}.modifier`,
  );
  expect(effect.modifiers[0]!.duration).toEqual({
    kind: "timed",
    amount: 1,
    unit: "hours",
  });
});
