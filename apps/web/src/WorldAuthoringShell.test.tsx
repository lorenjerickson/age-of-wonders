import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorldDefinitionDetail, WorldDefinitionDraft } from "./api";
import {
  WorldAuthoringProvider,
  useWorldAuthoring,
} from "./WorldAuthoringShell";

function ContextProbe() {
  const { definition, draft, canEdit } = useWorldAuthoring();
  return (
    <p>
      {definition.name} · {draft?.revisionName} ·{" "}
      {canEdit ? "Editable" : "Read only"}
    </p>
  );
}

describe("World authoring context", () => {
  it("renders human context without exposing internal identities", () => {
    const definition = {
      id: "opaque-world-id",
      name: "The Shattered Coast",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      revisions: [],
    } satisfies WorldDefinitionDetail;
    const draft = {
      id: "opaque-draft-id",
      storageRevision: 1,
      revisionName: "Gathering storm",
      validationStatus: "not-validated",
      content: {},
      records: [],
    } satisfies WorldDefinitionDraft;
    const html = renderToStaticMarkup(
      <WorldAuthoringProvider definition={definition} initialDraft={draft}>
        <ContextProbe />
      </WorldAuthoringProvider>,
    );
    expect(html).toContain("The Shattered Coast · Gathering storm");
    expect(html).not.toContain("opaque-world-id");
    expect(html).not.toContain("opaque-draft-id");
  });

  it("makes an archived World read only throughout its workspace", () => {
    const definition = {
      id: "opaque-world-id",
      name: "The Shattered Coast",
      status: "archived",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      revisions: [],
    } satisfies WorldDefinitionDetail;
    const draft = {
      storageRevision: 1,
      revisionName: "Gathering storm",
      content: {},
      records: [],
    } satisfies WorldDefinitionDraft;
    const html = renderToStaticMarkup(
      <WorldAuthoringProvider definition={definition} initialDraft={draft}>
        <ContextProbe />
      </WorldAuthoringProvider>,
    );
    expect(html).toContain("Read only");
    expect(html).not.toContain("opaque-world-id");
  });

  it("makes a stale World draft read only until it is reloaded", () => {
    const definition = {
      id: "opaque-world-id",
      name: "The Shattered Coast",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      revisions: [],
    } satisfies WorldDefinitionDetail;
    const draft = {
      storageRevision: 1,
      revisionName: "Gathering storm",
      status: "stale",
      content: {},
      records: [],
    } satisfies WorldDefinitionDraft;
    const html = renderToStaticMarkup(
      <WorldAuthoringProvider definition={definition} initialDraft={draft}>
        <ContextProbe />
      </WorldAuthoringProvider>,
    );
    expect(html).toContain("Read only");
  });
});
