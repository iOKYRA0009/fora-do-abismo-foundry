import test from "node:test";
import assert from "node:assert/strict";
import { detectUniversalSource, universalReport } from "../scripts/importer/universal/source-detector.js";
const actor={schemaVersion:"9.1",actor:{name:"Orgulho",type:"npc"},actions:[]};
test("detects Jarvis V9.0 and V9.1 including BOM, fences and misleading .js extensions",()=>{
  for(const version of ["9.0","9.1"]){
    const payload={...actor,schemaVersion:version};
    const r=detectUniversalSource("\uFEFF  ```json\n"+JSON.stringify(payload)+"\n```",{filename:"actor.js"});
    assert.equal(r.format,"jarvis-actor-"+version);assert.equal(r.route,"actor");assert.deepEqual(r.data,payload);
  }
});
test("detects executor package, arrays and a single Item",()=>{
  const pack={schemaVersion:"jarvis-executor-1",actors:[]};
  assert.equal(detectUniversalSource(JSON.stringify(pack)).route,"executor-package");
  const item={name:"Golpe",type:"feat"};
  for(const x of [item,[item],{items:[item]}]){
    const r=detectUniversalSource(JSON.stringify(x));assert.equal(r.route,"items");assert.deepEqual(r.data,[item]);
  }
});
test("unknown or malformed JSON never falls through to JavaScript",()=>{
  for(const source of ['{"actor":','[1,2,','{"schemaVersion":"10.0","actor":{}}','{"a":1}','[]','[{"name":"x","type":"npc"}]','null','123']){
    const r=detectUniversalSource(source,{filename:"wrong.js"});assert.equal(r.supported,false);assert.equal(r.route,null);
  }
});
test("detects native Foundry actor separately and does not mistake its items for an Item package",()=>{
  const r=detectUniversalSource(JSON.stringify({name:"NPC",type:"npc",system:{},items:[{name:"Golpe",type:"feat"}]}));
  assert.equal(r.format,"foundry-actor");assert.equal(r.supported,false);
});
test("recognition does not execute JavaScript or foreign code",()=>{
  globalThis.__jarvisSentinel=0;
  const source='const x = (globalThis.__jarvisSentinel = 1);';
  assert.equal(detectUniversalSource(source).route,"executor-js");
  assert.equal(globalThis.__jarvisSentinel,0);
  assert.equal(detectUniversalSource("return 1",{filename:"script.py"}).route,null);
  assert.equal(detectUniversalSource("```python\nreturn 1\n```").route,null);
  assert.equal(detectUniversalSource("return 1",{filename:"script.lua"}).route,null);
  delete globalThis.__jarvisSentinel;
});
test("recognizes formats not yet converted; rejects oversize and incomplete fences",()=>{
  for(const [source,filename,format] of [["name: Orgulho\ntype: npc","a.yaml","yaml"],["<actor name='Orgulho'/>","a.xml","xml"],["name,type\nOrgulho,npc","a.csv","csv"],["# Orgulho\nPV: 50","a.md","markdown"],["Ficha descritiva","a.txt","text"]]){
    const r=detectUniversalSource(source,{filename});assert.equal(r.format,format);assert.equal(r.supported,false);
  }
  assert.equal(detectUniversalSource("```js\nreturn 1").supported,false);
  assert.throws(()=>detectUniversalSource(""),/Cole/);
  assert.throws(()=>detectUniversalSource("a".repeat(2*1024*1024+1)),/2 MB/);
});
test("summary has no source code or payload",()=>{
  const r=universalReport(detectUniversalSource(JSON.stringify(actor)));
  assert.equal(r.somenteLeitura,true);assert.equal(r.destino,"actor");assert.equal("source" in r,false);assert.equal("data" in r,false);
});
