import test from "node:test";
import assert from "node:assert/strict";
import { captureSceneSnapshot, compareSceneSnapshot, SNAPSHOT_SCHEMA } from "../scripts/scenes/production-snapshot.js";
import { inspectMosaicQuality } from "../scripts/scenes/package/mosaic-quality.js";
import { listAtmosphereCues, previewAtmosphereCue, applyAtmosphereCue, restoreAtmosphereCue } from "../scripts/scenes/atmosphere-director.js";

function fixture() {
  return {documentName:"Scene",id:"scene-123",name:"Catedral",width:4096,height:7680,
    grid:{size:128,type:1,distance:5,units:"ft"},
    environment:{darknessLevel:.6,globalLight:{enabled:false}},backgroundColor:"#202027",
    background:{src:""},
    tiles:{contents:[{id:"tile-1",x:0,y:0,width:4096,height:2560,texture:{src:"mapa.webp"}}]},
    walls:{contents:[{id:"wall-1",c:[100,100,300,100],door:1,ds:0,move:20,sight:20}]},
    lights:{contents:[{id:"light-1",x:600,y:800,config:{dim:30,bright:15}}]},
    sounds:{contents:[]},
    tokens:{contents:[{id:"private-token",actorId:"secret-actor",name:"Jogador secreto"}]},
    async update(data) {
      if ("environment.darknessLevel" in data) this.environment.darknessLevel=data["environment.darknessLevel"];
      if ("backgroundColor" in data) this.backgroundColor=data.backgroundColor;
    }
  };
}
test("snapshot is portable, read-only and excludes Actors/Tokens",()=>{
  globalThis.game={user:{isGM:true}};
  const scene=fixture();const unchanged=structuredClone(scene.environment);
  const snapshot=captureSceneSnapshot(scene);
  assert.equal(snapshot.schemaVersion,SNAPSHOT_SCHEMA);
  assert.equal(snapshot.tiles.length,1);
  assert.equal(snapshot.walls.length,1);
  assert.equal(snapshot.lights.length,1);
  assert.ok(!JSON.stringify(snapshot).includes("secret-actor"));
  assert.ok(!JSON.stringify(snapshot).includes("Jogador secreto"));
  assert.deepEqual(scene.environment,unchanged);
  assert.equal(compareSceneSnapshot(snapshot,scene).changed,false);
});
test("snapshot reports additions, removals and changed wall position",()=>{
  globalThis.game={user:{isGM:true}};
  const scene=fixture(), before=captureSceneSnapshot(scene);
  scene.walls.contents[0].c=[101,100,300,100];
  scene.tiles.contents.push({id:"tile-2",x:0,y:2560,width:4096,height:2560,texture:{src:"b.webp"}});
  scene.lights.contents=[];
  scene.environment.darknessLevel=.9;
  const result=compareSceneSnapshot(before,scene);
  assert.equal(result.changed,true);
  assert.deepEqual(result.collections.walls.changed,["wall-1"]);
  assert.deepEqual(result.collections.tiles.added,["tile-2"]);
  assert.deepEqual(result.collections.lights.removed,["light-1"]);
  assert.ok(result.environmentChanges.includes("environment"));
});
test("snapshot blocks wrong scene and non-GM",()=>{
  globalThis.game={user:{isGM:true}};
  const scene=fixture(), before=captureSceneSnapshot(scene);
  const another=fixture();another.id="other";
  assert.throws(()=>compareSceneSnapshot(before,another),/incompatível/);
  globalThis.game={user:{isGM:false}};
  assert.throws(()=>captureSceneSnapshot(scene),/Mestre/);
  assert.throws(()=>compareSceneSnapshot(before,scene),/Mestre/);
});
function mosaic() {return {scene:{columns:32,rows:60,grid:{size:128},
  imagePlacement:{width:4096,height:7680},environment:{darknessLevel:0.9},
  imageTiles:Array.from({length:3},(_,i)=>({name:["Praça","Salão","Porão"][i],
    src:"asset://m"+i,rect:[0,i*2560,4096,2560],pixelWidth:4096,pixelHeight:2560}))},
  walls:[{a:[512,2560],b:[800,2560],type:"door"}],
  lights:[{x:512,y:2500,dim:20,bright:10}]};}
test("HD inspection reports quality metrics without changing maps",()=>{
  const input=mosaic(), before=structuredClone(input);
  const q=inspectMosaicQuality(input);
  assert.equal(q.sectors.length,3);
  assert.equal(q.totals.covered,4096*7680);
  assert.equal(q.totals.pixelDensity,128);
  assert.deepEqual(q.issues,[]);
  assert.deepEqual(input,before);
});
test("inspector warns about low source quality, grid drift, empty atlas and missing lighting",()=>{
  const m=mosaic();m.scene.imageTiles[0].pixelWidth=512;
  m.scene.imageTiles[1].rect=[1,2560,4000,2560];
  m.scene.imageTiles.pop();
  m.walls=[];m.lights=[];
  const q=inspectMosaicQuality(m);
  const text=q.issues.map(x=>x.detail).join(" ");
  assert.match(text,/abaixo da meta HD/);
  assert.match(text,/não se alinha/);
  assert.match(text,/espaços vazios/);
  assert.match(text,/Sem paredes/);
  assert.match(text,/Cena escura/);
});
test("director previews only, applies three native cues, restores original",async()=>{
  globalThis.game={user:{isGM:true}};
  const scene=fixture();const before=[scene.environment.darknessLevel,scene.backgroundColor];
  assert.equal(listAtmosphereCues().length,3);
  const p=previewAtmosphereCue(scene,"solemn");
  assert.equal(p.to.darkness,.58);
  assert.deepEqual([scene.environment.darknessLevel,scene.backgroundColor],before);
  await applyAtmosphereCue(scene,"hunger");
  assert.equal(scene.environment.darknessLevel,.82);
  await applyAtmosphereCue(scene,"rupture");
  assert.equal(scene.environment.darknessLevel,.94);
  await restoreAtmosphereCue(scene);
  assert.deepEqual([scene.environment.darknessLevel,scene.backgroundColor],before);
  await assert.rejects(restoreAtmosphereCue(scene),/não há estado anterior/);
});
test("director denies non-GM and unknown states",async()=>{
  globalThis.game={user:{isGM:true}};
  assert.throws(()=>previewAtmosphereCue(fixture(),"fake"),/desconhecido/);
  globalThis.game={user:{isGM:false}};
  await assert.rejects(applyAtmosphereCue(fixture(),"solemn"),/Mestre/);
});
