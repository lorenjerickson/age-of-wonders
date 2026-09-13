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
  join(tmpdir(), "aow-actor-binding.png");
async function withFixture(run) {
  const name = `actor-binding-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.TERRAIN_TEST_PORT || 5178);
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
import { ActorPlacementForm } from './ActorPlacementForm';
import { CampaignSessionParticipantPage } from './CampaignSessionParticipantPage';
import './index.css';
const initial=await fetch('/fixture-actors').then(r=>r.json());
function Setup(){const [data,setData]=useState(initial);return <main className="p-8"><h1>Actor placement</h1><ActorPlacementForm key={data.runtimeRevision} actor={data.items[0]} data={data} campaignDefinitionId="campaign" onSaved={setData}/></main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('player')?<CampaignSessionParticipantPage campaignInstanceId="instance" sessionId="session"/>:<Setup/>);`,
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
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(30000);
  let data = {
    campaignInstanceId: "instance",
    campaignInstanceName: "Game",
    runtimeRevision: 4,
    terrainLocations: [{ id: "location", name: "Cavern" }],
    items: [
      {
        runtimeCreatureId: "actor-secret-id",
        name: "Hero",
        sourceTypeLabel: "Character",
        sourceName: "Hero",
        policyLabel: "Independent",
        policyDefaulted: false,
      },
    ],
  };
  let denied = false,
    spatialCalls = 0;
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/fixture-actors", (r) => r.fulfill({ json: data }));
  await page.route("**/api/**", async (r) => {
    const request = r.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/actor-secret-id/position")) {
      const body = request.postDataJSON();
      if (body.expectedRuntimeRevision !== data.runtimeRevision)
        throw new Error("Wrong runtime revision");
      if (body.position.z !== 3.5) throw new Error("Wrong elevation");
      data = {
        ...data,
        runtimeRevision: 5,
        items: [
          {
            ...data.items[0],
            currentLocationId: "location",
            currentLocationName: "Cavern",
            terrainPosition: body.position,
          },
        ],
      };
      return r.fulfill({ json: data });
    }
    if (path.endsWith("/spatial")) {
      spatialCalls++;
      if (new URL(request.url()).search)
        throw new Error("Client supplied observer");
      return r.fulfill({
        json: {
          status: "awaiting-visibility",
          runtimeRevision: 5,
          actor: { name: "Hero", position: { x: 0.5, y: 0.5, z: 3.5 } },
        },
      });
    }
    if (path.endsWith("/events"))
      return r.fulfill({ json: { sessionName: "Session", items: [] } });
    if (path.endsWith("/sessions/session"))
      return denied
        ? r.fulfill({
            status: 404,
            json: { message: "You are not invited to this Session." },
          })
        : r.fulfill({
            json: {
              campaignInstanceName: "Game",
              sessionName: "Session",
              status: "active",
              role: "player",
              participants: [],
            },
          });
    return r.fulfill({ json: { auth0: { configured: false, linked: false } } });
  });
  try {
    await page.goto(url);
    await page.getByLabel("Z grid units", { exact: true }).fill("3.5");
    await page
      .getByRole("button", { name: "Place actor", exact: true })
      .click();
    await page
      .getByText("Placed at (0.5, 0.5, 3.5) grid units.", { exact: true })
      .waitFor();
    if ((await page.locator("body").innerText()).includes("actor-secret-id"))
      throw new Error("Opaque actor identity displayed");
    await page.goto(url + "?player");
    await page
      .getByText("Hero is bound to your Character.", { exact: false })
      .waitFor();
    if (await page.locator("canvas").count())
      throw new Error("Unfiltered player terrain rendered");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    denied = true;
    await page
      .getByText("You are not invited to this Session.", { exact: true })
      .waitFor();
    if ((await page.locator("body").innerText()).includes("Hero is bound"))
      throw new Error("Revoked binding retained");
    if (!spatialCalls || errors.length)
      throw new Error(errors.join("\n") || "No binding requested");
    console.log(JSON.stringify({ passed: true, screenshot: screenshotPath }));
  } finally {
    await browser.close();
  }
});
