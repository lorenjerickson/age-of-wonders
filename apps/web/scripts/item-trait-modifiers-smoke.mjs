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
  const name = `item-trait-modifiers-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_TRAIT_MODIFIERS_TEST_PORT || 5207);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Trait modifiers test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
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
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Mechanics test',status:'active',accessRole:new URLSearchParams(location.search).has('readonly')?'viewer':'owner',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
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
      const opaque = "c1822e01-131d-4393-848f-86f2d9c2d34e";
      const makeChoice = (id, prompt) => ({
        id,
        prompt,
        minimum: 0,
        maximum: 1,
        optionCatalog: opaque,
        extension: { private: true },
        options: [
          {
            id: "first",
            label: "First option",
            value: "north",
            prerequisites: [{ kind: "custom", rule: "test:gate" }],
            private: { notes: "Retained option" },
          },
          {
            id: "second",
            label: "Second option",
            value: { secret: opaque, nested: [1, true] },
            extension: { retained: true },
          },
          { id: "third", label: "Third option", value: opaque },
        ],
      });
      const makeAction = (id, name) => ({
        kind: "action",
        identity: { id, name, private: { notes: "Private action" } },
        components: {
          activation: "action",
          choices: [
            makeChoice("choice/first", "Pick a direction"),
            makeChoice("second-choice", "Pick another direction"),
            makeChoice("third-choice", "Pick a third direction"),
          ],
          costs: [
            { kind: "custom", key: "test:cost", payload: { retained: true } },
          ],
          outcomes: [
            {
              id: "original",
              effects: [{ kind: "narrative", text: "Original narration" }],
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
        revisionName: "Modifiers fixture",
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
                quality: "standard",
                private: { notes: "Private item" },
                actions: [direct, makeAction("sibling", "Sibling Action")],
                traits: [
                  {
                    kind: "trait",
                    identity: {
                      id: "modifiers/marked",
                      name: "Quiet wheels",
                      private: { keep: true },
                    },
                    components: {
                      actions: [nested],
                      choices: structuredClone(direct.components.choices),
                      prerequisites: [{ kind: "never" }],
                      grants: [{ kind: "custom", payload: { keep: true } }],
                      triggers: [{ keep: true }],
                      private: { keep: true },
                      modifiers: [
                        {
                          id: "modifiers/first",
                          target: "actor.defense",
                          operation: "add",
                          value: { kind: "constant", value: 2 },
                          predicate: { kind: "custom", rule: "test:gate" },
                          extension: { keep: true },
                        },
                        {
                          id: "advanced",
                          target: "actor.speed",
                          operation: "multiply",
                          value: {
                            kind: "custom",
                            key: "test:formula",
                            payload: { secret: opaque },
                          },
                          private: { keep: true },
                        },
                        {
                          id: "third",
                          target: "actor.health",
                          operation: "maximum",
                          sourceLabel: "Health boost",
                        },
                        {
                          id: "opaque",
                          target: opaque,
                          operation: "add",
                          sourceLabel: opaque,
                          value: { kind: "literal", value: opaque },
                        },
                      ],
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
      draft.records[0].payload.components.traits.push({
        kind: "trait",
        identity: { id: "sibling-trait", name: "Sturdy" },
        components: {
          choices: [makeChoice("sibling-choice", "Preserved sibling")],
          private: { keep: true },
        },
      });
      const original = structuredClone(draft);
      const components = () => draft.records[0].payload.components;
      const action = () => components().traits[0];
      const initialTrait = structuredClone(action());
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
      const open = async (route, readonly = false) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent(route)}${readonly ? "&readonly=1" : ""}`,
        );
        await page.getByRole("main").waitFor();
      };
      const root = "subject/traits/modifiers%2Fmarked/modifiers";
      const first = `${root}/modifiers%2Ffirst`;
      const modifiers = () => action().components.modifiers;
      const modifier = () =>
        modifiers().find((m) => m.id === "modifiers/first");
      const layoutCheck = async () => {
        const layout = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          controls: [
            ...document.querySelectorAll("input, select, textarea, button, a"),
          ]
            .filter((e) => e.getBoundingClientRect().height > 0)
            .map((e) => ({
              label: e.textContent,
              w: e.getBoundingClientRect().width,
              h: e.getBoundingClientRect().height,
            })),
        }));
        assert.ok(layout.scroll <= width + 1, JSON.stringify(layout));
        assert.ok(
          layout.controls.every((box) => box.w >= 44 && box.h >= 44),
          JSON.stringify(layout),
        );
      };
      if (process.env.B05_PRESERVATION_ONLY === "1") {
        await open(first);
        await number("Priority").fill("7");
        await button("Save Modifier").click();
        await link("Add Modifier").waitFor();
        assert.equal(modifier().priority, 7);
        const expected = structuredClone(
          original.records[0].payload.components.traits[0],
        );
        expected.components.modifiers[0].priority = 7;
        assert.deepEqual(action(), expected);
        await open(first);
        assert.equal(await number("Priority").inputValue(), "7");
        await layoutCheck();
        await page.screenshot({
          path: `/tmp/b05-trait-modifier-${width}.png`,
          fullPage: true,
        });
        const beforeBlocked = writes.length;
        const beforeComponents = structuredClone(action().components);
        for (const malformed of [null, false, 0, "imported", []]) {
          action().components = malformed;
          await open(root);
          assert.equal(await link("Add Modifier").count(), 0);
          await open(`${root}/new`);
          assert.equal(await button("Save Modifier").count(), 0);
          assert.deepEqual(action().components, malformed);
        }
        action().components = beforeComponents;
        assert.equal(writes.length, beforeBlocked);
        assert.deepEqual(errors, []);
        await page.close();
        console.log(
          `PASS B05 Trait modifiers ${width}px: edit/save/readback/reopen, private/sibling/predicate preservation, malformed owner list/Add blocked without writes, 44px/no overflow; fixture HTTP persistence only`,
        );
        continue;
      }
      await open("subject/traits/modifiers%2Fmarked");
      await link("Manage Modifiers").click();
      await link("Modifier 1 · add").click();
      await text("Target path").fill("actor.defense.total");
      await number("Modifier value number").fill("");
      await number("Modifier value number").fill("4");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-modifiers-form-${width}.png`,
        fullPage: true,
      });
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Modifier").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      await link("Back to Trait").click();
      assert.equal(await button("Cancel").count(), 1);
      releaseSave();
      await link("Add Modifier").waitFor();
      assert.equal(modifier().value.value, 4);
      assert.equal(modifier().target, "actor.defense.total");
      for (const field of ["priority", "stacking", "sourceLabel"])
        assert.equal(Object.hasOwn(modifier(), field), false);
      assert.deepEqual(modifier().predicate, {
        kind: "custom",
        rule: "test:gate",
      });
      assert.deepEqual(modifier().extension, { keep: true });
      await open(first);
      assert.equal(await number("Modifier value number").inputValue(), "4");
      await number("Priority").fill("");
      await number("Priority").fill("-2.5");
      await select("Stacking").selectOption("highest");
      await text("Source label").fill("Shield training");
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.equal(modifier().priority, -2.5);
      assert.equal(modifier().stacking, "highest");
      await open(first);
      await number("Priority").fill("");
      await select("Stacking").selectOption("");
      page.once("dialog", (d) => d.accept());
      await button("Remove source label").click();
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      for (const field of ["priority", "stacking", "sourceLabel"])
        assert.equal(Object.hasOwn(modifier(), field), false);
      const oldAdvanced = structuredClone(modifiers()[1]);
      await open(`${root}/advanced`);
      assert.equal(
        await select("Modifier value operand kind").inputValue(),
        "advanced",
      );
      await number("Priority").fill("1");
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.deepEqual(modifiers()[1], { ...oldAdvanced, priority: 1 });
      await open(`${root}/opaque`);
      assert.equal(
        (await page.locator("body").innerText()).includes(opaque),
        false,
      );
      assert.equal(
        await page
          .locator("input")
          .evaluateAll(
            (inputs, secret) => inputs.some((i) => i.value.includes(secret)),
            opaque,
          ),
        false,
      );
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.equal(modifiers()[3].target, opaque);
      assert.equal(modifiers()[3].sourceLabel, opaque);
      await open(`${root}/third`);
      assert.equal(await button("Add value").count(), 1);
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.equal(Object.hasOwn(modifiers()[2], "value"), false);
      await open(`${root}/third`);
      await button("Add value").click();
      page.once("dialog", (d) => d.accept());
      await select("Modifier value operand kind").selectOption("literal");
      page.once("dialog", (d) => d.accept());
      await select("Modifier value literal type").selectOption("number");
      await number("Modifier value literal number").fill("");
      await number("Modifier value literal number").fill("3.5");
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.deepEqual(modifiers()[2].value, { kind: "literal", value: 3.5 });
      await open(`${root}/third`);
      page.once("dialog", (d) => d.dismiss());
      await button("Remove value").click();
      assert.equal(await select("Modifier value operand kind").count(), 1);
      page.once("dialog", (d) => d.accept());
      await button("Remove value").click();
      await button("Save Modifier").click();
      await link("Add Modifier").waitFor();
      assert.equal(Object.hasOwn(modifiers()[2], "value"), false);
      // Author every simple scalar shape; no default value is introduced on a new row.
      for (const kind of [
        "absent",
        "constant",
        "literal",
        "path",
        "event-value",
        "collection-count",
      ]) {
        await link("Add Modifier").click();
        await text("Target path").fill(`actor.${kind}`);
        await select("Operation").selectOption("allow");
        if (kind !== "absent") {
          await button("Add value").click();
          if (kind !== "constant") {
            page.once("dialog", (d) => d.accept());
            await select("Modifier value operand kind").selectOption(kind);
          }
          if (kind === "constant")
            await number("Modifier value number").fill("5");
          if (kind === "literal")
            await text("Modifier value text").fill("ready");
          if (["path", "event-value", "collection-count"].includes(kind))
            await text("Modifier value path").fill("actor.inventory");
        }
        await button("Save Modifier").click();
        await link("Add Modifier").waitFor();
        const saved = modifiers().at(-1);
        if (kind === "absent")
          assert.equal(Object.hasOwn(saved, "value"), false);
        else assert.equal(saved.value.kind, kind);
        await open(`${root}/${encodeURIComponent(saved.id)}`);
        assert.equal(await text("Target path").inputValue(), `actor.${kind}`);
        if (kind === "path")
          assert.equal(Object.hasOwn(saved.value, "fallback"), false);
        await button("Cancel").click();
        await link("Add Modifier").waitFor();
      }
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "PUT"),
        button("Move modifier 10 up").click(),
      ]);
      await link("Modifier 9 · allow").waitFor();
      assert.equal(modifiers()[8].target, "actor.collection-count");
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "PUT"),
        button("Move modifier 9 up").click(),
      ]);
      await page.waitForFunction(
        () =>
          !document.querySelector(
            'button[disabled][aria-label="Move modifier 8 up"]',
          ),
      );
      assert.equal(modifiers()[7].target, "actor.collection-count");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-modifiers-list-${width}.png`,
        fullPage: true,
      });
      const beforeCancel = writes.length;
      await open(first);
      await text("Target path").fill("cancelled");
      page.once("dialog", (d) => d.dismiss());
      await link("Back to Trait").click();
      assert.equal(await text("Target path").inputValue(), "cancelled");
      await button("Cancel").click();
      await link("Add Modifier").waitFor();
      assert.equal(writes.length, beforeCancel);
      await open(`${root}/${encodeURIComponent(modifiers().at(-1).id)}`);
      page.once("dialog", (d) => d.dismiss());
      await button("Remove Modifier").click();
      assert.equal(modifiers().length, 10);
      page.once("dialog", (d) => d.accept());
      await button("Remove Modifier").click();
      await link("Add Modifier").waitFor();
      assert.equal(modifiers().length, 9);
      await open(first);
      await text("Target path").fill("unsaved");
      failNext = 500;
      await button("Save Modifier").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await text("Target path").inputValue(), "unsaved");
      assert.equal(await button("Save Modifier").isEnabled(), true);
      failNext = 409;
      await button("Save Modifier").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await text("Target path").inputValue(), "unsaved");
      assert.equal(await button("Save Modifier").isDisabled(), true);
      const preserved = structuredClone(initialTrait),
        changed = structuredClone(action());
      delete preserved.components.modifiers;
      delete changed.components.modifiers;
      assert.deepEqual(changed, preserved);
      for (const key of ["actions", "vehicle", "private"])
        assert.deepEqual(
          components()[key],
          original.records[0].payload.components[key],
        );
      assert.deepEqual(
        components().traits[1],
        original.records[0].payload.components.traits[1],
      );
      assert.deepEqual(draft.records[1], original.records[1]);
      await open(first, true);
      assert.equal(await button("Save Modifier").isDisabled(), true);
      await layoutCheck();
      const beforeBlocked = writes.length;
      for (const path of [
        "subject/traits/missing/modifiers",
        "subject/traits/new/modifiers",
        `${root}/missing`,
      ]) {
        await open(path);
        assert.equal(await button("Save Modifier").count(), 0);
        assert.equal(await link("Add Modifier").count(), 0);
      }
      components().traits.push(structuredClone(action()));
      await open(root);
      assert.equal(await link("Add Modifier").count(), 0);
      components().traits.pop();
      const originalModifiers = structuredClone(modifiers());
      for (const malformed of [
        null,
        {},
        [{ id: "new", target: "actor", operation: "add" }],
        [
          { id: "duplicate", target: "one", operation: "add" },
          { id: "duplicate", target: "two", operation: "add" },
        ],
        [{ target: "actor", operation: "add" }],
      ]) {
        action().components.modifiers = malformed;
        await open(root);
        assert.equal(await link("Add Modifier").count(), 0);
      }
      action().components.modifiers = originalModifiers;
      const originalTraitComponents = structuredClone(action().components);
      for (const malformed of [null, false, 0, "imported", []]) {
        action().components = malformed;
        await open(root);
        assert.equal(await link("Add Modifier").count(), 0);
        await open(`${root}/new`);
        assert.equal(await button("Save Modifier").count(), 0);
        assert.deepEqual(action().components, malformed);
      }
      action().components = originalTraitComponents;
      assert.equal(writes.length, beforeBlocked);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Trait modifiers ${width}px: create/edit/readback/reopen, scalar variants/numeric repair/optional absence, ordering/removal, advanced/predicate/sibling preservation, cancel/pending/500/409/readonly, encoded/invalid identities, GM identifier masking, 44px/no overflow; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
