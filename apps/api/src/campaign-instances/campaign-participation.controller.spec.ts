import { CampaignSessionMeOverviewController } from "./campaign-participation.controller";
import type { CampaignSessionService } from "./campaign-session.service";

describe("CampaignSessionMeOverviewController", () => {
  it("resolves the dashboard continuation from the authenticated identity", async () => {
    const resumableForGm = jest.fn().mockResolvedValue({ session: null });
    const controller = new CampaignSessionMeOverviewController({
      resumableForGm,
    } as unknown as CampaignSessionService);

    await expect(
      controller.resumableSession({ user: { id: "gm-1" } } as never),
    ).resolves.toEqual({ session: null });
    expect(resumableForGm).toHaveBeenCalledWith("gm-1");
  });
});
