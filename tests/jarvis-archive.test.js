import test from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {readJarvisZip,crc32} from "../scripts/importer/universal/zip-reader.js";
import {prepareJarvisArchive} from "../scripts/importer/universal/archive-package.js";
import {previewJarvisExecution} from "../scripts/macros/macro-executor.js";
const enc=new TextEncoder(),json=o=>enc.encode(JSON.stringify(o));
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlHd3wAAAAASUVORK5CYII=","base64");
function zip(entries,{deflate=false,descriptor=false}={}){
  const locals=[],central=[];let offset=0;
  for(const [name,input] of entries){
    const n=Buffer.from(name),plain=Buffer.from(input),compressed=deflate?deflateRawSync(plain):plain,crc=crc32(plain),flags=0x800|(descriptor?8:0),method=deflate?8:0;
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(flags,6);l.writeUInt16LE(method,8);l.writeUInt16LE(n.length,26);
    if(!descriptor){l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(plain.length,22);}
    const data=[l,n,compressed];
    if(descriptor){const desc=Buffer.alloc(16);desc.writeUInt32LE(0x08074b50);desc.writeUInt32LE(crc,4);desc.writeUInt32LE(compressed.length,8);desc.writeUInt32LE(plain.length,12);data.push(desc);}
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(plain.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    locals.push(...data);central.push(c,n);offset+=data.reduce((s,b)=>s+b.length,0);
  }
  const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(central.reduce((s,b)=>s+b.length,0),12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...central,e]);
}
const file=b=>({name:"example.jarvis",size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
const makeFile=(bytes,name,type)=>({name,type,size:bytes.length,lastModified:0,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const manifest={schemaVersion:"jarvis-character-1",character:"personagem.json",items:"habilidades.json",appearance:"aparencia.json",assets:[{id:"portrait",path:"images/retrato.png"},{id:"watermark",path:"images/marca.png"}]};
const actor={schemaVersion:"9.1",actor:{name:"Orgulho",type:"character",img:"asset://portrait",prototypeToken:{texture:{src:"asset://portrait"}},jarvis:{hp:{value:100,max:100},ac:20,abilities:{str:20,dex:16,con:20,int:14,wis:18,cha:20}}},actions:[{name:"Golpe",kind:"attack",toHit:8,damage:{formula:"2d8",type:"slashing"}}]};
const entries=(m=manifest,a=actor)=>[["manifest.json",json(m)],["personagem.json",json(a)],["habilidades.json",json([{name:"Proteção",type:"feat"}])],["aparencia.json",json({image:"asset://watermark",opacity:.1,size:65})],["images/retrato.png",png],["images/marca.png",png]];
test("stored and DEFLATE archives (including data descriptors) preserve bytes",async()=>{
  for(const options of [{},{deflate:true},{deflate:true,descriptor:true}]){
    const result=await readJarvisZip(file(zip(entries(),options)));assert.deepEqual(Buffer.from(result.get("images/retrato.png")),png);assert.equal(result.size,6);
  }
});
test("character archive prepares reviewed Executor package including watermark and attachments without writes",async()=>{
  const r=await prepareJarvisArchive(file(zip(entries(),{deflate:true})),{makeFile});
  assert.equal(r.route,"executor-package");assert.equal(r.data.actors[0].schemaVersion,"9.0");assert.equal(r.data.actors[0].items.length,2);assert.equal(r.data.actors[0].actor.jarvis.sheetAppearance.image,"asset://watermark");assert.equal(r.files.length,2);
  globalThis.game={user:{id:"gm",isGM:true},users:{activeGM:{id:"gm"}},actors:{contents:[]},scenes:{contents:[]}};
  globalThis.foundry={utils:{randomID:()=>"abcdefghijklmno1"}};
  globalThis.canvas={scene:null};
  const plan=previewJarvisExecution(r.source,{mode:"package",files:r.files});
  assert.equal(plan.review.images.length,2);assert.equal(plan.review.actors[0].name,"Orgulho");assert.equal(game.actors.contents.length,0);
  assert.equal(plan.data.actors[0].actor.jarvis.sheetAppearance.image,"asset://watermark");
});
test("reject traversal, duplicate names, scripts, undeclared files and missing asset references",async()=>{
  for(const bad of [[...entries(),["../bad.json",json({})]],[...entries(),["MANIFEST.JSON",json({})]]])await assert.rejects(readJarvisZip(file(zip(bad))),/inválido ou duplicado/);
  await assert.rejects(prepareJarvisArchive(file(zip([...entries(),["automacoes.js",enc.encode("return 1")]])),{makeFile}),/não declarado/);
  const bad=structuredClone(actor);bad.actor.img="asset://missing";
  await assert.rejects(prepareJarvisArchive(file(zip(entries(manifest,bad))),{makeFile}),/sem imagem/);
  bad.actor.img="asset://portrait";bad.actor.flags={macro:"return 1"};
  await assert.rejects(prepareJarvisArchive(file(zip(entries(manifest,bad))),{makeFile}),/flags/);
});
test("reject truncated, corrupt and overstated decompressed data",async()=>{
  const b=zip(entries());await assert.rejects(readJarvisZip(file(b.subarray(0,b.length-4))),/central/);
  const corrupt=Buffer.from(b);corrupt[30+"manifest.json".length]^=1;
  await assert.rejects(readJarvisZip(file(corrupt)),/CRC/);
  const compressed=zip([["x",Buffer.alloc(100,65)]],{deflate:true});
  compressed.writeUInt32LE(1,22);const central=compressed.readUInt32LE(compressed.length-22+16);compressed.writeUInt32LE(1,central+24);
  await assert.rejects(readJarvisZip(file(compressed)),/excede/);
});
test("reject unknown manifest keys and invalid watermark type",async()=>{
  await assert.rejects(prepareJarvisArchive(file(zip(entries({...manifest,scripts:["a.js"]}))),{makeFile}),/Scripts|campo desconhecido/);
  const m=structuredClone(manifest);m.assets[1].path="images/marca.gif";
  const e=entries(m);e[e.length-1]=["images/marca.gif",png];
  await assert.rejects(prepareJarvisArchive(file(zip(e)),{makeFile}),/Marca-d/);
});

test("archive optional synergy and declarative effect files reach Executor review",async()=>{
  const m={...manifest,synergies:"sinergias.json",effectBindings:"efeitos.json"};
  const e=entries(m);
  e.push(["sinergias.json",json([{name:"Aliança",initiator:"Orgulho",participants:[{actor:"Orgulho",cost:"action"},{actor:"Ira",cost:"reaction"}]}])]);
  e.push(["efeitos.json",json([])]);
  const result=await prepareJarvisArchive(file(zip(e)),{makeFile});
  assert.equal(result.data.synergyCombos.length,1);
  globalThis.game={user:{id:"gm",isGM:true},users:{activeGM:{id:"gm"}},actors:{contents:[{id:"ira",name:"Ira"}]},scenes:{contents:[]}};
  globalThis.foundry={utils:{randomID:()=>"abcdefghijklmno1"}};
  globalThis.canvas={scene:null};
  const plan=previewJarvisExecution(result.source,{mode:"package",files:result.files});
  assert.equal(plan.review.synergyCombos[0].participants[1].existingId,"ira");
  assert.equal(plan.review.synergyCombos[0].visibility,"gm");
});
