import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { CampaignSessionTableService } from "./campaign-session-table.service";
function fixture() {
  const manifest = buildSnapshotManifest(1, [
    {
      resourceType: "locations",
      sourceId: "room",
      payload: { name: "Hall", weather: { condition: "Clear" } },
    },
  ]);
  const instance = {
    id: "instance",
    currentSnapshotId: "snapshot",
    runtime: {
      id: "runtime",
      revision: 4,
      state: {
        formatVersion: 1,
        preparation: {},
        plotProgress: [],
        placementRealizations: [],
        creatureEmbodiments: [],
        itemInstances: [],
        extensions: { private: true },
      },
    },
    currentSnapshot: {
      worldDefinitionSnapshot: { manifest },
      campaignDefinitionSnapshot: { manifest },
    },
  };
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    campaignInstanceSession: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ status: "ACTIVE", campaignInstance: instance }),
    },
    campaignInstanceRuntime: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new CampaignSessionTableService({
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  } as never);
  jest.spyOn(service, "table").mockResolvedValue({} as never);
  const change = (input: Record<string, unknown> = {}) =>
    service.changeWeather("campaign", "instance", "session", "gm", {
      expectedRuntimeRevision: 4,
      locationId: "room",
      weather: { condition: "Rain" },
      ...input,
    });
  return { tx, instance, change };
}
describe("Instance-local Session weather", () => {
  it("uses owned Session scope and atomic runtime CAS plus audit without changing capture", async () => {
    const { tx, instance, change } = fixture();
    await change();
    expect(
      tx.campaignInstanceSession.findFirst.mock.calls[0][0].where
        .campaignInstance,
    ).toEqual({ campaignDefinitionId: "campaign", ownerUserId: "gm" });
    expect(
      tx.campaignInstanceRuntime.updateMany.mock.calls[0][0],
    ).toMatchObject({
      where: { revision: 4, campaignInstanceSnapshotId: "snapshot" },
      data: {
        state: {
          locationPresentationOverrides: [
            { locationId: "room", weather: { condition: "Rain" } },
          ],
          extensions: { private: true },
        },
      },
    });
    expect(tx.campaignInstanceAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(
      instance.currentSnapshot.worldDefinitionSnapshot.manifest.records[0]
        .payload,
    ).toMatchObject({ weather: { condition: "Clear" } });
  });
  it("rejects foreign Locations, stale runtime and inactive Sessions before writing", async () => {
    const { tx, change } = fixture();
    await expect(change({ locationId: "foreign" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(change({ expectedRuntimeRevision: 3 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    tx.campaignInstanceSession.findFirst.mockResolvedValueOnce({
      status: "CONCLUDED",
      campaignInstance: fixture().instance,
    });
    await expect(change()).rejects.toBeInstanceOf(ConflictException);
    tx.campaignInstanceSession.findFirst.mockResolvedValueOnce(null);
    await expect(change()).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.campaignInstanceRuntime.updateMany).not.toHaveBeenCalled();
  });
  it("does not journal a failed runtime CAS", async () => {
    const { tx, change } = fixture();
    tx.campaignInstanceRuntime.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(change()).rejects.toBeInstanceOf(ConflictException);
    expect(tx.campaignInstanceAuditEvent.create).not.toHaveBeenCalled();
  });
});
