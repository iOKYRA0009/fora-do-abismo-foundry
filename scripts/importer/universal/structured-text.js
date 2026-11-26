import {compileActorBlueprintV91} from "../v9/blueprint-v91.js";
const norm=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const aliases={
  str:"str",for:"str",forca:"str",dex:"dex",des:"dex",destreza:"dex",con:"con",constituicao:"con",
  int:"int",inteligencia:"int",wis:"wis",sab:"wis",sabedoria:"wis",cha:"cha",car:"cha",carisma:"cha"
};
const lookup=(map,value)=>Object.hasOwn(map,norm(value))?map[norm(value)]:undefined;
const kinds={ataque:"attack",attack:"attack",salvaguarda:"save","teste de resistencia":"save",save:"save",teste:"check",check:"check",dano:"damage",damage:"damage",cura:"heal",heal:"heal",utilidade:"utility",utility:"utility",teleporte:"teleport",teleport:"teleport"};
const costs={acao:"action",action:"action","acao bonus":"bonus",bonus:"bonus",reacao:"reaction",reaction:"reaction"};
const damageTypes={acido:"acid",contundente:"bludgeoning",frio:"cold",fogo:"fire",energia:"force",forca:"force",eletrico:"lightning",eletricidade:"lightning",necrótico:"necrotic",necrotico:"necrotic",perfurante:"piercing",veneno:"poison",psiquico:"psychic",radiante:"radiant",cortante:"slashing",trovejante:"thunder",trovao:"thunder"};
const damageEnglish=new Set(Object.values(damageTypes));
const actorFields={"nome":"name","personagem":"name","ficha":"name","tipo":"type","pv":"hp","pontos de vida":"hp","pv maximo":"hpMax","ca":"ac","classe de armadura":"ac","atributos":"abilities","biografia":"bio","retrato":"img","token":"token"};
const actionFields={"tipo":"kind","custo":"activation","ativacao":"activation","dano":"damage","cura":"healing","salvaguarda":"save","teste":"check","atributo":"ability","cd":"dc","acerto":"toHit","bonus de ataque":"toHit","alcance":"range","classificacao":"classification","sucesso":"onSave","usos":"uses","recuperacao":"recovery","distancia":"distance","rolagem":"roll","descricao":"description"};
function lineText(line){return line.trim().replace(/^#{1,6}\s+/,"").replace(/^[-*]\s+/,"").replace(/\*\*([^*]+)\*\*/g,"$1").trim();}
function entry(line){const m=lineText(line).match(/^([^:]+):\s*(.*)$/);return m?[norm(m[1]),m[2].trim()]:null;}
/** Explicit markers or a heading followed by an explicit character type. */
export function isStructuredCharacterText(source){
  const lines=String(source).split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length)return false;
  const first=entry(lines[0]);
  const typed=lines.slice(0,8).some(l=>{const e=entry(l);return e?.[0]==="tipo"&&/^(npc|personagem|character|jogador)$/i.test(e[1]);});
  return typed&&((first&&["nome","ficha","personagem"].includes(first[0]))||/^#\s+[^#]/.test(lines[0].trim()));
}
function fail(line,message){throw Error("Ficha em texto, linha "+line+": "+message);}
function int(v,line,label,min,max){
  if(!/^[+-]?\d+$/.test(String(v)))fail(line,label+": informe um inteiro.");
  const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)fail(line,label+": fora do intervalo "+min+" a "+max+".");return n;
}
function mapped(map,v,line,label){const x=lookup(map,v);if(!x)fail(line,label+": valor desconhecido '"+v+"'.");return x;}
function dmg(v,line){
  const m=v.match(/^(.+?)\s+([a-zà-ú]+)$/i);
  if(!m)fail(line,"Dano: use fórmula e tipo, exemplo 6d10 radiante.");
  const type=lookup(damageTypes,m[2])??(damageEnglish.has(norm(m[2]))?norm(m[2]):null);
  if(!type)fail(line,"Tipo de dano desconhecido: "+m[2]);
  return {formula:m[1].trim(),type};
}
function resistance(v,line){const m=v.match(/^(.+?)\s*,?\s+CD\s+(\d+)$/i);if(!m)fail(line,"Use atributo e CD, exemplo Sabedoria CD 19.");return {ability:mapped(aliases,m[1],line,"Atributo"),dc:int(m[2],line,"CD",1,40)};}
function image(v,line){if(/^(?:data|javascript|vbscript):/i.test(v)||/[<>\u0000-\u001f]/.test(v)||v.length>2048)fail(line,"Caminho de imagem inválido.");return v;}
function claim(seen,key,line){if(seen.has(key))fail(line,"Campo repetido ou conflitante: "+key);seen.add(key);}
export function parseStructuredCharacterText(source){
  if(!isStructuredCharacterText(source))throw Error("Informe Nome/Personagem e Tipo: NPC ou Personagem.");
  const actor={jarvis:{}},j=actor.jarvis,actions=[],seen=new Set(),names=new Set();
  let active=null,local=null,activeLine=0;
  const warnings=["Somente os campos estruturados foram convertidos. Descrições são texto, não automações; sinergias e regras especiais devem ser configuradas separadamente."];
  function finish(){
    if(!active)return;
    if(!active.kind||!active.activation)fail(activeLine,"Habilidade exige Tipo e Custo explícitos.");
    const permitted={
      attack:["ability","toHit","range","classification","damage"],save:["ability","dc","damage","onSave"],
      check:["ability","dc"],damage:["damage"],heal:["healing"],teleport:["distance","units"],utility:["roll"]
    }[active.kind];
    for(const k of Object.keys(active))if(!["name","kind","activation","description","uses","recovery"].includes(k)&&!permitted.includes(k))fail(activeLine,"Campo "+k+" incompatível com "+active.kind+".");
    if(active.kind==="save"&&active.damage&&!active.onSave)fail(activeLine,"Informe Sucesso: metade, nenhum ou total quando houver dano.");
    if(active.onSave&&!active.damage)fail(activeLine,"Sucesso exige dano na salvaguarda.");
    if(active.recovery&&!active.uses)fail(activeLine,"Recuperação exige Usos.");
    if(active.uses&&active.recovery){active.uses.recovery=[active.recovery];delete active.recovery;}
    if(names.has(norm(active.name)))fail(activeLine,"Nome de habilidade duplicado.");
    names.add(norm(active.name));actions.push(active);if(actions.length>100)fail(activeLine,"Máximo de 100 habilidades.");
  }
  const lines=String(source).split(/\r?\n/);
  if(lines.length>5000)throw Error("Ficha acima de 5000 linhas.");
  for(let i=0;i<lines.length;i++){
    const raw=lines[i],line=i+1;if(!raw.trim())continue;
    const clean=lineText(raw);let e=entry(raw);
    if(!e&&!seen.size&&/^#\s+[^#]/.test(raw.trim()))e=["nome",clean];
    if(!e){if(/^#{1,6}\s+(?:habilidades|acoes|atributos)\s*$/i.test(raw.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"")))continue;fail(line,"Linha não reconhecida. Use Campo: valor.");}
    const [key,v]=e;if(!v)fail(line,"Valor ausente: "+key);
    if(["habilidade","acao"].includes(key)){
      finish();active={name:v};local=new Set();activeLine=line;continue;
    }
    if(active){
      const field=lookup(actionFields,key);if(!field)fail(line,"Campo de habilidade desconhecido: "+key);
      if(field==="save"||field==="check"){
        claim(local,"ability",line);claim(local,"dc",line);
        const r=resistance(v,line);Object.assign(active,r);
        // These fields express a roll, not an implicit ability type.
        local.add("rollKind:"+field);continue;
      }
      claim(local,field,line);
      if(field==="kind")active.kind=mapped(kinds,v,line,"Tipo");
      else if(field==="activation")active.activation=mapped(costs,v.replace(/^1\s+/,""),line,"Custo");
      else if(field==="damage")active.damage=dmg(v,line);
      else if(field==="ability")active.ability=mapped(aliases,v,line,"Atributo");
      else if(field==="dc")active.dc=int(v,line,"CD",1,40);
      else if(field==="toHit")active.toHit=int(v,line,"Acerto",-20,40);
      else if(field==="range")active.range=mapped({"corpo a corpo":"melee","a distancia":"ranged",melee:"melee",ranged:"ranged"},v,line,"Alcance");
      else if(field==="classification")active.classification=mapped({arma:"weapon",magia:"spell",desarmado:"unarmed",weapon:"weapon",spell:"spell",unarmed:"unarmed"},v,line,"Classificação");
      else if(field==="onSave")active.onSave=mapped({metade:"half",nenhum:"none",total:"full",half:"half",none:"none",full:"full"},v,line,"Sucesso");
      else if(field==="uses")active.uses={max:String(int(v,line,"Usos",1,10000)),spent:0};
      else if(field==="recovery")active.recovery=mapped({"descanso curto":"sr","descanso longo":"lr","amanhecer":"dawn",sr:"sr",lr:"lr",dawn:"dawn"},v,line,"Recuperação");
      else if(field==="distance"){const m=v.match(/^(\d+)\s*(m|ft|pes|pés)$/i);if(!m)fail(line,"Distância: informe valor e unidade m ou ft.");active.distance=int(m[1],line,"Distância",1,100000);active.units=norm(m[2])==="m"?"m":"ft";}
      else if(field==="description")active.description="<p>"+escapeHtml(v)+"</p>";
      else active[field]=v;
    }else{
      const ability=lookup(aliases,key);
      if(ability){claim(seen,ability,line);j.abilities??={};j.abilities[ability]=int(v,line,key,1,30);continue;}
      const field=lookup(actorFields,key);if(!field)fail(line,"Campo de ficha desconhecido: "+key);
      claim(seen,field,line);
      if(field==="name")actor.name=v;
      else if(field==="type")actor.type=mapped({npc:"npc",personagem:"character",character:"character",jogador:"character"},v,line,"Tipo");
      else if(field==="hp"){
        const parts=v.split("/");if(parts.length>2)fail(line,"PV: use valor ou atual/máximo.");
        j.hp??={};j.hp.value=int(parts[0].trim(),line,"PV",0,1000000);
        if(parts.length===2){claim(seen,"hpMax",line);j.hp.max=int(parts[1].trim(),line,"PV máximo",0,1000000);}
      }else if(field==="hpMax"){j.hp??={};j.hp.max=int(v,line,"PV máximo",0,1000000);}
      else if(field==="ac")j.ac=int(v,line,"CA",0,1000);
      else if(field==="abilities"){
        for(const part of v.split(/[,;]+/)){
          const m=part.trim().match(/^(.+?)\s+(\d+)$/);if(!m)fail(line,"Atributos: use FOR 20, DES 16.");
          const a=mapped(aliases,m[1],line,"Atributo");claim(seen,a,line);j.abilities??={};j.abilities[a]=int(m[2],line,a,1,30);
        }
      }else if(field==="bio")j.details={biography:"<p>"+escapeHtml(v)+"</p>"};
      else if(field==="img")actor.img=image(v,line);
      else if(field==="token")actor.prototypeToken={texture:{src:image(v,line)}};
    }
    if(active&&((local.has("rollKind:save")&&active.kind&&active.kind!=="save")||(local.has("rollKind:check")&&active.kind&&active.kind!=="check")))fail(line,"Tipo de habilidade incompatível com a rolagem declarada.");
  }
  finish();
  if(j.hp?.value!==undefined&&j.hp.max===undefined)j.hp.max=j.hp.value;
  if(actor.type==="character"&&(j.hp?.max!==undefined||j.ac!==undefined))warnings.push("Personagens jogadores: PV máximo e CA podem ser recalculados pelo sistema; confira classes, equipamento e progressão.");
  const payload={schemaVersion:"9.1",actor,actions};
  compileActorBlueprintV91(payload);
  return {payload,warnings};
}
