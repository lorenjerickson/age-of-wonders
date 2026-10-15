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
  const name = `item-trait-triggers-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_TRAIT_TRIGGERS_TEST_PORT || 5212);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Trait triggers test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
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
                      grants: ["grant-one", opaque, "grant-two", "grant-one"],
                      triggers: [
                        {
                          event: "custom",
                          customEvent: "test:bell",
                          timing: "after",
                          optional: false,
                          priority: 2,
                          predicate: { kind: "custom", rule: "test:gate" },
                          limit: {
                            kind: "uses",
                            maximum: { kind: "constant", value: 3 },
                          },
                          private: { keep: true },
                          effects: [
                            {
                              kind: "narrative",
                              text: "Bell rings",
                              visibility: "gm",
                              private: { keep: true },
                            },
                            {
                              kind: "custom",
                              rule: "test:effect",
                              payload: { secret: opaque },
                            },
                          ],
                        },
                        { event: "turn-start", effects: [] },
                        { event: "turn-end", private: { keep: true } },
                      ],
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
      draft.records.push(
        ...[
          ["grant-one", "Keen senses"],
          ["grant-two", "Keen senses"],
          ["grant-three", "Shield training"],
          ["grant-four", opaque],
        ].map(([sourceId, name]) => ({
          resourceType: "definitions",
          sourceId,
          payload: {
            kind: "trait",
            identity: { id: sourceId, name },
            components: {},
          },
        })),
      );
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
      const root = "subject/traits/modifiers%2Fmarked/triggers";
      const triggers = () => action().components.triggers;
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
      const save = async (noun) => {
        await button(`Save ${noun}`).click();
        await link(`Add ${noun}`).waitFor();
      };
      const waitWrite = async (operation) => {
        const response = page.waitForResponse(
          (r) => r.request().method() === "PUT",
        );
        await operation();
        await response;
        await page.waitForFunction(
          () =>
            ![...document.querySelectorAll("button")].some(
              (b) => b.textContent === "Saving…",
            ),
        );
      };
      await open("subject/traits/modifiers%2Fmarked");
      await link("Manage Triggers").click();
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-triggers-list-${width}.png`,
        fullPage: true,
      });
      await open(`${root}/0`);
      await select("Event").selectOption("hit");
      await select("Timing").selectOption("before");
      await select("Optional").selectOption("true");
      await number("Priority").fill("");
      await number("Priority").fill("-2.5");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-triggers-form-${width}.png`,
        fullPage: true,
      });
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Trigger").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      await link("Back to Trait").click();
      assert.equal(await button("Cancel").count(), 1);
      releaseSave();
      await link("Add Trigger").waitFor();
      assert.equal(triggers()[0].priority, -2.5);
      assert.equal(triggers()[0].customEvent, "test:bell");
      assert.equal(triggers()[0].optional, true);
      await open(`${root}/0`);
      assert.equal(await number("Priority").inputValue(), "-2.5");
      await select("Event").selectOption("custom");
      await text("Custom event").fill("test:chime");
      await select("Timing").selectOption("");
      await select("Optional").selectOption("");
      await number("Priority").fill("");
      await save("Trigger");
      assert.equal(triggers()[0].customEvent, "test:chime");
      for (const key of ["timing", "optional", "priority"])
        assert.equal(Object.hasOwn(triggers()[0], key), false);
      await open(`${root}/0`);
      await text("Custom event").fill("");
      await save("Trigger");
      assert.equal(Object.hasOwn(triggers()[0], "customEvent"), false);
      await link("Add Trigger").click();
      await select("Event").selectOption("damage-taken");
      await save("Trigger");
      assert.equal(triggers().at(-1).event, "damage-taken");
      for (const key of ["customEvent", "timing", "optional", "priority"])
        assert.equal(Object.hasOwn(triggers().at(-1), key), false);
      await waitWrite(() => button("Move trigger 4 up").click());
      await waitWrite(() => button("Move trigger 3 up").click());
      assert.deepEqual(
        triggers().map((t) => t.event),
        ["custom", "damage-taken", "turn-start", "turn-end"],
      );
      await open(`${root}/1`);
      page.once("dialog", (d) => d.dismiss());
      await button("Remove Trigger").click();
      assert.equal(triggers().length, 4);
      page.once("dialog", (d) => d.accept());
      await button("Remove Trigger").click();
      await link("Add Trigger").waitFor();
      assert.equal(triggers().length, 3);
      const eRoot = `${root}/0/effects`;
      await open(`${root}/0`);
      await link("Manage Effects").click();
      await link("Back to Trigger").click();
      await link("Manage Effects").click();
      await link("Add Effect").waitFor();
      await open(`${eRoot}/0`);
      await text("Narrative text").fill("Chime rings twice");
      await select("Visibility").selectOption("");
      await save("Effect");
      assert.equal(triggers()[0].effects[0].text, "Chime rings twice");
      assert.equal(
        Object.hasOwn(triggers()[0].effects[0], "visibility"),
        false,
      );
      assert.deepEqual(triggers()[0].effects[0].private, { keep: true });
      await open(`${eRoot}/1`);
      await page
        .getByText(
          "This Effect is read only here. Its data is preserved; you can reorder or explicitly remove it.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save Effect").count(), 0);
      await button("Cancel").click();
      for (const kind of ["damage", "heal", "move"]) {
        await link("Add Effect").click();
        await select("Effect kind").selectOption(kind);
        await text("Target binding").fill("target");
        if (kind === "damage") await text("Damage type").fill("fire");
        if (kind === "move") {
          await number("Movement distance").fill("");
          await number("Movement distance").fill("12");
          await select("Distance unit").selectOption("meter");
          await text("Direction").fill("north");
          await select("Forced movement").selectOption("false");
        } else {
          await number("Constant").fill("");
          await number("Constant").fill("4");
          if (kind === "heal")
            await select("Limit to maximum hit points").selectOption("true");
        }
        await layoutCheck();
        await page.screenshot({
          path: `/tmp/aow-item-trait-trigger-${kind}-${width}.png`,
          fullPage: true,
        });
        await save("Effect");
        assert.equal(triggers()[0].effects.at(-1).kind, kind);
      }
      await waitWrite(() => button("Move effect 5 up").click());
      await waitWrite(() => button("Move effect 4 up").click());
      assert.deepEqual(
        triggers()[0].effects.map((e) => e.kind),
        ["narrative", "custom", "move", "damage", "heal"],
      );
      await open(`${eRoot}/4`);
      page.once("dialog", (d) => d.accept());
      await button("Remove Effect").click();
      await link("Add Effect").waitFor();
      assert.equal(triggers()[0].effects.length, 4);
      assert.deepEqual(
        triggers()[0].effects[1],
        initialTrait.components.triggers[0].effects[1],
      );
      assert.deepEqual(
        triggers()[0].predicate,
        initialTrait.components.triggers[0].predicate,
      );
      assert.deepEqual(
        triggers()[0].limit,
        initialTrait.components.triggers[0].limit,
      );
      const noChange = writes.length;
      await open(`${root}/0`);
      await select("Event").selectOption("death");
      page.once("dialog", (d) => d.dismiss());
      await link("Back to Trait").click();
      assert.equal(await button("Cancel").count(), 1);
      await button("Cancel").click();
      await link("Add Trigger").waitFor();
      assert.equal(writes.length, noChange);
      await open(`${eRoot}/0`);
      await text("Narrative text").fill("Failed changes");
      failNext = 500;
      await button("Save Effect").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await text("Narrative text").inputValue(), "Failed changes");
      assert.equal(await button("Save Effect").isEnabled(), true);
      failNext = 409;
      await button("Save Effect").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save Effect").isDisabled(), true);
      for (const route of [`${root}/0`, `${eRoot}/0`]) {
        await open(route, true);
        assert.equal(
          await button(
            route.includes("effects") ? "Save Effect" : "Save Trigger",
          ).isDisabled(),
          true,
        );
        await layoutCheck();
      }
      const preserved = structuredClone(initialTrait),
        changed = structuredClone(action());
      delete preserved.components.triggers;
      delete changed.components.triggers;
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
      const noIds = async () => {
        assert.equal(
          (await page.locator("body").innerText()).includes(opaque),
          false,
        );
        assert.equal(
          await page
            .locator("input,textarea,select")
            .evaluateAll(
              (inputs, secret) => inputs.some((i) => i.value.includes(secret)),
              opaque,
            ),
          false,
        );
      };
      triggers()[0].customEvent = `test:${opaque}`;
      await open(`${root}/0`);
      await noIds();
      await save("Trigger");
      assert.equal(triggers()[0].customEvent, `test:${opaque}`);
      await open(`${root}/0`);
      page.once("dialog", (d) => d.accept());
      await button("Replace custom event").click();
      await text("Custom event").fill("test:safe");
      await save("Trigger");
      triggers()[0].effects[2].target = `actor.${opaque}`;
      triggers()[0].effects[2].direction = opaque;
      await open(`${eRoot}/2`);
      await noIds();
      await save("Effect");
      assert.equal(triggers()[0].effects[2].target, `actor.${opaque}`);
      await open(`${eRoot}/2`);
      page.once("dialog", (d) => d.accept());
      await button("Replace target binding").click();
      await text("Target binding").fill("target");
      page.once("dialog", (d) => d.accept());
      await button("Replace direction").click();
      await text("Direction").fill("east");
      await save("Effect");
      const beforeBlocked = writes.length;
      for (const path of [
        "subject/traits/missing/triggers",
        "subject/traits/new/triggers",
        `${root}/999`,
        `${root}/-1`,
        `${root}/01`,
        `${root}/new/effects`,
        `${eRoot}/99`,
      ]) {
        await open(path);
        assert.equal(await button("Save Trigger").count(), 0);
        assert.equal(await button("Save Effect").count(), 0);
        assert.equal(await link("Add Trigger").count(), 0);
        assert.equal(await link("Add Effect").count(), 0);
      }
      components().traits.push(structuredClone(action()));
      await open(root);
      assert.equal(await link("Add Trigger").count(), 0);
      components().traits.pop();
      const traitComponents = action().components;
      action().components = null;
      await open(root);
      assert.equal(await link("Add Trigger").count(), 0);
      action().components = traitComponents;
      const originalTriggers = structuredClone(triggers());
      for (const malformed of [null, {}, [null], [1]]) {
        action().components.triggers = malformed;
        await open(root);
        assert.equal(await link("Add Trigger").count(), 0);
      }
      action().components.triggers = originalTriggers;
      assert.equal(writes.length, beforeBlocked);
      assert.equal(Object.hasOwn(triggers()[2], "effects"), false);
      await open(`${root}/2/effects`);
      await link("Add Effect").click();
      await button("Cancel").click();
      await link("Add Effect").waitFor();
      assert.equal(Object.hasOwn(triggers()[2], "effects"), false);
      await link("Add Effect").click();
      await text("Narrative text").fill("First effect");
      await save("Effect");
      assert.equal(triggers()[2].effects[0].text, "First effect");
      delete action().components.triggers;
      await open(root);
      await link("Add Trigger").click();
      await button("Cancel").click();
      await link("Add Trigger").waitFor();
      assert.equal(Object.hasOwn(action().components, "triggers"), false);
      await link("Add Trigger").click();
      await select("Event").selectOption("hit");
      await save("Trigger");
      assert.equal(triggers()[0].event, "hit");
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Trait triggers ${width}px: metadata and nested effects, numeric repair, omission/removal, order, readback/reopen, preservation, cancel/pending/500/409/readonly, encoded/malformed owners, 44px/no overflow; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
