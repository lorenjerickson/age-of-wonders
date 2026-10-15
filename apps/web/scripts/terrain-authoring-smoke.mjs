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
  process.env.TERRAIN_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-terrain-authoring.png");
async function withFixture(run) {
  const name = `terrain-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.TERRAIN_TEST_PORT || 5176);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Terrain authoring test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { WorldMapPage } from './WorldMapPage';
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import './index.css';
const noop = () => {};
const draft = await fetch('/fixture-draft').then(r=>r.json());
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Terrain test',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><WorldMapPage locationId="root" inlineTools/></WorldAuthoringProvider>});
const router = createRouter({routeTree:root,history:createMemoryHistory({initialEntries:['/']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; import { reactPluginOptions } from './react-plugin-options'; export default defineConfig({plugins:[react(reactPluginOptions),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,watch:null}});`,
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
import { createHash } from "node:crypto";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
let draft = {
  id: "draft",
  storageRevision: 1,
  revisionName: "Terrain test",
  validationStatus: "not-validated",
  content: {},
  records: [
    {
      resourceType: "locations",
      sourceId: "root",
      payload: {
        identity: {
          id: "root",
          version: { revision: 1, updatedAt: "2026-09-11" },
        },
        name: "Valley",
        kind: "site",
        profile: { tags: [] },
        placement: { kind: "root" },
      },
    },
  ],
};
const chunks = new Map();
const receipts = new Set();
let abortFirstSave = true,
  appliedSaves = 0;
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1300 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
  await page.route("**/api/worlds/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() === "POST" && url.pathname.endsWith("/chunks")) {
      const chunk = req.postDataJSON().chunk;
      const hash = createHash("sha256")
        .update(JSON.stringify(canonical(chunk)))
        .digest("hex");
      chunks.set(hash, chunk);
      return route.fulfill({
        json: { contentHash: hash, address: chunk.address },
      });
    }
    if (req.method() === "GET" && url.pathname.includes("/chunks/"))
      return route.fulfill({
        json: chunks.get(url.pathname.split("/").at(-1)),
      });
    if (req.method() === "GET" && url.pathname.endsWith("/map"))
      return route.fulfill({
        json: {
          ...draft.records[0].payload.map,
          kind: "isometric-terrain",
          chunks: draft.records[0].payload.map.chunks.map((r) =>
            chunks.get(r.contentHash),
          ),
        },
      });
    if (req.method() === "PUT" && url.pathname.endsWith("/map")) {
      const reqData = req.postDataJSON();
      if (receipts.has(reqData.operationId))
        return route.fulfill({ json: draft });
      if (reqData.expectedStorageRevision !== draft.storageRevision)
        return route.fulfill({ status: 409, json: { message: "Stale" } });
      draft = canonical({
        ...draft,
        storageRevision: draft.storageRevision + 1,
        records: [
          {
            ...draft.records[0],
            payload: { ...draft.records[0].payload, map: reqData.map },
          },
        ],
      });
      receipts.add(reqData.operationId);
      appliedSaves++;
      if (abortFirstSave) {
        abortFirstSave = false;
        return route.abort("failed");
      }
      return route.fulfill({ json: draft });
    }
    return route.fulfill({
      status: 404,
      json: { message: "unexpected request" },
    });
  });
  page.setDefaultTimeout(15000);
  try {
    await page.goto(fixtureUrl);
    if (
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .count()
    )
      throw new Error("Terrain options appeared for an image orientation");
    await page
      .getByLabel("Map orientation", { exact: true })
      .selectOption("isometric");
    await page
      .getByText("0 cells · Unsaved terrain", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .waitFor();
    await page.locator("canvas").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("canvas").scrollIntoViewIfNeeded();
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.click(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    await page
      .getByText("1 cells · Unsaved terrain", { exact: false })
      .waitFor();
    await page.mouse.move(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    await page.mouse.down({ button: "right" });
    await page.mouse.move(
      canvas.x + canvas.width / 2 + 100,
      canvas.y + canvas.height / 2 + 30,
      { steps: 6 },
    );
    await page.mouse.up({ button: "right" });
    await page
      .getByText("1 cells · Unsaved terrain", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Select all cells", exact: true })
      .click();
    await page
      .getByLabel("Terrain type", { exact: true })
      .selectOption("terrain:rock");
    await page
      .getByRole("button", { name: "Change selected terrain", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove selected cells", exact: true })
      .click();
    await page
      .getByText("0 cells · Unsaved terrain", { exact: false })
      .waitFor();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .getByText("1 cells · Unsaved terrain", { exact: false })
      .waitFor();
    await page
      .getByLabel("Initial opening state", { exact: true })
      .selectOption("locked");
    await page
      .getByRole("button", { name: "Apply opening to selection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove selected openings", exact: true })
      .click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .getByLabel("Opening type", { exact: true })
      .selectOption("window");
    if (
      (await page
        .getByLabel("Initial opening state", { exact: true })
        .inputValue()) !== "closed"
    )
      throw new Error("Window retained locked state");
    await page.getByLabel("Opening facing", { exact: true }).selectOption("1");
    await page
      .getByRole("button", { name: "Apply opening to selection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await page.locator("canvas").scrollIntoViewIfNeeded();
    // Reset orbit so both vertical test planes have a well-conditioned camera angle.
    const viewport = page.locator('[aria-label^="Isometric terrain editor"]');
    await viewport.focus();
    await page.keyboard.press("0");
    for (const [plane, offset] of [
      ["xz", 0],
      ["yz", -60],
    ]) {
      await page.getByLabel("Work plane", { exact: true }).selectOption(plane);
      await page.getByLabel(/Work level/).fill(plane === "xz" ? "18" : "20");
      await page.getByLabel("Tool", { exact: true }).selectOption("place");
      await page.locator("canvas").scrollIntoViewIfNeeded();
      let bounds = await page.locator("canvas").boundingBox();
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2 + offset,
      );
      await page
        .getByText(`${plane === "xz" ? 2 : 3} cells · Unsaved terrain`, {
          exact: false,
        })
        .waitFor();
      await page.getByLabel("Tool", { exact: true }).selectOption("select");
      await page.locator("canvas").scrollIntoViewIfNeeded();
      bounds = await page.locator("canvas").boundingBox();
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2 + offset,
      );
      await page
        .getByLabel("Surface smoothing", { exact: true })
        .selectOption("0.5");
      await page
        .getByRole("button", { name: "Smooth selected terrain", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await page.getByLabel("Work plane", { exact: true }).selectOption("xy");
    await page.getByLabel(/Work level/).fill("0");
    // A synchronous worker startup failure must release the busy controls.
    await page.evaluate(() => {
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          window.Worker = OriginalWorker;
          throw new Error("Fixture worker startup failure");
        }
      };
    });
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.getByText("Terrain generation could not start. Your map is unchanged. Try generating again.", { exact: true }).waitFor();
    await page.getByText("3 cells · Unsaved terrain", { exact: false }).waitFor();
    // Hold a real worker result long enough to exercise cancellation reliably.
    await page.evaluate(() => {
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(...args) { super(...args); window.Worker = OriginalWorker; }
        postMessage(message) { setTimeout(() => super.postMessage(message), 1000); }
      };
    });
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.getByRole("button", { name: "Cancel generation", exact: true }).click();
    await page.getByText("3 cells · Unsaved terrain", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Hide beyond work plane", exact: true }).click();
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.getByRole("button", { name: "Apply terrain", exact: true }).waitFor({ state: "visible", timeout: 60000 });
    await page.getByText("Terrain textures ready", { exact: true }).waitFor();
    await page.locator("canvas").scrollIntoViewIfNeeded();
    // Assert the generated rock surface fills the view, not only an empty work plane.
    // Decode a browser screenshot because WebGL does not preserve its drawing buffer.
    const previewPixels = (await page.locator("canvas").screenshot()).toString("base64");
    const visibleTerrainRatio = await page.evaluate(async (encoded) => {
      const picture = new Image();
      picture.src = `data:image/png;base64,${encoded}`;
      await picture.decode();
      const sample = document.createElement("canvas");
      sample.width = picture.width;
      sample.height = picture.height;
      const context = sample.getContext("2d");
      context.drawImage(picture, 0, 0);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let rockPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        // Warm rock differs from the blue-gray viewport background/grid.
        if (pixels[index] > pixels[index + 2] + 5 && pixels[index] > pixels[index + 1]) rockPixels++;
      }
      return rockPixels / (pixels.length / 4);
    }, previewPixels);
    if (visibleTerrainRatio < 0.3) throw new Error(`Generated preview is blank or clipped: terrain coverage ${visibleTerrainRatio}`);
    await page.screenshot({ path: "/tmp/aow-terrain-preview.png", fullPage: true });
    if (appliedSaves !== 0 || chunks.size !== 0) throw new Error("Generating preview wrote live terrain");
    await page.getByRole("button", { name: "Discard preview", exact: true }).click();
    await page.getByText("3 cells · Unsaved terrain", { exact: false }).waitFor();
    if (await page.getByRole("button", { name: "Show all levels", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Discard changed base slice preference");
    if (appliedSaves !== 0 || chunks.size !== 0) throw new Error("Discarding preview wrote live terrain");
    await page.getByRole("button", { name: "Show all levels", exact: true }).click();
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await page.getByRole("button", { name: "Apply terrain", exact: true }).waitFor({ state: "visible", timeout: 60000 });
    await page
      .getByRole("button", { name: "Apply terrain", exact: true })
      .click();
    await page.getByRole("button", { name: "Save Map", exact: true }).click();
    await page
      .getByText(
        "The terrain could not be saved. Your edits are retained; retry Save Map.",
        { exact: true },
      )
      .waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Save Map", exact: true }).click();
    await page
      .getByText("Terrain map saved to this Location.", { exact: true })
      .waitFor({ timeout: 60000 });
    const count = chunks.size;
    const smoothed = [...chunks.values()]
      .flatMap((chunk) => chunk.cells)
      .filter((cell) => cell.smoothing === 0.5);
    if (smoothed.length !== 2)
      throw new Error(
        `Expected two smoothed vertical-plane cells, got ${smoothed.length}`,
      );
    const openings = [...chunks.values()]
      .flatMap((chunk) => chunk.cells)
      .filter((cell) => cell.opening);
    if (
      openings.length !== 1 ||
      openings[0].opening.kind !== "window" ||
      openings[0].opening.state !== "closed" ||
      openings[0].opening.facing !== 1
    )
      throw new Error("Authored opening did not survive save");
    await page.reload();
    await page
      .getByText("Saved terrain", { exact: false })
      .waitFor({ timeout: 60000 });
    await page.locator("canvas").waitFor();
    await page.getByText("Terrain textures ready", { exact: true }).waitFor();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (
      (await page
        .getByLabel("Map orientation", { exact: true })
        .inputValue()) !== "isometric"
    )
      throw new Error("Saved orientation was not restored");
    await page
      .getByLabel("Map orientation", { exact: true })
      .selectOption("overhead");
    await page
      .getByRole("button", { name: "Pick image", exact: true })
      .waitFor();
    if (
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .count()
    )
      throw new Error("Terrain controls remained in image mode");
    if (appliedSaves !== 1) throw new Error("Save applied more than once");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        passed: true,
        uploadedChunks: count,
        previewTerrainCoverage: visibleTerrainRatio,
        revision: draft.storageRevision,
        screenshot: screenshotPath,
      }),
    );
  } catch (error) {
    console.log("Page errors", errors);
    console.log(
      "Page text",
      (await page.locator("body").innerText()).slice(0, 3000),
    );
    await page.screenshot({ path: screenshotPath });
    throw error;
  } finally {
    await browser.close();
  }
});
