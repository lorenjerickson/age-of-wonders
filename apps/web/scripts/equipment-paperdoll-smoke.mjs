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
  const name = `equipment-paperdoll-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.EQUIPMENT_PAPERDOLL_TEST_PORT || 5213);
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
import { useState } from 'react';
import { EquipmentPaperdoll } from './EquipmentPaperdoll';
import { CORE_EQUIPMENT_SLOT_KEYS } from '@aow/common';
import './index.css';
const slots = [...CORE_EQUIPMENT_SLOT_KEYS.map(id => ({id,name:id.slice('aow:equipment-slot-'.length).split('-').map(v=>v[0].toUpperCase()+v.slice(1)).join(' ')})), {id:'custom:focus',name:'Focus'}];
const items = [
{id:'hat',name:'Iron cap',description:'A fitted iron helmet. '+ 'Long retained description. '.repeat(20),combat:{defense:{terms:[{kind:'dice',count:1,size:4}]}},bonuses:['Defense +1'],image:{assetId:'helmet-media'},compatibleSlotSets:[['head']]},
{id:'sword',name:'Short sword',description:'A light blade.',compatibleSlotSets:[['main-hand']]},
{id:'shield',name:'Round shield',compatibleSlotSets:[['off-hand']]},
{id:'bow',name:'Longbow',combat:{damage:[{amount:{terms:[{kind:'dice',count:2,size:6}]},type:'piercing'}]},description:'Uses both hands.',bonuses:['Ranged damage +2'],compatibleSlotSets:[['main-hand','off-hand']]},
{id:'charm',name:'Focus charm',compatibleSlotSets:[['custom:focus']]},
];
function App(){const [equipment,setEquipment]=useState([{slot:'head',itemDefinitionId:'hat',private:true},{slot:'main-hand',itemDefinitionId:'sword'},{slot:'off-hand',itemDefinitionId:'shield'},{slot:'carried',itemDefinitionId:'book',private:true}]);const [disabled,setDisabled]=useState(false);return <main style={{maxWidth:800,margin:'auto',padding:16}}><button onClick={()=>setDisabled(!disabled)}>Toggle read only</button><EquipmentPaperdoll slots={slots} items={items} equipment={equipment} onChange={setEquipment} disabled={disabled}/><output data-testid="equipment" hidden>{JSON.stringify(equipment)}</output></main>}
createRoot(document.getElementById('root')!).render(<App/>);`,
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
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.route("**/api/**", (route) =>
        route.fulfill({
          json: {
            url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="%23aaa" d="M4 25V13a12 12 0 0 1 24 0v12z"/></svg>',
          },
        }),
      );
      await page.goto(fixtureUrl);
      const button = (name) => page.getByRole("button", { name, exact: true });
      const state = async () =>
        JSON.parse(await page.getByTestId("equipment").textContent());
      await button("Head: Iron cap").waitFor();
      assert.ok((await page.getByRole("region", { name: "Net equipment bonuses" }).innerText()).includes("1d4"));
      await button("Head: Iron cap").hover();
      await page.getByRole("tooltip").getByText("Defense +1").waitFor();
      assert.equal(
        await page
          .getByRole("tooltip")
          .getByText("Defense +1")
          .evaluate((element) => {
            const bonus = element.getBoundingClientRect();
            const popup = element
              .closest('[role="tooltip"]')
              .getBoundingClientRect();
            return bonus.top >= popup.top && bonus.bottom <= popup.bottom;
          }),
        true,
        "long description never clips the hover bonus",
      );
      await button("Head: Iron cap").click();
      await page.getByRole("dialog", { name: "Head equipment" }).waitFor();
      assert.ok(
        (await page.getByRole("dialog").innerText()).includes(
          "A fitted iron helmet.",
        ),
      );
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert.equal(
        await button("Head: Iron cap").evaluate(
          (el) => el === document.activeElement,
        ),
        true,
      );
      await button("Main Hand: Short sword").click();
      assert.equal(
        await button("Equip Longbow · Main Hand + Off Hand").isDisabled(),
        true,
      );
      await button("Close").click();
      await button("Off Hand: Round shield").click();
      await button("Clear equipment").click();
      await button("Main Hand: Short sword").click();
      await button("Equip Longbow · Main Hand + Off Hand").click();
      assert.deepEqual(
        (await state()).filter((e) => e.itemDefinitionId === "bow"),
        [
          { slot: "aow:equipment-slot-main-hand", itemDefinitionId: "bow" },
          { slot: "aow:equipment-slot-off-hand", itemDefinitionId: "bow" },
        ],
      );
      assert.ok((await page.getByRole("region", { name: "Net equipment bonuses" }).innerText()).includes("2d6 piercing"));
      assert.ok(!(await page.getByRole("region", { name: "Net equipment bonuses" }).innerText()).includes("4d6"));
      await button("Off Hand: Longbow").click();
      assert.ok(
        (await page.getByRole("dialog").innerText()).includes(
          "Ranged damage +2",
        ),
      );
      await button("Clear equipment").click();
      assert.equal(
        (await state()).some((e) => e.itemDefinitionId === "bow"),
        false,
      );
      assert.deepEqual(
        (await state()).find((e) => e.itemDefinitionId === "book"),
        { slot: "carried", itemDefinitionId: "book", private: true },
      );
      await page
        .getByRole("region", { name: "Additional equipment slots" })
        .getByText("Focus", { exact: true })
        .waitFor();
      await button("Focus: Empty").click();
      await button("Equip Focus charm · Focus").click();
      await button("Toggle read only").click();
      await button("Head: Iron cap").click();
      assert.equal(await button("Clear equipment").isDisabled(), true);
      assert.equal(await button("Equip Iron cap · Head").isDisabled(), true);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => !!document.activeElement?.closest("dialog")),
        true,
      );
      await page.screenshot({
        path: `/tmp/aow-paperdoll-picker-${width}.png`,
        fullPage: true,
      });
      await button("Close").click();
      const boxes = await page
        .locator(".equipment-paperdoll-slot-button")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const b = node.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
          }),
        );
      for (const box of boxes) assert.ok(box.width >= 44 && box.height >= 44);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          assert.ok(
            !(
              Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
              Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
            ),
            `slots ${i}/${j} overlap at ${width}`,
          );
        }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `/tmp/aow-paperdoll-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS paperdoll at ${width}: aliases, tooltip, modal focus/Escape, atomic conflict/replace/clear, carried preservation, custom slot, read-only, 44px, no overlap/overflow`,
      );
    }
  } finally {
    await browser.close();
  }
});
