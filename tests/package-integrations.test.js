import test from "node:test";
import assert from "node:assert/strict";
import {preparePackageIntegrations,resolveImportedCombos,verifyImportedBindings} from "../scripts/importer/package-integrations.js";
import {validateJarvisActorPayload} from "../scripts/importer/validators/payload-validator.js";
import {resolveEmbeddedEffect} from "../scripts/automation/embedded-effect-engine.js";
const E="effect0000000001", A="activity00000001";
const actor={schemaVersion:"9.0",actor:{name:"Orgulho",type:"npc",jarvis:{abilities:{str:20,dex:16,con:20,int:14,wis:18,cha:20},hp:{value:100,max:100},ac:20}},items:[{name:"Proteção",type:"feat",effects:[{_id:E,name:"Escudo",transfer:false,changes:[]}],jarvis:{activities:[{_id:A,name:"Invocar",type:"utility"}]}}]};
const combo={name:"Decreto",initiator:"Orgulho",participants:[{actor:"Orgulho",cost:"action"},{actor:"Ira",cost:"reaction"}],activity:{item:"Proteção",activity:"Invocar"}};
const binding={actor:"Orgulho",item:"Proteção",activity:"Invocar",effectId:E};
const pkg={actors:[actor],synergyCombos:[combo],effectBindings:[binding]};
const world=[{id:"ira",name:"Ira"}];
test("package integrates declared effects and private combo without modifying source",()=>{
 const before=JSON.stringify(pkg),r=preparePackageIntegrations(pkg,world);
 assert.equal(r.combos[0].visibility,"gm");assert.equal(r.combos[0].participants[1].existingId,"ira");
 const config=r.actors[0].items[0].jarvis.activities[0].automation;
 assert.deepEqual(config,{effects:[{effectId:E,target:"self",replace:true,strict:true}]});
 validateJarvisActorPayload(r.actors[0]);assert.equal(JSON.stringify(pkg),before);
});
test("invalid and ambiguous references and script-like integration keys are rejected",()=>{
 for(const p of [{...pkg,synergyCombos:[{...combo,visibility:"owners"}]},{...pkg,effectBindings:[{...binding,post:"return 1"}]},{...pkg,effectBindings:[{...binding,effectId:"missing000000000"}]},{...pkg,synergyCombos:[{...combo,participants:[{actor:"Orgulho",cost:"action"},{actor:"Ira",cost:"invalid"}]}]}])assert.throws(()=>preparePackageIntegrations(p,world));
 assert.throws(()=>preparePackageIntegrations(pkg,[]),/ausente/);
 assert.throws(()=>preparePackageIntegrations(pkg,[...world,{id:"another",name:"Ira"}]),/ambíguo/);
 const p=structuredClone(pkg);p.actors[0].items[0].jarvis.activities[0].type="attack";
 assert.throws(()=>preparePackageIntegrations(p,world),/utility/);
});
test("resolved IDs refer to newly created actor/activity; persisted effect is checked",()=>{
 const r=preparePackageIntegrations(pkg,world);
 const activity={id:A,name:"Invocar",use(){},flags:{"fora-do-abismo-foundry":{automation:r.actors[0].items[0].jarvis.activities[0].automation}}};
 const item={id:"item",name:"Proteção",system:{activities:new Map([[A,activity]])},effects:[{id:E,transfer:false}]};
 const created=[{id:"pride",name:"Orgulho",items:[item]}];
 const [c]=resolveImportedCombos(r.combos,created,world);
 assert.equal(c.initiatorId,"pride");assert.equal(c.participants[1].actorId,"ira");assert.deepEqual(c.activity,{itemId:"item",activityId:A});
 verifyImportedBindings(r.bindings,created);
 assert.throws(()=>resolveImportedCombos(r.combos,created,[{id:"replacement",name:"Ira"}]),/mudou/);
 delete activity.flags;assert.throws(()=>verifyImportedBindings(r.bindings,created),/não persistiu/);
});
test("strict embedded effect binding never falls back to an unrelated effect",()=>{
 const unrelated={id:"other",name:"Outro"};
 const effects=new Map([[unrelated.id,unrelated]]);effects.contents=[unrelated];
 const activity={item:{name:"Proteção",effects}};
 assert.throws(()=>resolveEmbeddedEffect(activity,{effectId:E,strict:true}),/removido/);
 assert.equal(resolveEmbeddedEffect(activity,{effectId:E}),unrelated);
});
