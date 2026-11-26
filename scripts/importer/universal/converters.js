import { parseStructuredCharacterText } from "./structured-text.js";
import {compileActorBlueprintV91} from "../v9/blueprint-v91.js";
import {parseRestrictedYaml} from "./restricted-yaml.js";
import {detectUniversalSource} from "./source-detector.js";
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const allowedTypes=new Set(["character","npc"]);
const flatFields=new Set(["name","type","hp","hpMax","ac","str","dex","con","int","wis","cha","biography","img"]);
const actionFields=new Set(["name","kind","activation","description","ability","dc","toHit","range","classification","formula","damageType","onSave","healing","healingType","distance","units","roll"]);
const own=(o,k)=>Object.hasOwn(o,k);
function assertData(v,depth=0,count={n:0}){
  if(++count.n>100000||depth>64)throw Error("Documento excede limites de estrutura.");
  if(v&&typeof v==="object")for(const [k,x] of Object.entries(v)){
    if(k.split(".").some(part=>["__proto__","prototype","constructor"].includes(part)))throw Error("Chave reservada não permitida: "+k);
    assertData(x,depth+1,count);
  }
  else if(typeof v==="number"&&!Number.isFinite(v))throw Error("Número inválido.");
}
function keysOnly(o,keys,label){for(const k of Object.keys(o))if(!keys.has(k))throw Error(label+": campo desconhecido "+k);}
function number(v,key,min,max){
  if(v===""||v==null||typeof v==="boolean"||!/^[-+]?\d+$/.test(String(v)))throw Error(key+": informe um inteiro.");
  const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(key+": valor fora do intervalo.");return n;
}
function flatActor(row,actions=[]){
  keysOnly(row,flatFields,"Ficha");
  const name=String(row.name??"").trim(),type=String(row.type??"").trim();
  if(!name||!allowedTypes.has(type))throw Error("Ficha: name e type (npc ou character) são obrigatórios.");
  const actor={name,type,jarvis:{}},j=actor.jarvis;
  if(row.img)actor.img=String(row.img);
  if(row.biography!==undefined&&row.biography!=="")j.details={biography:String(row.biography)};
  for(const k of ["str","dex","con","int","wis","cha"])if(row[k]!==undefined&&row[k]!==""){j.abilities??={};j.abilities[k]=number(row[k],k,1,30);}
  if(row.hp!==undefined&&row.hp!==""){j.hp={value:number(row.hp,"hp",0,1000000),max:number(row.hpMax==null||row.hpMax===""?row.hp:row.hpMax,"hpMax",0,1000000)};}
  else if(row.hpMax!==undefined&&row.hpMax!=="")j.hp={max:number(row.hpMax,"hpMax",0,1000000)};
  if(row.ac!==undefined&&row.ac!=="")j.ac=number(row.ac,"ac",0,1000);
  const payload={schemaVersion:"9.1",actor,actions};compileActorBlueprintV91(payload);return payload;
}
function flatAction(row){
  keysOnly(row,actionFields,"Ação");
  const action={};for(const [k,v] of Object.entries(row)){
    if(v==="")continue;
    if(["formula","damageType"].includes(k))continue;
    action[k]=["dc","toHit","distance"].includes(k)?number(v,k,k==="toHit"?-20:1,k==="distance"?100000:40):String(v);
  }
  if(own(row,"formula")||own(row,"damageType")){
    if(!row.formula||!row.damageType||!["attack","save","damage"].includes(action.kind))throw Error("Ação: formula e damageType devem ser usados juntos em ataque, dano ou salvaguarda.");
    action.damage={formula:String(row.formula),type:String(row.damageType)};
  }
  return action;
}
/** CSV uses comma or semicolon; RFC-style double quoting and embedded line breaks. */
export function parseCsv(source){
  const first=String(source).split(/\r?\n/,1)[0],delimiter=first.includes(";")?";":",";
  const rows=[];let row=[],cell="",quoted=false,closed=false;
  function field(){row.push(cell);cell="";closed=false;}
  function line(){field();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>21)throw Error("CSV aceita até 20 personagens.");}
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(quoted){if(ch==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
    if(ch===delimiter){field();continue;}
    if(ch==="\r"||ch==="\n"){if(ch==="\r"&&source[i+1]==="\n")i++;line();continue;}
    if(closed)throw Error("CSV: caractere após aspas de fechamento.");
    if(ch==='"'){if(cell)throw Error("CSV: aspas em campo não delimitado.");quoted=true;}else cell+=ch;
  }
  if(quoted)throw Error("CSV: aspas não fechadas.");
  if(cell||row.length||closed)line();
  if(rows.length<2)throw Error("CSV: cabeçalho e pelo menos uma ficha são obrigatórios.");
  const headers=rows.shift().map(s=>s.trim());
  if(new Set(headers).size!==headers.length||headers.some(h=>!flatFields.has(h))||!headers.includes("name")||!headers.includes("type"))throw Error("CSV: cabeçalho inválido. Use name,type e campos de ficha documentados.");
  return rows.map((r,i)=>{if(r.length!==headers.length)throw Error("CSV linha "+(i+2)+": quantidade de colunas incorreta.");return flatActor(Object.fromEntries(headers.map((h,j)=>[h,r[j]])));});
}
/** Deliberately small XML grammar: plain elements, no attributes or external entities. */
function decodeXml(s){
  if(/&(?!(?:amp|lt|gt|quot|apos);)/.test(s))throw Error("XML: entidade não suportada.");
  return s.replace(/&(amp|lt|gt|quot|apos);/g,(_,k)=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"})[k]);
}
export function parseActorXml(input){
  const s=input.trim().replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>\s*/i,"");
  const stack=[],roots=[];let pos=0,nodes=0;
  const pattern=/<\/?[A-Za-z][A-Za-z0-9]*\s*\/?>|[^<]+/gy;
  while(pos<s.length){
    pattern.lastIndex=pos;const m=pattern.exec(s);if(!m)throw Error("XML: apenas elementos simples, sem atributos, DTD, comentários ou instruções.");
    pos=pattern.lastIndex;const t=m[0];
    if(t[0]!=="<"){if(stack.length)stack.at(-1).text+=decodeXml(t);else if(t.trim())throw Error("XML: texto fora da raiz.");continue;}
    const tag=t.match(/^<(\/?)([A-Za-z][A-Za-z0-9]*)\s*(\/?)>$/);
    if(!tag)throw Error("XML: elemento inválido.");
    const [,closing,name,self]=tag;
    if(closing){if(self||stack.pop()?.name!==name)throw Error("XML: fechamento incorreto.");continue;}
    if(++nodes>10000||stack.length>32)throw Error("XML: estrutura excessiva.");
    const node={name,text:"",children:[]};
    if(stack.length)stack.at(-1).children.push(node);else roots.push(node);
    if(!self)stack.push(node);
  }
  if(stack.length||roots.length!==1||roots[0].name!=="actor")throw Error("XML: raiz única <actor> obrigatória.");
  const root=roots[0],row={},actions=[];let actionSeen=false;
  if(root.text.trim())throw Error("XML: conteúdo misto na raiz.");
  for(const node of root.children){
    if(node.name==="actions"){
      if(actionSeen||node.text.trim())throw Error("XML: lista actions inválida.");actionSeen=true;
      for(const action of node.children){
        if(action.name!=="action"||action.text.trim())throw Error("XML: use elementos action em actions.");
        const fields=Object.create(null);
        for(const f of action.children){if(f.children.length||own(fields,f.name))throw Error("XML: campo de ação inválido ou repetido.");fields[f.name]=f.text.trim();}
        actions.push(flatAction(fields));
      }
    }else{
      if(node.children.length||own(row,node.name)||!flatFields.has(node.name))throw Error("XML: campo inválido ou repetido: "+node.name);
      row[node.name]=node.text.trim();
    }
  }
  return flatActor(row,actions);
}
function convertNative(data){
  if(!allowedTypes.has(data.type))throw Error("Somente Actors character e npc do D&D5e são suportados.");
  const systemId=data._stats?.systemId??data.flags?.exportSource?.system;
  if(typeof systemId==="string"&&systemId&&systemId!=="dnd5e")throw Error("Actor exportado de outro sistema: "+systemId);
  if(data.prototypeToken!=null&&!object(data.prototypeToken))throw Error("Token protótipo inválido.");
  const warnings=["Cópia para revisão V9.0, não restauração integral do mundo. IDs do Actor, permissões, pasta, flags externas e metadados de mundo não são copiados.",
    "Itens, Activities, efeitos e IDs internos são preservados quando fornecidos. Referências UUID ao Actor original, módulos externos, fórmulas e migrações exigem revisão; imagens devem existir no mundo de destino."];
  if(!object(data.system)||!Array.isArray(data.items??[])||!Array.isArray(data.effects??[]))throw Error("Actor nativo: system, items ou effects inválidos.");
  const fields=(source,allowed)=>Object.fromEntries(allowed.filter(k=>own(source,k)).map(k=>[k,structuredClone(source[k])]));
  const effect=e=>{if(!object(e)||typeof e.name!=="string")throw Error("Efeito nativo inválido.");return fields(e,["_id","name","img","type","system","changes","disabled","duration","origin","transfer","statuses","description","tint","sort","start"]);};
  const actor=fields(data,["name","type","img","system","prototypeToken"]);
  if(actor.prototypeToken){delete actor.prototypeToken._id;delete actor.prototypeToken.actorId;delete actor.prototypeToken.flags;}
  const items=(data.items??[]).map(i=>{
    if(!object(i)||!object(i.system))throw Error("Item nativo inválido.");
    const item=fields(i,["_id","name","type","img","system","sort"]);
    if(i.effects!==undefined){if(!Array.isArray(i.effects))throw Error("Efeitos do Item inválidos.");item.effects=i.effects.map(effect);}
    for(const a of Object.values(item.system.activities??{}))if(object(a))delete a.flags;
    return item;
  });
  const payload={schemaVersion:"9.0",actor,items,effects:(data.effects??[]).map(effect)};
  compileActorBlueprintV91(payload);return {payload,warnings};
}
export function convertUniversalSource(detected){
  const {format,source}=detected;
  let payload,warnings=[],route="actor";
  if(format==="structured-character-text")({payload,warnings}=parseStructuredCharacterText(source));
  else if(format==="foundry-actor"){assertData(detected.data);({payload,warnings}=convertNative(detected.data));}
  else if(format==="yaml"){
    const data=parseRestrictedYaml(source);assertData(data);
    const parsed=detectUniversalSource(JSON.stringify(data));
    if(parsed.route==="actor"){payload=parsed.data;compileActorBlueprintV91(payload);}
    else if(parsed.route==="items"){payload=parsed.data;route="items";}
    else if(parsed.format==="foundry-actor")({payload,warnings}=convertNative(data));
    else throw Error("YAML deve representar uma ficha V9/V9.1, Actor nativo ou lista de Items.");
  }else if(format==="xml")payload=parseActorXml(source);
  else if(format==="csv"){
    const actors=parseCsv(source);
    if(actors.length===1)payload=actors[0];
    else{route="executor-package";payload={schemaVersion:"jarvis-executor-1",name:"Importação CSV",actors:actors.map(compileActorBlueprintV91)};warnings.push("Lote de "+actors.length+" novos personagens: revise duplicatas no Executor.");}
  }else return detected;
  assertData(payload);
  const convertedSource=JSON.stringify(payload,null,2);
  if(convertedSource.length>2*1024*1024)throw Error("Conversão acima de 2 MB. Divida o conteúdo em arquivos menores.");
  return {...detected,route,supported:true,data:payload,source:convertedSource,warnings,
    message:"Conversão concluída em memória. Revise antes de criar ou atualizar documentos."};
}
