import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateCampaignDto } from "./create-campaign.dto";

describe("CreateCampaignDto", () => {
  it("rejects proposal context larger than the paid endpoint budget", async () => {
    const dto = plainToInstance(CreateCampaignDto, { prompt: "x".repeat(4_001) });
    expect((await validate(dto)).map((error) => error.property)).toContain("prompt");
  });
});
