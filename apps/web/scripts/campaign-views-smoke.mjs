import assert from "node:assert/strict";
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
  join(tmpdir(), "aow-campaign-views.png");
async function withFixture(run) {
  const name = `campaign-views-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.CAMPAIGN_VIEWS_TEST_PORT || 5186);
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
      `// @ts-nocheck — isolated browser fixture router.
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet, Link } from '@tanstack/react-router';
import * as InstancePages from './CampaignInstancePages';
import * as DefinitionPages from './CampaignDefinitionPages';
import { CharacterCreationPage, CharacterDraftEditor } from './CharacterCreationPage';
import { CampaignInstanceProvider, CampaignInstanceContextBar } from './CampaignInstanceWorkspace';
import { CampaignDefinitionAuthoringProvider, CampaignDefinitionContextBar } from './CampaignDefinitionAuthoringShell';
import './index.css';
const {instance,definition,draft}=await fetch('/fixture').then(r=>r.json());
const instanceViews=[['','CampaignInstanceOverviewPage'],['roster','CampaignInstanceRosterPage'],['roster/agents','CampaignInstanceAgentsPage'],['plots','CampaignInstancePlotsPage'],['placements','CampaignInstancePlacementsPage'],['sessions','CampaignInstanceSessionsPage'],['versions','CampaignInstanceVersionsPage']];
const definitionViews=[['','CampaignDefinitionOverviewPage'],['plots','CampaignPlotsPage'],['placements','CampaignPlacementsPage'],['preparation','CampaignPreparationPage'],['versions','CampaignVersionsPage'],['versions/migrate','CampaignWorldMigrationPage']];
const nav=[...instanceViews.map(([path])=>['Instance '+(path||'overview'),'/campaigns/instances/instance'+(path?'/'+path:'')]),...definitionViews.map(([path])=>['Definition '+(path||'overview'),'/campaigns/definitions/campaign'+(path?'/'+path:'')]),['Create Instance','/campaigns/instances/new'],['Create Definition','/campaigns/definitions/new'],['Player Characters','/play/instances/instance/characters']];
const root=createRootRoute({component:()=> <><nav aria-label="View regression">{nav.map(([label,to])=><Link key={to} to={to} className="inline-block p-2">{label}</Link>)}</nav><Outlet/></>});
const instanceRoute=createRoute({getParentRoute:()=>root,path:'/campaigns/instances/instance',component:()=> <CampaignInstanceProvider instance={instance}><CampaignInstanceContextBar/><Outlet/></CampaignInstanceProvider>});
const definitionRoute=createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/campaign',component:()=> <CampaignDefinitionAuthoringProvider definition={definition} initialDraft={draft}><CampaignDefinitionContextBar/><Outlet/></CampaignDefinitionAuthoringProvider>});
const instanceChildren=instanceViews.map(([path,name])=>createRoute({getParentRoute:()=>instanceRoute,path:path||'/',component:()=>{const Page=(InstancePages as any)[name];return <Page/>}}));
instanceChildren.push(createRoute({getParentRoute:()=>instanceRoute,path:"roster/characters/$characterId",component:()=> <CharacterDraftEditor campaignInstanceId="instance" campaignDefinitionId="campaign" characterId="character"/>}));
const definitionChildren=definitionViews.map(([path,name])=>createRoute({getParentRoute:()=>definitionRoute,path:path||'/',component:()=>{const Page=(DefinitionPages as any)[name];return <Page/>}}));
definitionChildren.push(createRoute({getParentRoute:()=>definitionRoute,path:'plots/new',component:()=> <DefinitionPages.CampaignPlotsPage plotId="new"/>}));
const creation=[createRoute({getParentRoute:()=>root,path:'/campaigns/instances/new',component:InstancePages.CampaignInstanceCreatePage}),createRoute({getParentRoute:()=>root,path:'/campaigns/definitions/new',component:DefinitionPages.CampaignDefinitionCreatePage}),createRoute({getParentRoute:()=>root,path:'/play/instances/instance/characters',component:()=> <CharacterCreationPage campaignInstanceId="instance"/>})];
const router=createRouter({routeTree:root.addChildren([instanceRoute.addChildren(instanceChildren),definitionRoute.addChildren(definitionChildren),...creation]),history:createMemoryHistory({initialEntries:['/campaigns/instances/instance/roster?quickStart=1']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; import { reactPluginOptions } from './react-plugin-options'; export default defineConfig({cacheDir:'node_modules/.vite-${name}',plugins:[react(reactPluginOptions),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,watch:null}});`,
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
    await rm(join(webRoot, "node_modules", `.vite-${name}`), {
      recursive: true,
      force: true,
    });
  }
}

import { chromium } from "playwright-core";
const definition = {
  id: "campaign",
  name: "Bells Beneath the Flood",
  status: "active",
  createdAt: "2026-09-05",
  updatedAt: "2026-09-05",
  revisions: [],
};
const capturedWorld = {
  snapshotId: "world-snapshot",
  worldDefinitionId: "world",
  worldDefinitionRevisionId: "world-revision",
  worldName: "The Flooded City",
  revisionNumber: 1,
};
const draft = {
  id: "draft",
  campaignDefinitionId: "campaign",
  capturedWorld,
  revisionName: "First draft",
  content: {
    formatVersion: 1,
    gmPremise: "Explore the flooded city.",
    playerIntroduction: "Welcome to the city.",
    plotDefinitionIds: [],
    placementDefinitionIds: [],
    modelSchemaReleaseIds: [],
    preparation: {},
  },
  capturedWorldContent: {
    locations: [{ id: "location", name: "Old Quay", kind: "site" }],
    creatures: [],
    items: [],
    placements: [],
  },
  records: [],
  storageRevision: 1,
  validationStatus: "not-validated",
};
const revision = {
  id: "revision",
  revisionNumber: 1,
  name: definition.name,
  publishedAt: "2026-09-05",
  snapshot: { id: "campaign-snapshot" },
  capturedWorld,
};
definition.revisions = [revision];
const world = {
  id: "world",
  name: "The Flooded City",
  status: "active",
  revisions: [
    {
      id: "world-revision",
      revisionNumber: 1,
      name: "First release",
      publishedAt: "2026-09-05",
      snapshots: [{ id: "world-snapshot" }],
    },
  ],
};
const pair = {
  campaignDefinition: {
    name: definition.name,
    revisionNumber: 1,
    authoringHref: "/campaigns/definitions/campaign",
  },
  worldDefinition: {
    name: capturedWorld.worldName,
    revisionNumber: 1,
    authoringHref: "/worlds/world",
  },
};
const instance = {
  id: "instance",
  name: "Friday campaign",
  campaignDefinitionId: "campaign",
  status: "active",
  currentSnapshot: { snapshotId: "snapshot", snapshotNumber: 1, ...pair },
  runtimeRevision: 1,
};
const roster = {
  memberships: [
    {
      membershipId: "member",
      displayName: "Mira",
      role: "player",
      status: "active",
    },
  ],
  invitations: [],
  characters: [
    {
      characterId: "character",
      name: "Tamsin",
      playerName: "Mira",
      playerMembershipId: "member",
      status: "active",
      sheetStatus: "in-progress",
      readiness: "ready",
    },
  ],
  agents: [],
};
await withFixture(async (url) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  let failWorldRead = true;
  const errors = [],
    unexpected = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.route("**/fixture", (r) =>
    r.fulfill({ json: { instance, definition, draft } }),
  );
  let openingPreparation = {
    startingContext: "Meet at the quay.",
    mapVariations: "",
  };
  let openingRevision = 1;
  let invitationSubmission;
  let characterSubmission;
  let editedCharacter = {
    characterId: "character",
    name: "Tamsin",
    revision: 1,
    status: "in-progress",
    heritageDefinitionIds: [],
    attributeRolls: [],
    attributeAssignments: {},
    startingEquipmentIds: [],
    imageAssetIds: {},
  };
  let portraitCalls = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    requests.push(path);
    let value;
    if (path.endsWith("/character-options")) {
      value = {
        backgrounds: [],
        professions: [{ id: "scholar", name: "Scholar" }],
        heritages: [],
        attributes: [
          { id: "might", name: "Might" },
          { id: "agility", name: "Agility" },
        ],
        attributeRollCount: 4,
        equipmentSlots: [{ id: "hand", name: "Hand" }],
        startingEquipment: [
          {
            id: "lamp",
            name: "Investigator lamp",
            compatibleSlotSets: [["hand"]],
          },
        ],
      };
    } else if (path.endsWith("/characters/character/draft/attribute-rolls")) {
      assert.equal(
        route.request().postDataJSON().expectedRevision,
        editedCharacter.revision,
      );
      editedCharacter = {
        ...editedCharacter,
        revision: editedCharacter.revision + 1,
        attributeRolls: [80, 70, 60, 50],
        attributeAssignments: {},
      };
      value = editedCharacter;
    } else if (path.endsWith("/characters/character/draft/artwork")) {
      assert.ok(route.request().headers()["idempotency-key"]);
      portraitCalls++;
      value = { assetId: `generated-${route.request().postDataJSON().role}` };
    } else if (
      path.includes("/media/generated-") &&
      path.endsWith("/download")
    ) {
      value = {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>',
          ),
      };
    } else if (path.endsWith("/characters/character/draft")) {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        assert.equal(body.expectedRevision, editedCharacter.revision);
        editedCharacter = {
          ...editedCharacter,
          ...body,
          revision: editedCharacter.revision + 1,
        };
      }
      value = editedCharacter;
    } else if (
      path.endsWith("/invitations") &&
      route.request().method() === "POST"
    ) {
      invitationSubmission = route.request().postDataJSON();
      value = {};
    } else if (
      path.endsWith("/characters") &&
      route.request().method() === "POST"
    ) {
      characterSubmission = route.request().postDataJSON();
      value = {};
    } else if (path.endsWith("/roster")) {
      await new Promise((r) => setTimeout(r, 100));
      value = roster;
    } else if (path === "/players") value = { items: [], total: 0 };
    else if (path.endsWith("/actions/validate"))
      value = { readyToActivate: true, checks: [] };
    else if (path.endsWith("/continuation"))
      value = { enabled: false, kind: "plan-session", label: "Plan Session" };
    else if (path.endsWith("/runtime/preparation")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        assert.equal(body.expectedRuntimeRevision, openingRevision);
        openingPreparation = body.preparation;
        openingRevision++;
      }
      value = {
        runtimeRevision: openingRevision,
        preparation: openingPreparation,
        locations: [
          { id: "location", name: "Old Quay" },
          { id: "yard", name: "Scotland Yard" },
        ],
      };
    } else if (path.endsWith("/agents/available")) value = { items: [] };
    else if (path.endsWith("/plots")) value = { runtimeRevision: 1, roots: [] };
    else if (path.endsWith("/placements"))
      value = { runtimeRevision: 1, items: [], replacementOptions: [] };
    else if (path.endsWith("/creature-embodiments") || path.endsWith("/actors"))
      value = { runtimeRevision: 1, items: [], locations: [] };
    else if (path.endsWith("/sessions"))
      value = { current: [], planned: [], history: [] };
    else if (path.endsWith("/snapshots"))
      value = {
        items: [
          {
            snapshotId: "snapshot",
            snapshotNumber: 1,
            current: true,
            reason: "created",
            adoptedAt: "2026-09-05",
            ...pair,
          },
        ],
        migrationAvailable: false,
        migrationTargets: [],
      };
    else if (path === "/campaigns")
      value = {
        items: [{ ...definition, currentRevision: revision }],
        total: 1,
      };
    else if (path === "/campaigns/campaign") value = definition;
    else if (path === "/worlds")
      value = {
        items: [{ ...world, currentRevision: world.revisions[0] }],
        total: 1,
      };
    else if (path === "/worlds/world") {
      if (failWorldRead) {
        failWorldRead = false;
        return route.fulfill({
          status: 503,
          json: { message: "Fixture unavailable" },
        });
      }
      value = world;
    } else if (path.endsWith("/characters"))
      value = { campaignInstanceName: instance.name, items: [] };
    else if (path === "/auth/providers/me")
      value = { auth0: { configured: false, linked: false } };
    else {
      unexpected.push(path);
      return route.fulfill({
        status: 404,
        json: { message: "Unexpected fixture request" },
      });
    }
    return route.fulfill({ json: value });
  });
  const views = [
    ["Instance roster", "Roster", "People"],
    ["Instance roster/agents", "Agents", "Configured Agents"],
    ["Instance overview", "Friday campaign", "Instance preparation"],
    ["Instance plots", "Plots & staging", "No captured Plots are available."],
    ["Instance placements", "Placements", "Creature embodiments"],
    ["Instance sessions", "Sessions", "Plan Session"],
    ["Instance versions", "Versions & migrations", "Snapshot history"],
    ["Definition overview", "Overview", ""],
    ["Definition plots", "Plots", ""],
    ["Definition placements", "Placements", ""],
    ["Definition preparation", "Preparation defaults", ""],
    ["Definition versions", "Versions", ""],
    ["Definition versions/migrate", "World migration", ""],
    ["Create Instance", "Create Campaign Instance", ""],
    ["Create Definition", "Create campaign", ""],
    ["Player Characters", "", "Create another character"],
  ];
  const covered = [];
  try {
    await page.goto(url);
    for (const [label, heading, ready] of views) {
      await page
        .getByRole("navigation", { name: "View regression" })
        .getByRole("link", { name: label, exact: true })
        .click();
      if (heading)
        await page
          .getByRole("heading", { name: heading, exact: true })
          .first()
          .waitFor();
      if (label === "Definition plots") {
        assert.equal(
          await page.locator("main form").count(),
          0,
          "Plot list has no embedded editor",
        );
        await page.getByRole("link", { name: "Add Plot", exact: true }).click();
        await page
          .getByRole("heading", { name: "Add Plot", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Save Plot", exact: true })
            .count(),
          1,
        );
        assert.equal(
          await page.getByRole("textbox", { name: /Objectives/ }).count(),
          0,
        );
        await page
          .getByRole("navigation", { name: "View regression" })
          .getByRole("link", { name: label, exact: true })
          .click();
      }
      if (ready) await page.getByText(ready, { exact: true }).first().waitFor();
      await page.waitForTimeout(180);
      if (label === "Instance overview") {
        const starting = page.getByRole("combobox", {
          name: "Starting Location",
          exact: true,
        });
        await starting.selectOption("yard");
        await page
          .getByRole("button", {
            name: "Save Instance preparation",
            exact: true,
          })
          .click();
        await page
          .getByText("Instance preparation saved.", { exact: true })
          .waitFor();
        assert.equal(openingPreparation.startingLocationId, "yard");
        assert.equal(openingPreparation.startingContext, "Meet at the quay.");
        const nav = page.getByRole("navigation", { name: "View regression" });
        await nav
          .getByRole("link", { name: "Instance roster", exact: true })
          .click();
        await nav
          .getByRole("link", { name: "Instance overview", exact: true })
          .click();
        await starting.waitFor();
        assert.equal(await starting.inputValue(), "yard");
      }
      if (label === "Definition versions/migrate") {
        await page
          .getByText(
            "World revisions could not be loaded. Try again to review migration targets.",
            { exact: true },
          )
          .waitFor();
        await page
          .getByRole("button", { name: "Retry World revisions", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Retry World revisions", exact: true })
          .waitFor({ state: "hidden" });
      }
      if (errors.length) throw new Error(label + ": " + errors.join("\n"));
      if (unexpected.length)
        throw new Error("Unmocked API paths " + unexpected.join(", "));
      if (
        await page
          .getByText(
            /could not be loaded|Something went wrong|Rendered more hooks/,
          )
          .count()
      )
        throw new Error(label + " shows a load failure");
      if (label === "Instance roster") {
        await page
          .getByRole("textbox", { name: "Name", exact: true })
          .fill("Fixture Invitee");
        await page
          .getByRole("textbox", { name: "Email", exact: true })
          .fill("fixture@example.invalid");
        await page
          .getByRole("button", { name: "Send invitation", exact: true })
          .click();
        await page.waitForFunction(() =>
          [...document.querySelectorAll("input")].some(
            (input) => input.type === "email" && input.value === "",
          ),
        );
        assert.equal(invitationSubmission.invitedName, "Fixture Invitee");
        await page
          .getByRole("textbox", { name: "Character name", exact: true })
          .fill("Opening investigator");
        await page
          .getByRole("combobox", { name: "Player", exact: true })
          .selectOption("member");
        await page
          .getByRole("button", { name: "Create draft", exact: true })
          .click();
        await page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            response.url().endsWith("/roster"),
        );
        assert.equal(characterSubmission.name, "Opening investigator");
        assert.equal(characterSubmission.playerMembershipId, "member");
        await page.getByText("Tamsin", { exact: true }).waitFor();
        await page.screenshot({
          path: "/tmp/aow-campaign-roster.png",
          fullPage: true,
        });
        await page
          .getByRole("link", { name: "Edit Character", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "Name your character and tell their story",
            exact: true,
          })
          .waitFor();
        await page
          .getByRole("textbox", { name: "Biography", exact: true })
          .fill("An investigator at Scotland Yard.");
        await page
          .getByRole("button", { name: "Save for later", exact: true })
          .click();
        await page
          .getByText("Choices saved. You can safely return later.")
          .waitFor();
        assert.equal(
          editedCharacter.biography,
          "An investigator at Scotland Yard.",
        );
        await page
          .getByRole("button", { name: "4. Attributes", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Generate rolls", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Might", exact: true })
          .selectOption("80");
        await page
          .getByRole("combobox", { name: "Agility", exact: true })
          .selectOption("70");
        await page
          .getByRole("button", { name: "5. Equipment", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Equip · Hand", exact: true })
          .click();
        await page
          .getByRole("button", { name: "6. Artwork", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Shared art direction", exact: true })
          .fill("Victorian investigator in a dark coat");
        for (const label of ["portrait", "overhead token", "side-on token"]) {
          await page
            .getByRole("button", { name: `Generate ${label}`, exact: true })
            .click();
          await page
            .getByRole("button", { name: `Use ${label}`, exact: true })
            .waitFor();
          assert.deepEqual(editedCharacter.imageAssetIds, {});
          await page
            .getByRole("button", { name: `Use ${label}`, exact: true })
            .click();
        }
        await page
          .getByRole("button", { name: "Save for later", exact: true })
          .click();
        await page
          .getByText("Choices saved. You can safely return later.")
          .waitFor();
        assert.deepEqual(editedCharacter.attributeAssignments, {
          might: 80,
          agility: 70,
        });
        assert.deepEqual(editedCharacter.startingEquipmentIds, ["lamp"]);
        assert.deepEqual(editedCharacter.imageAssetIds, {
          portrait: "generated-portrait",
          overheadToken: "generated-overheadToken",
          paperDollToken: "generated-paperDollToken",
        });
        assert.deepEqual(editedCharacter.equipmentAssignments, {
          lamp: ["hand"],
        });
        assert.equal(portraitCalls, 3);
        await page
          .getByRole("link", { name: "← All characters", exact: true })
          .click();
        await page
          .getByRole("link", { name: "Edit Character", exact: true })
          .click();
        await page
          .getByRole("button", { name: "4. Attributes", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("combobox", { name: "Might", exact: true })
            .inputValue(),
          "80",
        );
        await page
          .getByRole("button", { name: "5. Equipment", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Unequip", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "6. Artwork", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "Submit for review", exact: true })
            .isDisabled(),
          true,
        );
        await page
          .getByRole("link", { name: "← All characters", exact: true })
          .click();
        // Exercise the real roster link across the child route boundary.
        await page
          .getByRole("link", { name: "Manage Agents", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Agents", exact: true })
          .waitFor();
      }
      if (label === "Create Instance") {
        await page
          .getByRole("combobox", { name: /^Campaign Definition/ })
          .selectOption("campaign");
        await page
          .getByRole("combobox", { name: /^Published revision/ })
          .selectOption("campaign-snapshot");
        await page
          .getByText("Captured compatible pair", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: /^Campaign Definition/ })
          .selectOption("");
      }
      if (label === "Create Definition") {
        await page
          .getByRole("combobox", { name: /^World/ })
          .selectOption("world");
        await page
          .getByRole("combobox", { name: /^Published revision/ })
          .selectOption("world-snapshot");
        await page.getByRole("combobox", { name: /^World/ }).selectOption("");
      }
      covered.push(label);
    }
    await page.screenshot({
      path: "/tmp/aow-campaign-views.png",
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        passed: true,
        covered,
        readPaths: [...new Set(requests)],
      }),
    );
  } catch (e) {
    console.log("Covered", covered, "Errors", errors, "Unexpected", unexpected);
    console.log((await page.locator("body").innerText()).slice(0, 6000));
    throw e;
  } finally {
    await browser.close();
  }
});
