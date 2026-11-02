import test from "node:test";
import assert from "node:assert/strict";
import { auditNativeActor, scalingCSV } from "../scripts/preparation/native-export-audit.js";
import { prepareM00 } from "../scripts/preparation/m00-package.js";
import { previewJarvisExecution } from "../scripts/macros/macro-executor.js";
import { JarvisSceneBuilder } from "../scripts/scenes/scene-builder.js";

function fixture() {
  const actor={name:"Fictício",type:"character",system:{traits:{size:"med"}},items:[],effects:[],
    _stats:{exportSource:{uuid:"Actor.fixture",systemId:"dnd5e",systemVersion:"6.0.2",coreVersion:"14.367"}},
    prototypeToken:{width:1,height:1,texture:{src:"test.png",scaleX:1.3,scaleY:1.3},sight:{enabled:true,range:80}}};
  const blueprint={schemaVersion:"1.0",scene:{name:"TESTE - M00 FIXTURE",columns:30,rows:24,
    grid:{size:100,distance:5,units:"ft"},visualMode:true,tokenVision:true,
    imagePlacement:{width:1280,height:1024},imageTiles:[{src:"asset://m00-reference",rect:[128,0,1024,1024],pixelWidth:1024,pixelHeight:1024}]},
    walls:[{a:[200,200],b:[300,200],type:"door",state:"closed"}],
    lights:[{x:400,y:400,bright:10,dim:20}],tokens:[{actor:actor.name,x:500,y:500,width:1,height:1}]};
  // Signature-only bytes test packaging, never claim this fixture is artwork.
  return {actors:[actor],blueprint,confirmedByGM:true,
    asset:{id:"m00-reference",fileName:"fixture.jpg",mimeType:"image/jpeg",dataBase64:"/9j/2Q=="}};
}
function runtime() {
  globalThis.game={user:{id:"gm",isGM:true},users:{activeGM:{id:"gm"}},actors:[{id:"fixture",name:"Fictício"}],scenes:[]};
}
test("native export without _id retains exportSource UUID and no input mutation",()=>{
  const a=fixture().actors[0], before=structuredClone(a);
  const result=auditNativeActor(a,{confirmedByGM:true});
  assert.equal(result.row.actor_uuid,"Actor.fixture");
  assert.equal(result.row.texture_scale_x,1.3);
  assert.equal(result.prototypeToken.sight.range,80);
  assert.deepEqual(a,before);
});
test("reject V9 and malformed native exports",()=>{
  assert.throws(()=>auditNativeActor({schemaVersion:"9.0",actor:{name:"X"}}),/nativo/);
  assert.throws(()=>auditNativeActor({...fixture().actors[0],items:null}),/nativo/);
});
test("missing scaling remains pending, never defaults to 1x1",()=>{
  const a=fixture().actors[0];delete a.prototypeToken.width;delete a.prototypeToken.texture.scaleX;
  const r=auditNativeActor(a);assert.equal(r.row.token_width_cells,"PENDENTE");
  assert.equal(r.row.texture_scale_x,"PENDENTE");assert.equal(r.row.status,"PENDENTE");
});
test("CSV escapes commas quotes newlines and neutralizes formula injection",()=>{
  const csv=scalingCSV([{actor_name:'=X,"Y"\nZ'}]);
  assert.ok(csv.includes('"\'=X,""Y""\nZ"'));assert.ok(csv.includes("PENDENTE"));
});
test("draft calibrates real map pixels to approved grid without distorting square art",()=>{
  const f=fixture(), before=structuredClone(f);const r=prepareM00(f);
  assert.deepEqual(f,before);assert.equal(r.calibrated.scene.imageTiles[0].x,3);
  assert.equal(r.calibrated.scene.imageTiles[0].width,24);
  assert.equal(r.calibrated.scene.imageTiles[0].height,24);
  assert.equal(r.pkg.actors.length,0);assert.equal(r.pkg.itemAdditions.length,0);
  assert.equal(r.report.finalReady,false);
  runtime();assert.equal(previewJarvisExecution(JSON.stringify(r.pkg)).kind,"package");
});
test("preflight rejects mismatched scales and generic vision override",()=>{
  const f=fixture();f.blueprint.tokens[0].width=2;
  assert.throws(()=>prepareM00(f),/Escala divergente/);
  f.blueprint.tokens[0].width=1;f.blueprint.scene.visionPreset="limited";
  assert.throws(()=>prepareM00(f),/visão/);
});
test("preflight rejects missing confirmation and unverified token actor",()=>{
  assert.throws(()=>prepareM00({...fixture(),confirmedByGM:false}),/pendentes/);
  const f=fixture();f.blueprint.tokens[0].actor="Outro";
  assert.throws(()=>prepareM00(f),/não conferido/);
});
test("preflight rejects overlapping tokens and incorrect grid",()=>{
  const f=fixture();f.blueprint.tokens.push({...f.blueprint.tokens[0]});
  assert.throws(()=>prepareM00(f),/Sobreposição/);
  f.blueprint.tokens.pop();f.blueprint.scene.columns=25;
  assert.throws(()=>prepareM00(f),/30x24/);
});
test("Executor refuses existing scene and adding abilities to existing PCs",()=>{
  runtime();const {pkg}=prepareM00(fixture());game.scenes=[{name:pkg.scenes[0].scene.name}];
  assert.throws(()=>previewJarvisExecution(JSON.stringify(pkg)),/Não sobrescreveremos/);
  game.scenes=[];pkg.itemAdditions=[{actor:"Fictício",items:[{name:"Bloqueado",type:"feat"}]}];
  assert.throws(()=>previewJarvisExecution(JSON.stringify(pkg)),/personagem existente/);
});
test("Scene Builder keeps prototype texture and 80ft vision, creates no Actors", async()=>{
  runtime();const f=fixture();const prototype=f.actors[0].prototypeToken;
  game.actors=[{id:"fixture",name:"Fictício",getTokenDocument:async data=>({toObject:()=>({...structuredClone(prototype),...data})})}];
  game.folders=[];
  globalThis.foundry={utils:{deepClone:structuredClone}};
  globalThis.CONST={GRID_TYPES:{SQUARE:1},WALL_DOOR_TYPES:{NONE:0,DOOR:1,SECRET:2},
    WALL_DOOR_STATES:{CLOSED:0,OPEN:1,LOCKED:2},TOKEN_DISPOSITIONS:{NEUTRAL:0},
    TILE_OCCLUSION_MODES:{NONE:0},DRAWING_FILL_TYPES:{SOLID:1}};
  let captured;
  globalThis.ui={notifications:{info:()=>{}}};
  const embedded={};
  globalThis.Scene={implementation:{create:async data=>{captured=data;return {id:"new",name:data.name,view:async()=>{},
    update:async()=>{}, delete:async()=>{},
    createEmbeddedDocuments:async(kind,data)=>{embedded[kind]=data;return data;}};}}};
  const {calibrated}=prepareM00(f);
  await new JarvisSceneBuilder().build(calibrated,{view:false});
  assert.equal(embedded.Token[0].texture.scaleX,1.3);
  assert.equal(embedded.Token[0].sight.range,80);
  assert.equal(captured.width,3000);assert.equal(captured.height,2400);
  assert.equal(embedded.Token[0].width,1);assert.equal(embedded.Wall[0].door,1);
});
