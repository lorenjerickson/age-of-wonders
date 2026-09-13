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
  const name = `artwork-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ARTWORK_TEST_PORT || 5179);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Artwork authoring test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { DraftRecordEditor } from './WorldAuthoringPages';
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import './index.css';
const noop = () => {};
const draft = await fetch('/fixture-draft').then(r=>r.json());
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Artwork test',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><DraftRecordEditor kind={new URLSearchParams(location.search).get("kind") === "items" ? "items" : "creatures"} sourceId="subject"/></WorldAuthoringProvider>});
const router = createRouter({routeTree:root,history:createMemoryHistory({initialEntries:['/']})});
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
const image = (assetId) => ({
  assetId,
  altText: "Keeper artwork",
  width: 1024,
  height: 1024,
  mimeType: "image/webp",
});
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const scenario of ["creatures", "items", "recovered-creature"]) {
      const kind = scenario === "recovered-creature" ? "creatures" : scenario;
      const page = await browser.newPage({
        viewport: { width: 1400, height: 1100 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      let saves = 0,
        attempts = [],
        failFirst = true;
      const models = {
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
      };
      let draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Artwork test",
        status: "current",
        content: { modelSchemaReleaseIds: ["release"] },
        effectiveModels: models,
        records: [
          {
            resourceType: kind === "items" ? "definitions" : "creatures",
            sourceId: "subject",
            payload:
              kind === "items"
                ? {
                    kind: "item",
                    identity: { id: "subject", name: "Keeper lantern" },
                    components: { category: "tool", quality: "standard" },
                    modelValues: { "aow:item-family": "aow:item-family-tool" },
                    image: image("old-item"),
                  }
                : {
                    name: "Keeper",
                    description: "A blue cloaked guard",
                    attributes: { standard: { will: { score: 60 } } },
                    instanceEmbodimentPolicy: { strategy: "one-per-instance" },
                    images: {
                      portrait: image("old-portrait"),
                      overheadToken: image("old-overhead"),
                    },
                  },
          },
        ],
      };
      if (scenario === "recovered-creature") {
        const original = draft.records[0].payload;
        original.images.paperDollToken = image("old-side");
        draft.records[0] = {
          resourceType: "definitions",
          sourceId: "subject",
          payload: {
            kind: "creature",
            identity: { id: "subject", name: "Elyena Munteanu" },
            components: { art: {}, attributes: {} },
            instanceEmbodimentPolicy: original.instanceEmbodimentPolicy,
            extensions: { "aow:legacy-creature": { payload: original } },
          },
        };
      }
      await page.route("**/fixture-draft", (route) =>
        route.fulfill({ json: draft }),
      );
      await page.route("**/api/media/**", (route) =>
        route.fulfill({
          json: {
            url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='blue'/></svg>",
          },
        }),
      );
      await page.route(
        "**/api/ai/worlds/*/artwork-proposals",
        async (route) => {
          const req = route.request(),
            input = req.postDataJSON();
          attempts.push({ input, key: req.headers()["idempotency-key"] });
          if (failFirst) {
            failFirst = false;
            if (scenario === "recovered-creature")
              return route.fulfill({
                status: 504,
                json: { message: "Image generation timed out" },
              });
            return route.abort("failed");
          }
          return route.fulfill({
            json: {
              image: image(`new-${input.role}`),
              storageRevision: draft.storageRevision,
            },
          });
        },
      );
      await page.route("**/api/worlds/**", async (route) => {
        if (!["PUT", "POST"].includes(route.request().method()))
          return route.fulfill({ json: {} });
        const input = route.request().postDataJSON();
        saves++;
        if (kind === "creatures") {
          assert.deepEqual(
            Object.keys(input.images).sort(),
            ["overheadToken", "paperDollToken"].sort(),
          );
          assert.equal(input.images.overheadToken.assetId, "new-overheadToken");
          const original = draft.records[0].payload;
          draft.records[0] = {
            resourceType: "definitions",
            sourceId: "subject",
            payload: {
              kind: "creature",
              identity: { id: "subject", name: input.name },
              components: {
                attributes: input.attributes,
                art: {
                  images: {
                    ...original.images,
                    ...original.extensions?.["aow:legacy-creature"]?.payload
                      .images,
                    ...input.images,
                  },
                },
              },
              instanceEmbodimentPolicy: input.instanceEmbodimentPolicy,
            },
          };
        } else {
          assert.equal(input.image.assetId, "new-item");
          draft.records[0].payload.image = input.image;
        }
        draft = { ...draft, storageRevision: draft.storageRevision + 1 };
        return route.fulfill({ json: draft });
      });
      await page.goto(`${fixtureUrl}?kind=${kind}`);
      if (scenario === "recovered-creature") {
        await page.waitForFunction(
          () =>
            [
              ...document.querySelectorAll(
                '[aria-label="Creature artwork"] img',
              ),
            ].filter((image) => image.complete && image.naturalWidth > 0)
              .length === 3,
        );
      }
      const label = kind === "creatures" ? "overhead token" : "item image";
      await page
        .getByRole("button", { name: `Regenerate ${label}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      await page
        .getByText(
          scenario === "recovered-creature"
            ? "Artwork generation took too long."
            : "Artwork could not be generated.",
          { exact: false },
        )
        .waitFor();
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Use this image", exact: true })
        .click();
      assert.equal(attempts[0].key, attempts[1].key);
      assert.equal(saves, 0, "Applying a preview must not save automatically");
      if (kind === "creatures") {
        await page
          .getByRole("button", {
            name:
              scenario === "recovered-creature"
                ? "Regenerate side-view token"
                : "Generate side-view token",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Generate preview", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Use this image", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Regenerate portrait", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Generate preview", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Use this image", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Discard / close", exact: true })
          .click();
      }
      await page
        .getByRole("button", {
          name:
            scenario === "creatures"
              ? "Upgrade legacy Creature"
              : "Save changes",
          exact: true,
        })
        .click();
      await page.getByText("Draft record saved.", { exact: true }).waitFor();
      assert.equal(saves, 1);
      if (kind === "creatures")
        assert.equal(
          draft.records[0].payload.components.art.images.portrait.assetId,
          "old-portrait",
        );
      await page.reload();
      await page
        .getByRole("button", { name: `Regenerate ${label}`, exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      "Artwork browser smoke passed: per-view generation, retry keys, preview/apply/discard, legacy Creature upgrade, Item save and reload.",
    );
  } finally {
    await browser.close();
  }
});
