import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { chromium } = require("playwright-core");
const base = "http://127.0.0.1:5198",
  api = "http://127.0.0.1:3109/api";
const { cookie } = JSON.parse(
  await readFile(
    process.env.MAPFIX_AUTH_FILE || "/tmp/aow-mapfix-auth.json",
    "utf8",
  ),
);
const env = JSON.parse(
  await readFile(
    process.env.MAPFIX_ENV_FILE || "/tmp/aow-mapfix-env.json",
    "utf8",
  ),
);
assert.equal(
  new URL(env.DATABASE_URL).pathname,
  "/aow_mapfix_disposable_20261014",
  "Use only the isolated MAPFIX database",
);
async function request(path, method = "GET", data, auth = cookie) {
  const r = await fetch(api + path, {
    method,
    headers: {
      ...(auth ? { cookie: auth } : {}),
      "content-type": "application/json",
      origin: base,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}
async function ok(path, method = "GET", data, status = 200) {
  const r = await request(path, method, data);
  assert.equal(
    r.status,
    status,
    `${method} ${path}: ${JSON.stringify(r.body)}`,
  );
  return r.body;
}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addCookies([
  {
    name: "aow_session",
    value: cookie.slice(cookie.indexOf("=") + 1),
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("requestfailed", (r) =>
  console.error("REQUEST FAILED", r.url(), r.failure()?.errorText),
);
page.on("response", (r) => {
  if (r.status() >= 400) console.error("HTTP", r.status(), r.url());
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const receipt = [];
let worldId;
async function goto(suffix) {
  await page.goto(`${base}/worlds/${worldId}${suffix}`);
  await page.waitForLoadState("networkidle");
}
async function saveClick(label, method = "PUT") {
  const pending = page.waitForResponse(
    (r) =>
      r.request().method() === method &&
      new URL(r.url()).pathname.startsWith(`/api/worlds/${worldId}/`) &&
      !new URL(r.url()).pathname.endsWith("/media"),
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const response = await pending;
  assert.ok([200, 201].includes(response.status()), await response.text());
  await page.waitForLoadState("networkidle");
}
try {
  await page.goto(base + "/worlds/new");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("textbox", { name: /^World name/ })
    .fill("MAPFIX Harbor World");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Disposable map replacement reproduction");
  await page
    .getByRole("button", { name: "Create working draft", exact: true })
    .click();
  await page.waitForURL(
    (u) => /^\/worlds\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"),
  );
  worldId = new URL(page.url()).pathname.split("/")[2];
  const sharp = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  )("sharp");
  const red = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#b04040" },
  })
    .webp()
    .toBuffer();
  const blue = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#4050b0" },
  })
    .webp()
    .toBuffer();
  await goto("/atlas/locations/new");
  await page
    .getByLabel("Location name", { exact: true })
    .fill("Replacement Harbor");
  await page.getByLabel("Choose a map source").selectOption("upload");
  await page
    .getByLabel("Upload map image")
    .setInputFiles({ name: "map.webp", mimeType: "image/webp", buffer: red });
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector("fieldset")?.disabled,
  );
  await saveClick("Save location", "POST");
  let draft = await ok(`/worlds/${worldId}/draft`);
  let location = draft.records.find(
    (r) => r.payload.name === "Replacement Harbor",
  );
  assert.ok(location);
  const locationId = location.sourceId;
  const oldId = location.payload.image.assetId;
  await writeFile(
    "/tmp/aow-MAPFIX-target.json",
    JSON.stringify({ worldId, locationId, oldId }),
  );
  await goto(`?view=atlas&entry=${locationId}&edit=1`);
  await page.getByLabel("Choose a map source").selectOption("upload");
  await page
    .getByLabel("Upload map image")
    .setInputFiles({ name: "map.webp", mimeType: "image/webp", buffer: blue });
  await page.waitForFunction(
    () => !document.querySelector("fieldset")?.disabled,
  );
  await page.screenshot({
    path: "/tmp/aow-MAPFIX-selected.png",
    fullPage: true,
  });
  await saveClick("Save location");
  draft = await ok(`/worlds/${worldId}/draft`);
  location = draft.records.find((r) => r.sourceId === locationId);
  assert.notEqual(location.payload.image.assetId, oldId);
  assert.equal(location.payload.image.width, 1536);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "/tmp/aow-MAPFIX-reloaded.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await goto(`/atlas/locations/${locationId}/map`);
  const disclosure = page.getByText("Map tools", { exact: true });
  if (await disclosure.count()) await disclosure.click();
  await page
    .getByLabel("Upload image", { exact: true })
    .setInputFiles({ name: "map.webp", mimeType: "image/webp", buffer: blue });
  await page.getByRole("button", { name: "Save map", exact: true }).waitFor();
  await saveClick("Save map");
  draft = await ok(`/worlds/${worldId}/draft`);
  location = draft.records.find((r) => r.sourceId === locationId);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "/tmp/aow-MAPFIX-standalone-mobile.png",
    fullPage: true,
  });
  const download = await ok(
    `/media/${location.payload.image.assetId}/download`,
  );
  const storedBytes = Buffer.from(
    await (await fetch(download.url)).arrayBuffer(),
  );
  assert.equal(
    createHash("sha256").update(storedBytes).digest("hex"),
    createHash("sha256").update(blue).digest("hex"),
  );
  assert.ok(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.some((image) => image.naturalWidth === 1536),
      ),
  );
  console.log(
    JSON.stringify({
      pass: true,
      worldId,
      locationId,
      image: location.payload.image,
      errors,
    }),
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/aow-MAPFIX-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
