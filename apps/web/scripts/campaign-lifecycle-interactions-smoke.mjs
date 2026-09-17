import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const origin = process.env.AUTHORING_TEST_ORIGIN;
assert.equal(
  origin,
  "http://127.0.0.1:5198",
  "Requires isolated authoring stack",
);
const auth = JSON.parse(
  readFileSync(process.env.AUTHORING_TEST_AUTH_FILE, "utf8"),
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const checks = [],
  errors = [];
try {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "aow_session", value: auth.token, domain: "127.0.0.1", path: "/" },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (r.url().includes("/draft/publish"))
      console.log("PUBLICATION_STATUS", r.status());
  });
  const original = `/campaigns/definitions/${encodeURIComponent(auth.campaignId)}`;
  const json = async (path) => {
    const r = await context.request.get(origin + path);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  };
  const check = (name) => {
    assert.deepEqual(errors, []);
    checks.push(name);
    console.log(JSON.stringify({ name, passed: true }));
  };
  const sourceBefore = await json(
    `/api/campaigns/${encodeURIComponent(auth.campaignId)}`,
  );
  await page.goto(origin + original + "/versions", {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: "Fork this revision", exact: true })
    .first()
    .click();
  await page
    .getByLabel("New Campaign Definition name")
    .fill("Lifecycle empirical fork");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Create independent fork", exact: true })
      .count(),
    0,
  );
  check("fork cancelled without mutation");
  await page
    .getByRole("button", { name: "Fork this revision", exact: true })
    .first()
    .click();
  await page
    .getByLabel("New Campaign Definition name")
    .fill("Lifecycle empirical fork");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Create independent fork", exact: true })
    .click();
  await page.waitForURL((u) => u.pathname !== original + "/versions", {
    timeout: 60000,
  });
  const base = new URL(page.url()).pathname.replace(/\/$/, "");
  const id = decodeURIComponent(base.split("/").at(-1)),
    api = `/api/campaigns/${encodeURIComponent(id)}`;
  const draft = await json(api + "/draft");
  assert.notEqual(id, auth.campaignId);
  check("fork submitted through UI and new draft persisted");
  writeFileSync(
    "/tmp/aow-lifecycle-target.json",
    JSON.stringify({ base, id, api, checks }),
  );
  await page.goto(origin + base + "/versions/draft/review", {
    waitUntil: "networkidle",
  });
  assert.equal(
    await page
      .getByRole("button", { name: "Publish Campaign revision", exact: true })
      .isDisabled(),
    true,
  );
  await page.route(
    "**/draft/validate",
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Injected validation outage" },
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Validate complete draft", exact: true })
    .click();
  await page
    .getByText("The draft could not be validated.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Publish Campaign revision", exact: true })
      .isDisabled(),
    true,
  );
  check("validation failure cannot enable publication");
  await page
    .getByRole("button", { name: "Validate complete draft", exact: true })
    .click();
  await page
    .getByText("This complete draft is ready to publish.", { exact: true })
    .waitFor({ timeout: 60000 });
  check("actual complete draft validation enables publication");
  const beforePublish = await json(api);
  await page.route(
    "**/draft/publish",
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Injected publication outage" },
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Publish Campaign revision", exact: true })
    .click();
  await page
    .getByText(
      "Publication could not be confirmed. Reload the Campaign to check its current revision before retrying.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await json(api)).currentRevisionId,
    beforePublish.currentRevisionId,
  );
  check("publication failure preserves immutable head");
  await page
    .getByRole("button", { name: "Validate complete draft", exact: true })
    .click();
  await page
    .getByText("This complete draft is ready to publish.", { exact: true })
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Publish Campaign revision", exact: true })
    .click();
  await page.waitForURL((u) => u.pathname === base, { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  const published = await json(api);
  assert.equal(published.revisions.length, beforePublish.revisions.length + 1);
  check("publish retry advances immutable head exactly once");
  await page.locator("textarea").nth(0).fill("Unpublished lifecycle test edit");
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/draft") && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save overview", exact: true }).click(),
  ]);
  assert.equal(
    (await json(api + "/draft")).content.gmPremise,
    "Unpublished lifecycle test edit",
  );
  await page.goto(origin + base + "/versions", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Review draft impact", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Draft impact", exact: true })
    .waitFor();
  check("impact review reports saved unpublished changes");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Discard unpublished changes", exact: true })
    .click();
  assert.equal(
    (await json(api + "/draft")).content.gmPremise,
    "Unpublished lifecycle test edit",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Discard unpublished changes", exact: true })
    .click();
  await page
    .getByText(
      "Unpublished changes were discarded. The draft now matches the published revision.",
      { exact: true },
    )
    .waitFor({ timeout: 60000 });
  assert.notEqual(
    (await json(api + "/draft")).content.gmPremise,
    "Unpublished lifecycle test edit",
  );
  assert.equal(
    (await json(api)).currentRevisionId,
    published.currentRevisionId,
  );
  check(
    "discard unpublished changes cancel/confirm preserves published revision",
  );
  await page
    .getByRole("button", { name: "Archive Definition", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore Definition", exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal((await json(api)).status, "archived");
  await page.goto(origin + base, { waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("button", { name: "Save overview", exact: true })
      .count(),
    0,
  );
  check("archive persists and deep linked editor is read-only");
  await page
    .getByRole("button", { name: "Restore Definition", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save overview", exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal((await json(api)).status, "active");
  check("restore resumes editable authoring");
  assert.deepEqual(
    (await json(api + "/draft")).capturedWorld,
    draft.capturedWorld,
  );
  assert.deepEqual(
    await json(`/api/campaigns/${encodeURIComponent(auth.campaignId)}`),
    sourceBefore,
  );
  check("lifecycle keeps source lineage and captured World unchanged");
  await page.screenshot({
    path: "/tmp/aow-lifecycle-authoring.png",
    fullPage: true,
  });
  writeFileSync(
    "/tmp/aow-lifecycle-target.json",
    JSON.stringify({ base, id, api, checks }),
  );
} catch (e) {
  console.error("BROWSER_ERRORS", errors);
  throw e;
} finally {
  await browser.close();
}
