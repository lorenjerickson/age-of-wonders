import { ActionDefinition, FeatDefinition, TraitDefinition } from "@aow/domain";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const action = {
  kind: "action",
  identity: { id: "embedded-action" },
  components: { activation: "invalid", outcomes: [] },
  privateNotes: { secret: "retained" },
};
const trait = { kind: "trait", components: { actions: [action] } };
const feat = { kind: "feat", components: { traits: [trait] } };
const record = (payload: unknown) => ({
  resourceType: "definitions",
  sourceId: "parent",
  payload,
});

describe("Owned definition validity and compatibility boundaries", () => {
  it("reports embedded Action issues through Trait and Feat without changing raw payloads", () => {
    for (const [Type, payload] of [
      [TraitDefinition, trait],
      [FeatDefinition, feat],
    ] as const) {
      const entity = Type.deserializePayload(payload);
      try {
        expect(
          entity.state.metadata.validity.issues.some((issue) =>
            issue.code.includes("action-components-invalid"),
          ),
        ).toBe(true);
        expect(entity.serializePayload()).toEqual(payload);
        expect(
          canonicalWorldRecordIssue("definitions", "parent", payload),
        ).toBeUndefined();
        expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      } finally {
        entity.dispose();
      }
    }
  });

  it("propagates nested Condition reference issues without introducing a new legacy publication gate", () => {
    const payload = {
      kind: "feat",
      components: {
        traits: [
          {
            kind: "trait",
            components: {
              actions: [
                {
                  kind: "action",
                  components: {
                    activation: "action",
                    outcomes: [],
                    grantedConditions: [{ conditionId: "missing" }],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const entity = FeatDefinition.deserializePayload(payload, { records: [] });
    try {
      expect(
        entity.state.metadata.validity.issues.some((issue) =>
          issue.code.includes("action-codex-granted-conditions"),
        ),
      ).toBe(true);
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(
        worldCodexSnapshotIssue([
          record({
            ...payload,
            components: {
              ...payload.components,
              grantedConditions: [{ conditionId: "missing" }],
            },
          }),
        ]),
      ).toBe("A granted Condition is duplicated or unavailable in this World.");
    } finally {
      entity.dispose();
    }
  });

  it("disposes owned validation instances on each API validation", () => {
    const disposeTrait = jest.spyOn(TraitDefinition.prototype, "dispose");
    const disposeAction = jest.spyOn(ActionDefinition.prototype, "dispose");
    try {
      expect(worldCodexSnapshotIssue([record(feat)])).toBeUndefined();
      expect(disposeTrait).toHaveBeenCalledTimes(1);
      expect(disposeAction).toHaveBeenCalledTimes(1);
    } finally {
      disposeTrait.mockRestore();
      disposeAction.mockRestore();
    }
  });
});
