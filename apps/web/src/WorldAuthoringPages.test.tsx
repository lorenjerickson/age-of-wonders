import { renderToStaticMarkup } from "react-dom/server";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@aow/ui", () => ({
  Fieldset: ({ children }: PropsWithChildren) => <>{children}</>,
  Legend: ({ children }: PropsWithChildren) => <>{children}</>,
  Field: ({ children, label, required }: PropsWithChildren<{ label: string; required?: boolean }>) => (
    <>
      {label}{required ? " (required)" : ""}{children}
    </>
  ),
  Select: ({ children }: PropsWithChildren) => <>{children}</>,
  Input: () => null,
  Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
import { CreatureEmbodimentPolicyFields } from "./WorldAuthoringPages";

describe("Creature embodiment policy fields", () => {
  it("offers explicit human-labeled cardinality choices", () => {
    const html = renderToStaticMarkup(
      <CreatureEmbodimentPolicyFields
        strategy=""
        maximum=""
        legacy={false}
        onStrategyChange={() => undefined}
        onMaximumChange={() => undefined}
      />,
    );
    expect(html).toContain("One per Campaign Instance (recommended)");
    expect(html).toContain("One per realized placement");
    expect(html).toContain("required");
  });

  it("explains legacy behavior and reveals the repeatable maximum", () => {
    const html = renderToStaticMarkup(
      <CreatureEmbodimentPolicyFields
        strategy="one-per-realization"
        maximum="4"
        legacy
        onStrategyChange={() => undefined}
        onMaximumChange={() => undefined}
      />,
    );
    expect(html).toContain("Maximum per Campaign Instance (optional)");
    expect(html).toContain("needs an explicit choice");
    expect(html).not.toMatch(/opaque|uuid|guid/i);
  });
});
