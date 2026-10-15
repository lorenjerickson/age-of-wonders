import { ConflictException, NotFoundException } from "@nestjs/common";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { WorldAuthoringController } from "./world-authoring.controller";
const expected = { expectedDraftId: "draft", expectedStorageRevision: 3 };
const record = (kind: string, id = "target", components = {}) => ({
  resourceType: "definitions",
  sourceId: id,
  payload: { kind, components },
});
function harness(kind: string, others: ReturnType<typeof record>[] = []) {
  const records = [record(kind), ...others];
  const draft = {
    id: "draft",
    worldDefinitionId: "world",
    revisionName: "Draft",
    storageRevision: 3,
    validationStatus: "NOT_VALIDATED",
    content: { definitionIds: records.map((r) => r.sourceId) },
    snapshotRecords: records,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const service = new WorldDefinitionAuthoringService(
    {
      worldDefinition: {
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", draft }),
      },
      worldDefinitionDraft: { updateMany },
    } as never,
    {} as never,
  );
  return { service, updateMany };
}
it.each([
  "skill",
  "profession",
  "background",
  "monster",
  "character-template",
] as const)(
  "removes an unused %s, preserving the remaining capture",
  async (kind) => {
    const sibling = record("action", "sibling", {
      extensions: { private: true },
    });
    const { service, updateMany } = harness(kind, [sibling]);
    await service.deleteAuthoredRecord("world", "gm", kind, "target", expected);
    expect(updateMany.mock.calls[0][0].where.storageRevision).toBe(3);
    expect(updateMany.mock.calls[0][0].data.snapshotRecords).toEqual([sibling]);
    expect(updateMany.mock.calls[0][0].data.content.definitionIds).toEqual([
      "sibling",
    ]);
  },
);
it("rejects reference-bearing, stale and wrong-kind removal without persistence", async () => {
  const { service, updateMany } = harness("profession", [
    record("skill", "sibling", { professionId: "target" }),
  ]);
  await expect(
    service.deleteAuthoredRecord(
      "world",
      "gm",
      "profession",
      "target",
      expected,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  await expect(
    service.deleteAuthoredRecord("world", "gm", "profession", "target", {
      ...expected,
      expectedStorageRevision: 2,
    }),
  ).rejects.toBeInstanceOf(ConflictException);
  await expect(
    service.deleteAuthoredRecord(
      "world",
      "gm",
      "background",
      "target",
      expected,
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(updateMany).not.toHaveBeenCalled();
});
it("routes only supported destinations with authenticated ownership", () => {
  const deleteAuthoredRecord = jest.fn();
  const controller = new WorldAuthoringController(
    {} as never,
    { deleteAuthoredRecord } as never,
    {} as never,
  );
  const request = { user: { id: "gm" } } as never;
  controller.deleteCharacterOption(
    "world",
    "professions",
    "target",
    request,
    expected,
  );
  expect(deleteAuthoredRecord).toHaveBeenLastCalledWith(
    "world",
    "gm",
    "profession",
    "target",
    expected,
  );
  controller.deleteCatalogMonster("world", "target", request, expected);
  expect(deleteAuthoredRecord).toHaveBeenLastCalledWith(
    "world",
    "gm",
    "monster",
    "target",
    expected,
  );
  controller.deleteCatalogCharacter("world", "target", request, expected);
  expect(deleteAuthoredRecord).toHaveBeenLastCalledWith(
    "world",
    "gm",
    "character-template",
    "target",
    expected,
  );
  expect(() =>
    controller.deleteCharacterOption(
      "world",
      "feats",
      "target",
      request,
      expected,
    ),
  ).toThrow(NotFoundException);
});
