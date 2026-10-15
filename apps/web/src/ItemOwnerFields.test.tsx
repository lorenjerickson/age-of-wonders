import type { JsonValue } from "@aow/common";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemOwnerFields } from "./ItemOwnerFields";
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
  recordIds: new Set(["secret-item"]),
  definitions: [],
  itemDefinitions: [{ id: "secret-item", label: "Iron ingot" }],
  onChange: () => {},
  renderCollection: (key: string, label: string) => (
    <span key={key}>Manage {label}</span>
  ),
};
describe("Item owner fields", () => {
  it("shows named crafting items and scalar quantities without internal identifiers", () => {
    const html = renderToStaticMarkup(
      <ItemOwnerFields
        {...props}
        type="ingredient"
        value={{
          itemId: "secret-item",
          quantity: { kind: "constant", value: 2 },
          consumed: true,
        }}
      />,
    );
    expect(html).toContain("Iron ingot");
    expect(html).not.toContain("secret-item");
    expect(html).toContain("Quantity");
    expect(html).toContain("Consumed");
    expect(html).toContain("Add ingredient tag");
  });
  it("exposes all crafting collections while leaving omitted check absent", () => {
    const html = renderToStaticMarkup(
      <ItemOwnerFields
        {...props}
        type="crafting"
        value={{ time: { kind: "level" }, produces: [] }}
      />,
    );
    for (const label of [
      "Cost",
      "Ingredients",
      "Tool proficiencies",
      "Products",
    ])
      expect(html).toContain(`Manage ${label}`);
    expect(html).toContain("Add crafting check");
  });
  it("renders dice and numeric recharge amounts and preserves unsupported recharge", () => {
    for (const amount of [
      { terms: [{ kind: "dice", count: 1, size: 6 }] },
      { kind: "constant", value: 3 },
    ] as JsonValue[]) {
      const html = renderToStaticMarkup(
        <ItemOwnerFields
          {...props}
          type="capacity"
          value={{
            maximum: { kind: "constant", value: 5 },
            recharge: { timing: "dawn", amount },
          }}
        />,
      );
      expect(html).toContain("Recharge timing");
      expect(html).toContain("Recharge amount");
    }
    const html = renderToStaticMarkup(
      <ItemOwnerFields
        {...props}
        type="capacity"
        value={{
          maximum: { kind: "constant", value: 5 },
          recharge: "private malformed data",
        }}
      />,
    );
    expect(html).toContain("Existing recharge preserved");
    expect(html).not.toContain("private malformed data");
  });
  it("keeps both optional attunement settings and required toggle discoverable", () => {
    const html = renderToStaticMarkup(
      <ItemOwnerFields
        {...props}
        type="attunement"
        value={{ required: false }}
      />,
    );
    expect(html).toContain("Requires attunement");
    expect(html).toContain("Counts against attunement limit");
    expect(html).toContain("Manage Prerequisites");
  });
});
