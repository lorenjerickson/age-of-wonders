import { ItemDefinition, TraitDefinition, ActionDefinition } from "@aow/domain";
import {
  canonicalWorldRecordIssue,
  worldItemPayload,
} from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";

const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
const concept = compiled.elements.find(
  (element) => element.lineage.semanticRole === "aow:item",
)!;
const releaseIds = ["aow:model-schema-release:core:1"];
function item() {
  return worldItemPayload(
    "item",
    {
      name: "Brass key",
      itemFamilyKey: "aow:item-family-tool",
      category: "tool",
      quality: "standard",
      compatibleEquipmentSlotSets: [],
    },
    {
      conceptId: concept.lineage.id,
      modelSchemaReleaseIds: releaseIds as never,
    },
  );
}
const record = <T extends object>(payload: T) => ({
  resourceType: "definitions",
  sourceId: "item",
  payload,
});

describe("Item entity migration compatibility", () => {
  it("preserves canonical diagnostics and permits optional artwork", () => {
    const payload = item();
    expect(
      canonicalWorldRecordIssue("definitions", "item", payload),
    ).toBeUndefined();
    expect(canonicalWorldRecordIssue("definitions", "other", payload)).toBe(
      "The Item Definition identity or Model conformance is invalid.",
    );
    expect(
      canonicalWorldRecordIssue("definitions", "item", {
        ...payload,
        image: {
          assetId: "asset",
          altText: "Key",
          width: 50,
          height: 100,
          mimeType: "image/png",
        },
      }),
    ).toBe("The Item Definition components, family, or image are invalid.");
  });

  it("allows unchanged legacy weight edits but rejects publication and changed invalid weight", () => {
    const payload = item();
    const prior = record({
      ...payload,
      components: {
        ...payload.components,
        weight: { value: -1, unit: "pound" },
      },
    });
    const renamed = record({
      ...prior.payload,
      identity: { ...payload.identity, name: "Renamed" },
    });
    expect(worldCodexSnapshotIssue([renamed], [prior])).toBeUndefined();
    expect(worldCodexSnapshotIssue([renamed])).toBe(
      "Choose a nonnegative Item weight.",
    );
    const changed = record({
      ...payload,
      components: {
        ...payload.components,
        weight: { value: -2, unit: "pound" },
      },
    });
    expect(worldCodexSnapshotIssue([changed], [prior])).toBe(
      "Choose a nonnegative Item weight.",
    );
  });

  it("never grandfathers missing granted Conditions", () => {
    const payload = item();
    const prior = record({
      ...payload,
      components: {
        ...payload.components,
        grantedConditions: [{ conditionId: "missing" }],
      },
    });
    expect(worldCodexSnapshotIssue([prior], [prior])).toBe(
      "A granted Condition is duplicated or unavailable in this World.",
    );
  });

  it("keeps effective Model family validation in the publication adapter", () => {
    const payload = item();
    expect(() =>
      assertGovernedRecordConformance(
        [record(payload)],
        releaseIds,
        compiled.elements,
      ),
    ).not.toThrow();
    const invalid = {
      ...payload,
      modelValues: {
        ...payload.modelValues,
        "aow:item-family": "world:unavailable",
      },
    };
    expect(() =>
      assertGovernedRecordConformance(
        [record(invalid)],
        releaseIds,
        compiled.elements,
      ),
    ).toThrow("An Item Definition must select an available Item family.");
  });
});

describe("Item owned Trait validity", () => {
  const withTraits = () => {
    const base = item();
    return {
      ...base,
      components: {
        ...base.components,
        traits: [
          {
            kind: "trait",
            privateNotes: { secret: true },
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
    };
  };
  it("exposes nested diagnostics without broadening canonical, Codex or Model compatibility gates", () => {
    const payload = withTraits();
    const entity = ItemDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.some(
          (issue) =>
            issue.code ===
            "item-traits-trait-actions-action-components-invalid",
        ),
      ).toBe(true);
      expect(entity.serializePayload()).toEqual(payload);
      expect(
        canonicalWorldRecordIssue("definitions", "item", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(() =>
        assertGovernedRecordConformance(
          [record(payload)],
          releaseIds,
          compiled.elements,
        ),
      ).not.toThrow();
    } finally {
      entity.dispose();
    }
  });
  it("disposes Item and temporary owned children in canonical and Codex adapters", () => {
    const spies = [ItemDefinition, TraitDefinition, ActionDefinition].map(
      (Definition) => jest.spyOn(Definition.prototype, "dispose"),
    );
    try {
      const payload = withTraits();
      canonicalWorldRecordIssue("definitions", "item", payload);
      worldCodexSnapshotIssue([record(payload)]);
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);
      canonicalWorldRecordIssue("definitions", "other", payload);
      worldCodexSnapshotIssue([
        record({
          ...payload,
          components: { ...payload.components, grantedConditions: "bad" },
        }),
      ]);
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(4);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("Item direct and Vehicle Action validity", () => {
  const invalidAction = {
    kind: "action",
    components: { activation: "invalid", outcomes: [] },
    privateNotes: { secret: true },
  };
  const withActions = (components: Record<string, unknown>) => {
    const base = item();
    return { ...base, components: { ...base.components, ...components } };
  };
  it.each([
    [{ actions: [invalidAction] }, "item-actions-action-components-invalid"],
    [
      { vehicle: { actions: [invalidAction] } },
      "item-vehicle-actions-action-components-invalid",
    ],
    [{ actions: "legacy" }, "item-actions-invalid"],
    [{ vehicle: "legacy" }, "item-vehicle-actions-invalid"],
  ] as const)(
    "preserves raw content and existing compatibility gates for %j",
    (components, code) => {
      const payload = withActions(components);
      const entity = ItemDefinition.deserializePayload(payload);
      try {
        expect(
          entity.state.metadata.validity.issues.some(
            (issue) => issue.code === code,
          ),
        ).toBe(true);
        expect(entity.serializePayload()).toEqual(payload);
        expect(
          canonicalWorldRecordIssue("definitions", "item", payload),
        ).toBeUndefined();
        expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
        expect(() =>
          assertGovernedRecordConformance(
            [record(payload)],
            releaseIds,
            compiled.elements,
          ),
        ).not.toThrow();
      } finally {
        entity.dispose();
      }
    },
  );
  it("disposes both Action routes and keeps nested Condition diagnostics separate from root gates", () => {
    const action = {
      kind: "action",
      components: {
        activation: "action",
        outcomes: [],
        grantedConditions: [{ conditionId: "missing" }],
      },
    };
    const payload = withActions({
      actions: [action],
      vehicle: { actions: [action] },
    });
    const entity = ItemDefinition.deserializePayload(payload, { records: [] });
    try {
      expect(
        entity.state.metadata.validity.issues.map((issue) => issue.code),
      ).toEqual(
        expect.arrayContaining([
          "item-actions-action-codex-granted-conditions",
          "item-vehicle-actions-action-codex-granted-conditions",
        ]),
      );
    } finally {
      entity.dispose();
    }
    const dispose = jest.spyOn(ActionDefinition.prototype, "dispose");
    try {
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(
        worldCodexSnapshotIssue([
          record(
            withActions({
              ...payload.components,
              grantedConditions: [{ conditionId: "missing" }],
            }),
          ),
        ]),
      ).toBe("A granted Condition is duplicated or unavailable in this World.");
      expect(dispose).toHaveBeenCalledTimes(4);
    } finally {
      dispose.mockRestore();
    }
  });
});

describe("Vehicle field validity compatibility", () => {
  it.each([
    [{}, "item-vehicle-unresolved"],
    [
      {
        vehicleType: 7,
        size: "custom",
        armorClass: 1,
        hitPoints: 2,
        speeds: {},
      },
      "item-vehicle-invalid",
    ],
    [
      {
        vehicleType: "custom",
        size: "custom",
        armorClass: 1,
        hitPoints: 2,
        speeds: { fly: { value: 2, unit: "invalid" } },
      },
      "item-vehicle-invalid",
    ],
  ])(
    "reports Vehicle diagnostics without rewriting captures or adding publication gates",
    (vehicle, prefix) => {
      const base = item();
      const payload = { ...base, components: { ...base.components, vehicle } };
      const entity = ItemDefinition.deserializePayload(payload);
      try {
        expect(
          entity.state.metadata.validity.issues.some((issue) =>
            issue.code.startsWith(prefix as string),
          ),
        ).toBe(true);
        expect(entity.serializePayload()).toEqual(payload);
        expect(
          canonicalWorldRecordIssue("definitions", "item", payload),
        ).toBeUndefined();
        expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
        expect(() =>
          assertGovernedRecordConformance(
            [record(payload)],
            releaseIds,
            compiled.elements,
          ),
        ).not.toThrow();
      } finally {
        entity.dispose();
      }
    },
  );
});
