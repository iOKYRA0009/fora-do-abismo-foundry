import test from "node:test";
import assert from "node:assert/strict";
import {detectUniversalSource} from "../scripts/importer/universal/source-detector.js";
import {convertUniversalSource,parseCsv,parseActorXml} from "../scripts/importer/universal/converters.js";
import {parseRestrictedYaml} from "../scripts/importer/universal/restricted-yaml.js";
import {compileActorBlueprintV91} from "../scripts/importer/v9/blueprint-v91.js";
const convert=(source,filename)=>convertUniversalSource(detectUniversalSource(source,{filename}));
test("native Actor preserves embedded identities and mechanical data but strips external metadata",()=>{
  const original={_id:"old",name:"Ira",type:"npc",_stats:{systemId:"dnd5e"},folder:"f",ownership:{default:3},flags:{external:{macro:"not executed"}},system:{attributes:{hp:{value:80,max:100}}},prototypeToken:{_id:"t",actorId:"old",texture:{src:"ira.webp"},flags:{external:true}},items:[{_id:"item1",name:"Golpe",type:"feat",system:{activities:{act1:{name:"Ataque",flags:{external:true},type:"attack"}}},flags:{external:true},effects:[]}],effects:[{_id:"effect1",name:"Fúria",system:{},flags:{external:true}}]};
  const before=JSON.stringify(original);const r=convert(before,"actor.json");
  assert.equal(r.route,"actor");assert.equal(r.data.schemaVersion,"9.0");assert.equal(r.data.actor.system.attributes.hp.value,80);assert.equal(r.data.actor.prototypeToken.texture.src,"ira.webp");
  for(const key of ["_id","flags","ownership","folder","_stats"])assert.equal(key in r.data.actor,false);
  assert.equal(r.data.items[0]._id,"item1");assert.equal(r.data.items[0].system.activities.act1.type,"attack");assert.equal("flags" in r.data.items[0].system.activities.act1,false);
  assert.equal(r.data.effects[0]._id,"effect1");assert.ok(r.warnings.length);assert.equal(JSON.stringify(original),before);
  assert.throws(()=>convert(JSON.stringify({...original,_stats:{systemId:"pf2e"}}),"actor.json"),/outro sistema/);
});
test("YAML maps and sequences convert a complete V9.1 blueprint",()=>{
  const source="schemaVersion: '9.1'\nactor:\n  name: Orgulho\n  type: npc\n  jarvis:\n    hp:\n      value: 250\n      max: 250\n    abilities: {\"str\":20}\nactions:\n  - name: Decreto\n    kind: save\n    ability: wis\n    dc: 19\n    damage:\n      formula: 6d10\n      type: radiant\n    onSave: half";
  const r=convert(source,"actor.yaml");assert.equal(r.route,"actor");assert.equal(r.data.actor.jarvis.hp.max,250);
  const compiled=compileActorBlueprintV91(r.data);assert.equal(compiled.items[0].jarvis.activities[0].save.dc.formula,"19");
  assert.equal(compiled.items[0].jarvis.activities[0].damage.parts[0].custom.formula,"6d10");
});
test("YAML unsupported syntax is rejected, not guessed or executed",()=>{
  for(const input of ["name: &anchor value","name: *anchor","name: !!js/function foo","name: |\n  text","name: test\nname: duplicate","name:\n    bad: true","constructor: bad","name: test # comment","name: test\n---\nname: test"])assert.throws(()=>parseRestrictedYaml(input),/YAML/);
  assert.throws(()=>convert("schemaVersion: '9.1'\nactor: {\"name\":\"X\",\"type\":\"npc\",\"__proto__\":{}}","actor.yaml"),/reservada/);
});
test("XML converts actor and action without silently ignoring unknown fields",()=>{
  const r=convert("<actor><name>Ira &amp; Orgulho</name><type>npc</type><hp>90</hp><hpMax>100</hpMax><ac>18</ac><actions><action><name>Golpe</name><kind>attack</kind><toHit>8</toHit><formula>2d8+4</formula><damageType>slashing</damageType></action></actions></actor>","actor.xml");
  assert.equal(r.data.actor.name,"Ira & Orgulho");assert.equal(r.data.actor.jarvis.hp.value,90);assert.equal(r.data.actions[0].toHit,8);
  assert.equal(compileActorBlueprintV91(r.data).items[0].jarvis.activities[0].attack.bonus,"8");
  for(const bad of ["<!DOCTYPE actor [<!ENTITY x SYSTEM 'file:///secret'>]><actor/>","<actor><name>&x;</name></actor>","<actor><name>x</type></actor>","<actor><name>x</name><name>y</name></actor>","<actor id='x'/>","<actor><unknown>x</unknown></actor>"])assert.throws(()=>parseActorXml(bad),/XML/);
});
test("CSV quotes, accents, separators, empty cells, and batch routing",()=>{
  const r=convert('name;type;hp;str;biography\r\n"Ira; primeira";npc;100;20;"Linha 1\r\nLinha 2"\r\nOrgulho;npc;200;;"disse ""olá"""',"actors.csv");
  assert.equal(r.route,"executor-package");assert.equal(r.data.actors.length,2);assert.equal(r.data.actors[0].actor.name,"Ira; primeira");assert.equal(r.data.actors[1].actor.jarvis.details.biography,'disse "olá"');
  const one=convert("name,type,ac\nIra,npc,17","one.csv");assert.equal(one.route,"actor");assert.equal(one.data.actor.jarvis.ac,17);
  for(const bad of ["name,type,bad\nIra,npc,1","name,type\nIra","name,type\n\"Ira,npc","name,type,hp\nIra,npc,no","name,type\n"+Array.from({length:21},(_,i)=>"Actor"+i+",npc").join("\n")])assert.throws(()=>parseCsv(bad));
});
test("existing JavaScript/JSON routing stays unchanged; no code is executed",()=>{
  const js="const x = (globalThis.__converterTest = 1);";
  delete globalThis.__converterTest;
  const r=convert(js,"macro.js");assert.equal(r.route,"executor-js");assert.equal(r.source,js);assert.equal(globalThis.__converterTest,undefined);
  assert.equal(convert('{"schemaVersion":"9.1","actor":{"name":"X","type":"npc"}}',"x.json").route,"actor");
  assert.equal(convert("unstructured notes","notes.txt").route,null);
});
