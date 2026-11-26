import { COSTS, COST_LABEL } from "./synergy-model.js";
import { synergyCommand } from "./synergy-engine.js";

const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const field=(root,name)=>root.querySelector('[name="'+name+'"]');
const value=(root,name)=>field(root,name)?.value?.trim()??"";
const put=(root,name,v)=>{const node=field(root,name);if(node)node.value=v??"";};
const checked=(root,name)=>field(root,name)?.checked===true;
const mark=(root,name,v)=>{const node=field(root,name);if(node)node.checked=!!v;};
const options=(rows,selected="")=>rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(label)+'</option>').join("");
const costOptions=()=>options(COSTS.map(c=>[c,COST_LABEL[c]]));
const btn=(id,label)=>'<button type="button" data-jarvis-action="'+id+'">'+esc(label)+'</button>';
const values=x=>Array.from(x?.values?.()??x??[]);
const statusText=s=>s.ready?"Ações: "+s.action+" | Ações bônus: "+s.bonus+" | Reações: "+s.reaction:(s.reason??"Economia indisponível.");
const resultText=r=>({cancelled:"Combo cancelado; nenhum custo novo confirmado.",committed:"Custos registrados. Resolva os efeitos manualmente.",executed:"Atividade nativa ativada; acompanhe os testes e efeitos do D&D.",review:"Atividade exige revisão do Mestre. Não repita automaticamente."})[r?.status]??"Operação concluída.";

export function renderSynergyControls(actors,gm) {
  const actorOptions=options([["","Selecione"],...actors.map(a=>[a.id,a.name])]);
  const statusOptions=options([["","Nenhuma condição obrigatória"],...values(globalThis.CONFIG?.statusEffects).filter(s=>s?.id).map(s=>[s.id,globalThis.game?.i18n?.localize?.(s.name??s.label??s.id)??s.id])]);
  return `<hr><section class="jarvis-console-card jarvis-synergy"><h3>Sinergias Jarvis</h3>
    <p>Combos cooperativos com custos por personagem. Selecione a ficha ativa para consultar ou solicitar.</p>
    <div class="jarvis-console-row">${btn("synergy-open","Abrir combos")}${btn("synergy-status","Consultar ações")}</div>
    ${gm?`<details><summary>Economia e editor de combos (Mestre)</summary>
    <p>Inicie no começo do combate. O registro de Activities comuns é auxiliar; ajuste ações adicionais, Ataque Extra ou usos fora da automação quando necessário. Não altera a ficha nativa.</p>
    <div class="jarvis-console-row">${btn("synergy-start","Iniciar economia")}${btn("synergy-resync","Ressincronizar iniciativa")}</div>
    <label>Saldo da ficha ativa<select name="synergy-adjust-cost">${options(COSTS.slice(0,3).map(c=>[c,COST_LABEL[c]]))}</select></label>
    <label>Saldo disponível<input type="number" min="0" max="20" value="1" name="synergy-adjust-value"></label>
    ${btn("synergy-adjust","Ajustar saldo")}
    <hr><h4>Biblioteca privada</h4><select name="synergy-library"><option value="">Atualize a biblioteca</option></select>
    <div class="jarvis-console-row">${btn("synergy-refresh","Listar combos")}${btn("synergy-audit","Auditar biblioteca")}${btn("synergy-load","Editar selecionado")}${btn("synergy-new","Novo combo")}${btn("synergy-delete","Excluir selecionado")}</div>
    <input name="synergy-id" type="hidden"><label>Nome<input name="synergy-name" maxlength="120"></label>
    <label>Notas e efeitos (somente Mestre)<textarea name="synergy-description" maxlength="2000" rows="3"></textarea></label>
    <label>Disponibilidade<select name="synergy-visibility"><option value="gm">Somente Mestre</option><option value="owners">Controladores do iniciador podem solicitar</option></select></label>
    <label>Distância máxima do iniciador (unidades da cena; vazio = sem limite)<input name="synergy-distance" type="number" min="0" step="any"></label>
    <p>Primeiro participante = iniciador. Preencha de 2 a 7 linhas; reação pode ser usada fora do próprio turno. A opção fora do turno é uma exceção homebrew explícita.</p>
    ${Array.from({length:7},(_,i)=>`<fieldset class="jarvis-console-grid"><legend>${i===0?"Iniciador":"Participante "+(i+1)}</legend>
      <label>Ficha<select name="synergy-actor-${i}">${actorOptions}</select></label>
      <label>Custo<select name="synergy-cost-${i}">${costOptions()}</select></label>
      <label><input type="checkbox" name="synergy-offturn-${i}">Permitir ação/ação bônus fora do turno</label>
      <label>Condição necessária<select name="synergy-condition-${i}">${statusOptions}</select></label>
    </fieldset>`).join("")}
    <label>Atividade nativa do iniciador (opcional)<select name="synergy-activity"><option value="">Resolver efeitos manualmente</option></select></label>
    <div class="jarvis-console-row">${btn("synergy-activities","Carregar Activities do iniciador")}${btn("synergy-preview","Simular sem gastar ações")}${btn("synergy-save","Salvar combo")}</div>
    <p class="jarvis-console-hint">O Mestre confirma e seleciona os alvos da Activity. A Activity usa os recursos e efeitos nativos do D&D; o custo de ação do combo é registrado separadamente. Sem Activity, o Mestre resolve a narrativa/mecânica.</p></details>`:""}
  </section>`;
}
function resetForm(root) {
  for(const n of ["synergy-id","synergy-name","synergy-description","synergy-distance"])put(root,n,"");
  put(root,"synergy-visibility","gm");
  for(let i=0;i<7;i++){put(root,"synergy-actor-"+i,"");put(root,"synergy-cost-"+i,i===0?"action":"reaction");mark(root,"synergy-offturn-"+i,false);put(root,"synergy-condition-"+i,"");}
  refreshActivities(root);
}
function refreshActivities(root,ref=null) {
  const select=field(root,"synergy-activity");
  if(!select)return;
  const actor=game.actors?.get?.(value(root,"synergy-actor-0"));
  const rows=[["","Resolver efeitos manualmente"]];
  for(const item of values(actor?.items))for(const activity of values(item.system?.activities))
    if(typeof activity?.use==="function")rows.push([item.id+":"+activity.id,item.name+" — "+activity.name]);
  const desired=ref?ref.itemId+":"+ref.activityId:"";
  if(desired && !rows.some(([id])=>id===desired))rows.push([desired,"Activity removida — selecione outra"]);
  select.innerHTML=options(rows,desired);
}
function readCombo(root) {
  const participants=[];
  for(let i=0;i<7;i++){
    const actorId=value(root,"synergy-actor-"+i);
    if(actorId)participants.push({actorId,cost:value(root,"synergy-cost-"+i),offTurn:checked(root,"synergy-offturn-"+i),requiredStatus:value(root,"synergy-condition-"+i)});
  }
  const selected=value(root,"synergy-activity").split(":");
  return {id:value(root,"synergy-id")||foundry.utils.randomID(),name:value(root,"synergy-name"),description:value(root,"synergy-description"),
    initiatorId:value(root,"synergy-actor-0"),participants,maxDistance:value(root,"synergy-distance"),
    visibility:value(root,"synergy-visibility"),activity:selected.length===2?{itemId:selected[0],activityId:selected[1]}:null};
}
async function refreshLibrary(root,selected="") {
  const rows=await synergyCommand({action:"all"});
  const select=field(root,"synergy-library");
  if(select)select.innerHTML=options([["","Selecione um combo"],...rows.map(c=>[c.id,c.name])],selected);
  return rows;
}
function writeCombo(root,combo) {
  resetForm(root);
  for(const [n,v] of Object.entries({id:combo.id,name:combo.name,description:combo.description,distance:combo.maxDistance,visibility:combo.visibility}))put(root,"synergy-"+n,v);
  const sorted=[combo.participants.find(p=>p.actorId===combo.initiatorId),...combo.participants.filter(p=>p.actorId!==combo.initiatorId)];
  sorted.forEach((p,i)=>{put(root,"synergy-actor-"+i,p.actorId);put(root,"synergy-cost-"+i,p.cost);mark(root,"synergy-offturn-"+i,p.offTurn);put(root,"synergy-condition-"+i,p.requiredStatus??"");});
  refreshActivities(root,combo.activity);
}
export async function openSynergyPicker(actorId) {
  const list=await synergyCommand({action:"list",actorId});
  if(!list.length){ui.notifications?.info("Nenhum combo disponível para esta ficha.");return {status:"empty"};}
  const status=await synergyCommand({action:"status",actorId});
  if(!status.ready)throw new Error(statusText(status));
  const D=foundry.applications.api.DialogV2;
  const selected=await D.wait({window:{title:"Jarvis — habilidades conjuntas"},content:
    '<p>'+esc(statusText(status))+'</p><label>Combo<select name="synergy-choice">'+options(list.map(c=>[c.id,c.name+" ("+COST_LABEL[c.ownCost??c.participants?.find(p=>p.actorId===actorId)?.cost]+")"]))+'</select></label><p>Solicitar confirma seu próprio custo. Os demais participantes e o Mestre ainda precisam aceitar.</p>',
    rejectClose:false,buttons:[{action:"request",label:"Solicitar combo",default:true,callback:(event,button,dialog)=>button.form?.elements?.namedItem("synergy-choice")?.value??dialog.element?.querySelector('[name="synergy-choice"]')?.value},
      {action:"cancel",label:"Cancelar",callback:()=>null}]});
  if(!selected||!list.some(c=>c.id===selected))return {status:"cancelled"};
  const result=await synergyCommand({action:"request",actorId,comboId:selected});
  const notify=result.status==="review"?"warn":"info";
  ui.notifications?.[notify]?.(resultText(result));
  return result;
}
export async function executeSynergyConsoleAction(action,root,actorId,confirmAction) {
  if(action==="synergy-open")return openSynergyPicker(actorId());
  if(action==="synergy-status")return statusText(await synergyCommand({action:"status",actorId:actorId()}));
  if(!game.user?.isGM)throw new Error("Synergy: esta ação exige Mestre.");
  if(action==="synergy-start"){
    if(!await confirmAction("Iniciar economia","Iniciar agora com 1 ação, 1 ação bônus e 1 reação por participante? Se o combate já começou, ajuste o que foi gasto."))return "Cancelado.";
    return synergyCommand({action:"start"});
  }
  if(action==="synergy-resync"){
    if(!await confirmAction("Ressincronizar","Reassociar os saldos existentes à ordem atual sem devolver ações gastas?"))return "Cancelado.";
    return synergyCommand({action:"resync"});
  }
  if(action==="synergy-adjust"){
    if(value(root,"synergy-adjust-value")==="")throw new Error("Informe o saldo disponível.");
    return synergyCommand({action:"adjust",actorId:actorId(),cost:value(root,"synergy-adjust-cost"),value:Number(value(root,"synergy-adjust-value"))});
  }
  if(action==="synergy-audit")return synergyCommand({action:"audit"});
  if(action==="synergy-preview")return synergyCommand({action:"preview",combo:readCombo(root)});
  if(action==="synergy-refresh"){const rows=await refreshLibrary(root);return rows.map(c=>({id:c.id,name:c.name,visibility:c.visibility}));}
  if(action==="synergy-new"){resetForm(root);return "Novo combo.";}
  if(action==="synergy-activities"){refreshActivities(root);return "Activities do iniciador carregadas.";}
  if(action==="synergy-save"){const combo=await synergyCommand({action:"save",combo:readCombo(root)});put(root,"synergy-id",combo.id);await refreshLibrary(root,combo.id);return combo;}
  const comboId=value(root,"synergy-library");
  if(!comboId)throw new Error("Selecione um combo da biblioteca.");
  if(action==="synergy-load"){const combo=(await synergyCommand({action:"all"})).find(c=>c.id===comboId);if(!combo)throw new Error("Combo removido.");writeCombo(root,combo);return combo;}
  if(action==="synergy-delete"){
    if(!await confirmAction("Excluir combo","Excluir esta definição? Não altera fichas nem ações já gastas."))return "Cancelado.";
    const result=await synergyCommand({action:"delete",comboId});resetForm(root);await refreshLibrary(root);return result;
  }
  throw new Error("Ferramenta Synergy desconhecida.");
}
function addSheetControl(application,html) {
  const actor=application?.actor??application?.document;
  if(actor?.documentName!=="Actor"||!["character","npc"].includes(actor.type)||!actor.id||!(game.user?.isGM||actor.testUserPermission?.(game.user,"OWNER")))return;
  const root=html?.querySelector?html:html?.[0];
  if(!root||!(root.matches?.(".sheet, .actor")||/ActorSheet/i.test(application.constructor?.name??"")))return;
  if(root.querySelector("[data-jarvis-synergy-sheet]"))return;
  const header=root.querySelector(".window-header"),host=header??root.querySelector(".window-content");
  if(!host)return;
  const button=root.ownerDocument.createElement("button");
  button.type="button";button.dataset.jarvisSynergySheet="true";
  button.title="Habilidades conjuntas Jarvis";button.setAttribute("aria-label",button.title);
  button.className=header?"header-control icon":"jarvis-synergy-sheet-control";
  if(header){const icon=root.ownerDocument.createElement("i");icon.className="fa-solid fa-link";button.append(icon);}else button.textContent="Combos Jarvis";
  button.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await openSynergyPicker(actor.id);}catch(e){ui.notifications?.warn(e.message);}finally{button.disabled=false;}});
  host.append(button);
}
export function registerSynergySheetControls() {
  Hooks.on("renderApplicationV2",addSheetControl);
  Hooks.on("renderActorSheet",addSheetControl);
}
