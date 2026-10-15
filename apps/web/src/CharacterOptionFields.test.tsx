import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CharacterOptionFields } from "./CharacterOptionFields";
import {
  characterOptionFieldChildren,
  newCharacterOptionField,
} from "./characterOptionFieldsModel";
vi.mock("@aow/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aow/ui")>()),
  Field: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
}));
const secret = "9369cbea-e6ce-458a-bb21-c3c8b6997c23";
const props = {
  recordIds: new Set([secret, "private-skill", "private-feat", "private-item"]),
  definitions: [
    { id: "private-skill", label: "Survival" },
    { id: "private-feat", label: "Wanderer" },
  ],
  itemDefinitions: [{ id: "private-item", label: "Bedroll" }],
  attributeDefinitions: [{ id: "core:strength", label: "Strength" }],
  onChange: vi.fn(),
  renderCollection: (key: string, label: string) => (
    <span key={key}>Manage {label}</span>
  ),
};
describe("Background structured fields", () => {
  it("offers named attributes, skill, equipment and feat references with all owned children", () => {
    const value = {
      attributeOptions: ["core:strength"],
      skillProficiencyIds: ["private-skill"],
      startingEquipment: ["private-item"],
      featId: "private-feat",
      featureIds: [secret],
      toolProficiencies: ["Navigator tools"],
      languageChoices: 2,
    };
    const before = structuredClone(value);
    const html = renderToStaticMarkup(
      <CharacterOptionFields {...props} type="background" value={value} />,
    );
    for (const label of [
      "Strength",
      "Survival",
      "Bedroll",
      "Wanderer",
      "Navigator tools",
      "Language choices",
      "Manage Modifier grants",
      "Manage Choices",
      "Manage Characteristics",
    ])
      expect(html).toContain(label);
    for (const id of [
      secret,
      "private-skill",
      "private-feat",
      "private-item",
      "core:strength",
    ])
      expect(html).not.toContain(id);
    expect(value).toEqual(before);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it("restricts skill and feat choices to their supplied named catalogs", () => {
    const html = renderToStaticMarkup(
      <CharacterOptionFields
        {...props}
        type="background"
        value={{
          skillProficiencyIds: ["private-skill"],
          featId: "private-feat",
        }}
        skillDefinitions={[{ id: "private-skill", label: "Only skill" }]}
        featDefinitions={[{ id: "private-feat", label: "Only feat" }]}
      />,
    );
    expect(html).toContain("Only skill");
    expect(html).toContain("Only feat");
    expect(html).not.toContain("Survival");
    expect(html).not.toContain("Wanderer");
  });
  it("preserves malformed lists, numeric fields, and private text without raw JSON editors", () => {
    const value = {
      attributeOptions: { private: "payload" },
      languageChoices: { private: "number" },
      toolProficiencies: [secret, { private: "tool" }],
      skillProficiencyIds: [{ private: "reference" }],
      privateExtension: { private: "extension" },
    };
    const html = renderToStaticMarkup(
      <CharacterOptionFields {...props} type="background" value={value} />,
    );
    expect(html).toContain("Existing attribute options preserved");
    expect(html).toContain("Existing language choices preserved");
    expect(html).toContain("Existing tool proficiencies 1 preserved");
    expect(html).not.toContain(secret);
    expect(html).not.toContain("payload");
    expect(html).not.toContain("privateExtension");
    expect(html).not.toContain("textarea");
    expect(html).toContain("min-h-11");
  });
  it("authors characteristic categories and suggestions while masking private entries", () => {
    const html = renderToStaticMarkup(
      <CharacterOptionFields
        {...props}
        type="background-characteristics"
        value={{
          Ideals: ["Protect travelers", secret],
          [secret]: [secret],
          Malformed: { private: "payload" },
        }}
      />,
    );
    expect(html).toContain("Ideals");
    expect(html).toContain("Protect travelers");
    expect(html).toContain("New category name");
    expect(html).toContain("Add category");
    expect(html).toContain("Remove category");
    expect(html).toContain("Existing category 3 suggestions preserved");
    expect(html).not.toContain(secret);
    expect(html).not.toContain("payload");
  });
  it("leaves absent optional fields absent and only exposes approved Background child types", () => {
    const value = newCharacterOptionField("background");
    const html = renderToStaticMarkup(
      <CharacterOptionFields {...props} type="background" value={value} />,
    );
    expect(html).toContain("Add language choices");
    expect(html).toContain("Add feat");
    expect(value).toEqual({});
    expect(characterOptionFieldChildren.background).toEqual({
      modifierGrants: "modifier-grant",
      choices: "choice",
      characteristics: "background-characteristics",
    });
  });
});
