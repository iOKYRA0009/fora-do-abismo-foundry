import test from "node:test";
import assert from "node:assert/strict";
import {planVisualUpdate,applyVisualUpdate} from "../scripts/macros/visual-update.js";
import {previewJarvisExecution} from "../scripts/macros/macro-executor.js";
const moduleId="fora-do-abismo-foundry";
function setup(){
  const data={img:"old.webp",system:{uses:{spent:3,max:5},activities:{act:{name:"Golpe",img:"old.webp",consumption:{targets:[{type:"itemUses",target:"ki",value:"1"}]}}}}};
  function update(o,patch){for(const [k,v] of Object.entries(patch)){const p=k.split("."),last=p.pop();p.reduce((x,k)=>x[k],o)[last]=v;}}
  const item={id:"item",name:"Golpe",type:"feat",get img(){return data.img;},toObject:()=>structuredClone(data),async update(p){update(data,p);}};
  const actor={id:"ira",name:"Ira",type:"character",img:"portrait.webp",items:[item],prototypeToken:{texture:{src:"old-token.webp"}},system:{attributes:{hp:{value:7}}},theme:null,getFlag(){return this.theme;},async setFlag(m,k,v){this.theme=v;},async unsetFlag(){this.theme=null;},async update(p){update(this,p);}};
  const token={id:"t",actorId:"ira",actorLink:true,texture:{src:"old-token.webp"}},custom={id:"c",actorId:"ira",actorLink:true,texture:{src:"skin.webp"}};
  const scene={id:"scene",tokens:[token,custom],async updateEmbeddedDocuments(type,rows){for(const row of rows)update(this.tokens.find(t=>t.id===row._id),{"texture.src":row["texture.src"]});}};
  const input={actor:"Ira",actorType:"character",token:"asset://token",theme:{image:"asset://mark",palette:{paper:"#171419",text:"#eee5df",title:"#ff818b",divider:"#963b4d"}},items:[{name:"Golpe",type:"feat",img:"asset://icon",activities:[{name:"Golpe",img:"asset://icon"}]}],updateLinkedTokens:true};
  return {data,item,actor,scene,token,custom,input,images:{token:"new-token.webp",mark:"mark.webp",icon:"icon.webp"}};
}
test("visual patch only changes icons/theme/token, preserving uses, consumption and HP",async()=>{
  const s=setup();const old=structuredClone(s.data.system);const p=planVisualUpdate(s.input,[s.actor],[s.scene]);assert.equal(p.summary.tokens,1);
  await applyVisualUpdate(p,s.images);
  assert.equal(s.data.img,"icon.webp");assert.equal(s.data.system.activities.act.img,"icon.webp");
  assert.deepEqual(s.data.system.uses,old.uses);assert.deepEqual(s.data.system.activities.act.consumption,old.activities.act.consumption);
  assert.equal(s.actor.system.attributes.hp.value,7);assert.equal(s.actor.theme.image,"mark.webp");assert.equal(s.token.texture.src,"new-token.webp");assert.equal(s.custom.texture.src,"skin.webp");assert.equal(s.actor.img,"portrait.webp");
});
test("failed visual update restores earlier visual fields",async()=>{
  const s=setup();const p=planVisualUpdate(s.input,[s.actor],[s.scene]);s.actor.setFlag=async()=>{throw Error("failure");};
  await assert.rejects(applyVisualUpdate(p,s.images),/revertidas/);
  assert.equal(s.data.img,"old.webp");assert.equal(s.data.system.activities.act.img,"old.webp");assert.equal(s.actor.prototypeToken.texture.src,"old-token.webp");assert.equal(s.token.texture.src,"old-token.webp");
});
test("rejects arbitrary mechanical fields, duplicate actors and duplicate item matches",()=>{
  const s=setup();
  assert.throws(()=>planVisualUpdate({...s.input,hp:100},[s.actor],[]),/não permitidos/);
  assert.throws(()=>planVisualUpdate(s.input,[s.actor,{...s.actor,id:"other"}],[]),/ambíguo/);
  s.actor.items.push({...s.item,id:"another"});assert.throws(()=>planVisualUpdate(s.input,[s.actor],[]),/ambíguo/);
});
test("Executor accepts visual-only JSON and rejects mixed creation or absent images",()=>{
  const s=setup();globalThis.game={user:{isGM:true,id:"gm"},actors:[s.actor],scenes:[s.scene]};
  const b64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlHd3wAAAAASUVORK5CYII=";
  const pkg={schemaVersion:"jarvis-executor-1",visualUpdate:s.input,assets:["token","mark","icon"].map(id=>({id,mimeType:"image/png",dataBase64:b64}))};
  const p=previewJarvisExecution(JSON.stringify(pkg));assert.equal(p.review.visualUpdate.actorId,"ira");assert.equal(p.review.rollbackAvailable,false);assert.equal(p.review.actors.length,0);
  assert.throws(()=>previewJarvisExecution(JSON.stringify({...pkg,actors:[]})),/combinada/);
  assert.throws(()=>previewJarvisExecution(JSON.stringify({...pkg,assets:pkg.assets.slice(1)})),/não declarada/);
});
