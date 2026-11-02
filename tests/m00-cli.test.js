import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

test('CLI audits local exports, never rewrites source or existing output directory',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-m00-test-'));
  try {
    const a={name:'Fixture',type:'character',system:{traits:{size:'med'}},items:[],effects:[],
      _stats:{exportSource:{uuid:'Actor.fixture',systemId:'dnd5e',systemVersion:'6.0.2'}},
      prototypeToken:{width:1,height:1,texture:{src:'fixture.png',scaleX:1,scaleY:1}}};
    const original=JSON.stringify(a);
    await fs.writeFile(path.join(root,'actor.json'),original);
    const config=path.join(root,'config.json'),out=path.join(root,'out');
    await fs.writeFile(config,JSON.stringify({actors:[{file:'actor.json',expectedName:'Fixture',confirmedByGM:true}]}));
    const run=()=>spawnSync(process.execPath,['tools/prepare-m00.mjs',config,out],{encoding:'utf8'});
    assert.equal(run().status,0);
    const first=await fs.readFile(path.join(out,'FONTES_SHA256.json'),'utf8');
    assert.notEqual(run().status,0);
    assert.equal(await fs.readFile(path.join(out,'FONTES_SHA256.json'),'utf8'),first);
    assert.equal(await fs.readFile(path.join(root,'actor.json'),'utf8'),original);
    assert.equal((await fs.readdir(out)).length,3);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('readonly macro refuses non-GM and never sends chat or writes settings',async()=>{
  const source=await fs.readFile('macros/preparation/00_DIAGNOSTICO_READONLY.js','utf8');
  assert.throws(()=>vm.runInNewContext(source,{game:{user:{isGM:false}}}),/Mestre/);
  const fail=()=>{throw new Error('unexpected mutation');};
  const report=vm.runInNewContext(source,{game:{user:{isGM:true},world:{id:'fixture'},version:'14.367',
    system:{id:'dnd5e',version:'6.0.2'},modules:new Map(),actors:new Map(),settings:{set:fail}},
    Actor:{create:fail},Scene:{create:fail},ChatMessage:{create:fail},console:{info:()=>{}},ui:{notifications:{info:()=>{}}}});
  assert.equal(report.foundry,'14.367');assert.equal(report.actors.length,0);
});
