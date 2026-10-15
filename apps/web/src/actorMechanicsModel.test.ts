import { MonsterDefinition, CharacterDefinition } from "@aow/domain";
import { describe, it, expect } from "vitest";
import {
  actorRuleChildren,
  newActorCatalogDefinition,
  newActorRule,
} from "./actorMechanicsModel";
import { mechanicsObject } from "./itemMechanicsModel";
describe("actor catalog authoring contracts", () => {
  it("keeps catalog Character and Monster owners distinct from World NPCs", () => {
    const attributes = [{ key: "custom:focus" }];
    const monster = newActorCatalogDefinition(
      "monster",
      "monster-id",
      attributes,
    );
    const character = newActorCatalogDefinition(
      "character-template",
      "character-id",
      attributes,
    );
    expect(monster.kind).toBe("monster");
    expect(character.kind).toBe("character-template");
    expect(mechanicsObject(monster.components).attributes).toEqual({
      "custom:focus": 50,
    });
    expect(mechanicsObject(character.components)).toEqual({
      attributeDefaults: { "custom:focus": 50 },
    });
    expect(mechanicsObject(monster.components).actions).toEqual([]);
  });
  it("creates fresh independent owner state", () => {
    const a = newActorCatalogDefinition("monster", "a", []),
      b = newActorCatalogDefinition("monster", "b", []);
    mechanicsObject(a.components).actions = ["changed"];
    expect(mechanicsObject(b.components).actions).toEqual([]);
  });
  it("routes nested constraints and Discipline sources to focused editors", () => {
    expect(actorRuleChildren("speed")).toEqual([
      {
        key: "restrictions",
        label: "Restrictions",
        type: "predicate",
        list: true,
      },
    ]);
    expect(actorRuleChildren("damage-adjustment").map((c) => c.key)).toEqual([
      "predicate",
      "bypassPredicate",
    ]);
    expect(actorRuleChildren("discipline-state")[0]).toMatchObject({
      key: "sources",
      type: "discipline-source",
      list: true,
    });
  });
  it("creates valid built-in numeric expressions without opaque source references", () => {
    const value = newActorRule("discipline-source");
    expect(value.targetingBonus).toEqual({ kind: "constant", value: 0 });
    expect(value.sourceDefinitionId).toBe("");
    expect(value.id).toEqual(expect.any(String));
  });
});

it("new catalog authoring payloads satisfy their owning domain classes", () => {
  for (const kind of ["monster", "character-template"] as const) {
    const payload = newActorCatalogDefinition(kind, "subject", [
      { key: "custom:focus" },
    ]);
    payload.identity = {
      ...mechanicsObject(payload.identity),
      name: "Example",
    };
    const entity =
      kind === "monster"
        ? MonsterDefinition.deserializePayload(payload)
        : CharacterDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.filter((i) =>
          i.code.endsWith("invalid"),
        ),
      ).toEqual([]);
    } finally {
      entity.dispose();
    }
  }
});
