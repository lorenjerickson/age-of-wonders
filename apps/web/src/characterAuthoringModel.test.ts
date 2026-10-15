import { describe, expect, it } from "vitest";
import type { WorldDraftRecord } from "./api";
import {
  characterAuthorBase,
  characterAuthorKind,
  characterAuthorName,
  characterAuthorRecord,
  newCharacterAuthor,
} from "./characterAuthoringModel";
const record: WorldDraftRecord = {
  resourceType: "definitions",
  sourceId: "source",
  sourceRevision: 7,
  payload: {
    kind: "background",
    identity: { id: "source", name: "Wanderer", private: { keep: true } },
    components: {
      characteristics: { Ideals: ["Help travelers"] },
      private: { keep: true },
    },
    extensions: { private: { keep: true } },
    conformance: { conceptId: "concept", modelSchemaReleaseIds: ["release"] },
  },
};
describe("Character author owner boundaries", () => {
  it("resolves a unique owner without normalizing identity, components, metadata, or extensions", () => {
    const before = structuredClone(record);
    expect(characterAuthorRecord([record], "background", "source")).toBe(
      record,
    );
    expect(record).toEqual(before);
  });
  it("rejects missing, duplicate and wrong-kind owners", () => {
    expect(() => characterAuthorRecord([], "background", "source")).toThrow(
      "unavailable or ambiguous",
    );
    expect(() =>
      characterAuthorRecord([record, record], "background", "source"),
    ).toThrow("unavailable or ambiguous");
    expect(() =>
      characterAuthorRecord([record], "profession", "source"),
    ).toThrow("unavailable or ambiguous");
    expect(() =>
      characterAuthorRecord(
        [{ ...record, resourceType: "items" }],
        "background",
        "source",
      ),
    ).toThrow("unavailable or ambiguous");
  });
  it("blocks malformed owner roots rather than replacing them", () => {
    for (const field of ["identity", "components", "conformance"]) {
      for (const invalid of [null, "private", [], 42]) {
        const payload = {
          ...(record.payload as Record<string, unknown>),
          [field]: invalid,
        };
        expect(() =>
          characterAuthorRecord(
            [{ ...record, payload: payload as WorldDraftRecord["payload"] }],
            "background",
            "source",
          ),
        ).toThrow("unsupported data");
      }
    }
  });
  it("masks known identifiers and UUIDs in visible names", () => {
    expect(characterAuthorName(record, new Set(["source"]))).toBe("Wanderer");
    for (const name of [
      "source",
      "A source nearby",
      "9369cbea-e6ce-458a-bb21-c3c8b6997c23",
      "",
      42,
    ])
      expect(
        characterAuthorName(
          { ...record, payload: { identity: { name } } },
          new Set(["source"]),
        ),
      ).toBe("Unnamed option");
  });
  it("scopes routes and defaults to authorized Profession and Background owners", () => {
    expect(characterAuthorKind("professions")).toBe("profession");
    expect(characterAuthorKind("backgrounds")).toBe("background");
    for (const deferred of ["feats", "heritages", "disciplines"])
      expect(characterAuthorKind(deferred)).toBeUndefined();
    expect(characterAuthorBase("world/one", "background")).toBe(
      "/worlds/world%2Fone/characters/backgrounds",
    );
    const background = newCharacterAuthor("background", "new-background");
    expect(background).toMatchObject({
      kind: "background",
      identity: { id: "new-background", name: "" },
      components: {},
    });
    expect(background).not.toHaveProperty("conformance");
    expect(newCharacterAuthor("profession", "new-profession")).toMatchObject({
      components: {
        expertiseOrder: [],
        expertiseLevels: [],
        acquisition: [],
        actions: [],
      },
    });
  });
});
