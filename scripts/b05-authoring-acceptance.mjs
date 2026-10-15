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
  await readFile(process.env.B05_AUTH_FILE || "/tmp/aow-b05-auth.json", "utf8"),
);
const env = JSON.parse(
  await readFile(process.env.B05_ENV_FILE || "/tmp/aow-b05-env.json", "utf8"),
);
assert.equal(
  new URL(env.DATABASE_URL).pathname,
  "/aow_b05_disposable_20261014",
  "Use only the isolated B05 database",
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
    .fill("B05 Acceptance " + Date.now());
  await page
    .getByLabel("Description", { exact: true })
    .fill("Disposable acceptance only");
  await page
    .getByRole("button", { name: "Create working draft", exact: true })
    .click();
  await page.waitForURL(
    (u) => /^\/worlds\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"),
  );
  worldId = new URL(page.url()).pathname.split("/")[2];
  let draft = await ok(`/worlds/${worldId}/draft`);
  receipt.push({ check: "authenticated-world-create", pass: true });
  await goto("/item-compendium/items/new");
  await page.getByRole("textbox", { name: /^Name/ }).fill("Acceptance Lantern");
  await page.getByLabel("Item family").selectOption({ label: "Tool" });
  await page.getByLabel("Category").fill("Utility");
  await page.getByRole("button", { name: "Open Artwork", exact: true }).click();
  const png = await require("sharp")({
    create: { width: 64, height: 64, channels: 3, background: "#808080" },
  })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").setInputFiles({
    name: "b05-fixture.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page
    .getByRole("textbox", { name: /^Image description/ })
    .fill("A square gray test image");
  await saveClick("Create in working draft", "POST");
  draft = await ok(`/worlds/${worldId}/draft`);
  const item = draft.records.find(
    (r) =>
      r.resourceType === "definitions" &&
      r.payload.identity?.name === "Acceptance Lantern",
  );
  assert.ok(item);
  const itemId = item.sourceId;
  receipt.push({
    check: "item-ui-create-image-upload-database-readback",
    pass: true,
  });
  await goto(`/item-compendium/items/${itemId}`);
  await page
    .getByRole("textbox", { name: /^Name/ })
    .fill("Acceptance Lantern revised");
  await saveClick("Save changes");
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.getByRole("textbox", { name: /^Name/ }).inputValue(),
    "Acceptance Lantern revised",
  );
  await page.screenshot({
    path: "/tmp/aow-B05-acceptance-item-1440.png",
    fullPage: true,
  });
  receipt.push({ check: "item-save-hard-reload", pass: true });
  await goto("/atlas/locations/new");
  await page
    .getByLabel("Location name", { exact: true })
    .fill("Acceptance Harbor");
  await page
    .getByLabel("GM-only description", { exact: true })
    .fill("B05 private harbor secret");
  await page.getByLabel("Choose a map source").selectOption("upload");
  await page
    .getByLabel("Upload map image")
    .setInputFiles({ name: "b05-map.png", mimeType: "image/png", buffer: png });
  await saveClick("Save location", "POST");
  draft = await ok(`/worlds/${worldId}/draft`);
  const location = draft.records.find(
    (r) =>
      r.resourceType === "locations" && r.payload.name === "Acceptance Harbor",
  );
  assert.ok(location);
  const locationId = location.sourceId;
  await goto(`/atlas/locations/${locationId}/discoveries/new`);
  await page
    .getByLabel("Statement", { exact: true })
    .fill("The hidden gate opens at dusk");
  await page.getByLabel("Source or provenance").fill("Harbor keeper");
  await saveClick("Save discovery");
  await goto(`/atlas/locations/${locationId}/discoveries`);
  await page
    .getByText("The hidden gate opens at dusk", { exact: true })
    .waitFor();
  draft = await ok(`/worlds/${worldId}/draft`);
  let loc = draft.records.find((r) => r.sourceId === locationId);
  assert.equal(loc.payload.gmDescription, "B05 private harbor secret");
  assert.equal(loc.payload.discoveries[0].provenance, "Harbor keeper");
  receipt.push({
    check: "location-map-private-discovery-ui-database-readback",
    pass: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await goto(`/atlas/locations/${locationId}/items/new`);
  await page.getByLabel("Placement name").fill("Lantern at harbor");
  await page
    .getByRole("combobox", { name: /^Item/ })
    .selectOption({ label: "Acceptance Lantern revised" });
  await saveClick("Save placement");
  await goto(`/atlas/locations/${locationId}/items`);
  await page.getByText("Lantern at harbor", { exact: true }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "/tmp/aow-B05-acceptance-placement-390.png",
    fullPage: true,
  });
  receipt.push({ check: "mobile-placement-save-hard-navigation", pass: true });
  await goto("/rules/new");
  await page.getByLabel("Rule name").fill("Acceptance local rule");
  await saveClick("Create rule", "POST");
  let rules = await ok(`/worlds/${worldId}/rules`);
  const rule = rules.rules.find((r) => r.name === "Acceptance local rule");
  assert.ok(rule);
  await goto(`/rules/${encodeURIComponent(rule.id)}/edit`);
  await page.getByLabel("Rule name").fill("Acceptance local rule revised");
  await saveClick("Save rule");
  await goto("/rules");
  await page
    .getByText("Acceptance local rule revised", { exact: true })
    .waitFor();
  receipt.push({ check: "mobile-rule-create-edit-persistence", pass: true });
  const exported = await ok(`/worlds/${worldId}/draft/export`);
  assert.equal(
    exported.records.find((r) => r.sourceId === locationId).payload
      .gmDescription,
    "B05 private harbor secret",
  );
  assert.ok(exported.records.find((r) => r.sourceId === itemId));
  receipt.push({ check: "export-retains-private-and-siblings", pass: true });
  const apiRequire = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  );
  const { PrismaClient } = apiRequire("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const outsider = await db.user.create({
    data: { displayName: "B05 unrelated reader", role: "PARTICIPANT" },
  });
  const profile = await db.playerProfile.create({
    data: { userId: outsider.id, displayName: "B05 unrelated reader" },
  });
  const token = randomBytes(24).toString("base64url");
  await db.authSession.create({
    data: {
      userId: outsider.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await db.$disconnect();
  const otherCookie = `aow_session=${token}`;
  const denied = await request(
    `/worlds/${worldId}/draft/export`,
    "GET",
    undefined,
    otherCookie,
  );
  assert.equal(denied.status, 404);
  assert.ok(!JSON.stringify(denied.body).includes("private harbor secret"));
  await ok(
    `/worlds/${worldId}/access`,
    "POST",
    { playerId: profile.id, role: "viewer" },
    201,
  );
  const viewed = await request(
    `/worlds/${worldId}/draft`,
    "GET",
    undefined,
    otherCookie,
  );
  assert.equal(viewed.status, 200);
  const d = viewed.body;
  const mutation = {
    expectedDraftId: d.id,
    expectedStorageRevision: d.storageRevision,
    revisionName: d.revisionName,
    content: d.content,
    records: d.records.map(
      ({ resourceType, sourceId, sourceRevision, payload }) => ({
        resourceType,
        sourceId,
        sourceRevision,
        payload,
      }),
    ),
  };
  assert.equal(
    (await request(`/worlds/${worldId}/draft`, "PUT", mutation, otherCookie))
      .status,
    404,
  );
  receipt.push({
    check: "authenticated-outsider-private-denial-and-shared-viewer-readonly",
    pass: true,
  });
  const stale = { ...mutation, expectedStorageRevision: d.storageRevision - 1 };
  assert.equal(
    (await request(`/worlds/${worldId}/draft`, "PUT", stale)).status,
    409,
  );
  assert.equal(
    (await ok(`/worlds/${worldId}/draft`)).storageRevision,
    d.storageRevision,
  );
  receipt.push({ check: "database-stale-save-atomic-rejection", pass: true });
  const locationUpdate = {
    expectedStorageRevision: d.storageRevision,
    name: "Acceptance Harbor",
    gmDescription: "B05 private harbor secret",
  };
  assert.equal(
    (
      await request(`/worlds/${worldId}/atlas/locations/${locationId}`, "PUT", {
        ...locationUpdate,
        discoveries: [{ id: "malformed", kind: "truth", statement: 7 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await ok(`/worlds/${worldId}/draft`)).storageRevision,
    d.storageRevision,
  );
  receipt.push({
    check: "malformed-save-leaves-database-unchanged",
    pass: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const spareDraft = await ok(
    `/worlds/${worldId}/item-compendium/items`,
    "POST",
    {
      expectedStorageRevision: d.storageRevision,
      name: "Disposable spare",
      itemFamilyKey: item.payload.modelValues["aow:item-family"],
      category: "Utility",
      quality: "standard",
      compatibleEquipmentSlotSets: [],
      image: item.payload.image,
    },
    201,
  );
  const spare = spareDraft.records.find(
    (r) => r.payload.identity?.name === "Disposable spare",
  );
  assert.ok(spare);
  await goto(`/item-compendium/items/${spare.sourceId}`);
  await page.getByRole("button", { name: "Remove entry", exact: true }).click();
  await saveClick("Remove from draft", "DELETE");
  const afterRemoval = await ok(`/worlds/${worldId}/draft`);
  assert.ok(!afterRemoval.records.find((r) => r.sourceId === spare.sourceId));
  assert.ok(afterRemoval.records.find((r) => r.sourceId === itemId));
  assert.ok(afterRemoval.records.find((r) => r.sourceId === locationId));
  receipt.push({
    check: "unreferenced-item-ui-removal-preserves-siblings",
    pass: true,
  });
  await goto(`/item-compendium/items/${itemId}`);
  await page.getByRole("button", { name: "Remove entry", exact: true }).click();
  const blockedDelete = page.waitForResponse(
    (r) => r.request().method() === "DELETE" && r.url().includes(itemId),
  );
  await page
    .getByRole("button", { name: "Remove from draft", exact: true })
    .click();
  assert.equal((await blockedDelete).status(), 409);
  assert.ok(
    (await ok(`/worlds/${worldId}/draft`)).records.find(
      (r) => r.sourceId === itemId,
    ),
  );
  receipt.push({
    check: "referenced-source-removal-blocked-in-ui",
    pass: true,
  });
  await page.getByRole("button", { name: "Keep entry", exact: true }).click();
  await page
    .getByRole("textbox", { name: /^Name/ })
    .fill("Acceptance Lantern recovered");
  let failOnce = true;
  await page.route(
    `**/api/worlds/${worldId}/item-compendium/items/${itemId}`,
    async (route) => {
      if (failOnce && route.request().method() === "PUT") {
        failOnce = false;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Injected acceptance failure" }),
        });
      }
      return route.continue();
    },
  );
  const failed = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes(itemId),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.equal((await failed).status(), 500);
  assert.equal(
    await page.getByRole("textbox", { name: /^Name/ }).inputValue(),
    "Acceptance Lantern recovered",
  );
  await saveClick("Save changes");
  await page.unroute(
    `**/api/worlds/${worldId}/item-compendium/items/${itemId}`,
  );
  assert.equal(
    (await ok(`/worlds/${worldId}/draft`)).records.find(
      (r) => r.sourceId === itemId,
    ).payload.identity.name,
    "Acceptance Lantern recovered",
  );
  receipt.push({
    check: "injected500-retains-form-real-database-retry",
    pass: true,
  });
  // World creation deliberately leaves its required root map for the GM to supply.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto(`?view=atlas&entry=${draft.content.rootLocationId}&edit=1`);
  await page.getByLabel("Choose a map source").selectOption("upload");
  await page.getByLabel("Upload map image").setInputFiles({
    name: "b05-root-map.png",
    mimeType: "image/png",
    buffer: png,
  });
  await saveClick("Save location");
  receipt.push({ check: "required-root-map-ui-save", pass: true });
  await goto("/versions/draft/review");
  const published = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().endsWith("/draft/publish"),
  );
  await page
    .getByRole("button", {
      name: "Validate & publish complete revision",
      exact: true,
    })
    .click();
  assert.equal((await published).status(), 200);
  await page.waitForURL((u) => u.pathname.endsWith("/versions"));
  let detail = await ok(`/worlds/${worldId}`);
  assert.equal(detail.revisions.length, 1);
  receipt.push({ check: "ui-validate-publish-immutable-revision", pass: true });
  assert.equal(
    (await request(`/worlds/${worldId}/draft`, "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (await request(`/worlds/${worldId}/draft/export`, "GET", undefined, ""))
      .status,
    401,
  );
  receipt.push({
    check: "unauthenticated-private-draft-export-denied",
    pass: true,
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: receipt.length, pass: true }));
  await writeFile(
    "/tmp/aow-B05-acceptance-target.json",
    JSON.stringify({ worldId, itemId, locationId }),
  );
} catch (e) {
  await page
    .screenshot({ path: "/tmp/aow-B05-acceptance-failure.png", fullPage: true })
    .catch(() => {});
  console.error(
    "PAGE",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  throw e;
} finally {
  await writeFile(
    "/tmp/aow-B05-acceptance-receipt.json",
    JSON.stringify({ worldId, receipt, errors }, null, 2),
  );
  await browser.close();
}
