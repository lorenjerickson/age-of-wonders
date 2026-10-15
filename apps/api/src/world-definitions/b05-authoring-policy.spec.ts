import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";
import { ItemDefinition } from "@aow/domain";
const record = (kind: string, components: unknown) => ({
  resourceType: "definitions",
  sourceId: "catalog",
  payload: { kind, components },
});
const malformed: [string, unknown][] = [
  ["action", { outcomes: false }],
  ["trait", { modifiers: false }],
  ["item", { vehicle: { hitPoints: false } }],
  ["item", { actions: [false] }],
  ["item", { traits: [false] }],
  [
    "profession",
    {
      actions: [{ advancementPointsOnUse: { kind: "constant", value: false } }],
    },
  ],
  ["background", { characteristics: { ideal: [false] } }],
  ["feat", { choices: [{ minimum: false }] }],
  ["heritage", { prerequisites: [{ kind: "not", predicate: false }] }],
  ["discipline", { inputs: false }],
];
describe("B05 authoritative authoring policy", () => {
  it.each(malformed)(
    "blocks supplied malformed %s at save and publication but preserves unchanged inherited drafts",
    (kind, components) => {
      const row = record(kind, components);
      expect(worldCodexSnapshotIssue([row], [])).toBeDefined();
      expect(worldCodexSnapshotIssue([row], [row])).toBeUndefined();
      expect(
        worldCodexSnapshotIssue([row], [row], { publication: true }),
      ).toBeDefined();
      expect(
        worldCodexSnapshotIssue([row], undefined, { publication: true }),
      ).toBeDefined();
      expect(
        validateWorldDefinitionDraft({ definitionIds: ["catalog"] }, [
          row,
        ]).issues.some((issue) => issue.code === "world-codex-invalid"),
      ).toBe(true);
    },
  );
  it.each([
    "action",
    "trait",
    "item",
    "profession",
    "background",
    "feat",
    "heritage",
    "discipline",
  ])("allows sparse %s and arbitrary open extensions", (kind) => {
    const row = record(kind, {
      extensions: { "home:private": { value: false } },
    });
    expect(worldCodexSnapshotIssue([row], [])).toBeUndefined();
    expect(
      worldCodexSnapshotIssue([row], undefined, { publication: true }),
    ).toBeUndefined();
  });
  it("keeps unresolved Vehicle components editable, requires a captured declared target for publication, and permits any Definition kind", () => {
    const row = record("item", { vehicle: { components: ["target"] } });
    const target = {
      resourceType: "definitions",
      sourceId: "target",
      payload: { kind: "action" },
    };
    expect(worldCodexSnapshotIssue([row], [])).toBeUndefined();
    expect(
      worldCodexSnapshotIssue([row], undefined, { publication: true }),
    ).toContain("Vehicle component");
    expect(
      worldCodexSnapshotIssue([row, target], undefined, {
        publication: true,
        definitionIds: ["catalog"],
      }),
    ).toContain("Vehicle component");
    expect(
      worldCodexSnapshotIssue([row, target], undefined, {
        publication: true,
        definitionIds: ["catalog", "target"],
      }),
    ).toBeUndefined();
  });
  it("blocks clearing final slots when equipment extension data would be lost", () => {
    const input = {
      name: "Item",
      itemFamilyKey: "home:tool",
      category: "tool",
      quality: "standard" as const,
      compatibleEquipmentSlotSets: [["home:hand"]],
    };
    const conformance = {
      conceptId: "concept" as never,
      modelSchemaReleaseIds: ["release"] as never,
    };
    const base = ItemDefinition.authorPayload("catalog", input, conformance);
    const previous = {
      ...base,
      components: {
        ...base.components,
        equippable: {
          compatibleSlotSets: [["home:hand"]],
          "home:private": { retained: true },
        },
      },
    };
    const before = structuredClone(previous);
    expect(() =>
      ItemDefinition.authorPayload(
        "catalog",
        { ...input, compatibleEquipmentSlotSets: [] },
        conformance,
        previous,
      ),
    ).toThrow("equipment settings");
    expect(previous).toEqual(before);
    expect(
      ItemDefinition.authorPayload("catalog", input, conformance, previous)
        .components.equippable,
    ).toEqual(before.components.equippable);
  });
});

it("does not treat another Definition kind as an inherited mechanics baseline", () => {
  const components = { outcomes: false };
  expect(
    worldCodexSnapshotIssue(
      [record("action", components)],
      [record("custom", components)],
    ),
  ).toBeDefined();
});
