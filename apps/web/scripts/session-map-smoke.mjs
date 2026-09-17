import { get as httpGet } from "node:http";
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
  process.env.SESSION_MAP_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-session-map.png");
async function withFixture(run) {
  const name = `session-map-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.SESSION_MAP_TEST_PORT || 5184);
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
        if (
          await new Promise((resolve) => {
            const request = httpGet(fixtureUrl, (response) => {
              response.resume();
              resolve(response.statusCode === 200);
            });
            request.on("error", () => resolve(false));
          })
        ) {
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
  page.setDefaultTimeout(20000);
  const errors = [],
    writes = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const cavern = "internal-cavern",
    harbor = "internal-harbor",
    empty = "internal-empty";
  let runtimeRevision = 7,
    movementRevision = 7,
    snapshotNumber = 2,
    status = "active",
    proposals = [],
    commits = 0,
    access = true;
  const actors = [
    {
      id: "secret-tamsin",
      name: "Tamsin Reed",
      locationId: cavern,
      locationName: "Lantern Cavern",
      position: { x: 2.5, y: 2.5, z: 1 },
    },
    {
      id: "secret-orrin",
      name: "Orrin Vale",
      locationId: cavern,
      locationName: "Lantern Cavern",
      position: { x: 4.5, y: 3.5, z: 1 },
    },
    {
      id: "secret-marin",
      name: "Marin",
      locationId: harbor,
      locationName: "Harbor",
      position: { x: 2.5, y: 2.5, z: 1 },
    },
  ];
  const terrain = {
    kind: "isometric-terrain",
    formatVersion: 1,
    dimensions: { x: 8, y: 8, z: 2 },
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
        cells: Array.from({ length: 64 }, (_, index) => ({
          offset: (index % 8) + Math.floor(index / 8) * 16,
          materialKey: "aow:stone",
          shape: { top: [1, 1, 1, 1], diagonal: "00-11" },
        })),
      },
    ],
  };
  const movement = () => ({
    runtimeRevision: movementRevision,
    snapshotNumber,
    status,
    actors: actors.map((a) => ({ ...a, position: { ...a.position } })),
    capturedRules: [{ name: "Captured movement", revision: 1 }],
    proposals: proposals.map((p) => ({
      ...p,
      canApprove:
        p.status === "pending" &&
        p.expectedRuntimeRevision === movementRevision,
    })),
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path.endsWith("/actions/validate"))
      return route.fulfill({ json: { ready: true, checks: [] } });
    if (path.endsWith("/continuation"))
      return route.fulfill({
        json: {
          kind: "continue",
          enabled: true,
          label: "Continue",
          session: { id: "session", name: "Map session", status },
        },
      });
    if (path.endsWith("/readiness"))
      return route.fulfill({
        json: { ready: true, runtimeRevision, token: "ready", checks: [] },
      });
    if (path.endsWith("/events")) return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/table")) {
      if (!access)
        return route.fulfill({
          status: 403,
          json: { message: "Session unavailable." },
        });
      const locationId =
        new URL(request.url()).searchParams.get("locationId") || cavern;
      const name =
        locationId === cavern
          ? "Lantern Cavern"
          : locationId === harbor
            ? "Harbor"
            : "Empty Gallery";
      return route.fulfill({
        json: {
          sessionName: "Map session",
          campaignInstanceName: "Friday campaign",
          status,
          runtimeRevision,
          captured: {
            snapshotNumber,
            campaign: { name: "Captured campaign", revisionNumber: 1 },
            world: { name: "Captured world", revisionNumber: 2 },
          },
          locations: [
            { id: cavern, name: "Lantern Cavern" },
            { id: harbor, name: "Harbor" },
            { id: empty, name: "Empty Gallery" },
          ],
          focus: "requested",
          location: { id: locationId, name, mapStatus: "isometric", terrain },
          party: actors.map((a) => ({
            key: a.id,
            name: a.name,
            kind: "actor",
            locationName: a.locationName,
            atFocusedLocation: a.locationId === locationId,
            position: a.position,
          })),
          plots: [],
          unavailable: [],
          encounter: {
            status: "unavailable",
            detail: "Broader encounters are not yet available.",
          },
        },
      });
    }
    if (path.endsWith("/movement") && request.method() === "GET")
      return route.fulfill({ json: movement() });
    if (path.endsWith("/movement")) {
      const body = request.postDataJSON(),
        actor = actors.find((a) => a.id === body.actorId);
      if (
        body.expectedRuntimeRevision !== runtimeRevision ||
        status !== "active"
      )
        return route.fulfill({
          status: 409,
          json: { message: "Refresh before previewing." },
        });
      const proposal = {
        id: "proposal-" + (proposals.length + 1),
        actorId: actor.id,
        locationId: actor.locationId,
        actorName: actor.name,
        locationName: actor.locationName,
        origin: { ...actor.position },
        destination: body.destination,
        expectedRuntimeRevision: runtimeRevision,
        status: "pending",
        canApprove: true,
        explanation: "The captured rule chain proposes movement.",
        effects: [actor.name + " changes position only after approval."],
        trace: [
          "GM destination declared.",
          "Captured movement rule evaluated.",
        ],
        createdAt: new Date().toISOString(),
      };
      proposals.unshift(proposal);
      return route.fulfill({ json: proposal });
    }
    const decision = path.match(
      /\/movement\/(proposal-\d+)\/(approve|reject)$/,
    );
    if (decision) {
      const proposal = proposals.find((p) => p.id === decision[1]);
      if (decision[2] === "approve") {
        actors.find((a) => a.id === proposal.actorId).position = {
          ...proposal.destination,
        };
        runtimeRevision++;
        movementRevision = runtimeRevision;
        commits++;
        proposal.status = "approved";
      } else proposal.status = "rejected";
      proposal.canApprove = false;
      return route.fulfill({ json: proposal });
    }
    if (path.endsWith("/sessions/session"))
      return route.fulfill({
        json: {
          id: "session",
          name: "Map session",
          status,
          metadataRevision: 1,
          participants: [],
        },
      });
    return route.fulfill({
      status: 404,
      json: { message: "Unexpected fixture request" },
    });
  });
  const field = (axis) =>
    page.getByRole("spinbutton", { name: "Destination " + axis, exact: true });
  const select = () =>
    page.getByRole("combobox", { name: "Actor", exact: true });
  async function pickSurface() {
    const canvas = page.locator("canvas").first();
    await canvas.waitFor();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("No map canvas bounds");
    for (const [x, y] of [
      [0.6, 0.55],
      [0.4, 0.55],
      [0.55, 0.65],
      [0.65, 0.6],
      [0.35, 0.6],
      [0.5, 0.7],
      [0.7, 0.5],
      [0.3, 0.5],
      [0.5, 0.45],
    ]) {
      await canvas.click({ position: { x: box.width * x, y: box.height * y } });
      await page.waitForTimeout(80);
      if (await page.getByText(/^Proposed destination:/).count()) return;
    }
    throw new Error(
      "Supported terrain clicks did not produce a destination declaration",
    );
  }
  try {
    await page.goto(url);
    await page.locator("canvas").waitFor();
    const initial = await select().inputValue();
    if (!["secret-tamsin", "secret-orrin"].includes(initial))
      throw new Error("Initial focus was not a current-map actor");
    await select().selectOption("secret-tamsin");
    await page.getByText(/GM overview.*Focus: Tamsin Reed/).waitFor();
    if (
      (await select().locator("option").allTextContents()).some((text) =>
        text.includes("Marin"),
      )
    )
      throw new Error("Other Location actor leaked into map selection");
    const beforePick = writes.length;
    await pickSurface();
    if (writes.length !== beforePick || commits !== 0)
      throw new Error("Surface click submitted a gameplay mutation");
    const destination = {
      x: Number(await field("X").inputValue()),
      y: Number(await field("Y").inputValue()),
      z: Number(await field("Z").inputValue()),
    };
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .waitFor();
    if (commits || actors[0].position.x !== 2.5)
      throw new Error("Preview moved the actor");
    await page.screenshot({
      path: "/tmp/aow-session-map-preview.png",
      fullPage: true,
    });
    if (
      JSON.stringify(proposals[0].destination) !== JSON.stringify(destination)
    )
      throw new Error("Map destination was not used in the preview");
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .click();
    await page
      .getByText("The approved rule effects were committed.", { exact: true })
      .waitFor();
    await page.locator("canvas").waitFor();
    if (
      commits !== 1 ||
      JSON.stringify(actors[0].position) !== JSON.stringify(destination)
    )
      throw new Error("Approved position did not refresh");
    await page
      .getByText(
        "Current position in Lantern Cavern: X " +
          destination.x.toLocaleString("en", {
            maximumFractionDigits: 3,
            useGrouping: false,
          }) +
          ", Y " +
          destination.y.toLocaleString("en", {
            maximumFractionDigits: 3,
            useGrouping: false,
          }) +
          ", Z " +
          destination.z.toLocaleString("en", {
            maximumFractionDigits: 3,
            useGrouping: false,
          }),
        { exact: true },
      )
      .waitFor();
    await pickSurface();
    await select().selectOption("secret-orrin");
    if (await page.getByText(/^Proposed destination:/).count())
      throw new Error("Actor switch retained another actor's destination");
    await pickSurface();
    await page
      .getByLabel("Viewing Location", { exact: true })
      .selectOption(harbor);
    await page.getByText(/GM overview.*Focus: Marin/).waitFor();
    if (await page.getByText(/^Proposed destination:/).count())
      throw new Error("Location switch retained old destination");
    await page
      .getByLabel("Viewing Location", { exact: true })
      .selectOption(empty);
    await page
      .getByText(
        "Place an actor in this Location to open the interactive GM map.",
        { exact: true },
      )
      .waitFor();
    if (await page.locator("canvas").count())
      throw new Error("Empty map invented an actor");
    await page
      .getByLabel("Viewing Location", { exact: true })
      .selectOption(cavern);
    await page.locator("canvas").waitFor();
    movementRevision++;
    await page
      .getByRole("button", { name: "Refresh movement", exact: true })
      .click();
    await page
      .getByText("Refreshing the map and actor positions…", { exact: true })
      .waitFor();
    if (
      (await page.locator("canvas").count()) ||
      !(await page
        .getByRole("button", { name: "Preview movement", exact: true })
        .isDisabled())
    )
      throw new Error("Incoherent runtime exposed interactive geometry");
    runtimeRevision = movementRevision;
    await page
      .getByRole("button", { name: "Refresh table", exact: true })
      .click();
    await page.locator("canvas").waitFor();
    status = "paused";
    await page
      .getByRole("button", { name: "Refresh movement", exact: true })
      .click();
    await page
      .getByText("Resume the Session to propose or decide movement.", {
        exact: true,
      })
      .waitFor();
    const beforePaused = writes.length;
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    await canvas.click({
      position: { x: box.width * 0.6, y: box.height * 0.55 },
    });
    if (
      writes.length !== beforePaused ||
      (await page.getByText(/^Proposed destination:/).count())
    )
      throw new Error("Paused map accepted destination");
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (
      (await page.locator("body").innerText()).match(
        /secret-tamsin|secret-orrin|secret-marin|internal-cavern|internal-harbor/,
      )
    )
      throw new Error("Opaque map identifiers displayed");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      "Interactive GM map smoke passed: real actor focus, same-Location filtering, surface declaration and numeric fallback, preview-before-approval, authoritative position refresh, selection reset, empty-map readiness, runtime coherence and paused guards.",
    );
  } catch (error) {
    console.error(await page.locator("body").innerText());
    await page.screenshot({
      path: "/tmp/aow-session-map-failure.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
  }
});
