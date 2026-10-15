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
  const name = `item-action-limits-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_ACTION_LIMITS_TEST_PORT || 5215);
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
          targets: [{ kind: "self", range: "self", private: true }],
          prerequisites: [{ kind: "never" }],
          limit: { kind: "uses", maximum: { kind: "constant", value: 3 } },
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
      const direct = makeAction("limits/direct", "Tow");
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
      const action = () => components().actions[0];
      const initialAction = structuredClone(action());
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
      const root = "subject/actions";
      const primaryRoute = `${root}/limits%2Fdirect`;
      const actionComponents = () =>
        components().actions.map((entry) => entry.components);
      delete components().actions[1].components.limit;
      delete original.records[0].payload.components.actions[1].components.limit;
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
      const confirm = async (name, accepted = true) => {
        page.once("dialog", (d) => (accepted ? d.accept() : d.dismiss()));
        await button(name).click();
      };
      const kind = async (value) => {
        page.once("dialog", (d) => d.accept());
        await select("Limit kind").selectOption(value);
      };
      const limit = () => actionComponents()[0].limit;
      await open(`${root}/sibling`);
      await save("Action");
      assert.equal(Object.hasOwn(actionComponents()[1], "limit"), false);
      await open(`${root}/sibling`);
      await button("Add usage limit").click();
      await button("Cancel").click();
      await link("Add Action").waitFor();
      assert.equal(Object.hasOwn(actionComponents()[1], "limit"), false);
      await open(primaryRoute);
      await number("Maximum value").fill("");
      await number("Maximum value").fill("4.5");
      await select("Resets on").selectOption("long");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-action-limits-uses-${width}.png`,
        fullPage: true,
      });
      await save("Action");
      assert.equal(limit().maximum.value, 4.5);
      assert.equal(limit().resetsOn, "long");
      await open(primaryRoute);
      assert.equal(await number("Maximum value").inputValue(), "4.5");
      page.once("dialog", (d) => d.accept());
      await select("Maximum type").selectOption("path");
      await text("Maximum path").fill("actor.proficiency");
      await number("Maximum fallback").fill("");
      await number("Maximum fallback").fill("-2.5");
      await select("Resets on").selectOption("");
      await save("Action");
      assert.deepEqual(limit().maximum, {
        kind: "path",
        path: "actor.proficiency",
        fallback: -2.5,
      });
      assert.equal(Object.hasOwn(limit(), "resetsOn"), false);
      await open(primaryRoute);
      await kind("recharge");
      await number("Recharge die").fill("");
      page.once("dialog", (d) => d.dismiss());
      await link("Overview").click();
      assert.equal(await number("Recharge die").inputValue(), "");
      await number("Recharge die").fill("6");
      await number("Successful roll 1").fill("5");
      await button("Add successful roll").click();
      await number("Successful roll 2").fill("5");
      await button("Add successful roll").click();
      await number("Successful roll 3").fill("6");
      await button("Move successful roll 3 up").click();
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-action-limits-recharge-${width}.png`,
        fullPage: true,
      });
      await save("Action");
      assert.deepEqual(limit(), {
        kind: "recharge",
        die: 6,
        succeedsOn: [5, 6, 5],
      });
      await open(primaryRoute);
      for (let n = 3; n > 0; n--) await confirm(`Remove successful roll ${n}`);
      await save("Action");
      assert.deepEqual(limit().succeedsOn, []);
      for (const value of [
        "once-per-turn",
        "once-per-round",
        "once-per-encounter",
      ]) {
        await open(primaryRoute);
        await kind(value);
        await save("Action");
        assert.deepEqual(limit(), { kind: value });
      }
      await open(primaryRoute);
      await kind("resource");
      await text("Resource binding").fill("actor.focus");
      await save("Action");
      assert.deepEqual(limit(), { kind: "resource", resource: "actor.focus" });
      await open(primaryRoute);
      await confirm("Remove usage limit", false);
      assert.equal(await text("Resource binding").inputValue(), "actor.focus");
      await confirm("Remove usage limit");
      await save("Action");
      assert.equal(Object.hasOwn(actionComponents()[0], "limit"), false);
      await open(primaryRoute);
      await button("Add usage limit").click();
      await number("Maximum value").fill("2");
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Action").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      await link("Overview").click();
      assert.equal(await button("Cancel").count(), 1);
      releaseSave();
      await link("Add Action").waitFor();
      assert.equal(limit().maximum.value, 2);
      await open(primaryRoute);
      await number("Maximum value").fill("8");
      page.once("dialog", (d) => d.dismiss());
      await link("Overview").click();
      assert.equal(await number("Maximum value").inputValue(), "8");
      await button("Cancel").click();
      await link("Add Action").waitFor();
      assert.equal(limit().maximum.value, 2);
      await open(primaryRoute);
      await number("Maximum value").fill("9");
      failNext = 500;
      await button("Save Action").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Maximum value").inputValue(), "9");
      assert.equal(await button("Save Action").isEnabled(), true);
      failNext = 409;
      await button("Save Action").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save Action").isDisabled(), true);
      assert.equal(limit().maximum.value, 2);
      await open(primaryRoute, true);
      assert.equal(await button("Save Action").isDisabled(), true);
      await layoutCheck();
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
      actionComponents()[0].limit = {
        kind: "resource",
        resource: `actor.${opaque}`,
        private: { keep: true },
      };
      await open(primaryRoute);
      await noIds();
      await save("Action");
      assert.equal(limit().resource, `actor.${opaque}`);
      await open(primaryRoute);
      await confirm("Replace resource binding");
      await text("Resource binding").fill("actor.focus");
      await save("Action");
      assert.deepEqual(limit().private, { keep: true });
      actionComponents()[0].limit = {
        kind: "uses",
        maximum: {
          kind: "custom",
          key: "test:maximum",
          payload: { secret: opaque },
        },
        private: { keep: true },
      };
      const advanced = structuredClone(limit());
      await open(primaryRoute);
      await noIds();
      await save("Action");
      assert.deepEqual(limit(), advanced);
      await open(primaryRoute);
      await confirm("Replace maximum", false);
      assert.equal(await number("Maximum value").count(), 0);
      await confirm("Replace maximum");
      await number("Maximum value").fill("3");
      await save("Action");
      assert.deepEqual(limit().private, { keep: true });
      assert.deepEqual(limit().maximum, { kind: "constant", value: 3 });
      for (const malformed of [
        null,
        { kind: "future", payload: { secret: opaque } },
        { kind: "recharge", die: "six", succeedsOn: null },
      ]) {
        actionComponents()[0].limit = structuredClone(malformed);
        await open(primaryRoute);
        await noIds();
        if (malformed?.kind !== "recharge") await save("Action");
        assert.deepEqual(limit(), malformed);
        await open(primaryRoute);
        await confirm("Remove usage limit");
        await save("Action");
        assert.equal(Object.hasOwn(actionComponents()[0], "limit"), false);
      }
      for (const empty of [
        { kind: "resource", resource: "" },
        { kind: "uses", maximum: { kind: "path", path: "" } },
        {
          kind: "uses",
          maximum: { kind: "constant", value: 1 },
          resetsOn: "homebrew:",
        },
      ]) {
        actionComponents()[0].limit = structuredClone(empty);
        await open(primaryRoute);
        await save("Action");
        assert.deepEqual(limit(), empty);
      }
      actionComponents()[0].limit = {
        kind: "uses",
        maximum: { kind: "constant", value: 1 },
        resetsOn: "future-reset",
      };
      await open(primaryRoute);
      page.once("dialog", (d) => d.dismiss());
      await select("Resets on").selectOption("homebrew");
      assert.equal(await text("Homebrew rest name").count(), 0);
      await save("Action");
      assert.equal(limit().resetsOn, "future-reset");
      await open(primaryRoute);
      page.once("dialog", (d) => d.accept());
      await select("Resets on").selectOption("homebrew");
      await text("Homebrew rest name").fill("Camp");
      await save("Action");
      assert.equal(limit().resetsOn, "homebrew:Camp");
      const preserved = structuredClone(initialAction),
        changed = structuredClone(action());
      for (const obj of [preserved, changed]) delete obj.components.limit;
      assert.deepEqual(changed, preserved);
      for (const key of ["traits", "vehicle", "private"])
        assert.deepEqual(
          components()[key],
          original.records[0].payload.components[key],
        );
      assert.deepEqual(
        components().traits[1],
        original.records[0].payload.components.traits[1],
      );
      for (const [ownerRoute, getAction] of [
        [
          "subject/traits/modifiers%2Fmarked/actions/nested",
          () => components().traits[0].components.actions[0],
        ],
        [
          "subject/vehicle/actions/vehicle-action",
          () => components().vehicle.actions[0],
        ],
      ]) {
        const before = structuredClone(components());
        await open(ownerRoute);
        await number("Maximum value").fill("7");
        await save("Action");
        assert.equal(getAction().components.limit.maximum.value, 7);
        await open(ownerRoute);
        assert.equal(await number("Maximum value").inputValue(), "7");
        getAction().components.limit.maximum.value = 3;
        assert.deepEqual(components(), before);
      }
      for (const [ownerRoute, getOwner] of [
        [primaryRoute, () => action()],
        [
          "subject/traits/modifiers%2Fmarked/actions/nested",
          () => components().traits[0],
        ],
      ]) {
        for (const malformed of [null, [], "invalid"]) {
          const saved = getOwner().components;
          getOwner().components = malformed;
          const count = writes.length;
          await open(ownerRoute);
          assert.equal(await button("Save Action").count(), 0);
          assert.equal(writes.length, count);
          getOwner().components = saved;
        }
      }
      for (const malformed of [null, [], "invalid"]) {
        const saved = components().vehicle;
        components().vehicle = malformed;
        await open("subject/vehicle/actions/vehicle-action");
        assert.equal(await button("Save Action").count(), 0);
        components().vehicle = saved;
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Action limits ${width}px: all six kinds, constant/path, recharge duplicate/empty ordered rolls, omission/removal, readback/reopen, explicit repair, opaque masking, private/predicate/effect/sibling preservation, Cancel/dirty/pending/500/409/readonly, 44px/no overflow; disposable HTTP fixture only`,
      );
    }
  } finally {
    await browser.close();
  }
});
