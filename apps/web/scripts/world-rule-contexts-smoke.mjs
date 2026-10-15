import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
const screenshotPath =
  process.env.RULES_SCREENSHOT_PATH || join(tmpdir(), "aow-rules-movement.png");
async function withFixture(run) {
  const name = `world-rule-contexts-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.RULES_TEST_PORT || 5198);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Session shell test</title><link rel="icon" href="/favicon.svg"></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from '@tanstack/react-router';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { WorldRulesPage } from './WorldRulesPage';
import { SessionMovementPanel } from './SessionMovementPanel';
import './index.css';
const world={id:'world',name:'Clockwork World',status:'active'} as any;
const draft={id:'world-draft',storageRevision:1,revisionName:'Draft',content:{},records:[]} as any;
const root=createRootRoute({component:Outlet});
const leaf=createRoute({getParentRoute:()=>root,path:'$',component:()=> <WorldAuthoringProvider definition={{...world,accessRole:new URLSearchParams(location.search).has('readonly')?'viewer':'owner'}} initialDraft={draft}><WorldRulesPage/></WorldAuthoringProvider>});
const router=createRouter({routeTree:root.addChildren([leaf]),history:createMemoryHistory({initialEntries:[new URLSearchParams(location.search).get('path')||'/worlds/world/rules']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; import { reactPluginOptions } from './react-plugin-options.ts'; export default defineConfig({plugins:[react(reactPluginOptions),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null}});`,
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

import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const seed = () => [
  {
    formatVersion: 1,
    id: "r/one",
    name: "Movement allowance",
    revision: 1,
    lifecycle: "disabled",
    priority: 0,
    trigger: { event: "aow:movement-declared", version: 1 },
    condition: {
      kind: "all",
      predicates: [
        { kind: "not", predicate: { kind: "never" } },
        { kind: "always" },
      ],
    },
    effects: [
      { kind: "set-local", key: "cost", value: { kind: "constant", value: 2 } },
      {
        kind: "set-local",
        key: "remaining",
        value: {
          kind: "literal",
          value: {
            private: { binding: "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021" },
          },
        },
      },
    ],
    audit: { createdBy: "gm-private", updatedAt: "2026-10-13" },
  },
  {
    formatVersion: 1,
    id: "r2",
    name: "Another rule",
    revision: 1,
    lifecycle: "disabled",
    priority: 0,
    trigger: { event: "aow:movement-declared", version: 1 },
    effects: [
      {
        kind: "set-local",
        key: "other",
        value: { kind: "constant", value: 1 },
      },
    ],
    audit: { createdBy: "gm-private", updatedAt: "2026-10-13" },
  },
];
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("dialog", (dialog) => dialog.accept());
      let rules = [
          ...seed(),
          {
            ...seed()[1],
            id: "opaque-rule",
            name: "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021",
            description: "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021",
          },
          {
            ...seed()[1],
            id: "unsupported-rule",
            name: "Imported rule",
            private: { preserve: true },
          },
        ],
        revision = 1,
        writes = 0,
        fail = 0,
        delay = 0,
        failReads = false;
      const collection = () => ({
        worldDefinitionId: "world",
        draftId: "world-draft",
        storageRevision: revision,
        rules,
      });
      await page.route("**/api/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        if (path === "/api/worlds/world/draft")
          return route.fulfill({
            json: {
              id: "world-draft",
              storageRevision: revision,
              revisionName: "Draft",
              content: {},
              records: rules.map((rule) => ({
                resourceType: "world-rules",
                id: rule?.id,
                payload: rule,
              })),
            },
          });
        if (path.startsWith("/api/worlds/world/rules")) {
          if (req.method() === "GET")
            return failReads
              ? route.fulfill({
                  status: 500,
                  json: { message: "Temporary read failure." },
                })
              : route.fulfill({ json: collection() });
          const body = req.postDataJSON();
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (fail) {
            const status = fail;
            fail = 0;
            return route.fulfill({
              status,
              json: {
                message:
                  status === 409
                    ? "World draft changed."
                    : "Temporary save failure.",
              },
            });
          }
          if (
            body.expectedDraftId !== "world-draft" ||
            body.expectedStorageRevision !== revision
          )
            return route.fulfill({
              status: 409,
              json: { message: "World draft changed." },
            });
          if (req.method() === "PUT")
            rules = rules.map((rule) =>
              rule.id === body.rule.id
                ? { ...body.rule, revision: rule.revision + 1 }
                : rule,
            );
          else rules.push({ ...body.rule, id: "new-rule-" + writes });
          revision++;
          writes++;
          return route.fulfill({ json: collection() });
        }
        return route.fulfill({
          status: 404,
          json: { message: "Unexpected endpoint" },
        });
      });
      const click = async (name) =>
        page.getByRole("button", { name, exact: true }).click();
      const wait = async (name) =>
        page.getByRole("heading", { name, exact: true }).waitFor();
      try {
        await page.goto(url);
        await wait("Rules");
        await click("Edit Movement allowance");
        await wait("Edit rule");
        assert.equal(
          await page
            .getByRole("heading", { name: "World draft rules" })
            .count(),
          0,
        );
        await page
          .getByRole("textbox", { name: "Rule name", exact: true })
          .fill("Renamed allowance");
        await click("Save rule");
        await wait("Rules");
        assert.equal(rules[0].name, "Renamed allowance");
        await click("Edit Renamed allowance");
        await click("Manage effects");
        await wait("Ordered effects");
        assert.equal(
          await page
            .getByRole("combobox", { name: "Effect type", exact: true })
            .count(),
          0,
        );
        await click("Edit effect 1");
        await wait("Edit effect 1");
        await page
          .getByRole("spinbutton", { name: "Number", exact: true })
          .fill("7");
        await page.screenshot({
          path: `/tmp/aow-B04-rule-effect-${width}.png`,
          fullPage: true,
        });
        failReads = true;
        await click("Save effect");
        await wait("Ordered effects");
        failReads = false;
        assert.equal(rules[0].effects[0].value.value, 7);
        await click("Edit effect 1");
        assert.equal(
          await page
            .getByRole("spinbutton", { name: "Number", exact: true })
            .inputValue(),
          "7",
        );
        await click("Cancel");
        await page
          .getByRole("button", { name: "Move up", exact: true })
          .nth(1)
          .click();
        await page.waitForFunction(
          () => document.querySelector("h1")?.textContent === "Ordered effects",
        );
        await page.waitForTimeout(150);
        assert.equal(rules[0].effects[0].key, "remaining");
        await click("Add effect");
        await wait("Add effect");
        await page
          .getByRole("textbox", { name: "Local name", exact: true })
          .fill("bonus");
        await click("Save effect");
        await wait("Ordered effects");
        assert.equal(rules[0].effects[2].key, "bonus");
        await page
          .getByRole("button", { name: "Remove effect", exact: true })
          .nth(2)
          .click();
        await page.waitForTimeout(150);
        assert.equal(rules[0].effects.length, 2);
        await click("Back to rule");
        await click("Manage conditions");
        await wait("Conditions");
        await page
          .getByRole("button", { name: "Manage child conditions", exact: true })
          .first()
          .click();
        await wait("Conditions");
        await click("Edit condition 1");
        await wait("Edit condition");
        await page
          .getByRole("combobox", { name: "Condition", exact: true })
          .selectOption("always");
        await click("Save condition");
        await wait("Conditions");
        assert.equal(rules[0].condition.predicates[0].predicate.kind, "always");
        await click("Back to conditions");
        await click("Add condition");
        await wait("Add condition");
        await page
          .getByRole("combobox", { name: "Condition", exact: true })
          .selectOption("compare");
        await page
          .getByRole("spinbutton", { name: "Number", exact: true })
          .first()
          .fill("3");
        await page
          .getByRole("spinbutton", { name: "Number", exact: true })
          .nth(1)
          .fill("4");
        await page.screenshot({
          path: `/tmp/aow-B04-rule-condition-${width}.png`,
          fullPage: true,
        });
        await click("Save condition");
        await wait("Conditions");
        assert.equal(rules[0].condition.predicates[2].left.value, 3);
        await page
          .getByRole("button", { name: "Move up", exact: true })
          .nth(2)
          .click();
        await page.waitForTimeout(150);
        assert.equal(rules[0].condition.predicates[1].kind, "compare");
        await page
          .getByRole("button", { name: "Remove condition", exact: true })
          .nth(2)
          .click();
        await page.waitForTimeout(150);
        assert.equal(rules[0].condition.predicates.length, 2);
        await click("Back to rule");
        await page
          .getByRole("textbox", { name: "Rule name", exact: true })
          .fill("Cancelled name");
        await click("Cancel");
        await wait("Rules");
        assert.equal(rules[0].name, "Renamed allowance");
        await click("Edit Renamed allowance");
        await page
          .getByRole("textbox", { name: "Rule name", exact: true })
          .fill("After retry");
        fail = 500;
        await click("Save rule");
        await page
          .getByRole("alert")
          .filter({ hasText: "Temporary save failure." })
          .waitFor();
        assert.equal(
          await page
            .getByRole("textbox", { name: "Rule name", exact: true })
            .inputValue(),
          "After retry",
        );
        delay = 500;
        await click("Save rule");
        assert.equal(
          await page
            .getByRole("button", { name: "Cancel", exact: true })
            .isDisabled(),
          true,
        );
        await wait("Rules");
        delay = 0;
        assert.equal(rules[0].name, "After retry");
        await click("Edit After retry");
        await page
          .getByRole("textbox", { name: "Rule name", exact: true })
          .fill("Conflicted");
        revision++;
        await click("Save rule");
        await page
          .getByRole("alert")
          .filter({ hasText: "World draft changed." })
          .waitFor();
        assert.equal(
          await page
            .getByRole("textbox", { name: "Rule name", exact: true })
            .inputValue(),
          "Conflicted",
        );
        assert.equal(rules[0].name, "After retry");
        await click("Refresh rules");
        await wait("Rules");
        await click("Create rule");
        await wait("Add rule");
        await page
          .getByRole("textbox", { name: "Rule name", exact: true })
          .fill("Created rule");
        await click("Create rule");
        await wait("Rules");
        assert.ok(rules.some((rule) => rule.name === "Created rule"));
        const geometry = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          small: [...document.querySelectorAll("button,input,select")]
            .filter(
              (el) =>
                el.getBoundingClientRect().height > 0 &&
                el.getBoundingClientRect().height < 44,
            )
            .map((el) => el.textContent),
        }));
        assert.equal(geometry.overflow, false);
        assert.deepEqual(geometry.small, []);
        assert.deepEqual(rules[0].effects[0].value, {
          kind: "literal",
          value: {
            private: { binding: "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021" },
          },
        });
        assert.deepEqual(
          rules.find((rule) => rule.id === "unsupported-rule").private,
          { preserve: true },
        );
        assert.equal(
          (await page.locator("body").innerText()).includes(
            "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021",
          ),
          false,
        );
        await click("Edit Unnamed rule");
        await wait("Edit rule");
        assert.equal(
          (await page.locator("body").innerText()).includes(
            "e6f5b6be-3b6b-47af-b81d-a0d97a8d1021",
          ),
          false,
        );
        await click("Cancel");
        await wait("Rules");
        rules.push(
          null,
          { ...seed()[1], id: "malformed-effects", effects: undefined },
          { ...seed()[1], id: "malformed-group", condition: { kind: "all" } },
        );
        await page.goto(
          url +
            "?path=" +
            encodeURIComponent("/worlds/world/rules/r%2Fone/edit"),
        );
        await wait("Edit rule");
        await click("Cancel");
        await wait("Rules");
        for (const path of [
          "malformed-effects/effects/new",
          "malformed-group/conditions/new",
        ]) {
          await page.goto(
            url + "?path=" + encodeURIComponent("/worlds/world/rules/" + path),
          );
          await wait("Rule unavailable");
        }
        const writesBefore = writes;
        await page.goto(
          url +
            "?path=" +
            encodeURIComponent(
              "/worlds/world/rules/unsupported-rule/effects/1/edit",
            ),
        );
        await wait("Rule unavailable");
        assert.equal(writes, writesBefore);
        await page.goto(url + "?readonly=1");
        await wait("Rules");
        await page
          .getByText(
            "This World has no working draft, so published content is read only.",
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Create rule", exact: true })
            .count(),
          0,
        );
        assert.equal(rules[1].name, "Another rule");
        assert.deepEqual(errors, []);
        console.log(
          `World-rule contexts ${width}px: save/readback/reopen, nested conditions, effects/order/remove, preservation, Cancel, pending/500/409, create and read-only passed (${writes} writes).`,
        );
      } catch (error) {
        console.error(await page.locator("body").innerText());
        console.error(errors);
        throw error;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
