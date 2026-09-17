import { buildSnapshotManifest } from "../domain/snapshot-manifest";
import { initializeEmptyLegacyInstanceRuntime } from "./campaign-instances.service";
const captured = () => ({
  manifest: buildSnapshotManifest(1,[{resourceType:"campaign-definition-revision",sourceId:"campaign",payload:{}}]),
  campaignDefinitionRevision:{content:{}},
  capturedWorldSnapshot:{manifest:buildSnapshotManifest(1,[{resourceType:"creatures",sourceId:"legacy",payload:{name:"Preserved legacy Creature"}}])},
});
it("adds only canonical scaffold to an empty archive while retaining null evidence and snapshots",()=>{
  const selected=captured();
  const before=JSON.stringify(selected);
  expect(initializeEmptyLegacyInstanceRuntime(selected,"instance",{legacyGamePayload:null},{})).toEqual({formatVersion:1,preparation:{},plotProgress:[],placementRealizations:[],creatureEmbodiments:[],itemInstances:[],legacyGamePayload:null});
  expect(JSON.stringify(selected)).toBe(before);
});
it.each([{legacyGamePayload:{}},{legacyGamePayload:null,preparation:{}},{},null])("refuses nonempty or already canonical state %#",state=>{
  expect(()=>initializeEmptyLegacyInstanceRuntime(captured(),"instance",state,{})).toThrow("Only an empty legacy runtime");
});
it("refuses additional extension state and malformed captures",()=>{
  expect(()=>initializeEmptyLegacyInstanceRuntime(captured(),"instance",{legacyGamePayload:null},{evidence:true})).toThrow();
  expect(()=>initializeEmptyLegacyInstanceRuntime({...captured(),manifest:{}},"instance",{legacyGamePayload:null},{})).toThrow();
});
