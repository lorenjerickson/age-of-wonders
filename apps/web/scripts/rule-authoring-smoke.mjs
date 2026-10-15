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
  const name = `rule-authoring-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.RULE_AUTHORING_TEST_PORT || 5207);
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

// Real shared forms/router/API with disposable authoritative HTTP persistence.
// Authentication and database integration remain separate acceptance work.
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
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("dialog", (d) => d.accept());
      const scalar = {
        kind: "arithmetic",
        operator: "add",
        operands: [
          { kind: "constant", value: 2 },
          { kind: "level", actor: "self" },
        ],
        private: { keep: true },
      };
      const effects = [
        {
          kind: "temporary-hit-points",
          target: "self",
          amount: scalar,
          extension: { keep: true },
        },
        {
          kind: "damage",
          target: "target",
          damageType: "fire",
          amount: {
            terms: [
              {
                kind: "dice",
                count: 2,
                size: 6,
                modifiers: [{ kind: "keep-highest", count: 1 }],
              },
            ],
          },
        },
        {
          kind: "apply-condition",
          target: "target",
          condition: "poisoned",
          duration: { kind: "measured", amount: 2, unit: "round" },
          saveEnds: {
            kind: "saving-throw",
            difficultyClass: { kind: "constant", value: 12 },
          },
        },
        {
          kind: "branch",
          predicate: { kind: "always" },
          whenTrue: [{ kind: "narrative", text: "True branch" }],
          whenFalse: [{ kind: "narrative", text: "False branch" }],
        },
        {
          kind: "for-each",
          collection: { kind: "path", path: "targets" },
          bindAs: "target",
          effects: [{ kind: "narrative", text: "Loop" }],
        },
        {
          kind: "repeat-save",
          target: "target",
          test: { kind: "saving-throw" },
          onSuccess: [{ kind: "narrative", text: "Saved" }],
        },
        {
          kind: "apply-modifier",
          target: "self",
          modifier: {
            id: "modifier",
            target: "armor",
            operation: "add",
            value: { kind: "constant", value: 1 },
            private: { keep: true },
          },
        },
        {
          kind: "choose",
          chooser: "self",
          bindAs: "result",
          choice: {
            id: "choice",
            prompt: "Choose",
            minimum: 1,
            maximum: 1,
            options: [
              {
                id: "option",
                label: "One",
                value: { kind: "choice", active: true },
              },
            ],
          },
        },
        {
          kind: "custom",
          rule: "private-internal-id",
          payload: { keep: true },
        },
      ];
      const action = (id) => ({
        kind: "action",
        identity: { id, name: "Fixture action", private: { keep: true } },
        components: {
          activation: "action",
          outcomes: [
            { id: id + "-outcome", effects: structuredClone(effects) },
          ],
          targets: [
            {
              kind: "area",
              area: { kind: "sphere", radius: { value: 10, unit: "foot" } },
              filters: [{ kind: "always" }],
            },
          ],
          test: { kind: "attack-roll" },
          duration: { kind: "instantaneous" },
        },
        extensions: { keep: true },
      });
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Rules fixture",
        status: "current",
        content: {},
        records: [
          {
            resourceType: "definitions",
            sourceId: "subject",
            payload: {
              kind: "item",
              identity: { id: "subject", name: "Keeper" },
              modelValues: { "aow:item-family": "aow:item-family-tool" },
              components: {
                category: "tool",
                private: { keep: true },
                actions: [action("direct"), action("sibling")],
                traits: [
                  {
                    kind: "trait",
                    identity: { id: "trait", name: "Quiet wheels" },
                    components: {
                      actions: [action("nested")],
                      triggers: [
                        {
                          event: "turn-start",
                          effects: structuredClone(effects),
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
                  actions: [action("vehicle-action")],
                },
              },
            },
          },
          {
            resourceType: "definitions",
            sourceId: "other",
            payload: {
              kind: "item",
              identity: { id: "other", name: "Spare" },
              components: { category: "tool" },
            },
          },
        ],
      };
      const original = structuredClone(draft);
      let failNext = 0,
        holdNext,
        releaseSave;
      const components = () => draft.records[0].payload.components;
      const savedEffects = () =>
        components().actions[0].components.outcomes[0].effects;
      await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
      await page.route("**/api/**", async (r) => {
        if (r.request().method() === "GET") return r.fulfill({ json: {} });
        const input = r.request().postDataJSON();
        writes.push(input);
        if (holdNext) {
          const hold = holdNext;
          holdNext = undefined;
          await hold;
        }
        if (failNext) {
          const status = failNext;
          failNext = 0;
          return r.fulfill({ status, json: { message: "Fixture failure" } });
        }
        assert.equal(input.expectedStorageRevision, draft.storageRevision);
        for (const key of ["traits", "actions", "vehicle"])
          if (Object.hasOwn(input, key))
            components()[key] = structuredClone(input[key]);
        draft.storageRevision++;
        return r.fulfill({ json: draft });
      });
      const button = (name) => page.getByRole("button", { name, exact: true });
      const link = (name) => page.getByRole("link", { name, exact: true });
      const textbox = (name) =>
        page.getByRole("textbox", { name, exact: true });
      const number = (name) =>
        page.getByRole("spinbutton", { name, exact: true });
      const select = (name) =>
        page.getByRole("combobox", { name, exact: true });
      const open = async (route) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent("subject/" + route)}`,
        );
        await page.getByRole("heading").first().waitFor();
      };
      const effectRoot = "actions/direct/rule/outcomes/0/effects";
      const save = async (type, check) => {
        await button("Save " + type).click();
        await button("Save " + type).waitFor({ state: "detached" });
        check?.();
      };
      await open(effectRoot + "/0");
      await number("Value").fill("5");
      await save("effect", () =>
        assert.equal(savedEffects()[0].amount.operands[0].value, 5),
      );
      assert.deepEqual(savedEffects()[0].amount.private, { keep: true });
      await open(effectRoot + "/1");
      await number("Size").fill("8");
      await save("effect", () =>
        assert.equal(savedEffects()[1].amount.terms[0].size, 8),
      );
      assert.deepEqual(savedEffects()[1].amount.terms[0].modifiers, [
        { kind: "keep-highest", count: 1 },
      ]);
      await open(effectRoot + "/2");
      await number("Amount").fill("3");
      await save("effect", () =>
        assert.equal(savedEffects()[2].duration.amount, 3),
      );
      await open(effectRoot + "/3");
      await link("Manage When true Effects").click();
      await link("Effect 1").click();
      await textbox("Narrative text").fill("Edited branch");
      await save("effect");
      assert.equal(savedEffects()[3].whenTrue[0].text, "Edited branch");
      assert.equal(savedEffects()[3].whenFalse[0].text, "False branch");
      for (const [index, field, label] of [
        [4, "effects", "Loop Effects"],
        [5, "onSuccess", "Success Effects"],
      ]) {
        await open(effectRoot + "/" + index);
        await link("Manage " + label).click();
        await link("Effect 1").click();
        await textbox("Narrative text").fill("Edited " + field);
        await save("effect");
        assert.equal(savedEffects()[index][field][0].text, "Edited " + field);
      }
      await open(effectRoot + "/6");
      await link("Manage Modifier").click();
      await textbox("Target path").fill("defense");
      await save("modifier");
      assert.equal(savedEffects()[6].modifier.target, "defense");
      assert.deepEqual(savedEffects()[6].modifier.private, { keep: true });
      await open(effectRoot + "/7");
      await link("Manage Choice").click();
      await textbox("Prompt").fill("Choose a path");
      await save("choice");
      assert.equal(savedEffects()[7].choice.prompt, "Choose a path");
      await open("actions/direct/rule/targets/0");
      await number("radius value").fill("15");
      await save("target");
      assert.equal(
        components().actions[0].components.targets[0].area.radius.value,
        15,
      );
      await open("actions/direct/rule/test");
      await select("D20 test kind").selectOption("saving-throw");
      await save("test");
      assert.equal(
        components().actions[0].components.test.kind,
        "saving-throw",
      );
      // All four owner adapters persist nested rules without modifying their siblings.
      for (const [owner, read] of [
        [
          "traits/trait/actions/nested",
          () =>
            components().traits[0].components.actions[0].components.outcomes[0]
              .effects,
        ],
        [
          "vehicle/actions/vehicle-action",
          () => components().vehicle.actions[0].components.outcomes[0].effects,
        ],
        [
          "traits/trait/triggers/0",
          () => components().traits[0].components.triggers[0].effects,
        ],
      ]) {
        const path =
          owner +
          "/rule/" +
          (owner.includes("/triggers/") ? "effects" : "outcomes/0/effects") +
          "/3/whenTrue/0";
        await open(path);
        await textbox("Narrative text").fill("Owner edited");
        await save("effect");
        assert.equal(read()[3].whenTrue[0].text, "Owner edited");
      }
      await open(effectRoot + "/3/whenTrue/0");
      await textbox("Narrative text").fill("Pending then saved");
      holdNext = new Promise((r) => {
        releaseSave = r;
      });
      await button("Save effect").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add effect").waitFor();
      await open(effectRoot + "/3/whenTrue/0");
      await textbox("Narrative text").fill("Keep on failure");
      failNext = 500;
      await button("Save effect").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await textbox("Narrative text").inputValue(),
        "Keep on failure",
      );
      assert.equal(await button("Save effect").isEnabled(), true);
      failNext = 409;
      await button("Save effect").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save effect").isDisabled(), true);
      assert.deepEqual(
        components().actions[1],
        original.records[0].payload.components.actions[1],
      );
      assert.deepEqual(draft.records[1], original.records[1]);
      assert.deepEqual(savedEffects()[8], effects[8]);
      assert.deepEqual(components().private, { keep: true });
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll("input,select,textarea,button")]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => ({
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
      }));
      assert.ok(layout.scroll <= width + 1, JSON.stringify(layout));
      assert.ok(
        layout.controls.every((b) => b.width >= 44 && b.height >= 44),
        JSON.stringify(layout),
      );
      await page.screenshot({
        path: `/tmp/aow-B01-rules-${width}.png`,
        fullPage: true,
      });
      const opaque = "a523fd10-c660-481b-9754-604f4202348a";
      savedEffects()[0].target = opaque;
      await open(effectRoot + "/0");
      assert.equal(
        (await page.locator("body").innerText()).includes(opaque),
        false,
      );
      const beforeReadOnly = writes.length;
      draft.status = "stale";
      await open(effectRoot + "/3/whenTrue/0");
      assert.equal(await textbox("Narrative text").isDisabled(), true);
      assert.equal(await button("Save effect").isDisabled(), true);
      assert.equal(writes.length, beforeReadOnly);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS B01 rules ${width}px: shared values/nested Effects, four owners, save/read-back/preservation, pending/500/409; fixture HTTP persistence`,
      );
    }
  } finally {
    await browser.close();
  }
});
