import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const appDirectory = resolve(import.meta.dirname, "..");
const chromeExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sessionCookie = "aow_session=valid";

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

function isAuthenticated(request) {
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

function createApiStub(expectedOrigin) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://stub.local");

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok", database: "stubbed" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/gm-session") {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      if (body.token !== "development-gm-session-change-me") {
        sendJson(response, 401, {
          message: "Bootstrap credentials are invalid.",
        });
        return;
      }
      sendJson(
        response,
        201,
        { user: { displayName: "Spike Game Master", role: "gm" } },
        { "set-cookie": `${sessionCookie}; HttpOnly; SameSite=Strict; Path=/` },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      assert.equal(request.headers.origin, expectedOrigin);
      assert.equal(isAuthenticated(request), true);
      sendJson(
        response,
        201,
        { signedOut: true },
        {
          "set-cookie":
            "aow_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        },
      );
      return;
    }

    if (!isAuthenticated(request)) {
      sendJson(response, 401, { message: "Authentication is required." });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      sendJson(response, 200, {
        user: { displayName: "Spike Game Master", role: "gm" },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/domain/locations/forbidden-location"
    ) {
      sendJson(response, 403, {
        message: "This location is outside the current user's access.",
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/domain/locations/location-1"
    ) {
      sendJson(response, 200, {
        id: "location-1",
        kind: "settlement",
        name: "Clockwork Harbor",
        revision: 3,
        data: {},
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/domain/locations/")
    ) {
      sendJson(response, 404, { message: "Location was not found." });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/media") {
      assert.equal(request.headers.origin, expectedOrigin);
      assert.match(
        request.headers["content-type"] ?? "",
        /^multipart\/form-data/,
      );
      const body = await readBody(request);
      assert.equal(body.includes(Buffer.from("SSR_SPIKE_UPLOAD")), true);
      sendJson(response, 201, {
        originalName: "spike.txt",
        purpose: url.searchParams.get("purpose"),
        size: body.length,
      });
      return;
    }

    sendJson(response, 404, { message: "Stub endpoint was not found." });
  });
}

async function waitForOk(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw lastError ?? new Error("Timed out waiting for the server");
}

function startApp({ appPort, apiPort }) {
  const output = [];
  const process = spawn("node", [".output/server/index.mjs"], {
    cwd: appDirectory,
    env: {
      ...globalThis.process.env,
      API_INTERNAL_URL: `http://127.0.0.1:${apiPort}/api`,
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(appPort),
      PUBLIC_WEB_ORIGIN: `http://127.0.0.1:${appPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.on("data", (chunk) => output.push(chunk.toString()));
  process.stderr.on("data", (chunk) => output.push(chunk.toString()));
  return { process, output };
}

async function stopApp(child) {
  child.kill("SIGTERM");
  const exit = once(child, "exit");
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Server did not stop gracefully")),
      7_000,
    ),
  );
  const [code, signal] = await Promise.race([exit, timeout]);
  assert.equal(signal, null);
  assert.equal(code, 0);
}

async function request(url, init) {
  return fetch(url, { redirect: "manual", ...init });
}

async function run() {
  const appPort = await reservePort();
  const publicOrigin = `http://127.0.0.1:${appPort}`;
  const api = createApiStub(publicOrigin);
  const apiPort = await listen(api);
  let app = startApp({ appPort, apiPort });
  let browser;

  try {
    await waitForOk(`${publicOrigin}/healthz`);

    const staticHtml = await readFile(
      resolve(appDirectory, ".output/public/index.html"),
      "utf8",
    );
    assert.match(staticHtml, /data-testid="prerender-proof"/);

    const root = await request(`${publicOrigin}/`);
    assert.equal(root.status, 200);
    const rootHtml = await root.text();
    assert.match(rootHtml, /Age of Wonders SSR\/SSG spike/);
    assert.ok(root.headers.get("x-request-id"));
    const assetPath = rootHtml.match(
      /href="(\/assets\/styles-[^"]+\.css)"/,
    )?.[1];
    assert.ok(assetPath);
    const asset = await request(`${publicOrigin}${assetPath}`);
    assert.equal(asset.status, 200);

    const protectedWithoutCookie = await request(
      `${publicOrigin}/world/atlas/locations/location-1`,
    );
    assert.ok([302, 307].includes(protectedWithoutCookie.status));
    assert.match(
      protectedWithoutCookie.headers.get("location") ?? "",
      /^\/login/,
    );
    assert.doesNotMatch(
      await protectedWithoutCookie.text(),
      /Clockwork Harbor/,
    );

    const login = await request(`${publicOrigin}/api/auth/gm-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      body: JSON.stringify({ token: "development-gm-session-change-me" }),
    });
    assert.equal(login.status, 201);
    assert.equal(login.headers.get("x-aow-proxy"), "tanstack-start-spike");
    assert.match(login.headers.get("set-cookie") ?? "", /aow_session=valid/);

    const timedLocationRequest = async () => {
      const started = performance.now();
      const response = await request(
        `${publicOrigin}/world/atlas/locations/location-1`,
        {
          headers: { cookie: sessionCookie, "x-request-id": "spike-request" },
        },
      );
      return { response, durationMs: performance.now() - started };
    };
    const cold = await timedLocationRequest();
    assert.equal(cold.response.status, 200);
    assert.equal(cold.response.headers.get("x-request-id"), "spike-request");
    assert.match(await cold.response.text(), /Clockwork Harbor/);
    const warm = await timedLocationRequest();
    assert.equal(warm.response.status, 200);
    assert.match(await warm.response.text(), /Clockwork Harbor/);

    const missing = await request(
      `${publicOrigin}/world/atlas/locations/missing-location`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Location not found/);

    const forbidden = await request(
      `${publicOrigin}/api/domain/locations/forbidden-location`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), {
      message: "This location is outside the current user's access.",
    });

    const runShell = await request(
      `${publicOrigin}/campaigns/instances/campaign-1/run/session-1`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(runShell.status, 200);
    assert.doesNotMatch(await runShell.text(), /data-testid="client-only-run"/);

    const ready = await request(`${publicOrigin}/healthz?ready=1`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ok",
      service: "web-ssr-spike",
      api: "connected",
    });

    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${publicOrigin}/login`);
    await page
      .getByLabel("GM bootstrap token")
      .fill("development-gm-session-change-me");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByTestId("location-name").waitFor();
    assert.equal(
      await page.getByTestId("location-name").textContent(),
      "Clockwork Harbor",
    );

    await page.getByRole("link", { name: "Overview" }).click();
    await page.getByTestId("prerender-proof").waitFor();
    await page
      .getByRole("link", { name: "Open the protected nested location fixture" })
      .click();
    await page.getByTestId("location-name").waitFor();

    await page.getByRole("link", { name: "Run" }).click();
    await page.getByTestId("client-only-run").waitFor();

    await page.getByRole("link", { name: "Operations" }).click();
    await page.getByLabel("Test file").setInputFiles({
      name: "spike.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("SSR_SPIKE_UPLOAD"),
    });
    await page.getByRole("button", { name: "Upload through /api" }).click();
    await page.getByText("Upload succeeded.").waitFor();
    await page.getByRole("button", { name: "Log out through /api" }).click();
    await page.getByRole("heading", { name: "Sign in to the spike" }).waitFor();

    assert.deepEqual(consoleErrors, []);
    await browser.close();
    browser = undefined;

    await stopApp(app.process);
    assert.match(app.output.join(""), /"event":"request.complete"/);

    app = startApp({ appPort, apiPort });
    await waitForOk(`${publicOrigin}/healthz`);
    await stopApp(app.process);

    const publicBytes =
      Number(
        (await import("node:child_process"))
          .execFileSync(
            "du",
            ["-sk", resolve(appDirectory, ".output/public")],
            { encoding: "utf8" },
          )
          .trim()
          .split(/\s+/)[0],
      ) * 1024;
    const serverBytes =
      Number(
        (await import("node:child_process"))
          .execFileSync(
            "du",
            ["-sk", resolve(appDirectory, ".output/server")],
            { encoding: "utf8" },
          )
          .trim()
          .split(/\s+/)[0],
      ) * 1024;

    console.log(
      JSON.stringify(
        {
          status: "pass",
          versions: {
            node: globalThis.process.version,
            tanstackStart: "1.168.49",
            tanstackRouter: "1.170.32",
            nitro: "3.0.260903-beta",
            vite: "8.2.2",
          },
          timings: {
            protectedSsrColdMs: Number(cold.durationMs.toFixed(1)),
            protectedSsrWarmMs: Number(warm.durationMs.toFixed(1)),
          },
          outputBytes: { public: publicBytes, server: serverBytes },
          checks: [
            "prerendered public page",
            "protected SSR and cookie forwarding",
            "401 redirect, 403 preservation, and 404 boundary",
            "typed client navigation",
            "client-only Run route",
            "same-origin login/logout mutation",
            "streaming multipart upload proxy",
            "static assets",
            "liveness and API readiness",
            "request IDs and structured logs",
            "hydration without console errors",
            "graceful shutdown and restart",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (app.process.exitCode === null) app.process.kill("SIGKILL");
    api.close();
    if (api.listening) await once(api, "close");
  }
}

await run();
