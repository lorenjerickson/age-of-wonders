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
  const name = `item-outcomes-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_OUTCOMES_TEST_PORT || 5197);
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
          costs: [{ kind: "custom", opaque: true }],
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
      const vehicle = makeAction("vehicle-action", "Accelerate");
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Outcomes fixture",
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
      const root = "subject/actions/direct/outcomes";
      await open("subject/actions/direct");
      await link("Manage Outcomes").click();
      await link("Outcome 1").click();
      await link("Manage Effects").click();
      await link("Effect 1 · narrative").click();
      await text("Narrative text").fill("Updated narration");
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Effect").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add Effect")
        .waitFor()
        .catch(async (error) => {
          console.error(await page.locator("body").innerText(), writes, errors);
          throw error;
        });
      assert.equal(
        action().components.outcomes[0].effects[0].text,
        "Updated narration",
      );
      assert.deepEqual(
        action().components.outcomes[0].when,
        direct.components.outcomes[0].when,
      );
      assert.deepEqual(action().components.outcomes[0].effects[0].extension, {
        retained: true,
      });
      assert.deepEqual(
        action().components.outcomes[0].effects[1],
        direct.components.outcomes[0].effects[1],
      );
      await open(`${root}/direct-outcome/effects/1`);
      assert.equal(await button("Save Effect").count(), 0);
      await open(root);
      await link("Add Outcome").click();
      await button("Save Outcome").click();
      await link("Add Outcome").waitFor();
      assert.equal(action().components.outcomes.length, 2);
      const createdId = action().components.outcomes[1].id;
      const effectsRoot = `${root}/${createdId}/effects`;
      for (const kind of ["narrative", "damage", "heal", "move"]) {
        await open(effectsRoot);
        await link("Add Effect").click();
        await select("Effect kind").selectOption(kind);
        if (kind === "narrative")
          await text("Narrative text").fill("New narration");
        else await text("Target binding").fill("target");
        if (kind === "damage") {
          await text("Damage type").fill("fire");
          await button("Add dice").click();
          await number("Dice count").fill("");
          await number("Dice count").fill("2");
          await number("Die size").fill("8");
          await page.screenshot({
            path: `/tmp/aow-item-outcomes-damage-${width}.png`,
            fullPage: true,
          });
        }
        await button("Save Effect").click();
        await link("Add Effect").waitFor();
      }
      assert.deepEqual(
        action().components.outcomes[1].effects.map((e) => e.kind),
        ["narrative", "damage", "heal", "move"],
      );
      await button("Move effect 4 up").click();
      await link("Effect 3 · move").waitFor();
      await button("Move effect 3 up").click();
      await link("Effect 2 · move").waitFor();
      assert.deepEqual(
        action().components.outcomes[1].effects.map((e) => e.kind),
        ["narrative", "move", "damage", "heal"],
      );
      await link("Effect 4 · heal").click();
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Effect").click();
      await link("Add Effect").waitFor();
      assert.deepEqual(
        action().components.outcomes[1].effects.map((e) => e.kind),
        ["narrative", "move", "damage"],
      );
      await open(root);
      await button("Move outcome 2 up").click();
      await page.waitForFunction(
        () =>
          !document.querySelector(
            'button[disabled][aria-label="Move outcome 2 up"]',
          ),
      );
      await button("Move outcome 1 down").click();
      await link("Outcome 2").waitFor();
      assert.equal(action().components.outcomes[1].id, createdId);
      assert.equal(
        action().components.outcomes[1].effects[2].amount.terms[1].count,
        2,
      );
      await open(`${effectsRoot}/0`);
      assert.equal(await text("Narrative text").inputValue(), "New narration");
      const beforeCancel = writes.length;
      await text("Narrative text").fill("Discard this");
      await button("Cancel").click();
      await link("Add Effect").waitFor();
      assert.equal(writes.length, beforeCancel);
      for (const [owner, id] of [
        ["traits/trait/actions/nested", "nested"],
        ["vehicle/actions/vehicle-action", "vehicle-action"],
      ]) {
        await open(`subject/${owner}/outcomes/${id}-outcome/effects/0`);
        await text("Narrative text").fill(`Updated ${id}`);
        await button("Save Effect").click();
        await link("Add Effect").waitFor();
      }
      assert.equal(
        components().traits[0].components.actions[0].components.outcomes[0]
          .effects[0].text,
        "Updated nested",
      );
      assert.equal(
        components().vehicle.actions[0].components.outcomes[0].effects[0].text,
        "Updated vehicle-action",
      );
      await open(`${effectsRoot}/0`);
      await text("Narrative text").fill("Keep on failure");
      failNext = 500;
      await button("Save Effect").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await text("Narrative text").inputValue(),
        "Keep on failure",
      );
      assert.equal(await button("Save Effect").isEnabled(), true);
      failNext = 409;
      await button("Save Effect").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await text("Narrative text").inputValue(),
        "Keep on failure",
      );
      assert.equal(await button("Save Effect").isDisabled(), true);
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
      assert.deepEqual(action().components.costs, direct.components.costs);
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
        path: `/tmp/aow-item-outcomes-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await button("Cancel").click();
      await link("Add Effect").waitFor();
      await open(`${root}/${createdId}`);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Outcome").click();
      await link("Add Outcome").waitFor();
      assert.equal(action().components.outcomes.length, 1);
      assert.equal(action().components.outcomes[0].id, "direct-outcome");
      assert.deepEqual(
        action().components.outcomes[0].when,
        direct.components.outcomes[0].when,
      );
      await page.close();
      console.log(
        `PASS Item outcomes ${width}px: direct/Trait/Vehicle editing, save/read-back/reopen, supported effect kinds, preservation, cancel, failure/conflict; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
