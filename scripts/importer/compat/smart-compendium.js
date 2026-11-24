import { bilingualNames, glossary, normalizeTerm } from "../../translation/compendium-language.js";
const MODULE_ID="fora-do-abismo-foundry";
const clone=x=>globalThis.foundry?.utils?.deepClone?.(x)??structuredClone(x);
const values=x=>Array.from(x?.contents??x??[]);
const custom=new Set(["official-modified","homebrew","homebrew-extension"]);
const official=new Set(["official-system","official-recreation"]);
const states=new Set(["quantity","equipped","attuned","identified","container","prepared","description"]);
export function declaredKind(i) {
  const f=i?.flags?.[MODULE_ID]??{};
  return i?.jarvis?.provenance?.kind??f.provenanceOverride?.kind??f.provenanceInput?.kind??f.provenance?.kind??null;
}
export function compendiumOrigin(i) {
  const f=i?.flags??{};
  return [i?.jarvis?.provenance?.uuid,f[MODULE_ID]?.provenanceInput?.uuid,i?._stats?.compendiumSource,f.dnd5e?.sourceId,f.core?.sourceId,f[MODULE_ID]?.sourceId,i?.system?.source?.uuid,i?.uuid].find(x=>typeof x==="string"&&x.startsWith("Compendium."))??null;
}
const edition=i=>String(i?.system?.source?.rules??i?.jarvis?.provenance?.rules??"");
const identifier=i=>normalizeTerm(i?.system?.identifier??i?.jarvis?.identifier??"");
const names=(i,t)=>new Set(bilingualNames(i,t).map(normalizeTerm).filter(Boolean));
const intersects=(a,b)=>[...a].some(v=>b.has(v));
export function sameBilingualName(a,b) {
  const t=glossary();return a?.type===b?.type&&intersects(names(a,t),names(b,t));
}
export function sameCompendiumIdentity(a,b) {
  return a?.type===b?.type&&!custom.has(declaredKind(a))&&!custom.has(declaredKind(b))&&Boolean(compendiumOrigin(a)&&compendiumOrigin(a)===compendiumOrigin(b));
}
function stable(x) {
  if(x instanceof Set)return [...x].map(stable).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(Array.isArray(x))return x.map(stable);
  if(x&&typeof x==="object")return Object.fromEntries(Object.keys(x).sort().filter(k=>k!=="_stats").map(k=>[k,stable(x[k])]));
  return x;
}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export function mechanicalDifferences(source,base) {
  const diff=Object.keys(source?.jarvis??{}).filter(k=>!["provenance","organization","identifier","description"].includes(k)).map(k=>"jarvis."+k);
  for(const [k,v] of Object.entries(source?.system??{})) {
    if(states.has(k)||["source","identifier"].includes(k))continue;
    if(k==="uses"){
      const strip=x=>Object.fromEntries(Object.entries(x??{}).filter(([key])=>key!=="spent"));
      if(!same(strip(v),strip(base?.system?.uses)))diff.push("system.uses");
    }else if(!same(v,base?.system?.[k]))diff.push("system."+k);
  }
  if(source?.effects!==undefined&&!same(source.effects,base?.effects??[]))diff.push("effects");
  if(Object.keys(source?.flags??{}).some(k=>!["core","dnd5e","babele",MODULE_ID].includes(k)))diff.push("flags (módulos parceiros)");
  return diff;
}
function overlay(base,source,uuid) {
  const out=clone(base);
  if(source._id)out._id=source._id;else delete out._id;
  for(const k of ["name","sort"])if(source[k]!==undefined)out[k]=clone(source[k]);
  if(source.img&&!source.img.startsWith("icons/svg/"))out.img=source.img;
  out.system??={};
  for(const k of states)if(source.system?.[k]!==undefined)out.system[k]=clone(source.system[k]);
  if(source.system?.uses?.spent!==undefined){out.system.uses??={};out.system.uses.spent=source.system.uses.spent;}
  if(source.jarvis)out.jarvis=clone(source.jarvis);
  // Preserve explicit metadata, translations and advancement links.
  out.flags={...(out.flags??{}),...clone(source.flags??{})};
  out._stats={...(out._stats??{}),compendiumSource:uuid};
  return out;
}
export async function resolveSmartCompendiums(items=[],{packs=globalThis.game?.packs,resolveUuid=globalThis.fromUuid}={}) {
  const terms=glossary(),indexErrors=[],output=[],report=[];
  const packList=values(packs).filter(p=>(p.documentName??p.metadata?.type)==="Item"&&p.visible!==false&&typeof p.getIndex==="function");
  let pending;
  const indexes=()=>pending??=(async()=>{
    const result=[];
    for(const pack of packList)try{
      const index=await pack.getIndex({fields:["name","type","system.identifier","system.source.rules","flags.babele.originalName","flags.core.originalName"]});
      for(const entry of values(index))result.push({pack,entry});
    }catch(e){indexErrors.push({pack:pack.collection??pack.metadata?.id,message:String(e?.message??e)});}
    return result;
  })();
  const loaded=new Map();
  for(const source of items){
    const origin=compendiumOrigin(source),kind=declaredKind(source);
    const baseHint=source?.jarvis?.provenance?.baseUuid;
    const baseUuid=typeof baseHint==="string"&&baseHint.startsWith("Compendium.")?baseHint:null;
    const row={name:source.name,type:source.type};
    const explicitOfficial=official.has(kind);
    const hasMechanics=Object.keys(source.system??{}).some(k=>!states.has(k)&&!["source","identifier"].includes(k)) || Object.keys(source.jarvis??{}).some(k=>!["provenance","organization","identifier","description"].includes(k)) || Boolean(source.effects?.length);
    const preserve=(status,extra={})=>{output.push(clone(source));report.push({...row,status,...extra,requiresReview:explicitOfficial&&!hasMechanics&&["unresolved","ambiguous","candidate"].includes(status)});};
    let candidates=[];
    if(origin||baseUuid)candidates=[{uuid:origin??baseUuid}];
    else if(kind!=="homebrew")candidates=(await indexes()).filter(({entry})=>entry.type===source.type
      &&((identifier(source)&&identifier(source)===identifier(entry))||intersects(names(source,terms),names(entry,terms)))
      &&(!edition(source)||!edition(entry)||edition(source)===edition(entry)))
      .map(x=>({...x,uuid:x.entry.uuid??"Compendium."+(x.pack.collection??x.pack.metadata?.id)+".Item."+(x.entry._id??x.entry.id)}));
    candidates=[...new Map(candidates.map(x=>[x.uuid,x])).values()];
    if(!origin&&!baseUuid&&indexErrors.length&&candidates.length===1){
      preserve("ambiguous",{candidates:candidates.map(x=>x.uuid),reason:"Índices incompletos: não é seguro selecionar a única fonte visível."});continue;
    }
    if(candidates.length!==1){
      preserve(candidates.length?"ambiguous":custom.has(kind)?"homebrew":official.has(kind)||origin?"unresolved":"unverified",
        {candidates:candidates.map(x=>x.uuid),reason:candidates.length?"Mais de uma fonte; escolha manual.":"Nenhuma fonte comprovada; dados preservados."});continue;
    }
    const c=candidates[0];let doc=loaded.get(c.uuid);
    if(!loaded.has(c.uuid)){
      try{doc=c.pack?.getDocument?await c.pack.getDocument(c.entry._id??c.entry.id):await resolveUuid?.(c.uuid,{strict:false});}catch{doc=null;}
      loaded.set(c.uuid,doc);
    }
    const b=doc?.toObject?.()??doc;
    if(doc?.documentName!=="Item"||b?.type!==source.type||(edition(source)&&edition(b)&&edition(source)!==edition(b))){
      preserve("unresolved",{uuid:c.uuid,reason:"Fonte indisponível ou incompatível."});continue;
    }
    const differences=mechanicalDifferences(source,b);
    const strong=origin||(identifier(source)&&identifier(source)===identifier(b)&&edition(source)&&edition(source)===edition(b));
    if(baseUuid&&!origin||custom.has(kind)||differences.length||(!strong&&!official.has(kind))){
      preserve(baseUuid&&!origin||custom.has(kind)||differences.length?"modified-preserved":"candidate",{uuid:c.uuid,differences,reason:"Base localizada; dados enviados preservados sem mesclagem automática."});continue;
    }
    output.push(overlay(b,source,c.uuid));report.push({...row,status:"rehydrated",uuid:c.uuid,differences:[]});
  }
  return {items:output,report,indexErrors,environment:{foundry:globalThis.game?.version??null,dnd5e:globalThis.game?.system?.version??null,jarvis:globalThis.game?.modules?.get?.(MODULE_ID)?.version??null,itemPacks:packList.length}};
}
