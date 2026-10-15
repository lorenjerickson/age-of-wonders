import { CharacterDefinition } from "@aow/domain";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const record = (payload: unknown) => ({
  resourceType: "definitions",
  sourceId: "alert",
  payload,
});
const character = (grantedConditions: unknown) =>
  record({ kind: "character-template", components: { grantedConditions } });
const condition = {
  resourceType: "world-conditions",
  sourceId: "rested",
  payload: { id: "rested", name: "Rested", revision: 1, effects: [] },
};

describe("Character entity adapters", () => {
  it("retains generic checks for optional supplied Model conformance", () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const conceptId = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:background",
    )!.lineage.id;
    const payload = {
      kind: "character-template",
      conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
    };
    const check = (value: unknown) =>
      assertGovernedRecordConformance(
        [record(value)],
        [compiled.releaseId],
        compiled.elements,
      );
    expect(() => check(payload)).not.toThrow();
    expect(() =>
      check({ kind: "character-template", modelValues: {} }),
    ).toThrow("missing Model Schema conformance");
    expect(() =>
      check({
        ...payload,
        conformance: { ...payload.conformance, modelSchemaReleaseIds: [] },
      }),
    ).toThrow("exact Model Schema releases");
    expect(() =>
      check({
        ...payload,
        conformance: { ...payload.conformance, conceptId: "missing" },
      }),
    ).toThrow("unavailable Model concept");
  });
  it("uses entity state and disposes temporary Character instances", () => {
    const dispose = jest.spyOn(CharacterDefinition.prototype, "dispose");
    try {
      expect(
        worldCodexSnapshotIssue([
          character([{ conditionId: "rested" }]),
          condition,
        ]),
      ).toBeUndefined();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
    }
  });

  it("retains sparse legacy capture compatibility and optional Model conformance", () => {
    for (const payload of [
      { kind: "character-template" },
      { kind: "character-template", components: {} },
    ]) {
      expect(
        canonicalWorldRecordIssue("definitions", "alert", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(() =>
        assertGovernedRecordConformance([record(payload)], [], []),
      ).not.toThrow();
    }
  });

  it("preserves unchanged imported Character fields during edits and rejects newly supplied malformed fields", () => {
    const payload = {
      kind: "character-template",
      components: { traits: "legacy" },
    };
    const entity = CharacterDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.some((issue) =>
          issue.code.startsWith("character-definition-components-"),
        ),
      ).toBe(true);
      expect(
        canonicalWorldRecordIssue("definitions", "alert", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBe(
        "Provide a valid Character traits value.",
      );
      expect(
        worldCodexSnapshotIssue([record(payload)], [record(payload)]),
      ).toBeUndefined();
    } finally {
      entity.dispose();
    }
  });

  it("preserves Condition capture membership, list bounds, and duplicate diagnostics", () => {
    expect(worldCodexSnapshotIssue([character("rested")])).toBe(
      "Choose a valid granted Condition list.",
    );
    expect(
      worldCodexSnapshotIssue([
        character(
          Array.from({ length: 201 }, () => ({ conditionId: "rested" })),
        ),
        condition,
      ]),
    ).toBe("Choose a valid granted Condition list.");
    expect(
      worldCodexSnapshotIssue([character([{ conditionId: "missing" }])]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
    expect(
      worldCodexSnapshotIssue([
        character([{ conditionId: "rested" }, { conditionId: "rested" }]),
        condition,
      ]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
  });

  it("checks outer raw Character state when extension fields resemble an entity envelope", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "character-template",
          type: "character-definition",
          schemaVersion: 1,
          data: { kind: "character-template", components: {} },
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });

  it("reports invalid JSON safely", () => {
    const payload: Record<string, unknown> = {
      kind: "character-template",
      components: {},
    };
    payload.self = payload;
    expect(worldCodexSnapshotIssue([record(payload)])).toBe(
      "The Character Definition must be a bounded JSON object.",
    );
  });

  it("preserves generic grants validation for other unmigrated Definition concepts", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "language",
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });
});

it("catalog Character owns Traits while flat World NPC templates retain their separate codec", () => {
  const payload = {
    kind: "character-template",
    components: {
      attributeDefaults: {},
      traits: [
        {
          kind: "trait",
          components: {
            actions: [
              {
                kind: "action",
                components: { activation: "invalid", outcomes: [] },
              },
            ],
          },
        },
      ],
    },
    privateNotes: { secret: true },
  };
  const entity = CharacterDefinition.deserializePayload(payload);
  try {
    expect(
      entity.state.metadata.validity.issues.some((issue) =>
        issue.code.includes("trait-actions-action-components-invalid"),
      ),
    ).toBe(true);
    expect(entity.serializePayload()).toEqual(payload);
    expect(worldCodexSnapshotIssue([record(payload)])).toBe(
      "Provide a valid Action activation value.",
    );
    expect(entity.serialize().type).toBe("character-definition");
    expect(() =>
      CharacterDefinition.deserializePayload({
        id: "npc",
        name: "NPC",
        revision: 1,
      }),
    ).toThrow();
  } finally {
    entity.dispose();
  }
});
