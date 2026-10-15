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
  const name = `item-mechanics-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_MECHANICS_TEST_PORT || 5196);
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
import { ItemMechanicsPage } from './ItemMechanicsPage';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  const parts = useLocation().pathname.split('/');
  return <ItemMechanicsPage itemId={parts[5] || 'subject'} path={parts.slice(6).join('/') || 'traits'}/>;
}
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Mechanics test',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
const catchAll = createRoute({getParentRoute:()=>root,path:'$'});
const route = new URLSearchParams(location.search).get('route') || 'subject/traits';
const router = createRouter({routeTree:root.addChildren([catchAll]),history:createMemoryHistory({initialEntries:['/worlds/world/item-compendium/items/'+route]})});
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

// Boundary: real React controls/provider/router/API client; an authoritative in-memory
// HTTP fixture replaces the API/database. Persistence claims stop at this boundary.
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(10_000);
      const errors = [],
        writes = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      let failNext = 0;
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Mechanics fixture",
        status: "current",
        content: {},
        records: ["subject", "other"].map((id, index) => ({
          resourceType: "definitions",
          sourceId: id,
          payload: {
            kind: "item",
            identity: {
              id,
              name: index ? "Spare cart" : "Keeper",
              description: "Original",
            },
            components: {
              category: "tool",
              private: { notes: "Keep private" },
              customRule: { enabled: true },
            },
            extensions: { "test:retained": { value: 7 } },
            modelValues: { "aow:item-family": "aow:item-family-tool" },
            image: {
              assetId: "image",
              altText: "Keeper",
              width: 1024,
              height: 1024,
              mimeType: "image/webp",
            },
          },
        })),
      };
      const untouched = structuredClone(draft.records[1]);
      const original = structuredClone(draft.records[0].payload);
      const subject = () => draft.records[0].payload.components;
      await page.route("**/fixture-draft", (route) =>
        route.fulfill({ json: draft }),
      );
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") return route.fulfill({ json: {} });
        assert.equal(request.method(), "PUT");
        assert.ok(
          request.url().endsWith("/worlds/world/item-compendium/items/subject"),
        );
        const input = request.postDataJSON();
        writes.push(input);
        if (failNext) {
          const status = failNext;
          failNext = 0;
          return route.fulfill({
            status,
            json: { message: "Fixture save failure" },
          });
        }
        assert.equal(input.expectedStorageRevision, draft.storageRevision);
        // Simulate the narrow mutation boundary, preserving untouched payload fields.
        for (const key of ["traits", "actions", "vehicle"]) {
          if (Object.hasOwn(input, key)) {
            if (input[key] === null) delete subject()[key];
            else subject()[key] = structuredClone(input[key]);
          }
        }
        draft.storageRevision += 1;
        return route.fulfill({ json: draft });
      });
      const open = async (route) => {
        await page.goto(`${fixtureUrl}?route=${encodeURIComponent(route)}`);
        await page
          .getByRole("navigation", { name: "Item mechanics" })
          .waitFor();
      };
      const link = (name) => page.getByRole("link", { name, exact: true });
      const button = (name) => page.getByRole("button", { name, exact: true });
      const input = (name) => page.getByRole("textbox", { name, exact: true });
      const number = (name) =>
        page.getByRole("spinbutton", { name, exact: true });
      const save = async (name) => {
        await button(`Save ${name}`).click();
        await link(`Add ${name}`).waitFor();
      };
      await open("subject/traits");
      await link("Add Trait").click();
      await input("Name").fill("Quiet wheels");
      await input("Description").fill("Moves quietly");
      await save("Trait");
      await link("Quiet wheels").click();
      assert.equal(await input("Description").inputValue(), "Moves quietly");
      await input("Name").fill("Silent wheels");
      await save("Trait");
      const traitId = subject().traits[0].identity.id;
      // Simulate retained imported content before reopening authoritative fixture data.
      subject().traits[0].extensions = { "test:nested": { preserved: true } };
      subject().traits[0].components.modifiers = [{ custom: "retained" }];
      await open(`subject/traits/${traitId}`);
      await input("Description").fill("Improved wheels");
      await save("Trait");
      assert.deepEqual(subject().traits[0].extensions, {
        "test:nested": { preserved: true },
      });
      assert.deepEqual(subject().traits[0].components.modifiers, [
        { custom: "retained" },
      ]);
      await link("Silent wheels").click();
      await link("Manage Trait Actions").click();
      await link("Add Action").click();
      await input("Name").fill("Muffle");
      await save("Action");
      assert.equal(
        subject().traits[0].components.actions[0].identity.name,
        "Muffle",
      );
      await link("Actions").click();
      await link("Add Action").click();
      await input("Name").fill("Tow");
      await button("Add target").click();
      await page
        .getByRole("combobox", { name: "Range", exact: true })
        .selectOption("distance");
      await number("Range distance").fill("15");
      await save("Action");
      assert.equal(subject().actions[0].components.targets[0].range.value, 15);
      const actionId = subject().actions[0].identity.id;
      await open(`subject/actions/${actionId}`);
      assert.equal(await input("Name").inputValue(), "Tow");
      const beforeCancel = writes.length;
      await input("Name").fill("Discard this");
      await button("Cancel").click();
      await link("Tow").waitFor();
      assert.equal(writes.length, beforeCancel);
      await link("Vehicle").click();
      await input("Vehicle type").fill("land");
      await input("Size").fill("large");
      await number("Armor class").fill("12");
      await number("Hit points").fill("40");
      await button("Add movement speed").click();
      await input("Movement name").fill("rolling");
      await number("Speed distance").fill("30");
      await button("Add cargo capacity").click();
      await number("Cargo weight").fill("100");
      await button("Add component item").click();
      await page
        .getByRole("combobox", { name: "Component item 1", exact: true })
        .selectOption("other");
      const vehicleLayout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll("input, select, button, nav a")]
          .filter((element) => element.getBoundingClientRect().height > 0)
          .map((element) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
      }));
      assert.ok(
        vehicleLayout.scroll <= width + 1,
        JSON.stringify(vehicleLayout),
      );
      assert.ok(
        vehicleLayout.controls.every(
          (box) => box.width >= 44 && box.height >= 44,
        ),
        JSON.stringify(vehicleLayout.controls),
      );
      await page.screenshot({
        path: `/tmp/aow-item-vehicle-${width}.png`,
        fullPage: true,
      });
      await button("Save Vehicle").click();
      await link("Add Trait").waitFor();
      assert.equal(subject().vehicle.speeds.rolling.value, 30);
      await open("subject/vehicle");
      assert.equal(await number("Hit points").inputValue(), "40");
      await link("Manage Vehicle Actions").click();
      await link("Add Action").click();
      await input("Name").fill("Accelerate");
      await save("Action");
      assert.equal(subject().vehicle.actions[0].identity.name, "Accelerate");
      await open(`subject/traits/${traitId}`);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Trait").click();
      await link("Add Trait").waitFor();
      assert.equal(subject().traits.length, 0);
      assert.equal(subject().actions[0].identity.name, "Tow");
      await link("Add Trait").click();
      await input("Name").fill("Keep on failure");
      failNext = 500;
      await button("Save Trait").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await input("Name").inputValue(), "Keep on failure");
      assert.equal(await button("Save Trait").isEnabled(), true);
      failNext = 409;
      await button("Save Trait").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await input("Name").inputValue(), "Keep on failure");
      assert.equal(await button("Save Trait").isDisabled(), true);
      assert.deepEqual(draft.records[1], untouched);
      assert.deepEqual(
        draft.records[0].payload.extensions,
        original.extensions,
      );
      assert.deepEqual(subject().private, original.components.private);
      assert.deepEqual(subject().customRule, original.components.customRule);
      assert.deepEqual(draft.records[0].payload.image, original.image);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(overflow.scroll <= width + 1, JSON.stringify(overflow));
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `/tmp/aow-item-mechanics-${width}.png`,
        fullPage: true,
      });
      assert.equal(await button("Cancel").isEnabled(), true);
      const beforeConflictCancel = writes.length;
      await button("Cancel").click();
      await link("Add Trait").waitFor();
      assert.equal(writes.length, beforeConflictCancel);
      await page.close();
      console.log(
        `PASS Item mechanics ${width}px: Trait/Action/Vehicle create, save/read-back/reopen, nested Actions, confirmed removal, cancel, failed/conflicting saves, untouched data and second Item preserved; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
