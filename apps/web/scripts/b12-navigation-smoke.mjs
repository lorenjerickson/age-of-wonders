import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const chromePath =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find(existsSync);
if (!chromePath)
  throw new Error("Set CHROME_PATH to a Chromium-based browser executable.");
const screenshotPath =
  process.env.SESSION_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-b12-navigation.png");
async function withFixture(run) {
  const name = `b12-navigation-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.jsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.B12_TEST_PORT || 5199);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Session shell test</title><link rel="icon" href="/favicon.svg"></head><body><div id="root"></div><script type="module" src="/src/${name}.jsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,RouterProvider,Outlet} from '@tanstack/react-router';
import {PlayersLanding} from './routes/_gm.players';
import {SettingsLanding} from './routes/_gm.settings';
import './index.css';
const root=createRootRoute({component:()=> <Outlet/>});
const players=createRoute({getParentRoute:()=>root,path:'/players',component:()=> <PlayersLanding/>});
const profile=createRoute({getParentRoute:()=>root,path:'/players/$playerId',component:()=> <PlayersLanding playerId={profile.useParams().playerId}/>});
const settings=createRoute({getParentRoute:()=>root,path:'/settings',component:()=> <SettingsLanding/>});
const area=createRoute({getParentRoute:()=>root,path:'/settings/$area',component:()=> <SettingsLanding areaId={area.useParams().area}/>});
const setting=createRoute({getParentRoute:()=>root,path:'/settings/$area/$settingKey',component:()=> <SettingsLanding areaId={setting.useParams().area} settingKey={setting.useParams().settingKey}/>});
const router=createRouter({routeTree:root.addChildren([players,profile,settings,area,setting])});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; import { reactPluginOptions } from './react-plugin-options'; export default defineConfig({cacheDir:'node_modules/.vite-${name}',plugins:[react(reactPluginOptions),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,watch:null}});`,
    );
    server = spawn(
      process.execPath,
      [join(webRoot, "node_modules/vite/bin/vite.js"), "--config", config],
      { cwd: webRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stdout.on("data", (d) => {
      output += d;
    });
    server.stderr.on("data", (d) => {
      output += d;
    });
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(output);
      try {
        if ((await fetch(fixtureUrl)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Fixture server did not start. ${output}`);
    await run(fixtureUrl);
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    for (const path of [html, component, config])
      await rm(path, { force: true });
    await rm(join(webRoot, "node_modules", `.vite-${name}`), {
      recursive: true,
      force: true,
    });
  }
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const profile = {
  playerId: "opaque-person",
  displayName: "Morgan Vale",
  standing: "active",
  hasEmail: true,
  hasPhone: false,
  membershipCount: 1,
  characterCount: 1,
  email: "morgan@example.test",
  authenticationProviders: [
    { provider: "auth0:private-subject", status: "associated" },
  ],
  memberships: [
    {
      membershipId: "opaque-membership",
      campaignInstanceId: "opaque-instance",
      campaignDefinitionId: "opaque-definition",
      campaignInstanceName: "Autumn Table",
      campaignDefinitionName: "Moonlit Roads",
      status: "active",
      joinedAt: "2026-01-01",
      characters: [
        { characterId: "opaque-character", name: "Fern", status: "active" },
      ],
    },
  ],
};
const areaIds = [
  "overview",
  "hosting-network",
  "access-security",
  "plugins",
  "integrations-api",
  "ai",
  "communications",
  "data-storage",
  "backup-recovery",
  "operations",
  "privacy-governance",
  "updates-lifecycle",
];
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const html = await (await fetch(fixtureUrl)).text();
      await page.route("**/*", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        if (
          req.isNavigationRequest() &&
          url.origin === new URL(fixtureUrl).origin
        )
          return route.fulfill({ contentType: "text/html", body: html });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        let body;
        if (url.pathname === "/api/players")
          body = { items: [profile], total: 1, limit: 100, offset: 0 };
        else if (url.pathname === "/api/players/opaque-person") body = profile;
        else if (url.pathname.endsWith("/standing")) {
          const input = req.postDataJSON();
          assert.equal(input.expectedStanding, profile.standing);
          profile.standing = input.targetStanding;
          body = {
            displayName: profile.displayName,
            standing: profile.standing,
          };
        } else if (url.pathname === "/api/settings/system")
          body = {
            installationName: "Test installation",
            areas: areaIds.map((area) => ({
              area,
              label: area === "hosting-network" ? "Hosting & network" : area,
              description: "System configuration",
              status: "ready",
            })),
          };
        else if (url.pathname.endsWith("/history"))
          body = { settingLabel: "Installation name", revisions: [] };
        else if (url.pathname.includes("/settings/system/")) {
          const area = url.pathname.split("/")[4];
          body = {
            area,
            label: area === "hosting-network" ? "Hosting & network" : area,
            description: "System configuration",
            status: "ready",
            settings: [
              {
                key: "installation-name",
                label: "Installation name",
                classification: "deployment-managed",
                status: "ready",
                detail: "The configured installation name.",
                valueLabel: "Test installation",
              },
            ],
          };
        } else
          return route.fulfill({
            status: 404,
            json: { message: "Unavailable" },
          });
        return route.fulfill({ json: body });
      });
      const base = new URL(fixtureUrl).origin;
      await page.goto(base + "/players");
      await page.getByRole("link", { name: "View profile" }).click();
      await page.getByRole("heading", { name: "Morgan Vale" }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/players/opaque-person");
      await page.reload();
      await page.getByRole("heading", { name: "Morgan Vale" }).waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: "Autumn Table" })
          .getAttribute("href"),
        "/campaigns/instances/opaque-instance/roster/members/opaque-membership",
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Fern", exact: true })
          .getAttribute("href"),
        "/campaigns/instances/opaque-instance/roster/characters/opaque-character",
      );
      assert.ok(!(await page.locator("body").innerText()).includes("opaque-"));
      await page.screenshot({
        path: join(tmpdir(), `aow-b12-profile-${width}.png`),
      });
      await page.getByRole("link", { name: "Back to participants" }).click();
      await page.getByRole("link", { name: "View profile" }).waitFor();
      await page.goto(base + "/settings");
      if (width < 1280)
        await page
          .getByLabel("Category", { exact: true })
          .selectOption("hosting-network");
      else
        await page.getByRole("button", { name: /Hosting & network/ }).click();
      await page.waitForURL("**/settings/hosting-network");
      await page.getByRole("link", { name: "Open Installation name" }).click();
      await page.waitForURL("**/settings/hosting-network/installation-name");
      await page.reload();
      await page
        .getByRole("heading", { name: "Installation name", exact: true })
        .waitFor();
      assert.equal(await page.locator("article:visible").count(), 1);
      await page.screenshot({
        path: join(tmpdir(), `aow-b12-settings-${width}.png`),
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No horizontal overflow",
      );
      await page
        .getByRole("link", { name: "← Hosting & network", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Open Installation name" })
        .waitFor();
      await page.goBack();
      await page
        .getByRole("heading", { name: "Installation name", exact: true })
        .waitFor();
      await page.goto(base + "/settings/missing");
      await page
        .getByRole("alert")
        .filter({ hasText: "unavailable" })
        .waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS navigation ${width}px: profile refresh, identity privacy, membership/Character links, settings area/detail refresh/back and unavailable recovery`,
      );
    }
  } finally {
    await browser.close();
  }
});
