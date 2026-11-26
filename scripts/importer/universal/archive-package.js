import {readJarvisZip} from "./zip-reader.js";
import {compileActorBlueprintV91} from "../v9/blueprint-v91.js";
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const own=(o,k)=>Object.hasOwn(o,k);
const imageTypes={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif"};
const utf8=new TextDecoder("utf-8",{fatal:true});
function fail(m){throw Error("Pacote Jarvis: "+m);}
function only(o,allowed,label){if(!object(o))fail(label+" deve ser objeto.");for(const k of Object.keys(o))if(!allowed.includes(k))fail(label+": campo desconhecido "+k);}
function inspectData(v,depth=0,count={n:0}){
  if(++count.n>100000||depth>64)fail("Estrutura excessiva.");
  if(v&&typeof v==="object")for(const [k,x] of Object.entries(v)){
    if(k.split(".").some(p=>["__proto__","constructor","prototype"].includes(p)))fail("Chave reservada: "+k);
    if(/^(?:automation|script|scripts|macro|macros|command|flags)$/i.test(k))fail("Scripts, automações executáveis e flags não são aceitos nesta fase: "+k);
    inspectData(x,depth+1,count);
  }
}
function readJson(entries,path,used){
  if(typeof path!=="string"||!path.endsWith(".json")||!entries.has(path)||used.has(path))fail("Arquivo JSON ausente ou reutilizado: "+path);
  const bytes=entries.get(path);if(bytes.length>2*1024*1024)fail("JSON acima de 2 MB: "+path);
  let value;try{value=JSON.parse(utf8.decode(bytes));}catch{fail("JSON inválido: "+path);}
  inspectData(value);used.add(path);return value;
}
function refs(value,out=new Set()){
  if(typeof value==="string"&&value.startsWith("asset://"))out.add(value.slice(8));
  else if(value&&typeof value==="object")for(const x of Object.values(value))refs(x,out);
  return out;
}
/** Character archive is a declarative envelope, not an executable bundle. */
export async function prepareJarvisArchive(file,{makeFile=(bytes,name,mime)=>new File([bytes],name,{type:mime,lastModified:0})}={}){
  const entries=await readJarvisZip(file),used=new Set();
  const manifest=readJson(entries,"manifest.json",used);
  only(manifest,["schemaVersion","character","items","assets"],"manifest.json");
  if(manifest.schemaVersion!=="jarvis-character-1")fail("schemaVersion deve ser jarvis-character-1.");
  const input=readJson(entries,manifest.character,used);
  if(!object(input)||!["9.0","9.1"].includes(input.schemaVersion)||!object(input.actor)||!["character","npc"].includes(input.actor.type))fail("Use uma ficha Jarvis V9/V9.1 de NPC ou personagem.");
  if(manifest.items!==undefined){
    const list=readJson(entries,manifest.items,used);
    if(!Array.isArray(list)||!Array.isArray(input.items??[]))fail("Arquivo de habilidades deve conter lista de Items.");
    input.items=[...(input.items??[]),...list];
  }
  const actor=compileActorBlueprintV91(input);
  if((actor.items??[]).length>100)fail("Máximo de 100 Items por personagem.");
  const assets=[],files=[],ids=new Set();
  if(!Array.isArray(manifest.assets??[])||(manifest.assets??[]).length>40)fail("Informe até 40 imagens.");
  let total=0;
  for(const a of manifest.assets??[]){
    only(a,["id","path"],"Imagem");
    if(typeof a.id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(a.id)||ids.has(a.id.toLowerCase()))fail("ID de imagem inválido ou duplicado.");
    if(typeof a.path!=="string"||used.has(a.path)||!entries.has(a.path))fail("Imagem ausente ou reutilizada: "+a.path);
    const ext=a.path.split(".").pop().toLowerCase(),mime=own(imageTypes,ext)?imageTypes[ext]:null;
    const bytes=entries.get(a.path);
    if(!mime||!bytes.length||bytes.length>8*1024*1024)fail("Use PNG/JPG/WebP/GIF de até 8 MB.");
    total+=bytes.length;if(total>48*1024*1024)fail("Imagens acima de 48 MB.");
    const fileName=a.id+"."+ext;
    assets.push({id:a.id,fileName,mimeType:mime});
    files.push(makeFile(bytes,fileName,mime));ids.add(a.id.toLowerCase());used.add(a.path);
  }
  for(const path of entries.keys())if(!used.has(path))fail("Arquivo não declarado: "+path+". Remova arquivos extras e scripts.");
  const known=new Set(assets.map(a=>a.id));
  for(const id of refs(actor))if(!known.has(id))fail("Referência sem imagem declarada: asset://"+id);
  const data={schemaVersion:"jarvis-executor-1",name:actor.actor.name,actors:[actor],assets};
  const source=JSON.stringify(data,null,2);if(source.length>12*1024*1024)fail("Pacote JSON convertido acima de 12 MB.");
  return {format:"jarvis-archive",route:"executor-package",supported:true,source,data,files,
    warnings:["Importação de personagem novo pelo Executor. Arquivos de imagem só serão enviados após confirmação; uploads não têm reversão automática.","Sem scripts, flags externas, sinergias ou automações nesta fase. Tema de ficha aceita paleta e caminho local já existente; marca-d'água embutida não é suportada."],
    message:"Pacote lido em memória: "+actor.actor.name+", "+(actor.items??[]).length+" Items, "+files.length+" imagens."};
}
