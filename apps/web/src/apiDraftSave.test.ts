import { afterEach, describe, expect, it, vi } from "vitest";
import {
  saveCampaignDefinitionDraft,
  saveWorldDefinitionDraft,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("draft save transport", () => {
  it.each([
    ["World", saveWorldDefinitionDraft],
    ["Campaign", saveCampaignDefinitionDraft],
  ] as const)("sends only writable record fields for a %s draft", async (_label, save) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", {
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    const records = [{
      resourceType: "world-placements",
      sourceId: "placement",
      sourceRevision: 2,
      contentHash: "old-snapshot-hash",
      payload: {
        name: "Guard", locationId: "harbor",
        source: { kind: "world-creature", creatureId: "guard" },
        extensions: { "example:metadata": { contentHash: "payload-data" } },
      },
    }];
    await save("definition", {
      storageRevision: 4, revisionName: "Working draft", content: {}, records,
    });
    const [, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({
      expectedStorageRevision: 4, revisionName: "Working draft", content: {},
      records: [{
        resourceType: records[0].resourceType, sourceId: records[0].sourceId,
        sourceRevision: 2, payload: records[0].payload,
      }],
    });
    expect(records[0].contentHash).toBe("old-snapshot-hash");
  });
});
