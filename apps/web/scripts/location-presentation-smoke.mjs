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
  const name = `location-presentation-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.LOCATION_COLLECTIONS_TEST_PORT || 5229);
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
    for (const width of [1440, 390])
      for (const atlas of [false, true]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("dialog", (d) => d.accept());
        const location = {
          resourceType: "locations",
          sourceId: "location",
          payload: {
            name: "Harbor",
            kind: "region",
            placement: { kind: "root" },
            map: { kind: "image", privateMap: true },
            image: {
              assetId: "old",
              mimeType: "image/png",
              width: 200,
              height: 100,
              orientation: "overhead",
              altText: "Harbor map",
            },
            mapScene: {
              orientation: "overhead",
              notes: "Map notes",
              grid: { kind: "square", cellSizePixels: 40 },
              private: true,
            },
            extensions: { private: true },
          },
        };
        const draft = {
          id: "draft",
          storageRevision: 1,
          status: "current",
          revisionName: "Test",
          content: { rootLocationId: "location", locationIds: ["location"] },
          records: [
            location,
            {
              resourceType: "locations",
              sourceId: "sibling",
              payload: {
                name: "Other harbor",
                weather: { condition: "Clear" },
              },
            },
          ],
        };
        const sibling = JSON.stringify(draft.records[1]);
        let failNext = false;
        const writes = [];
        await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
        await page.route("**/fixture-image", (r) =>
          r.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"/>',
          }),
        );
        await page.route("**/api/**", async (r) => {
          const url = new URL(r.request().url());
          if (url.pathname.endsWith("/download"))
            return r.fulfill({
              json: { url: new URL("/fixture-image", fixtureUrl).href },
            });
          if (
            r.request().method() === "POST" &&
            url.pathname.endsWith("/media")
          )
            return r.fulfill({
              json: {
                id: "uploaded-audio",
                mimeType: "audio/wav",
                originalName: "Harbor waves.wav",
              },
            });
          if (r.request().method() === "GET")
            return r.fulfill({
              json: {
                items: url.pathname.endsWith("/media")
                  ? [
                      {
                        id: "visual-media",
                        mimeType: "image/png",
                        originalName: "Mist overlay.png",
                      },
                    ]
                  : [],
                total: url.pathname.endsWith("/media") ? 1 : 0,
              },
            });
          const input = r.request().postDataJSON();
          writes.push(input);
          if (failNext) {
            failNext = false;
            return r.fulfill({
              status: 500,
              json: { message: "Temporary failure" },
            });
          }
          assert.equal(input.expectedStorageRevision, draft.storageRevision);
          for (const key of ["weather", "audiovisualEffects"])
            if (key in input) {
              if (input[key] === null) delete location.payload[key];
              else location.payload[key] = input[key];
            }
          draft.storageRevision++;
          return r.fulfill({ json: draft });
        });
        const url =
          fixtureUrl +
          (atlas
            ? "?atlas=1&route=" +
              encodeURIComponent(
                "/worlds/world?view=atlas&entry=location&edit=1",
              )
            : "");
        await page.goto(url);
        await page
          .getByText("Weather and audiovisual effects", { exact: true })
          .click();
        await page
          .getByRole("button", { name: "Add weather", exact: true })
          .click();
        await page
          .getByLabel("Weather condition", { exact: true })
          .fill("Sea fog");
        await page.getByLabel("Temperature (°C)", { exact: true }).fill("9");
        await page
          .getByRole("button", { name: "Add wind", exact: true })
          .click();
        await page.getByLabel("Wind speed (km/h)", { exact: true }).fill("12");
        await page
          .getByLabel("Wind direction (degrees)", { exact: true })
          .fill("225");
        await page
          .getByRole("button", { name: "Add audio effect", exact: true })
          .click();
        const audio = page.getByRole("region", {
          name: "Presentation effect 1",
          exact: true,
        });
        await audio
          .getByLabel("Effect name", { exact: true })
          .fill("Harbor waves");
        await audio
          .getByLabel("Upload effect media", { exact: true })
          .setInputFiles({
            name: "Harbor waves.wav",
            mimeType: "audio/wav",
            buffer: Buffer.from("audio fixture"),
          });
        await audio.getByText("Media attached", { exact: true }).waitFor();
        await audio.getByLabel("Loop", { exact: true }).check();
        await audio.getByLabel("Volume (0–1)", { exact: true }).fill("0.35");
        await page
          .getByRole("button", { name: "Add visual effect", exact: true })
          .click();
        const visual = page.getByRole("region", {
          name: "Presentation effect 2",
          exact: true,
        });
        await visual
          .getByLabel("Effect name", { exact: true })
          .fill("Morning mist");
        await visual
          .getByRole("button", { name: "Choose media", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Mist overlay.png", exact: true })
          .click();
        await visual.getByLabel("Opacity (0–1)", { exact: true }).fill("0.6");
        const save = () =>
          page
            .getByRole("button", {
              name: atlas ? "Save location" : "Save map",
              exact: true,
            })
            .first()
            .click();
        failNext = true;
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(location.payload.weather, undefined);
        assert.equal(
          await page
            .getByLabel("Weather condition", { exact: true })
            .inputValue(),
          "Sea fog",
        );
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(location.payload.weather.condition, "Sea fog");
        assert.equal(
          location.payload.audiovisualEffects[0].assetId,
          "uploaded-audio",
        );
        assert.equal(
          location.payload.audiovisualEffects[1].assetId,
          "visual-media",
        );
        assert.equal(JSON.stringify(draft.records[1]), sibling);
        assert.deepEqual(location.payload.mapScene.grid, {
          kind: "square",
          cellSizePixels: 40,
        });
        assert.deepEqual(location.payload.extensions, { private: true });
        await page.reload();
        await page.getByLabel("Weather condition", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByLabel("Weather condition", { exact: true })
            .inputValue(),
          "Sea fog",
        );
        assert.equal(
          await audio.getByLabel("Volume (0–1)", { exact: true }).inputValue(),
          "0.35",
        );
        // Imported owner extensions survive a focused subsequent edit.
        location.payload.weather.privateWeather = { kept: true };
        location.payload.weather.wind.privateWind = { kept: true };
        location.payload.audiovisualEffects[0].privateEffect = { kept: true };
        await page.reload();
        await page
          .getByLabel("Weather condition", { exact: true })
          .fill("Heavy sea fog");
        await audio.getByLabel("Volume (0–1)", { exact: true }).fill("0.45");
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.deepEqual(location.payload.weather.privateWeather, {
          kept: true,
        });
        assert.deepEqual(location.payload.weather.wind.privateWind, {
          kept: true,
        });
        assert.deepEqual(location.payload.audiovisualEffects[0].privateEffect, {
          kept: true,
        });
        await page.reload();
        await page
          .getByRole("button", { name: "Remove weather", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Clear effects configuration",
            exact: true,
          })
          .click();
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(location.payload.weather, undefined);
        assert.equal(location.payload.audiovisualEffects, undefined);
        location.payload.weather = 42;
        location.payload.audiovisualEffects = { legacy: true };
        await page.reload();
        await page
          .getByLabel(atlas ? "Location name" : "Map or scene notes", {
            exact: true,
          })
          .fill(atlas ? "Harbor updated" : "Updated notes");
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.ok(!Object.hasOwn(writes.at(-1), "weather"));
        assert.ok(!Object.hasOwn(writes.at(-1), "audiovisualEffects"));
        assert.equal(location.payload.weather, 42);
        assert.deepEqual(location.payload.audiovisualEffects, { legacy: true });
        await page.reload();
        await page
          .getByRole("button", { name: "Remove weather", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Clear effects configuration",
            exact: true,
          })
          .click();
        await save();
        await page.waitForFunction(
          () => !document.body.innerText.includes("Saving…"),
        );
        assert.equal(writes.at(-1).weather, null);
        assert.equal(writes.at(-1).audiovisualEffects, null);
        assert.equal(location.payload.weather, undefined);
        assert.equal(location.payload.audiovisualEffects, undefined);
        assert.deepEqual(errors, []);
        await page.screenshot({
          path:
            "/tmp/aow-B09-presentation-" +
            width +
            "-" +
            (atlas ? "atlas" : "map") +
            ".png",
          fullPage: true,
        });
        console.log("PASS Location presentation " + width + " atlas=" + atlas);
        await page.close();
      }
  } finally {
    await browser.close();
  }
});
