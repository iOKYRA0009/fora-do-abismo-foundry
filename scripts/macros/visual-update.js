import {normalizeSheetAppearance} from "../ui/sheet-appearance.js";

const MODULE="fora-do-abismo-foundry";
const norm=s=>String(s??"").normalize("NFC").trim().toLocaleLowerCase("pt-BR");
const values=c=>Array.isArray(c)?c:Array.isArray(c?.contents)?c.contents:Array.from(c?.values?.()??[]);
const clone=x=>x===undefined?undefined:structuredClone(x);
const fail=m=>{throw Error("Atualização visual: "+m);};
const object=x=>x&&typeof x==="object"&&!Array.isArray(x);
const own=(o,k)=>Object.hasOwn(o,k);
const validName=x=>typeof x==="string"&&x.trim()&&x.length<=200;
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const ref=x=>typeof x==="string"&&/^asset:\/\/[A-Za-z0-9_-]{1,64}$/.test(x);
function only(o,keys){if(!object(o)||Object.keys(o).some(k=>!keys.includes(k)))fail("Campos não permitidos.");}
function requireRef(x){if(!ref(x))fail("Use referências asset://ID declaradas.");}
function findUnique(rows,predicate,label){const found=rows.filter(predicate);if(found.length>1)fail(label+" ambíguo.");return found[0];}
function activityRows(item){return Object.entries(item.toObject().system?.activities??{});}
function themeOf(actor){return clone(actor.getFlag(MODULE,"sheetAppearance")??null);}
function tokenTexture(actor){return actor.prototypeToken?.texture?.src;}
export function planVisualUpdate(input,actors,scenes){
  only(input,["actor","actorType","token","portrait","theme","items","updateLinkedTokens"]);
  if(!validName(input.actor)||input.actorType!=="character")fail("Nome e tipo character obrigatórios.");
  const actor=findUnique(values(actors),a=>norm(a.name)===norm(input.actor)&&a.type===input.actorType,"Ficha "+input.actor);
  if(!actor||actor.isToken||actor.pack||!validId(actor.id))fail("Ficha existente não encontrada no mundo.");
  if(input.updateLinkedTokens!==undefined&&typeof input.updateLinkedTokens!=="boolean")fail("updateLinkedTokens inválido.");
  if(input.token!==undefined)requireRef(input.token);
  if(input.portrait!==undefined)requireRef(input.portrait);
  let theme=null;
  if(input.theme!==undefined){
    only(input.theme,["image","opacity","size","palette"]);
    if(input.theme.image!==undefined)requireRef(input.theme.image);
    if(input.theme.palette!==undefined)only(input.theme.palette,["paper","text","title","divider"]);
    theme=normalizeSheetAppearance({...input.theme,image:input.theme.image?"jarvis-preview/marca.webp":null});
    if(!theme)fail("Tema inválido.");
    if(input.theme.image)theme.image=input.theme.image;
  }
  if(!Array.isArray(input.items)||input.items.length>100)fail("Lista de até 100 Items obrigatória.");
  const rows=[],missing=[],used=new Set();
  for(const requested of input.items){
    only(requested,["name","type","img","activities"]);
    if(!validName(requested.name)||!validName(requested.type))fail("Item sem nome/tipo.");
    const key=norm(requested.name)+"|"+requested.type;
    if(used.has(key))fail("Item repetido: "+requested.name);used.add(key);
    requireRef(requested.img);
    const activities=requested.activities??[];
    if(!Array.isArray(activities)||activities.length>100)fail("Lista de Activities inválida.");
    const names=new Set();
    for(const a of activities){only(a,["name","img"]);if(!validName(a.name)||names.has(norm(a.name)))fail("Activity inválida ou duplicada.");names.add(norm(a.name));requireRef(a.img);}
    const item=findUnique(values(actor.items),i=>norm(i.name)===norm(requested.name)&&i.type===requested.type,requested.name);
    if(!item){missing.push(requested.name);continue;}
    if(!validId(item.id))fail("ID de Item inválido.");
    const patch={img:requested.img},before={img:item.img};
    for(const a of activities){
      const match=findUnique(activityRows(item),([,v])=>norm(v.name)===norm(a.name),requested.name+" / "+a.name);
      if(!match){missing.push(requested.name+" / "+a.name);continue;}
      const [id,v]=match;if(!validId(id))fail("ID de Activity inválido.");
      const path="system.activities."+id+".img";patch[path]=a.img;before[path]=v.img??"";
    }
    rows.push({item,patch,before});
  }
  if(input.items.length&&!rows.length)fail("Nenhum Item reconhecido; ficha incompatível.");
  if(!input.token&&!input.portrait&&!theme&&!rows.length)fail("Nenhuma alteração visual solicitada.");
  const tokens=[];
  if(input.token&&input.updateLinkedTokens===true)for(const scene of values(scenes)){
    const docs=values(scene.tokens).filter(t=>t.actorId===actor.id&&t.actorLink===true&&t.texture?.src===tokenTexture(actor));
    if(docs.length)tokens.push({scene,docs,before:docs.map(t=>({_id:t.id,"texture.src":t.texture.src}))});
  }
  const before={theme:themeOf(actor),token:tokenTexture(actor),portrait:actor.img};
  const summary={actor:actor.name,actorId:actor.id,items:rows.length,activities:rows.reduce((n,r)=>n+Object.keys(r.patch).length-1,0),tokens:tokens.reduce((n,r)=>n+r.docs.length,0),theme:!!theme,token:!!input.token,portrait:!!input.portrait,missing};
  const signature=JSON.stringify({actor:actor.id,rows:rows.map(r=>[r.item.id,r.patch,r.before]),tokens:tokens.map(r=>[r.scene.id,r.before]),before});
  return {actor,rows,tokens,theme,before,summary,signature,input};
}
const get=(o,path)=>path.split(".").reduce((x,k)=>x?.[k],o);
export async function applyVisualUpdate(plan,images){
  const {actor,rows,tokens,theme,before,input}=plan;
  const resolve=value=>{if(!ref(value)||!own(images,value.slice(8))||typeof images[value.slice(8)]!=="string")fail("Imagem não enviada: "+value);return images[value.slice(8)];};
  const itemUpdates=rows.map(row=>({...row,next:Object.fromEntries(Object.entries(row.patch).map(([k,v])=>[k,resolve(v)]))}));
  const token=input.token?resolve(input.token):null,portrait=input.portrait?resolve(input.portrait):null;
  const nextTheme=theme?normalizeSheetAppearance({...theme,image:theme.image?resolve(theme.image):null}):null;
  const done=[],scenesDone=[];let actorAttempted=false,themeAttempted=false;
  try{
    for(const row of itemUpdates){
      done.push(row);await row.item.update(row.next);
      for(const [path,value] of Object.entries(row.next))if(get(row.item.toObject(),path)!==value)fail("Ícone não persistiu: "+row.item.name+" / "+path);
    }
    if(token||portrait){
      actorAttempted=true;
      await actor.update({...token?{"prototypeToken.texture.src":token}:{},...portrait?{img:portrait}:{}});
      if(token&&tokenTexture(actor)!==token||portrait&&actor.img!==portrait)fail("Imagem da ficha não persistiu.");
    }
    if(nextTheme){themeAttempted=true;await actor.setFlag(MODULE,"sheetAppearance",nextTheme);const saved=themeOf(actor);if(JSON.stringify(normalizeSheetAppearance(saved))!==JSON.stringify(nextTheme))fail("Tema não persistiu.");}
    for(const row of tokens){
      scenesDone.push(row);
      await row.scene.updateEmbeddedDocuments("Token",row.docs.map(t=>({_id:t.id,"texture.src":token})));
    }
  }catch(error){
    const errors=[];
    for(const row of scenesDone.reverse())try{await row.scene.updateEmbeddedDocuments("Token",row.before);}catch(e){errors.push(e.message);}
    if(themeAttempted)try{if(before.theme===null)await actor.unsetFlag(MODULE,"sheetAppearance");else await actor.setFlag(MODULE,"sheetAppearance",before.theme);}catch(e){errors.push(e.message);}
    if(actorAttempted)try{await actor.update({...token?{"prototypeToken.texture.src":before.token}:{},...portrait?{img:before.portrait}:{}});}catch(e){errors.push(e.message);}
    for(const row of done.reverse())try{await row.item.update(row.before);}catch(e){errors.push(e.message);}
    throw Error(error.message+(errors.length?" Reversão parcial: "+errors.join("; "):" Alterações visuais revertidas; imagens podem permanecer."));
  }
  try{if(actor.sheet?.rendered)actor.sheet.render();}catch{}
  return plan.summary;
}
