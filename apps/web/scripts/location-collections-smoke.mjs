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
  const name = `location-collections-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.LOCATION_COLLECTIONS_TEST_PORT || 5214);
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
import { LocationCollectionPage, LocationPreservedPlacements } from './LocationCollectionPages';
import {useWorldAuthoring} from './WorldAuthoringShell';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  const pathname = useLocation().pathname;
  const parts=pathname.split('/').map(decodeURIComponent); const {draft}=useWorldAuthoring();
  if(new URLSearchParams(location.search).has('legacy'))return <main className="mx-auto max-w-4xl p-4"><LocationPreservedPlacements location={draft.records.find(r=>r.sourceId==='location')}/></main>;
  return <main className="mx-auto max-w-4xl p-4"><LocationCollectionPage key={pathname} location={draft.records.find(r=>r.sourceId==='location')} collection={parts[6]} entryId={parts[7]}/></main>;
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
// Production pages and routing against disposable authoritative HTTP persistence.
// This checks browser interaction; database/auth integration is checked separately.
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("dialog", (d) => d.accept());
      const location = {
        resourceType: "locations",
        sourceId: "location",
        payload: {
          id: "location",
          name: "Harbor",
          kind: "region",
          placement: { kind: "root" },
          map: { kind: "image" },
          gmDescription: "Private notes",
          description: "A busy harbor",
          profile: {
            summary: "Coastal crossroads",
            tags: ["port"],
            privateProfile: true,
          },
          mapScene: {
            orientation: "scenic",
            notes: "Preserved map notes",
            privateScene: true,
          },
          extensions: { retained: true },
          discoveries: [
            {
              id: "truth/secret",
              kind: "truth",
              statement: "The gate opens at dawn",
              provenance: "Keeper",
              extensions: { retained: true },
            },
            {
              id: "rumor",
              kind: "rumor",
              statement: "There is a second gate",
              relatedTruthClaimId: "truth/secret",
              conflictsWithClaimIds: ["missing"],
              extensions: { retained: true },
            },
          ],
        },
      };
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Location authoring",
        status: "current",
        content: {
          locationIds: ["location"],
          creatureIds: ["creature"],
          itemDefinitionIds: ["item"],
          worldPlacementIds: [],
          retained: true,
        },
        records: [
          location,
          {
            resourceType: "creatures",
            sourceId: "creature",
            payload: {
              identity: { id: "creature", name: "Harbor guard" },
              kind: "creature",
            },
          },
          {
            resourceType: "definitions",
            sourceId: "item",
            payload: {
              kind: "item",
              identity: { id: "item", name: "Lantern" },
              components: {},
            },
          },
        ],
      };
      let failNext = 0;
      let delayNext = false;
      const writes = [];
      await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
      await page.route("**/api/**", async (r) => {
        if (r.request().method() === "GET") return r.fulfill({ json: {} });
        const input = r.request().postDataJSON();
        writes.push(input);
        if (delayNext) {
          delayNext = false;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        if (failNext) {
          const status = failNext;
          failNext = 0;
          return r.fulfill({ status, json: { message: "Failure" } });
        }
        assert.equal(input.expectedStorageRevision, draft.storageRevision);
        if (
          r.request().url().endsWith("/worlds/world/atlas/locations/location")
        ) {
          assert.equal(r.request().method(), "PUT");
          assert.ok(Array.isArray(input.discoveries));
          assert.equal(input.name, "Harbor");
          assert.equal(input.kind, "region");
          assert.equal(input.description, "A busy harbor");
          assert.equal(input.profileSummary, "Coastal crossroads");
          assert.deepEqual(input.profileTags, ["port"]);
          assert.equal(input.parentLocationId, undefined);
          assert.equal(input.mapSceneNotes, undefined);
          assert.equal(input.gmDescription, undefined);
          assert.equal(input.map, undefined);
          const target = draft.records.find(
            (record) =>
              record.resourceType === "locations" &&
              record.sourceId === "location",
          );
          target.payload = {
            ...target.payload,
            discoveries: structuredClone(input.discoveries),
          };
        } else {
          assert.ok(r.request().url().endsWith("/worlds/world/draft"));
          assert.deepEqual(
            input.records.filter(
              (record) => record.resourceType === "locations",
            ),
            draft.records.filter(
              (record) => record.resourceType === "locations",
            ),
            "Location changes require dedicated authoring actions",
          );
          draft.records = structuredClone(input.records);
          draft.content = structuredClone(input.content);
        }
        draft.storageRevision++;
        return r.fulfill({ json: draft });
      });
      const open = async (path) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent("/worlds/world/atlas/locations/location/" + path)}`,
        );
        await page.getByRole("heading", { level: 1 }).waitFor();
      };
      const link = (name) => page.getByRole("link", { name, exact: true });
      const button = (name) => page.getByRole("button", { name, exact: true });
      const field = (name) => page.getByRole("textbox", { name, exact: true });
      const select = (name) =>
        page.getByRole("combobox", { name, exact: true });
      const saved = async () =>
        page.getByText(/saved to the World draft. Return/).waitFor();
      const capture = async (name) => {
        await page.evaluate(() => document.fonts.ready);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        const small = await page
          .locator("main button,main a,main input,main select,main textarea")
          .evaluateAll((nodes) =>
            nodes
              .filter((n) => {
                const r = n.getBoundingClientRect();
                return r.width && r.height && (r.width < 44 || r.height < 44);
              })
              .map((n) => n.outerHTML),
          );
        assert.deepEqual(small, []);
        await page.screenshot({
          path: `/tmp/b04-location-${name}-${width}.png`,
          fullPage: true,
        });
      };
      await open("discoveries");
      assert.equal(await field("Statement").count(), 0);
      await link("Add discovery").click();
      await field("Statement").fill("The lighthouse holds a key");
      await select("Discovery kind").selectOption("belief");
      await field("Source or provenance").fill("Dock worker");
      await select("Add conflicting claim").selectOption("truth/secret");
      await capture("discovery");
      await button("Save discovery").click();
      await saved();
      assert.equal(draft.records[0].payload.discoveries.length, 3);
      assert.equal(draft.records[0].payload.gmDescription, "Private notes");
      await open("discoveries/entry-truth%2Fsecret");
      assert.equal(
        await field("Statement").inputValue(),
        "The gate opens at dawn",
      );
      await field("Statement").fill("The gate opens at dusk");
      failNext = 500;
      await button("Save discovery").click();
      await page
        .getByText(
          "Changes could not be saved. Your edits remain here; try again.",
        )
        .waitFor();
      assert.equal(
        await field("Statement").inputValue(),
        "The gate opens at dusk",
      );
      await button("Save discovery").click();
      await saved();
      assert.equal(
        draft.records[0].payload.discoveries[0].provenance,
        "Keeper",
      );
      assert.deepEqual(draft.records[0].payload.discoveries[0].extensions, {
        retained: true,
      });
      await open("discoveries/entry-rumor");
      assert.equal(await select("Related truth").inputValue(), "truth/secret");
      await page.getByText("Unavailable claim", { exact: true }).waitFor();
      await field("Statement").fill("A third gate");
      failNext = 409;
      await button("Save discovery").click();
      await page
        .getByText(
          "This draft changed elsewhere. Your edits remain here; reload before saving again.",
        )
        .waitFor();
      assert.equal(
        draft.records[0].payload.discoveries[1].statement,
        "There is a second gate",
      );
      for (const [collection, label, id] of [
        ["creatures", "Creature", "creature"],
        ["items", "Item", "item"],
      ]) {
        await open(collection);
        await link("Add placement").click();
        await field("Placement name").fill(`${label} by gate`);
        await select(label).selectOption(id);
        await page
          .getByRole("spinbutton", { name: "Horizontal map position" })
          .fill("0.2");
        await page
          .getByText(
            "Enter both coordinates between 0 and 1, or leave both blank.",
          )
          .waitFor();
        assert.equal(await button("Save placement").isDisabled(), true);
        await page
          .getByRole("spinbutton", { name: "Vertical map position" })
          .fill("0.6");
        await field("Presentation notes").fill("Visible at dusk");
        await capture(collection);
        delayNext = true;
        await button("Save placement").click();
        assert.equal(await field("Placement name").isDisabled(), true);
        await saved();
        const placement = draft.records.find(
          (r) =>
            r.resourceType === "world-placements" &&
            r.payload.name === `${label} by gate`,
        );
        assert.deepEqual(placement.payload.mapPosition, {
          kind: "normalized-map",
          x: 0.2,
          y: 0.6,
        });
        placement.sourceRevision = 7;
        placement.payload.extensions = { retained: true };
        const actualId = placement.payload.id;
        placement.payload.id = "wrong-id";
        await open(
          `${collection}/${encodeURIComponent("entry-" + placement.sourceId)}`,
        );
        await page
          .getByText(/This placement is unavailable, ambiguous/)
          .waitFor();
        assert.equal(await button("Save placement").count(), 0);
        placement.payload.id = actualId;
        await open(
          `${collection}/${encodeURIComponent("entry-" + placement.sourceId)}`,
        );
        assert.equal(
          await field("Presentation notes").inputValue(),
          "Visible at dusk",
        );
        await field("Placement name").fill(`${label} at tower`);
        await button("Save placement").click();
        await saved();
        const retainedPlacement = draft.records.find(
          (r) => r.sourceId === placement.sourceId,
        );
        assert.equal(retainedPlacement.sourceRevision, 7);
        assert.deepEqual(retainedPlacement.payload.extensions, {
          retained: true,
        });
        await open(collection);
        await button("Remove placement").click();
        await page
          .getByText(`No ${collection} authored at this Location.`)
          .waitFor();
        assert.ok(draft.records.some((r) => r.sourceId === id));
      }
      await open("discoveries");
      await capture("list");
      const count = writes.length;
      await link("Add discovery").click();
      await field("Statement").fill("Unsaved");
      await link("Cancel").click();
      assert.equal(writes.length, count);
      const claimsBeforeRemoval = draft.records[0].payload.discoveries.length;
      await button("Remove discovery").last().click();
      await page.waitForFunction(
        (count) => document.querySelectorAll("article").length === count,
        claimsBeforeRemoval - 1,
      );
      assert.equal(
        draft.records[0].payload.discoveries.length,
        claimsBeforeRemoval - 1,
      );
      assert.deepEqual(draft.records[0].payload.profile, {
        summary: "Coastal crossroads",
        tags: ["port"],
        privateProfile: true,
      });
      assert.deepEqual(draft.records[0].payload.mapScene, {
        orientation: "scenic",
        notes: "Preserved map notes",
        privateScene: true,
      });
      const opaque = "12345678-1234-1234-1234-123456789abc";
      const opaqueClaim = {
        id: "opaque",
        kind: "belief",
        statement: opaque,
        provenance: opaque,
        conflictsWithClaimIds: ["truth/secret"],
        extensions: { retained: true },
      };
      draft.records[0].payload.discoveries.push(opaqueClaim);
      await open("discoveries/entry-opaque");
      await page.getByText("Existing statement preserved.").waitFor();
      assert.ok(!(await page.locator("body").innerText()).includes(opaque));
      await select("Discovery kind").selectOption("rumor");
      await button("Save discovery").click();
      await saved();
      assert.equal(
        draft.records[0].payload.discoveries.at(-1).statement,
        opaque,
      );
      await open("discoveries/entry-opaque");
      await button("Replace statement").click();
      await field("Statement").fill("A named discovery");
      await button("Save discovery").click();
      await saved();
      assert.equal(
        draft.records[0].payload.discoveries.at(-1).provenance,
        opaque,
      );
      const preserved = structuredClone(draft.records[0].payload.discoveries);
      draft.records[0].payload.discoveries = { imported: true };
      await open("discoveries");
      await page
        .getByText(
          "This imported collection cannot be safely edited. Its content is preserved.",
        )
        .waitFor();
      assert.equal(await link("Add discovery").count(), 0);
      draft.records[0].payload.discoveries = [preserved[0], preserved[0]];
      await open("discoveries/entry-truth%2Fsecret");
      await page
        .getByText(/This discovery is unavailable, ambiguous/)
        .waitFor();
      assert.equal(await button("Save discovery").count(), 0);
      draft.records[0].payload.discoveries = preserved;
      await page.goto(
        `${fixtureUrl}?readonly=1&route=${encodeURIComponent("/worlds/world/atlas/locations/location/discoveries/entry-rumor")}`,
      );
      await field("Statement").waitFor();
      assert.equal(await field("Statement").isDisabled(), true);
      assert.equal(await button("Save discovery").isDisabled(), true);
      draft.records.push({
        resourceType: "world-placements",
        sourceId: "legacy-placement",
        sourceRevision: 3,
        payload: {
          id: "legacy-placement",
          locationId: "location",
          name: opaque,
          source: { kind: "registered-content", definitionId: "item" },
        },
      });
      draft.content.worldPlacementDefinitionIds = ["legacy-placement"];
      await page.goto(
        `${fixtureUrl}?legacy=1&route=${encodeURIComponent("/worlds/world/atlas/locations/location/creatures")}`,
      );
      await page
        .getByRole("heading", { name: "Preserved placements" })
        .waitFor();
      assert.ok(!(await page.locator("body").innerText()).includes(opaque));
      await button("Remove placement").click();
      await page
        .getByRole("heading", { name: "Preserved placements" })
        .waitFor({ state: "detached" });
      assert.ok(draft.records.some((r) => r.sourceId === "item"));
      assert.ok(!draft.records.some((r) => r.sourceId === "legacy-placement"));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Location collections passed at ${width}px`);
    }
  } finally {
    await browser.close();
  }
});
