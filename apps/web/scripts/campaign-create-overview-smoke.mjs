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
  join(tmpdir(), "aow-campaign-create-overview.png");
async function withFixture(run) {
  const name = `campaign-create-overview-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CAMPAIGN_VIEWS_TEST_PORT || 5191);
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
import { createRoot } from 'react-dom/client';
import { createRootRoute,createRoute,createRouter,createBrowserHistory,RouterProvider,Outlet,Link } from '@tanstack/react-router';
import {CampaignDefinitionCreatePage,CampaignDefinitionOverviewPage} from './CampaignDefinitionPages';
import {CampaignDefinitionAuthoringProvider,CampaignDefinitionContextBar,CampaignDefinitionUnsavedNavigationGuard} from './CampaignDefinitionAuthoringShell';
import './index.css';
const initial=await fetch('/fixture').then(r=>r.json());
const root=createRootRoute({component:()=> <><Link to="/campaigns">Campaign library</Link><Outlet/></>});
const library=createRoute({getParentRoute:()=>root,path:'/campaigns',component:()=> <h1>Campaign library</h1>});
const creation=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/new',component:CampaignDefinitionCreatePage});
const definitionRoute=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign',loader:()=>fetch('/fixture').then(r=>r.json()),component:()=>{const {definition,draft}=definitionRoute.useLoaderData();return <CampaignDefinitionAuthoringProvider definition={definition} initialDraft={draft}><CampaignDefinitionUnsavedNavigationGuard/><CampaignDefinitionContextBar/><CampaignDefinitionOverviewPage/></CampaignDefinitionAuthoringProvider>}});
window.history.replaceState(null,'',initial.initialPath);
const router=createRouter({routeTree:root.addChildren([library,creation,definitionRoute]),history:createBrowserHistory()});
const originalNavigate=router.navigate.bind(router);router.navigate=((options)=>{if((window as any).__failNavigation && String(options.to).includes('/definitions/campaign'))return Promise.reject(new Error('Injected navigation failure'));return originalNavigate(options);}) as typeof router.navigate;
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
  snapshotId: "snapshot-b",
  worldDefinitionId: "world-b",
  worldName: "Birch World",
  revisionNumber: 2,
};
const definition = {
  id: "campaign",
  name: "Campaign under test",
  status: "active",
  revisions: [],
  metadataRevision: 1,
};
let draft = {
  id: "draft",
  campaignDefinitionId: "campaign",
  revisionName: "First draft",
  storageRevision: 1,
  capturedWorld,
  capturedWorldContent: {
    locations: [],
    creatures: [],
    items: [],
    placements: [],
  },
  content: {
    formatVersion: 1,
    gmPremise: "Original premise",
    playerIntroduction: "Original introduction",
    plotDefinitionIds: [],
    placementDefinitionIds: [],
    modelSchemaReleaseIds: [],
  },
  records: [],
};
let initialPath = "/campaigns/definitions/new",
  createCalls = 0,
  proposalCalls = 0,
  failCreate = false,
  failWorld = false,
  holdCreate = false,
  releaseCreate,
  failSave = 0,
  failProposal = false,
  heldWorld,
  holdWorld = false;
const writes = [],
  errors = [],
  coverage = [];
function world(id) {
  return {
    id,
    name: id === "world-a" ? "Ash World" : "Birch World",
    revisions:
      id === "empty"
        ? []
        : [
            {
              id: "rev-" + id,
              name: id === "world-a" ? "Ash release" : "Birch release",
              revisionNumber: 2,
              publishedAt: "2026-09-01",
              snapshots: [
                { id: id === "world-a" ? "snapshot-a" : "snapshot-b" },
              ],
            },
          ],
  };
}
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("PAGE ERROR", e.message);
    });
    await page.route("**/*", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const json = (value, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(value),
        });
      if (req.isNavigationRequest() && path.startsWith("/campaigns"))
        return route.fulfill({
          contentType: "text/html",
          body: await (await fetch(url)).text(),
        });
      if (path === "/fixture") return json({ initialPath, definition, draft });
      if (path === "/api/worlds")
        return json({
          items: [
            { id: "world-a", name: "Ash World", status: "active" },
            { id: "world-b", name: "Birch World", status: "active" },
            { id: "empty", name: "Unpublished World", status: "active" },
          ],
        });
      if (path.startsWith("/api/worlds/")) {
        if (failWorld) return json({ message: "World unavailable" }, 503);
        const id = path.split("/").at(-1);
        if (id === "world-a" && holdWorld) {
          heldWorld = () => json(world(id));
          return;
        }
        return json(world(id));
      }
      if (path.includes("/campaign-definition-draft-proposals")) {
        proposalCalls++;
        if (failProposal) return json({ message: "Proposal unavailable" }, 503);
        return json({
          draftProposal: {
            content: { ...draft.content, gmPremise: "AI mystery" },
            records: [
              {
                resourceType: "plots",
                sourceId: "proposed-plot",
                payload: { name: "AI Plot" },
              },
            ],
          },
        });
      }
      if (path === "/api/campaigns" && req.method() === "POST") {
        createCalls++;
        writes.push(req.postDataJSON());
        if (failCreate) return json({ message: "Creation unavailable" }, 503);
        definition.name = req.postDataJSON().name;
        if (holdCreate) {
          releaseCreate = () => json({ ...definition, draft });
          return;
        }
        return json({ ...definition, draft });
      }
      if (path === "/api/campaigns/campaign/draft" && req.method() === "PUT") {
        writes.push(req.postDataJSON());
        if (failSave) {
          const status = failSave;
          failSave = 0;
          return json({ message: "Draft write rejected" }, status);
        }
        const body = req.postDataJSON();
        assert.equal(body.expectedStorageRevision, draft.storageRevision);
        draft = {
          ...draft,
          content: body.content,
          records: body.records,
          revisionName: body.revisionName,
          storageRevision: draft.storageRevision + 1,
        };
        return json(draft);
      }
      if (path.startsWith("/api/")) return json({ items: [] });
      return route.continue();
    });
    const reset = async (path = "/campaigns/definitions/new") => {
      initialPath = path;
      await page.goto(url);
      await page
        .getByRole("heading", {
          name: path.includes("/new")
            ? "Create Campaign Definition"
            : "Overview",
          exact: true,
        })
        .waitFor();
    };
    const choose = async () => {
      await page.getByRole("combobox").nth(0).selectOption("world-b");
      await page.getByRole("combobox").nth(1).selectOption("snapshot-b");
      await page
        .getByLabel("Name", { exact: true })
        .fill("Investigation Campaign");
    };
    await reset();
    assert(
      await page
        .getByRole("button", { name: "Create working draft" })
        .isDisabled(),
    );
    coverage.push("required empty creation controls");
    await page.getByRole("combobox").nth(0).selectOption("empty");
    await page
      .getByText("This World has no published revision.", { exact: false })
      .waitFor();
    coverage.push("unpublished World empty readiness");
    failWorld = true;
    await page.getByRole("combobox").nth(0).selectOption("world-a");
    await page
      .getByText("That World’s published revisions could not be loaded.", {
        exact: true,
      })
      .waitFor();
    failWorld = false;
    await page.getByRole("combobox").nth(0).selectOption("world-b");
    await page.getByRole("combobox").nth(1).selectOption("snapshot-b");
    assert.equal(
      await page
        .getByText("That World’s published revisions could not be loaded.", {
          exact: true,
        })
        .count(),
      0,
    );
    coverage.push(
      "World revision load failure and selection retry clears error",
    );
    holdWorld = true;
    await page.getByRole("combobox").nth(0).selectOption("world-a");
    while (!heldWorld) await page.waitForTimeout(20);
    await page.getByRole("combobox").nth(0).selectOption("world-b");
    await page.getByRole("combobox").nth(1).selectOption("snapshot-b");
    await heldWorld();
    holdWorld = false;
    await page.waitForTimeout(150);
    assert.equal(
      await page
        .getByRole("combobox")
        .nth(1)
        .locator("option")
        .filter({ hasText: "Ash release" })
        .count(),
      0,
      "stale World response must not replace current selection",
    );
    coverage.push("reversed World response race");
    await page
      .getByLabel("Name", { exact: true })
      .fill("Investigation Campaign");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Saved description");
    failCreate = true;
    await page.getByRole("button", { name: "Create working draft" }).click();
    await page.getByText("Creation unavailable", { exact: false }).waitFor();
    assert.equal(
      await page.getByLabel("Name", { exact: true }).inputValue(),
      "Investigation Campaign",
    );
    failCreate = false;
    holdCreate = true;
    await page.getByRole("button", { name: "Create working draft" }).click();
    while (!releaseCreate) await page.waitForTimeout(20);
    assert(
      await page
        .getByRole("button", { name: "Create working draft" })
        .isDisabled(),
    );
    assert.equal(createCalls, 2);
    await releaseCreate();
    holdCreate = false;
    coverage.push("pending creation disables duplicate submit");
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    assert.equal(createCalls, 2);
    assert.equal(writes.at(-1).worldDefinitionSnapshotId, "snapshot-b");
    coverage.push(
      "manual create fail, retained fields, retry, exact capture and overview transition",
    );
    const premise = page.locator("textarea").nth(0);
    await premise.fill("Edited premise");
    await page.locator("input").first().fill("Investigation release");
    await page.locator("textarea").nth(1).fill("Edited introduction");
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("link", { name: "Campaign library", exact: true })
      .click();
    assert.equal(await premise.inputValue(), "Edited premise");
    coverage.push("dirty navigation cancel retains overview input");
    failSave = 503;
    await page.getByRole("button", { name: "Save overview" }).click();
    await page
      .getByText("The Campaign draft was not saved.", { exact: false })
      .waitFor();
    assert.equal(await premise.inputValue(), "Edited premise");
    await page.getByRole("button", { name: "Save overview" }).click();
    await page.getByText("Draft saved", { exact: true }).waitFor();
    assert.equal(draft.content.gmPremise, "Edited premise");
    await reset("/campaigns/definitions/campaign");
    assert.equal(
      await page.locator("textarea").nth(0).inputValue(),
      "Edited premise",
    );
    coverage.push(
      "overview all fields save fail/retry, authoritative mock persistence and reload",
    );
    await page.locator("textarea").nth(0).fill("Discard me");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.reload({ timeout: 3000 }).catch(() => {});
    assert.equal(
      await page.locator("textarea").nth(0).inputValue(),
      "Discard me",
    );
    coverage.push(
      "beforeunload hard reload cancellation retains unsaved overview input",
    );
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("link", { name: "Campaign library", exact: true })
      .click();
    await page.getByRole("heading", { name: "Campaign library" }).waitFor();
    coverage.push("dirty navigation accepted discard");
    await reset();
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.getByRole("heading", { name: "Campaign library" }).waitFor();
    coverage.push("creation cancel transition");
    await reset();
    await choose();
    await page.getByLabel("Campaign direction").fill("AI prompt");
    failProposal = true;
    const before = createCalls;
    await page.getByRole("button", { name: "Create working draft" }).click();
    await page.getByText("Proposal unavailable", { exact: false }).waitFor();
    assert.equal(createCalls, before);
    failProposal = false;
    failSave = 503;
    await page.getByRole("button", { name: "Create working draft" }).click();
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /Retry.*proposal/i }).click();
    await page
      .getByText("The AI proposal was applied", { exact: false })
      .waitFor();
    assert.equal(draft.content.gmPremise, "AI mystery");
    assert.equal(draft.records[0].payload.campaignDefinitionId, "campaign");
    assert.equal(createCalls, before + 1);
    coverage.push(
      "AI generation failure creates nothing; proposal save failure recovery applies once to created Campaign",
    );
    await reset();
    await choose();
    await page.getByLabel("Campaign direction").fill("AI success");
    await page.getByRole("button", { name: "Create working draft" }).click();
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    assert.equal(draft.content.gmPremise, "AI mystery");
    coverage.push(
      "AI successful proposal/create/save transition with no external AI",
    );
    await page.locator("textarea").nth(0).fill("Stale edit");
    failSave = 409;
    await page.getByRole("button", { name: "Save overview" }).click();
    await page
      .getByText("This draft changed elsewhere", { exact: false })
      .first()
      .waitFor();
    coverage.push("overview409 stale recovery");
    await reset(
      "/campaigns/definitions/campaign?creationNotice=proposal-not-applied",
    );
    await page.evaluate(() =>
      sessionStorage.removeItem("campaign-proposal:campaign"),
    );
    await page.getByRole("button", { name: /Retry.*proposal/i }).click();
    await page
      .getByText("The original proposal is no longer available.", {
        exact: false,
      })
      .waitFor();
    await page.evaluate(() =>
      sessionStorage.setItem("campaign-proposal:campaign", "{broken"),
    );
    await page.getByRole("button", { name: /Retry.*proposal/i }).click();
    await page
      .getByText("The proposal could not be recovered.", { exact: false })
      .waitFor();
    coverage.push(
      "missing and corrupt proposal recovery storage keeps draft safe",
    );
    await reset();
    await choose();
    await page.evaluate(() => {
      window.__failNavigation = true;
    });
    const beforeNavigationFailure = createCalls;
    await page.getByRole("button", { name: "Create working draft" }).click();
    await page
      .getByText(
        "The Campaign Definition was created, but it could not be opened automatically.",
        { exact: false },
      )
      .waitFor();
    assert.equal(createCalls, beforeNavigationFailure + 1);
    await page.evaluate(() => {
      window.__failNavigation = false;
    });
    await page.getByRole("button", { name: "Open existing draft" }).click();
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    assert.equal(createCalls, beforeNavigationFailure + 1);
    coverage.push(
      "post-create navigation rejection opens existing draft without duplicate create",
    );
    await page.locator("input").first().fill("Keyboard saved revision");
    await page.locator("input").first().press("Enter");
    await page.getByText("Draft saved", { exact: true }).waitFor();
    assert.equal(draft.revisionName, "Keyboard saved revision");
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.getByRole("button", { name: "Save overview" }).isVisible(),
    );
    coverage.push(
      "keyboard Enter submits overview; narrow viewport keeps save reachable",
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(
      JSON.stringify(
        { passed: coverage, createCalls, proposalCalls, screenshotPath },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      (
        await browser.contexts()[0]?.pages()[0]?.locator("body").innerText()
      )?.slice(0, 4000),
    );
    throw error;
  } finally {
    await browser.close();
  }
});
