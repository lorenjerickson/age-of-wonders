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
  process.env.SESSION_TABLE_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-session-table.png");
async function withFixture(run) {
  const name = `session-table-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.SESSION_TABLE_TEST_PORT || 5182);
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
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet, useLocation } from '@tanstack/react-router';
import { CampaignSessionPage, CampaignSessionRunPage } from './CampaignSessionPage';
import { CampaignInstanceProvider } from './CampaignInstanceWorkspace';
import './index.css';
const instance={id:'instance',name:'Friday campaign',campaignDefinitionId:'campaign',status:'active'} as any;
const root=createRootRoute({component:()=> <CampaignInstanceProvider instance={instance}><output data-testid="route">{useLocation().pathname}</output><Outlet/></CampaignInstanceProvider>});
const management=createRoute({getParentRoute:()=>root,path:'/campaigns/instances/instance/sessions/session',component:()=> <CampaignSessionPage sessionId="session"/>});
const run=createRoute({getParentRoute:()=>root,path:'/campaigns/instances/instance/run/session',component:()=> <CampaignSessionRunPage sessionId="session"/>});
const router=createRouter({routeTree:root.addChildren([management,run]),history:createMemoryHistory({initialEntries:['/campaigns/instances/instance/run/session']})});
(window as any).sessionTestRouter=router;
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

await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  const writes = [];
  const locationReads = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let status = "active";
  let empty = false;
  let holdTable = false;
  let heldTable;
  let tableStatus = 200;
  const cavernId = "66b88ba7-7a62-4f50-94eb-9cc8cc000001";
  const harborId = "66b88ba7-7a62-4f50-94eb-9cc8cc000002";
  const terrainId = "66b88ba7-7a62-4f50-94eb-9cc8cc000006";
  const terrain = {
    kind: "isometric-terrain",
    formatVersion: 1,
    dimensions: { x: 4, y: 4, z: 2 },
    cellSize: { value: 5, unit: "ft" },
    chunkSize: 16,
    materials: [
      {
        key: "aow:stone",
        revision: 1,
        name: "Stone",
        terrainType: "aow:stone",
      },
    ],
    chunks: [
      {
        address: { x: 0, y: 0, z: 0 },
        cells: Array.from({ length: 16 }, (_, index) => ({
          offset: (index % 4) + Math.floor(index / 4) * 16,
          materialKey: "aow:stone",
          shape: { top: [1, 1, 1, 1], diagonal: "00-11" },
        })),
      },
    ],
  };
  const image = {
    assetId: "66b88ba7-7a62-4f50-94eb-9cc8cc000003",
    uri:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#273945"/><path d="M0 280L160 120 290 210 420 80 640 270" fill="#61736c"/></svg>',
      ),
    altText: "The lantern-lit Cavern map",
    width: 640,
    height: 360,
    mimeType: "image/svg+xml",
    orientation: "overhead",
  };
  const table = (selected) => {
    const harbor = selected === harborId;
    const spatial = selected === terrainId;
    return {
      sessionName: "Into the cavern",
      campaignInstanceName: "Friday campaign",
      status,
      runtimeRevision: 7,
      campaignTime: "2026-09-12T18:00:00Z",
      captured: {
        snapshotNumber: 2,
        campaign: { name: "The Salt Road", revisionNumber: 3 },
        world: { name: "Lantern Coast", revisionNumber: 5 },
      },
      locations: empty
        ? []
        : [
            { id: cavernId, name: "Lantern Cavern" },
            { id: harborId, name: "Moonlit Harbor" },
            { id: terrainId, name: "Stone Causeway" },
          ],
      focus: empty
        ? "unavailable"
        : selected
          ? "requested"
          : "starting-location",
      location: empty
        ? undefined
        : {
            id: spatial ? terrainId : harbor ? harborId : cavernId,
            name: spatial
              ? "Stone Causeway"
              : harbor
                ? "Moonlit Harbor"
                : "Lantern Cavern",
            description: harbor
              ? "Ships gather beneath the old lighthouse."
              : "A hidden path winds beneath the coastal cliffs.",
            image: harbor || spatial ? undefined : image,
            terrain: spatial ? terrain : undefined,
            mapStatus: spatial ? "isometric" : harbor ? "unavailable" : "image",
            mapUnavailableReason: harbor
              ? "No captured map is available for this Location."
              : undefined,
          },
      party: empty
        ? []
        : [
            {
              key: "66b88ba7-7a62-4f50-94eb-9cc8cc000004",
              name: "Tamsin Reed",
              kind: "character",
              playerName: "River",
              locationName: "Lantern Cavern",
              atFocusedLocation: !harbor,
            },
          ],
      plots: empty
        ? []
        : [
            {
              key: "66b88ba7-7a62-4f50-94eb-9cc8cc000005",
              name: "The Missing Cartographer",
              description: "Find the keeper of the coastal charts.",
              status: "active",
              atFocusedLocation: !harbor,
              locationNames: ["Lantern Cavern"],
              objectives: [
                {
                  name: "Follow the lantern trail",
                  description: "Search for fresh footprints.",
                  status: "active",
                  notes: "The trail ends near the water.",
                },
              ],
              pressures: [{ name: "The tide is rising" }],
              resistances: [{ name: "A sealed stone gate" }],
              children: [],
              discoveries: [
                {
                  name: "The hidden passage",
                  claims: [
                    {
                      kind: "truth",
                      statement: "The passage opens at low tide.",
                      revealed: false,
                    },
                    {
                      kind: "rumor",
                      statement: "A ferryman knows the route.",
                      revealed: true,
                    },
                  ],
                },
              ],
            },
          ],
      unavailable: empty ? ["No captured Locations are available."] : [],
      encounter: {
        status: "unavailable",
        detail: "Encounter adjudication requires the rules runtime.",
      },
    };
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    const path = parsed.pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path.endsWith("/download"))
      return route.fulfill({ json: { url: image.uri } });
    if (path.endsWith("/movement")) return route.fulfill({json:{snapshotNumber:2,runtimeRevision:7,status:status === "paused" ? "paused" : "active",actors:[],capturedRules:[],proposals:[]}});
    if (path.endsWith("/table")) {
      locationReads.push(parsed.searchParams.get("locationId"));
      if (holdTable) {
        holdTable = false;
        heldTable = route;
        return;
      }
      if (tableStatus !== 200)
        return route.fulfill({
          status: tableStatus,
          json: { message: "Session access unavailable." },
        });
      return route.fulfill({
        json: table(parsed.searchParams.get("locationId")),
      });
    }
    if (path.endsWith("/actions/validate"))
      return route.fulfill({ json: { ready: true, checks: [] } });
    if (path.endsWith("/continuation"))
      return route.fulfill({
        json: {
          kind: "continue",
          enabled: true,
          label: "Continue",
          session: { id: "session", name: "Into the cavern", status },
        },
      });
    if (path.endsWith("/readiness"))
      return route.fulfill({
        json: { ready: true, runtimeRevision: 7, token: "ready", checks: [] },
      });
    if (path.endsWith("/events")) return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/sessions/session"))
      return route.fulfill({
        json: {
          id: "session",
          name: "Into the cavern",
          campaignInstanceId: "instance",
          campaignInstanceName: "Friday campaign",
          status,
          metadataRevision: 1,
          summaryStatus: "draft",
          participants: [],
        },
      });
    if (path.endsWith("/presence/leave"))
      return route.fulfill({ json: { present: false } });
    if (path.endsWith("/presence/heartbeat"))
      return route.fulfill({
        status: 409,
        json: { message: "Join the Session to restore presence." },
      });
    return route.fulfill({
      status: 404,
      json: { message: `Unexpected request ${path}` },
    });
  });
  async function assertReadOnlyAndNamed() {
    const text = await page.locator("body").innerText();
    if (/66b88ba7-7a62-4f50-94eb-9cc8cc00000[1-6]/.test(text))
      throw new Error("Table exposed an opaque internal identifier");
    for (const name of [
      /^Move actor$/i,
      /^Move here$/i,
      /^Save Map$/i,
      /^Generate terrain$/i,
      /^Paint terrain$/i,
      /^Edit World$/i,
      /^Approve movement$/i,
    ]) {
      if (await page.getByRole("button", { name }).count())
        throw new Error(
          `Table exposed an unsupported mutation control: ${name}`,
        );
    }
  }
  try {
    await page.goto(url);
    await page.getByRole("heading", { name: "Table", exact: true }).waitFor();
    await page
      .getByRole("heading", { name: "Lantern Cavern", exact: true })
      .waitFor();
    await page.getByRole("img", { name: image.altText, exact: true }).waitFor();
    for (const text of [
      "Tamsin Reed",
      "The hidden passage",
      "The passage opens at low tide.",
      "A ferryman knows the route.",
    ])
      await page.getByText(text, { exact: true }).waitFor();
    await assertReadOnlyAndNamed();
    await page
      .locator("summary")
      .filter({ hasText: "The Missing Cartographer" })
      .waitFor();
    const beforeWrites = writes.length;
    holdTable = true;
    await page
      .getByLabel("Viewing Location", { exact: true })
      .selectOption(harborId);
    await page.waitForTimeout(150);
    if (!heldTable) throw new Error("Held Location request was not captured");
    if (
      await page.getByRole("img", { name: image.altText, exact: true }).count()
    )
      throw new Error(
        "Previous map remained beneath a newly selected Location",
      );
    await heldTable.fulfill({
      status: 503,
      json: { message: "Temporary table failure." },
    });
    heldTable = undefined;
    await page
      .getByText(
        "The table could not be refreshed. Retry to load the latest captured context.",
        { exact: true },
      )
      .waitFor();
    if (
      await page.getByRole("img", { name: image.altText, exact: true }).count()
    )
      throw new Error("Failed Location selection restored a mismatched map");
    await page
      .getByRole("button", { name: "Refresh table", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Moonlit Harbor", exact: true })
      .waitFor();
    await page
      .getByText("No captured map is available for this Location.", {
        exact: true,
      })
      .waitFor();
    if (writes.length !== beforeWrites)
      throw new Error("Changing viewed Location submitted a mutation");
    if (!locationReads.includes(harborId))
      throw new Error("Location view did not request its captured projection");
    await page.getByText("Tamsin Reed", { exact: true }).waitFor();
    await assertReadOnlyAndNamed();
    await page
      .getByLabel("Viewing Location", { exact: true })
      .selectOption(terrainId);
    await page
      .getByRole("heading", { name: "Stone Causeway", exact: true })
      .waitFor();
    await page.getByText("Place an actor in this Location to open the interactive GM map.", {exact:true}).waitFor();
    if (await page.locator("canvas").count()) throw new Error("An interactive map invented an actor when none was placed");
    await assertReadOnlyAndNamed();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(tmpdir(), "aow-session-table-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    status = "paused";
    await page.reload();
    await page.getByRole("heading", { name: "Table", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Resume Session", exact: true })
      .waitFor();
    await page.getByRole("img", { name: image.altText, exact: true }).waitFor();
    await assertReadOnlyAndNamed();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    tableStatus = 403;
    await page
      .getByRole("button", { name: "Refresh table", exact: true })
      .click();
    await page
      .getByText(
        "The table could not be refreshed. Retry to load the latest captured context.",
        { exact: true },
      )
      .waitFor();
    for (const text of ["Tamsin Reed", "The passage opens at low tide."]) {
      if (await page.getByText(text, { exact: true }).count())
        throw new Error("Revoked Session retained protected table context");
    }
    tableStatus = 200;
    empty = true;
    await page.reload();
    await page.getByRole("heading", { name: "Table", exact: true }).waitFor();
    await page
      .getByText("No captured Locations are available.", { exact: true })
      .waitFor();
    await page
      .getByText(
        "No Characters or actors have been prepared for this Instance.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByText("No Plots were captured for this campaign.", { exact: true })
      .waitFor();
    await assertReadOnlyAndNamed();
    if (
      await page.getByRole("img", { name: image.altText, exact: true }).count()
    )
      throw new Error("Empty table retained a previous map");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      `Session table smoke passed: captured Location/map/party/plot/discoveries, GET-only Location viewing, paused reference view, empty fallback and private-ID protection. Screenshot: ${screenshotPath}`,
    );
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  } finally {
    await browser.close();
  }
});
