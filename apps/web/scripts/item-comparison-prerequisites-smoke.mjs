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
  const name = `item-comparison-prerequisites-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(
    process.env.ITEM_COMPARISON_PREREQUISITES_TEST_PORT || 5202,
  );
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
            { kind: "custom", rule: opaque, payload: { nested: "retained" } },
          ],
          private: { retained: true },
        },
        {
          kind: "compare",
          left: { kind: "path", path: "actor.level" },
          operator: "gte",
          right: { kind: "constant", value: 3 },
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
      const comparisons = [
        {
          kind: "compare",
          operator: "eq",
          left: { kind: "literal", value: 4, private: { retained: true } },
          right: { kind: "path", path: "actor.level" },
          private: { retained: true },
        },
        {
          kind: "compare",
          operator: "gte",
          left: {
            kind: "lookup",
            table: opaque,
            key: { kind: "literal", value: "x" },
          },
          right: { kind: "literal", value: { secret: opaque } },
        },
        {
          kind: "compare",
          operator: "eq",
          left: { kind: "path", path: `actors.${opaque}.health`, fallback: 2 },
          right: { kind: "literal", value: "actors.other.health" },
        },
      ];
      direct.components.prerequisites.push(...structuredClone(comparisons));
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
      const saveAndList = async () => {
        await button("Save Prerequisite").click();
        await link("Add Prerequisite").waitFor();
      };
      const add = async (path, kind) => {
        await open(path);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption(kind);
        await saveAndList();
      };
      for (const owner of [
        "actions/direct",
        "traits/trait/actions/nested",
        "vehicle/actions/vehicle-action",
      ]) {
        const ownerRoot = `subject/${owner}/prerequisites`;
        const owned = () =>
          owner.startsWith("traits")
            ? components().traits[0].components.actions[0]
            : owner.startsWith("vehicle")
              ? components().vehicle.actions[0]
              : action();
        const index = owned().components.prerequisites.length;
        await open(ownerRoot);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption("compare");
        await select("Comparison operator").selectOption("gte");
        await number("Left number").fill("");
        await number("Left number").fill("7");
        await number("Right number").fill("3");
        await layoutCheck();
        await page.screenshot({
          path: `/tmp/aow-item-comparison-prerequisites-form-${width}.png`,
          fullPage: true,
        });
        await saveAndList();
        assert.deepEqual(owned().components.prerequisites[index], {
          kind: "compare",
          operator: "gte",
          left: { kind: "constant", value: 7 },
          right: { kind: "constant", value: 3 },
        });
        await open(`${ownerRoot}/${index}`);
        assert.equal(await number("Left number").inputValue(), "7");
        await number("Left number").fill("");
        await number("Left number").fill("8");
        await saveAndList();
        const parent = owned().components.prerequisites.length;
        await add(ownerRoot, "all");
        await open(`${ownerRoot}/${parent}/children`);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption("compare");
        await select("Comparison operator").selectOption("matches");
        await saveAndList();
        assert.equal(
          owned().components.prerequisites[parent].predicates[0].operator,
          "matches",
        );
      }
      // Every operator round-trips through the actual controls and authoritative read-back.
      for (const operator of [
        "eq",
        "ne",
        "lt",
        "lte",
        "gt",
        "gte",
        "includes",
        "matches",
      ]) {
        await open(`${root}/6`);
        await select("Comparison operator").selectOption(operator);
        await saveAndList();
        assert.equal(action().components.prerequisites[6].operator, operator);
      }
      await open(`${root}/6`);
      await number("Left literal number").fill("");
      assert.equal(await number("Left literal number").count(), 1);
      await number("Left literal number").fill("9");
      await saveAndList();
      assert.deepEqual(action().components.prerequisites[6].left, {
        kind: "literal",
        value: 9,
        private: { retained: true },
      });
      assert.equal(
        Object.hasOwn(action().components.prerequisites[6].right, "fallback"),
        false,
      );
      await open(`${root}/6`);
      await number("Right fallback").fill("4");
      await saveAndList();
      await open(`${root}/6`);
      page.once("dialog", (d) => d.accept());
      await button("Remove right fallback").click();
      await saveAndList();
      assert.equal(
        Object.hasOwn(action().components.prerequisites[6].right, "fallback"),
        false,
      );
      // Complex imported operands remain invisible and survive unrelated operator changes.
      await open(`${root}/7`);
      assert.equal(
        (await page.locator("body").innerText()).includes(opaque),
        false,
      );
      await select("Comparison operator").selectOption("ne");
      await saveAndList();
      assert.deepEqual(
        action().components.prerequisites[7].left,
        comparisons[1].left,
      );
      assert.deepEqual(
        action().components.prerequisites[7].right,
        comparisons[1].right,
      );
      await open(`${root}/7`);
      page.once("dialog", (d) => d.dismiss());
      await select("Left operand kind").selectOption("event-value");
      assert.equal(await text("Left path").count(), 0);
      page.once("dialog", (d) => d.accept());
      await select("Left operand kind").selectOption("event-value");
      await text("Left path").fill("event.amount");
      page.once("dialog", (d) => d.accept());
      await select("Right operand kind").selectOption("collection-count");
      await text("Right path").fill("actor.items");
      await saveAndList();
      assert.deepEqual(action().components.prerequisites[7].left, {
        kind: "event-value",
        path: "event.amount",
      });
      assert.deepEqual(action().components.prerequisites[7].right, {
        kind: "collection-count",
        path: "actor.items",
      });
      // Opaque imported strings are not shown in content or input values.
      await open(`${root}/8`);
      const visible = await page
        .locator("input")
        .evaluateAll((es) => es.map((e) => e.value));
      assert.ok(
        !visible.some(
          (value) =>
            value.includes(opaque) || value.includes("actors.other.health"),
        ),
      );
      await saveAndList();
      assert.deepEqual(action().components.prerequisites[8], comparisons[2]);
      await open(`${root}/8`);
      page.once("dialog", (d) => d.dismiss());
      await button("Replace left path").click();
      assert.equal(await text("Left path").count(), 0);
      page.once("dialog", (d) => d.accept());
      await button("Replace left path").click();
      await text("Left path").fill("actor.level");
      page.once("dialog", (d) => d.accept());
      await button("Replace right text").click();
      await text("Right text").fill("ready");
      await number("Left fallback").fill("");
      assert.equal(await number("Left fallback").count(), 1);
      await number("Left fallback").fill("5");
      await saveAndList();
      assert.deepEqual(action().components.prerequisites[8], {
        kind: "compare",
        operator: "eq",
        left: { kind: "path", path: "actor.level", fallback: 5 },
        right: { kind: "literal", value: "ready" },
      });
      // Literal primitive forms, including explicit null, survive save/reopen.
      await open(`${root}/9`);
      page.once("dialog", (d) => d.accept());
      await select("Left operand kind").selectOption("literal");
      for (const [kind, value] of [
        ["string", "ready"],
        ["boolean", true],
        ["null", null],
        ["number", 12],
      ]) {
        page.once("dialog", (d) => d.accept());
        await select("Left literal type").selectOption(kind);
        if (kind === "string") await text("Left text").fill(value);
        if (kind === "boolean")
          await select("Left boolean").selectOption("true");
        if (kind === "number") {
          await number("Left literal number").fill("");
          await number("Left literal number").fill(String(value));
        }
        await saveAndList();
        assert.equal(action().components.prerequisites[9].left.value, value);
        await open(`${root}/9`);
      }
      const beforeCancel = writes.length;
      await number("Left literal number").fill("99");
      await button("Cancel").click();
      await link("Add Prerequisite").waitFor();
      assert.equal(writes.length, beforeCancel);
      await open(`${root}/9`);
      assert.equal(await number("Left literal number").inputValue(), "12");
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Prerequisite").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add Prerequisite").waitFor();
      await open(`${root}/9`);
      await number("Left literal number").fill("13");
      failNext = 500;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Left literal number").inputValue(), "13");
      failNext = 409;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      assert.equal(await number("Left literal number").inputValue(), "13");
      await open(`${root}/9`, true);
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      await layoutCheck();
      assert.deepEqual(action().components.prerequisites.slice(1, 4), advanced);
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
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Comparison prerequisites ${width}px: eight operators, simple operands, direct/Trait/Vehicle and compound children, save/readback/reopen, clear/retype, cancel, pending save, 500/409, readonly, private/custom/opaque preservation; HTTP fixture only`,
      );
    }
  } finally {
    await browser.close();
  }
});
