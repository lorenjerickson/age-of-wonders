import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DecideCampaignInstancePlacementDto } from "./campaign-instance-management.dto";

describe("DecideCampaignInstancePlacementDto", () => {
  it.each(["instance-created-creature", "instance-created-item"])(
    "rejects the removed %s replacement command and arbitrary content",
    async (kind) => {
      const dto = plainToInstance(DecideCampaignInstancePlacementDto, {
        expectedRuntimeRevision: 3,
        action: "replace",
        replacement: {
          kind,
          name: "Injected",
          content: { attributes: "partial" },
        },
      });

      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(JSON.stringify(errors)).toContain("replacement");
      expect(JSON.stringify(errors)).toContain("isIn");
      expect(JSON.stringify(errors)).toContain("content");
    },
  );
});
