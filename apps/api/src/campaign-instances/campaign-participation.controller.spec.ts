import { CampaignSessionMeOverviewController } from "./campaign-participation.controller";
import type { CampaignSessionService } from "./campaign-session.service";

describe("CampaignSessionMeOverviewController", () => {
  it("resolves the dashboard continuation from the authenticated identity", async () => {
    const activeForGm = jest.fn().mockResolvedValue({ session: null });
    const controller = new CampaignSessionMeOverviewController({
      activeForGm,
    } as unknown as CampaignSessionService);

    await expect(
      controller.activeSession({ user: { id: "gm-1" } } as never),
    ).resolves.toEqual({ session: null });
    expect(activeForGm).toHaveBeenCalledWith("gm-1");
  });
});
