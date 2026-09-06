import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function commonType(name: string) {
  return readFileSync(
    resolve(process.cwd(), "../../packages/common/src/types", name),
    "utf8",
  );
}

describe("open domain-model contracts", () => {
  it("does not restore a closed Attribute collection or Equipment Slot union", () => {
    const primitives = commonType("primitives.ts");
    const items = commonType("items.ts");

    expect(primitives).toContain("export const CORE_ATTRIBUTE_KEYS");
    expect(primitives).not.toContain("STANDARD_ATTRIBUTES");
    expect(primitives).not.toContain("readonly standard:");
    expect(items).toContain("export const CORE_EQUIPMENT_SLOT_KEYS");
    expect(items).not.toContain("EQUIPMENT_SLOTS =");
  });

  it("uses Professions without retaining Class or Subclass domain contracts", () => {
    const character = commonType("character.ts");
    const catalog = commonType("catalog.ts");
    const dice = commonType("dice.ts");

    for (const legacyName of [
      "ClassLevelState",
      "ClassDefinition",
      "SubclassDefinition",
      "readonly classes:",
    ]) {
      expect(character).not.toContain(legacyName);
      expect(catalog).not.toContain(legacyName);
    }
    expect(character).toContain("readonly professions:");
    expect(dice).toContain("readonly professionId?: DefinitionId");
    expect(dice).not.toContain("readonly classId?: DefinitionId");
  });
});
