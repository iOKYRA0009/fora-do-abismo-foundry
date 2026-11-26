/** Read-only dependency checks for embedded D&D5e activities. Never executes scripts. */
const MODULE_ID="fora-do-abismo-foundry";
const values=x=>Array.isArray(x)?x:Array.from(x?.values?.()??Object.values(x??{}));
const normalized=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,64);
function getPath(object,path) {
  if(typeof path!=="string"||!path||path.split(".").some(k=>!k||["__proto__","constructor","prototype"].includes(k)))return undefined;
  return path.split(".").reduce((v,k)=>v==null?undefined:v[k],object);
}
export function auditActorDependencies(actor) {
  if(!actor?.id)throw new Error("Selecione uma ficha.");
  const items=values(actor.items),byId=new Map(items.map(i=>[i.id??i._id,i]));
  const keys=new Map(),issues=[];
  let activities=0,dependencies=0;
  for(const item of items)for(const key of new Set([normalized(item.name),normalized(item.system?.identifier)].filter(Boolean))){
    const matches=keys.get(key)??[];matches.push(item);keys.set(key,matches);
  }
  const issue=(severity,code,item,activity,message,fix)=>issues.push({severity,code,item:item.name,itemId:item.id??item._id,activity:activity.name,activityId:activity.id??activity._id,message,fix});
  for(const item of items)for(const a of values(item.system?.activities)){
    activities++;
    for(const t of values(a.consumption?.targets)){
      if(!["itemUses","material","attribute"].includes(t.type))continue;
      dependencies++;
      const target=String(t.target??"");
      if(t.type==="attribute"){
        const val=getPath(actor.system,target);
        if(val===undefined||val===null||typeof val!=="number"||!Number.isFinite(val))issue("error","attribute-missing",item,a,"Recurso numérico ausente: "+target,"Selecione um atributo de consumo válido na Activity.");
        continue;
      }
      let linked;
      if(target.startsWith("@jarvis:")){
        const matches=keys.get(normalized(target.slice(8)))??[];
        if(matches.length!==1)issue("error",matches.length?"ambiguous-item":"missing-item",item,a,"Referência não resolvida: "+target,"Corrija a referência ou restaure o Item necessário.");
        else issue("warning","unresolved-reference",item,a,"Referência textual ainda não vinculada: "+target,"Selecione o Item correspondente na Activity; ID sugerido: "+(matches[0].id??matches[0]._id));
        continue;
      }
      linked=target?byId.get(target):t.type==="itemUses"?item:null;
      if(!linked){issue("error","missing-item",item,a,"Item de consumo não encontrado: "+(target||"(vazio)"),"Restaure o Item ou selecione um novo alvo de consumo.");continue;}
      if(t.type==="itemUses"&&!linked.system?.uses)issue("warning","missing-uses",item,a,"Item vinculado sem estrutura de usos: "+linked.name,"Confira o recurso de usos no Item.");
    }
    const effects=values(item.effects),effectIds=new Set(effects.map(e=>e.id??e._id));
    for(const ref of values(a.effects)){
      const id=ref?._id??ref?.id;
      if(typeof id!=="string"||!id)continue;
      dependencies++;
      if(!effectIds.has(id))issue("error","missing-effect",item,a,"Active Effect vinculado não encontrado: "+id,"Vincule um efeito existente à Activity.");
    }
    const automation=a.flags?.[MODULE_ID]?.automation;
    const raw=automation?.effects??automation?.effect??[];
    for(const config of (Array.isArray(raw)?raw:[raw]).filter(Boolean)){
      const id=typeof config==="object"?config.effectId:null;
      const name=typeof config==="string"?config:config.effectName;
      if(!id&&!name)continue;
      dependencies++;
      if(id&&effectIds.has(String(id)))continue;
      const matches=name?effects.filter(e=>String(e.name??"").trim().toLowerCase()===String(name).trim().toLowerCase()):[];
      if(matches.length===1){if(id)issue("warning","effect-fallback",item,a,"ID antigo; nome encontra "+name,"Atualize effectId para "+(matches[0].id??matches[0]._id));continue;}
      issue("warning",matches.length>1?"ambiguous-effect":"automation-effect",item,a,"Referência de efeito explícita ausente ou ambígua: "+(name||id),"Revise effectId/effectName. O executor pode usar um efeito de fallback.");
    }
  }
  return {actor:actor.name,items:items.length,activities,dependencies,errors:issues.filter(i=>i.severity==="error").length,warnings:issues.filter(i=>i.severity==="warning").length,issues,scope:"Consumo de atributos/Items e referências de efeitos; não executa macros nem avalia fórmulas, usos restantes ou regras de terceiros."};
}
