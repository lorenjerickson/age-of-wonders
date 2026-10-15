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
  const name = `item-option-prerequisites-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.ITEM_OPTION_PREREQUISITES_TEST_PORT || 5204);
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
          choices: [
            {
              id: "prerequisites",
              prompt: "Choose",
              private: { keep: true },
              options: [
                {
                  id: "options/marked",
                  label: "Careful strike",
                  value: { nested: [1, { preserved: true }] },
                  private: { keep: true },
                },
                { id: "sibling-option", label: "Other", value: false },
              ],
            },
            { id: "sibling-choice", prompt: "Other choice", options: [] },
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
      const definitions = [
        {
          resourceType: "definitions",
          sourceId: opaque,
          payload: {
            kind: "skill",
            identity: { id: opaque, name: "Sword training" },
            components: {},
          },
        },
        {
          resourceType: "definitions",
          sourceId: "skill-second",
          payload: {
            kind: "skill",
            identity: { id: "skill-second", name: "Sword training" },
            components: {},
          },
        },
        {
          resourceType: "definitions",
          sourceId: "feat-first",
          payload: {
            kind: "feat",
            identity: { id: "feat-first", name: "Sword training" },
            components: {},
          },
        },
        {
          resourceType: "locations",
          sourceId: "location-ignored",
          payload: {
            kind: "location",
            identity: { name: "Excluded location" },
          },
        },
        {
          resourceType: "media",
          sourceId: "media-ignored",
          payload: { kind: "image", identity: { name: "Excluded media" } },
        },
      ];
      draft.records.push(...structuredClone(definitions));
      const imported = {
        kind: "has-definition",
        subject: "actor",
        definitionId: "missing-imported-definition",
        private: { retained: true },
      };
      const opaqueSubject = {
        kind: "has-definition",
        subject: `actors.${opaque}.owner`,
        definitionId: opaque,
        private: { retained: true },
      };
      direct.components.prerequisites.push(
        structuredClone(imported),
        structuredClone(opaqueSubject),
      );
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
      const select = (name) =>
        page.getByRole("combobox", { name, exact: true });
      const open = async (route, readonly = false) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent(route)}${readonly ? "&readonly=1" : ""}`,
        );
        await page.getByRole("main").waitFor();
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
        await button("Save Prerequisite").waitFor({ state: "hidden" });
      };
      const add = async (path, kind) => {
        await open(path);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption(kind);
        await saveAndList();
      };
      const chooseDefinition = async (id, confirm = false) => {
        const records = draft.records.filter(
          (r) => r.resourceType === "definitions",
        );
        if (confirm) page.once("dialog", (d) => d.accept());
        await select("Definition").selectOption(
          String(records.findIndex((r) => r.sourceId === id)),
        );
      };
      const selectedDefinition = async () => {
        const index = await select("Definition").inputValue();
        return index === ""
          ? undefined
          : draft.records.filter((r) => r.resourceType === "definitions")[
              Number(index)
            ].sourceId;
      };
      const assertNoIds = async () => {
        const shown = await page.locator("body").innerText();
        const fields = await page
          .locator("input")
          .evaluateAll((es) => es.map((e) => e.value).join(" "));
        for (const id of [
          opaque,
          "skill-second",
          "feat-first",
          "missing-imported-definition",
        ]) {
          assert.ok(!shown.includes(id), `Identifier leaked in text: ${id}`);
          assert.ok(!fields.includes(id), `Identifier leaked in input: ${id}`);
        }
      };
      const number = (name) =>
        page.getByRole("spinbutton", { name, exact: true });
      const choicePath = "/choices/prerequisites/options/options%2Fmarked";
      const ownerSpecs = [
        ["actions/direct", () => action()],
        [
          "traits/trait/actions/nested",
          () => components().traits[0].components.actions[0],
        ],
        [
          "vehicle/actions/vehicle-action",
          () => components().vehicle.actions[0],
        ],
      ];
      for (const [owner, owned] of ownerSpecs) {
        const optionPath = `subject/${owner}${choicePath}`;
        const ownerRoot = `${optionPath}/prerequisites`;
        const originalAction = structuredClone(owned());
        const option = () => owned().components.choices[0].options[0];
        assert.equal(Object.hasOwn(option(), "prerequisites"), false);
        await open(optionPath);
        await link("Manage Prerequisites").click();
        await link("Add Prerequisite").waitFor();
        await link("Back to Option").click();
        await link("Manage Prerequisites").waitFor();
        assert.equal(Object.hasOwn(option(), "prerequisites"), false);
        await add(ownerRoot, "all");
        await add(`${ownerRoot}/0/children`, "not");
        await open(`${ownerRoot}/0/children/0/children/0`);
        page.once("dialog", (d) => d.accept());
        await button("Remove Prerequisite").click();
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption("compare");
        await number("Left number").fill("");
        await number("Left number").fill("7");
        await number("Right number").fill("3");
        await saveAndList();
        assert.equal(
          option().prerequisites[0].predicates[0].predicate.left.value,
          7,
        );
        await open(`${ownerRoot}/0/children/0/children/0`);
        assert.equal(await number("Left number").inputValue(), "7");
        await layoutCheck();
        await page.screenshot({
          path: `/tmp/aow-item-option-prerequisites-form-${width}.png`,
          fullPage: true,
        });
        const beforeCancel = writes.length;
        await number("Left number").fill("9");
        page.once("dialog", (d) => d.dismiss());
        await link("Back to Option").click();
        assert.equal(await number("Left number").inputValue(), "9");
        await button("Cancel").click();
        await link("Back to Option").waitFor();
        assert.equal(writes.length, beforeCancel);
        await open(`${ownerRoot}/0/children`);
        await link("Add Prerequisite").click();
        await select("Prerequisite kind").selectOption("has-definition");
        await chooseDefinition(opaque);
        await assertNoIds();
        await saveAndList();
        assert.equal(
          option().prerequisites[0].predicates[1].definitionId,
          opaque,
        );
        await button("Move prerequisite 2 up").click();
        await button("Move prerequisite 1 down").waitFor({ state: "visible" });
        await page.waitForFunction(
          () =>
            !document.querySelector(
              'button[aria-label="Move prerequisite 1 down"]',
            )?.disabled,
        );
        await button("Move prerequisite 1 down").click();
        await page.waitForFunction(
          () =>
            !document.querySelector(
              'button[aria-label="Move prerequisite 2 up"]',
            )?.disabled,
        );
        assert.equal(
          option().prerequisites[0].predicates[1].definitionId,
          opaque,
        );
        await open(`${ownerRoot}/0/children/1`);
        page.once("dialog", (d) => d.accept());
        await button("Remove Prerequisite").click();
        await link("Add Prerequisite").waitFor();
        assert.equal(option().prerequisites[0].predicates.length, 1);
        const changed = structuredClone(owned());
        delete changed.components.choices[0].options[0].prerequisites;
        assert.deepEqual(changed, originalAction);
      }
      const optionRoot = `subject/actions/direct${choicePath}/prerequisites`;
      const comparePath = `${optionRoot}/0/children/0/children/0`;
      await open(comparePath);
      holdNext = new Promise((resolve) => {
        releaseSave = resolve;
      });
      await button("Save Prerequisite").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Back to Option").waitFor();
      await open(comparePath);
      await number("Left number").fill("15");
      failNext = 500;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Left number").inputValue(), "15");
      failNext = 409;
      await button("Save Prerequisite").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await number("Left number").inputValue(), "15");
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      await open(comparePath, true);
      assert.equal(await button("Save Prerequisite").isDisabled(), true);
      await layoutCheck();
      const beforeBlocked = writes.length;
      for (const path of [
        "subject/actions/direct/choices/missing/options/missing/prerequisites",
        "subject/actions/direct/choices/prerequisites/options/missing/prerequisites",
      ]) {
        await open(path);
        assert.equal(await link("Add Prerequisite").count(), 0);
        assert.equal(await button("Save Prerequisite").count(), 0);
      }
      action().components.choices[0].options.push(
        structuredClone(action().components.choices[0].options[0]),
      );
      await open(optionRoot);
      assert.equal(await link("Add Prerequisite").count(), 0);
      assert.equal(writes.length, beforeBlocked);
      action().components.choices[0].options.pop();
      assert.deepEqual(draft.records[1], original.records[1]);
      assert.deepEqual(
        components().actions[1],
        original.records[0].payload.components.actions[1],
      );
      assert.deepEqual(
        components().private,
        original.records[0].payload.components.private,
      );
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS Choice Option prerequisites ${width}px: three owners, absent preservation, compound values/private/siblings/root prerequisites, nested all/not compare and named definition, encoded slash/marker IDs, reorder twice/remove, cancel/dirty navigation, pending/500409/readonly, missing/ambiguous blocked, 44px/no overflow; HTTP fixture only`,
      );
    }
  } finally {
    await browser.close();
  }
});
