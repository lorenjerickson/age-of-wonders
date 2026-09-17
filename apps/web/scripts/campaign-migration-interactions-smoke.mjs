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
  join(tmpdir(), "aow-campaign-migration-interactions.png");
async function withFixture(run) {
  const name = `campaign-migration-interactions-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CAMPAIGN_MIGRATION_TEST_PORT || 5188);
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
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider,Outlet} from '@tanstack/react-router';
import {CampaignWorldMigrationPage} from './CampaignDefinitionPages';
import {CampaignDefinitionAuthoringProvider,CampaignDefinitionContextBar,useCampaignDefinitionAuthoring} from './CampaignDefinitionAuthoringShell';
import './index.css';
const {definition,draft}=await fetch('/fixture').then(r=>r.json());
const root=createRootRoute({component:()=> <CampaignDefinitionAuthoringProvider definition={definition} initialDraft={draft}><CampaignDefinitionContextBar/><Outlet/></CampaignDefinitionAuthoringProvider>});
const migration=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/versions/migrate',component:CampaignWorldMigrationPage});
function Versions(){const {draft,saveDraft}=useCampaignDefinitionAuthoring();return <><h1>Versions after migration</h1><button onClick={()=>{if(draft)void saveDraft({...draft,revisionName:'Saved after migration'})}}>Save after migration</button></>}
const versions=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign/versions',component:Versions});
const router=createRouter({routeTree:root.addChildren([migration,versions]),history:createMemoryHistory({initialEntries:['/campaigns/definitions/campaign/versions/migrate']})});
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
const definition = {
  id: "campaign",
  name: "Flood Campaign",
  status: "active",
  revisions: [],
};
let draft = {
  id: "draft",
  baseRevisionId: "campaign-base",
  capturedWorld: {
    worldName: "Flooded City",
    worldDefinitionId: "world",
    worldDefinitionRevisionId: "world-one",
    snapshotId: "snapshot-one",
    revisionNumber: 1,
  },
  revisionName: "Draft",
  content: {},
  records: [],
  storageRevision: 1,
  validationStatus: "not-validated",
};
const world = {
  id: "world",
  name: "Flooded City",
  revisions: [
    {
      id: "world-one",
      revisionNumber: 1,
      name: "Original",
      snapshots: [{ id: "snapshot-one" }],
    },
    {
      id: "world-two",
      predecessorRevisionId: "world-one",
      revisionNumber: 2,
      name: "Rebuilt Quays",
      snapshots: [{ id: "snapshot-two" }],
    },
    {
      id: "world-alt",
      predecessorRevisionId: "world-one",
      revisionNumber: 3,
      name: "Another direct branch",
      snapshots: [{ id: "snapshot-alt" }],
    },
    {
      id: "world-grandchild",
      predecessorRevisionId: "world-two",
      revisionNumber: 4,
      name: "Not a direct successor",
      snapshots: [{ id: "snapshot-grandchild" }],
    },
  ],
};
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 1100 },
  });
  page.setDefaultTimeout(15000);
  const errors = [],
    previews = [],
    applies = [],
    resets = [];
  let failWorld = true,
    failPreview = false,
    failApply = 0,
    planVersion = 1;
  page.on("pageerror", (e) => errors.push(e.message));
  const makePreview = (body) => {
    const co = body.conflictOffset || 0,
      ca = body.candidateOffset || 0,
      wo = body.changeOffset || 0,
      io = body.impactOffset || 0;
    const rows = (offset, fn) =>
      Array.from({ length: Math.min(50, 51 - offset) }, (_, i) =>
        fn(offset + i),
      );
    const complete = (body.mappings || []).length === 51;
    return {
      planHash: "plan-" + planVersion,
      sourceWorld: draft.capturedWorld,
      targetWorld: {
        worldName: "Flooded City",
        revisionNumber:
          body.targetWorldDefinitionSnapshotId === "snapshot-alt" ? 3 : 2,
      },
      ready: complete,
      presentationTruncated: true,
      changes: {
        added: rows(wo, (i) => ({
          name: "Added quay " + (i + 1),
          resourceType: "locations",
          typeLabel: "Location",
        })),
        changed: [],
        removed: [],
      },
      changeSummary: {
        added: 51,
        changed: 0,
        removed: 0,
        returned: { added: Math.min(50, 51 - wo), changed: 0, removed: 0 },
        offset: wo,
        ...(wo === 0 ? { nextOffset: 50 } : {}),
        truncated: true,
      },
      conflicts: complete
        ? []
        : rows(co, (i) => ({
            code: "missing",
            subject: "Quay " + (i + 1),
            sourceLabel: "Quay " + (i + 1),
            detail: "Choose a captured replacement.",
            source: { resourceType: "locations", id: "source-" + i },
            candidates: Array.from(
              { length: Math.min(12, 13 - ca) },
              (_, j) => ({
                id: "target-" + (ca + j),
                label: "Replacement " + (ca + j + 1),
                typeLabel: "Location",
              }),
            ),
            candidateSummary: {
              total: 13,
              returned: Math.min(12, 13 - ca),
              offset: ca,
              truncated: true,
            },
          })),
      conflictSummary: {
        total: complete ? 0 : 51,
        returned: complete ? 0 : Math.min(50, 51 - co),
        offset: co,
        ...(co === 0 ? { nextOffset: 50 } : {}),
        truncated: !complete,
      },
      impact: {
        offset: io,
        ...(io === 0 ? { nextOffset: 50 } : {}),
        presentationTruncated: true,
        summary: {
          locationMoves: 51,
          affectedPlots: 51,
          affectedReferences: 51,
          modelReleasesAdded: 51,
          modelReleasesRemoved: 51,
        },
        locationMoves: rows(io, (i) => ({
          locationName: "Moved quay " + (i + 1),
          fromParentName: "Old bank",
          toParentName: "New bank",
        })),
        affectedPlots: rows(io, (i) => ({
          plotName: "Affected Plot " + (i + 1),
          reasons: ["Location changed"],
        })),
        affectedReferences: rows(io, (i) => ({
          name: "Reference " + (i + 1),
          typeLabel: "Location",
          change: "updated",
        })),
        modelReleases: {
          added: rows(io, (i) => ({ name: "New model " + (i + 1) })),
          removed: rows(io, (i) => ({ name: "Old model " + (i + 1) })),
        },
      },
    };
  };
  await page.route("**/fixture", (r) =>
    r.fulfill({ json: { definition, draft } }),
  );
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/worlds/world") {
      if (failWorld) {
        failWorld = false;
        return r.fulfill({ status: 503, json: { message: "Unavailable" } });
      }
      return r.fulfill({ json: world });
    }
    if (
      path === "/api/campaigns/campaign/draft" &&
      r.request().method() === "GET"
    )
      return r.fulfill({ json: draft });
    const body = r.request().postDataJSON();
    assert.equal(body.expectedStorageRevision, draft.storageRevision);
    if (
      path === "/api/campaigns/campaign/draft" &&
      r.request().method() === "PUT"
    ) {
      draft = {
        ...draft,
        storageRevision: draft.storageRevision + 1,
        revisionName: body.revisionName,
      };
      return r.fulfill({ json: draft });
    }
    if (path.endsWith("/draft/reset")) {
      resets.push(body);
      draft = { ...draft, storageRevision: draft.storageRevision + 1 };
      return r.fulfill({ json: draft });
    }
    if (path.endsWith("/world-migrations/preview")) {
      previews.push(body);
      if (failPreview) {
        failPreview = false;
        return r.fulfill({
          status: 503,
          json: { message: "Comparison unavailable" },
        });
      }
      return r.fulfill({ json: makePreview(body) });
    }
    if (path.endsWith("/world-migrations/apply")) {
      applies.push(body);
      if (failApply) {
        const status = failApply;
        failApply = 0;
        return r.fulfill({ status, json: { message: "Apply rejected" } });
      }
      assert.equal(body.expectedPlanHash, "plan-" + planVersion);
      assert.equal(body.mappings.length, 51);
      draft = {
        ...draft,
        storageRevision: draft.storageRevision + 1,
        capturedWorld: {
          ...draft.capturedWorld,
          revisionNumber: 3,
          snapshotId: body.targetWorldDefinitionSnapshotId,
        },
      };
      return r.fulfill({ json: { id: "new-revision", revisionNumber: 2 } });
    }
    throw new Error("Unexpected route " + path);
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const preview = async (name = "Preview complete migration") => {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/world-migrations/preview"),
    );
    await button(name).click();
    await response;
    await button("Preview complete migration").waitFor({ state: "visible" });
    await page.waitForTimeout(80);
  };
  const fullyReview = async () => {
    if (await button("More World changes").isEnabled())
      await preview("More World changes");
    if (await button("More impacts").isEnabled()) await preview("More impacts");
    if (await button("Previous World changes").isEnabled())
      await preview("Previous World changes");
    if (await button("Previous impacts").isEnabled())
      await preview("Previous impacts");
  };
  try {
    await page.goto(url);
    await button("Retry World revisions").click();
    const target = page.getByRole("combobox", {
      name: /^Target direct-lineage/,
    });
    await target.selectOption("snapshot-two");
    assert.equal(
      await target
        .getByRole("option", { name: /Not a direct successor/ })
        .count(),
      0,
    );
    page.once("dialog", (d) => d.dismiss());
    await button("Discard changes and reset before migration").click();
    assert.equal(resets.length, 0);
    page.once("dialog", (d) => d.accept());
    await button("Discard changes and reset before migration").click();
    await page
      .getByText(
        "The draft now matches the published Campaign revision. You can preview migration safely.",
        { exact: true },
      )
      .waitFor();
    assert.equal(resets.length, 1);
    await preview();
    assert.equal(applies.length, 0);
    assert(await button("Apply complete migration").isDisabled());
    await preview("More replacements");
    assert.equal(previews.at(-1).candidateOffset, 12);
    assert(await button("More replacements").isDisabled());
    await preview("Previous replacements");
    assert.equal(previews.at(-1).candidateOffset, 0);
    await preview("Next conflicts");
    assert.equal(previews.at(-1).conflictOffset, 50);
    await preview("Previous conflicts");
    assert.equal(previews.at(-1).conflictOffset, 0);
    for (const select of await page
      .getByRole("combobox", { name: /^Reconcile with target content/ })
      .all())
      await select.selectOption("target-0");
    await preview("Next conflicts");
    assert.equal(previews.at(-1).mappings.length, 50);
    await page
      .getByRole("combobox", { name: /^Reconcile with target content/ })
      .selectOption("target-1");
    await preview("Update dry run with mappings");
    assert.equal(previews.at(-1).mappings.length, 51);
    await fullyReview();
    assert(await button("Apply complete migration").isEnabled());
    // A different plan cannot inherit pages reviewed for its predecessor.
    planVersion++;
    await preview();
    assert(
      await button("Apply complete migration").isDisabled(),
      "Changed plan must reset review coverage",
    );
    await fullyReview();
    assert(await button("Apply complete migration").isEnabled());
    failPreview = true;
    await preview();
    await page
      .getByText("The complete migration comparison could not be prepared.", {
        exact: true,
      })
      .waitFor();
    assert(
      (await button("Apply complete migration").count()) === 0 ||
        (await button("Apply complete migration").isDisabled()),
      "Failed comparison must invalidate old apply",
    );
    await preview();
    await fullyReview();
    failApply = 409;
    await button("Apply complete migration").click();
    await page
      .getByRole("alert")
      .filter({ hasText: /Migration/ })
      .waitFor();
    assert(
      (await button("Apply complete migration").count()) === 0 ||
        (await button("Apply complete migration").isDisabled()),
      "Rejected apply must require new comparison",
    );
    await preview();
    await fullyReview();
    failApply = 503;
    await button("Apply complete migration").click();
    await page
      .getByRole("alert")
      .filter({ hasText: /Migration/ })
      .waitFor();
    assert.equal(await button("Apply complete migration").count(), 0);
    await preview();
    await fullyReview();
    // Target change discards mappings and prior comparison.
    await target.selectOption("snapshot-alt");
    assert.equal(await button("Apply complete migration").count(), 0);
    await preview();
    assert.equal(previews.at(-1).mappings.length, 0);
    assert.equal(
      previews.at(-1).targetWorldDefinitionSnapshotId,
      "snapshot-alt",
    );
    for (const select of await page
      .getByRole("combobox", { name: /^Reconcile with target content/ })
      .all())
      await select.selectOption("target-0");
    await preview("Next conflicts");
    await page
      .getByRole("combobox", { name: /^Reconcile with target content/ })
      .selectOption("target-1");
    await preview("Update dry run with mappings");
    await fullyReview();
    await button("Apply complete migration").click();
    await page
      .getByRole("heading", { name: "Versions after migration", exact: true })
      .waitFor();
    assert.equal(applies.length, 3);
    const migratedRevision = draft.storageRevision;
    await button("Save after migration").click();
    await page.getByText("Draft saved", { exact: true }).waitFor();
    assert.equal(
      draft.storageRevision,
      migratedRevision + 1,
      "Provider must adopt fresh migrated draft revision before subsequent save",
    );
    assert.equal(draft.revisionName, "Saved after migration");
    const writesBeforeReadOnly = applies.length + resets.length;
    draft = { ...draft, baseRevisionId: undefined };
    await page.reload();
    await page
      .getByRole("heading", { name: "World migration", exact: true })
      .waitFor();
    assert.equal(
      await button("Discard changes and reset before migration").count(),
      0,
    );
    definition.status = "archived";
    await page.reload();
    await page
      .getByRole("heading", { name: "World migration", exact: true })
      .waitFor();
    assert.equal(await button("Preview complete migration").count(), 0);
    await page.keyboard.press("Enter");
    definition.status = "active";
    draft = { ...draft, status: "stale" };
    await page.reload();
    await page
      .getByRole("heading", { name: "World migration", exact: true })
      .waitFor();
    assert.equal(await button("Preview complete migration").count(), 0);
    await page.keyboard.press("Enter");
    draft = undefined;
    await page.reload();
    await page
      .getByRole("heading", { name: "World migration", exact: true })
      .waitFor();
    assert.equal(await button("Preview complete migration").count(), 0);
    await page.keyboard.press("Enter");
    assert.equal(applies.length + resets.length, writesBeforeReadOnly);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        previewRequests: previews.length,
        applyRequests: applies.length,
        resetRequests: resets.length,
        coverage:
          "direct targets, load retry, reset cancel/confirm, 51 conflicts+all change/impact/model pages,13 candidate pages,mapping roundtrip, changed-plan review invalidation,preview503/apply409 recovery,target reset,apply navigation",
      }),
    );
  } catch (e) {
    console.log("Errors", errors);
    console.log((await page.locator("body").innerText()).slice(-2200));
    throw e;
  } finally {
    await browser.close();
  }
});
