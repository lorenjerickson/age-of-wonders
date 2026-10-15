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
  process.env.SESSION_SCREENSHOT_PATH ||
  join(tmpdir(), "aow-campaign-plot-interactions.png");
async function withFixture(run) {
  const name = `campaign-plot-interactions-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CAMPAIGN_PLOTS_TEST_PORT || 5187);
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
      `// @ts-nocheck
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider,Outlet,Link} from '@tanstack/react-router';
import {CampaignPlotsPage} from './CampaignPlotPages';
import {CampaignPlotRoutePage} from './CampaignPlotRoutePages';
import {CampaignDefinitionAuthoringProvider,CampaignDefinitionContextBar,CampaignDefinitionUnsavedNavigationGuard,CampaignDefinitionSecondaryNavigation} from './CampaignDefinitionAuthoringShell';
import './index.css';
const {definition,draft}=await fetch('/fixture').then(r=>r.json());
const root=createRootRoute({component:()=> <CampaignDefinitionAuthoringProvider definition={definition} initialDraft={draft}><CampaignDefinitionUnsavedNavigationGuard/><CampaignDefinitionContextBar/><CampaignDefinitionSecondaryNavigation campaignDefinitionId="campaign" campaignName={definition.name} gmScope="fixture"/><Link to="/overview">Leave Plot editor</Link><Outlet/></CampaignDefinitionAuthoringProvider>});
const index=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots',component:CampaignPlotsPage});
const detail=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId',component:()=> <CampaignPlotsPage plotId={detail.useParams().plotId}/>});
const collection=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection',component:()=> <CampaignPlotRoutePage {...collection.useParams()}/>});
const entry=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection/$childId',component:()=> <CampaignPlotRoutePage {...entry.useParams()}/>});
const claims=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection/$childId/claims',component:()=> <CampaignPlotRoutePage {...claims.useParams()} claimsPage/>});
const claim=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection/$childId/claims/$claimId',component:()=> <CampaignPlotRoutePage {...claim.useParams()} claimsPage/>});
const associations=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection/$childId/placements',component:()=> <CampaignPlotRoutePage {...associations.useParams()} associationPage/>});
const association=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/plots/$plotId/$collection/$childId/placements/$placementId',component:()=> <CampaignPlotRoutePage {...association.useParams()} associationPage/>});
const overview=createRoute({getParentRoute:()=>root,path:'/overview',component:()=> <><h1>Overview test destination</h1><Link to="/campaigns/definitions/campaign/plots/root">Return to root Plot</Link></>});
const router=createRouter({routeTree:root.addChildren([index,detail,collection,entry,claims,claim,associations,association,overview]),history:createMemoryHistory({initialEntries:[new URLSearchParams(location.search).get('path')||'/campaigns/definitions/campaign/plots/root']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
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
const record = (id, name, parent = { kind: "root" }) => ({
  resourceType: "plots",
  sourceId: id,
  payload: {
    id,
    campaignDefinitionId: "campaign",
    name,
    description: "",
    parent,
    objectives: [],
    pressures: [],
    resistances: [],
    discoveries: [],
    locationContexts: [],
    prerequisites: [],
    dependencies: [],
  },
});
let draft = {
  id: "draft",
  campaignDefinitionId: "campaign",
  capturedWorld: {
    worldDefinitionId: "world",
    worldName: "Flooded City",
    revisionNumber: 1,
    snapshotId: "world-snapshot",
  },
  revisionName: "First draft",
  content: {
    formatVersion: 1,
    plotDefinitionIds: ["root", "peer"],
    placementDefinitionIds: [],
  },
  records: [record("root", "Harbor Mystery"), record("peer", "Bell Tower")],
  capturedWorldContent: {
    locations: [
      { id: "quay", name: "Old Quay" },
      { id: "tower", name: "Bell Tower yard" },
    ],
    creatures: [],
    items: [],
    placements: [],
  },
  storageRevision: 1,
  validationStatus: "not-validated",
};
const definition = {
  id: "campaign",
  name: "Bells Beneath the Flood",
  status: "active",
  createdAt: "2026-09-05",
  updatedAt: "2026-09-05",
  revisions: [],
};
const rich = draft.records[0].payload;
rich.objectives = [
  {
    id: "objective-bell",
    name: "Find the bell",
    description: "Preserved objective detail",
    extensions: { "fixture:detail": { rank: 2 } },
  },
  {
    id: "objective-keeper",
    name: "Question the keeper",
    description: "Second objective detail",
  },
];
rich.pressures = [
  {
    id: "pressure-tide",
    name: "The tide rises",
    description: "Preserved pressure detail",
  },
];
rich.resistances = [
  {
    id: "resistance-gate",
    name: "Locked gate",
    description: "Preserved resistance detail",
  },
];
rich.discoveries = [
  {
    id: "discovery-seal",
    name: "Broken seal",
    extensions: { "fixture:detail": true },
    claims: [
      {
        id: "claim-seal",
        kind: "truth",
        statement: "The archive opened from within.",
        provenance: "Archive ledger",
      },
      {
        id: "claim-hidden",
        kind: "belief",
        statement: "Hidden second claim",
        conflictsWithClaimIds: ["claim-seal"],
      },
    ],
  },
  { id: "discovery-invalid", name: "Imported unfinished clue", claims: [] },
];
rich.locationContexts = [
  {
    id: "context-quay",
    locationId: "quay",
    placementDefinitionIds: ["placement-intent"],
    actorPlacements: [
      {
        id: "legacy-actor",
        source: { kind: "actor-role", role: "keeper" },
        notes: "Preserved actor intent",
      },
    ],
    itemPlacements: [
      { id: "legacy-item", role: "loot", description: "Preserved item intent" },
    ],
    extensions: { "fixture:detail": true },
  },
];
for (const [id, name, locationId, plotDefinitionIds] of [
  ["placement-intent", "Harbor lookout", "quay", ["root"]],
  ["placement-second", "Harbor guide", "quay", ["root"]],
  ["placement-other", "Distant guide", "tower", ["peer"]],
]) {
  draft.records.push({
    resourceType: "campaign-placements",
    sourceId: id,
    payload: {
      id,
      name,
      kind: "independent",
      locationId,
      plotDefinitionIds,
      source: { kind: "world-creature", creatureId: "keeper" },
    },
  });
  draft.content.placementDefinitionIds.push(id);
}
const originalQuay = structuredClone(rich.locationContexts[0]);
const originalCapture = structuredClone(draft.capturedWorldContent);
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(15000);
  const errors = [],
    writes = [];
  let failNext = false,
    staleNext = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.route("**/fixture", (r) =>
    r.fulfill({ json: { definition, draft } }),
  );
  await page.route("**/api/**", async (r) => {
    assert.equal(
      new URL(r.request().url()).pathname,
      "/api/campaigns/campaign/draft",
    );
    assert.equal(r.request().method(), "PUT");
    const body = r.request().postDataJSON();
    writes.push(body);
    if (failNext) {
      failNext = false;
      return r.fulfill({
        status: 503,
        json: { message: "Fixture save unavailable" },
      });
    }
    if (staleNext) {
      staleNext = false;
      return r.fulfill({
        status: 409,
        json: { message: "Fixture stale draft" },
      });
    }
    assert.equal(body.expectedStorageRevision, draft.storageRevision);
    draft = {
      ...draft,
      content: body.content,
      records: body.records,
      revisionName: body.revisionName,
      storageRevision: draft.storageRevision + 1,
    };
    return r.fulfill({ json: draft });
  });
  const field = (name) => page.getByRole("textbox", { name, exact: true });
  const current = (id) => draft.records.find((r) => r.sourceId === id)?.payload;
  const route = (path) =>
    page.goto(
      url +
        "?path=" +
        encodeURIComponent("/campaigns/definitions/campaign/plots/" + path),
    );
  const save = async (label) => {
    const revision = draft.storageRevision;
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/campaigns/campaign/draft") &&
        r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal((await response).status(), 200);
    await page
      .getByRole("button", { name: label, exact: true })
      .waitFor({ state: "detached" });
    assert.equal(draft.storageRevision, revision + 1);
    assert.deepEqual(errors, []);
  };
  try {
    await route("root");
    await page.getByRole("button", { name: "Edit plot", exact: true }).click();
    await field("Name").waitFor();
    assert.equal(
      await page.getByRole("textbox").count(),
      2,
      "Plot details contain no multiline collection editors",
    );
    await field("Description").fill("Edited basic Plot details");
    await save("Save Plot");
    assert.deepEqual(current("root").locationContexts[0], originalQuay);
    // Dedicated child pages replace every multiline collection editor.
    for (const [collection, singular] of [
      ["objectives", "objective"],
      ["pressures", "pressure"],
      ["resistances", "resistance"],
    ]) {
      const originals = structuredClone(current("root")[collection]);
      await route("root/" + collection);
      assert(
        (
          await page
            .getByRole("navigation", { name: "Breadcrumb", exact: true })
            .innerText()
        ).includes(collection[0].toUpperCase() + collection.slice(1)),
      );
      await page
        .getByRole("link", {
          name: new RegExp("^\\+?\\s*Add " + singular + "$"),
          exact: true,
        })
        .click();
      await field("Name").fill("New " + singular);
      await field("Description").fill("Individual child detail");
      await save("Save " + singular);
      assert.deepEqual(
        current("root")[collection].slice(0, originals.length),
        originals,
      );
      const added = current("root")[collection].find(
        (x) => x.name === "New " + singular,
      );
      assert(added?.id);
      await route("root/" + collection + "/" + encodeURIComponent(added.id));
      await field("Name").fill("Renamed " + singular);
      await save("Save " + singular);
      assert.equal(
        current("root")[collection].find((x) => x.id === added.id).name,
        "Renamed " + singular,
      );
      await route("root/" + collection);
      const row = page
        .getByRole("listitem")
        .filter({ hasText: "Renamed " + singular });
      page.once("dialog", (d) => d.dismiss());
      await row
        .getByRole("button", { name: "Delete " + singular, exact: true })
        .click();
      assert(current("root")[collection].some((x) => x.id === added.id));
      page.once("dialog", (d) => d.accept());
      await row
        .getByRole("button", { name: "Delete " + singular, exact: true })
        .click();
      await row.waitFor({ state: "detached" });
      assert.deepEqual(current("root")[collection], originals);
    }
    await route("root/discoveries");
    await page
      .getByRole("link", { name: /^(?:\+\s*)?Add discovery$/, exact: true })
      .click();
    await field("Name").fill("Footprints");
    await save("Save discovery");
    const discovery = current("root").discoveries.find(
      (d) => d.name === "Footprints",
    );
    const discoveryPath =
      "root/discoveries/" + encodeURIComponent(discovery.id);
    await route(discoveryPath);
    await page
      .getByRole("link", { name: "Manage discovery facets (0)", exact: true })
      .click();
    await page
      .getByRole("link", { name: /^(?:\+\s*)?Add facet$/, exact: true })
      .click();
    await field("Statement").fill("The keeper arrived before dawn");
    await field("Provenance").fill("Witness account");
    await save("Save facet");
    const claim = current("root").discoveries.find(
      (d) => d.id === discovery.id,
    ).truth;
    await route(discoveryPath + "/claims/new");
    await page
      .getByRole("combobox", { name: "Kind", exact: true })
      .selectOption("truth");
    await field("Statement").fill("A second truth must not replace the first");
    const beforeDuplicateTruth = draft.storageRevision;
    await page.getByRole("button", { name: "Save facet", exact: true }).click();
    await page
      .getByText(
        "This discovery already has a truth. Edit that truth or choose Belief or Rumor.",
        { exact: true },
      )
      .waitFor();
    assert.equal(draft.storageRevision, beforeDuplicateTruth);
    assert.equal(
      current("root").discoveries.find((d) => d.id === discovery.id).truth.id,
      claim.id,
    );
    await route(discoveryPath + "/claims/" + encodeURIComponent(claim.id));
    await page
      .getByRole("combobox", { name: "Kind", exact: true })
      .selectOption("rumor");
    await field("Statement").fill("The keeper may have arrived");
    await save("Save facet");
    assert.equal(
      current("root").discoveries.find((d) => d.id === discovery.id).rumors[0]
        .provenance,
      "Witness account",
    );
    await route(discoveryPath + "/claims");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete facet", exact: true })
      .click();
    await page.getByText("No discovery facets yet.", { exact: true }).waitFor();
    await route("root/discoveries");
    const clueRow = page
      .getByRole("listitem")
      .filter({ hasText: "Footprints" });
    page.once("dialog", (d) => d.accept());
    await clueRow
      .getByRole("button", { name: "Delete discovery", exact: true })
      .click();
    await clueRow.waitFor({ state: "detached" });
    await route("root/discoveries/discovery-seal/claims");
    await page
      .getByRole("listitem")
      .filter({ hasText: "The archive opened from within." })
      .getByRole("button", { name: "Delete facet", exact: true })
      .click();
    await page.getByText(/Remove the references/).waitFor();
    assert.equal(current("root").discoveries[0].claims.length, 2);
    for (const [collection, singular] of [
      ["prerequisites", "prerequisite"],
      ["dependencies", "dependency"],
    ]) {
      await route("root/" + collection);
      await page
        .getByRole("link", {
          name: new RegExp("^\\+?\\s*Add " + singular + "$"),
          exact: true,
        })
        .click();
      await page
        .getByRole("combobox", { name: "Plot", exact: true })
        .selectOption("peer");
      await field("Cross-branch rationale").fill(
        "Both branches share the keeper",
      );
      await save("Save " + singular);
      assert.equal(current("root")[collection][0].plotDefinitionId, "peer");
      await route("root/" + collection + "/peer");
      await field("Cross-branch rationale").fill("Updated shared keeper");
      await save("Save " + singular);
      await route("root/" + collection);
      page.once("dialog", (d) => d.accept());
      await page
        .getByRole("button", { name: "Remove " + singular, exact: true })
        .click();
      await page
        .getByRole("button", { name: "Remove " + singular, exact: true })
        .waitFor({ state: "detached" });
      assert.deepEqual(current("root")[collection], []);
    }
    await route("root/locations");
    await page
      .getByRole("link", {
        name: /^(?:\+\s*)?Add Location context$/,
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .selectOption("tower");
    await save("Save Location context");
    assert.deepEqual(current("root").locationContexts[0], originalQuay);
    const locationContext = current("root").locationContexts.find(
      (c) => c.locationId === "tower",
    );
    await route("root/locations/" + encodeURIComponent(locationContext.id));
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .selectOption("tower");
    await save("Save Location context");
    await route("root/locations");
    const locationRow = page
      .getByRole("listitem")
      .filter({ hasText: "Bell Tower yard" });
    page.once("dialog", (d) => d.accept());
    await locationRow
      .getByRole("button", { name: "Remove Location context", exact: true })
      .click();
    await locationRow.waitFor({ state: "detached" });
    assert.deepEqual(current("root").locationContexts, [originalQuay]);
    await route("root/locations/context-quay/placements");
    await page
      .getByRole("link", { name: "Harbor lookout", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("option", { name: "Distant guide", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("combobox", { name: "Campaign placement", exact: true })
      .selectOption("placement-second");
    await save("Save placement association");
    assert.deepEqual(
      current("root").locationContexts[0].placementDefinitionIds,
      ["placement-second"],
    );
    await route("root/locations/context-quay");
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .selectOption("tower");
    await page
      .getByRole("button", { name: "Save Location context", exact: true })
      .click();
    await page.getByText(/Remove.*associations.*before/i).waitFor();
    assert.equal(current("root").locationContexts[0].locationId, "quay");
    await route("root/locations/context-quay/placements");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Remove association", exact: true })
      .click();
    await page
      .getByText("No placement associations yet.", { exact: true })
      .waitFor();
    await page
      .getByRole("link", {
        name: /^(?:\+\s*)?Add placement association$/,
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "Campaign placement", exact: true })
      .selectOption("placement-intent");
    await save("Save placement association");
    assert.deepEqual(current("root").locationContexts[0], originalQuay);
    // Subplots are individually created, edited, reparented and deleted.
    await route("root/subplots");
    await page
      .getByRole("link", { name: /^(?:\+\s*)?Add subplot$/, exact: true })
      .click();
    await field("Name").fill("Find the keeper");
    await save("Save Plot");
    const child = draft.records.find(
      (r) => r.payload.name === "Find the keeper",
    );
    assert.equal(child.payload.parent.parentPlotDefinitionId, "root");
    await route("");
    const rootRow = page
      .getByRole("listitem")
      .filter({ hasText: "Harbor Mystery" });
    await rootRow
      .getByRole("button", { name: "Delete Plot", exact: true })
      .click();
    await page.getByText(/Move or delete this Plot/).waitFor();
    await route(encodeURIComponent(child.sourceId));
    await page.getByRole("button", { name: "Edit plot", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Parent Plot", exact: true })
      .selectOption("peer");
    await save("Save Plot");
    assert.equal(current(child.sourceId).parent.parentPlotDefinitionId, "peer");
    await route("root/subplots/" + encodeURIComponent(child.sourceId));
    await page.getByText(/This Plot is unavailable/).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Save Plot", exact: true })
        .count(),
      0,
    );
    await route("peer/subplots");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete Plot", exact: true })
      .click();
    await page.getByText("No subplots yet.", { exact: true }).waitFor();
    assert(!current(child.sourceId));
    await route("new");
    const beforeRequired = draft.storageRevision;
    await page.getByRole("button", { name: "Save Plot", exact: true }).click();
    assert.equal(draft.storageRevision, beforeRequired);
    await field("Name").fill("New root for deletion");
    await save("Save Plot");
    const newRoot = draft.records.find(
      (r) => r.payload.name === "New root for deletion",
    );
    assert.equal(newRoot.payload.parent.kind, "root");
    await route("");
    const newRootRow = page
      .getByRole("listitem")
      .filter({ hasText: "New root for deletion" });
    page.once("dialog", (d) => d.accept());
    await newRootRow
      .getByRole("button", { name: "Delete Plot", exact: true })
      .click();
    await newRootRow.waitFor({ state: "detached" });
    assert(!current(newRoot.sourceId));
    // Failure retains individual input; navigation is guarded and stale writes lock editing.
    await route("root/objectives/objective-bell");
    await field("Name").fill("Unsaved objective");
    failNext = true;
    await page
      .getByRole("button", { name: "Save objective", exact: true })
      .click();
    await page
      .getByText(
        "The Campaign draft was not saved. Your changes remain on this page.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await field("Name").inputValue(), "Unsaved objective");
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("link", { name: "Leave Plot editor", exact: true })
      .click();
    assert.equal(await field("Name").inputValue(), "Unsaved objective");
    await save("Save objective");
    assert.equal(
      current("root").objectives[0].extensions["fixture:detail"].rank,
      2,
    );
    await route("root/objectives/objective-bell");
    await field("Name").fill("Stale overwrite");
    staleNext = true;
    await page
      .getByRole("button", { name: "Save objective", exact: true })
      .click();
    await page
      .getByText(/This draft changed elsewhere/)
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Save objective", exact: true })
        .count(),
      0,
    );
    assert.equal(current("root").objectives[0].name, "Unsaved objective");
    await route("root");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Edit plot", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // Current mobile entry uses the selected Plot's progressively disclosed outline.
    const outline = page.getByRole("region", {
      name: "Plot outline",
      exact: true,
    });
    assert.equal(await outline.count(), 0);
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    await outline.waitFor();
    await page
      .getByRole("button", { name: "Close outline", exact: true })
      .click();
    assert.equal(await outline.count(), 0);
    assert.deepEqual(draft.capturedWorldContent, originalCapture);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(
      JSON.stringify({
        passed: true,
        writes: writes.length,
        revision: draft.storageRevision,
      }),
    );
  } catch (e) {
    console.log("Browser errors", errors, "writes", writes.length);
    console.log((await page.locator("body").innerText()).slice(-8000));
    throw e;
  } finally {
    await browser.close();
  }
});
