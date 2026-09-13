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
  join(tmpdir(), "aow-session-shell.png");
async function withFixture(run) {
  const name = `session-shell-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.SESSION_TEST_PORT || 5181);
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
const router=createRouter({routeTree:root.addChildren([management,run]),history:createMemoryHistory({initialEntries:[new URLSearchParams(location.search).has('run')?'/campaigns/instances/instance/run/session':'/campaigns/instances/instance/sessions/session']})});
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
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let status = "lobby",
    revision = 1,
    gmPresent = false,
    playerPresent = false;
  let heartbeatCount = 0,
    readCount = 0,
    staleNext = false,
    staleCount = 0;
  let summary = "The party reached the cavern.";
  let failReads = false,
    failAfterCommand = "",
    holdNextRead = false,
    delayedRead;
  const detail = () => ({
    id: "session",
    name: "Into the cavern",
    campaignInstanceId: "instance",
    campaignInstanceName: "Friday campaign",
    status,
    metadataRevision: revision,
    summaryStatus: "draft",
    participants: [
      {
        participationId: "gm-internal",
        name: "Morgan",
        role: "gm",
        response: "accepted",
        required: true,
        present: gmPresent,
        readinessDetail: gmPresent ? "Ready" : "Join the lobby",
      },
      {
        participationId: "player-internal",
        name: "River",
        role: "player",
        response: "accepted",
        required: true,
        present: playerPresent,
        readinessDetail: playerPresent ? "Ready" : "Waiting for River",
      },
    ],
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
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
    if (path.endsWith("/presence/join")) {
      gmPresent = true;
      return route.fulfill({
        json: {
          present: true,
          sessionName: "Into the cavern",
          participantName: "Morgan",
          expiresAt: new Date(Date.now() + 90000).toISOString(),
        },
      });
    }
    if (path.endsWith("/presence/heartbeat")) {
      heartbeatCount++;
      return route.fulfill({
        json: {
          present: true,
          sessionName: "Into the cavern",
          participantName: "Morgan",
        },
      });
    }
    if (path.endsWith("/presence/leave")) {
      gmPresent = false;
      return route.fulfill({ json: { present: false } });
    }
    if (path.endsWith("/readiness"))
      return route.fulfill({
        json: {
          ready: gmPresent && playerPresent,
          runtimeRevision: 1,
          token: `ready-${revision}`,
          checks: [
            {
              key: "participants",
              status: gmPresent && playerPresent ? "ready" : "blocked",
              label: "Participant readiness",
              detail: playerPresent ? "River is present" : "Waiting for River",
            },
          ],
        },
      });
    if (path.endsWith("/events"))
      return route.fulfill({
        json: {
          items: [
            {
              sequence: 1,
              summary: "The Session lobby opened.",
              actorName: "Morgan",
              occurredAt: "2026-09-12T18:00:00Z",
            },
          ],
        },
      });
    if (path.endsWith("/summary")) {
      if (request.method() === "PUT")
        summary = request.postDataJSON().narrative;
      return route.fulfill({
        json: {
          narrative: summary,
          privateGmNotes: "A hidden passage remains.",
          status: "draft",
        },
      });
    }
    const command = path.match(
      /\/actions\/(start|resume|pause|conclude|cancel|open-lobby|close-lobby)$/,
    )?.[1];
    if (command) {
      if (staleNext) {
        staleNext = false;
        staleCount++;
        revision++;
        return route.fulfill({
          status: 409,
          json: {
            message: "Session changed. Review the refreshed state and retry.",
          },
        });
      }
      const body = request.postDataJSON();
      if (body.expectedMetadataRevision !== revision)
        return route.fulfill({
          status: 409,
          json: { message: "The readiness revision is stale." },
        });
      status = {
        start: "active",
        resume: "active",
        pause: "paused",
        conclude: "concluded",
        cancel: "cancelled",
        "open-lobby": "lobby",
        "close-lobby": "planned",
      }[command];
      revision++;
      if (command === failAfterCommand) {
        failReads = true;
        failAfterCommand = "";
      }
      return route.fulfill({ json: detail() });
    }
    if (path.endsWith("/sessions/session")) {
      readCount++;
      if (holdNextRead) {
        holdNextRead = false;
        delayedRead = route;
        return;
      }
      if (failReads)
        return route.fulfill({
          status: 503,
          json: { message: "Session refresh temporarily unavailable." },
        });
      return route.fulfill({ json: detail() });
    }
    return route.fulfill({
      status: 404,
      json: { message: `Unexpected fixture request ${path}` },
    });
  });
  const advance = async (milliseconds) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 15000) {
      await page.clock.runFor(Math.min(15000, milliseconds - elapsed));
      // Let mocked network requests settle before advancing the next interval.
      await page.waitForTimeout(100);
    }
  };
  const routeIs = async (fragment) =>
    page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-testid="route"]')
          ?.textContent?.includes(expected),
      fragment,
    );
  try {
    await page.clock.install();
    await page.goto(url);
    await page.getByRole("heading", { name: "Into the cavern" }).waitFor();
    await page.getByRole("button", { name: "Join lobby", exact: true }).click();
    playerPresent = true;
    await advance(16000);
    await page.getByText("River is present", { exact: true }).waitFor();
    if (
      await page
        .getByRole("button", { name: "Start Session", exact: true })
        .isDisabled()
    )
      throw new Error("Polling did not enable Start after River joined");
    await advance(95000);
    if (heartbeatCount < 2)
      throw new Error(
        `Expected maintained GM presence beyond 90 seconds; got ${heartbeatCount} heartbeats`,
      );
    const beforeConflictReads = readCount;
    staleNext = true;
    await page
      .getByRole("button", { name: "Start Session", exact: true })
      .click();
    await page
      .getByText("Session changed. Review the refreshed state and retry.", {
        exact: true,
      })
      .waitFor();
    await page.waitForFunction(() => true);
    if (staleCount !== 1 || readCount <= beforeConflictReads)
      throw new Error("Conflict did not refresh authoritative state");
    await page
      .getByRole("button", { name: "Start Session", exact: true })
      .click();
    await routeIs("/run/session");
    await page
      .getByRole("heading", { name: "Participants", exact: true })
      .waitFor();
    if (
      await page
        .getByRole("heading", { name: "Readiness", exact: true })
        .count()
    )
      throw new Error("Active Run still renders planning readiness");
    const refreshButton = page.getByRole("button", {
      name: "Refresh Session",
      exact: true,
    });
    const refreshWarning = page.getByText(
      "Session updates are unavailable. Refresh before making another change.",
      { exact: true },
    );
    // An obsolete GET failure must not overwrite a newer successful refresh.
    holdNextRead = true;
    await Promise.all([
      page.waitForRequest((request) =>
        new URL(request.url()).pathname.endsWith("/sessions/session"),
      ),
      refreshButton.click(),
    ]);
    await page.waitForTimeout(100);
    if (!delayedRead)
      throw new Error("The delayed read fixture was not captured");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/sessions/session") &&
          response.status() === 200,
      ),
      refreshButton.click(),
    ]);
    await delayedRead.fulfill({
      status: 503,
      json: { message: "Obsolete request failed." },
    });
    delayedRead = undefined;
    await page.waitForTimeout(100);
    if (
      (await refreshWarning.count()) ||
      (await page
        .getByRole("button", { name: "Pause Session", exact: true })
        .isDisabled())
    )
      throw new Error("An older failed GET disabled newer successful state");
    // A committed write with a failed follow-up GET must disable stale controls.
    failAfterCommand = "pause";
    await page
      .getByRole("button", { name: "Pause Session", exact: true })
      .click();
    await refreshWarning.waitFor();
    if (
      status !== "paused" ||
      !(await page
        .getByRole("button", { name: "Pause Session", exact: true })
        .isDisabled())
    )
      throw new Error(
        "Successful pause with failed refresh did not protect stale controls",
      );
    failReads = false;
    await refreshButton.click();
    await page
      .getByRole("button", { name: "Resume Session", exact: true })
      .waitFor();
    failAfterCommand = "resume";
    await page
      .getByRole("button", { name: "Resume Session", exact: true })
      .click();
    await refreshWarning.waitFor();
    if (
      status !== "active" ||
      !(await page
        .getByRole("button", { name: "Resume Session", exact: true })
        .isDisabled())
    )
      throw new Error(
        "Successful resume with failed refresh did not protect stale controls",
      );
    failReads = false;
    await refreshButton.click();
    await page
      .getByRole("button", { name: "Pause Session", exact: true })
      .waitFor();
    if (await refreshWarning.count())
      throw new Error("Explicit refresh did not clear the warning");
    await page.screenshot({ path: "/tmp/aow-session-run.png", fullPage: true });
    await page
      .getByRole("button", { name: "Conclude Session", exact: true })
      .click();
    await routeIs("/sessions/session");
    const narrative = page.getByRole("textbox", { name: /^Narrative summary/ });
    await narrative.fill("Unsaved GM recap edits.");
    summary = "A different server summary.";
    await advance(16000);
    if ((await narrative.inputValue()) !== "Unsaved GM recap edits.")
      throw new Error("Live refresh overwrote an unsaved summary");
    revision++;
    await advance(16000);
    await page
      .getByRole("button", { name: "Load saved summary", exact: true })
      .waitFor();
    if ((await narrative.inputValue()) !== "Unsaved GM recap edits.")
      throw new Error("A newer summary revision overwrote local text");
    if (
      !(await page
        .getByRole("button", { name: "Approve summary", exact: true })
        .isDisabled())
    )
      throw new Error("A conflicting summary revision remained writable");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    // Fresh terminal deep link must land in recap without reopening operational controls.
    await page.goto(`${url}?run=1`);
    await routeIs("/sessions/session");
    await page
      .getByRole("heading", { name: "Session summary", exact: true })
      .waitFor();
    if (
      await page
        .getByRole("button", { name: "Conclude Session", exact: true })
        .count()
    )
      throw new Error("Terminal Session exposed live lifecycle controls");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      `Session shell smoke passed: live readiness, ${heartbeatCount} heartbeats, conflict refresh, stale response ordering, pause/resume refresh recovery, Run/recap transitions, dirty summary and revision conflict protection, terminal redirect. Screenshot: ${screenshotPath}`,
    );
  } catch (error) {
    console.error(await page.locator("body").innerText());
    console.error(errors);
    throw error;
  } finally {
    await browser.close();
  }
});
