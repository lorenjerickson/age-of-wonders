import { NotFoundException } from "@nestjs/common";
import {
  CampaignInstanceHierarchyController,
  CampaignInstanceMeController,
} from "./campaign-instance-hierarchy.controller";
import type { CampaignInstanceInvitationsService } from "./campaign-instance-invitations.service";
import type { CampaignInstanceManagementService } from "./campaign-instance-management.service";
import type { CampaignInstanceMigrationsService } from "./campaign-instance-migrations.service";
import type { CampaignInstancesService } from "./campaign-instances.service";

const request = {
  user: { id: "gm-1", displayName: "Game Master" },
} as never;

function controller(assertParentOverride?: jest.Mock) {
  const list = jest.fn();
  const get = jest.fn();
  const create = jest.fn();
  const assertParent =
    assertParentOverride ?? jest.fn().mockResolvedValue(undefined);
  const validate = jest.fn().mockResolvedValue({ readyToActivate: true });
  const instances = {
    list,
    get,
    create,
    assertParent,
  } as unknown as CampaignInstancesService;
  const management = {
    validate,
  } as unknown as CampaignInstanceManagementService;
  return {
    instances,
    calls: { list, get, create, assertParent, validate },
    subject: new CampaignInstanceHierarchyController(
      instances,
      management,
      {} as CampaignInstanceInvitationsService,
      {} as CampaignInstanceMigrationsService,
    ),
  };
}

describe("CampaignInstanceHierarchyController", () => {
  it("scopes collection reads and creation to the Definition in the route", async () => {
    const { calls, subject } = controller();

    await subject.list("definition-1", request);
    await subject.create("definition-1", request, {
      idempotencyKey: "instance-create-key",
      name: "Tuesday Game",
      campaignDefinitionSnapshotId: "snapshot-1",
    });

    expect(calls.list).toHaveBeenCalledWith("gm-1", "definition-1", 200, 0);
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaignDefinitionSnapshotId: "snapshot-1" }),
      "gm-1",
      "Game Master",
      "definition-1",
    );
  });

  it("does no child work when the Instance is under a different Definition", async () => {
    const parentError = new NotFoundException(
      "The selected Campaign Instance was not found.",
    );
    const { calls, subject } = controller(
      jest.fn().mockRejectedValue(parentError),
    );

    await expect(
      subject.validate("definition-other", "instance-1", request),
    ).rejects.toBe(parentError);
    expect(calls.assertParent).toHaveBeenCalledWith(
      "definition-other",
      "instance-1",
      "gm-1",
    );
    expect(calls.validate).not.toHaveBeenCalled();
  });
});

describe("CampaignInstanceMeController", () => {
  it("provides a read-only locator projection for the current GM", async () => {
    const { instances, calls } = controller();
    const subject = new CampaignInstanceMeController(instances);

    await subject.list(request);
    await subject.detail("instance-1", request);

    expect(calls.list).toHaveBeenCalledWith("gm-1", undefined, 200, 0);
    expect(calls.get).toHaveBeenCalledWith("instance-1", "gm-1");
  });
});
