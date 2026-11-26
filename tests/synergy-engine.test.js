import test from "node:test";
import assert from "node:assert/strict";
import { dispatchSynergy, setSynergySocket, receiveSynergyConsent } from "../scripts/synergy/synergy-engine.js";
import { combatClock, clockKey } from "../scripts/synergy/synergy-model.js";
import { renderSynergyControls } from "../scripts/synergy/synergy-ui.js";
const MODULE="fora-do-abismo-foundry";
function setup() {
  const gm={id:"gm",isGM:true,active:true,viewedScene:"scene"};
  const p={id:"p",isGM:false,active:true,viewedScene:"scene"};
  const i={id:"i",isGM:false,active:true,viewedScene:"scene"};
  const other={id:"other",isGM:false,active:true,viewedScene:"scene"};
  const users=new Map([gm,p,i,other].map(u=>[u.id,u]));users.activeGM=gm;
  const actor=(id,name,user)=>({id,name,type:"character",documentName:"Actor",items:new Map(),statuses:new Set(),
    system:{attributes:{hp:{value:20}}},testUserPermission:u=>u.id===user.id});
  const pride=actor("pride","Orgulho",p), wrath=actor("wrath","Ira",i);
  const actors=new Map([pride,wrath].map(a=>[a.id,a]));
  const scene={id:"scene"};
  const combat={id:"combat",started:true,round:1,turn:0,scene,turns:[
    {id:"cpride",actorId:pride.id,actor:pride,token:{parent:scene,object:{center:{x:0,y:0}}}},
    {id:"cwrath",actorId:wrath.id,actor:wrath,token:{parent:scene,object:{center:{x:5,y:0}}}}
  ]};
  const journal=new Map(),messages=new Map();
  globalThis.game={user:gm,users,actors,combat,journal,messages,combats:new Map([[combat.id,combat]])};
  globalThis.canvas={scene,grid:{measurePath:([a,b])=>({distance:Math.hypot(b.x-a.x,b.y-a.y)})}};
  let confirms=true, writes=0;
  globalThis.foundry={applications:{api:{DialogV2:{confirm:async()=>confirms}}}};
  globalThis.ui={notifications:{info(){},warn(){},error(){}}};
  globalThis.JournalEntry={async create(data){
    const doc={id:"journal",ownership:data.ownership,flags:data.flags,getFlag(m,k){return this.flags[m]?.[k];},async setFlag(m,k,v){this.flags[m][k]=v;writes++;}};
    journal.set(doc.id,doc);writes++;return doc;
  }};
  let prompts=[];
  setSynergySocket({async executeAsUser(name,userId,args){prompts.push({name,userId,args});return true;}});
  const command=(args,user=gm)=>dispatchSynergy(args,user);
  const combo={id:"decreto",name:"Decreto da Ruína",description:"Segredo",initiatorId:"pride",visibility:"owners",maxDistance:9,
    participants:[{actorId:"pride",cost:"action"},{actorId:"wrath",cost:"reaction"}]};
  const start=async(c=combo)=>{await command({action:"save",combo:c});await command({action:"start"});};
  const request=(user=p)=>command({action:"request",actorId:"pride",comboId:"decreto"},user);
  const status=(actorId,user=gm)=>command({action:"status",actorId},user);
  return {gm,p,i,other,users,pride,wrath,combat,journal,messages,command,combo,start,request,status,prompts,
    confirm:v=>{confirms=v;},writes:()=>writes};
}
test("private GM storage, filtered player list, and two-character commit",async()=>{
  const s=setup();await s.start();
  const doc=s.journal.get("journal");assert.equal(doc.ownership.default,0);
  assert.equal(doc.getFlag(MODULE,"synergyPrivateStore"),true);
  assert.deepEqual(await s.command({action:"list",actorId:"pride"},s.p),[{id:"decreto",name:s.combo.name,ownCost:"action"}]);
  await assert.rejects(s.command({action:"all"},s.p),/Mestre/);
  await assert.rejects(s.command({action:"list",actorId:"pride"},s.other),/controlada/);
  const before=s.writes(),result=await s.request();
  assert.equal(result.status,"committed");assert.equal(result.description,undefined);
  assert.equal(s.writes(),before+1);
  assert.equal(s.prompts.length,1);assert.equal(s.prompts[0].userId,"i");
  assert.deepEqual(s.prompts[0].args.participants,[{actorId:"wrath",cost:"reaction"}]);
  assert.equal(s.prompts[0].args.description,undefined);
  assert.equal((await s.status("pride",s.p)).action,0);
  assert.equal((await s.status("wrath",s.i)).reaction,0);
  await assert.rejects(s.request(),/indisponível/);
});
test("refusal, offline participant, range, required status, and hidden token never charge",async()=>{
  const s=setup();await s.start();
  setSynergySocket({async executeAsUser(){return false;}});
  assert.equal((await s.request()).status,"cancelled");
  assert.equal((await s.status("pride")).action,1);
  s.i.active=false;
  assert.equal((await s.request()).status,"cancelled");
  s.i.active=true;
  s.combat.turns[1].token.object.center.x=20;
  await assert.rejects(s.request(),/alcance/);
  s.combat.turns[1].token.object.center.x=5;
  s.combat.turns[1].token.hidden=true;
  await assert.rejects(s.request(),/disponível/);
  s.combat.turns[1].token.hidden=false;
  await s.command({action:"save",combo:{...s.combo,participants:[s.combo.participants[0],{...s.combo.participants[1],requiredStatus:"blessed"}]}});
  await assert.rejects(s.request(),/Condição obrigatória/);
  assert.equal((await s.status("wrath")).reaction,1);
});
test("secret combos are not listed or remotely requested, and players cannot edit ledger",async()=>{
  const s=setup();await s.start({...s.combo,visibility:"gm"});
  assert.deepEqual(await s.command({action:"list",actorId:"pride"},s.p),[]);
  await assert.rejects(s.request(),/indisponível/);
  await assert.rejects(s.command({action:"adjust",actorId:"pride",cost:"action",value:20},s.p),/Mestre/);
  await assert.rejects(s.command({action:"save",combo:s.combo},s.p),/Mestre/);
  await assert.rejects(s.command({action:"request",actorId:"pride",comboId:"decreto"},s.other),/indisponível/);
  s.journal.get("journal").ownership.default=2;
  await assert.rejects(s.command({action:"all"}),/privado/);
});
test("ordinary reaction during consent is recorded before revalidation; second request cannot race",async()=>{
  const s=setup();await s.start();
  s.wrath.items.set("shield",{id:"shield",system:{activities:new Map([["cast",{id:"cast",activation:{type:"reaction"}}]])}});
  s.messages.set("message",{author:s.i,speaker:{actor:"wrath"},system:{activity:{id:"cast"},item:{id:"shield"}}});
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  setSynergySocket({executeAsUser(){return new Promise(resolve=>{release=resolve;started();});}});
  const pending=s.request();
  const rejected=assert.rejects(pending,/indisponível/);
  await ready;
  await assert.rejects(s.request(),/andamento/);
  await s.command({action:"record",actorId:"wrath",itemId:"shield",activityId:"cast",messageId:"message",clock:clockKey(combatClock(s.combat))},s.i);
  release(true);await rejected;
  assert.equal((await s.status("wrath")).reaction,0);
  assert.equal((await s.status("pride")).action,1);
});
test("turn change while awaiting consent rejects without spending",async()=>{
  const s=setup();await s.start();
  setSynergySocket({async executeAsUser(){s.combat.turn=1;return true;}});
  await assert.rejects(s.request(),/turno/i);
  assert.equal((await s.status("pride")).action,1);
  assert.equal((await s.status("wrath")).reaction,1);
});
test("native activity cancellation refunds the whole ledger; completed activation charges once",async()=>{
  const s=setup();let useResult;let calls=0;
  const activity={id:"cast",async use(){calls++;return useResult;}};
  s.pride.items.set("spell",{id:"spell",system:{activities:new Map([["cast",activity]])}});
  await s.start({...s.combo,activity:{itemId:"spell",activityId:"cast"}});
  assert.equal((await s.request()).status,"cancelled");assert.equal(calls,1);
  assert.equal((await s.status("pride")).action,1);assert.equal((await s.status("wrath")).reaction,1);
  useResult={message:{id:"done"}};
  assert.equal((await s.request()).status,"executed");assert.equal(calls,2);
  assert.equal((await s.status("pride")).action,0);assert.equal((await s.status("wrath")).reaction,0);
});
test("consent receiver requires active GM and an owned participant in the same turn",async()=>{
  const s=setup();game.user=s.i;
  const args={name:"Combo",participants:[{actorId:"wrath",cost:"reaction"}],clock:clockKey(combatClock(s.combat)),expiresAt:Date.now()+1000};
  assert.equal(await receiveSynergyConsent(args,s.p),false);
  assert.equal(await receiveSynergyConsent({...args,participants:[{actorId:"pride",cost:"action"}]},s.gm),false);
  assert.equal(await receiveSynergyConsent({...args,expiresAt:Date.now()-1},s.gm),false);
  assert.equal(await receiveSynergyConsent(args,s.gm),true);
});
test("editor renders seven rows only to the GM; player sees picker/status only",()=>{
  const s=setup();
  const gm=renderSynergyControls([s.pride,s.wrath],true),player=renderSynergyControls([s.pride],false);
  assert.equal((gm.match(/name="synergy-actor-\d"/g)||[]).length,7);
  assert.match(gm,/synergy-save/);assert.match(player,/synergy-open/);assert.doesNotMatch(player,/synergy-save|synergy-library|synergy-description/);
});
