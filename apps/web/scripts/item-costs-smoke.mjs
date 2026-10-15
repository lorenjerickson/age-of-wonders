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
  const name = `item-costs-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_COSTS_TEST_PORT || 5198);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Action costs test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
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

// Real React controls/provider/router/API client with authoritative in-memory HTTP
// persistence. This verifies authoring interactions, not database/auth integration.
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(10000);
      const errors = [],
        writes = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      let failNext = 0,
        holdNext,
        releaseSave;
      const makeAction = (id, name) => ({
        kind: "action",
        identity: { id, name, private: { notes: "Private action" } },
        components: {
          activation: "action",
          costs: [
            {
              kind: "economy",
              activation: "action",
              retained: { private: true },
            },
            {
              kind: "custom",
              key: "test:custom",
              payload: { secret: "retained" },
            },
            {
              kind: "resource",
              cost: {
                resource: "stamina",
                amount: { kind: "path", path: "actor.level" },
                minimumRemaining: 1,
              },
              extension: { retained: true },
            },
          ],
          outcomes: [
            {
              id: `${id}-outcome`,
              when: { kind: "custom", rule: "predicate-internal" },
              effects: [
                {
                  kind: "narrative",
                  text: "Existing narration",
                  visibility: "gm",
                  extension: { retained: true },
                },
                {
                  kind: "custom",
                  rule: "effect-internal",
                  payload: { secret: "retained" },
                },
              ],
            },
          ],
        },
        extensions: { "test:action": { retained: true } },
      });
      const direct = makeAction("direct", "Tow");
      const nested = makeAction("nested", "Muffle");
      const opaqueResource = "c1822e01-131d-4393-848f-86f2d9c2d34e";
      nested.components.costs.push(
        { kind: "item-use", item: "other", retained: true },
        {
          kind: "resource",
          cost: {
            resource: opaqueResource,
            amount: { kind: "constant", value: 1 },
          },
        },
      );
      const vehicle = makeAction("vehicle-action", "Accelerate");
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Costs fixture",
        status: "current",
        content: {},
        records: [
          {
            resourceType: "definitions",
            sourceId: "subject",
            payload: {
              kind: "item",
              modelValues: { "aow:item-family": "aow:item-family-tool" },
              identity: { id: "subject", name: "Keeper" },
              components: {
                category: "tool",
                private: { notes: "Private item" },
                actions: [direct, makeAction("sibling", "Sibling Action")],
                traits: [
                  {
                    kind: "trait",
                    identity: { id: "trait", name: "Quiet wheels" },
                    components: {
                      actions: [nested],
                      modifiers: [{ opaque: true }],
                    },
                  },
                ],
                vehicle: {
                  vehicleType: "land",
                  size: "large",
                  armorClass: 12,
                  hitPoints: 40,
                  speeds: {},
                  actions: [vehicle],
                },
              },
              extensions: { "test:item": { retained: true } },
            },
          },
          {
            resourceType: "definitions",
            sourceId: "other",
            payload: {
              kind: "item",
              modelValues: { "aow:item-family": "aow:item-family-tool" },
              identity: { id: "other", name: "Spare cart" },
              components: { category: "tool" },
            },
          },
        ],
      };
      const original = structuredClone(draft);
      const components = () => draft.records[0].payload.components;
      const action = () => components().actions[0];
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
        if (holdNext) {
          const hold = holdNext;
          holdNext = undefined;
          await hold;
        }
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
        for (const key of ["traits", "actions", "vehicle"])
          if (Object.hasOwn(input, key))
            components()[key] = structuredClone(input[key]);
        draft.storageRevision += 1;
        return route.fulfill({ json: draft });
      });
      const link = (name) => page.getByRole("link", { name, exact: true });
      const button = (name) => page.getByRole("button", { name, exact: true });
      const text = (name) => page.getByRole("textbox", { name, exact: true });
      const number = (name) =>
        page.getByRole("spinbutton", { name, exact: true });
      const select = (name) =>
        page.getByRole("combobox", { name, exact: true });
      const open = async (route) => {
        await page.goto(`${fixtureUrl}?route=${encodeURIComponent(route)}`);
        await page.getByRole("heading").first().waitFor();
      };
      const root = "subject/actions/direct/costs";
      await open("subject/actions/direct");
      await link("Manage Costs").click();
      await link("Cost 1 · economy").click();
      await select("Activation").selectOption("bonus-action");
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Cost").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add Cost").waitFor();
      assert.equal(action().components.costs[0].activation, "bonus-action");
      assert.equal(Object.hasOwn(action().components.costs[0], "count"), false);
      assert.deepEqual(action().components.costs[0].retained, {
        private: true,
      });
      await open(`${root}/1`);
      assert.equal(await button("Save Cost").count(), 0);
      await open(`${root}/2`);
      await text("Resource binding").fill("focus");
      await button("Save Cost").click();
      await link("Add Cost").waitFor();
      assert.deepEqual(
        action().components.costs[2].cost.amount,
        direct.components.costs[2].cost.amount,
      );
      for (const kind of [
        "economy",
        "resource",
        "capacity",
        "item-use",
        "hit-die",
        "movement",
      ]) {
        await open(root);
        await link("Add Cost").click();
        await select("Cost kind").selectOption(kind);
        if (kind === "resource") await text("Resource binding").fill("stamina");
        if (kind === "item-use") await text("Item binding").fill("self");
        if (kind === "hit-die") {
          await number("Amount").fill("");
          await number("Amount").fill("2");
          await page.screenshot({
            path: `/tmp/aow-item-costs-form-${width}.png`,
            fullPage: true,
          });
        }
        await button("Save Cost").click();
        await link("Add Cost").waitFor();
      }
      assert.deepEqual(
        action()
          .components.costs.slice(3)
          .map((c) => c.kind),
        ["economy", "resource", "capacity", "item-use", "hit-die", "movement"],
      );
      await button("Move cost 9 up").click();
      await link("Cost 8 · movement").waitFor();
      await button("Move cost 8 up").click();
      await link("Cost 7 · movement").waitFor();
      assert.deepEqual(
        action()
          .components.costs.slice(6)
          .map((c) => c.kind),
        ["movement", "item-use", "hit-die"],
      );
      await open(`${root}/8`);
      assert.equal(await number("Amount").inputValue(), "2");
      const beforeCancel = writes.length;
      await number("Amount").fill("9");
      await button("Cancel").click();
      await link("Add Cost").waitFor();
      assert.equal(writes.length, beforeCancel);
      await open(`${root}/8`);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Cost").click();
      await link("Add Cost").waitFor();
      assert.equal(action().components.costs.length, 8);
      for (const owner of [
        "traits/trait/actions/nested",
        "vehicle/actions/vehicle-action",
      ]) {
        await open(`subject/${owner}/costs/0`);
        await select("Activation").selectOption("reaction");
        await button("Save Cost").click();
        await link("Add Cost").waitFor();
      }
      assert.equal(
        components().traits[0].components.actions[0].components.costs[0]
          .activation,
        "reaction",
      );
      assert.equal(
        components().vehicle.actions[0].components.costs[0].activation,
        "reaction",
      );
      for (const [index, binding, originalBinding, replacement] of [
        [3, "item", "other", "held-item"],
        [4, "resource", opaqueResource, "focus-pool"],
      ]) {
        const opaquePath = `subject/traits/trait/actions/nested/costs/${index}`;
        await open(opaquePath);
        assert.equal(
          await text(
            `${binding === "item" ? "Item" : "Resource"} binding`,
          ).count(),
          0,
        );
        assert.equal(
          await page
            .locator("input")
            .evaluateAll(
              (inputs, secret) =>
                inputs.some((input) => input.value === secret),
              originalBinding,
            ),
          false,
        );
        assert.equal(
          (await page.locator("body").innerText()).includes(opaqueResource),
          false,
        );
        await button("Save Cost").click();
        await link("Add Cost").waitFor();
        const saved =
          components().traits[0].components.actions[0].components.costs[index];
        assert.equal(
          binding === "item" ? saved.item : saved.cost.resource,
          originalBinding,
        );
        await open(opaquePath);
        page.once("dialog", (dialog) => dialog.dismiss());
        await button(`Replace ${binding} binding`).click();
        assert.equal(
          await text(
            `${binding === "item" ? "Item" : "Resource"} binding`,
          ).count(),
          0,
        );
        page.once("dialog", (dialog) => dialog.accept());
        await button(`Replace ${binding} binding`).click();
        await text(`${binding === "item" ? "Item" : "Resource"} binding`).fill(
          replacement,
        );
        await button("Save Cost").click();
        await link("Add Cost").waitFor();
        const updated =
          components().traits[0].components.actions[0].components.costs[index];
        assert.equal(
          binding === "item" ? updated.item : updated.cost.resource,
          replacement,
        );
      }
      await open(`${root}/0`);
      await number("Count").fill("3");
      failNext = 500;
      await button("Save Cost").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Count").inputValue(), "3");
      assert.equal(await button("Save Cost").isEnabled(), true);
      failNext = 409;
      await button("Save Cost").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Count").inputValue(), "3");
      assert.equal(await button("Save Cost").isDisabled(), true);
      assert.deepEqual(draft.records[1], original.records[1]);
      assert.deepEqual(
        components().actions[1],
        original.records[0].payload.components.actions[1],
      );
      assert.deepEqual(
        components().private,
        original.records[0].payload.components.private,
      );
      assert.deepEqual(action().identity.private, direct.identity.private);
      assert.deepEqual(
        action().components.outcomes,
        direct.components.outcomes,
      );
      assert.deepEqual(
        action().components.costs[1],
        direct.components.costs[1],
      );
      assert.deepEqual(action().extensions, direct.extensions);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        controls: [
          ...document.querySelectorAll("input, select, textarea, button"),
        ]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => ({
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
      }));
      assert.ok(layout.scroll <= width + 1, JSON.stringify(layout));
      assert.ok(
        layout.controls.every((box) => box.width >= 44 && box.height >= 44),
        JSON.stringify(layout),
      );
      await page.screenshot({
        path: `/tmp/aow-item-costs-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Item costs ${width}px: direct/Trait/Vehicle editing, save/read-back/reopen, supported cost kinds, preservation, cancel, failure/conflict; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
