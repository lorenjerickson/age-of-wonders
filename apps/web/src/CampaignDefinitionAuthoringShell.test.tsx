import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CampaignDefinitionDetail, CampaignDefinitionDraft } from "./api";
import {
  CampaignDefinitionAuthoringProvider,
  useCampaignDefinitionAuthoring,
} from "./CampaignDefinitionAuthoringShell";

function ContextProbe() {
  const { definition, draft, canEdit } = useCampaignDefinitionAuthoring();
  return (
    <p>
      {definition.name} · {draft?.capturedWorld.worldName} revision{" "}
      {draft?.capturedWorld.revisionNumber} ·{" "}
      {canEdit ? "Editable" : "Read only"}
    </p>
  );
}

const definition = {
  id: "campaign-definition:opaque-identity",
  name: "Bells Beneath the Flood",
  status: "draft",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
} satisfies CampaignDefinitionDetail;

const draft = {
  id: "campaign-draft:opaque-identity",
  campaignDefinitionId: definition.id,
  capturedWorld: {
    snapshotId: "world-snapshot:opaque-identity",
    worldDefinitionId: "world:opaque-identity",
    worldDefinitionRevisionId: "world-revision:opaque-identity",
    worldName: "The Flooded City",
    revisionNumber: 4,
  },
  revisionName: "First draft",
  content: {
    formatVersion: 1,
    gmPremise: "",
    playerIntroduction: "",
    plotDefinitionIds: [],
    placementDefinitionIds: [],
    modelSchemaReleaseIds: [],
  },
  records: [],
  storageRevision: 1,
  validationStatus: "not-validated",
} satisfies CampaignDefinitionDraft;

describe("Campaign Definition authoring context", () => {
  it("renders Campaign and captured-World labels without opaque identities", () => {
    const html = renderToStaticMarkup(
      <CampaignDefinitionAuthoringProvider
        definition={definition}
        initialDraft={draft}
      >
        <ContextProbe />
      </CampaignDefinitionAuthoringProvider>,
    );
    expect(html).toContain(
      "Bells Beneath the Flood · The Flooded City revision 4 · Editable",
    );
    expect(html).not.toContain("opaque-identity");
    expect(html).not.toMatch(/Session|attendance|runtime/);
  });

  it("makes archived Campaign Definitions read only", () => {
    const html = renderToStaticMarkup(
      <CampaignDefinitionAuthoringProvider
        definition={{ ...definition, status: "archived" }}
        initialDraft={draft}
      >
        <ContextProbe />
      </CampaignDefinitionAuthoringProvider>,
    );
    expect(html).toContain("Read only");
  });

  it("makes stale Campaign drafts read only until they are reloaded", () => {
    const html = renderToStaticMarkup(
      <CampaignDefinitionAuthoringProvider
        definition={definition}
        initialDraft={{ ...draft, status: "stale" }}
      >
        <ContextProbe />
      </CampaignDefinitionAuthoringProvider>,
    );
    expect(html).toContain("Read only");
  });
});
