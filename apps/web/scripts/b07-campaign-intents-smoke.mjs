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
  join(tmpdir(), "aow-b07-campaign-intents.png");
async function withFixture(run) {
  const name = `b07-campaign-intents-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.B07_TEST_PORT || 5196);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Session shell test</title><link rel="icon" href="/favicon.svg"></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `// @ts-nocheck
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider,Outlet} from '@tanstack/react-router';
import {CampaignDefinitionAuthoringProvider} from './CampaignDefinitionAuthoringShell';
import {CampaignPlacementsPage,CampaignPreparationPage} from './CampaignDefinitionPages';
import {CampaignPlotReferencesPage} from './CampaignPlotReferencesPage';
import './index.css';
const draft = await (await fetch('/api/fixture')).json();
const root=createRootRoute({component:()=> <CampaignDefinitionAuthoringProvider definition={{id:'campaign',name:'Harbor mystery',status:'draft'}} initialDraft={draft}><Outlet/></CampaignDefinitionAuthoringProvider>});
const placements=createRoute({getParentRoute:()=>root,path:'/placements',component:CampaignPlacementsPage});
const preparation=createRoute({getParentRoute:()=>root,path:'/preparation',component:CampaignPreparationPage});
const context=createRoute({getParentRoute:()=>root,path:'/context',component:()=> <CampaignPlotReferencesPage plotId="plot" collection="locations" childId="context"/>});
const router=createRouter({routeTree:root.addChildren([placements,context,preparation]),history:createMemoryHistory({initialEntries:[new URLSearchParams(location.search).get('path')||'/placements']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);
`,
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

await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      let draft = {
        capturedWorld: { worldName: "Coast", revisionNumber: 1 },
        capturedWorldContent: {
          locations: [
            { id: "harbor", name: "Harbor" },
            { id: "tower", name: "Tower" },
          ],
          creatures: [{ id: "keeper", name: "Keeper" }],
          items: [{ id: "bell", name: "Bell", kind: "item" }],
          placements: [
            {
              id: "world-keeper",
              name: "Keeper at harbor",
              locationId: "harbor",
            },
          ],
        },
        revisionName: "Draft",
        storageRevision: 1,
        content: {
          plotDefinitionIds: ["plot"],
          placementDefinitionIds: ["existing"],
          privateField: "preserved",
        },
        records: [
          {
            resourceType: "plots",
            sourceId: "plot",
            payload: {
              id: "plot",
              name: "Lost Bell",
              locationContexts: [
                {
                  id: "context",
                  locationId: "harbor",
                  placementDefinitionIds: [],
                  actorPlacements: [
                    {
                      id: "legacy",
                      source: { kind: "actor-role", role: "Legacy keeper" },
                      extensions: { "test:private": true },
                    },
                  ],
                },
              ],
            },
          },
          {
            resourceType: "campaign-placements",
            sourceId: "existing",
            payload: {
              id: "existing",
              kind: "independent",
              name: "Existing keeper",
              locationId: "tower",
              plotDefinitionIds: [],
              source: { kind: "world-creature", creatureId: "keeper" },
              notes: "Original",
              extensions: { "test:secret": "keep" },
              mapPosition: { kind: "normalized-map", x: 0.2, y: 0.4 },
              scale: 2,
            },
          },
        ],
      };
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        if (route.request().method() === "PUT") {
          const body = route.request().postDataJSON();
          assert.equal(body.expectedStorageRevision, draft.storageRevision);
          draft = {
            ...draft,
            content: body.content,
            records: body.records,
            storageRevision: draft.storageRevision + 1,
          };
        }
        return route.fulfill({ json: draft });
      });
      const save = async (label) => {
        const response = page.waitForResponse(
          (r) => r.request().method() === "PUT",
        );
        await page.getByRole("button", { name: label, exact: true }).click();
        await response;
        await page
          .getByRole("button", { name: "Add placement", exact: true })
          .waitFor();
      };
      await page.goto(url);
      await page
        .getByRole("button", { name: "Edit placement", exact: true })
        .click();
      await page.getByLabel("Campaign label").fill("Keeper revised");
      await page.getByLabel("GM notes").fill("New private note");
      await save("Save placement");
      let existing = draft.records.find(
        (r) => r.sourceId === "existing",
      ).payload;
      assert.equal(existing.extensions["test:secret"], "keep");
      assert.deepEqual(existing.mapPosition, {
        kind: "normalized-map",
        x: 0.2,
        y: 0.4,
      });
      assert.equal(existing.scale, 2);
      await page.reload();
      await page
        .getByRole("button", { name: "Edit placement", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("GM notes").inputValue(),
        "New private note",
      );
      await page.getByLabel("GM notes").fill("Discard this note");
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Cancel editing", exact: true })
        .click();
      assert.equal(
        draft.records.find((r) => r.sourceId === "existing").payload.notes,
        "New private note",
      );
      await page
        .getByRole("button", { name: "Add placement", exact: true })
        .click();
      await page.getByLabel("Campaign label").fill("Harbor decoration");
      await page.getByLabel("Decorate a World placement").check();
      await page
        .getByLabel("Captured World placement")
        .selectOption("world-keeper");
      await save("Add to draft");
      assert.equal(draft.records.at(-1).payload.kind, "world-decoration");
      await page.getByText("Inherited World placements").click();
      await page.getByText("Keeper at harbor · Harbor · World owned").waitFor();
      await page.goto(url + "?path=/context");
      await page
        .getByRole("button", {
          name: "Edit actor and Item intents",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Add placement", exact: true })
        .click();
      await page.getByLabel("Campaign label").fill("Harbor guide");
      await page.getByLabel("Intent source").selectOption("actor-role");
      await page
        .getByLabel("Actor role", { exact: true })
        .fill("Guide the party");
      await page.getByLabel("GM notes").fill("Knows the secret");
      await save("Add to draft");
      const guide = draft.records.find(
        (r) => r.payload.name === "Harbor guide",
      );
      assert.equal(guide.payload.source.kind, "actor-role");
      assert.deepEqual(guide.payload.plotDefinitionIds, ["plot"]);
      assert.deepEqual(
        draft.records[0].payload.locationContexts[0].placementDefinitionIds,
        [guide.sourceId],
      );
      assert.equal(
        draft.records[0].payload.locationContexts[0].actorPlacements[0]
          .extensions["test:private"],
        true,
      );
      await page
        .getByRole("button", { name: "Add placement", exact: true })
        .click();
      await page.getByLabel("Campaign label").fill("Hidden bell");
      await page
        .getByLabel("Creature or Item", { exact: true })
        .selectOption("bell");
      await save("Add to draft");
      assert.equal(draft.records.at(-1).payload.source.kind, "world-item");
      await page.reload();
      await page
        .getByRole("button", {
          name: "Edit actor and Item intents",
          exact: true,
        })
        .click();
      const guideCard = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Harbor guide", exact: true }),
      });
      await guideCard
        .getByRole("button", { name: "Edit placement", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Actor role", { exact: true }).inputValue(),
        "Guide the party",
      );
      await page
        .getByRole("button", { name: "Cancel editing", exact: true })
        .click();
      page.once("dialog", (dialog) => {
        assert.match(dialog.message(), /Lost Bell/);
        return dialog.accept();
      });
      const removed = page.waitForResponse(
        (r) => r.request().method() === "PUT",
      );
      await guideCard
        .getByRole("button", { name: "Remove placement", exact: true })
        .click();
      await removed;
      await guideCard.waitFor({ state: "detached" });
      assert.ok(!draft.records.some((r) => r.sourceId === guide.sourceId));
      assert.ok(
        !draft.records[0].payload.locationContexts[0].placementDefinitionIds.includes(
          guide.sourceId,
        ),
      );
      assert.equal(draft.content.privateField, "preserved");
      await page.goto(url + "?path=/preparation");
      await page.getByLabel(/Canvas Location/).selectOption("harbor");
      await page.getByText("Notes (0)", { exact: true }).click();
      await page.getByRole("button", { name: "Add note", exact: true }).click();
      await page
        .getByLabel("Note 1 name", { exact: true })
        .fill("Private harbor clue");
      await page
        .getByLabel(/^Note 1 text/)
        .fill("The bell is beneath the dock");
      await page.getByText("Lights (0)", { exact: true }).click();
      await page
        .getByRole("button", { name: "Add light", exact: true })
        .click();
      await page
        .getByLabel("Light 1 name", { exact: true })
        .fill("Dock lantern");
      await page.getByLabel("Light 1 radius", { exact: true }).fill("0.3");
      const prepared = page.waitForResponse(
        (r) => r.request().method() === "PUT",
      );
      await page
        .getByRole("button", { name: "Save preparation defaults", exact: true })
        .click();
      await prepared;
      assert.equal(
        draft.content.preparation.locationCanvases[0].notes[0].name,
        "Private harbor clue",
      );
      await page.reload();
      await page.getByLabel(/Canvas Location/).selectOption("harbor");
      if (!(await page.getByLabel(/^Note 1 text/).isVisible()))
        await page.getByText("Notes (1)", { exact: true }).click();
      assert.equal(
        await page.getByLabel(/^Note 1 text/).inputValue(),
        "The bell is beneath the dock",
      );
      await page.getByLabel(/^Note 1 text/).fill("Unsaved change");
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", {
          name: "Cancel preparation changes",
          exact: true,
        })
        .click();
      if (!(await page.getByLabel(/^Note 1 text/).isVisible()))
        await page.getByText("Notes (1)", { exact: true }).click();
      assert.equal(
        await page.getByLabel(/^Note 1 text/).inputValue(),
        "The bell is beneath the dock",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: screenshotPath.replace(".png", `-${viewport.width}.png`),
        fullPage: true,
      });
      await page.close();
      console.log(`B07 Campaign intents ${viewport.width}px passed`);
    }
  } finally {
    await browser.close();
  }
});
