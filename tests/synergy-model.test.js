import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCombo, combatClock, newLedger, currentLedger, remaining, planSpend, setRemaining, recordNative, resyncLedger, clockKey } from "../scripts/synergy/synergy-model.js";

const clock=(round=1,turn=0,order=["pride","wrath","envy"])=>({combatId:"combat",round,turn,order});
const pair=[{combatantId:"pride",cost:"action"},{combatantId:"wrath",cost:"reaction"}];
test("Orgulho spends one action and Ira spends one reaction; no mutation of original",()=>{
  const c=clock(), original=newLedger(c), next=planSpend(original,c,pair);
  assert.equal(remaining(next,c,"pride").action,0);
  assert.equal(remaining(next,c,"pride").bonus,1);
  assert.equal(remaining(next,c,"wrath").reaction,0);
  assert.equal(remaining(original,c,"pride").action,1);
  assert.throws(()=>planSpend(next,c,pair),/indisponível/);
});
test("reaction refreshes at participant's own turn, not at the start of the round",()=>{
  const c=clock(1,2), a=planSpend(newLedger(c),c,[{combatantId:"wrath",cost:"reaction"}]);
  const nextRound=clock(2,0);
  assert.equal(remaining(a,nextRound,"wrath").reaction,0);
  assert.equal(remaining(a,clock(2,1),"wrath").reaction,1);
});
test("bonus action and actions outside participant turn need explicit homebrew exception",()=>{
  const c=clock(), a=newLedger(c);
  assert.throws(()=>planSpend(a,c,[{combatantId:"wrath",cost:"bonus"}]),/próprio turno/);
  const next=planSpend(a,c,[{combatantId:"wrath",cost:"bonus",offTurn:true}]);
  assert.equal(remaining(next,c,"wrath").bonus,0);
});
test("a failed participant leaves the initiating actor's action intact",()=>{
  const c=clock(), a=setRemaining(newLedger(c),c,"wrath","reaction",0);
  assert.throws(()=>planSpend(a,c,pair),/indisponível/);
  assert.equal(remaining(a,c,"pride").action,1);
});
test("native use deduplicates receipt and action grants are adjustable",()=>{
  const c=clock(), a=setRemaining(newLedger(c),c,"pride","action",2);
  const b=recordNative(a,c,"pride","action","message");
  const again=recordNative(b,c,"pride","action","message");
  assert.equal(remaining(again,c,"pride").action,1);
  assert.equal(remaining(recordNative(again,c,"pride","action","other"),c,"pride").action,0);
  assert.throws(()=>setRemaining(a,c,"pride","action",-1),/saldo/);
});
test("turn rewind and initiative edits cannot silently refund spent costs",()=>{
  const c=clock(1,1), a=planSpend(newLedger(c),c,[{combatantId:"wrath",cost:"action"}]);
  assert.throws(()=>currentLedger(a,clock()),/retrocedido/);
  const changed=clock(1,1,["wrath","pride","envy"]);
  assert.throws(()=>currentLedger(a,changed),/Iniciativa/);
  assert.equal(remaining(resyncLedger(a,changed),changed,"wrath").action,0);
});
test("combo definitions require two to seven distinct participants and a valid initiator",()=>{
  const data={id:"decreto",name:"Decreto",initiatorId:"p",participants:[{actorId:"p",cost:"action"},{actorId:"i",cost:"reaction",requiredStatus:"blessed"}]};
  assert.equal(normalizeCombo(data).visibility,"gm");
  assert.equal(normalizeCombo(data).participants[1].requiredStatus,"blessed");
  assert.equal(normalizeCombo({...data,maxDistance:"9"}).maxDistance,9);
  assert.throws(()=>normalizeCombo({...data,participants:[data.participants[0],data.participants[0]]}),/duplicado/);
  assert.throws(()=>normalizeCombo({...data,initiatorId:"wrong"}),/iniciador/);
  assert.throws(()=>normalizeCombo({...data,maxDistance:-1}),/Alcance/);
  assert.throws(()=>normalizeCombo({...data,activity:{itemId:"i",activityId:""}}),/Atividade/);
});
test("combat clock rejects unstarted encounters",()=>{
  assert.throws(()=>combatClock({started:false}),/Inicie/);
  assert.deepEqual(combatClock({id:"combat",started:true,round:1,turn:0,turns:[{id:"pride"}]}),clock(1,0,["pride"]));
  assert.notEqual(clockKey(clock()),clockKey(clock(1,1)));
});
