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
  const name = `location-map-image-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.LOCATION_COLLECTIONS_TEST_PORT || 5228);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Action outcomes test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { WorldMapPage } from './WorldMapPage';
import { AstraAtlas } from './AstraAtlas';
import {useWorldAuthoring} from './WorldAuthoringShell';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  return new URLSearchParams(location.search).has("atlas") ? <AstraAtlas/> : <WorldMapPage locationId="location" inlineTools/>;
}
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Location test',accessRole:new URLSearchParams(location.search).get('readonly')?'viewer':'owner',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
const catchAll = createRoute({getParentRoute:()=>root,path:'$'});
const route = new URLSearchParams(location.search).get('route') || '/worlds/world/item-compendium/items/subject/owner';
const router = createRouter({routeTree:root.addChildren([catchAll]),history:createMemoryHistory({initialEntries:[route]})});
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
      for (const atlas of [false, true]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("dialog", (d) => d.accept());
        const image = {
          assetId: "old",
          mimeType: "image/png",
          width: 200,
          height: 100,
          orientation: "overhead",
          altText: "Harbor map",
        };
        const draft = {
          id: "draft",
          storageRevision: 1,
          status: "current",
          revisionName: "Test",
          content: { rootLocationId: "location", locationIds: ["location"] },
          records: [
            {
              resourceType: "locations",
              sourceId: "location",
              payload: {
                name: "Harbor",
                kind: "region",
                placement: { kind: "root" },
                map: { kind: "image" },
                image,
                mapScene: {
                  orientation: "overhead",
                  notes: "Map notes",
                  grid: { kind: "square", cellSizePixels: 40 },
                  private: true,
                },
                extensions: { private: true },
              },
            },
          ],
        };
        const writes = [];
        let uploads = 0;
        await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
        await page.route("**/fixture-image-*", (r) =>
          r.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>',
          }),
        );
        await page.route("**/api/**", async (r) => {
          const url = new URL(r.request().url());
          if (url.pathname.endsWith("/download"))
            return r.fulfill({
              json: {
                url: new URL(
                  "/fixture-image-" + url.pathname.split("/").at(-2),
                  fixtureUrl,
                ).href,
              },
            });
          if (r.request().method() === "POST" && url.pathname.includes("/ai/"))
            return r.fulfill({
              json: { image: { ...image, assetId: "generated" } },
            });
          if (
            r.request().method() === "POST" &&
            url.pathname.endsWith("/media")
          ) {
            uploads++;
            return r.fulfill({
              json: {
                id: "uploaded",
                mimeType: "image/png",
                originalName: "Replacement.png",
              },
            });
          }
          if (r.request().method() === "GET")
            return r.fulfill({
              json: {
                items: [
                  {
                    id: "library",
                    mimeType: "image/png",
                    originalName: "Library map",
                  },
                ],
                total: 1,
              },
            });
          const input = r.request().postDataJSON();
          writes.push(input);
          draft.storageRevision++;
          draft.records[0].payload.image = input.image;
          return r.fulfill({ json: draft });
        });
        await page.goto(
          atlas
            ? fixtureUrl +
                "?atlas=1&route=" +
                encodeURIComponent(
                  "/worlds/world?view=atlas&entry=location&edit=1",
                )
            : fixtureUrl,
        );
        await page
          .getByRole("img", { name: "Harbor map", exact: true })
          .waitFor();
        if (atlas)
          await page.getByLabel("Choose a map source").selectOption("upload");
        const uploadInput = page.getByLabel(
          atlas ? "Upload map image" : "Upload image",
          { exact: true },
        );
        await uploadInput.setInputFiles({
          name: "Replacement.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(0),
        });
        await page
          .getByText("This image file is empty. Choose a non-empty image file.")
          .waitFor();
        assert.equal(uploads, 0);
        assert.equal(
          await page.getByText("Unsaved changes", { exact: true }).count(),
          0,
        );
        assert.equal(await uploadInput.inputValue(), "");
        assert.ok(
          (await page.locator("main img").first().getAttribute("src")).endsWith(
            "fixture-image-old",
          ),
        );
        await uploadInput.setInputFiles({
          name: "Replacement.png",
          mimeType: "image/png",
          buffer: Buffer.from("fixture"),
        });
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-uploaded"),
        );
        await page
          .getByRole("button", {
            name: atlas ? "Save location" : "Save map",
            exact: true,
          })
          .first()
          .click();
        if (!atlas)
          await page.getByText("Map saved to the World draft.").waitFor();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(writes.at(-1).image.assetId, "uploaded");
        assert.deepEqual(writes.at(-1).mapSceneGrid, {
          kind: "square",
          cellSizePixels: 40,
        });
        assert.deepEqual(draft.records[0].payload.extensions, {
          private: true,
        });
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-uploaded"),
        );
        if (atlas)
          await page.getByLabel("Choose a map source").selectOption("library");
        else
          await page
            .getByRole("button", { name: "Pick image", exact: true })
            .click();
        await page
          .getByRole("button", {
            name: atlas ? /Library map/ : "Use image",
            exact: !atlas,
          })
          .click();
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-library"),
        );
        await page
          .getByRole("button", {
            name: atlas ? "Save location" : "Save map",
            exact: true,
          })
          .first()
          .click();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(writes.at(-1).image.assetId, "library");
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-library"),
        );
        if (atlas)
          await page.getByLabel("Choose a map source").selectOption("generate");
        else
          await page
            .getByRole("button", { name: "Generate image", exact: true })
            .click();
        await page
          .getByLabel(atlas ? "Describe the map" : "Image direction", {
            exact: true,
          })
          .fill("A harbor map");
        await page
          .getByRole("button", {
            name: atlas ? "Generate map" : "Generate Map preview",
            exact: true,
          })
          .click();
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-generated"),
        );
        await page
          .getByRole("button", {
            name: atlas ? "Save location" : "Save map",
            exact: true,
          })
          .first()
          .click();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(writes.at(-1).image.assetId, "generated");
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector("main img")
            ?.src.endsWith("fixture-image-generated"),
        );
        assert.deepEqual(errors, []);
        console.log("PASS map image replacement " + width + " atlas=" + atlas);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
