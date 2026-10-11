import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
async function withFixture(run) {
  const name = `record-tabs-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.RECORD_TABS_TEST_PORT || 5194);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Artwork authoring test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { DraftRecordEditor } from './WorldAuthoringPages';
import { LocationRecordView } from './LocationRecordView';
import { LocationSectionPage } from './LocationWorkspacePages';
import { WorldMapPage } from './WorldMapPage';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const noop = () => {};
const draft = await fetch('/fixture-draft').then(r=>r.json());
const kind = new URLSearchParams(location.search).get("kind");
const initialSection = new URLSearchParams(location.search).get("section");
function Content() {
  const pathname = useLocation().pathname;
  const section = pathname.split('/').at(-1);
  return kind === 'locations' ? <LocationRecordView locationId="subject">{section === 'map' ? <WorldMapPage locationId="subject"/> : <LocationSectionPage key={section} locationId="subject" section={section === 'subject' ? 'description' : section}/>}</LocationRecordView> : <DraftRecordEditor kind={kind === "items" ? "items" : "creatures"} sourceId="subject"/>;
}
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Tabs test',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
const catchAll = createRoute({getParentRoute:()=>root,path:'$'});
const router = createRouter({routeTree:root.addChildren([catchAll]),history:createMemoryHistory({initialEntries:[kind === 'locations' ? '/worlds/world/atlas/locations/subject'+(initialSection ? '/'+initialSection : '') : '/']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; export default defineConfig({plugins:[react(),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null}});`,
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
  }
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";

await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      for (const kind of ["creatures", "items"]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        const mutations = [];
        await page.route("**/api/**", (route) => {
          if (route.request().method() !== "GET")
            mutations.push(route.request().url());
          return route.fulfill({
            json: {
              url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>",
            },
          });
        });
        const draft = {
          id: "draft",
          storageRevision: 1,
          revisionName: "Tabs fixture",
          status: "current",
          content: { modelSchemaReleaseIds: ["release"] },
          effectiveModels: {
            attributes: [],
            equipmentSlots: [],
            professionRanks: [],
            itemFamilies: [{ key: "aow:item-family-tool", name: "Tool" }],
            elements: [
              {
                semanticRole: kind === "items" ? "aow:item" : "aow:creature",
                elementId: "concept",
              },
            ],
            releases: [],
          },
          records: [
            {
              resourceType: "definitions",
              sourceId: "subject",
              payload: {
                kind: kind === "items" ? "item" : "creature",
                identity: { id: "subject", name: "Keeper" },
                components: {},
                instanceEmbodimentPolicy: { strategy: "one-per-instance" },
                modelValues: { "aow:item-family": "aow:item-family-tool" },
                image: {
                  assetId: "image",
                  altText: "Keeper",
                  width: 1024,
                  height: 1024,
                  mimeType: "image/webp",
                },
              },
            },
          ],
        };
        await page.route("**/fixture-draft", (route) =>
          route.fulfill({ json: draft }),
        );
        await page.goto(`${fixtureUrl}?kind=${kind}`);
        const overview = page.getByRole("tab", {
          name: "Overview",
          exact: true,
        });
        await overview.waitFor();
        const name = page.getByRole("textbox", { name: "Name", exact: true });
        await name.fill("Unsaved keeper");
        await page.getByRole("tab", { name: "Equipment", exact: true }).click();
        assert.equal(
          await page.getByRole("tabpanel").getAttribute("aria-labelledby"),
          "world-record-tab-Equipment",
        );
        await overview.click();
        assert.equal(await name.inputValue(), "Unsaved keeper");
        await overview.focus();
        await page.keyboard.press("End");
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent),
          "Artwork",
        );
        assert.equal(await overview.getAttribute("aria-selected"), "true");
        await page.keyboard.press("Enter");
        assert.equal(
          await page
            .getByRole("tab", { name: "Artwork", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await page.keyboard.press("Home");
        await page.keyboard.press("Space");
        assert.equal(await overview.getAttribute("aria-selected"), "true");
        await name.fill("");
        await page.getByRole("tab", { name: "Equipment", exact: true }).click();
        const save = page.getByRole("button", {
          name: "Save changes",
          exact: true,
        });
        assert.equal(await save.isEnabled(), true);
        await save.click();
        await name.waitFor({ state: "visible" });
        assert.equal(await overview.getAttribute("aria-selected"), "true");
        assert.equal(
          await name.evaluate((input) => document.activeElement === input),
          true,
        );
        await name.fill("Still unsaved");
        const overflow = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.ok(
          overflow.scroll <= overflow.width + 1,
          JSON.stringify({ kind, ...overflow }),
        );
        const sizes = await page
          .getByRole("tab")
          .evaluateAll((elements) =>
            elements.map((el) => ({
              w: el.getBoundingClientRect().width,
              h: el.getBoundingClientRect().height,
            })),
          );
        assert.ok(
          sizes.every(({ w, h }) => w >= 44 && h >= 44),
          JSON.stringify(sizes),
        );
        if (kind === "items") {
          await page.getByRole("tab", { name: "Artwork", exact: true }).click();
          await page
            .getByRole("textbox", { name: "Image description", exact: true })
            .fill("");
          await overview.click();
          assert.equal(
            await page
              .getByRole("button", { name: "Save changes", exact: true })
              .isDisabled(),
            true,
          );
          await page
            .getByRole("button", { name: "Open Artwork", exact: true })
            .click();
          assert.equal(
            await page
              .getByRole("textbox", { name: "Image description", exact: true })
              .isVisible(),
            true,
          );
        }
        assert.deepEqual(mutations, []);
        assert.deepEqual(errors, []);
        await page.screenshot({
          path: `/tmp/aow-record-tabs-${kind}-${width}.png`,
          fullPage: true,
        });
        console.log(
          `PASS ${kind} ${width}px: unsaved fields retained; keyboard activation; invalid group revealed/focused; no page overflow; 44px tabs; no mutations/errors`,
        );
        await page.close();
      }
    }

    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [],
        mutations = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/api/**", (route) => {
        if (route.request().method() !== "GET")
          mutations.push(route.request().url());
        return route.fulfill({ json: {} });
      });
      await page.route("**/fixture-draft", (route) =>
        route.fulfill({
          json: {
            id: "draft",
            storageRevision: 1,
            revisionName: "Tabs fixture",
            status: "current",
            content: { rootLocationId: "subject" },
            records: [
              {
                resourceType: "locations",
                sourceId: "subject",
                payload: {
                  identity: { name: "Old Harbor" },
                  name: "Old Harbor",
                  kind: "region",
                  placement: { kind: "root" },
                  description: "A quiet harbor",
                  mapScene: { orientation: "overhead", notes: "Harbor map" },
                },
              },
            ],
          },
        }),
      );
      await page.goto(`${fixtureUrl}?kind=locations&section=map`);
      await page.getByRole("tab", { name: "Map", exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("tab", { name: "Map", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("tab", { name: "Description", exact: true }).click();
      const name = page.getByRole("textbox", {
        name: "Location name",
        exact: true,
      });
      await name.fill("Unsaved harbor");
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("tab", { name: "Discoveries", exact: true }).click();
      assert.equal(await name.inputValue(), "Unsaved harbor");
      assert.equal(
        await page
          .getByRole("tab", { name: "Description", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await name.fill("Old Harbor");
      await page.getByRole("tab", { name: "Discoveries", exact: true }).click();
      await page
        .getByRole("button", { name: "Add discovery", exact: true })
        .waitFor();
      await page.getByRole("tab", { name: "Map", exact: true }).click();
      await page
        .getByRole("button", { name: "Save map", exact: true })
        .waitFor();
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scroll <= overflow.width + 1,
        JSON.stringify({ kind: "locations", ...overflow }),
      );
      await page.goto(`${fixtureUrl}?kind=locations&section=connections`);
      const connections = page.getByRole("tab", {
        name: "Connections",
        exact: true,
      });
      await connections.waitFor();
      const activeBounds = await connections.boundingBox();
      assert.ok(
        activeBounds.x >= 0 && activeBounds.x + activeBounds.width <= width,
        JSON.stringify({ width, activeBounds }),
      );
      assert.deepEqual(mutations, []);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `/tmp/aow-record-tabs-locations-${width}.png`,
        fullPage: true,
      });
      console.log(
        `PASS locations ${width}px: direct Map entry; Description/Discoveries/Map transitions; dirty cancel retains name; no overflow/mutations/errors`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
