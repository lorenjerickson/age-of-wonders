import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appDirectory = resolve(import.meta.dirname, "..");
const chromeExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sessionCookie = "aow_session=ssr-migration";

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function authenticated(request) {
  return request.headers.cookie?.includes(sessionCookie) ?? false;
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

async function reservePort() {
  const server = createServer();
  const port = await listen(server);
  server.close();
  await once(server, "close");
  return port;
}

function list(items) {
  return { items, total: items.length, limit: 200, offset: 0 };
}

function createApiStub(expectedOrigin) {
  const world = {
    id: "world-1",
    name: "Evershade",
    description: "A realm of long shadows.",
    status: "active",
    metadataRevision: 1,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://api.local");
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok", database: "stubbed" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/auth/bootstrap") {
      sendJson(response, 200, { setupRequired: false });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/session") {
      assert.equal(request.headers.origin, expectedOrigin);
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      assert.equal(body.token, "development-gm-session-change-me");
      sendJson(
        response,
        201,
        {
          user: {
            displayName: "Migration GM",
            role: "gm",
            systemAdministrator: false,
          },
        },
        { "set-cookie": `${sessionCookie}; HttpOnly; SameSite=Strict; Path=/` },
      );
      return;
    }
    if (!authenticated(request)) {
      sendJson(response, 401, { message: "Authentication is required." });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      sendJson(response, 200, {
        user: {
          displayName: "Migration GM",
          role: "gm",
          systemAdministrator: false,
        },
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/worlds") {
      sendJson(response, 200, list([world]));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/campaigns") {
      sendJson(response, 200, list([]));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/me/campaign-instances"
    ) {
      sendJson(response, 200, list([]));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/me/resumable-session"
    ) {
      sendJson(response, 200, { session: null });
      return;
    }
    sendJson(response, 404, { message: "Stub endpoint was not found." });
  });
}

function startApp(appPort, apiPort) {
  const output = [];
  const child = spawn("node", [".output/server/index.mjs"], {
    cwd: appDirectory,
    env: {
      ...process.env,
      API_INTERNAL_URL: `http://127.0.0.1:${apiPort}/api`,
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(appPort),
      PUBLIC_WEB_ORIGIN: `http://127.0.0.1:${appPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  return { child, output };
}

async function waitForOk(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production process may still be starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out waiting for the production web server.");
}

async function stopApp(child) {
  child.kill("SIGTERM");
  const [code, signal] = await Promise.race([
    once(child, "exit"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Web server did not stop.")), 7_000),
    ),
  ]);
  assert.equal(signal, null);
  assert.equal(code, 0);
}

async function run() {
  const appPort = await reservePort();
  const origin = `http://127.0.0.1:${appPort}`;
  const api = createApiStub(origin);
  const apiPort = await listen(api);
  const app = startApp(appPort, apiPort);
  let browser;
  try {
    await waitForOk(`${origin}/healthz`);
    for (const path of [
      "login/index.html",
      "join/index.html",
      "join/instance/index.html",
      "join/session/index.html",
    ]) {
      const html = await readFile(
        resolve(appDirectory, ".output/public", path),
        "utf8",
      );
      assert.match(html, /Age of Wonders/);
    }

    const anonymous = await fetch(`${origin}/`, { redirect: "manual" });
    assert.ok([302, 307].includes(anonymous.status));
    assert.match(anonymous.headers.get("location") ?? "", /^\/login/);
    assert.doesNotMatch(await anonymous.text(), /Evershade/);

    const login = await fetch(`${origin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ token: "development-gm-session-change-me" }),
    });
    assert.equal(login.status, 201);
    assert.equal(login.headers.get("x-aow-proxy"), "tanstack-start");
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.equal(cookie, sessionCookie);

    const home = await fetch(`${origin}/`, { headers: { cookie } });
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("cache-control"), "private, no-store");
    assert.match(await home.text(), /Evershade/);

    const missing = await fetch(`${origin}/not-a-real-route`, {
      headers: { cookie },
    });
    assert.equal(missing.status, 404);

    const canvasHtml = await fetch(`${origin}/session-canvas-lab`, {
      headers: { cookie },
    }).then((response) => response.text());
    assert.doesNotMatch(canvasHtml, /session-canvas-client-island/);

    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    const failedResponses = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.url()} ${request.failure()?.errorText ?? "failed"}`,
      );
    });
    await page.goto(`${origin}/login`);
    await page
      .getByLabel("Administrator access token")
      .fill("development-gm-session-change-me");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page
      .getByText("1 World Definition available.", { exact: true })
      .waitFor();
    await page.evaluate(() => {
      window.__aowNavigationMarker = "preserved";
    });
    await page.getByRole("link", { name: "Campaigns" }).click();
    await page.getByRole("heading", { name: "Campaigns" }).waitFor();
    assert.equal(
      await page.evaluate(() => window.__aowNavigationMarker),
      "preserved",
    );
    await page.goto(`${origin}/session-canvas-lab`);
    await page.getByTestId("session-canvas-client-island").waitFor();
    if (consoleErrors.length) {
      throw new Error(
        `Browser console errors:\n${consoleErrors.join("\n")}\nFailed responses:\n${failedResponses.join("\n")}\nFailed requests:\n${failedRequests.join("\n")}\nServer output:\n${app.output.join("")}`,
      );
    }
    await browser.close();
    browser = undefined;

    await stopApp(app.child);
    assert.match(app.output.join(""), /"event":"request.complete"/);
    console.log(
      JSON.stringify(
        {
          status: "pass",
          checks: [
            "four prerendered public routes",
            "pre-render authentication redirect",
            "same-origin login and cookie relay",
            "protected SSR read models",
            "canonical route-level 404",
            "typed client navigation without reload",
            "client-only session canvas",
            "private cache policy and structured logs",
            "hydration without console errors",
            "graceful shutdown",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (app.child.exitCode === null) app.child.kill("SIGKILL");
    api.close();
    if (api.listening) await once(api, "close");
  }
}

await run();
