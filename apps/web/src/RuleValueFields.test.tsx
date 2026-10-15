import { RuleTargetFields } from "./RuleTargetFields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  D20TestFields,
  DiceExpressionFields,
  DurationFields,
  JsonValueFields,
  ScalarExpressionFields,
} from "./RuleValueFields";
// The workspace UI package and web test renderer resolve different React minors.
// Replace only its hook-owning Field shell; all authored controls remain real.
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
const recordIds = new Set(["secret-definition"]);
const onChange = () => {};
describe("shared rule value controls", () => {
  it("masks IDs in deep JSON keys, values and nested expressions", () => {
    const html = renderToStaticMarkup(
      <JsonValueFields
        recordIds={recordIds}
        onChange={onChange}
        value={{
          "secret-definition": [
            "secret-definition",
            { known: "9369cbea-e6ce-458a-bb21-c3c8b6997c23" },
          ],
        }}
      />,
    );
    expect(html).not.toContain("secret-definition");
    expect(html).not.toContain("9369cbea");
    expect(html).toContain("preserved");
  });
  it("renders recursive numeric expressions and named definition references", () => {
    const html = renderToStaticMarkup(
      <ScalarExpressionFields
        recordIds={recordIds}
        onChange={onChange}
        definitions={[{ id: "secret-definition", label: "Adventurer" }]}
        value={{
          kind: "arithmetic",
          operator: "add",
          operands: [
            { kind: "level", professionId: "secret-definition" },
            {
              kind: "conditional",
              predicate: "actor.ready",
              whenTrue: { kind: "constant", value: 2 },
              whenFalse: { kind: "constant", value: 0 },
            },
          ],
        }}
        numericOnly
      />,
    );
    expect(html).toContain("Adventurer");
    expect(html).not.toContain("secret-definition");
    expect(html).toContain("When true");
    expect(html).not.toContain('value="literal"');
  });
  it("renders dice modifiers and expression counts while preserving malformed collections", () => {
    const html = renderToStaticMarkup(
      <DiceExpressionFields
        recordIds={recordIds}
        onChange={onChange}
        value={{
          terms: [
            {
              kind: "dice",
              count: { kind: "resource", resource: "stamina" },
              size: 8,
              modifiers: [
                { kind: "reroll", values: [1, 2], once: true },
                { kind: "explode", threshold: 8 },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Stamina".toLowerCase());
    expect(html).toContain("Add maximum extra dice");
    const malformed = renderToStaticMarkup(
      <DiceExpressionFields
        recordIds={recordIds}
        onChange={onChange}
        value={{ terms: "opaque" }}
      />,
    );
    expect(malformed).toContain("Existing terms preserved");
  });
  it("exposes opposed tests and all duration variants without materializing optional fields", () => {
    const html = renderToStaticMarkup(
      <D20TestFields
        recordIds={recordIds}
        onChange={onChange}
        value={{
          kind: "attack-roll",
          opposedBy: { kind: "saving-throw" },
          criticalSuccessRange: [19, 20],
        }}
      />,
    );
    expect(html).toContain("Critical success range minimum");
    expect(html).toContain("Add difficulty class");
    const duration = renderToStaticMarkup(
      <DurationFields
        recordIds={recordIds}
        onChange={onChange}
        value={{ kind: "permanent" }}
      />,
    );
    expect(duration).toContain("Add neutralizable");
    expect(duration).toContain("Until event");
  });
});

describe("target shared controls", () => {
  it("keeps omitted wall thickness optional and safely preserves imported prototype names", () => {
    const html = renderToStaticMarkup(
      <RuleTargetFields
        recordIds={recordIds}
        onChange={onChange}
        renderCollection={() => null}
        value={{
          kind: "area",
          area: {
            kind: "wall",
            length: { value: 5, unit: "foot" },
            height: { value: 10, unit: "foot" },
          },
        }}
      />,
    );
    expect(html).toContain("Add thickness");
    expect(html).not.toContain("thickness value");
    const unknown = renderToStaticMarkup(
      <RuleTargetFields
        recordIds={recordIds}
        onChange={onChange}
        renderCollection={() => null}
        value={{ kind: "area", area: { kind: "toString", private: true } }}
      />,
    );
    expect(unknown).toContain("Existing custom area preserved");
  });
});
