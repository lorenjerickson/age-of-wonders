import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignInstance } from '../dist/index.js';
const captured = { campaignInstanceId:'instance', campaignInstanceSnapshotId:'capture', capturedPlotObjectiveIds:new Map([['plot',new Set(['one','two'])]]), capturedLocationIds:new Set(['room']), capturedCampaignPlacementIds:new Set(['placement']), capturedWorldPlacementIds:new Set(), capturedCreaturePolicies:new Map() };
const state = () => ({formatVersion:1,preparation:{extensions:{private:true}},plotProgress:[{campaignInstanceId:'instance',plotDefinitionId:'plot',status:'not-started',objectiveProgress:[{objectiveId:'one',status:'not-started',private:1},{objectiveId:'two',status:'active'}],extensions:{secret:true}}], placementRealizations:[{identity:{id:'realization',version:{revision:1,updatedAt:'before'}},name:'Plan',campaignInstanceId:'instance',source:{kind:'campaign-placement',campaignPlacementDefinitionId:'placement'},sourceLocationId:'room',status:'planned'}],creatureEmbodiments:[],itemInstances:[],extensions:{private:1}});
const command = (owner,name,params) => owner.command(name,{initiator:'gm',context:{},params});
test('Instance progress patches preserve sibling objectives and private data, reject foreign objectives atomically', async()=>{
 const owner=CampaignInstance.deserializePayload(state(),{mode:'runtime',captured});
 const seen=[];owner.state$.subscribe(s=>seen.push(s));
 assert.equal((await command(owner,'plot',{plotDefinitionId:'plot',patch:{objectiveProgress:[{objectiveId:'one',status:'completed'}]}})).status,'committed');
 assert.deepEqual(owner.state.data.plotProgress[0].objectiveProgress,[{objectiveId:'one',status:'completed',private:1},{objectiveId:'two',status:'active'}]);
 const before=owner.serializePayload();
 await assert.rejects(command(owner,'plot',{plotDefinitionId:'plot',patch:{objectiveProgress:[{objectiveId:'foreign',status:'active'}]}}), /outside/);
 assert.deepEqual(owner.serializePayload(),before);assert.equal(seen.length,2);owner.dispose();
});
test('Placement defer/remove preserve underlying inventory and stable realization identity',async()=>{
 const input=state();input.itemInstances=[{id:'item',definitionId:'sword',quality:'standard',quantity:1,location:{kind:'location',locationId:'room'}}];
 const owner=CampaignInstance.deserializePayload(input,{mode:'runtime',captured});
 assert.equal((await command(owner,'placement',{realizationId:'realization',action:'realize',resolved:{realizedEntity:{kind:'item',runtimeItemId:'item'},itemInstances:input.itemInstances,creatureEmbodiments:[]}})).status,'committed');
 assert.equal((await command(owner,'placement',{realizationId:'realization',action:'remove'})).status,'committed');
 assert.equal(owner.state.data.itemInstances.length,1); assert.equal(owner.state.data.placementRealizations[0].identity.id,'realization');assert.equal(owner.state.data.placementRealizations[0].realizedEntity,undefined);owner.dispose();
});
test('Character activation realizes captured quality and equipment once, preserving approved private sheet',async()=>{
 const owner=CampaignInstance.deserializePayload(state(),{mode:'runtime',captured});
 const sheet={identity:{id:'hero'},campaignInstanceId:'instance',name:'Hero',startingEquipmentDefinitionIds:['sword'],equipmentAssignments:{},extensions:{private:42}};
 let id=0;const input={campaignInstanceId:'instance',updatedAt:'now',createId:()=>`generated-${++id}`,definitions:[{identity:{id:'sword'},kind:'item',components:{quality:'standard'}}],availableSlots:[]};
 assert.equal((await owner.activateCharacter(sheet,input,'gm')).status,'committed');
 assert.equal(owner.state.data.itemInstances[0].location.ownerId,'generated-1');
 assert.equal(owner.state.data.creatureEmbodiments[0].creature.extensions['aow:approvedCharacterSheet'].extensions.private,42);
 const before=owner.serializePayload();assert.equal((await owner.activateCharacter(sheet,input,'gm')).status,'unchanged');assert.deepEqual(owner.serializePayload(),before);owner.dispose();
});
test('Captured initialization suppresses decorated placement duplicates and allocates isolated runtime identities',()=>{
 const input={campaignInstanceId:'instance',campaignRecords:[{resourceType:'plots',sourceId:'plot',payload:{objectives:[{id:'one'},{id:'two'}]}},{resourceType:'campaign-placements',sourceId:'placement',payload:{kind:'world-decoration',capturedWorldPlacementId:'world-placement',locationId:'room',name:'Plan'}}],worldRecords:[{resourceType:'world-placements',sourceId:'world-placement',payload:{locationId:'room'}}],campaignContent:{},updatedAt:'now'};
 let n=0; const first=CampaignInstance.initialRuntime({...input,createId:()=>`id-${++n}`});const second=CampaignInstance.initialRuntime({...input,campaignInstanceId:'other',createId:()=>`id-${++n}`});assert.equal(first.placementRealizations.length,1);assert.notEqual(first.placementRealizations[0].identity.id,second.placementRealizations[0].identity.id);assert.equal(first.plotProgress[0].campaignInstanceId,'instance');assert.equal(second.plotProgress[0].campaignInstanceId,'other');
});
test('Location weather overrides are scoped, removable, and preserve captured defaults',async()=>{
 const owner=CampaignInstance.deserializePayload(state(),{captured});
 assert.equal((await command(owner,'locationWeather',{locationId:'room',weather:{condition:'Rain',temperatureCelsius:12}})).status,'committed');
 assert.equal(owner.state.data.locationPresentationOverrides[0].weather.condition,'Rain');
 await assert.rejects(command(owner,'locationWeather',{locationId:'foreign',weather:null}),/outside/);
 await assert.rejects(command(owner,'locationWeather',{locationId:'room',weather:{condition:'Rain',wind:{speedKph:-1}}}),/nonnegative/);
 await command(owner,'locationWeather',{locationId:'room',weather:null});assert.equal(owner.state.data.locationPresentationOverrides[0].weather,null);
 await command(owner,'locationWeather',{locationId:'room',reset:true});assert.deepEqual(owner.state.data.locationPresentationOverrides,[]);owner.dispose();
});
test('Discovery knowledge validates actor scope and truth versus belief, preserving private knowledge fields',async()=>{
 const input=state();input.creatureEmbodiments=[{campaignInstanceId:'instance',runtimeCreatureId:'hero',runtimeEntityId:'entity',source:{kind:'character',characterId:'hero'},creature:{identity:{id:'hero',version:{revision:1,updatedAt:'now'}},entityId:'entity',name:'Hero'}}];
 input.plotProgress[0].creatureKnowledge=[{kind:'knows-truth',creatureId:'entity',claimId:'truth',private:42}];
 const owner=CampaignInstance.deserializePayload(input,{captured,plots:[{sourceId:'plot',payload:{discoveries:[{id:'discovery',name:'Secret',truth:{id:'truth',statement:'The bell is missing'},beliefs:[],rumors:[]}]}}]});
 await assert.rejects(command(owner,'plot',{plotDefinitionId:'plot',patch:{creatureKnowledge:[{kind:'heard-rumor',creatureId:'entity',claimId:'truth'}]}}),/match/);
 await assert.rejects(command(owner,'plot',{plotDefinitionId:'plot',patch:{revealedClaimIds:['foreign']}}),/outside/);
 assert.equal((await command(owner,'plot',{plotDefinitionId:'plot',patch:{creatureKnowledge:[{kind:'knows-truth',creatureId:'entity',claimId:'truth',provenance:'Witness'}]}})).status,'committed');
 assert.equal(owner.state.data.plotProgress[0].creatureKnowledge[0].private,42);owner.dispose();
});
