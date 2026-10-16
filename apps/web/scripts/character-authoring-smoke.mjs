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
  const name = `character-authoring-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CHARACTER_AUTHORING_TEST_PORT || 5212);
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
import { CharacterAuthorPage } from './CharacterAuthorPage';
import { RuleNodePage } from './RuleNodePage';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  const parts = useLocation().pathname.split('/');
  const kind = parts[4] === 'professions' ? 'profession' : 'background';
  return parts[6] === 'rule' ? <RuleNodePage catalog={kind} itemId={parts[5]} path={parts.slice(6).join('/')} basePath={parts.slice(0,6).join('/')}/> : <CharacterAuthorPage kind={kind} sourceId={parts[5]}/>;
}
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Mechanics test',status:'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
const catchAll = createRoute({getParentRoute:()=>root,path:'$'});
const route = new URLSearchParams(location.search).get('route') || '/worlds/world/item-compendium/items/subject/owner';
const router = createRouter({routeTree:root.addChildren([catchAll]),history:createMemoryHistory({initialEntries:[route]})});
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
// Production pages and routing against disposable authoritative HTTP persistence.
// This checks browser interaction; database/auth integration is checked separately.
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
      const record = (id, kind, name, components) => ({
        resourceType: "definitions",
        sourceId: id,
        payload: {
          kind,
          identity: { id, name },
          components,
          extensions: { retained: true },
        },
      });
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Character authoring",
        status: "current",
        content: { modelSchemaReleaseIds: ["model-release"], retained: true },
        effectiveModels: {
          elements: [
            { elementId: "profession-concept", semanticRole: "aow:profession" },
            { elementId: "background-concept", semanticRole: "aow:background" },
          ],
          professionRanks: [
            { key: "model:novice", name: "Novice" },
            { key: "model:master", name: "Master" },
          ],
          attributes: [{ key: "model:might", name: "Might" }],
          statistics: [],
        },
        records: [
          record("profession-secret", "profession", "Artisan", {
            expertiseOrder: ["model:novice"],
            expertiseLevels: [
              {
                tier: "model:novice",
                rank: 0,
                benefits: { retained: { value: 3 } },
              },
            ],
            acquisition: [
              { kind: "character-creation", startingExpertise: "model:novice" },
            ],
            actions: [
              {
                actionId: "action-secret",
                unlocksAt: "model:novice",
                advancementPointsOnUse: { kind: "constant", value: 1 },
              },
            ],
            retained: { value: 7 },
          }),
          record("background-secret", "background", "Apprentice", {
            attributeOptions: [],
            skillProficiencyIds: [],
            startingEquipment: [],
            characteristics: { Ideals: ["Make useful things"] },
            choices: [],
            retained: { value: 9 },
          }),
          record("action-secret", "action", "Forge", {
            activation: "action",
            outcomes: [],
          }),
          record("skill-secret", "skill", "Smithing", {
            attribute: "model:might",
          }),
          record("item-secret", "item", "Hammer", { category: "tool" }),
          record("trait-secret", "trait", "Steady hands", {}),
          {
            resourceType: "world-conditions",
            sourceId: "condition-secret",
            payload: { id: "condition-secret", name: "Resolute" },
          },
          {
            resourceType: "world-effects",
            sourceId: "effect-secret",
            payload: { id: "effect-secret", name: "Clear thinking" },
          },
        ],
      };
      const original = structuredClone(draft);
      let failNext = 0;
      const payload = (id) =>
        draft.records.find((r) => r.sourceId === id).payload;
      const components = (id) => payload(id).components;
      await page.route("**/fixture-draft", (r) => r.fulfill({ json: draft }));
      await page.route("**/api/**", async (r) => {
        if (r.request().method() === "GET") return r.fulfill({ json: {} });
        const input = r.request().postDataJSON();
        writes.push(input);
        if (failNext) {
          const status = failNext;
          failNext = 0;
          return r.fulfill({ status, json: { message: "Fixture failure" } });
        }
        assert.equal(input.expectedStorageRevision, draft.storageRevision);
        assert.ok(r.request().url().endsWith("/worlds/world/draft"));
        draft.records = structuredClone(input.records);
        draft.content = structuredClone(input.content);
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
      const profession = "professions/profession-secret",
        background = "backgrounds/background-secret";
      const open = async (route) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent("/worlds/world/characters/" + route)}`,
        );
        await page.locator("main").waitFor();
      };
      const capture = async (name) => {
        await page.evaluate(() => document.fonts.ready);
        const small = await page
          .locator(
            "main button, main a[href], main input:not([type=hidden]), main select, main textarea",
          )
          .evaluateAll((controls) =>
            controls.flatMap((control) => {
              const box = control.getBoundingClientRect();
              if (!box.width || !box.height || control.closest("[hidden]"))
                return [];
              return box.width < 44 || box.height < 44
                ? [
                    {
                      label:
                        control.getAttribute("aria-label") ||
                        control.textContent ||
                        control.tagName,
                      width: box.width,
                      height: box.height,
                    },
                  ]
                : [];
            }),
          );
        assert.deepEqual(small, [], `${name} controls have 44px touch targets`);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${name} has no horizontal overflow`,
        );
        await page.screenshot({
          path: `/tmp/aow-B03-${name}-${width}.png`,
          fullPage: true,
        });
      };
      const excludesItem = async (name) =>
        assert.ok(
          !(await select(name).locator("option").allTextContents()).some(
            (text) => text.includes("Hammer"),
          ),
          `${name} excludes unrelated Item references`,
        );
      const labels = {
        "profession-tier": "Expertise tier",
        "profession-benefits": "Benefits",
        "profession-acquisition": "Acquisition",
        "profession-action": "Action progression",
        "profession-improvement": "Improvement",
        "profession-window": "Advancement window",
        "modifier-grant": "Modifier grant",
        "background-characteristics": "Characteristics",
      };
      const save = async (type) => {
        await button("Save " + (labels[type] ?? type)).click();
        await button("Save " + (labels[type] ?? type)).waitFor({
          state: "detached",
        });
      };
      const saveOwner = async (type) => {
        const revision = draft.storageRevision;
        await Promise.all([
          button("Save " + type).click(),
          page.waitForResponse(
            (r) =>
              r.url().endsWith("/worlds/world/draft") && r.status() === 200,
          ),
        ]);
        assert.equal(draft.storageRevision, revision + 1);
      };
      if (process.env.CHARACTER_BENEFITS_ONLY === "1") {
        components("profession-secret").grantedConditions = [
          { conditionId: "unavailable-condition", private: { keep: true } },
        ];
        components("profession-secret").grantedEffects = [
          { effectId: "unavailable-effect", private: [1, 2] },
        ];
        components("background-secret").modifierGrants = [
          {
            id: "modifier-secret",
            label: "Steady craft",
            kind: "rolled-flat",
            target: { kind: "health-maximum" },
            dice: [{ count: 1, sides: 4 }],
            stacking: "add",
          },
        ];
        for (const [type, id, route] of [
          ["Profession", "profession-secret", profession],
          ["Background", "background-secret", background],
        ]) {
          const before = structuredClone(payload(id));
          await open(route);
          await textbox("Description").fill(
            `${type} description saved by form`,
          );
          if (!components(id).grantedConditions)
            await button("Add granted conditions").click();
          if (!components(id).grantedEffects)
            await button("Add granted effects").click();
          await select("Condition grant 1").selectOption({ label: "Resolute" });
          await select("Effect grant 1").selectOption({
            label: "Clear thinking",
          });
          await saveOwner(type);
          assert.deepEqual(components(id).grantedConditions, [
            {
              ...(before.components.grantedConditions?.[0] ?? {}),
              conditionId: "condition-secret",
            },
          ]);
          assert.deepEqual(components(id).grantedEffects, [
            {
              ...(before.components.grantedEffects?.[0] ?? {}),
              effectId: "effect-secret",
            },
          ]);
          assert.deepEqual(
            components(id).modifierGrants,
            before.components.modifierGrants,
          );
          assert.deepEqual(
            components(id).expertiseLevels,
            before.components.expertiseLevels,
          );
          assert.deepEqual(components(id).retained, before.components.retained);
          assert.deepEqual(payload(id).extensions, before.extensions);
          await open(route);
          assert.equal(
            await textbox("Description").inputValue(),
            `${type} description saved by form`,
          );
          assert.equal(
            await select("Condition grant 1")
              .locator("option:checked")
              .textContent(),
            "Resolute",
          );
          assert.equal(
            await select("Effect grant 1")
              .locator("option:checked")
              .textContent(),
            "Clear thinking",
          );
          await capture(`benefits-${type.toLowerCase()}`);
          await open(`${type.toLowerCase()}s`);
          const list = await page.locator("main").innerText();
          assert.ok(list.includes(`${type} description saved by form`));
          assert.ok(list.includes("Conditions: Resolute"));
          assert.ok(list.includes("Effects: Clear thinking"));
          assert.ok(
            !list.includes("condition-secret") &&
              !list.includes("effect-secret"),
          );
        }
        assert.equal(writes.length, 2);
        assert.deepEqual(errors, []);
        await page.close();
        console.log(
          `PASS benefits form save/reopen at ${width}px; grant metadata, descriptions, modifiers and private data preserved`,
        );
        continue;
      }
      await open(profession);
      await textbox("Name").fill("Master artisan");
      await saveOwner("Profession");
      assert.equal(
        payload("profession-secret").identity.name,
        "Master artisan",
      );
      delete payload("profession-secret").conformance;
      await open(profession + "/rule/expertiseLevels");
      await link("Add Expertise tier").click();
      await select("Profession rank").selectOption({ label: "Master" });
      await number("Rank number").fill("1");
      await save("profession-tier");
      assert.deepEqual(
        payload("profession-secret").conformance,
        {
          modelSchemaReleaseIds: ["model-release"],
          conceptId: "profession-concept",
        },
        "Saving a legacy child stamps its adopted Model conformance",
      );
      assert.deepEqual(components("profession-secret").expertiseOrder, [
        "model:novice",
        "model:master",
      ]);
      await open(profession + "/rule/expertiseLevels/1/benefits");
      await button("Add traits").click();
      await select("Traits 1").selectOption({ label: "Steady hands · Trait" });
      await excludesItem("Traits 1");
      await textbox("New resource name").fill("Stamina");
      await button("Add resource maximum").click();
      await save("profession-benefits");
      assert.deepEqual(
        components("profession-secret").expertiseLevels[1].benefits.traitIds,
        ["trait-secret"],
      );
      await open(
        profession + "/rule/expertiseLevels/1/benefits/modifierGrants/new",
      );
      await textbox("Modifier name").fill("Hard earned health");
      await number("Dice count 1").fill("2");
      await save("modifier-grant");
      assert.equal(
        components("profession-secret").expertiseLevels[1].benefits
          .modifierGrants[0].dice[0].count,
        2,
      );
      await open(profession + "/rule/acquisition/new");
      await select("Acquisition method").selectOption("during-play");
      await select("Starting rank").selectOption({ label: "Master" });
      await button("Add training action").click();
      await select("Training Action").selectOption({ label: "Forge · Action" });
      await save("profession-acquisition");
      assert.equal(
        components("profession-secret").acquisition[1].trainingActionId,
        "action-secret",
      );
      await open(profession + "/rule/actions/new");
      await select("Action").selectOption({ label: "Forge · Action" });
      await excludesItem("Action");
      await select("Unlocks at rank").selectOption({ label: "Master" });
      await save("profession-action");
      assert.equal(components("profession-secret").actions.length, 2);
      await open(profession + "/rule/actions/0/improvements/new");
      await select("Improvement rank").selectOption({ label: "Master" });
      await button("Add description").click();
      await textbox("Description").fill("Work with precision");
      await save("profession-improvement");
      assert.equal(
        components("profession-secret").actions[0].improvements[0].description,
        "Work with precision",
      );
      await open(profession + "/rule/actions/0/improvements/0");
      assert.equal(
        await textbox("Description").inputValue(),
        "Work with precision",
      );
      await open(background);
      await button("Add skill proficiencies").click();
      await select("Skill proficiencies 1").selectOption({
        label: "Smithing · Skill",
      });
      await excludesItem("Skill proficiencies 1");
      await button("Add starting equipment").click();
      await select("Starting equipment 1").selectOption({
        label: "Hammer · Item",
      });
      await saveOwner("Background");
      assert.deepEqual(components("background-secret").skillProficiencyIds, [
        "skill-secret",
      ]);
      await open(background + "/rule/characteristics");
      await textbox("Suggestion 1").fill("Build things to last");
      await save("background-characteristics");
      assert.deepEqual(components("background-secret").characteristics.Ideals, [
        "Build things to last",
      ]);
      await open(background + "/rule/choices/new");
      await textbox("Prompt").fill("Pick an apprenticeship");
      await save("choice");
      assert.equal(
        components("background-secret").choices[0].prompt,
        "Pick an apprenticeship",
      );
      await open(profession);
      await capture("profession-root");
      await open(profession + "/rule/expertiseLevels/1");
      await capture("profession-tier");
      await open(
        profession + "/rule/expertiseLevels/1/benefits/modifierGrants/0",
      );
      await capture("profession-grant");
      await open(background);
      await capture("background-root");
      await open(background + "/rule/characteristics");
      await capture("background-characteristics");
      await open("professions/new");
      await textbox("Name").fill("Explorer");
      await saveOwner("Profession");
      const newProfession = draft.records.find(
        (r) => r.payload.identity?.name === "Explorer",
      );
      assert.ok(newProfession);
      assert.deepEqual(newProfession.payload.components.expertiseLevels, []);
      await open(
        "professions/" + newProfession.sourceId + "/rule/expertiseLevels/new",
      );
      await select("Profession rank").selectOption({ label: "Novice" });
      await number("Rank number").fill("0");
      await save("profession-tier");
      assert.deepEqual(components(newProfession.sourceId).expertiseOrder, [
        "model:novice",
      ]);
      await open(
        "professions/" + newProfession.sourceId + "/rule/expertiseLevels/0",
      );
      assert.equal(await number("Rank number").inputValue(), "0");
      await open("backgrounds/new");
      await textbox("Name").fill("Guild orphan");
      await textbox("Description").fill("Raised by craftworkers");
      await saveOwner("Background");
      const created = draft.records.find(
        (r) => r.payload.identity?.name === "Guild orphan",
      );
      assert.ok(created);
      await open("backgrounds/" + created.sourceId);
      assert.equal(
        await textbox("Description").inputValue(),
        "Raised by craftworkers",
      );
      await open(background);
      await textbox("Description").fill("Unsaved recovery text");
      failNext = 500;
      await button("Save Background").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
        )
        .waitFor();
      assert.equal(
        await textbox("Description").inputValue(),
        "Unsaved recovery text",
      );
      await saveOwner("Background");
      await textbox("Description").fill("Conflict recovery text");
      failNext = 409;
      await button("Save Background").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
        )
        .waitFor();
      assert.equal(
        await textbox("Description").inputValue(),
        "Conflict recovery text",
      );
      assert.equal(await button("Save Background").isDisabled(), true);
      assert.equal(
        payload("background-secret").identity.description,
        "Unsaved recovery text",
      );
      await open(background);
      assert.equal(
        await textbox("Description").inputValue(),
        "Unsaved recovery text",
      );
      assert.deepEqual(
        components("profession-secret").retained,
        original.records[0].payload.components.retained,
      );
      assert.deepEqual(
        components("profession-secret").expertiseLevels[0].benefits,
        original.records[0].payload.components.expertiseLevels[0].benefits,
      );
      assert.deepEqual(payload("profession-secret").extensions, {
        retained: true,
      });
      assert.deepEqual(components("background-secret").retained, { value: 9 });
      const text = await page.locator("main").innerText();
      for (const id of [
        "background-secret",
        "profession-secret",
        "skill-secret",
        "item-secret",
      ])
        assert.ok(!text.includes(id));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No horizontal overflow",
      );
      const count = writes.length;
      draft.status = "stale";
      await open(background);
      assert.equal(await button("Save Background").isDisabled(), true);
      assert.equal(writes.length, count);
      draft.status = "current";
      const effectiveModels = draft.effectiveModels;
      draft.effectiveModels = { ...effectiveModels, elements: [] };
      for (const [path, label] of [
        [profession + "/rule/expertiseLevels/0", "Expertise tier"],
        [background + "/rule/characteristics", "Characteristics"],
      ]) {
        await open(path);
        await page.getByText(/The effective Model is unavailable/).waitFor();
        assert.equal(
          await button("Save " + label).isDisabled(),
          true,
          "Direct child saves require adopted Model",
        );
        assert.equal(writes.length, count, "Missing Model cannot write");
      }
      draft.effectiveModels = effectiveModels;
      const malformed = payload("background-secret").components;
      payload("background-secret").components = ["unsupported"];
      await open(background);
      await page.getByText(/contains unsupported data/).waitFor();
      assert.equal(await button("Save Background").count(), 0);
      assert.equal(writes.length, count);
      payload("background-secret").components = malformed;
      assert.deepEqual(errors, []);
      console.log(
        `PASS Character authoring ${width}px: nested tiers/grants/acquisition/improvements, Background references/characteristics/choices, persistence, recovery, read-only and malformed preservation`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
