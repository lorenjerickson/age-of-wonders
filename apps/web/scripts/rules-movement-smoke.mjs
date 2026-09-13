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
  process.env.RULES_SCREENSHOT_PATH || join(tmpdir(), "aow-rules-movement.png");
async function withFixture(run) {
  const name = `rules-movement-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.RULES_TEST_PORT || 5183);
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
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { WorldRulesPage } from './WorldRulesPage';
import { SessionMovementPanel } from './SessionMovementPanel';
import './index.css';
const world={id:'world',name:'Clockwork World',status:'active'} as any;
const draft={id:'world-draft',storageRevision:1,revisionName:'Draft',content:{},records:[]} as any;
const root=createRootRoute({component:()=>new URLSearchParams(location.search).has('movement')?<main className="mx-auto max-w-5xl p-8"><SessionMovementPanel campaignDefinitionId="campaign" campaignInstanceId="instance" sessionId="session"/></main>:<WorldAuthoringProvider definition={world} initialDraft={draft}><WorldRulesPage/></WorldAuthoringProvider>});
const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:['/']})});
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
const { starterMovementRules, executeWorldRules } =
  await import("../../../packages/common/dist/index.js");
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let storageRevision = 1,
    rules = [],
    starterRequests = 0,
    lastSaved,
    lastPreview;
  let runtimeRevision = 1,
    mode = "no-op",
    sessionStatus = "active",
    position = { x: 0.5, y: 0.5, z: 1 },
    proposals = [],
    proposalCount = 0,
    commitCount = 0,
    failApproval = false,
    approvalKeys = [];
  const decisions = new Map(),
    actorId = "internal-actor-7f22cf68-90a6-4adf-95a4-a8fae789c420";
  const collection = () => ({
    worldDefinitionId: "world",
    draftId: "world-draft",
    storageRevision,
    rules,
  });
  const movement = () => ({
    runtimeRevision,
    status: sessionStatus,
    actors: [
      {
        id: actorId,
        name: "Tamsin",
        locationId: "hidden-cavern-id",
        locationName: "Cavern",
        position,
      },
    ],
    capturedRules:
      mode === "no-op" ? [] : [{ name: "Captured movement", revision: 1 }],
    proposals: proposals.map((p) => ({
      ...p,
      canApprove:
        p.status === "pending" && p.expectedRuntimeRevision === runtimeRevision,
    })),
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/worlds/world/draft")
      return route.fulfill({
        json: {
          id: "world-draft",
          storageRevision,
          revisionName: "Draft",
          content: {},
          records: rules.map((rule) => ({
            resourceType: "world-rules",
            id: rule.id,
            payload: rule,
          })),
        },
      });
    if (path.startsWith("/api/worlds/world/rules")) {
      if (request.method() === "GET")
        return route.fulfill({ json: collection() });
      const body = request.postDataJSON();
      if (path.endsWith("/preview")) {
        lastPreview = executeWorldRules({
          rules,
          event: body.event,
          state: body.state,
          entropy: body.entropy,
        });
        return route.fulfill({ json: lastPreview });
      }
      if (
        body.expectedDraftId !== "world-draft" ||
        body.expectedStorageRevision !== storageRevision
      )
        throw new Error(
          "World mutation omitted current draft identity/revision",
        );
      if (path.endsWith("/starter-movement")) {
        starterRequests++;
        rules = starterMovementRules({
          budgetFeet: body.budgetFeet,
          ids: ["r1", "r2", "r3", "r4", "r5", "r6"],
          createdBy: "gm-hidden",
          updatedAt: new Date().toISOString(),
        });
      } else if (path.endsWith("/duplicate")) {
        const source = rules.find((r) => path.includes("/" + r.id + "/"));
        rules = [
          ...rules,
          {
            ...source,
            id: "duplicated-rule",
            name: source.name + " copy",
            revision: 1,
          },
        ];
      } else if (request.method() === "PUT") {
        lastSaved = body.rule;
        rules = rules.map((r) =>
          r.id === body.rule.id
            ? { ...body.rule, revision: r.revision + 1 }
            : r,
        );
      } else rules = [...rules, { ...body.rule, id: "created-rule" }];
      storageRevision++;
      return route.fulfill({ json: collection() });
    }
    if (path.endsWith("/movement") && request.method() === "GET")
      return route.fulfill({ json: movement() });
    if (path.endsWith("/movement")) {
      const body = request.postDataJSON();
      if (
        body.actorId !== actorId ||
        body.expectedRuntimeRevision !== runtimeRevision ||
        !body.idempotencyKey
      )
        throw new Error("Movement submission context incorrect");
      const p = {
        id: "proposal-" + ++proposalCount,
        actorId,
        status: mode,
        actorName: "Tamsin",
        locationName: "Cavern",
        origin: { ...position },
        destination: body.destination,
        expectedRuntimeRevision: runtimeRevision,
        canApprove: mode === "pending",
        explanation:
          mode === "no-op"
            ? "No applicable rules produced effects."
            : mode === "failed"
              ? "The chain failed atomically."
              : "Captured rules permit this movement.",
        effects:
          mode === "pending"
            ? [
                "Tamsin moves to the proposed destination.",
                "Movement allowance decreases by five feet.",
              ]
            : [],
        trace: [
          "Movement declared by the GM.",
          "Captured movement rule conditions evaluated.",
        ],
        createdAt: new Date().toISOString(),
      };
      proposals.unshift(p);
      return route.fulfill({ json: p });
    }
    const match = path.match(/\/movement\/(proposal-\d+)\/(approve|reject)$/);
    if (match) {
      const body = request.postDataJSON(),
        p = proposals.find((p) => p.id === match[1]);
      if (match[2] === "approve") approvalKeys.push(body.idempotencyKey);
      if (decisions.has(body.idempotencyKey))
        return route.fulfill({ json: decisions.get(body.idempotencyKey) });
      if (p.expectedRuntimeRevision !== runtimeRevision)
        return route.fulfill({
          status: 409,
          json: { message: "The runtime changed. Rebuild the preview." },
        });
      if (match[2] === "approve") {
        position = { ...p.destination };
        runtimeRevision++;
        commitCount++;
        p.status = "approved";
      } else p.status = "rejected";
      p.canApprove = false;
      p.decidedAt = new Date().toISOString();
      decisions.set(body.idempotencyKey, { ...p });
      if (failApproval && match[2] === "approve") {
        failApproval = false;
        return route.abort("failed");
      }
      return route.fulfill({ json: p });
    }
    return route.fulfill({
      status: 404,
      json: { message: "Unexpected fixture endpoint" },
    });
  });
  try {
    await page.goto(url);
    await page.getByRole("heading", { name: "Rules", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Add starter movement rules", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Measure movement cost", exact: true })
      .waitFor();
    if (starterRequests !== 1 || rules.length !== 6)
      throw new Error("Explicit starter creation failed");
    await page.getByRole("button", { name: "Test rules", exact: true }).click();
    await page.getByText(/effective changes in this simulation/).waitFor();
    if (
      lastPreview.status !== "applied" ||
      lastPreview.state.runtime["example-actor"].fields[
        "aow:movementRemaining"
      ] !== 10
    )
      throw new Error(
        "Saved draft test did not apply the authored twenty-foot cost",
      );
    await page
      .getByRole("button", {
        name: "Edit Move within allowance on supported unobstructed terrain",
        exact: true,
      })
      .click();
    const editor = page.getByRole("region", { name: "Structured rule editor" });
    await editor
      .getByRole("textbox", { name: /^Rule name/ })
      .fill("Reviewed movement");
    await editor
      .getByRole("combobox", { name: "Condition", exact: true })
      .first()
      .selectOption("always");
    await editor
      .getByRole("button", { name: "Move up", exact: true })
      .nth(1)
      .click();
    await editor
      .getByRole("button", { name: "Save rule", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Reviewed movement", exact: true })
      .waitFor();
    if (
      lastSaved.condition.kind !== "always" ||
      lastSaved.effects[0].kind !== "increment" ||
      lastSaved.effects[1].kind !== "move"
    )
      throw new Error("Structured conditions/effect order were not preserved");
    const card = page
      .locator("li")
      .filter({
        has: page.getByRole("button", {
          name: "Edit Reviewed movement",
          exact: true,
        }),
      });
    await card.getByRole("button", { name: "Duplicate", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit Reviewed movement copy", exact: true })
      .waitFor();
    await card.getByRole("button", { name: "Disable", exact: true }).click();
    await card.getByRole("button", { name: "Enable", exact: true }).waitFor();
    await card.getByRole("button", { name: "Archive", exact: true }).click();
    if (
      rules.find((r) => r.name === "Reviewed movement").lifecycle !== "archived"
    )
      throw new Error("Rule archival failed");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.goto(url + "?movement=1");
    await page
      .getByRole("heading", { name: "Movement & rule decisions", exact: true })
      .waitFor();
    const x = page.getByRole("spinbutton", {
      name: "Destination X",
      exact: true,
    });
    await x.fill("1.5");
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    await page
      .getByText("No applicable rules produced effects.", { exact: true })
      .waitFor();
    if (
      commitCount ||
      position.x !== 0.5 ||
      (await page
        .getByRole("button", { name: "Approve movement", exact: true })
        .count())
    )
      throw new Error("No-rule preview exposed movement");
    mode = "failed";
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    await page
      .getByText("The chain failed atomically.", { exact: true })
      .waitFor();
    if (commitCount || position.x !== 0.5)
      throw new Error("Failed preview changed runtime");
    mode = "pending";
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reject proposal", exact: true })
      .click();
    if (commitCount || position.x !== 0.5)
      throw new Error("Reject changed position");
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    failApproval = true;
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .click();
    await page
      .getByText(
        "The decision could not be confirmed. Retry uses the same decision.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .click();
    await page
      .getByText("The approved rule effects were committed.", { exact: true })
      .waitFor();
    if (
      commitCount !== 1 ||
      position.x !== 1.5 ||
      approvalKeys[0] !== approvalKeys[1]
    )
      throw new Error("Approval retry was not exactly once");
    await x.fill("2.5");
    await page
      .getByRole("button", { name: "Preview movement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .waitFor();
    runtimeRevision++;
    await page
      .getByRole("button", { name: "Approve movement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rebuild preview", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Rebuild preview", exact: true })
      .click();
    if (
      proposals[0].expectedRuntimeRevision !== runtimeRevision ||
      proposals[0].destination.x !== 2.5
    )
      throw new Error(
        "Stale preview rebuild lost destination or current revision",
      );
    sessionStatus = "paused";
    await page
      .getByRole("button", { name: "Refresh movement", exact: true })
      .click();
    await page
      .getByText("Resume the Session to propose or decide movement.", {
        exact: true,
      })
      .waitFor();
    if (
      !(await page
        .getByRole("button", { name: "Preview movement", exact: true })
        .isDisabled()) ||
      !(await page
        .getByRole("button", { name: "Approve movement", exact: true })
        .isDisabled())
    )
      throw new Error("Paused Session exposed mutation controls");
    const text = await page.locator("body").innerText();
    if (
      text.includes(actorId) ||
      text.includes("hidden-cavern-id") ||
      text.includes("gm-hidden")
    )
      throw new Error("Internal identifier displayed");
    await page.screenshot({
      path: "/tmp/aow-session-movement.png",
      fullPage: true,
    });
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      "Rules/movement smoke passed: explicit draft starter, structured conditions and reordered effects, duplicate/disable/archive, real-engine saved draft test, no-op/failed/rejected previews, exactly-once approval retry, stale rebuild, paused controls and human labels.",
    );
  } catch (error) {
    console.error(await page.locator("body").innerText());
    console.error(errors);
    throw error;
  } finally {
    await browser.close();
  }
});
