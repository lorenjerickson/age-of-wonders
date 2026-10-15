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
  const name = `item-trait-choices-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_TRAIT_CHOICES_TEST_PORT || 5206);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Trait choices test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
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
        revisionName: "Choices fixture",
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
                      id: "choices/marked",
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
      const root = "subject/traits/choices%2Fmarked/choices";
      const first = `${root}/choice%2Ffirst`;
      const choice = () =>
        action().components.choices.find((c) => c.id === "choice/first");
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
      await open("subject/traits/choices%2Fmarked");
      await link("Manage Choices").click();
      await link("Choice 1 · Pick a direction").click();
      await text("Prompt").fill("Choose a heading");
      await number("Maximum").fill("");
      await number("Maximum").fill("2");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-choices-form-${width}.png`,
        fullPage: true,
      });
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Choice").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add Choice").waitFor();
      assert.equal(choice().prompt, "Choose a heading");
      assert.equal(choice().maximum, 2);
      assert.equal(Object.hasOwn(choice(), "visibility"), false);
      assert.equal(Object.hasOwn(choice(), "allowDuplicates"), false);
      assert.equal(choice().optionCatalog, opaque);
      assert.deepEqual(choice().extension, { private: true });
      await open(first);
      assert.equal(await text("Prompt").inputValue(), "Choose a heading");
      await link("Manage Options").click();
      await link("Option 1 · First option").click();
      await text("Label").fill("North path");
      await button("Save Option").click();
      await link("Add Option").waitFor();
      assert.deepEqual(choice().options[0].prerequisites, [
        { kind: "custom", rule: "test:gate" },
      ]);
      assert.deepEqual(choice().options[0].private, {
        notes: "Retained option",
      });
      // Every supported primitive type is authored, persisted and reopened.
      for (const [type, value, expected] of [
        ["text", "south", "south"],
        ["number", "7", 7],
        ["boolean", "true", true],
        ["null", null, null],
      ]) {
        await link("Add Option").click();
        await text("Label").fill(`New ${type}`);
        await select("Value type").selectOption(type);
        if (type === "text") await text("Value").fill(value);
        if (type === "number") {
          await number("Value").fill("");
          await number("Value").fill(value);
        }
        if (type === "boolean") await select("Value").selectOption(value);
        await layoutCheck();
        await button("Save Option").click();
        await link("Add Option").waitFor();
        const saved = choice().options.at(-1);
        assert.equal(saved.value, expected);
        await open(`${first}/options/${encodeURIComponent(saved.id)}`);
        assert.equal(await select("Value type").inputValue(), type);
        if (type === "number") {
          await number("Value").fill("");
          await number("Value").fill("9");
          await button("Save Option").click();
          await link("Add Option").waitFor();
          assert.equal(
            choice().options.find((o) => o.id === saved.id).value,
            9,
          );
          await open(`${first}/options/${encodeURIComponent(saved.id)}`);
          assert.equal(await number("Value").inputValue(), "9");
        }
        await button("Cancel").click();
        await link("Add Option").waitFor();
      }
      await button("Move option 7 up").click();
      await link("Option 6 · New null").waitFor();
      await button("Move option 6 up").click();
      await link("Option 5 · New null").waitFor();
      assert.equal(choice().options[4].label, "New null");
      // Imported structured and opaque values are invisible, lossless until explicit replacement.
      for (const [id, expected] of [
        ["second", { secret: opaque, nested: [1, true] }],
        ["third", opaque],
      ]) {
        await open(`${first}/options/${id}`);
        assert.equal(
          (await page.locator("body").innerText()).includes(opaque),
          false,
        );
        assert.equal(
          await page
            .locator("input")
            .evaluateAll(
              (inputs, secret) =>
                inputs.some((input) => input.value.includes(secret)),
              opaque,
            ),
          false,
        );
        assert.equal(await select("Value type").count(), 0);
        await text("Label").fill(
          id === "second" ? "Complex preserved" : "Reference preserved",
        );
        await button("Save Option").click();
        await link("Add Option").waitFor();
        assert.deepEqual(
          choice().options.find((o) => o.id === id).value,
          expected,
        );
        await open(`${first}/options/${id}`);
        page.once("dialog", (dialog) => dialog.dismiss());
        await button("Replace value").click();
        assert.equal(await select("Value type").count(), 0);
        page.once("dialog", (dialog) => dialog.accept());
        await button("Replace value").click();
        await text("Value").fill("replacement");
        await button("Save Option").click();
        await link("Add Option").waitFor();
        assert.equal(
          choice().options.find((o) => o.id === id).value,
          "replacement",
        );
      }
      const beforeCancel = writes.length;
      await open(`${first}/options/first`);
      await text("Label").fill("Cancelled change");
      page.once("dialog", (dialog) => dialog.dismiss());
      await link("Back to Choice").click();
      assert.equal(await text("Label").inputValue(), "Cancelled change");
      await button("Cancel").click();
      await link("Add Option").waitFor();
      assert.equal(writes.length, beforeCancel);
      assert.equal(choice().options[0].label, "North path");
      await open(`${first}/options/first`);
      page.once("dialog", (dialog) => dialog.dismiss());
      await button("Remove Option").click();
      assert.equal(choice().options.length, 7);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Option").click();
      await link("Add Option").waitFor();
      assert.equal(choice().options.length, 6);
      await open(root);
      await button("Move choice 3 up").click();
      await link("Choice 2 · Pick a third direction").waitFor();
      await button("Move choice 2 up").click();
      await link("Choice 1 · Pick a third direction").waitFor();
      assert.equal(action().components.choices[0].id, "third-choice");
      // Create a Choice and Option directly on the Trait, then reopen.
      await open(root);
      await link("Back to Trait").click();
      await link("Manage Choices").click();
      await link("Add Choice").click();
      await text("Prompt").fill("New choice");
      await number("Minimum").fill("1");
      await number("Maximum").fill("1");
      await button("Save Choice").click();
      await link("Add Choice").waitFor();
      const saved = action().components.choices.at(-1);
      await open(`${root}/${encodeURIComponent(saved.id)}`);
      assert.equal(await text("Prompt").inputValue(), "New choice");
      await link("Manage Options").click();
      await link("Add Option").click();
      await text("Label").fill("Nested option");
      await text("Value").fill("kept");
      await button("Save Option").click();
      await link("Add Option").waitFor();
      const savedOption = action().components.choices.at(-1).options[0];
      assert.equal(savedOption.value, "kept");
      const optionPath = `${root}/${encodeURIComponent(saved.id)}/options/${encodeURIComponent(savedOption.id)}`;
      await open(optionPath);
      await link("Manage Prerequisites").click();
      await link("Add Prerequisite").click();
      await select("Prerequisite kind").selectOption("all");
      await button("Save Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      await open(`${optionPath}/prerequisites/0/children/new`);
      await select("Prerequisite kind").selectOption("not");
      await button("Save Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      await open(`${optionPath}/prerequisites/0/children/0/children/0`);
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-trait-choices-prerequisite-${width}.png`,
        fullPage: true,
      });
      await link("Back to Option").click();
      await link("Manage Prerequisites").waitFor();
      assert.equal(
        action().components.choices.at(-1).options[0].prerequisites[0]
          .predicates[0].kind,
        "not",
      );
      const added = action().components.choices.at(-1).id;
      await open(`${root}/${encodeURIComponent(added)}`);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Choice").click();
      await link("Add Choice").waitFor();
      assert.equal(
        action().components.choices.some((c) => c.id === added),
        false,
      );
      await open(first);
      await text("Prompt").fill("Unsaved choice");
      failNext = 500;
      await button("Save Choice").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await text("Prompt").inputValue(), "Unsaved choice");
      assert.equal(await button("Save Choice").isEnabled(), true);
      failNext = 409;
      await button("Save Choice").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await text("Prompt").inputValue(), "Unsaved choice");
      assert.equal(await button("Save Choice").isDisabled(), true);
      assert.deepEqual(draft.records[1], original.records[1]);
      assert.deepEqual(
        components().actions[1],
        original.records[0].payload.components.actions[1],
      );
      assert.deepEqual(
        components().private,
        original.records[0].payload.components.private,
      );
      const changedTrait = structuredClone(action());
      delete changedTrait.components.choices;
      const preservedTrait = structuredClone(initialTrait);
      delete preservedTrait.components.choices;
      assert.deepEqual(changedTrait, preservedTrait);
      assert.deepEqual(
        components().actions,
        original.records[0].payload.components.actions,
      );
      assert.deepEqual(
        components().vehicle,
        original.records[0].payload.components.vehicle,
      );
      await open(first, true);
      assert.equal(await button("Save Choice").isDisabled(), true);
      await layoutCheck();
      const beforeBlocked = writes.length;
      for (const path of [
        "subject/traits/missing/choices",
        "subject/traits/new/choices",
        `${root}/missing`,
        `${first}/options/missing`,
      ]) {
        await open(path);
        assert.equal(await button("Save Choice").count(), 0);
        assert.equal(await button("Save Option").count(), 0);
      }
      components().traits.push(structuredClone(action()));
      await open(root);
      assert.equal(await link("Add Choice").count(), 0);
      components().traits.pop();
      assert.deepEqual(
        components().traits[1],
        original.records[0].payload.components.traits[1],
      );
      const originalOptions = structuredClone(choice().options);
      for (const malformed of [
        null,
        {},
        [{ id: "new", label: "Reserved", value: true }],
        [
          { id: "duplicate", label: "One", value: true },
          { id: "duplicate", label: "Two", value: false },
        ],
      ]) {
        choice().options = malformed;
        await open(`${first}/options`);
        assert.equal(await link("Add Option").count(), 0);
      }
      choice().options = originalOptions;
      const originalChoices = structuredClone(action().components.choices);
      for (const malformed of [
        null,
        {},
        [{ id: "new", prompt: "Reserved" }],
        [
          { id: "duplicate", prompt: "One" },
          { id: "duplicate", prompt: "Two" },
        ],
      ]) {
        action().components.choices = malformed;
        await open(root);
        assert.equal(await link("Add Choice").count(), 0);
      }
      action().components.choices = originalChoices;
      assert.equal(writes.length, beforeBlocked);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Trait choices ${width}px: choice+option create/edit/save/readback/reopen; nested Option prerequisites, primitives/complex preservation, ordering/removal, cancel/dirty navigation, pending/500/409/readonly, encoded identities and malformed/ambiguous guards, 44px/no overflow; fixture HTTP persistence only`,
      );
    }
  } finally {
    await browser.close();
  }
});
