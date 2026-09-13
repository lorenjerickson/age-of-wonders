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
  join(tmpdir(), "aow-terrain-materials.png");
async function withFixture(run) {
  const name = `terrain-materials-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.TERRAIN_TEST_PORT || 5177);
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
import { Select, Field } from '@aow/ui';
import { createTerrainVolume, applyTerrainWrites, terrainShapePreset, type TerrainCellWrite } from '@aow/common';
import { IsometricTerrainViewport } from './IsometricTerrainViewport';
import { TERRAIN_PALETTE } from './isometricEditorModel';
import type { TerrainTextureQuality } from './terrainMaterials';
import './index.css';
const writes: TerrainCellWrite[] = [];
TERRAIN_PALETTE.forEach((material, i) => {
 const ox=3+(i%4)*5, oy=3+Math.floor(i/4)*6;
 for(let x=0;x<4;x++) for(let y=0;y<4;y++) writes.push({address:{x:ox+x,y:oy+y,z:0},cell:{materialKey:material.key,shape:terrainShapePreset(x===3?'ramp':'cube')}});
 for(let x=0;x<4;x++) writes.push({address:{x:ox+x,y:oy,z:1},cell:{materialKey:material.key,shape:terrainShapePreset('cube'),...(i===4 && x===1?{opening:{id:'gallery-door',kind:'door',state:'closed',facing:0,frameThickness:0.125}}:{})}});
});
const volume=applyTerrainWrites(createTerrainVolume({x:26,y:20,z:10},TERRAIN_PALETTE),writes).volume;
function Gallery(){const [quality,setQuality]=useState<TerrainTextureQuality>('balanced'); return <main className="p-6 max-w-7xl mx-auto"><h1 className="text-2xl font-bold">Terrain material study</h1><p>Grass · Soil · Sand · Rock / Wood · Stone wall · Water</p><Field label="Texture quality"><Select value={quality} onChange={e=>setQuality(e.target.value as TerrainTextureQuality)}><option value="balanced">Balanced</option><option value="high">High</option><option value="off">Untextured</option></Select></Field><IsometricTerrainViewport volume={volume} level={0} slice={false} actor={{x:12,y:8,z:1}} selection={[]} disabled={false} textureQuality={quality} onStroke={()=>{}}/></main>}
createRoot(document.getElementById('root')!).render(<Gallery/>);`,
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
    viewport: { width: 1440, height: 960 },
  });
  page.setDefaultTimeout(30000);
  const errors = [];
  const requested = new Set();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("/terrain/v1/")) requested.add(r.url());
  });
  try {
    await page.goto(url);
    await page.getByText("Terrain textures ready", { exact: true }).waitFor();
    if ([...requested].filter((u) => u.endsWith("-1k.webp")).length !== 18)
      throw new Error("Expected six complete balanced materials");
    await page.getByLabel("Texture quality").selectOption("high");
    await page.getByText("Terrain textures ready", { exact: true }).waitFor();
    if ([...requested].filter((u) => u.endsWith("-2k.webp")).length !== 18)
      throw new Error("Expected six complete high materials");
    const viewport = page.locator('[aria-label^="Isometric terrain editor"]');
    await viewport.focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.getByLabel("Texture quality").selectOption("off");
    await page
      .getByText("Terrain textures disabled", { exact: true })
      .waitFor();
    await page.route("**/terrain/v1/grass-*-1k.webp", (r) => r.abort());
    await page.getByLabel("Texture quality").selectOption("balanced");
    await page
      .getByText(
        "Some terrain materials are unavailable. Showing neutral surfaces.",
        { exact: true },
      )
      .waitFor();
    await page.unroute("**/terrain/v1/grass-*-1k.webp");
    await page
      .getByRole("button", { name: "Retry textures", exact: true })
      .click();
    await page.getByText("Terrain textures ready", { exact: true }).waitFor();
    const unexpected = errors.filter((e) => !e.includes("ERR_FAILED"));
    if (unexpected.length) throw new Error(unexpected.join("\n"));
    console.log(
      JSON.stringify({
        passed: true,
        textureFiles: requested.size,
        screenshot: screenshotPath,
      }),
    );
  } finally {
    await browser.close();
  }
});
