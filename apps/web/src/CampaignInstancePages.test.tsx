import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CampaignInstanceCharacterImportOptionProjection } from "@aow/common";
import {
  AsyncErrorSummary,
  ImportSelectionSummary,
} from "./CampaignInstancePages";

describe("Campaign Instance async error summary", () => {
  it("is focusable and announced as one atomic alert", () => {
    const html = renderToStaticMarkup(
      <AsyncErrorSummary error="The invitation was not created." />,
    );

    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("There was a problem");
    expect(html).toContain("The invitation was not created.");
  });

  it("does not leave an empty announcement target", () => {
    expect(renderToStaticMarkup(<AsyncErrorSummary error="" />)).toBe("");
  });
});

describe("Character import selection summary", () => {
  it("explains the relationship with human labels and hides command identifiers", () => {
    const html = renderToStaticMarkup(
      <ImportSelectionSummary
        selected={
          {
            playerMembershipId: "membership-opaque",
            playerName: "River",
            sourceCampaignDefinitionId: "definition-opaque",
            sourceCampaignDefinitionName: "Glasswake",
            sourceCampaignInstanceId: "instance-opaque",
            sourceCampaignInstanceName: "Earlier Glasswake",
            sourceCharacterId: "character-opaque",
            sourceCharacterName: "Aster Vale",
            sourceCharacterStatus: "retired",
          } as CampaignInstanceCharacterImportOptionProjection
        }
      />,
    );

    expect(html).toContain("River");
    expect(html).toContain("Glasswake");
    expect(html).toContain("Earlier Glasswake");
    expect(html).not.toContain("opaque");
  });
});
