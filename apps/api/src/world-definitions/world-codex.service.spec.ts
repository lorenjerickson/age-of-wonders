import { WorldCodexService } from "./world-codex.service";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { worldAccessWhere } from "./world-access";
function fixture() {
  let draft = {
    id: "draft",
    worldDefinitionId: "world",
    storageRevision: 1,
    revisionName: "Draft",
    content: {},
    records: [
      {
        resourceType: "definitions",
        sourceId: "creature",
        payload: { kind: "creature" },
      },
    ] as { resourceType: string; sourceId: string; payload: unknown }[],
  };
  const authoring = {
    getActiveDraft: jest.fn(async () => draft),
    getDraft: jest.fn(async () => draft),
    save: jest.fn(
      async (_world: string, dto: { records: typeof draft.records }) =>
        (draft = {
          ...draft,
          records: dto.records,
          storageRevision: draft.storageRevision + 1,
        }),
    ),
  };
  return {
    service: new WorldCodexService(authoring as never, {} as never),
    authoring,
    expected: () => ({
      expectedDraftId: draft.id,
      expectedStorageRevision: draft.storageRevision,
    }),
  };
}
const effect = {
  name: "Haste",
  modifiers: [
    {
      id: "speed",
      propertyPath: "movement.walk",
      operation: "add",
      value: 10,
      allowConditionOverride: true,
    },
  ],
  duration: { kind: "permanent" },
};
const character = {
  name: "Guide",
  creatureDefinitionId: "creature",
  attributes: {},
  skills: {},
  health: { current: 10, maximum: 10, temporary: 0 },
  vision: { day: 60, night: 0 },
  movement: { walk: 30 },
  equipment: [],
  grantedConditions: [],
};
describe("World Codex", () => {
  it("creates, edits, lists and deletes draft entries with server identities", async () => {
    const f = fixture();
    const result = await f.service.upsert(
      "world",
      "gm",
      "effects",
      f.expected(),
      { ...effect, id: "untrusted", revision: 100 },
    );
    expect(result.items[0].id).not.toBe("untrusted");
    expect(result.items[0].revision).toBe(1);
    const next = await f.service.upsert(
      "world",
      "gm",
      "effects",
      f.expected(),
      { ...effect, name: "Greater haste" },
      result.items[0].id,
    );
    expect(next.items[0]).toMatchObject({ name: "Greater haste", revision: 2 });
    expect((await f.service.list("world", "gm", "effects")).items).toEqual(
      next.items,
    );
    expect(
      (
        await f.service.remove(
          "world",
          "gm",
          "effects",
          f.expected(),
          next.items[0].id,
        )
      ).items,
    ).toEqual([]);
    expect(f.authoring.getActiveDraft).toHaveBeenCalledWith("world", "gm");
  });
  it("rejects replaced drafts, foreign references and changing the NPC Creature template", async () => {
    const f = fixture();
    await expect(
      f.service.upsert(
        "world",
        "gm",
        "effects",
        { ...f.expected(), expectedDraftId: "replaced" },
        effect,
      ),
    ).rejects.toThrow("draft changed");
    await expect(
      f.service.upsert("world", "gm", "conditions", f.expected(), {
        name: "Quick",
        effects: [{ effectId: "other-world" }],
      }),
    ).rejects.toThrow("unavailable");
    const result = await f.service.upsert(
      "world",
      "gm",
      "characters",
      f.expected(),
      character,
    );
    await expect(
      f.service.upsert(
        "world",
        "gm",
        "characters",
        f.expected(),
        { ...character, creatureDefinitionId: "other" },
        result.items[0].id,
      ),
    ).rejects.toThrow("cannot be changed");
  });
  it("keeps referenced Effects and prevents non-overridable overrides", async () => {
    const f = fixture();
    const result = await f.service.upsert(
      "world",
      "gm",
      "effects",
      f.expected(),
      effect,
    );
    const id = result.items[0].id;
    await f.service.upsert("world", "gm", "conditions", f.expected(), {
      name: "Quick",
      effects: [{ effectId: id, modifierOverrides: { speed: 20 } }],
    });
    await expect(
      f.service.remove("world", "gm", "effects", f.expected(), id),
    ).rejects.toThrow("still used");
    await expect(
      f.service.upsert(
        "world",
        "gm",
        "effects",
        f.expected(),
        {
          ...effect,
          modifiers: [
            { ...effect.modifiers[0], allowConditionOverride: false },
          ],
        },
        id,
      ),
    ).rejects.toThrow("does not allow");
  });
  it("validates conditions granted from existing authoring records", () => {
    expect(
      worldCodexSnapshotIssue([
        {
          resourceType: "locations",
          sourceId: "town",
          payload: { grantedConditions: [{ conditionId: "foreign" }] },
        },
      ]),
    ).toContain("unavailable");
  });
  it("requires editor role for shared writes and an active matching Player for every share", () => {
    expect(worldAccessWhere("user", true)).toEqual({
      OR: [
        { ownerUserId: "user" },
        {
          accessEntries: {
            some: {
              role: "editor",
              player: { userId: "user", standing: "ACTIVE" },
            },
          },
        },
      ],
    });
    expect(worldAccessWhere("user")).toEqual({
      OR: [
        { ownerUserId: "user" },
        {
          accessEntries: {
            some: { player: { userId: "user", standing: "ACTIVE" } },
          },
        },
      ],
    });
  });
});
it("accepts jump and distinct carried Items while rejecting duplicate Items and occupied slots", () => {
  const base = [
    {
      resourceType: "definitions",
      sourceId: "creature",
      payload: { kind: "creature" },
    },
    ...["pack", "torch"].map((id) => ({
      resourceType: "definitions",
      sourceId: id,
      payload: { kind: "item", components: {} },
    })),
  ];
  const check = (equipment: unknown[]) =>
    worldCodexSnapshotIssue([
      ...base,
      {
        resourceType: "world-character-templates",
        sourceId: "npc",
        payload: {
          ...character,
          id: "npc",
          revision: 1,
          movement: { jump: 5 },
          equipment,
        },
      },
    ]);
  expect(
    check([
      { slot: "carried", itemDefinitionId: "pack" },
      { slot: "carried", itemDefinitionId: "torch" },
    ]),
  ).toBeUndefined();
  expect(
    check([
      { slot: "carried", itemDefinitionId: "pack" },
      { slot: "carried", itemDefinitionId: "pack" },
    ]),
  ).toContain("only once");
  expect(
    check([
      { slot: "hand", itemDefinitionId: "pack" },
      { slot: "hand", itemDefinitionId: "torch" },
    ]),
  ).toContain("each equipment slot");
});
it("preserves independent modifier durations and rejects unknown numeric paths", () => {
  const source = {
    resourceType: "definitions",
    sourceId: "creature",
    payload: {
      kind: "creature",
      components: {
        attributes: { "aow:attribute-strength": 50 },
        skills: { tracking: 45 },
      },
    },
  };
  const check = (modifiers: unknown[]) =>
    worldCodexSnapshotIssue([
      source,
      {
        resourceType: "world-effects",
        sourceId: "effect",
        payload: { ...effect, id: "effect", revision: 1, modifiers },
      },
    ]);
  const modifiers = [
    {
      ...effect.modifiers[0],
      propertyPath: "attributes.aow:attribute-strength.modifier",
      duration: { kind: "timed", amount: 2, unit: "rounds" },
    },
    {
      ...effect.modifiers[0],
      id: "skill",
      propertyPath: "skills.tracking.value",
      duration: { kind: "permanent" },
    },
  ];
  expect(check(modifiers)).toBeUndefined();
  expect(
    check([
      {
        ...modifiers[0],
        duration: { kind: "timed", amount: 0, unit: "rounds" },
      },
    ]),
  ).toContain("duration");
  expect(
    check([{ ...modifiers[0], propertyPath: "attributes.unknown.value" }]),
  ).toContain("available numeric");
  expect(check([{ ...modifiers[0], propertyPath: "name" }])).toContain(
    "available numeric",
  );
  expect(
    check([
      { ...modifiers[0], propertyPath: "health.current", duration: undefined },
    ]),
  ).toBeDefined(); // JSON input must omit undefined, as HTTP JSON does.
  expect(
    check([{ ...effect.modifiers[0], propertyPath: "health.current" }]),
  ).toBeUndefined();
});
it("retains canonical inherited Character artwork on updates without allowing metadata replacement", async () => {
  const priorImage = {
    assetId: "source-world-art",
    altText: "Original",
    width: 100,
    height: 200,
    mimeType: "image/png",
  };
  const existing = {
    ...character,
    id: "npc",
    revision: 1,
    images: { portrait: priorImage },
  };
  const draft = {
    id: "fork-draft",
    worldDefinitionId: "fork",
    storageRevision: 1,
    revisionName: "Fork",
    content: {},
    records: [
      {
        resourceType: "definitions",
        sourceId: "creature",
        payload: { kind: "creature" },
      },
      {
        resourceType: "world-character-templates",
        sourceId: "npc",
        payload: existing,
      },
    ],
  };
  const authoring = {
    getActiveDraft: jest.fn().mockResolvedValue(draft),
    save: jest.fn(
      async (_id: string, dto: { records: typeof draft.records }) => ({
        ...draft,
        records: dto.records,
        storageRevision: 2,
      }),
    ),
  };
  const media = { findFirst: jest.fn() };
  const service = new WorldCodexService(
    authoring as never,
    { mediaAsset: media } as never,
  );
  const result = await service.upsert(
    "fork",
    "gm",
    "characters",
    { expectedDraftId: "fork-draft", expectedStorageRevision: 1 },
    {
      ...existing,
      images: {
        portrait: {
          ...priorImage,
          width: 999,
          altText: "Updated",
          uri: "https://untrusted.invalid",
        },
      },
    },
    "npc",
  );
  expect(
    (result.items[0] as unknown as typeof existing).images.portrait,
  ).toEqual({ ...priorImage, altText: "Updated" });
  expect(media.findFirst).not.toHaveBeenCalled();
  expect(authoring.save).toHaveBeenCalledWith(
    "fork",
    expect.anything(),
    "gm",
    false,
    true,
  );
});
