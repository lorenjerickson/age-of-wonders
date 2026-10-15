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
  const name = `item-prerequisites-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_PREREQUISITES_TEST_PORT || 5200);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Action prerequisites test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
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

// Real React controls/provider/router/client; authoritative disposable HTTP fixture,
// not database/auth integration or rule execution.
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
      const advanced = [
        {
          kind: "all",
          predicates: [
            { kind: "always" },
            { kind: "not", predicate: { kind: "never" } },
          ],
          private: { retained: true },
        },
        {
          kind: "custom",
          rule: "test:advanced-prerequisite",
          payload: { retained: true },
        },
        { kind: "custom", rule: opaque, payload: { secret: "preserved" } },
      ];
      const makeAction = (id, name) => ({
        kind: "action",
        identity: { id, name, private: { notes: "Private action" } },
        components: {
          activation: "action",
          prerequisites: [
            {
              kind: "is-attuned",
              subject: "actor",
              extension: { retained: true },
            },
            ...structuredClone(advanced),
            {
              kind: "within-distance",
              source: "actor",
              target: "target",
              distance: { value: 5, unit: "foot" },
            },
            { kind: "has-tag", subject: opaque, tag: "other" },
          ],
          costs: [
            { kind: "custom", key: "test:cost", payload: { retained: true } },
          ],
          choices: [{ id: "choice", prompt: "Choose", options: [] }],
          outcomes: [
            {
              id: "original",
              effects: [{ kind: "narrative", text: "Original narration" }],
            },
          ],
        },
        extensions: { "test:action": { retained: true } },
      });
      const direct = makeAction("direct", "Tow"),
        nested = makeAction("nested", "Muffle"),
        vehicle = makeAction("vehicle-action", "Accelerate");
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Prerequisites fixture",
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
      const open = async (route, readonly = false) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent(route)}${readonly ? "&readonly=1" : ""}`,
        );
        await page.getByRole("heading").first().waitFor();
      };
      const root = "subject/actions/direct/prerequisites";
      const layoutCheck = async () => {
        const layout = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          controls: [
            ...document.querySelectorAll("input,select,textarea,button,a"),
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
      await open("subject/actions/direct");
      await link("Manage Prerequisites").click();
      await link("Prerequisite 1 · is-attuned").click();
      await text("Subject").fill("wearer");
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Prerequisite").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add Prerequisite").waitFor();
      assert.equal(action().components.prerequisites[0].subject, "wearer");
      assert.equal(
        Object.hasOwn(action().components.prerequisites[0], "item"),
        false,
      );
      assert.deepEqual(action().components.prerequisites[0].extension, {
        retained: true,
      });
      await open(`${root}/0`);
      assert.equal(await text("Subject").inputValue(), "wearer");
      await button("Cancel").click();
      for (const index of [2, 3]) {
        await open(`${root}/${index}`);
        assert.equal(await button("Save Prerequisite").count(), 0);
        assert.equal(
          (await page.locator("body").innerText()).includes(opaque),
          false,
        );
        await layoutCheck();
      }
      await open(`${root}/4`);
      await number("Distance").fill("");
      await number("Distance").fill("12");
      await select("Distance unit").selectOption("meter");
      await layoutCheck();
      await page.screenshot({
        path: `/tmp/aow-item-prerequisites-form-${width}.png`,
        fullPage: true,
      });
      await button("Save Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      assert.deepEqual(action().components.prerequisites[4].distance, {
        value: 12,
        unit: "meter",
      });
      await open(`${root}/4`);
      assert.equal(await number("Distance").inputValue(), "12");
      await button("Cancel").click();
      const kinds = [
        "always",
        "never",
        "has-condition",
        "has-tag",
        "is-proficient",
        "is-attuned",
        "is-sustaining-operation",
        "damage-type",
        "within-distance",
        "visible",
        "has-cover",
        "relation",
      ];
      for (const kind of kinds) {
        await open(root);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption(kind);
        const bindings = {
          "has-condition": { Subject: "actor", Condition: "poisoned" },
          "has-tag": { Subject: "actor", Tag: "ready" },
          "is-proficient": { Subject: "actor", Proficiency: "sailing" },
          "is-attuned": { Subject: "actor" },
          "is-sustaining-operation": { Subject: "actor" },
          "damage-type": { Damage: "damage", "Damage type": "fire" },
          "within-distance": { Source: "actor", Target: "target" },
          visible: { Observer: "actor", Target: "target" },
          "has-cover": { Observer: "actor", Target: "target", Cover: "half" },
          relation: { Source: "actor", Target: "target", Relation: "friendly" },
        };
        for (const [label, value] of Object.entries(bindings[kind] || {}))
          await text(label).fill(value);
        await layoutCheck();
        await button("Save Prerequisite").click();
        await link("Add Prerequisite").waitFor();
        assert.equal(action().components.prerequisites.at(-1).kind, kind);
      }
      assert.deepEqual(
        action()
          .components.prerequisites.slice(6)
          .map((p) => p.kind),
        kinds,
      );
      await button("Move prerequisite 18 up").click();
      await link("Prerequisite 17 · relation").waitFor();
      await button("Move prerequisite 17 up").click();
      await link("Prerequisite 16 · relation").waitFor();
      assert.equal(action().components.prerequisites[15].kind, "relation");
      // Known record references and UUIDs stay hidden until explicit replacement.
      await open(`${root}/5`);
      await button("Save Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      assert.deepEqual(action().components.prerequisites[5], {
        kind: "has-tag",
        subject: opaque,
        tag: "other",
      });
      await open(`${root}/5`);
      for (const [field, secret, replacement] of [
        ["Subject", "c1822e01-131d-4393-848f-86f2d9c2d34e", "actor"],
        ["Tag", "other", "ready"],
      ]) {
        assert.equal(await text(field).count(), 0);
        assert.equal(
          await page
            .locator("input")
            .evaluateAll(
              (inputs, value) => inputs.some((input) => input.value === value),
              secret,
            ),
          false,
        );
        assert.equal(
          (await page.locator("body").innerText()).includes(opaque),
          false,
        );
        page.once("dialog", (dialog) => dialog.dismiss());
        await button(`Replace ${field.toLowerCase()} binding`).click();
        assert.equal(await text(field).count(), 0);
        page.once("dialog", (dialog) => dialog.accept());
        await button(`Replace ${field.toLowerCase()} binding`).click();
        await text(field).fill(replacement);
      }
      await button("Save Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      assert.deepEqual(action().components.prerequisites[5], {
        kind: "has-tag",
        subject: "actor",
        tag: "ready",
      });
      for (const owner of [
        "actions/direct",
        "traits/trait/actions/nested",
        "vehicle/actions/vehicle-action",
      ]) {
        await open(`subject/${owner}/prerequisites`);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption("is-attuned");
        await text("Subject").fill("wearer");
        await button("Save Prerequisite").click();
        await link("Add Prerequisite").waitFor();
        const owned = () =>
          owner.startsWith("traits")
            ? components().traits[0].components.actions[0]
            : owner.startsWith("vehicle")
              ? components().vehicle.actions[0]
              : action();
        const index = owned().components.prerequisites.length - 1;
        assert.equal(
          Object.hasOwn(owned().components.prerequisites[index], "item"),
          false,
        );
        await open(`subject/${owner}/prerequisites/${index}`);
        assert.equal(await text("Subject").inputValue(), "wearer");
        await text("Subject").fill("bearer");
        await button("Save Prerequisite").click();
        await link("Add Prerequisite").waitFor();
        await open(`subject/${owner}/prerequisites/${index}`);
        assert.equal(await text("Subject").inputValue(), "bearer");
      }
      const beforeCancel = writes.length;
      await text("Subject").fill("cancelled");
      await button("Cancel").click();
      await link("Add Prerequisite").waitFor();
      assert.equal(writes.length, beforeCancel);
      await open(`${root}/0`);
      page.once("dialog", (dialog) => dialog.dismiss());
      await button("Remove Prerequisite").click();
      assert.equal(action().components.prerequisites.length, 19);
      page.once("dialog", (dialog) => dialog.accept());
      await button("Remove Prerequisite").click();
      await link("Add Prerequisite").waitFor();
      assert.equal(action().components.prerequisites.length, 18);
      assert.deepEqual(action().components.prerequisites.slice(0, 3), advanced);
      await open(`${root}/3`);
      await number("Distance").fill("20");
      failNext = 500;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Distance").inputValue(), "20");
      assert.equal(await button("Save Prerequisite").isEnabled(), true);
      failNext = 409;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Distance").inputValue(), "20");
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      assert.equal(action().components.prerequisites[3].distance.value, 12);
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
      assert.deepEqual(action().components.costs, direct.components.costs);
      assert.deepEqual(action().components.choices, direct.components.choices);
      assert.deepEqual(action().extensions, direct.extensions);
      await layoutCheck();
      await open(root, true);
      assert.equal(await link("Add Prerequisite").count(), 0);
      assert.equal(await button("Move prerequisite 2 up").isDisabled(), true);
      await open(`${root}/3`, true);
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Item prerequisites ${width}px: atomic forms, direct/Trait/Vehicle create/edit/save/readback/reopen; advanced/private preservation, ordering/removal, cancel, pending save, failure/conflict, readonly; HTTP fixture only`,
      );
    }
  } finally {
    await browser.close();
  }
});
