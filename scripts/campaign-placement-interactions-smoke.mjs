import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { chromium } = require("playwright-core");
const base = process.env.CAMPAIGN_TEST_WEB_URL || "http://127.0.0.1:5198";
const api = process.env.CAMPAIGN_TEST_API_URL || "http://127.0.0.1:3109";
if (new URL(base).port !== "5198" || new URL(api).port !== "3109")
  throw Error("Use the explicitly isolated authoring stack ports5198/3109");
const auth = JSON.parse(
  await readFile(
    process.env.CAMPAIGN_TEST_AUTH_FILE || "/tmp/aow-authoring-auth.json",
    "utf8",
  ),
);
if (process.env.CAMPAIGN_TEST_SOURCE_CAMPAIGN_ID)
  auth.campaignId = process.env.CAMPAIGN_TEST_SOURCE_CAMPAIGN_ID;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
await context.addCookies([
  {
    name: "aow_session",
    value: auth.token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);
const page = await context.newPage();
const errors = [],
  receipt = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", async (r) => {
  if (r.status() >= 400 && r.url().includes("/api/"))
    console.error(
      JSON.stringify({
        status: r.status(),
        path: new URL(r.url()).pathname,
        body: (await r.text()).slice(0, 500),
      }),
    );
});
let campaignId;
const path = (suffix) => `${base}/campaigns/definitions/${campaignId}${suffix}`;
async function draft() {
  const r = await context.request.get(
    `${api}/api/campaigns/${campaignId}/draft`,
    { headers: { Authorization: `Bearer ${auth.token}`, Origin: base } },
  );
  assert.equal(r.status(), 200);
  return r.json();
}
async function saved(button) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().endsWith(`/campaigns/${campaignId}/draft`),
  );
  await button.click();
  assert.equal((await response).status(), 200);
  await page.waitForLoadState("networkidle");
}
try {
  await page.goto(`${base}/campaigns/definitions/${auth.campaignId}/versions`);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Fork this revision", exact: true })
    .last()
    .click();
  await page
    .getByLabel("New Campaign Definition name")
    .fill(`Placement interaction verification ${Date.now()}`);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Create independent fork", exact: true })
    .click();
  await page.waitForURL(
    (u) =>
      u.pathname.includes("/campaigns/definitions/") &&
      !u.pathname.includes(auth.campaignId),
  );
  campaignId = new URL(page.url()).pathname.split("/")[3];
  await page.goto(path("/placements"));
  await page
    .getByRole("heading", { name: "Placements", exact: true })
    .waitFor();
  let initial = await draft();
  const fixturePlots = [0, 1].map((n) => ({
    resourceType: "plots",
    sourceId: `smoke-plot-${n}`,
    payload: {
      id: `smoke-plot-${n}`,
      campaignDefinitionId: campaignId,
      name: `Supporting story ${n + 1}`,
      parent: { kind: "root" },
      objectives: [],
      pressures: [],
      resistances: [],
      discoveries: [],
      locationContexts: [],
    },
  }));
  const fixtureContent = {
    ...initial.content,
    plotDefinitionIds: [
      ...(initial.content.plotDefinitionIds || []),
      ...fixturePlots.map((r) => r.sourceId),
    ],
    preparation: {
      ...(initial.content.preparation || {}),
      extensions: { "test:preserved": { note: "Keep richer preparation" } },
      locationCanvases: [],
    },
  };
  const seedResponse = await context.request.put(
    `${api}/api/campaigns/${campaignId}/draft`,
    {
      headers: { Authorization: `Bearer ${auth.token}`, Origin: base },
      data: {
        expectedStorageRevision: initial.storageRevision,
        revisionName: initial.revisionName,
        content: fixtureContent,
        records: [...initial.records, ...fixturePlots].map(
          ({ resourceType, sourceId, sourceRevision, payload }) => ({
            resourceType,
            sourceId,
            sourceRevision,
            payload,
          }),
        ),
      },
    },
  );
  assert.equal(seedResponse.status(), 200);
  initial = await seedResponse.json();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Creature or Item")
    .locator("option")
    .nth(1)
    .waitFor({ state: "attached" });
  await page
    .getByLabel("Captured Location")
    .locator("option")
    .nth(1)
    .waitFor({ state: "attached" });
  const sourceOptions = await page
    .getByLabel("Creature or Item")
    .locator("option")
    .evaluateAll((xs) =>
      xs.map((x) => ({ value: x.value, label: x.textContent })),
    );
  const locationOptions = await page
    .getByLabel("Captured Location")
    .locator("option")
    .evaluateAll((xs) =>
      xs.map((x) => ({ value: x.value, label: x.textContent })),
    );
  await writeFile(
    "/tmp/aow-placement-fixture-inventory.json",
    JSON.stringify(
      {
        campaignId,
        sourceOptions,
        locationOptions,
        capturedWorldContent: initial.capturedWorldContent,
        plots: initial.records.filter((r) => r.resourceType === "plots"),
      },
      null,
      2,
    ),
  );
  receipt.push({ id: "fork", status: "PASS" });
  const locations = locationOptions.filter((o) => o.value);
  assert(locations.length);
  const creature = sourceOptions.find(
    (o) => o.value && /creature/i.test(o.label),
  );
  const item = sourceOptions.find((o) => o.value && /item/i.test(o.label));
  assert(creature && item);
  const label = page.getByLabel("Campaign label", { exact: true });
  const source = page.getByLabel("Creature or Item");
  const loc = page.getByLabel("Captured Location");
  assert(
    await page
      .getByRole("button", { name: "Add to draft", exact: true })
      .isDisabled(),
  );
  receipt.push({
    id: "A10",
    status: "PASS",
    detail: "Missing required source/Location prevents save",
  });
  await label.fill("Verifier creature");
  await loc.selectOption(locations[0].value);
  await source.selectOption(creature.value);
  await page.getByLabel("Supporting story 1", { exact: true }).check();
  await page.getByLabel("Supporting story 2", { exact: true }).check();
  await page.getByLabel("Supporting story 1", { exact: true }).uncheck();
  await page.getByLabel("Supporting story 1", { exact: true }).check();
  await saved(page.getByRole("button", { name: "Add to draft", exact: true }));
  let state = await draft();
  let actor = state.records.find((r) => r.payload.name === "Verifier creature");
  assert.equal(actor.payload.source.kind, "world-creature");
  assert.equal(actor.payload.source.creatureId, creature.value);
  assert.equal(actor.payload.plotDefinitionIds.length, 2);
  receipt.push({ id: "A01/A02/A05", status: "PASS" });
  const richRecords = state.records.map((r) =>
    r.sourceId === actor.sourceId
      ? {
          ...r,
          payload: {
            ...r.payload,
            extensions: {
              "test:placement-note": "Keep hidden placement detail",
            },
          },
        }
      : r,
  );
  const richer = await context.request.put(
    `${api}/api/campaigns/${campaignId}/draft`,
    {
      headers: { Authorization: `Bearer ${auth.token}`, Origin: base },
      data: {
        expectedStorageRevision: state.storageRevision,
        revisionName: state.revisionName,
        content: state.content,
        records: richRecords.map(
          ({ resourceType, sourceId, sourceRevision, payload }) => ({
            resourceType,
            sourceId,
            sourceRevision,
            payload,
          }),
        ),
      },
    },
  );
  assert.equal(richer.status(), 200);
  await page.reload();
  await page.waitForLoadState("networkidle");

  await label.fill("Verifier item");
  await loc.selectOption(locations[0].value);
  await source.selectOption(item.value);
  await saved(page.getByRole("button", { name: "Add to draft", exact: true }));
  state = await draft();
  let placedItem = state.records.find(
    (r) => r.payload.name === "Verifier item",
  );
  assert.equal(placedItem.payload.source.kind, "world-item");
  assert(!("creatureId" in placedItem.payload.source));
  receipt.push({ id: "A03", status: "PASS" });
  const card = (name) =>
    page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card("Verifier creature")
    .getByRole("button", { name: "Edit placement", exact: true })
    .click();
  assert.equal(await label.inputValue(), "Verifier creature");
  await source.selectOption(item.value);
  await label.fill("Verifier switched item");
  await saved(
    page.getByRole("button", { name: "Save placement", exact: true }),
  );
  state = await draft();
  actor = state.records.find((r) => r.sourceId === actor.sourceId);
  assert.equal(actor.payload.source.kind, "world-item");
  assert(!("creatureId" in actor.payload.source));
  assert.equal(
    actor.payload.extensions["test:placement-note"],
    "Keep hidden placement detail",
  );
  receipt.push({
    id: "A06/A07",
    status: "PASS",
    detail: "Same identity switched Creature to Item",
  });
  await card("Verifier switched item")
    .getByRole("button", { name: "Edit placement", exact: true })
    .click();
  await label.fill("Unsaved change");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  assert.equal(await label.inputValue(), "Unsaved change");
  page.once("dialog", (d) => d.dismiss());
  await card("Verifier item")
    .getByRole("button", { name: "Edit placement", exact: true })
    .click();
  assert.equal(await label.inputValue(), "Unsaved change");
  page.once("dialog", (d) => d.accept());
  await card("Verifier item")
    .getByRole("button", { name: "Edit placement", exact: true })
    .click();
  assert.equal(await label.inputValue(), "Verifier item");
  await label.fill("Another unsaved change");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  assert.equal(await label.inputValue(), "");
  receipt.push({ id: "A08", status: "PASS" });
  page.once("dialog", (d) => d.dismiss());
  await card("Verifier item")
    .getByRole("button", { name: "Remove placement", exact: true })
    .click();
  assert(
    (await draft()).records.some((r) => r.sourceId === placedItem.sourceId),
  );
  page.once("dialog", (d) => d.accept());
  await saved(
    card("Verifier item").getByRole("button", {
      name: "Remove placement",
      exact: true,
    }),
  );
  assert(
    !(await draft()).records.some((r) => r.sourceId === placedItem.sourceId),
  );
  receipt.push({ id: "A09", status: "PASS" });
  await label.fill("Retry placement");
  await loc.selectOption(locations[0].value);
  await source.selectOption(item.value);
  let releaseFailure;
  const blocked = new Promise((resolve) => {
    releaseFailure = resolve;
  });
  let enteredResolve;
  const entered = new Promise((resolve) => {
    enteredResolve = resolve;
  });
  const faultRoute = `**/api/campaigns/${campaignId}/draft`;
  await page.route(
    faultRoute,
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      enteredResolve();
      await blocked;
      await route.fulfill({
        status: 503,
        json: { message: "Simulated temporary save failure" },
      });
    },
    { times: 1 },
  );
  const failed = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().endsWith(`/campaigns/${campaignId}/draft`),
  );
  await page.getByRole("button", { name: "Add to draft", exact: true }).click();
  await entered;
  assert(await label.isDisabled());
  releaseFailure();
  assert.equal((await failed).status(), 503);
  await page
    .getByText(
      "The Campaign draft was not saved. Your changes remain on this page.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await label.inputValue(), "Retry placement");
  assert(
    !(await draft()).records.some((r) => r.payload.name === "Retry placement"),
  );
  await saved(page.getByRole("button", { name: "Add to draft", exact: true }));
  assert.equal(
    (await draft()).records.filter((r) => r.payload.name === "Retry placement")
      .length,
    1,
  );
  await card("Retry placement")
    .getByRole("button", { name: "Edit placement", exact: true })
    .click();
  await label.fill("Stale attempted overwrite");
  await page.route(
    faultRoute,
    (route) =>
      route.fulfill({
        status: 409,
        json: { message: "Simulated stale draft" },
      }),
    { times: 1 },
  );
  const staleResponse = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().endsWith(`/campaigns/${campaignId}/draft`),
  );
  await page
    .getByRole("button", { name: "Save placement", exact: true })
    .click();
  assert.equal((await staleResponse).status(), 409);
  await page
    .getByRole("button", { name: "Reload latest draft", exact: true })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  assert(
    !(await draft()).records.some(
      (r) => r.payload.name === "Stale attempted overwrite",
    ),
  );
  receipt.push({
    id: "A11",
    status: "PASS",
    detail:
      "503 pending/retained input/retry once;409 blocks stale overwrite and reload recovers",
  });
  await page.getByLabel("Decorate a World placement", { exact: true }).check();
  const worldChoices = await page
    .getByLabel("Captured World placement")
    .locator("option")
    .count();
  if (worldChoices === 1) {
    assert(
      await page
        .getByRole("button", { name: "Add to draft", exact: true })
        .isDisabled(),
    );
    receipt.push({
      id: "A04",
      status: "BLOCKED",
      detail:
        "Published source has no World placements; missing-options save blocking verified",
    });
  } else {
    const worldSource = await page
      .getByLabel("Captured World placement")
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await label.fill("Verifier decoration");
    await page.getByLabel("Captured World placement").selectOption(worldSource);
    await saved(
      page.getByRole("button", { name: "Add to draft", exact: true }),
    );
    state = await draft();
    const decoration = state.records.find(
      (r) => r.payload.name === "Verifier decoration",
    );
    assert.equal(decoration.payload.kind, "world-decoration");
    assert.equal(decoration.payload.capturedWorldPlacementId, worldSource);
    assert(!("source" in decoration.payload));
    const capturedPlacement = state.capturedWorldContent.placements.find(
      (p) => p.id === worldSource,
    );
    assert.equal(decoration.payload.locationId, capturedPlacement.locationId);
    await card("Verifier decoration")
      .getByRole("button", { name: "Edit placement", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Captured World placement").inputValue(),
      worldSource,
    );
    await label.fill("Verifier edited decoration");
    await saved(
      page.getByRole("button", { name: "Save placement", exact: true }),
    );
    await card("Verifier edited decoration")
      .getByRole("button", { name: "Edit placement", exact: true })
      .click();
    await page.getByLabel("Place Campaign content", { exact: true }).check();
    await loc.selectOption(locations[0].value);
    await source.selectOption(creature.value);
    await saved(
      page.getByRole("button", { name: "Save placement", exact: true }),
    );
    let switched = (await draft()).records.find(
      (r) => r.sourceId === decoration.sourceId,
    );
    assert.equal(switched.payload.kind, "independent");
    assert(!("capturedWorldPlacementId" in switched.payload));
    assert.equal(switched.payload.source.kind, "world-creature");
    await card("Verifier edited decoration")
      .getByRole("button", { name: "Edit placement", exact: true })
      .click();
    await page
      .getByLabel("Decorate a World placement", { exact: true })
      .check();
    await page.getByLabel("Captured World placement").selectOption(worldSource);
    await saved(
      page.getByRole("button", { name: "Save placement", exact: true }),
    );
    switched = (await draft()).records.find(
      (r) => r.sourceId === decoration.sourceId,
    );
    assert.equal(switched.payload.kind, "world-decoration");
    assert(!("source" in switched.payload));
    assert.deepEqual(
      (await draft()).capturedWorldContent,
      initial.capturedWorldContent,
    );
    receipt.push({
      id: "A04/A06decoration/A07ownership",
      status: "PASS",
      detail:
        "Actual captured World placement selected,Location inherited,edit+both ownership switches persist sameID;captured World unchanged",
    });
  }
  await page.screenshot({
    path: "/tmp/aow-placement-interactions-placements.png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await page.goto(path("/preparation"));
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Starting Location").selectOption(locations[0].value);
  await page.getByLabel("Starting context").fill("Arrive at dawn");
  await page.getByLabel("Source-map variations").fill("Storm lighting");
  await saved(
    page.getByRole("button", {
      name: "Save preparation defaults",
      exact: true,
    }),
  );
  state = await draft();
  assert.equal(
    state.content.preparation.extensions["test:preserved"].note,
    "Keep richer preparation",
  );
  assert.equal(
    state.content.preparation.startingLocationId,
    locations[0].value,
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.getByLabel("Starting context").inputValue(),
    "Arrive at dawn",
  );
  await page.getByLabel("Starting Location").selectOption("");
  await page.getByLabel("Starting context").fill("");
  await page.getByLabel("Source-map variations").fill("");
  await saved(
    page.getByRole("button", {
      name: "Save preparation defaults",
      exact: true,
    }),
  );
  state = await draft();
  assert(!("startingLocationId" in state.content.preparation));
  assert.equal(state.content.preparation.startingContext, "");
  assert.equal(state.content.preparation.mapVariations, "");
  assert.equal(
    state.content.preparation.extensions["test:preserved"].note,
    "Keep richer preparation",
  );
  receipt.push({ id: "D01/D02/T01", status: "PASS" });
  if (process.env.CAMPAIGN_TEST_MIGRATION === '1') {
    await page.goto(path('/versions/draft/review')); await page.waitForLoadState('networkidle');
    const validation=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/validate'));
    await page.getByRole('button',{name:'Validate complete draft',exact:true}).click();
    const validationBody=await (await validation).json();assert.equal(validationBody.valid,true,JSON.stringify(validationBody.issues));
    await page.getByRole('button',{name:'Publish Campaign revision',exact:true}).click();
    await page.waitForURL(u=>u.pathname===`/campaigns/definitions/${campaignId}`);
    const beforeMigration=await draft();
    await page.goto(path('/versions/migrate'));await page.waitForLoadState('networkidle');
    const targets=page.getByLabel('Target direct-lineage World revision');await targets.locator('option').nth(1).waitFor({state:'attached'});
    const targetId=await targets.locator('option').nth(1).getAttribute('value');await targets.selectOption(targetId);
    await page.getByRole('button',{name:'Preview complete migration',exact:true}).click();
    const apply=page.getByRole('button',{name:'Apply complete migration',exact:true});await apply.waitFor();
    await apply.click();await page.waitForURL(u=>u.pathname===`/campaigns/definitions/${campaignId}/versions`);
    const migrated=await draft();assert.notEqual(migrated.capturedWorld.revisionNumber,beforeMigration.capturedWorld.revisionNumber);assert.equal(migrated.capturedWorld.revisionNumber,2);
    await page.getByRole('link',{name:'Overview',exact:true}).click();
    await page.getByLabel('Revision name').fill('After migrated capture');await saved(page.getByRole('button',{name:'Save overview',exact:true}));
    await page.reload();await page.waitForLoadState('networkidle');assert.equal(await page.getByLabel('Revision name').inputValue(),'After migrated capture');
    assert.equal((await draft()).capturedWorld.revisionNumber,2);receipt.push({id:'R04/M03/M10/O02postmigration',status:'PASS',detail:'Real publish then direct World migration and subsequent overview save+reload use refreshed draft'});
  }
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: "/tmp/aow-placement-interactions.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      sourceOptions: sourceOptions.length,
      locationOptions: locationOptions.length,
      plots: initial.records.filter((r) => r.resourceType === "plots").length,
      errors,
    }),
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/aow-placement-failure.png",
    fullPage: true,
  });
  console.error(
    JSON.stringify({
      errors,
      body: (await page.locator("body").innerText()).slice(-4500),
    }),
  );
  throw error;
} finally {
  await writeFile(
    "/tmp/aow-placement-interactions-receipt.json",
    JSON.stringify(receipt, null, 2),
  );
  await browser.close();
}
