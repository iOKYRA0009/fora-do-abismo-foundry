import { compileActorBlueprintV91 } from "./blueprint-v91.js";
import { Dnd5eV6Adapter } from "../adapters/dnd5e-adapter.js";

export const SYNC_FIELDS=Object.freeze([
  {id:"abilities",label:"Valores dos seis atributos"},
  {id:"hpMax",label:"PV máximo (NPC; não altera PV atual)"},
  {id:"biography",label:"Biografia"},
  {id:"portrait",label:"Retrato (caminho explícito no JSON)"},
  {id:"token",label:"Imagem do token protótipo (caminho explícito no JSON)"}
]);
const copy=x=>JSON.parse(JSON.stringify(x));
const get=(o,path)=>path.split(".").reduce((v,k)=>v?.[k],o);
const abilities=["str","dex","con","int","wis","cha"];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o??{},k);

export function selectiveSyncCatalog(source) {
  const payload=compileActorBlueprintV91(source);
  return (payload.items??[]).map((item,index)=>({index,name:item.name,type:item.type}));
}
export function prepareSelectiveSync(source,selection) {
  const payload=compileActorBlueprintV91(source);
  if(selection==null)return {payload,selection:null,skipped:0};
  if(!selection||!Array.isArray(selection.itemIndexes)||!Array.isArray(selection.actorFields))throw new Error("Seleção de sincronização inválida.");
  const indexes=selection.itemIndexes, fields=selection.actorFields;
  const items=payload.items??[];
  if(new Set(indexes).size!==indexes.length||indexes.some(i=>!Number.isInteger(i)||i<0||i>=items.length))throw new Error("Seleção de Items desatualizada ou inválida.");
  if(new Set(fields).size!==fields.length||fields.some(f=>!SYNC_FIELDS.some(s=>s.id===f)))throw new Error("Campo de Actor não permitido.");
  if(!indexes.length&&!fields.length)throw new Error("Selecione pelo menos um Item ou campo.");
  const keep=new Set(indexes), selected=items.filter((_,i)=>keep.has(i));
  // Full package is schema-validated before filtering. Only scenarios whose
  // Activities belong to selected Items are retained; unrelated tests aren't run.
  const activities=selected.flatMap(item=>item.jarvis?.activities??Object.values(item.system?.activities??{}));
  if(Array.isArray(payload.scenarios))payload.scenarios=payload.scenarios.filter(s=>activities.some(a=>a.name===s?.action&&a.type===s?.kind));
  payload.items=selected;
  return {payload,selection:{itemIndexes:[...indexes].sort((a,b)=>a-b),actorFields:SYNC_FIELDS.map(f=>f.id).filter(f=>fields.includes(f))},skipped:items.length-selected.length};
}
export function selectiveActorPatch(actor,payload,fields=[]) {
  const patch={},changes=[],warnings=[],errors=[];
  if(!fields.length)return {patch,changes,warnings,errors};
  const source=payload.actor;
  const adapted=Dnd5eV6Adapter.adaptActor(source);
  const raw=actor.toObject?.()??actor;
  const add=(field,path,next,validate)=>{
    if(next===undefined){warnings.push(field+": ausente no JSON; preservado.");return;}
    const before=get(raw,path);
    // Only change existing stored fields. Absence is not permission to invent a schema path.
    if(before===undefined){errors.push(field+": campo não disponível na ficha nativa.");return;}
    if(!validate(next)){errors.push(field+": valor inválido ou incompatível.");return;}
    if(JSON.stringify(before)===JSON.stringify(next))return;
    patch[path]=copy(next);changes.push({field,path,before:copy(before),after:copy(next)});
  };
  if(fields.includes("abilities")){
    let count=0;
    for(const key of abilities){
      const value=get(adapted,"system.abilities."+key+".value");
      if(value===undefined)continue;
      count++;add(key.toUpperCase(),"system.abilities."+key+".value",value,v=>Number.isInteger(v)&&v>=1&&v<=30);
    }
    if(!count)warnings.push("Atributos: ausentes no JSON; preservados.");
  }
  if(fields.includes("hpMax")){
    if(actor.type!=="npc")errors.push("PV máximo direto disponível apenas para NPC; personagens usam progressão nativa.");
    else add("PV máximo","system.attributes.hp.max",get(adapted,"system.attributes.hp.max"),v=>Number.isInteger(v)&&v>=0&&Number.isFinite(actor.system?.attributes?.hp?.value)&&v>=actor.system.attributes.hp.value);
  }
  if(fields.includes("biography"))add("Biografia","system.details.biography.value",get(adapted,"system.details.biography.value"),v=>typeof v==="string");
  const image=v=>typeof v==="string"&&v.trim().length>0&&v.length<=2048&&!/^(?:javascript|data):/i.test(v.trim());
  if(fields.includes("portrait"))add("Retrato","img",source.img,image);
  if(fields.includes("token"))add("Imagem do token","prototypeToken.texture.src",get(source,"prototypeToken.texture.src"),image);
  return {patch,changes,warnings,errors};
}
export function syncReviewRevision(review) {
  return JSON.stringify({actor:review.actor?.id,selection:review.selection??null,updates:review.updates,additions:review.additions,
    actorChanges:review.actorChanges??[],errors:review.errors,canImport:review.canImport});
}
