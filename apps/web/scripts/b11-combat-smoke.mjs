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
  process.env.SESSION_SCREENSHOT_PATH || join(tmpdir(), "aow-b11-combat.png");
async function withFixture(run) {
  const name = `b11-combat-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.B11_TEST_PORT || 5198);
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
      `import {createRoot} from 'react-dom/client';
import {SessionCombatPanel} from './SessionCombatPanel';
import './index.css';
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:900,margin:'auto',padding:16}}><SessionCombatPanel campaignDefinitionId={new URLSearchParams(location.search).has('player')?undefined:'campaign'} campaignInstanceId="instance" sessionId="session"/></main>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; import { reactPluginOptions } from './react-plugin-options'; export default defineConfig({cacheDir:'node_modules/.vite-${name}',plugins:[react(reactPluginOptions),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,watch:null}});`,
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
    await rm(join(webRoot, "node_modules", `.vite-${name}`), {
      recursive: true,
      force: true,
    });
  }
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const formula = [
  {
    source: { kind: "base", id: "base", name: "Base roll" },
    label: "Base",
    terms: [{ kind: "dice", count: 1, sides: 20, sign: 1 }],
  },
];
const profile = {
  attackCost: { kind: "free" },
  reactions: [],
  attack: formula,
  defense: formula,
  damage: formula,
  resistance: formula,
  might: formula,
  reachSquares: 1,
  movementCheckpoints: 6,
  resources: {},
  rules: [],
  pairings: [],
};
const actor = (id, name, x) => ({
  entityId: id,
  name,
  hp: 12,
  maxHp: 12,
  profile,
  controllerIds: [],
  playerControlled: false,
  visibleToPlayers: true,
  position: { sceneId: "scene-private", point: { x, y: 0 } },
});
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      let encounter = {
        schemaVersion: 2,
        identity: { id: "encounter-private" },
        revision: 1,
        name: "Bridge ambush",
        phase: "planning",
        paused: false,
        round: 1,
        slot: 0,
        combatants: [
          actor("actor-private", "Aster", 0),
          actor("enemy-private", "Guard", 1),
        ],
        simulated: [
          actor("actor-private", "Aster", 0),
          actor("enemy-private", "Guard", 1),
        ],
        plans: {},
        history: [],
        processedCommandIds: [],
        environment: { grid: "square", scale: { value: 5, unit: "feet" } },
      };
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let fail = false;
      await page.route("**/api/**", async (route) => {
        const body = route.request().postDataJSON();
        if (body) {
          if (fail) {
            fail = false;
            return route.fulfill({ status: 409, json: { message: "stale" } });
          }
          const c = body.command;
          assert.equal(c.expectedRevision, encounter.revision);
          assert.equal(body.idempotencyKey, c.commandId);
          assert.equal(body.expectedRuntimeRevision, encounter.revision);
          if (c.kind === "edit-plan")
            encounter.plans[c.combatantId] = {
              activities: c.activities,
              cursor: 0,
              movementUsed: 0,
              pathIndex: 0,
              submitted: false,
              revision: (encounter.plans[c.combatantId]?.revision ?? 0) + 1,
              armed: [],
            };
          if (c.kind === "submit-plan")
            encounter.plans[c.combatantId].submitted = true;
          if (c.kind === "lock") encounter.phase = "locked";
          if (c.kind === "step") {
            encounter.phase = "adjudication";
            encounter.slot = 1;
            encounter.conflict = {
              id: "conflict-private",
              slot: 1,
              kind: "timing",
              actorIds: ["actor-private", "enemy-private"],
              description: "Aster attacks while Guard moves.",
              facts: [
                "Aster can reach Guard at the start of the slot.",
                "Guard may move out of reach.",
              ],
              choices: ["before", "after", "simultaneous", "custom"],
            };
          }
          if (c.kind === "adjudicate") {
            assert.equal(c.choice, "custom");
            assert.equal(c.outcomes[0].hp, 7);
            assert.deepEqual(c.outcomes[0].position.point, { x: 2, y: 1 });
            assert.equal(c.outcomes[0].prone, true);
            assert.equal(c.outcomes[0].removed, false);
            encounter.phase = "review";
            encounter.conflict = undefined;
            encounter.simulated[1].hp = 7;
            encounter.history.push({
              round: 1,
              slot: 1,
              text: "The GM resolved the attack.",
              visibility: "public",
              actorIds: [],
            });
          }
          if (c.kind === "publish") {
            encounter.phase = "published";
            encounter.combatants = structuredClone(encounter.simulated);
          }
          if (c.kind === "next-round") {
            encounter.phase = "planning";
            encounter.round++;
            encounter.plans = {};
          }
          if (c.kind === "change-combatant") {
            const a = encounter.combatants.find(
              (a) => a.entityId === c.combatantId,
            );
            if (c.hp !== undefined) a.hp = c.hp;
            if (c.incapacitation !== undefined)
              a.incapacitation = c.incapacitation;
          }
          if (c.kind === "pause") encounter.paused = true;
          if (c.kind === "resume") encounter.paused = false;
          encounter.revision++;
        }
        await route.fulfill({
          json: { runtimeRevision: encounter.revision, encounter },
        });
      });
      await page.goto(url);
      await page.getByText("Bridge ambush · Round 1 · Planning").waitFor();
      const first = page.getByRole("article").first();
      await first.getByText("Add activity", { exact: true }).click();
      await first
        .getByLabel("Activity", { exact: true })
        .selectOption("attack");
      await first
        .getByLabel("Target", { exact: true })
        .selectOption("enemy-private");
      await first.getByRole("button", { name: "Add activity to plan" }).click();
      await first.getByRole("button", { name: "Add activity to plan" }).click();
      await first
        .getByRole("button", { name: "Move activity 2 earlier" })
        .click();
      fail = true;
      await first
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Combat changed" })
        .waitFor();
      assert.equal(await first.getByRole("listitem").count(), 2);
      await page.getByRole("button", { name: "Refresh combat" }).click();
      await first
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await first
        .getByRole("button", { name: "Submit plan", exact: true })
        .click();
      await first.getByText("Submitted", { exact: false }).waitFor();
      await page
        .getByRole("button", { name: "End planning & lock submitted plans" })
        .click();
      await page.getByRole("button", { name: "Resolve next slot" }).click();
      await page
        .getByLabel("Resolution", { exact: true })
        .selectOption("custom");
      await page.getByLabel("Affected actor").selectOption("enemy-private");
      await page.getByLabel("Resulting HP").fill("7");
      await page.getByLabel("Resulting square X", { exact: true }).fill("2");
      await page.getByLabel("Resulting square Y", { exact: true }).fill("1");
      await page
        .getByLabel("Prone state", { exact: true })
        .selectOption("true");
      await page
        .getByLabel("Encounter presence", { exact: true })
        .selectOption("false");
      await page.getByRole("button", { name: "Set custom result" }).click();
      await page
        .getByLabel("Reason (optional)")
        .fill("The guard is caught at the bridge.");
      await page.getByRole("button", { name: "Preview consequences" }).click();
      await page
        .getByRole("button", { name: "Apply decision & continue" })
        .click();
      await page.getByText("Guard: 7/12 HP").waitFor();
      assert.match(
        await page.getByRole("article").nth(1).innerText(),
        /12\/12 HP/,
      );
      await page.getByRole("button", { name: "Publish round outcome" }).click();
      await page
        .getByRole("article")
        .nth(1)
        .getByText("Guard · 7/12 HP")
        .waitFor();
      await page.getByRole("button", { name: "Start next round" }).click();
      await page.getByRole("button", { name: "Pause combat" }).click();
      await page.getByRole("button", { name: "Resume combat" }).click();
      await page.getByText("GM combatant corrections", { exact: true }).click();
      await page
        .getByLabel("Combatant to correct", { exact: true })
        .selectOption("actor-private");
      await page.getByLabel("Corrected HP", { exact: true }).fill("0");
      await page
        .getByLabel("Corrected consciousness", { exact: true })
        .selectOption("unconscious");
      await page
        .getByRole("button", { name: "Record combatant correction" })
        .click();
      await page
        .getByRole("article")
        .first()
        .getByText("Aster · 0/12 HP", { exact: true })
        .waitFor();
      assert.equal(encounter.combatants[0].incapacitation, "unconscious");

      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /actor-private|enemy-private|conflict-private|encounter-private/,
      );
      assert.deepEqual(errors, []);
      const small = await page
        .locator("button:visible")
        .evaluateAll((elements) =>
          elements
            .filter((e) => e.getBoundingClientRect().height < 44)
            .map((e) => e.textContent),
        );
      assert.deepEqual(small, []);
      await page.screenshot({
        path: join(tmpdir(), `aow-b11-combat-${viewport.width}.png`),
        fullPage: true,
      });
      await page.close();
      const setupPage = await browser.newPage({ viewport });
      setupPage.setDefaultTimeout(10000);
      let created;
      await setupPage.route("**/api/**", async (route) => {
        const body = route.request().postDataJSON();
        if (body) {
          created = body.setup;
          assert.equal(created.combatants[0].profile.attackCost.kind, "free");
          assert.equal(
            created.combatants[0].profile.attack[0].source.id,
            "base",
          );
          assert.equal(
            created.combatants[0].profile.resistance[0].terms[0].value,
            0,
          );
          assert.equal(created.combatants[0].profile.resources.Focus, 2);
          assert.equal(
            created.combatants[0].profile.roundResourceLimits.Focus,
            2,
          );
          assert.equal(
            created.combatants[0].profile.rules[1].kind,
            "death-save",
          );
          assert.equal(
            created.combatants[0].profile.rules[2].completion
              .sameRoundAttackCost.kind,
            "free",
          );
          assert.equal(
            created.combatants[0].profile.rules[0].cost.resource,
            "Focus",
          );
        }
        await route.fulfill({
          json: {
            runtimeRevision: 1,
            encounter: created ? encounter : null,
            setupActors: [
              {
                entityId: "actor-private",
                name: "Aster",
                controllerIds: [],
                position: actor("actor-private", "Aster", 0).position,
                sources: [{ kind: "base", id: "base", name: "Base roll" }],
              },
            ],
            controllers: [{ id: "player-private", name: "River" }],
          },
        });
      });
      await setupPage.goto(url);
      await setupPage
        .getByLabel("Encounter name", { exact: true })
        .fill("Bridge ambush");
      await setupPage
        .getByLabel("Add actor", { exact: true })
        .selectOption("actor-private");
      await setupPage.getByLabel("Current HP", { exact: true }).fill("12");
      await setupPage.getByLabel("Maximum HP", { exact: true }).fill("12");
      await setupPage
        .getByLabel("Controller", { exact: true })
        .selectOption("player-private");
      for (const name of [
        "Attack",
        "Defense",
        "Damage",
        "Resistance",
        "Might",
      ]) {
        await setupPage
          .locator("summary")
          .filter({ hasText: new RegExp("^" + name + " ·") })
          .click();
        await setupPage
          .getByLabel(name + " source", { exact: true })
          .selectOption("0");
        await setupPage
          .getByLabel(name + " dice or constant", { exact: true })
          .fill(name === "Resistance" ? "0" : "1d20 + 2");
        await setupPage
          .getByRole("button", {
            name: "Add " + name.toLowerCase() + " contribution",
            exact: true,
          })
          .click();
      }
      await setupPage
        .getByLabel("Reach (5-foot squares)", { exact: true })
        .fill("1");
      await setupPage
        .getByLabel("Attack cost", { exact: true })
        .selectOption("free");
      await setupPage.getByText("Resource capacity", { exact: true }).click();
      await setupPage
        .getByLabel("Resource name", { exact: true })
        .fill("Focus");
      await setupPage.getByLabel("Available uses", { exact: true }).fill("2");
      await setupPage
        .getByLabel("Resource recovery", { exact: true })
        .selectOption("round");
      await setupPage
        .getByRole("button", { name: "Set resource capacity" })
        .click();
      await setupPage
        .getByText("Potion, spell & interaction completion rules", {
          exact: true,
        })
        .click();
      await setupPage.getByLabel("Rule name", { exact: true }).fill("Mend");
      await setupPage
        .getByLabel("Rule activity", { exact: true })
        .selectOption("spell");
      await setupPage
        .getByLabel("Completion", { exact: true })
        .selectOption("apply-hp");
      await setupPage
        .getByLabel("HP change (negative for damage)", { exact: true })
        .fill("3");
      await setupPage
        .getByLabel("Rule cost", { exact: true })
        .selectOption("resource");
      await setupPage
        .getByLabel("Rule resource", { exact: true })
        .selectOption("Focus");
      await setupPage.getByLabel("Rule cost amount", { exact: true }).fill("1");
      await setupPage
        .getByRole("button", { name: "Apply rule resource cost" })
        .click();
      await setupPage
        .getByRole("button", { name: "Add completion rule" })
        .click();
      await setupPage
        .getByLabel("Rule name", { exact: true })
        .fill("Survival check");
      await setupPage
        .getByLabel("Rule activity", { exact: true })
        .selectOption("death-save");
      await setupPage
        .getByLabel("Rule cost", { exact: true })
        .selectOption("free");
      await setupPage
        .getByRole("button", { name: "Add completion rule" })
        .click();
      await setupPage
        .getByLabel("Rule name", { exact: true })
        .fill("Call companion");
      await setupPage
        .getByLabel("Rule activity", { exact: true })
        .selectOption("summon");
      await setupPage
        .getByLabel("Summoned actor participation", { exact: true })
        .selectOption("same-round");
      await setupPage
        .getByLabel("Summoned attack cost", { exact: true })
        .selectOption("free");
      await setupPage
        .getByRole("button", { name: "Add completion rule" })
        .click();
      await setupPage
        .getByRole("button", { name: "Add to encounter", exact: true })
        .click();
      await setupPage
        .getByRole("button", { name: "Create encounter", exact: true })
        .click();
      await setupPage.getByText("Bridge ambush · Round 2 · Planning").waitFor();
      assert.equal(created.combatants[0].controllerIds[0], "player-private");
      await setupPage.close();
      const playerPage = await browser.newPage({ viewport });
      playerPage.setDefaultTimeout(10000);
      const owned = {
        entityId: "actor-private",
        name: "Aster",
        hp: 12,
        maxHp: 12,
        plan: {
          activities: [],
          cursor: 0,
          movementUsed: 0,
          pathIndex: 0,
          submitted: false,
          revision: 0,
          armed: [],
        },
        availableActivities: [],
        availableReactions: [{ id: "block-private", name: "Block" }],
      };
      await playerPage.route("**/api/**", async (route) => {
        const body = route.request().postDataJSON();
        if (body) {
          assert.match(new URL(route.request().url()).pathname, /\/me\//);
          assert.equal(body.command.kind, "edit-plan");
          assert.equal(body.command.activities[0].ruleId, "block-private");
          assert.equal(body.command.activities[0].response.defense, undefined);
          owned.plan.activities = body.command.activities;
        }
        await route.fulfill({
          json: {
            runtimeRevision: 1,
            encounter: {
              name: "Bridge ambush",
              phase: "planning",
              paused: false,
              round: 2,
              revision: 1,
              combatants: [owned],
              history: [],
            },
          },
        });
      });
      await playerPage.goto(url + "?player");
      await playerPage.getByText("Add activity", { exact: true }).click();
      await playerPage
        .getByLabel("Activity", { exact: true })
        .selectOption("reaction");
      await playerPage
        .getByLabel("Defense reaction", { exact: true })
        .selectOption("block-private");
      await playerPage
        .getByRole("button", { name: "Add activity to plan" })
        .click();
      await playerPage
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await playerPage.getByText("Combat saved.", { exact: true }).waitFor();
      assert.equal(
        await playerPage
          .getByRole("button", { name: "End planning & lock submitted plans" })
          .count(),
        0,
      );
      assert.doesNotMatch(
        await playerPage.locator("body").innerText(),
        /private|Guard/,
      );
      await playerPage.close();
    }
  } finally {
    await browser.close();
  }
});
console.log("B11 combat browser journeys passed at 1440 and 390 pixels.");
