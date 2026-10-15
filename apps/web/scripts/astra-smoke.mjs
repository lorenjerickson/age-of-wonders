import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const env = await readFile(new URL("../../../.env", import.meta.url), "utf8");
const value = env
  .match(/^GM_BOOTSTRAP_TOKEN=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^['"]|['"]$/g, "");
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1661, height: 1289 },
});
const page = await context.newPage();
let worldId;
page.setDefaultNavigationTimeout(60000);
page.setDefaultTimeout(20000);
let userName;
const originalGoto = page.goto.bind(page);
page.goto = async (url, options = {}) => {
  const response = await originalGoto(url, { waitUntil: "commit", ...options });
  if (userName)
    await page
      .getByRole("link", { name: userName, exact: true, includeHidden: true })
      .waitFor({ state: "attached" });
  return response;
};
const originalScreenshot = page.screenshot.bind(page);
page.screenshot = async (options) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  return originalScreenshot(options);
};
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log("Console:", m.text());
  }
});
page.on("requestfailed", (r) =>
  console.log("Request failed:", r.url().split("?")[0], r.failure()?.errorText),
);
async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await context.request.fetch(
    `http://localhost:5173/api${path}`,
    { method, data: body },
  );
  if (!response.ok())
    throw new Error(
      `${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "record")} failed ${response.status()}: ${(await response.text()).slice(0, 300)}`,
    );
  return response.status() === 204 ? undefined : response.json();
}
try {
  await page.goto("http://localhost:5173/login");
  await page
    .getByRole("button", { name: "Enter workspace →", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document.querySelector(".astra-login-form button[type=submit]")
        ?.disabled === false,
  );
  await page.screenshot({ path: "/tmp/astra-login-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/astra-login-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1661, height: 1289 });
  await api("/auth/session", {
    token: value || "development-gm-session-change-me",
  });
  userName = (await api("/auth/me")).user.displayName;
  const worlds = await api("/worlds");
  console.log("Authenticated; verifying existing overview");
  if (worlds.items.length) {
    await page.goto(`http://localhost:5173/worlds/${worlds.items[0].id}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.screenshot({ path: "/tmp/astra-overview-desktop.png" });
    assert.equal(await page.locator(".astra-sidebar").count(), 1);
  }
  console.log("Creating disposable World");
  const created = await api("/worlds", {
    name: `Astra UI verification ${Date.now()}`,
    description: "Disposable integration verification world.",
  });
  worldId = created.id;
  const root = `http://localhost:5173/worlds/${worldId}`;
  console.log("Testing effect editor");
  await page.goto(`${root}?view=codex&kind=effects&entry=new`);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Smoke effect");
  await page.getByRole("button", { name: "Add modifier", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Default value", exact: true })
    .fill("-15");
  await page.getByRole("button", { name: "Save effect", exact: true }).click();
  await page
    .getByRole("heading", { name: "Everything belongs somewhere." })
    .waitFor();
  await page.getByRole("heading", { name: "Smoke effect" }).waitFor();
  await page.goto(`${root}?view=codex&kind=conditions&entry=new`);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Smoke condition");
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page
    .getByRole("button", { name: "Save condition", exact: true })
    .click();
  await page.getByRole("heading", { name: "Smoke condition" }).waitFor();
  console.log("Testing creature and NPC editors");
  await page.goto(`${root}?view=codex&kind=creatures&entry=new`);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Smoke creature");
  await page
    .getByRole("button", { name: "Save creature", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Smoke creature", exact: true })
    .waitFor();
  await page.goto(`${root}?view=codex&kind=characters&entry=new`);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Smoke NPC");
  await page
    .getByRole("combobox", { name: "Creature template", exact: true })
    .selectOption({ label: "Smoke creature" });
  await page
    .getByRole("button", { name: "Save character", exact: true })
    .click();
  await page.getByRole("heading", { name: "Smoke NPC", exact: true }).waitFor();
  await page.goto(`${root}?view=atlas&entry=new`);
  await page
    .getByRole("textbox", { name: "Location name", exact: true })
    .fill("Smoke location");
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Smoke location", exact: true })
    .waitFor();
  await page.goto(`${root}?view=atlas`);
  await page.getByRole("heading", { name: "Places with a story." }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".astra-topbar").count(), 1);
  await page.screenshot({ path: "/tmp/astra-atlas-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile horizontal overflow",
  );
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("link", { name: /Codex/ }).click();
  await page
    .getByRole("heading", { name: "Everything belongs somewhere." })
    .waitFor();
  await page.goto(`${root}?view=export`);
  await page.getByRole("heading", { name: "Export world" }).waitFor();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download world ↗", exact: true })
    .click();
  const artifact = await download;
  const exported = JSON.parse(await readFile(await artifact.path(), "utf8"));
  assert.ok(
    JSON.stringify(exported).includes("Smoke NPC"),
    "export contains NPC",
  );
  await page.setViewportSize({ width: 1661, height: 1289 });
  await page.goto(`${root}?view=codex&kind=characters`);
  await page.getByRole("heading", { name: "Smoke NPC", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Updated NPC");
  await page
    .getByRole("button", { name: "Save character", exact: true })
    .click();
  await page.getByRole("heading", { name: "Updated NPC", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete this entry", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Everything belongs somewhere." })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Updated NPC", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile render; effects, conditions, creatures, NPCs and locations created; NPC updated/deleted; mobile navigation; full export downloaded.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/astra-smoke-failure.png" });
  console.error(error);
  console.error("Browser errors:", errors);
  console.log(
    await page.evaluate(() => ({
      state: document.readyState,
      scripts: [...document.scripts].map((s) => ({ src: s.src, type: s.type })),
      requests: performance
        .getEntriesByType("resource")
        .filter((r) => r.duration > 1000)
        .map((r) => ({ name: r.name, duration: r.duration })),
    })),
  );
  process.exitCode = 1;
} finally {
  if (worldId) {
    const world = await api(`/worlds/${worldId}`);
    await api(`/worlds/${worldId}/archive`, {
      expectedMetadataRevision: world.metadataRevision ?? 1,
    }).catch(() => {});
  }
  await browser.close();
}
