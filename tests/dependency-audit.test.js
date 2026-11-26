import test from "node:test";
import assert from "node:assert/strict";
import {auditActorDependencies} from "../scripts/diagnostics/dependency-audit.js";
const make=(targets=[],effects=[],automation=null)=>({id:"actor",name:"Orgulho",system:{resources:{primary:{value:0,max:3}}},
  items:[{id:"attack",name:"Ataque",system:{identifier:"attack",uses:{max:1},activities:{a:{id:"a",name:"Activity",consumption:{targets},effects,flags:{"fora-do-abismo-foundry":{automation}}}}},effects:[{id:"e",name:"Escudo"}]},
  {id:"pool",name:"Recurso",system:{identifier:"pool",uses:{max:3}}}]});
test("valid item usage, self usage, depleted resources and existing effect are structural dependencies",()=>{
  const a=make([{type:"itemUses",target:"pool"},{type:"itemUses",target:""},{type:"attribute",target:"resources.primary.value"}],[{_id:"e"}]);
  const before=JSON.stringify(a),report=auditActorDependencies(a);
  assert.equal(report.errors,0);assert.equal(report.warnings,0);assert.equal(report.dependencies,4);assert.equal(JSON.stringify(a),before);
});
test("missing items, numeric resources and effects are reported; unresolved textual reference gets a suggested ID",()=>{
  const a=make([{type:"itemUses",target:"removed"},{type:"attribute",target:"resources.secondary.value"},{type:"itemUses",target:"@jarvis:pool"}],[{_id:"missing"}]);
  const report=auditActorDependencies(a);
  assert.equal(report.errors,3);assert.equal(report.warnings,1);
  assert.deepEqual(report.issues.map(i=>i.code),["missing-item","attribute-missing","unresolved-reference","missing-effect"]);
  assert.match(report.issues[2].fix,/pool/);
});
test("ambiguity, old effect IDs and unknown types do not silently mutate actor or run code",()=>{
  const a=make([{type:"itemUses",target:"@jarvis:pool"},{type:"spellSlots",target:"1"}],[],{effects:[{effectId:"old",effectName:"Escudo"}],pre:"throw Error('never run')"});
  a.items.push({id:"other",name:"Pool",system:{uses:{max:1}}});
  const report=auditActorDependencies(a);assert.equal(report.errors,1);assert.equal(report.warnings,1);assert.equal(report.issues[0].code,"ambiguous-item");assert.equal(report.issues[1].code,"effect-fallback");
});
