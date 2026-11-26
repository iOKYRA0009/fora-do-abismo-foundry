import test from "node:test";
import assert from "node:assert/strict";
import {detectUniversalSource} from "../scripts/importer/universal/source-detector.js";
import {convertUniversalSource} from "../scripts/importer/universal/converters.js";
import {compileActorBlueprintV91} from "../scripts/importer/v9/blueprint-v91.js";
const sample="# Orgulho\n**Tipo:** NPC\n- PV: 200/250\n- CA: 22\n- Atributos: FOR 20, DES 16, CON 22, SAB 18\n## Habilidade: Decreto Celestial\nTipo: Salvaguarda\nCusto: 1 ação\nDano: 6d10 radiante\nSalvaguarda: Sabedoria, CD 19\nSucesso: metade\nUsos: 2\nRecuperação: descanso longo\nDescrição: Um decreto divino.";
const convert=(s,filename="ficha.md")=>convertUniversalSource(detectUniversalSource(s,{filename}));
test("Portuguese Markdown creates native save mechanics and limited uses",()=>{
  const r=convert(sample);assert.equal(r.route,"actor");assert.equal(r.format,"structured-character-text");
  assert.deepEqual(r.data.actor.jarvis.hp,{value:200,max:250});assert.equal(r.data.actor.jarvis.abilities.str,20);
  const a=compileActorBlueprintV91(r.data).items[0].jarvis.activities[0];
  assert.equal(a.save.dc.formula,"19");assert.deepEqual(a.save.ability,["wis"]);assert.equal(a.damage.onSave,"half");assert.equal(a.damage.parts[0].custom.formula,"6d10");assert.equal(a.uses.max,"2");assert.deepEqual(a.uses.recovery,["lr"]);assert.equal(a.consumption.targets[0].type,"activityUses");
});
test("TXT supports multiple native activities, explicit reaction and bonus costs",()=>{
  const r=convert("Nome: Ira\nTipo: NPC\nPV: 100\nHabilidade: Golpe\nTipo: Ataque\nCusto: reação\nAcerto: +8\nDano: 2d8+4 cortante\nHabilidade: Cura\nTipo: Cura\nCusto: ação bônus\nCura: 2d6+3\nHabilidade: Passo\nTipo: Teleporte\nCusto: ação\nDistância: 9 m","a.txt");
  const a=compileActorBlueprintV91(r.data).items.map(i=>i.jarvis.activities[0]);assert.equal(a[0].activation.type,"reaction");assert.equal(a[0].attack.bonus,"8");assert.equal(a[1].activation.type,"bonus");assert.equal(a[1].healing.custom.formula,"2d6+3");assert.equal(a[2].teleport.units,"m");assert.equal(r.data.actor.jarvis.hp.max,100);
});
test("unknown mechanics, duplicate fields and invalid values are not silently lost",()=>{
  for(const s of [sample+"\nSinergia: Ira",sample+"\nCusto: reação",sample.replace("Sucesso: metade\n",""),sample.replace("CD 19","CD 99"),sample.replace("Tipo: Salvaguarda","Tipo: Ataque"),sample.replace("200/250","300/250"),sample.replace("FOR 20","FOR 40"),sample.replace("Custo: 1 ação\n",""),sample.replace("6d10 radiante","muito dano")])assert.throws(()=>convert(s));
});
test("description is escaped; free text and other languages do not become characters",()=>{
  const r=convert(sample.replace("Um decreto divino.","<script>alert(1)</script>"));assert.match(r.data.actions[0].description,/&lt;script&gt;/);
  assert.equal(convert("Uma história sem estrutura","a.txt").route,null);
  assert.equal(convert(sample,"a.py").route,null);
  assert.equal(convert("const x = 1;","a.js").route,"executor-js");
  assert.equal(convert("schemaVersion: '9.1'\nactor:\n  name: Ira\n  type: npc","a.yaml").route,"actor");
});
test("personagem player type warns about calculated HP and AC",()=>{
  const r=convert("Personagem: Exemplo\nTipo: Personagem\nPV: 20\nCA: 15\nFOR: 16","a.txt");assert.equal(r.data.actor.type,"character");assert.ok(r.warnings.some(w=>w.includes("recalculados")));
});

test("a check cannot silently turn an explicit saving throw into an ability check",()=>{assert.throws(()=>convert("Nome: Ira\nTipo: NPC\nHabilidade: Golpe\nTipo: Teste\nCusto: ação\nSalvaguarda: Sabedoria CD 19"),/incompatível/);});
