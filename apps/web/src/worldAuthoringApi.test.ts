import { afterEach, describe, expect, it, vi } from "vitest";
import {
  proposeWorldDraftRecord,
  saveWorldCreature,
  saveWorldItem,
  saveWorldLocation,
  upgradeLegacyWorldCreature,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("nested World draft commands", () => {
  it("uses server-owned create and stable update routes", async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            storageRevision: 2,
            revisionName: "Draft",
            content: {},
            records: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await saveWorldLocation("world one", {
      expectedStorageRevision: 1,
      name: "Harbor",
      kind: "settlement",
      parentLocationId: "root" as never,
    });
    await saveWorldCreature(
      "world one",
      {
        expectedStorageRevision: 2,
        name: "Keeper",
        attributes: {},
        equipmentSlots: [],
        instanceEmbodimentPolicy: { strategy: "one-per-instance" },
      },
      "creature/one",
    );
    await saveWorldItem("world one", {
      expectedStorageRevision: 3,
      name: "Key",
      itemFamilyKey: "aow:item-family-tool" as never,
      category: "tool",
      quality: "standard",
      compatibleEquipmentSlotSets: [],
      image: {
        assetId: "asset" as never,
        altText: "A brass key",
        width: 512,
        height: 512,
        mimeType: "image/png",
      },
    });
    expect(
      fetch.mock.calls.map(([url, init]) => [
        url,
        (init as RequestInit).method,
      ]),
    ).toEqual([
      ["/api/worlds/world%20one/atlas/locations", "POST"],
      ["/api/worlds/world%20one/bestiary/creatures/creature%2Fone", "PUT"],
      ["/api/worlds/world%20one/item-compendium/items", "POST"],
    ]);
  });

  it("uses the dedicated canonical upgrade command for a legacy Creature", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          storageRevision: 5,
          revisionName: "Draft",
          content: {},
          records: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await upgradeLegacyWorldCreature("world one", "legacy/keeper", {
      expectedStorageRevision: 4,
      name: "Keeper",
      attributes: {},
      equipmentSlots: [],
      movement: [],
      skillDefinitionIds: [],
      professionDefinitionIds: [],
      instanceEmbodimentPolicy: { strategy: "one-per-instance" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/worlds/world%20one/bestiary/creatures/legacy%2Fkeeper/upgrade",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("World draft AI proposals", () => {
  it("uses explicit draft ancestry and an idempotency key without applying the proposal", async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            proposal: { name: "Glass Marsh" },
            model: "test",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await proposeWorldDraftRecord(
      "world one",
      "location",
      {
        expectedStorageRevision: 4,
        direction: "A flooded glass plain",
        parentLocationId: "parent-location",
      },
      "proposal-request-1",
    );

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai/worlds/world%20one/draft/location-proposals");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "proposal-request-1",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      expectedStorageRevision: 4,
      direction: "A flooded glass plain",
      parentLocationId: "parent-location",
    });

    await saveWorldLocation("world one", {
      expectedStorageRevision: 4,
      name: "Glass Marsh",
      kind: "region",
      parentLocationId: "parent-location" as never,
    });
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "/api/worlds/world%20one/atlas/locations",
    );
    expect((fetch.mock.calls[1]?.[1] as RequestInit).method).toBe("POST");
  });
});
