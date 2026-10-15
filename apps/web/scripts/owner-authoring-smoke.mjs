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
  const name = `owner-authoring-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.OWNER_AUTHORING_TEST_PORT || 5208);
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
import { ActorCatalogPage } from './ActorCatalogPage';
import { RuleNodePage } from './RuleNodePage';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  const parts = useLocation().pathname.split('/');
  if(parts[4] === 'catalog-monsters' || parts[4] === 'catalog-characters') {
    const kind = parts[4] === 'catalog-monsters' ? 'monster' : 'character-template';
    return parts[6] === 'rule' ? <RuleNodePage catalog={kind} itemId={parts[5]} path={parts.slice(6).join('/')} basePath={parts.slice(0,6).join('/')}/> : <ActorCatalogPage kind={kind} sourceId={parts[5]}/>;
  }
  return <ItemMechanicsPage itemId={parts[5] || 'subject'} path={parts.slice(6).join('/') || 'owner'}/>;
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

// Production forms/router over disposable authoritative HTTP persistence.
// Database/authentication acceptance remains separate from this browser fixture.
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
      const action = (id) => ({
        kind: "action",
        identity: { id, name: "Strike" },
        components: {
          activation: "action",
          outcomes: [
            {
              id: id + "-outcome",
              effects: [{ kind: "narrative", text: "Keep narrative" }],
            },
          ],
        },
        extensions: { keep: true },
      });
      const trait = (id) => ({
        kind: "trait",
        identity: { id, name: "Survivor" },
        components: {
          actions: [action(id + "-action")],
          triggers: [
            {
              event: "turn-start",
              effects: [{ kind: "narrative", text: "Trigger" }],
            },
          ],
        },
      });
      const record = (sourceId, kind, components, name = sourceId) => ({
        resourceType: "definitions",
        sourceId,
        payload: {
          kind,
          identity: { id: sourceId, name },
          components,
          extensions: { private: true },
        },
      });
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Owner fixture",
        status: "current",
        content: { private: { keep: true } },
        records: [
          record(
            "subject",
            "item",
            {
              category: "tool",
              quality: "fine",
              private: { keep: true },
              prerequisites: [
                { kind: "all", predicates: [{ kind: "always" }] },
              ],
              modifiers: [
                {
                  id: "modifier",
                  target: "defense",
                  operation: "add",
                  value: { kind: "constant", value: 1 },
                  predicate: { kind: "always" },
                },
              ],
              attunement: {
                required: true,
                countsAgainstLimit: false,
                prerequisites: [{ kind: "always" }],
              },
              capacity: {
                maximum: { kind: "constant", value: 6 },
                recharge: {
                  timing: "dawn",
                  amount: { terms: [{ kind: "dice", count: 1, size: 6 }] },
                },
                destroyedWhenEmpty: false,
              },
              crafting: {
                time: { kind: "constant", value: 8 },
                cost: [{ denomination: "gp", amount: 5 }],
                ingredients: [
                  {
                    itemId: "other",
                    quantity: { kind: "constant", value: 2 },
                    consumed: true,
                    private: { keep: true },
                  },
                ],
                toolProficiencies: ["smith"],
                check: "smithing",
                produces: [
                  {
                    itemId: "subject",
                    quantity: { kind: "constant", value: 1 },
                  },
                ],
                private: { keep: true },
              },
            },
            "Keeper",
          ),
          record(
            "other",
            "item",
            { category: "trade-good", quality: "standard" },
            "Iron ingot",
          ),
          record(
            "beast",
            "monster",
            {
              size: "medium",
              classification: { nature: "organism", aliases: [] },
              defenseRating: { terms: [{ kind: "dice", count: 1, size: 20 }] },
              hitPoints: {
                average: 10,
                formula: { terms: [{ kind: "dice", count: 2, size: 6 }] },
              },
              attributes: {},
              challengeRating: 1,
              actions: [action("direct")],
              bonusActions: [action("bonus")],
              reactions: [action("reaction")],
              legendaryActions: [action("legendary")],
              mythicActions: [action("mythic")],
              lairActions: [action("lair")],
              traits: [trait("trait")],
              regionalEffects: [trait("regional")],
              skills: [{ skillDefinitionId: "skill", bonus: 2 }],
              speeds: [{ mode: "walk", distance: { value: 30, unit: "foot" } }],
              damageAdjustments: [
                { damageType: "fire", response: "resistance" },
              ],
              senses: [{ sense: "sight" }],
              communicationCapabilities: [
                {
                  medium: "acoustic",
                  directionality: "bidirectional",
                  operatingBasis: "unknown",
                  understanding: "unknown",
                },
              ],
              disciplines: { sources: [] },
              private: { keep: true },
            },
            "Wolf",
          ),
          record(
            "character",
            "character-template",
            {
              attributeDefaults: {},
              traits: [trait("character-trait")],
              choices: [
                {
                  id: "choice",
                  prompt: "Choose training",
                  minimum: 1,
                  maximum: 1,
                  options: [
                    {
                      id: "option",
                      label: "Smith",
                      value: "smith",
                      prerequisites: [{ kind: "always" }],
                    },
                  ],
                },
              ],
              attributeGeneration: {
                kind: "standard-array",
                values: [60, 55, 50, 45, 40, 35],
              },
              private: { keep: true },
            },
            "Adventurer",
          ),
          record(
            "skill",
            "skill",
            { attribute: "aow:attribute-might" },
            "Athletics",
          ),
        ],
      };
      const original = structuredClone(draft);
      let failNext = 0,
        holdNext,
        releaseSave;
      const payload = (id) =>
        draft.records.find((r) => r.sourceId === id).payload;
      const components = (id) => payload(id).components;
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
        assert.equal(r.request().method(), "PUT");
        assert.ok(r.request().url().endsWith("/worlds/world/draft"));
        assert.ok(Array.isArray(input.records));
        draft.records = structuredClone(input.records);
        draft.content = structuredClone(input.content);
        draft.revisionName = input.revisionName;
        draft.storageRevision++;
        return r.fulfill({ json: draft });
      });
      const button = (name) => page.getByRole("button", { name, exact: true }),
        link = (name) => page.getByRole("link", { name, exact: true }),
        textbox = (name) => page.getByRole("textbox", { name, exact: true }),
        number = (name) => page.getByRole("spinbutton", { name, exact: true }),
        select = (name) => page.getByRole("combobox", { name, exact: true });
      const item = "item-compendium/items/subject",
        beast = "bestiary/catalog-monsters/beast",
        character = "characters/catalog-characters/character";
      const open = async (route) => {
        await page.goto(
          `${fixtureUrl}?route=${encodeURIComponent("/worlds/world/" + route)}`,
        );
        await page.getByRole("heading").first().waitFor();
      };
      const save = async (type) => {
        await button("Save " + type).click();
        await button("Save " + type).waitFor({ state: "detached" });
      };
      await open(item + "/owner");
      await link("Manage Crafting").click();
      await number("Value").fill("10");
      await save("crafting");
      assert.equal(components("subject").crafting.time.value, 10);
      await open(item + "/owner/crafting/ingredients/0");
      assert.equal(await select("Ingredient Item").inputValue(), "1");
      await number("Value").fill("3");
      await save("ingredient");
      assert.equal(
        components("subject").crafting.ingredients[0].quantity.value,
        3,
      );
      assert.deepEqual(components("subject").crafting.ingredients[0].private, {
        keep: true,
      });
      await open(item + "/owner/crafting/toolProficiencies/0");
      await textbox("Tool proficiency").fill("jeweler");
      await save("tool proficiency");
      assert.equal(
        components("subject").crafting.toolProficiencies[0],
        "jeweler",
      );
      await open(item + "/owner/crafting/cost/0");
      await number("Amount").fill("8");
      await save("currency");
      assert.equal(components("subject").crafting.cost[0].amount, 8);
      await open(item + "/owner/crafting/produces/0");
      await number("Value").fill("2");
      await save("product");
      assert.equal(
        components("subject").crafting.produces[0].quantity.value,
        2,
      );
      await open(item + "/owner/capacity");
      await number("Size").fill("8");
      await save("capacity");
      assert.equal(
        components("subject").capacity.recharge.amount.terms[0].size,
        8,
      );
      await open(item + "/owner/attunement");
      await select("Counts against attunement limit").selectOption("true");
      await save("attunement");
      assert.equal(components("subject").attunement.countsAgainstLimit, true);
      await open(item + "/owner/modifiers/0");
      await textbox("Target path").fill("resistance");
      await save("modifier");
      assert.equal(components("subject").modifiers[0].target, "resistance");
      await open(item + "/owner/prerequisites/0");
      await link("Manage Children").click();
      await link("Predicate 1").click();
      await save("predicate");
      assert.deepEqual(components("subject").prerequisites[0].predicates, [
        { kind: "always" },
      ]);
      // Each action owner writes only its own definition. Traits use the same nested grammar.
      for (const collection of [
        "actions",
        "bonusActions",
        "reactions",
        "legendaryActions",
        "mythicActions",
        "lairActions",
      ]) {
        await open(
          beast + `/rule/${collection}/0/components/outcomes/0/effects/0`,
        );
        await textbox("Narrative text").fill("Edited " + collection);
        await save("effect");
        assert.equal(
          components("beast")[collection][0].components.outcomes[0].effects[0]
            .text,
          "Edited " + collection,
        );
      }
      for (const collection of ["traits", "regionalEffects"]) {
        await open(
          beast + `/rule/${collection}/0/components/triggers/0/effects/0`,
        );
        await textbox("Narrative text").fill("Edited " + collection);
        await save("effect");
        assert.equal(
          components("beast")[collection][0].components.triggers[0].effects[0]
            .text,
          "Edited " + collection,
        );
      }
      await open(beast + "/rule/skills/0");
      await number("Bonus").fill("4");
      await save("skill");
      assert.equal(components("beast").skills[0].bonus, 4);
      await open(beast + "/rule/speeds/0");
      await number("Speed value").fill("40");
      await save("speed");
      assert.equal(components("beast").speeds[0].distance.value, 40);
      await open(beast + "/rule/senses/0");
      await textbox("Sense").fill("hearing");
      await save("sense");
      assert.equal(components("beast").senses[0].sense, "hearing");
      await open(character + "/rule/choices/0/options/0");
      await textbox("Label").fill("Artisan");
      await save("option");
      assert.equal(
        components("character").choices[0].options[0].label,
        "Artisan",
      );
      await open(
        character +
          "/rule/traits/0/components/actions/0/components/outcomes/0/effects/0",
      );
      await textbox("Narrative text").fill("Character action");
      await save("effect");
      assert.equal(
        components("character").traits[0].components.actions[0].components
          .outcomes[0].effects[0].text,
        "Character action",
      );
      await open(character + "/rule/attributeGeneration");
      await save("attribute-generation");
      assert.deepEqual(
        components("character").attributeGeneration.values,
        [60, 55, 50, 45, 40, 35],
      );
      // Creation uses the same full-record endpoint and leaves existing catalog records intact.
      for (const [path, name] of [
        ["bestiary/catalog-monsters/new", "New creature"],
        ["characters/catalog-characters/new", "New character template"],
      ]) {
        await open(path);
        await textbox("Name").fill(name);
        await button("Save definition").click();
        await page
          .getByRole("heading", {
            name: path.startsWith("bestiary")
              ? "Edit catalog Creature"
              : "Edit Character template",
            exact: true,
          })
          .waitFor();
        assert.equal(
          draft.records.filter((r) => r.payload.identity.name === name).length,
          1,
        );
      }
      await open(item + "/owner/crafting/toolProficiencies/0");
      await textbox("Tool proficiency").fill("Pending proficiency");
      holdNext = new Promise((r) => (releaseSave = r));
      await button("Save tool proficiency").click();
      assert.equal(await button("Cancel").isDisabled(), true);
      releaseSave();
      await link("Add tool proficiency").waitFor();
      await open(item + "/owner/crafting/toolProficiencies/0");
      await textbox("Tool proficiency").fill("Keep on failure");
      failNext = 500;
      await button("Save tool proficiency").click();
      await page
        .getByText(
          "These changes could not be saved. Check the fields and try again.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await textbox("Tool proficiency").inputValue(),
        "Keep on failure",
      );
      assert.equal(await button("Save tool proficiency").isEnabled(), true);
      failNext = 409;
      await button("Save tool proficiency").click();
      await page
        .getByText(
          "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button("Save tool proficiency").isDisabled(), true);
      const layout = await page.evaluate(() => ({
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
        layout.controls.every((c) => c.width >= 44 && c.height >= 44),
        JSON.stringify(layout),
      );
      await page.screenshot({
        path: `/tmp/aow-B02-owners-${width}.png`,
        fullPage: true,
      });
      const opaque = "a523fd10-c660-481b-9754-604f4202348a";
      components("subject").crafting.check = opaque;
      await open(item + "/owner/crafting");
      assert.equal(
        (await page.locator("body").innerText()).includes(opaque),
        false,
      );
      const beforeReadOnly = writes.length;
      draft.status = "stale";
      await open(item + "/owner/crafting/toolProficiencies/0");
      assert.equal(await textbox("Tool proficiency").isDisabled(), true);
      assert.equal(await button("Save tool proficiency").isDisabled(), true);
      assert.equal(writes.length, beforeReadOnly);
      assert.deepEqual(draft.content, {
        ...original.content,
        definitionIds: draft.records
          .filter((r) =>
            ["New creature", "New character template"].includes(
              r.payload.identity.name,
            ),
          )
          .map((r) => r.sourceId),
      });
      assert.deepEqual(payload("other"), original.records[1].payload);
      assert.deepEqual(payload("subject").extensions, { private: true });
      assert.deepEqual(components("subject").private, { keep: true });
      assert.deepEqual(components("beast").private, { keep: true });
      assert.deepEqual(components("character").private, { keep: true });
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS B02 owners ${width}px: Item fields, six Creature action owners, Traits/regional/Character choices, catalog create, save/readback/preservation, pending/500/409/read-only; fixture HTTP persistence`,
      );
    }
  } finally {
    await browser.close();
  }
});
