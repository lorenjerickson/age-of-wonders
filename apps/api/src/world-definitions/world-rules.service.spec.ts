import { WorldRulesService } from "./world-rules.service";
import { starterMovementRules } from "@aow/common";
import { worldRuleSnapshotIssue } from "./world-rule-snapshot";
import { validateTargetRuntime } from "../campaign-instances/campaign-instance-migrations.service";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";

function fixture() {
  let draft = {
    id: "draft-one",
    worldDefinitionId: "world-one",
    storageRevision: 1,
    revisionName: "Captured coast",
    content: {},
    records: [] as {
      resourceType: string;
      sourceId: string;
      sourceRevision?: number;
      payload: unknown;
    }[],
  };
  const authoring = {
    getActiveDraft: jest.fn(() => Promise.resolve(draft)),
    getDraft: jest.fn(() => Promise.resolve(draft)),
    save: jest.fn(
      (
        _world: string,
        dto: {
          expectedStorageRevision?: number;
          expectedDraftId?: string;
          records: typeof draft.records;
        },
      ) => {
        if (
          dto.expectedStorageRevision !== draft.storageRevision ||
          dto.expectedDraftId !== draft.id
        )
          throw new Error("stale");
        draft = {
          ...draft,
          records: dto.records,
          storageRevision: draft.storageRevision + 1,
        };
        return Promise.resolve(draft);
      },
    ),
  };
  return {
    service: new WorldRulesService(authoring as never),
    authoring,
    getDraft: () => draft,
  };
}
const expected = { expectedDraftId: "draft-one", expectedStorageRevision: 1 };

describe("World executable rules authoring", () => {
  it("keeps empty Worlds inert until the GM explicitly adopts authored mechanics", async () => {
    const { service, authoring, getDraft } = fixture();
    expect((await service.list("world-one", "gm")).rules).toEqual([]);
    expect(authoring.save).not.toHaveBeenCalled();
    const adopted = await service.starter("world-one", "gm", expected, 25);
    expect(adopted.rules).toHaveLength(6);
    expect(adopted.rules.every((r) => r.audit.createdBy === "gm")).toBe(true);
    expect(worldRuleSnapshotIssue(getDraft().records)).toBeUndefined();
    expect(authoring.save).toHaveBeenCalledWith(
      "world-one",
      expect.objectContaining({
        expectedDraftId: "draft-one",
        expectedStorageRevision: 1,
      }),
      "gm",
      true,
    );
  });
  it("rejects stale/replaced drafts without changing their records", async () => {
    const { service, authoring } = fixture();
    await expect(
      service.starter("world-one", "gm", {
        ...expected,
        expectedDraftId: "old-draft",
      }),
    ).rejects.toThrow("draft changed");
    await expect(
      service.starter("world-one", "gm", {
        ...expected,
        expectedStorageRevision: 9,
      }),
    ).rejects.toThrow("draft changed");
    expect(authoring.save).not.toHaveBeenCalled();
  });
  it("assigns audit and lineage server-side and duplicates disabled rules without replacing originals", async () => {
    const { service } = fixture();
    const input = starterMovementRules({
      budgetFeet: 30,
      ids: ["a", "b", "c", "d", "e", "f"],
      createdBy: "forged",
      updatedAt: new Date().toISOString(),
    })[0];
    const created = await service.upsert("world-one", "gm", expected, input);
    expect(created.rules[0].id).not.toBe("a");
    expect(created.rules[0].revision).toBe(1);
    expect(created.rules[0].audit.createdBy).toBe("gm");
    const copy = await service.duplicate(
      "world-one",
      "gm",
      { ...expected, expectedStorageRevision: 2 },
      created.rules[0].id,
    );
    expect(copy.rules).toHaveLength(2);
    expect(copy.rules[1].lifecycle).toBe("disabled");
    expect(copy.rules[1].id).not.toBe(created.rules[0].id);
  });
  it("preserves record metadata while assigning rule audit fields server-side", async () => {
    const { service, getDraft } = fixture();
    const rule = starterMovementRules({
      budgetFeet: 30,
      ids: ["a", "b", "c", "d", "e", "f"],
      createdBy: "gm",
      updatedAt: new Date().toISOString(),
    })[0];
    const created = await service.upsert("world-one", "gm", expected, rule);
    const record = getDraft().records[0];
    const prior = record.payload as typeof rule;
    Object.assign(record, { privateRecord: { retained: true } });
    const edited = await service.upsert(
      "world-one",
      "gm",
      { ...expected, expectedStorageRevision: 2 },
      {
        ...prior,
        name: "Revised rule",
        audit: { createdBy: "forged", updatedAt: "forged" },
      },
      created.rules[0].id,
    );
    expect(edited.rules[0]).toMatchObject({
      name: "Revised rule",
      audit: {
        createdBy: "gm",
      },
    });
    expect(getDraft().records[0]).toMatchObject({
      privateRecord: { retained: true },
      sourceRevision: 2,
    });
    expect(edited.rules[0].audit.updatedAt).not.toBe("forged");
  });
  it("rejects unsupported effects and inconsistent captured rule provenance", async () => {
    const { service, authoring } = fixture();
    const input = starterMovementRules({
      budgetFeet: 30,
      ids: ["a", "b", "c", "d", "e", "f"],
      createdBy: "gm",
      updatedAt: new Date().toISOString(),
    })[0];
    await expect(
      service.upsert("world-one", "gm", expected, {
        ...input,
        effects: [{ kind: "execute-shell", command: "no" }],
      }),
    ).rejects.toThrow();
    expect(authoring.save).not.toHaveBeenCalled();
    expect(
      worldRuleSnapshotIssue([
        { resourceType: "world-rules", sourceId: "other", payload: input },
      ]),
    ).toContain("inconsistent");
    expect(worldRuleSnapshotIssue([])).toBeUndefined();
  });
  it("blocks unsupported captured rules during Instance migration validation", () => {
    const malformed = buildSnapshotManifest(1, [
      {
        resourceType: "world-rules",
        sourceId: "bad",
        payload: { name: "Unsupported rule" },
      },
    ]);
    const empty = buildSnapshotManifest(1, [
      {
        resourceType: "campaign-definition-revision",
        sourceId: "campaign",
        payload: { name: "Campaign" },
      },
    ]);
    expect(
      validateTargetRuntime({}, "instance", "snapshot", empty, malformed),
    ).toEqual([expect.objectContaining({ code: "captured-rules-invalid" })]);
  });
});
