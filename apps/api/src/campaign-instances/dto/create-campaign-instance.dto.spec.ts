import { validate } from "class-validator";
import { CreateCampaignInstanceDto } from "./create-campaign-instance.dto";

const dto = (values: Record<string, unknown>) =>
  Object.assign(new CreateCampaignInstanceDto(), values);

describe("CreateCampaignInstanceDto", () => {
  it("accepts a human name and explicit Campaign Definition snapshot", async () => {
    await expect(
      validate(
        dto({
          idempotencyKey: "create-campaign-instance-1",
          name: "Tuesday Glasswake",
          campaignDefinitionSnapshotId: "campaign-snapshot-3",
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).resolves.toEqual([]);
  });

  it("rejects blank input and the ambiguous legacy campaignId", async () => {
    const errors = await validate(
      dto({
        idempotencyKey: " ",
        name: "   ",
        campaignDefinitionSnapshotId: "   ",
        campaignId: "legacy-campaign-1",
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property).sort()).toEqual([
      "campaignDefinitionSnapshotId",
      "campaignId",
      "idempotencyKey",
      "name",
    ]);
  });
});
