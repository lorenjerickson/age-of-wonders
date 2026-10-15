import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { chromium } = require("playwright-core");
const base = "http://127.0.0.1:5199",
  api = "http://127.0.0.1:3110/api";
const seed = JSON.parse(
  await readFile("/tmp/aow-B08-equipment-seed.json", "utf8"),
);
const { cookie } = JSON.parse(await readFile("/tmp/aow-b08-auth.json", "utf8"));
const stack = await readFile("/tmp/aow-b08-stack.mjs", "utf8");
assert.ok(
  stack.includes("dburl.pathname='/aow_b08_disposable_20261014'"),
  "Use the disposable B08 stack only",
);
const endpoint = `/campaigns/${seed.campaignId}/instances/${seed.instanceId}/creature-embodiments/${seed.actorId}/equipment`;
async function read() {
  const response = await fetch(api + endpoint, { headers: { cookie } });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
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
page.setDefaultTimeout(15000);
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    console.error("HTTP", response.status(), new URL(response.url()).pathname);
});
const hero = () =>
  page
    .locator("li")
    .filter({ has: page.getByText("Hero", { exact: true }) })
    .filter({
      has: page.getByRole("button", { name: "Equipment", exact: true }),
    });
async function open() {
  await page.goto(`${base}/campaigns/instances/${seed.instanceId}/placements`);
  await page.waitForLoadState("networkidle");
  await hero().getByRole("button", { name: "Equipment", exact: true }).click();
  await hero()
    .getByText("Available bonus actions:", { exact: false })
    .waitFor();
}
async function click(locator) {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api" + endpoint &&
      response.request().method() === "POST",
  );
  await locator.click();
  const response = await pending;
  assert.ok([200, 201].includes(response.status()), await response.text());
  await page.waitForLoadState("networkidle");
  return read();
}
const item = (name) =>
  hero()
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function visual(width) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "horizontal overflow",
  );
  const text = await page.locator("body").innerText();
  for (const id of [
    seed.ownerId,
    seed.campaignId,
    seed.instanceId,
    "actor-entity",
    "pack-def",
    "tool-def",
    "slot:hand",
  ])
    assert.equal(text.includes(id), false, `Visible internal identifier ${id}`);
  await page.screenshot({
    path: `/tmp/aow-B08-equipment-real-${width}.png`,
    fullPage: true,
  });
  checks.push({ check: `responsive-${width}`, pass: true });
}
try {
  await open();
  let state = await read();
  assert.equal(state.actorName, "Hero");
  assert.equal(state.bonusActions, 1);
  assert.equal(
    state.items.find((i) => i.name === "Hammer").locationLabel,
    "In Travel pack",
  );
  checks.push({ check: "actual-placements-equipment-navigation", pass: true });
  state = await click(
    item("Travel pack").getByRole("button", { name: /^Retrieve and equip:/ }),
  );
  assert.equal(state.bonusActions, 0);
  assert.match(
    state.items.find((i) => i.name === "Hammer").locationLabel,
    /Equipped:/,
  );
  checks.push({ check: "pack-retrieve-and-equip-consumes-one", pass: true });
  await visual(1440);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await hero().getByRole("button", { name: "Equipment", exact: true }).click();
  await item("Hammer")
    .getByText(/Equipped:/)
    .waitFor();
  assert.equal((await read()).bonusActions, 0);
  checks.push({
    check: "hard-reload-equipment-and-allowance-persist",
    pass: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  const belt = state.items.find((i) => i.name === "Tool belt");
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api" + endpoint &&
      response.request().method() === "POST",
  );
  await item("Hammer")
    .getByRole("combobox", { name: /Store in an empty container slot/ })
    .selectOption(JSON.stringify([belt.id, 0]));
  const stowResponse = await pending;
  assert.ok(
    [200, 201].includes(stowResponse.status()),
    await stowResponse.text(),
  );
  await page.waitForLoadState("networkidle");
  assert.equal(
    (await read()).items.find((i) => i.name === "Hammer").locationLabel,
    "In Tool belt",
  );
  state = await click(
    item("Tool belt").getByRole("button", { name: /^Retrieve and equip:/ }),
  );
  assert.equal(state.bonusActions, 0);
  assert.match(
    state.items.find((i) => i.name === "Hammer").locationLabel,
    /Equipped:/,
  );
  checks.push({
    check: "mobile-equipped-belt-retrieve-costs-zero",
    pass: true,
  });
  await visual(390);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await hero().getByRole("button", { name: "Equipment", exact: true }).click();
  await item("Hammer")
    .getByText(/Equipped:/)
    .waitFor();
  checks.push({ check: "mobile-hard-reload-persists", pass: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks }));
} catch (error) {
  await page.screenshot({
    path: "/tmp/aow-B08-equipment-real-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(0, 12000));
  throw error;
} finally {
  await writeFile(
    "/tmp/aow-B08-equipment-acceptance.json",
    JSON.stringify({ seed, checks, pageErrors: errors }, null, 2),
  );
  await browser.close();
}
