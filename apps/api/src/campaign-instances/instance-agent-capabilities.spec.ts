import { ConflictException } from "@nestjs/common";
import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
function fixture() {
  const row = {
    id: "agent",
    campaignInstanceId: "instance",
    status: "PAUSED",
    agentName: "Scribe",
  };
  const tx = {
    campaignInstance: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "instance", name: "Coast", status: "ACTIVE" }),
    },
    campaignInstanceAgentParticipation: {
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaignInstanceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new CampaignInstanceManagementService({
    ...tx,
    $transaction: (operation: (client: typeof tx) => unknown) => operation(tx),
  } as never);
  jest.spyOn(service, "roster").mockResolvedValue({} as never);
  const change = () =>
    service.updateAgentCapabilities("instance", "agent", "gm", {
      expectedObserve: [],
      expectedAct: [],
      observe: ["aow:event-stream"],
      act: [],
    });
  return { row, tx, change };
}
test("Agent grant edits CAS both old grants and status, and require authorization again", async () => {
  const { tx, change } = fixture();
  await change();
  expect(
    tx.campaignInstanceAgentParticipation.updateMany.mock.calls[0][0],
  ).toMatchObject({
    where: {
      id: "agent",
      campaignInstanceId: "instance",
      status: "PAUSED",
      observeCapabilities: { equals: [] },
      actCapabilities: { equals: [] },
    },
    data: {
      status: "CONFIGURED",
      observeCapabilities: ["aow:event-stream"],
      actCapabilities: [],
    },
  });
  expect(tx.campaignInstanceAuditEvent.create).toHaveBeenCalledTimes(1);
});
test("active Agent grants cannot be changed and stale edits are not journaled", async () => {
  const { tx, row, change } = fixture();
  row.status = "ACTIVE";
  await expect(change()).rejects.toBeInstanceOf(ConflictException);
  expect(
    tx.campaignInstanceAgentParticipation.updateMany,
  ).not.toHaveBeenCalled();
  row.status = "PAUSED";
  tx.campaignInstanceAgentParticipation.updateMany.mockResolvedValueOnce({
    count: 0,
  });
  await expect(change()).rejects.toBeInstanceOf(ConflictException);
  expect(tx.campaignInstanceAuditEvent.create).not.toHaveBeenCalled();
});
