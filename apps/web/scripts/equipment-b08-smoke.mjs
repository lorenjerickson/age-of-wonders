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
  process.env.TERRAIN_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-equipment-b08.png");
async function withFixture(run) {
  const name = `equipment-b08-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.TERRAIN_TEST_PORT || 5187);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><title>Terrain authoring test</title><link rel="icon" href="/favicon.svg"></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ActorEquipmentPanel } from './ActorEquipmentPanel';
import { ItemStorageFields } from './ItemStorageFields';
import './index.css';
function Setup(){const [edits,setEdits]=useState({});return <main className="p-4"><ItemStorageFields initial={{}} edits={edits} onChange={setEdits}/><ActorEquipmentPanel campaignId="campaign" instanceId="instance" actorId="actor-secret-id"/></main>}
createRoot(document.getElementById('root')!).render(<Setup/>);`,
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
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      let data = {
        runtimeRevision: 3,
        actorName: "Hero",
        bonusActions: null,
        readOnly: false,
        slots: [{ id: "hidden:head", name: "Head" }],
        definitions: [{ id: "secret-def", name: "Helmet" }],
        items: [],
      };
      let reject = true;
      const commands = [];
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        if (!req.url().endsWith("/equipment"))
          return route.fulfill({ json: {} });
        if (req.method() === "POST") {
          const body = req.postDataJSON();
          commands.push(body);
          if (body.expectedRuntimeRevision !== data.runtimeRevision)
            throw new Error("Stale client revision");
          if (body.action === "create" && reject) {
            reject = false;
            return route.fulfill({ status: 409, json: { message: "stale" } });
          }
          data = { ...data, runtimeRevision: data.runtimeRevision + 1 };
          if (body.action === "allowance")
            data.bonusActions = body.bonusActions;
          if (body.action === "create")
            data.items = [
              {
                id: "secret-item",
                name: "Helmet",
                quantity: 1,
                locationLabel: "Carried",
                compatibleSlotSets: [["hidden:head"]],
              },
            ];
          if (body.action === "equip")
            data.items[0].locationLabel = "Equipped: Head";
        }
        return route.fulfill({ json: data });
      });
      await page.goto(url);
      await page.getByLabel("Container type").selectOption("pack");
      await page
        .getByRole("button", { name: "Add capacity", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: /^Quality/ })
        .selectOption("fine");
      await page.getByLabel("Slots", { exact: true }).fill("4");
      await page.getByLabel("Rarity override").fill("rare");
      await page
        .getByRole("button", { name: "Equipment", exact: true })
        .click();
      await page
        .getByLabel("Available bonus actions", { exact: true })
        .fill("1");
      await page.getByRole("button", { name: "Set bonus actions" }).click();
      await page
        .getByText("Available bonus actions: 1.", { exact: false })
        .waitFor();
      await page.getByLabel("Add carried Item").selectOption("secret-def");
      await page.getByRole("button", { name: "Add Item", exact: true }).click();
      await page.getByRole("alert").waitFor();
      if (
        (await page.getByLabel("Add carried Item").inputValue()) !==
        "secret-def"
      )
        throw new Error("Lost selection on failure");
      await page.getByRole("button", { name: "Add Item", exact: true }).click();
      await page
        .getByRole("button", { name: "Equip: Head", exact: true })
        .click();
      await page.getByText("Equipped: Head", { exact: false }).waitFor();
      const body = await page.locator("body").innerText();
      if (body.includes("secret-") || body.includes("hidden:"))
        throw new Error("Opaque labels");
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error("Horizontal overflow");
      if (errors.length) throw new Error(errors.join("\n"));
      await page.screenshot({
        path: join(tmpdir(), `aow-b08-equipment-${width}.png`),
        fullPage: true,
      });
      console.log(
        JSON.stringify({ width, passed: true, commands: commands.length }),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
