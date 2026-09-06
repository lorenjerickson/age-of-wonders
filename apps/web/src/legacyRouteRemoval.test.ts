import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy web surface removal", () => {
  const sourceRoot = join(process.cwd(), "src");

  it.each([
    "routes/_gm.campaigns.$campaignId.tsx",
    "routes/_gm.creatures.index.tsx",
    "routes/_gm.items.index.tsx",
    "routes/_gm.locations.index.tsx",
    "routes/_gm.systems.index.tsx",
    "routes/join.campaign.tsx",
    "routes/_player.play.characters.index.tsx",
    "routes/_player.play.characters.$characterId.tsx",
  ])("does not ship %s", (relativePath) => {
    expect(existsSync(join(sourceRoot, relativePath))).toBe(false);
  });

  it("does not call removed HTTP routes", () => {
    const api = readFileSync(join(sourceRoot, "api.ts"), "utf8");
    for (const path of [
      "/domain/",
      "/campaign-invitations/",
      "/ai/worlds",
      "/ai/locations",
      '"/character-drafts',
      '"/me/resumable-session"',
    ]) {
      expect(api).not.toContain(path);
    }
    expect(api).toContain('"/me/active-session"');
  });
});
