import { worldCodexSnapshotIssue } from "./world-codex-validation";
const record = (kind: string, components: unknown) => ({
  resourceType: "definitions",
  sourceId: "catalog",
  payload: { kind, components },
});
describe("B03 character option authoring boundary", () => {
  it.each([
    [
      "profession",
      {
        actions: [
          { advancementPointsOnUse: { kind: "constant", value: false } },
        ],
      },
    ],
    ["background", { characteristics: { ideal: [false] } }],
    ["feat", { choices: [{ minimum: false }] }],
    ["heritage", { prerequisites: [{ kind: "not", predicate: false }] }],
    [
      "discipline",
      {
        activationTime: [
          {
            kind: "resource",
            cost: { amount: { kind: "constant", value: false } },
          },
        ],
      },
    ],
  ])(
    "rejects new malformed %s fields and preserves unchanged inherited fields",
    (kind, components) => {
      const row = record(kind as string, components);
      expect(worldCodexSnapshotIssue([row], [])).toBeDefined();
      expect(worldCodexSnapshotIssue([row], [row])).toBeUndefined();
    },
  );
  it.each([
    [
      "profession",
      {
        expertiseLevels: [
          {
            tier: "home:novice",
            rank: 0,
            benefits: {},
            advancementPointCost: { kind: "constant" },
          },
        ],
      },
    ],
    ["background", { choices: [{}] }],
    ["feat", { traits: [], choices: [{}] }],
    [
      "heritage",
      {
        modifierPairs: [
          {
            id: "p",
            beneficial: [{ kind: "grant-action" }],
            harmful: [{ kind: "custom", key: "home:cost", payload: null }],
          },
        ],
      },
    ],
    ["discipline", { inputs: [{ kind: "device" }] }],
  ])("permits incomplete %s drafts", (kind, components) => {
    expect(
      worldCodexSnapshotIssue([record(kind as string, components)], []),
    ).toBeUndefined();
  });
});

import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
it("saves a new empty Profession through the full draft PUT path and rejects malformed edits before persistence", async () => {
  const components = {
    expertiseOrder: [],
    expertiseLevels: [],
    acquisition: [],
    actions: [],
  };
  const row = record("profession", components);
  const content = { definitionIds: ["catalog"] };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const draft = {
    id: "draft",
    worldDefinitionId: "world",
    storageRevision: 1,
    content: { definitionIds: [] as string[] },
    revisionName: "Draft",
    snapshotRecords: [] as unknown[],
    validationStatus: "NOT_VALIDATED",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  updateMany.mockImplementation(
    async ({
      data,
    }: {
      data: {
        snapshotRecords: unknown[];
        content: { definitionIds: string[] };
      };
    }) => {
      draft.snapshotRecords = data.snapshotRecords;
      draft.content = data.content;
      draft.storageRevision += 1;
      return { count: 1 };
    },
  );
  const service = new WorldDefinitionAuthoringService(
    {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
    } as never,
    {} as never,
  );
  const saved = await service.save(
    "world",
    {
      expectedStorageRevision: 1,
      revisionName: "Draft",
      content,
      records: [row],
    },
    "gm",
  );
  expect(saved.records).toEqual([row]);
  expect(updateMany).toHaveBeenCalledTimes(1);
  await expect(
    service.save(
      "world",
      {
        expectedStorageRevision: 2,
        revisionName: "Draft",
        content,
        records: [
          record("profession", {
            ...components,
            actions: [
              { advancementPointsOnUse: { kind: "constant", value: false } },
            ],
          }),
        ],
      },
      "gm",
    ),
  ).rejects.toThrow("valid rule value");
  expect(updateMany).toHaveBeenCalledTimes(1);
});
