import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateWorldDraftProposalDto } from "./create-world-draft-proposal.dto";

describe("CreateWorldDraftProposalDto", () => {
  it("rejects empty and oversized direction before provider work", async () => {
    await expect(
      validate(
        plainToInstance(CreateWorldDraftProposalDto, {
          expectedStorageRevision: 1,
          direction: " ",
        }),
      ),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(CreateWorldDraftProposalDto, {
          expectedStorageRevision: 1,
          direction: "x".repeat(4_001),
        }),
      ),
    ).resolves.not.toHaveLength(0);
  });
});
