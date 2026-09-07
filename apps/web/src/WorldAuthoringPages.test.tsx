import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@aow/ui", () => ({
  Fieldset: ({ children }: PropsWithChildren) => <>{children}</>,
  Legend: ({ children }: PropsWithChildren) => <>{children}</>,
  Field: ({
    children,
    label,
    required,
    help,
  }: PropsWithChildren<{
    label: string;
    required?: boolean;
    help?: string;
  }>) => (
    <>
      {label}
      {required ? " (required)" : ""}
      {help}
      {children}
    </>
  ),
  Select: ({ children }: PropsWithChildren) => <>{children}</>,
  Input: () => null,
  Textarea: () => createElement("textarea"),
  Button: ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) =>
    createElement("button", props, children),
  Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
import {
  AiCreationChoice,
  CreatureEmbodimentPolicyFields,
  editorFieldsFromProposal,
} from "./WorldAuthoringPages";
import { squareItemImageIssue } from "./worldAuthoringModel";

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

describe("Item image selection", () => {
  it("rejects a non-square image before upload with an accessible instruction", () => {
    expect(squareItemImageIssue(1200, 800)).toBe(
      "Choose a square Item image with equal width and height. No image was uploaded.",
    );
    expect(squareItemImageIssue(800, 800)).toBeUndefined();
  });
});

describe("AI-assisted World record creation", () => {
  it("presents distinct manual and AI modes and explains proposal-only behavior", () => {
    const html = renderToStaticMarkup(
      <AiCreationChoice
        kind="creatures"
        mode="ai"
        direction="A patient marsh hunter"
        pending={false}
        ready
        error=""
        disabled={false}
        disabledReason={undefined}
        onModeChange={() => undefined}
        onDirectionChange={() => undefined}
        onRequest={() => undefined}
      />,
    );
    expect(html).toContain("Create manually");
    expect(html).toContain("Create with AI");
    expect(html).toContain("will not change the draft");
    expect(html).toContain("configured AI provider");
    expect(html).toContain("Review and edit every field");
  });

  it("requires the GM to supply an Item catalog image", () => {
    const html = renderToStaticMarkup(
      <AiCreationChoice
        kind="items"
        mode="ai"
        direction="A precise survey tool"
        pending={false}
        ready={false}
        error=""
        disabled={false}
        disabledReason={undefined}
        onModeChange={() => undefined}
        onDirectionChange={() => undefined}
        onRequest={() => undefined}
      />,
    );
    expect(html).toContain("AI proposes text only");
    expect(html).toContain("choose a catalog image");
  });

  it("explains why proposal preparation is unavailable", () => {
    const html = renderToStaticMarkup(
      <AiCreationChoice
        kind="locations"
        mode="ai"
        direction=""
        pending={false}
        ready={false}
        error=""
        disabled
        disabledReason="Choose the parent Location before preparing a proposal."
        onModeChange={() => undefined}
        onDirectionChange={() => undefined}
        onRequest={() => undefined}
      />,
    );
    expect(html).toContain("Choose the parent Location");
    expect(html).toContain('aria-describedby="locations-ai-disabled-reason"');
  });

  it("populates editable fields without adding Item image data", () => {
    const fields = editorFieldsFromProposal("items", {
      name: "Survey Lens",
      description: "A precise field instrument.",
      itemFamilyKey: "aow:item-family-tool",
      category: "tool",
      quality: "fine",
      compatibleEquipmentSlots: ["aow:slot-hands"],
      image: { assetId: "must-not-be-used" },
    });
    expect(fields).toMatchObject({
      name: "Survey Lens",
      description: "A precise field instrument.",
      subtype: "aow:item-family-tool",
      itemCategory: "tool",
      itemQuality: "fine",
      slots: ["aow:slot-hands"],
    });
    expect(fields).not.toHaveProperty("image");
  });

  it("accepts complete progressive fields and compound Item slot alternatives", () => {
    expect(
      editorFieldsFromProposal("locations", {
        name: "Flooded Hall",
        profileSummary: "A drowned audience chamber.",
        profileTags: ["flooded", "court"],
        mapSceneNotes: "Use the overhead flooded map.",
        mapOrientation: "overhead",
      }),
    ).toMatchObject({
      profileSummary: "A drowned audience chamber.",
      profileTags: ["flooded", "court"],
      mapOrientation: "overhead",
    });
    expect(
      editorFieldsFromProposal("items", {
        name: "Wing Harness",
        compatibleEquipmentSlotSets: [
          ["aow:slot-wings", "aow:slot-back"],
          ["aow:slot-pack"],
        ],
      }).slotSets,
    ).toEqual([["aow:slot-wings", "aow:slot-back"], ["aow:slot-pack"]]);
  });
});
