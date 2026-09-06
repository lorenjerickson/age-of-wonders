import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function controllerSources(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return controllerSources(path);
      return entry.name.endsWith(".controller.ts")
        ? [readFileSync(path, "utf8")]
        : [];
    })
    .join("\n");
}

describe("legacy HTTP API removal", () => {
  const source = controllerSources(join(process.cwd(), "src"));

  it.each([
    '@Controller("world-definitions")',
    '@Controller("campaign-definitions")',
    '@Controller("campaign-instances")',
    '@Controller("campaign-instance-invitations")',
    '@Controller("domain/:resource")',
    '@Controller("graph/tuples")',
    '@Post("gm-session")',
    '@Get("effective")',
    '@Post(":id/releases/extend")',
    '@Post("campaigns/:campaignId/invitations")',
    '@Post("campaigns/:campaignId/character-drafts")',
    '@Post("worlds/:worldId/items")',
    '@Post("worlds/:worldId/creatures")',
    '@Post("locations/:parentId")',
    '@Post("generate")',
    '@Post("pipelines/content")',
  ])("does not register %s", (legacyRoute) => {
    expect(source).not.toContain(legacyRoute);
  });
});
