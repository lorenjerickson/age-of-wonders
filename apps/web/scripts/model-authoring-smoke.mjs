import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
async function withFixture(run) {
  const name = `model-authoring-smoke-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.MODEL_AUTHORING_TEST_PORT || 5215);
  const fixtureUrl = `http://127.0.0.1:${port}/${name}.html`;
  let server,
    output = "";
  try {
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Item Action outcomes test</title></head><body><div id="root"></div><script type="module" src="/src/${name}.tsx"></script></body></html>`,
    );
    await writeFile(
      component,
      `import { createRoot } from 'react-dom/client';
import { WorldAuthoringProvider } from './WorldAuthoringShell';
import { WorldModelEditor } from './WorldModelEditor';
import { WorldModelStructureEditor } from './WorldModelStructureEditor';
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, useLocation } from '@tanstack/react-router';
import './index.css';
const draft = await fetch('/fixture-draft').then(r=>r.json());
function Content() {
  const parts = useLocation().pathname.split('/');
  const kind = parts[5], context = parts[6];
  return kind === 'structure' ? <WorldModelStructureEditor key={context} context={context}/> : <WorldModelEditor key={kind+'/'+context} kind={kind} context={context}/>;
}
const root = createRootRoute({component: () => <WorldAuthoringProvider definition={{id:'world',name:'Mechanics test',status:new URLSearchParams(location.search).has('readonly')?'archived':'active',createdAt:'2026-09-11',updatedAt:'2026-09-11',revisions:[]}} initialDraft={draft}><Content/></WorldAuthoringProvider>});
const catchAll = createRoute({getParentRoute:()=>root,path:'$'});
const route = new URLSearchParams(location.search).get('route') || '/worlds/world/item-compendium/items/subject/owner';
const router = createRouter({routeTree:root.addChildren([catchAll]),history:createMemoryHistory({initialEntries:[route]})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
    );
    await writeFile(
      config,
      `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; export default defineConfig({plugins:[react(),tailwindcss()],appType:'mpa',server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null}});`,
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
  }
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
// Production pages and routing against disposable authoritative HTTP persistence.
// This checks browser interaction; database/auth integration is checked separately.
await withFixture(async (fixtureUrl) => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(10000);
      page.on("dialog", (d) => d.accept());
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      let sequence = 1,
        failNext = 0,
        failDraft = 0,
        writes = 0;
      const registry = {
        identity: { id: "registry" },
        provenance: { kind: "gm" },
        name: "Custom Models",
        elements: [],
        releases: [
          {
            identity: { id: "release-1", lineageId: "registry" },
            name: "Original",
          },
        ],
      };
      const element = (id, kind, role, label, payload) => ({
        id,
        registryId: "registry",
        key: "custom:" + id,
        kind,
        semanticRole: role,
        currentRevision: {
          identity: { id: id + "-revision", revisionNumber: 1 },
          presentation: { label, privateLabel: true },
          payload,
          dependencies: [],
        },
      });
      registry.elements = [
        element("concept", "concept", "custom:concept", "Creature", {
          kind: "concept",
          privateData: { value: 7 },
        }),
        element(
          "attribute-vocab",
          "vocabulary",
          "aow:attribute-registry",
          "Attributes",
          { kind: "vocabulary" },
        ),
        element(
          "slot-vocab",
          "vocabulary",
          "aow:equipment-slot-registry",
          "Equipment slots",
          { kind: "vocabulary" },
        ),
        element(
          "rank-vocab",
          "vocabulary",
          "aow:profession-rank-registry",
          "Profession ranks",
          { kind: "vocabulary" },
        ),
        element("attribute", "vocabulary-option", "aow:attribute", "Might", {
          kind: "vocabulary-option",
          vocabularyId: "attribute-vocab",
          valueMetadata: {
            "aow:minimum": 0,
            "aow:maximum": 100,
            "aow:default": 50,
            private: 3,
          },
        }),
      ];
      const response = () => ({
        releases: [
          {
            id: registry.releases[0].identity.id,
            registryId: "registry",
            name: "Models",
            registryName: "Custom Models",
            revisionNumber: sequence,
          },
        ],
        elements: registry.elements,
        attributes: registry.elements.filter(
          (e) => e.semanticRole === "aow:attribute",
        ),
        equipmentSlots: registry.elements.filter(
          (e) => e.semanticRole === "aow:equipment-slot",
        ),
        professionRanks: registry.elements.filter(
          (e) => e.semanticRole === "aow:profession-rank",
        ),
      });
      const project = (e) => ({
        key: e.key,
        kind: e.kind,
        name: e.currentRevision.presentation.label,
        elementId: e.id,
        registryId: e.registryId,
        semanticRole: e.semanticRole,
        payload: e.currentRevision.payload,
        presentation: e.currentRevision.presentation,
        revisionId: e.currentRevision.identity.id,
      });
      const effective = () => {
        const r = response();
        return {
          ...r,
          attributes: r.attributes.map(project),
          equipmentSlots: r.equipmentSlots.map(project),
          professionRanks: r.professionRanks.map(project),
          elements: r.elements.map(project),
          itemFamilies: [],
        };
      };
      const draft = {
        id: "draft",
        storageRevision: 1,
        revisionName: "Models",
        status: "current",
        records: [],
        content: { modelSchemaReleaseIds: ["release-1"], private: true },
        effectiveModels: effective(),
      };
      await page.route("**/fixture-draft", (r) =>
        r.fulfill({ json: { ...draft, effectiveModels: effective() } }),
      );
      await page.route("**/api/**", async (r) => {
        const url = r.request().url();
        if (r.request().method() === "GET")
          return r.fulfill({
            json: url.endsWith("/model-registries")
              ? { items: [registry], total: 1 }
              : url.endsWith("/model-adoptions")
                ? response()
                : registry,
          });
        const input = r.request().postDataJSON();
        writes++;
        if (failNext) {
          const status = failNext;
          failNext = 0;
          return r.fulfill({ status, json: { message: "Fixture failure" } });
        }
        if (url.endsWith("/releases")) {
          assert.equal(
            input.predecessorRevisionId,
            registry.releases[0].identity.id,
          );
          const old = registry.releases[0].identity.id;
          sequence++;
          for (const e of input.elements ?? [])
            registry.elements.push(
              element(
                "new-" + sequence,
                e.kind,
                e.semanticRole,
                e.presentation.label,
                e.payload,
              ),
            );
          for (const rev of input.revisions ?? []) {
            const e = registry.elements.find((e) => e.id === rev.elementId);
            assert.equal(
              e.currentRevision.identity.id,
              rev.predecessorRevisionId,
            );
            e.currentRevision = {
              ...rev,
              identity: {
                id: e.id + "-revision-" + sequence,
                revisionNumber: sequence,
              },
            };
          }
          registry.elements = registry.elements.filter(
            (e) => !input.archiveElementIds?.includes(e.id),
          );
          const release = {
            identity: {
              id: "release-" + sequence,
              lineageId: "registry",
              predecessorRevisionId: old,
            },
            name: input.name,
          };
          registry.releases.unshift(release);
          return r.fulfill({ json: { release } });
        }
        if (failDraft) {
          const status = failDraft;
          failDraft = 0;
          return r.fulfill({ status, json: { message: "Adoption failed" } });
        }
        assert.ok(url.endsWith("/worlds/world/draft"));
        assert.equal(input.expectedStorageRevision, draft.storageRevision);
        draft.content = input.content;
        draft.records = input.records;
        draft.storageRevision++;
        return r.fulfill({ json: draft });
      });
      const open = async (kind, context = "effective", extra = "") => {
        await page.goto(
          fixtureUrl +
            "?route=" +
            encodeURIComponent(
              "/worlds/world/characters/model/" + kind + "/" + context,
            ) +
            extra,
        );
        await page.locator("main").waitFor();
        if (context !== "effective" && context !== "new" && !extra)
          await page.waitForFunction(
            () => document.querySelector("input")?.value.length > 0,
          );
      };
      const button = (name) => page.getByRole("button", { name, exact: true });
      const link = (name) => page.getByRole("link", { name, exact: true });
      const field = (name) => page.getByRole("textbox", { name, exact: true });
      await open("attributes");
      assert.equal(await field("Display name").count(), 0);
      await link("Add Attribute").click();
      await field("Display name").fill("Grace");
      await button("Publish and adopt").click();
      await link("Add Attribute").waitFor();
      assert.ok(
        registry.elements.some(
          (e) => e.currentRevision.presentation.label === "Grace",
        ),
      );
      await open("attributes", "attribute");
      await field("Display name").fill("Might revised");
      await button("Publish revision and adopt").click();
      await link("Add Attribute").waitFor();
      assert.equal(
        registry.elements.find((e) => e.id === "attribute").currentRevision
          .payload.valueMetadata.private,
        3,
      );
      for (const kind of ["equipment-slots", "profession-ranks"]) {
        await open(kind, "new");
        await field("Display name").fill(
          kind === "equipment-slots" ? "Wings" : "Initiate",
        );
        await button("Publish and adopt").click();
        await page.getByRole("link", { name: /^Add / }).waitFor();
      }
      for (const kind of ["concept", "field", "relationship"]) {
        await open("structure", "new");
        await page
          .getByRole("combobox", { name: "Element kind", exact: true })
          .selectOption(kind);
        await field("Display name").fill("New " + kind);
        if (kind === "field")
          await page
            .getByRole("combobox", { name: "Owning Concept", exact: true })
            .selectOption("concept");
        if (kind === "relationship") {
          await page
            .getByRole("combobox", { name: "Source Concept", exact: true })
            .selectOption("concept");
          await page
            .getByRole("combobox", { name: "Target Concept", exact: true })
            .selectOption("concept");
        }
        await button("Publish and adopt").click();
        await link("Add Model element").waitFor();
        assert.ok(
          registry.elements.some(
            (e) => e.currentRevision.presentation.label === "New " + kind,
          ),
        );
      }
      await open("structure", "concept");
      await field("Display name").fill("Creature revised");
      await button("Publish revision and adopt").click();
      await link("Add Model element").waitFor();
      assert.deepEqual(
        registry.elements.find((e) => e.id === "concept").currentRevision
          .payload.privateData,
        { value: 7 },
      );
      await open("structure", "concept");
      assert.equal(
        await field("Display name").inputValue(),
        "Creature revised",
      );
      await field("Display name").fill("Discarded");
      const before = writes;
      await button("Cancel").click();
      await link("Add Model element").waitFor();
      assert.equal(writes, before);
      await open("structure", "concept");
      await field("Display name").fill("Failure retained");
      failNext = 500;
      await button("Publish revision and adopt").click();
      await page
        .getByText("The structural Model change could not be published.")
        .first()
        .waitFor();
      assert.equal(
        await field("Display name").inputValue(),
        "Failure retained",
      );
      failNext = 409;
      await button("Publish revision and adopt").click();
      await page
        .getByText("The Model Registry changed. Reload and try again.")
        .first()
        .waitFor();
      assert.equal(
        await field("Display name").inputValue(),
        "Failure retained",
      );
      failDraft = 500;
      await button("Publish revision and adopt").click();
      await button("Adopt pending release").waitFor();
      const releaseCount = registry.releases.length;
      await button("Adopt pending release").click();
      await link("Add Model element").waitFor();
      assert.equal(registry.releases.length, releaseCount);
      assert.equal(
        draft.content.modelSchemaReleaseIds[0],
        registry.releases[0].identity.id,
      );
      await open("structure", "concept");
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const small = await page
        .locator("main button,main a,main input,main select,main textarea")
        .evaluateAll((cs) =>
          cs
            .filter((c) => {
              const b = c.getBoundingClientRect();
              return b.width && b.height && (b.width < 44 || b.height < 44);
            })
            .map((c) => c.textContent || c.tagName),
        );
      assert.deepEqual(small, []);
      await page.screenshot({
        path: "/tmp/aow-B04-model-editor-" + width + ".png",
        fullPage: true,
      });
      await open("structure");
      await page.screenshot({
        path: "/tmp/aow-B04-model-list-" + width + ".png",
        fullPage: true,
      });
      const archiveBefore = registry.releases.length;
      await page
        .getByRole("listitem")
        .filter({ hasText: "New relationship" })
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector("main")
            ?.textContent.includes("New relationship"),
      );
      assert.equal(registry.releases.length, archiveBefore + 1);
      const selectedConcept = registry.elements.find(
        (element) => element.id === "concept",
      );
      const originalPresentation = structuredClone(
        selectedConcept.currentRevision.presentation,
      );
      selectedConcept.currentRevision.presentation.label =
        "8d5eaf24-856e-4c97-90d0-8b236031af24";
      await open("structure", "concept");
      assert.equal(await field("Display name").count(), 0);
      await button("Replace display name").waitFor();
      assert.ok(
        !(await page.locator("main").innerText()).includes(
          selectedConcept.currentRevision.presentation.label,
        ),
      );
      await button("Replace display name").click();
      await field("Display name").fill("Safe name");
      await button("Cancel").click();
      selectedConcept.currentRevision.presentation = {
        ...originalPresentation,
        order: "malformed",
      };
      await open("structure", "concept");
      await page
        .getByText("This imported Model presentation is preserved read only.")
        .first()
        .waitFor();
      assert.ok(await button("Publish and adopt").isDisabled());
      selectedConcept.currentRevision.presentation = originalPresentation;
      await open("structure", "concept", "&readonly=1");
      assert.equal(await field("Display name").count(), 0);
      assert.ok((await page.locator("main").innerText()).includes("read only"));
      assert.deepEqual(errors, []);
      await page.close();
      console.log("Models desktop/mobile journey passed at " + width);
    }
  } finally {
    await browser.close();
  }
});
