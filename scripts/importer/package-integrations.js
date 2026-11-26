import {normalizeCombo} from "../synergy/synergy-model.js";
const list=x=>Array.isArray(x)?x:Array.from(x?.contents??x?.values?.()??[]);
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const norm=x=>String(x??"").trim().toLocaleLowerCase("pt-BR");
const fail=m=>{throw Error("Integrações Jarvis: "+m);};
const text=(x,label,max=120)=>{if(typeof x!=="string"||!x.trim()||x.length>max||x.startsWith("asset://"))fail(label+" inválido.");return x.trim();};
function only(x,keys){if(!object(x)||Object.keys(x).some(k=>!keys.includes(k)))fail("Campos desconhecidos ou estrutura inválida.");}
function unique(rows,name,label){const matches=rows.filter(x=>norm(x.name)===norm(name));if(matches.length!==1)fail(label+" ausente ou ambíguo: "+name);return matches[0];}
function entries(x,label){if(x==null)return [];if(!Array.isArray(x)||x.length>40)fail(label+" deve conter até 40 entradas.");return x;}
function sourceActivity(payload,ref){
  only(ref,["item","activity"]);
  const item=unique(payload.items??[],text(ref.item,"Item"),"Item");
  // Native and semantic Activities are supported for synergy references.
  const semantic=item.jarvis?.activities??[];
  const native=Object.values(item.system?.activities??{}).filter(a=>!semantic.some(b=>b._id===a._id));
  return {item,activity:unique([...semantic,...native],text(ref.activity,"Activity"),"Activity"),semantic};
}
function sourceActor(actors,name){return unique(actors.map(a=>({...a,name:a.actor?.name})),name,"Personagem novo");}
export function preparePackageIntegrations(pkg,worldActors=[]){
  const combos=entries(pkg.synergyCombos,"Sinergias"),bindings=entries(pkg.effectBindings,"Automações de efeitos");
  if(!combos.length&&!bindings.length)return {combos:[],bindings:[],actors:pkg.actors??[]};
  const actors=structuredClone(pkg.actors??[]),names=new Set(),bound=new Set();
  const preparedCombos=combos.map((c,i)=>{
    only(c,["name","description","initiator","participants","maxDistance","activity"]);
    const name=text(c.name,"Nome do combo"),initiator=text(c.initiator,"Iniciador");
    if(names.has(norm(name)))fail("Combo duplicado: "+name);names.add(norm(name));
    const start=sourceActor(actors,initiator);
    if(!Array.isArray(c.participants)||c.participants.length<2||c.participants.length>7)fail("Combo exige 2 a 7 participantes.");
    const seen=new Set();
    const participants=c.participants.map((p,j)=>{
      only(p,["actor","cost","offTurn","requiredStatus"]);
      const actor=text(p.actor,"Participante"),key=norm(actor);
      if(seen.has(key))fail("Participante duplicado: "+actor);seen.add(key);
      const inPackage=actors.filter(a=>norm(a.actor?.name)===key);
      const existing=inPackage.length===1?null:unique(worldActors,actor,"Participante existente");
      if(existing&&!existing.id)fail("Participante existente sem ID.");
      if(p.offTurn!==undefined&&typeof p.offTurn!=="boolean")fail("offTurn deve ser booleano.");
      return {actor,existingId:existing?.id??null,cost:p.cost,offTurn:p.offTurn===true,requiredStatus:p.requiredStatus??null};
    });
    if(!seen.has(norm(initiator)))fail("Iniciador precisa participar.");
    if(c.activity!=null)sourceActivity(start,c.activity);
    const description=c.description===undefined?"":text(c.description,"Descrição",2000);
    normalizeCombo({id:"preview",name,description,initiatorId:"p"+participants.findIndex(p=>norm(p.actor)===norm(initiator)),participants:participants.map((p,j)=>({...p,actorId:"p"+j})),maxDistance:c.maxDistance,visibility:"gm"});
    return {name,description,initiator,participants,maxDistance:c.maxDistance??null,activity:c.activity??null,visibility:"gm"};
  });
  const preparedBindings=bindings.map(b=>{
    only(b,["actor","item","activity","effectId"]);
    const actor=text(b.actor,"Personagem"),payload=sourceActor(actors,actor);
    const {item,activity,semantic}=sourceActivity(payload,{item:b.item,activity:b.activity});
    if(activity.type!=="utility"||(activity.effects??[]).length)fail("Vínculo requer Activity utility sem efeitos nativos associados, para evitar aplicação duplicada.");
    if(!semantic.includes(activity)||!/^[A-Za-z0-9]{16}$/.test(activity._id??""))fail("Automação exige Activity semântica com ID de 16 caracteres.");
    const effectId=text(b.effectId,"ID de efeito",16);
    if(!/^[A-Za-z0-9]{16}$/.test(effectId)||(item.effects??[]).filter(e=>e._id===effectId&&e.transfer===false).length!==1)fail("Active Effect embutido não encontrado ou sem transfer:false: "+effectId);
    const key=[norm(actor),norm(b.item),norm(b.activity)].join("|");
    if(bound.has(key)||activity.automation)fail("Activity já possui automação ou vínculo repetido.");
    bound.add(key);
    activity.automation={effects:[{effectId,target:"self",replace:true,strict:true}]};
    return {actor,item:item.name,activity:activity.name,effectId,target:"self"};
  });
  return {actors,combos:preparedCombos,bindings:preparedBindings};
}
export function resolveImportedCombos(combos,created,worldActors){
  return combos.map(c=>{
    const actorFor=p=>{if(p.existingId){const a=unique(worldActors,p.actor,"Participante existente");if(a.id!==p.existingId)fail("Participante existente mudou durante importação.");return a;}return unique(created,p.actor,"Personagem criado");};
    const initiator=unique(created,c.initiator,"Iniciador criado");
    let activity=null;
    if(c.activity){
      const item=unique(list(initiator.items),c.activity.item,"Item criado");
      const a=unique(list(item.system?.activities),c.activity.activity,"Activity criada");
      if(typeof a.use!=="function")fail("Activity criada não utilizável.");
      activity={itemId:item.id,activityId:a.id};
    }
    return {name:c.name,description:c.description,initiatorId:initiator.id,participants:c.participants.map(p=>({actorId:actorFor(p).id,cost:p.cost,offTurn:p.offTurn,requiredStatus:p.requiredStatus})),maxDistance:c.maxDistance,activity,visibility:"gm"};
  });
}

export function verifyImportedBindings(bindings,created){
  for(const b of bindings){
    const actor=unique(created,b.actor,"Personagem criado");
    const item=unique(list(actor.items),b.item,"Item criado");
    const activity=unique(list(item.system?.activities),b.activity,"Activity criada");
    const config=activity.flags?.["fora-do-abismo-foundry"]?.automation;
    if(!config||Object.keys(config).length!==1||config.effects?.length!==1||config.effects[0].effectId!==b.effectId||config.effects[0].target!=="self"||config.effects[0].strict!==true||config.effects[0].replace!==true||!list(item.effects).some(e=>e.id===b.effectId&&e.transfer===false))fail("Vínculo de efeito não persistiu: "+b.item+" / "+b.activity);
  }
}
