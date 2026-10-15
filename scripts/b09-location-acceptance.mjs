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
const { worldId, locationId } = JSON.parse(
  await readFile("/tmp/aow-MAPFIX-target.json", "utf8"),
);
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
const wav = Buffer.alloc(46);
wav.write("RIFF");
wav.writeUInt32LE(38, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(2, 40);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="gray"/></svg>',
);
try {
  const original = (await ok(`/worlds/${worldId}/draft`)).records.find(
    (r) => r.sourceId === locationId,
  ).payload;
  await goto(`?view=atlas&entry=${locationId}&edit=1`);
  await page
    .getByText("Weather and audiovisual effects", { exact: true })
    .click();
  await page.getByRole("button", { name: "Add weather", exact: true }).click();
  await page.getByLabel("Weather condition", { exact: true }).fill("Cold rain");
  await page.getByLabel("Temperature (°C)", { exact: true }).fill("4.5");
  await page.getByRole("button", { name: "Add wind", exact: true }).click();
  await page.getByLabel("Wind speed (km/h)", { exact: true }).fill("18");
  await page
    .getByLabel("Wind direction (degrees)", { exact: true })
    .fill("270");
  await page
    .getByRole("button", { name: "Add audio effect", exact: true })
    .click();
  let audio = page.getByRole("region", {
    name: "Presentation effect 1",
    exact: true,
  });
  await audio.getByLabel("Effect name", { exact: true }).fill("Rainfall");
  await audio
    .getByLabel("Upload effect media")
    .setInputFiles({ name: "rain.wav", mimeType: "audio/wav", buffer: wav });
  await page.waitForFunction(
    () => !document.querySelector("fieldset:disabled"),
  );
  await audio.getByLabel("Volume (0–1)").fill("0.35");
  await audio.getByLabel("Loop", { exact: true }).check();
  await page
    .getByRole("button", { name: "Add visual effect", exact: true })
    .click();
  let visual = page.getByRole("region", {
    name: "Presentation effect 2",
    exact: true,
  });
  await visual.getByLabel("Effect name", { exact: true }).fill("Mist");
  await visual
    .getByLabel("Upload effect media")
    .setInputFiles({
      name: "mist.svg",
      mimeType: "image/svg+xml",
      buffer: svg,
    });
  await page.waitForFunction(
    () => !document.querySelector("fieldset:disabled"),
  );
  await visual.getByLabel("Opacity (0–1)").fill("0.6");
  await page.screenshot({
    path: "/tmp/aow-B09-editor-desktop.png",
    fullPage: true,
  });
  await saveClick("Save location");
  let payload = (await ok(`/worlds/${worldId}/draft`)).records.find(
    (r) => r.sourceId === locationId,
  ).payload;
  assert.deepEqual(payload.weather, {
    condition: "Cold rain",
    temperatureCelsius: 4.5,
    wind: { speedKph: 18, directionDegrees: 270 },
  });
  assert.equal(payload.audiovisualEffects.length, 2);
  assert.equal(payload.audiovisualEffects[0].volume, 0.35);
  assert.equal(payload.audiovisualEffects[0].loop, true);
  assert.equal(payload.audiovisualEffects[1].opacity, 0.6);
  assert.deepEqual(payload.image, original.image);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "/tmp/aow-B09-detail-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await goto(`/atlas/locations/${locationId}/map`);
  const disclosure = page.getByText("Map tools", { exact: true });
  if (await disclosure.count()) await disclosure.click();
  assert.equal(
    await page.getByLabel("Weather condition", { exact: true }).inputValue(),
    "Cold rain",
  );
  await page.getByLabel("Weather condition", { exact: true }).fill("Clearing");
  await saveClick("Save map");
  await page.reload();
  await page.waitForLoadState("networkidle");
  payload = (await ok(`/worlds/${worldId}/draft`)).records.find(
    (r) => r.sourceId === locationId,
  ).payload;
  assert.equal(payload.weather.condition, "Clearing");
  assert.equal(payload.audiovisualEffects.length, 2);
  await page.screenshot({
    path: "/tmp/aow-B09-map-mobile.png",
    fullPage: true,
  });
  await goto(`?view=atlas&entry=${locationId}&edit=1`);
  await page
    .getByRole("button", { name: "Remove weather", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear effects configuration", exact: true })
    .click();
  await saveClick("Save location");
  payload = (await ok(`/worlds/${worldId}/draft`)).records.find(
    (r) => r.sourceId === locationId,
  ).payload;
  assert.equal(payload.weather, undefined);
  assert.equal(payload.audiovisualEffects, undefined);
  assert.deepEqual(payload.image, original.image);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      checks: [
        "desktop weather/audio/visual upload and persistence",
        "mobile Map edit and reload",
        "explicit removal",
        "original map unchanged",
      ],
      errors,
    }),
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/aow-B09-failure.png", fullPage: true });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
