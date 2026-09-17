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
  join(tmpdir(), "aow-campaign-authoring-lifecycle.png");
async function withFixture(run) {
  const name = `campaign-authoring-lifecycle-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CAMPAIGN_VIEWS_TEST_PORT || 5193);
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
      `// @ts-nocheck — generated browser fixture uses a separate router from the application registry.
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider,Outlet,Link,useLocation} from '@tanstack/react-router';
import * as Pages from './CampaignDefinitionPages';
import {CampaignPlotRoutePage} from './CampaignPlotRoutePages';
import {CampaignLibraryPage} from './CampaignLibrary';
import {CampaignDefinitionAuthoringProvider,CampaignDefinitionContextBar,CampaignDefinitionSecondaryNavigation,CampaignDefinitionUnsavedNavigationGuard} from './CampaignDefinitionAuthoringShell';
import {ContextualSidebar} from './ContextualNavigation';
import {CampaignUnavailable} from './CampaignDetailPanels';
import {Route as AppRoot} from './routes/__root';
import './index.css';
const bootstrap=await fetch('/bootstrap').then(r=>r.json());
const root=createRootRoute({component:()=>{const location=useLocation();return <><output data-testid="route">{location.pathname+location.searchStr}</output><Outlet/></>},errorComponent:AppRoot.options.errorComponent});
const home=createRoute({getParentRoute:()=>root,path:'/',component:()=> <><h1>Test home</h1><Link to="/campaigns/definitions/campaign">Open Campaign</Link></>});
const library=createRoute({getParentRoute:()=>root,path:'/campaigns',loader:()=>fetch('/library').then(r=>r.json()),component:()=>{const data=library.useLoaderData();return <CampaignLibraryPage definitions={{ok:true,data:{items:data.items,total:data.items.length}}} instances={{ok:true,data:{items:[],total:0}}} quickStartSuffix="?quickStart=review-campaign-definition"/>}});
const route=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign',loader:async()=>{const response=await fetch('/fixture');if(response.status===404)return {found:false};if(!response.ok)throw new Error('Injected private error with opaque id');return {found:true,...await response.json()};},component:()=>{const data=route.useLoaderData();if(!data.found)return <CampaignUnavailable kind="Definition"/>;return <CampaignDefinitionAuthoringProvider definition={data.definition} initialDraft={data.draft}><CampaignDefinitionUnsavedNavigationGuard/><ContextualSidebar systemAdministrator={false} gmAccess={true} onNavigate={()=>{}}/><CampaignDefinitionContextBar/><CampaignDefinitionSecondaryNavigation campaignDefinitionId="campaign" campaignName={data.definition.name} gmScope="gm"/><Outlet/></CampaignDefinitionAuthoringProvider>}});
const views=[['/','CampaignDefinitionOverviewPage'],['plots','CampaignPlotsPage'],['placements','CampaignPlacementsPage'],['preparation','CampaignPreparationPage'],['versions','CampaignVersionsPage'],['versions/draft/review','CampaignReviewPage'],['versions/migrate','CampaignWorldMigrationPage']];
const children=views.map(([path,name])=>createRoute({getParentRoute:()=>route,path,component:()=>{const Page=(Pages as any)[name];return <Page/>}}));
const plotRecord=createRoute({getParentRoute:()=>route,path:'plots/$plotId',component:()=> <Pages.CampaignPlotsPage plotId={plotRecord.useParams().plotId}/>});
const plotCollection=createRoute({getParentRoute:()=>route,path:'plots/$plotId/$collection',component:()=> <CampaignPlotRoutePage {...plotCollection.useParams()}/>});
const plotChild=createRoute({getParentRoute:()=>route,path:'plots/$plotId/$collection/$childId',component:()=> <CampaignPlotRoutePage {...plotChild.useParams()}/>});
children.push(plotRecord,plotCollection,plotChild);
const creation=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/new',component:Pages.CampaignDefinitionCreatePage});
const router=createRouter({routeTree:root.addChildren([home,library,creation,route.addChildren(children)]),history:createMemoryHistory({initialEntries:[bootstrap.initialPath]})});(window as any).__router=router;
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
    await rm(join(webRoot, "node_modules", `.vite-${name}`), {
      recursive: true,
      force: true,
    });
    for (const path of [html, component, config])
      await rm(path, { force: true });
  }
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const capturedWorld = {
  worldName: "Test World",
  worldDefinitionId: "world",
  revisionNumber: 1,
};
const definition = {
  id: "campaign",
  name: "Lifecycle Campaign",
  status: "active",
  metadataRevision: 2,
  currentRevisionId: "revision",
  revisions: [{ id: "revision", revisionNumber: 1, capturedWorld }],
};
const savedDraft = {
  id: "draft",
  campaignDefinitionId: "campaign",
  revisionName: "Working draft",
  storageRevision: 1,
  capturedWorld,
  content: {
    gmPremise: "Safe premise",
    playerIntroduction: "Safe introduction",
  },
  records: [],
};
let initialPath = "/campaigns/definitions/campaign",
  draft,
  loadStatus = 200,
  startStatus = 200,
  restoreStatus = 200,
  startCount = 0,
  restoreCount = 0,
  putCount = 0,
  validationStatus = 200,
  validationValid = true,
  publishStatus = 200,
  publishCount = 0,
  holdPublish = false,
  releasePublish,
  impactStatus = 200;
const coverage = [];
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.route("**/*", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path === "/bootstrap") return json({ initialPath });
      if (path === "/library")
        return json({
          items: [
            { ...definition, name: "Current Story", status: "active" },
            {
              ...definition,
              id: "archived",
              name: "Old Archived Story",
              status: "archived",
            },
          ],
        });
      if (path === "/fixture") return json({ definition, draft }, loadStatus);
      if (path === "/api/campaigns/campaign/draft" && req.method() === "POST") {
        startCount++;
        assert.equal(req.postDataJSON().baseRevisionId, "revision");
        if (startStatus !== 200)
          return json({ message: "Not available" }, startStatus);
        draft = { ...savedDraft };
        return json(draft);
      }
      if (path === "/api/campaigns/campaign/restore") {
        restoreCount++;
        assert.equal(
          req.postDataJSON().expectedMetadataRevision,
          definition.metadataRevision,
        );
        if (restoreStatus !== 200)
          return json({ message: "Not available" }, restoreStatus);
        definition.status = "active";
        definition.metadataRevision++;
        return json(definition);
      }
      if (path === "/api/campaigns/campaign/draft" && req.method() === "GET")
        return json(draft);
      if (path === "/api/campaigns/campaign/draft/validate")
        return json(
          validationStatus === 200
            ? {
                valid: validationValid,
                issues: validationValid
                  ? []
                  : [
                      {
                        code: "plot-invalid",
                        subject: "Named Plot",
                        detail: "A named objective is required.",
                      },
                    ],
              }
            : { message: "Validation unavailable" },
          validationStatus,
        );
      if (path === "/api/campaigns/campaign/draft/publish") {
        publishCount++;
        assert.equal(
          req.postDataJSON().expectedStorageRevision,
          draft.storageRevision,
        );
        if (publishStatus !== 200)
          return json({ message: "Publish failed" }, publishStatus);
        const complete = () => {
          draft = { ...draft, storageRevision: draft.storageRevision + 1 };
          return json({ revisionNumber: 2 });
        };
        if (holdPublish) {
          releasePublish = complete;
          return;
        }
        return complete();
      }
      if (path === "/api/campaigns/campaign/draft/impact")
        return json(
          impactStatus === 200
            ? {
                draftStorageRevision: draft.storageRevision,
                changes: { added: 0, changed: 0, removed: 0 },
                downstreamInstances: [],
              }
            : { message: "Impact unavailable" },
          impactStatus,
        );
      if (req.method() === "PUT") {
        putCount++;
        const body = req.postDataJSON();
        draft = {
          ...draft,
          revisionName: body.revisionName,
          content: body.content,
          records: body.records,
          storageRevision: draft.storageRevision + 1,
        };
        return json(draft);
      }
      if (path.startsWith("/api/")) return json({ items: [] });
      return route.continue();
    });
    const reload = () => page.goto(url);
    await reload();
    await page
      .getByRole("button", { name: "Start editing", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Save overview" }).count(),
      0,
    );
    startStatus = 500;
    await page
      .getByRole("button", { name: "Start editing", exact: true })
      .click();
    await page
      .getByText("A working draft could not be started.", { exact: false })
      .waitFor();
    assert.equal(draft, undefined);
    startStatus = 200;
    await page
      .getByRole("button", { name: "Start editing", exact: true })
      .click();
    await page.getByRole("button", { name: "Save overview" }).waitFor();
    await reload();
    await page.getByRole("button", { name: "Save overview" }).waitFor();
    assert.equal(startCount, 2);
    coverage.push(
      "published no-draft is read-only; Start editing failure/retry persists exact base and reloads",
    );
    definition.status = "archived";
    await reload();
    await page.getByRole("button", { name: "Restore Definition" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Save overview" }).count(),
      0,
    );
    assert.equal(await page.locator("main form").count(), 0);
    assert.equal(putCount, 0);
    coverage.push("archived deep-link has no editor form or submit controls");
    restoreStatus = 403;
    await page.getByRole("button", { name: "Restore Definition" }).click();
    await page
      .getByText("The Campaign Definition could not be restored.", {
        exact: false,
      })
      .waitFor();
    assert.equal(definition.status, "archived");
    restoreStatus = 200;
    await page.getByRole("button", { name: "Restore Definition" }).click();
    await page.getByRole("button", { name: "Save overview" }).waitFor();
    await reload();
    await page.getByRole("button", { name: "Save overview" }).waitFor();
    assert.equal(restoreCount, 2);
    coverage.push(
      "Restore403 safe error and successful retry with exact metadata revision",
    );
    draft = { ...savedDraft, status: "stale" };
    await reload();
    await page.getByText("Needs rebase", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Save overview" }).count(),
      0,
    );
    draft = { ...savedDraft };
    await page
      .getByRole("button", { name: "Reload latest draft" })
      .first()
      .click();
    await page.getByRole("button", { name: "Save overview" }).waitFor();
    coverage.push(
      "stale deep-link cannot submit; reload latest restores editable form",
    );
    for (const status of [403, 404, 500]) {
      loadStatus = status;
      await reload();
      await page
        .getByRole("heading", {
          name:
            status === 404
              ? "This Campaign Definition could not be opened"
              : "Could not open this page",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.getByText("Safe premise", { exact: true }).count(),
        0,
      );
      assert(!(await page.locator("body").innerText()).includes("opaque id"));
      loadStatus = 200;
      await page
        .getByRole("link", {
          name: status === 404 ? "Back to Campaigns" : "Return home",
          exact: true,
        })
        .click();
      if (status === 404)
        await page
          .locator("article")
          .filter({ hasText: "Current Story" })
          .getByRole("link")
          .click();
      else await page.getByRole("link", { name: "Open Campaign" }).click();
      await page.getByRole("button", { name: "Save overview" }).waitFor();
      coverage.push(
        "loader" + status + " neutral actual fallback and navigate/retry",
      );
    }
    const gateFailures = [];
    for (const mode of ["archived", "stale"]) {
      definition.status = mode === "archived" ? "archived" : "active";
      draft = {
        ...savedDraft,
        ...(mode === "stale" ? { status: "stale" } : {}),
      };
      for (const view of [
        "plots",
        "plots/new",
        "placements",
        "preparation",
        "versions/draft/review",
        "versions/migrate",
      ]) {
        initialPath = "/campaigns/definitions/campaign/" + view;
        await reload();
        await page.locator("main").first().waitFor();
        const unsafe = page.locator("main button:enabled, main a").filter({
          hasText:
            /^(Add Plot|Delete Plot|Save|Validate complete draft|Publish Campaign revision|Preview migration|Apply migration)/,
        });
        if (await unsafe.count())
          gateFailures.push(
            mode + ":" + view + ":" + (await unsafe.first().innerText()),
          );
        assert.equal(
          await page.locator("main form").count(),
          0,
          "read-only " +
            mode +
            " " +
            view +
            " must not expose keyboard submit forms",
        );
      }
    }
    console.log("GATE_FINDINGS", JSON.stringify(gateFailures));
    definition.status = "active";
    draft = { ...savedDraft };
    initialPath = "/campaigns?quickStart=review-campaign-definition";
    await reload();
    await page
      .getByRole("heading", { name: "Campaigns", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("article")
        .filter({ hasText: "Old Archived Story" })
        .getByRole("link")
        .count(),
      0,
    );
    await page.getByRole("searchbox").fill("no matching campaign");
    await page
      .getByText("No Campaign Definitions are available yet.", { exact: true })
      .waitFor();
    await page.getByRole("searchbox").fill("");
    await page.getByRole("combobox").selectOption("archived");
    await page
      .locator("article")
      .filter({ hasText: "Old Archived Story" })
      .getByRole("link")
      .waitFor();
    assert.equal(
      await page
        .locator("article")
        .filter({ hasText: "Current Story" })
        .getByRole("link")
        .count(),
      0,
    );
    await page.getByRole("combobox").selectOption("all");
    await page
      .locator("article")
      .filter({ hasText: "Current Story" })
      .getByRole("link")
      .waitFor();
    assert(
      (
        await page
          .getByRole("link", {
            name: "Create Campaign Definition",
            exact: true,
          })
          .getAttribute("href")
      ).endsWith("?quickStart=review-campaign-definition"),
    );
    await page
      .getByRole("link", { name: "Create Campaign Definition", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Create Campaign Definition", exact: true })
      .waitFor();
    assert(
      (await page.getByTestId("route").innerText()).endsWith(
        "?quickStart=review-campaign-definition",
      ),
    );
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("heading", { name: "Campaigns", exact: true })
      .waitFor();
    await page
      .locator("article")
      .filter({ hasText: "Current Story" })
      .getByRole("link")
      .click();
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    for (const [label, suffix, heading] of [
      ["Plots", "plots", "Plots"],
      ["Placements", "placements", "Placements"],
      ["Preparation defaults", "preparation", "Preparation defaults"],
      ["Versions", "versions", "Versions"],
      ["Review & publish", "versions/draft/review", "Review & publish"],
      ["World migration", "versions/migrate", "World migration"],
      ["Overview", "", "Overview"],
    ]) {
      const nav = page.getByRole("navigation", {
        name: "Lifecycle Campaign authoring",
      });
      for (const button of await nav
        .getByRole("button", { name: /^Expand/ })
        .all())
        await button.click();
      const link =
        label === "Overview"
          ? page
              .getByRole("navigation", {
                name: "Lifecycle Campaign navigation",
              })
              .getByRole("link", { name: "Overview", exact: true })
          : (label === "Review & publish" ? page : nav)
              .getByRole("link", { name: label, exact: true })
              .last();
      await link.click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(
        await page.getByTestId("route").innerText(),
        "/campaigns/definitions/campaign" +
          (suffix ? "/" + suffix : "") +
          "?quickStart=review-campaign-definition",
      );
      if (!["Review & publish", "Overview"].includes(label))
        assert.equal(await link.getAttribute("aria-current"), "page");
    }
    await page.evaluate(() => window.__router.history.back());
    await page
      .getByRole("heading", { name: "World migration", exact: true })
      .waitFor();
    await page.evaluate(() => window.__router.history.forward());
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    coverage.push(
      "library search/status/empty/card transitions and Quick Start create/cancel preserved",
    );
    coverage.push(
      "all authoring sidebar targets, current-link state and router back/forward preserve scope+guide",
    );
    assert.deepEqual(gateFailures, [], "every read-only authoring editor gate");
    coverage.push(
      "all editor archived/stale deep links expose no mutation or keyboard-submit controls",
    );
    initialPath = "/campaigns/definitions/campaign/versions/draft/review";
    await reload();
    const validate = () =>
      page.getByRole("button", { name: "Validate complete draft" }).click();
    const publish = () =>
      page.getByRole("button", { name: "Publish Campaign revision" });
    validationValid = false;
    await validate();
    await page
      .getByText("A named objective is required.", { exact: true })
      .waitFor();
    assert(await publish().isDisabled());
    assert((await page.locator("main").innerText()).includes("Named Plot"));
    validationValid = true;
    await validate();
    await page
      .getByText("This complete draft is ready to publish.", { exact: true })
      .waitFor();
    assert(!(await publish().isDisabled()));
    validationStatus = 503;
    await validate();
    await page
      .getByText("The draft could not be validated.", { exact: true })
      .waitFor();
    assert(await publish().isDisabled());
    validationStatus = 200;
    await validate();
    await page
      .getByText("This complete draft is ready to publish.", { exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "Lifecycle Campaign navigation" })
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await page.locator("main input").first().fill("Changed after validation");
    await page.getByRole("button", { name: "Save overview" }).click();
    await page.getByText("Draft saved", { exact: true }).waitFor();
    await page
      .getByRole("link", { name: "Review & publish", exact: true })
      .click();
    assert(await publish().isDisabled());
    await validate();
    await page
      .getByText("This complete draft is ready to publish.", { exact: true })
      .waitFor();
    publishStatus = 409;
    await publish().click();
    await page
      .getByText("Publication could not be confirmed.", { exact: false })
      .waitFor();
    assert(await publish().isDisabled());
    publishStatus = 200;
    await validate();
    await page
      .getByText("This complete draft is ready to publish.", { exact: true })
      .waitFor();
    holdPublish = true;
    const beforePublish = publishCount;
    await publish().click();
    while (!releasePublish) await page.waitForTimeout(20);
    assert(await publish().isDisabled());
    assert.equal(publishCount, beforePublish + 1);
    await releasePublish();
    holdPublish = false;
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    assert.equal(publishCount, beforePublish + 1);
    coverage.push(
      "named validation issues; failed revalidation clears eligibility; edited draft requires validation; stale publish and pending duplicate lock",
    );
    initialPath = "/campaigns/definitions/campaign/versions";
    await reload();
    impactStatus = 500;
    await page.getByRole("button", { name: "Review draft impact" }).click();
    await page
      .getByText("Draft impact could not be loaded.", { exact: false })
      .waitFor();
    impactStatus = 200;
    await page.getByRole("button", { name: "Review draft impact" }).click();
    await page
      .getByText("No Campaign Instances depend on this Definition yet.", {
        exact: true,
      })
      .waitFor();
    coverage.push(
      "draft impact failure/retry and honest empty downstream state",
    );
    const placement = (id, name) => ({
      resourceType: "campaign-placements",
      sourceId: id,
      payload: {
        id,
        name,
        kind: "independent",
        locationId: "location",
        source: { kind: "world-creature", creatureId: "creature" },
        plotDefinitionIds: [],
      },
    });
    draft = {
      ...savedDraft,
      content: {
        ...savedDraft.content,
        placementDefinitionIds: ["place-a", "place-b"],
      },
      capturedWorldContent: {
        locations: [{ id: "location", name: "Test Harbor" }],
        creatures: [{ id: "creature", name: "Harbor Guard" }],
        items: [],
        placements: [],
      },
      records: [
        placement("place-a", "Placement A"),
        placement("place-b", "Placement B"),
      ],
    };
    initialPath = "/campaigns/definitions/campaign/placements";
    await reload();
    await page
      .getByRole("heading", { name: "Placements", exact: true })
      .waitFor();
    const card = (name) =>
      page
        .locator("article")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card("Placement A")
      .getByRole("button", { name: "Edit placement", exact: true })
      .click();
    await page
      .getByLabel("Campaign label", { exact: true })
      .fill("Unsaved A label");
    page.once("dialog", (dialog) => dialog.accept());
    await card("Placement B")
      .getByRole("button", { name: "Remove placement", exact: true })
      .click();
    await card("Placement B").waitFor({ state: "detached" });
    assert.equal(
      await page.getByLabel("Campaign label", { exact: true }).inputValue(),
      "Unsaved A label",
    );
    assert.equal(draft.records.length, 1);
    assert.equal(draft.records[0].payload.name, "Placement A");
    let protectedNavigation = false;
    page.once("dialog", async (dialog) => {
      protectedNavigation = true;
      await dialog.dismiss();
    });
    await page
      .getByRole("navigation", { name: "Lifecycle Campaign navigation" })
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    assert(
      protectedNavigation,
      "removing another record must retain the edited record navigation guard",
    );
    await page
      .getByRole("heading", { name: "Placements", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Campaign label", { exact: true }).inputValue(),
      "Unsaved A label",
    );
    await page
      .getByRole("button", { name: "Save placement", exact: true })
      .click();
    await card("Unsaved A label").waitFor();
    assert.equal(draft.records.length, 1);
    assert.equal(draft.records[0].sourceId, "place-a");
    assert.equal(draft.records[0].payload.name, "Unsaved A label");
    coverage.push(
      "removing B preserves unsaved A input and dirty-navigation guard; A saves after independent removal",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(
      JSON.stringify(
        {
          passed: coverage,
          startCount,
          restoreCount,
          putCount,
          screenshotPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});
