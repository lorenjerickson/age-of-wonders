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
  join(tmpdir(), "aow-b10-instance-operations.png");
async function withFixture(run) {
  const name = `b10-instance-operations-${process.pid}`;
  const html = join(webRoot, `${name}.html`),
    component = join(webRoot, "src", `${name}.tsx`),
    config = join(webRoot, `${name}.config.ts`);
  const port = Number(process.env.B10_TEST_PORT || 5197);
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
      `// @ts-nocheck
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider,Outlet} from '@tanstack/react-router';
import {CampaignInstancePlotsPage,CampaignInstanceRosterPage,CampaignInstanceAgentsPage,CampaignInstanceSessionsPage} from './CampaignInstancePages';
import {CampaignInstanceProvider} from './CampaignInstanceWorkspace';
import {ActorEquipmentPanel} from './ActorEquipmentPanel';
import {SessionLocationPresentation} from './SessionLocationPresentation';
import './index.css';
const root=createRootRoute({component:()=> <CampaignInstanceProvider instance={{id:'instance',name:'Thursday Coast',campaignDefinitionId:'campaign',status:'active'}}><Outlet/></CampaignInstanceProvider>});
const base='/campaigns/instances/instance';
const plots=createRoute({getParentRoute:()=>root,path:base+'/plots',component:CampaignInstancePlotsPage});
const plot=createRoute({getParentRoute:()=>root,path:base+'/plots/$plotId',component:()=> <CampaignInstancePlotsPage selectedPlotId={plot.useParams().plotId}/>});
const members=createRoute({getParentRoute:()=>root,path:base+'/roster/members',component:()=> <CampaignInstanceRosterPage section="members"/>});
const member=createRoute({getParentRoute:()=>root,path:base+'/roster/members/$memberId',component:()=> <CampaignInstanceRosterPage section="members" selectedRecordId={member.useParams().memberId}/>});
const agents=createRoute({getParentRoute:()=>root,path:base+'/roster/agents',component:CampaignInstanceAgentsPage});
const agent=createRoute({getParentRoute:()=>root,path:base+'/roster/agents/$agentId',component:()=> <CampaignInstanceAgentsPage selectedParticipationId={agent.useParams().agentId}/>});
const sessions=createRoute({getParentRoute:()=>root,path:base+'/sessions',component:CampaignInstanceSessionsPage});
const planning=createRoute({getParentRoute:()=>root,path:base+'/sessions/new',component:()=> <CampaignInstanceSessionsPage planning/>});
const presentation=createRoute({getParentRoute:()=>root,path:'/presentation',component:()=> <SessionLocationPresentation campaignId="campaign" instanceId="instance" sessionId="session" runtimeRevision={4} location={{id:'room',name:'Harbor',weather:{condition:'Clear'},audiovisualEffects:[{id:'cue',assetId:'media',kind:'audio',name:'Harbor ambience',enabled:true,loop:true,volume:0.3}]}} onSaved={()=>{}}/>});
const item=createRoute({getParentRoute:()=>root,path:'/item',component:()=> <ActorEquipmentPanel campaignId="campaign" instanceId="instance" actorId="actor" selectedItemId="item"/>});
const router=createRouter({routeTree:root.addChildren([plots,plot,members,member,agents,agent,sessions,planning,presentation,item]),history:createMemoryHistory({initialEntries:[new URLSearchParams(location.search).get('path')||base+'/plots']})});
createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);
`,
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
import assert from "node:assert/strict";
let revision=1;
const plot={plotDefinitionId:'hidden-plot-id',name:'Harbor Mystery',status:'not-started',objectiveProgress:[{objectiveId:'one',objectiveName:'Find the bell',status:'not-started'},{objectiveId:'two',objectiveName:'Meet the keeper',status:'active'}],children:[],claims:[{id:'truth',kind:'truth',name:'The keeper hid the bell'}],revealedClaimIds:[],creatureKnowledge:[],actors:[{id:'entity',name:'Aster'}],locations:[{id:'context',name:'Harbor',placements:[]}]};
const roster={memberships:[{membershipId:'hidden-member-id',displayName:'River',role:'player',status:'active'}],invitations:[],characters:[],agents:[{participationId:'hidden-agent-id',name:'Scribe',status:'configured',observeCapabilities:['aow:event-stream'],actCapabilities:[]}]};
const writes=[];let quantity=1;
await withFixture(async url=>{
 const browser=await chromium.launch({executablePath:chromePath,headless:true,args:['--no-sandbox']});
 try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
   const page=await browser.newPage({viewport});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;if(req.postData())assert.match(req.headers()['content-type'] ?? '', /application\/json/);
    if(path.endsWith('/media/media/download'))return route.fulfill({json:{url:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='}});
    if(path.endsWith('/media/media'))return route.fulfill({json:{mimeType:'audio/wav',originalName:'Harbor ambience.wav'}});
    if(path.endsWith('/capabilities')){const body=req.postDataJSON();writes.push(body);Object.assign(roster.agents[0],{observeCapabilities:body.observe,actCapabilities:body.act,status:'configured'});return route.fulfill({json:roster});}
    if(path.includes('/equipment')){if(req.method() !== 'GET'){const body=req.postDataJSON();writes.push(body);if(body.quantity)quantity=body.quantity;}return route.fulfill({json:{runtimeRevision:4,actorName:'Aster',readOnly:false,slots:[],definitions:[],bonusActions:1,items:[{id:'item',name:'Lantern',quantity,locationLabel:'Carried',compatibleSlotSets:[]}]}});}
    if(req.method()==='PATCH' && path.endsWith('/table/weather')) {const body=req.postDataJSON();writes.push(body);return route.fulfill({json:{location:{id:'room',weather:body.weather}}});}
    if(path.includes('/plots/hidden-plot-id')) {const body=req.postDataJSON();writes.push(body);if(body.status)plot.status=body.status;if(body.objectiveProgress)for(const value of body.objectiveProgress)Object.assign(plot.objectiveProgress.find(o=>o.objectiveId===value.objectiveId),value);if(body.revealedClaimIds)plot.revealedClaimIds=body.revealedClaimIds;if(body.creatureKnowledge)plot.creatureKnowledge=body.creatureKnowledge.map(k=>({...k,creatureName:'Aster'}));revision++;return route.fulfill({json:{}});}
    if(path.endsWith('/plots'))return route.fulfill({json:{roots:[plot],runtimeRevision:revision}});
    if(path.endsWith('/roster'))return route.fulfill({json:roster});
    if(path.endsWith('/agents/available'))return route.fulfill({json:{items:[{agentId:'registered',name:'Scribe',status:'active'}]}});
    if(path.endsWith('/sessions'))return route.fulfill({json:{current:[],planned:[],history:[]}});
    if(path.endsWith('/players'))return route.fulfill({json:{items:[]}});
    return route.fulfill({json:{items:[],checks:[]}});
   });
   const go=path=>page.goto(url+'?path='+encodeURIComponent(path));
   const base='/campaigns/instances/instance';
   await go(base+'/plots');await page.getByRole('link',{name:'Harbor Mystery',exact:true}).click();
   await page.getByLabel('Objective notes').first().fill('Spoke with the keeper');await page.getByRole('heading',{name:'Discovery knowledge'}).click();
   await page.waitForFunction(()=>document.querySelector('textarea')?.value==='Spoke with the keeper');
   await page.getByLabel('Objective progress').first().selectOption('completed');
   await page.waitForTimeout(150);
   await page.getByLabel('Actor',{exact:true}).selectOption('entity');await page.getByLabel('Claim',{exact:true}).selectOption('truth');await page.getByRole('button',{name:'Record knowledge',exact:true}).click();
   await page.getByRole('button',{name:'Remove knowledge'}).waitFor();
   assert.equal(plot.objectiveProgress[1].status,'active');
   await go(base+'/plots/hidden-plot-id');await page.getByRole('heading',{name:'Discovery knowledge'}).waitFor();assert.equal(await page.getByLabel('Objective notes').first().inputValue(),'Spoke with the keeper');
   assert.equal(await page.locator('body').innerText().then(t=>t.includes('hidden-plot-id')),false);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
   await page.screenshot({path:`/tmp/aow-B10-plots-${viewport.width}.png`,fullPage:true});
   await go(base+'/roster/members');await page.getByRole('link',{name:'River',exact:true}).click();await page.getByLabel('River membership status').waitFor();
   await go(base+'/roster/agents');assert.equal(await page.getByText('Registered Agent',{exact:true}).count(),0);await page.getByRole('link',{name:'Scribe',exact:true}).click();await page.getByRole('button',{name:'Authorize',exact:true}).waitFor();await page.getByLabel('Observe capabilities',{exact:true}).fill('aow:presence');await page.getByRole('button',{name:'Save capabilities',exact:true}).click();await page.waitForTimeout(150);assert.deepEqual(roster.agents[0].observeCapabilities,['aow:presence']);
   await go(base+'/sessions');await page.getByRole('link',{name:'Plan a Session',exact:true}).click();await page.getByLabel('Session name').fill('Thursday');await page.getByRole('link',{name:'Cancel',exact:true}).click();assert.equal(await page.getByLabel('Session name').count(),0);
   await go('/presentation');await page.getByText('Weather and media',{exact:true}).click();await page.getByLabel('Condition',{exact:true}).fill('Rain');await page.getByRole('button',{name:'Save weather',exact:true}).click();await page.waitForTimeout(150);assert.equal(writes.at(-1).weather.condition,'Rain');
   await page.waitForFunction(()=>document.querySelector('audio')?.volume===0.3);assert.equal(await page.locator('audio').getAttribute('autoplay'),null);
   await go('/item');await page.getByRole('heading',{name:'Lantern'}).waitFor();await page.getByLabel('Item quantity').fill('2');await page.getByRole('button',{name:'Save quantity',exact:true}).click();await page.waitForTimeout(150);assert.equal(quantity,2);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('B10 desktop/mobile collection/detail, objective save/reload, knowledge, members, Agents, Session planning and weather passed.');
 }finally{await browser.close();}
});
