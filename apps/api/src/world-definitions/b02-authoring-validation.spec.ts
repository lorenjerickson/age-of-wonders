import { worldCodexSnapshotIssue } from "./world-codex-validation";
const record = (kind: string, components: unknown) => ({
  resourceType: "definitions",
  sourceId: "catalog",
  payload: { kind, components },
});
describe("B02 owned mechanics at the World draft boundary", () => {
  it("rejects invalid supplied Item grammar while permitting incomplete and custom data", () => {
    expect(
      worldCodexSnapshotIssue([
        record("item", {
          capacity: { maximum: { kind: "constant", value: "bad" } },
        }),
      ]),
    ).toBeDefined();
    expect(
      worldCodexSnapshotIssue([
        record("item", {
          capacity: { maximum: { kind: "constant" } },
          prerequisites: [
            {
              kind: "custom",
              handler: "home:predicate",
              payload: { secret: 1 },
            },
          ],
        }),
      ]),
    ).toBeUndefined();
  });
  it("dispatches catalog Monster independently of governed Creature records", () => {
    expect(
      worldCodexSnapshotIssue([record("monster", { bonusActions: [null] })]),
    ).toBeDefined();
    expect(
      worldCodexSnapshotIssue([record("monster", { actions: [], traits: [] })]),
    ).toBeUndefined();
  });
  it("uses catalog Character choice and attribute roll validity", () => {
    expect(
      worldCodexSnapshotIssue([
        record("character-template", {
          choices: [{ id: "c", prompt: "Pick", minimum: "one", maximum: 1 }],
        }),
      ]),
    ).toBeDefined();
    expect(
      worldCodexSnapshotIssue([
        record("character-template", {
          attributeGeneration: {
            kind: "roll",
            count: 1,
            expression: { terms: [{ kind: "dice", count: false, size: 6 }] },
          },
        }),
      ]),
    ).toBeDefined();
  });
});

it("preserves unchanged inherited mechanics and rejects changed malformed owner fields", () => {
  for (const [kind, components] of [
    ["item", { capacity: { maximum: { kind: "constant", value: "legacy" } } }],
    ["monster", { skills: "legacy" }],
    ["character-template", { attributeDefaults: {}, traits: "legacy" }],
  ] as const) {
    const previous = record(kind, components);
    expect(worldCodexSnapshotIssue([previous], [previous])).toBeUndefined();
    expect(worldCodexSnapshotIssue([previous], [])).toBeDefined();
  }
  expect(worldCodexSnapshotIssue([record("monster", [])])).toBeDefined();
  expect(
    worldCodexSnapshotIssue([record("character-template", [])]),
  ).toBeDefined();
});
