import test from "node:test";
import assert from "node:assert/strict";
import {resolveSmartCompendiums,mechanicalDifferences} from "../scripts/importer/compat/smart-compendium.js";
import {findItemConflicts,auditActorDuplicates} from "../scripts/importer/v9/import-review.js";
const uuid="Compendium.dnd5e.spells.Item.abc";
const native={_id:"abc",name:"Mage Armor",type:"spell",system:{identifier:"mage-armor",source:{rules:"2024"},activities:{a:{type:"utility"}},uses:{max:"1",spent:0}},effects:[]};
const doc={documentName:"Item",toObject:()=>structuredClone(native)};
const resolveUuid=async()=>doc;
const pack={documentName:"Item",collection:"dnd5e.spells",getIndex:async()=>[{_id:"abc",name:"Mage Armor",type:"spell",system:{identifier:"mage-armor",source:{rules:"2024"}}}],getDocument:async()=>doc};
test("exact source copies native mechanics without reusing compendium ID",async()=>{
 const source={name:"Armadura Arcana",type:"spell",_stats:{compendiumSource:uuid}};
 const r=await resolveSmartCompendiums([source],{packs:[],resolveUuid});
 assert.equal(r.report[0].status,"rehydrated");assert.deepEqual(r.items[0].system.activities,native.system.activities);assert.equal(r.items[0]._id,undefined);
});
test("modified legacy source preserves mechanics and effects",async()=>{
 const source={...structuredClone(native),_stats:{compendiumSource:uuid,systemVersion:"5.3.0"}};
 source.system.activities.a.damage={parts:["2d8"]};source.effects=[{name:"Custom"}];
 const r=await resolveSmartCompendiums([source],{packs:[],resolveUuid});
 assert.deepEqual(r.items[0],source);assert.equal(r.report[0].status,"modified-preserved");assert.deepEqual(r.report[0].differences,["system.activities","effects"]);
});
test("name alone produces candidate; explicit official bilingual source is reusable",async()=>{
 const source={name:"Armadura Arcana",type:"spell"};
 let r=await resolveSmartCompendiums([source],{packs:[pack]});assert.equal(r.report[0].status,"candidate");assert.deepEqual(r.items[0],source);
 r=await resolveSmartCompendiums([{...source,jarvis:{provenance:{kind:"official-system",rules:"2024"}}}],{packs:[pack]});assert.equal(r.report[0].status,"rehydrated");
});
test("ambiguous packs and index failures do not overwrite",async()=>{
 const source={name:"Mage Armor",type:"spell"};
 const r=await resolveSmartCompendiums([source],{packs:[pack,{...pack,collection:"other.spells"},{...pack,collection:"broken",getIndex:async()=>{throw Error("offline")}}]});
 assert.equal(r.report[0].status,"ambiguous");assert.equal(r.indexErrors.length,1);assert.deepEqual(r.items[0],source);
});
test("spent charges do not count as modifications",()=>{const source=structuredClone(native);source.system.uses.spent=1;assert.deepEqual(mechanicalDifferences(source,native),[]);});
test("bilingual and UUID duplicate matching preserves explicit distinct variants",()=>{
 assert.equal(findItemConflicts([{name:"Armadura Arcana",type:"spell",_id:"b"}],[{name:"Mage Armor",type:"spell",_id:"a"}]).length,1);
 assert.equal(findItemConflicts([{name:"Custom renamed",type:"spell",_stats:{compendiumSource:uuid}}],[{name:"Mage Armor",type:"spell",_stats:{compendiumSource:uuid}}]).length,1);
 assert.equal(findItemConflicts([{name:"Custom renamed",type:"spell",_stats:{compendiumSource:uuid},jarvis:{provenance:{kind:"official-modified"}}}],[{name:"Mage Armor",type:"spell",_stats:{compendiumSource:uuid}}]).length,0);
});

test("explicit official skeletal item blocks when the source is unavailable",async()=>{
 const r=await resolveSmartCompendiums([{name:"Absent",type:"feat",jarvis:{provenance:{kind:"official-system"}}}],{packs:[]});
 assert.equal(r.report[0].requiresReview,true);
});
test("partial indexes do not make an automatic unique selection",async()=>{
 const source={name:"Mage Armor",type:"spell",jarvis:{provenance:{kind:"official-system"}}};
 const r=await resolveSmartCompendiums([source],{packs:[pack,{...pack,collection:"broken",getIndex:async()=>{throw Error("offline")}}]});
 assert.equal(r.report[0].status,"ambiguous");assert.equal(r.report[0].requiresReview,true);
});
test("audit reports potential duplicate pairs without changing existing items",()=>{
 const actor={id:"actor",name:"Test",documentName:"Actor",items:[{...structuredClone(native),id:"one"},{...structuredClone(native),id:"two",name:"Armadura Arcana"}]};
 const before=structuredClone(actor);
 const r=auditActorDuplicates(actor);assert.equal(r.readOnly,true);assert.equal(r.pairs.length,1);assert.deepEqual(actor,before);
});
