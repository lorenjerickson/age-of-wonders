import type { MechanicsObject } from "./itemMechanicsModel";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfessionAuthoringFields } from "./ProfessionAuthoringFields";
import {
  newProfessionRule,
  professionRuleTypes,
} from "./professionAuthoringModel";
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
const props = {
  recordIds: new Set(["private-action", "private-trait"]),
  definitions: [
    { id: "private-action", label: "Forge" },
    { id: "private-trait", label: "Steady hands" },
  ],
  ranks: [{ key: "secret:rank", name: "Apprentice" }],
  onChange: () => {},
  renderCollection: (key: string, label: string) => (
    <a href={`/${key}`}>{label}</a>
  ),
};
describe("Profession authoring fields", () => {
  it("renders every supported dedicated child context", () => {
    for (const type of professionRuleTypes) {
      const html = renderToStaticMarkup(
        <ProfessionAuthoringFields
          {...props}
          type={type}
          value={newProfessionRule(type, props.ranks)}
        />,
      );
      expect(html.length).toBeGreaterThan(0);
      expect(html).not.toContain("secret:rank");
    }
  });
  it("resolves ranks and references by human names without exposing stored identities", () => {
    const html = renderToStaticMarkup(
      <ProfessionAuthoringFields
        {...props}
        type="profession-action"
        value={{
          actionId: "private-action",
          unlocksAt: "secret:rank",
          advancementPointsOnUse: { kind: "constant", value: 2 },
          improvements: [],
        }}
      />,
    );
    expect(html).toContain("Forge");
    expect(html).toContain("Apprentice");
    expect(html).toContain("Qualifying use");
    expect(html).not.toContain("private-action");
    expect(html).not.toContain("secret:rank");
  });
  it("preserves malformed benefit maps and missing rank references visibly", () => {
    const html = renderToStaticMarkup(
      <ProfessionAuthoringFields
        {...props}
        type="profession-benefits"
        value={{
          resourceMaximums: ["private-action"],
          traitIds: ["private-trait"],
        }}
      />,
    );
    expect(html).toContain("Existing resource maximums preserved");
    expect(html).not.toContain("private-trait");
    expect(html).not.toContain("private-action");
    const tier = renderToStaticMarkup(
      <ProfessionAuthoringFields
        {...props}
        type="profession-tier"
        value={{ tier: "unknown-secret", rank: 1, benefits: {} }}
      />,
    );
    expect(tier).toContain("Existing reference preserved");
    expect(tier).not.toContain("unknown-secret");
  });
  it("provides all advancement window shapes and safely masks milestone content", () => {
    const windows: MechanicsObject[] = [
      { kind: "minimum-character-level", level: 4 },
      { kind: "character-levels", levels: [3, 7] },
      {
        kind: "character-level-interval",
        firstLevel: 2,
        everyLevels: 3,
        finalLevel: 14,
      },
      { kind: "milestone", milestone: "private-action" },
      { kind: "custom", predicate: { kind: "always" } },
    ];
    for (const value of windows) {
      const html = renderToStaticMarkup(
        <ProfessionAuthoringFields
          {...props}
          type="profession-window"
          value={value}
        />,
      );
      expect(html).not.toContain("private-action");
    }
  });
});
