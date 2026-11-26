import { COSTS, COST_LABEL, normalizeCombo, combatClock, clockKey, newLedger, currentLedger,
  remaining, planSpend, setRemaining, recordNative, resyncLedger } from "./synergy-model.js";

const MODULE_ID="fora-do-abismo-foundry", STORE="synergyPrivateStore", STATE="synergyState";
const values=x=>Array.from(x?.values?.() ?? x ?? []);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const copy=x=>JSON.parse(JSON.stringify(x));
const safeId=x=>typeof x==="string" && /^[A-Za-z0-9_-]{1,80}$/.test(x);
const blank=()=>({version:1,combos:[],ledgers:[]});
let queue=Promise.resolve(), remoteSocket=null, suppressedActivity=null, comboPending=false;
function serial(task) {
  const next=queue.catch(()=>{}).then(task);
  queue=next.catch(()=>{});
  return next;
}
function gm() {
  if(!game.user?.isGM || game.users?.activeGM?.id!==game.user.id) throw new Error("Synergy: é necessário o Mestre ativo.");
}
function owner(actor,user) { return !!actor && !!user && (user.isGM || actor.testUserPermission?.(user,"OWNER")); }
function senderCheck(user) { gm(); if(!user?.active) throw new Error("Usuário desconectado."); }
function requireGMUser(user) { senderCheck(user); if(!user.isGM || user.id!==game.user.id) throw new Error("Apenas o Mestre ativo pode editar combos."); }
function privateStore() {
  gm();
  const docs=values(game.journal).filter(j=>j.getFlag?.(MODULE_ID,STORE)===true);
  if(docs.length>1) throw new Error("Synergy: armazenamento privado duplicado; resolva manualmente.");
  const doc=docs[0];
  if(doc && ((doc.ownership?.default??0)>0 || Object.entries(doc.ownership??{}).some(([id,level])=>id!=="default" && level>0 && !game.users.get(id)?.isGM)))
    throw new Error("Synergy: o Journal de armazenamento deixou de ser privado. Revise as permissões.");
  return doc;
}
function load() {
  const doc=privateStore(), raw=doc?.getFlag?.(MODULE_ID,STATE);
  if(raw==null) return {doc,data:blank()};
  const data=JSON.parse(raw);
  if(data.version!==1 || !Array.isArray(data.combos)||!Array.isArray(data.ledgers)) throw new Error("Synergy: armazenamento inválido.");
  return {doc,data};
}
async function save(doc,data) {
  gm();
  const raw=JSON.stringify(data);
  if(raw.length>1500000) throw new Error("Armazenamento Synergy cheio. Remova combos ou registros de combates encerrados.");
  // One private document write for every participant's costs, never separate actor writes.
  if(!doc) {
    doc=await JournalEntry.create({name:"Jarvis — Synergy (privado)",ownership:{default:0},
      flags:{[MODULE_ID]:{[STORE]:true,[STATE]:raw}}});
    if(!doc) throw new Error("Não foi possível criar o armazenamento privado.");
  } else await doc.setFlag(MODULE_ID,STATE,raw);
  return doc;
}
function ledgerOf(data,clock) {return data.ledgers.find(l=>l.clock.combatId===clock.combatId);}
function replaceLedger(data,ledger) {
  data.ledgers=data.ledgers.filter(l=>l.clock.combatId!==ledger.clock.combatId);
  data.ledgers.push(ledger);
}
function combatContext() {
  const combat=game.combat;
  return {combat,clock:combatClock(combat)};
}
function participant(combat,actorId) {
  const rows=values(combat.turns).filter(c=>c.actorId===actorId || c.actor?.id===actorId);
  if(rows.length!==1 || !rows[0].actor) throw new Error("Participante ausente ou ambíguo no combate.");
  return rows[0];
}
function hidden(c) {return !!(c.hidden||c.token?.hidden);}
function incapacitated(c) {
  const a=c.actor, hp=a?.system?.attributes?.hp?.value;
  return c.defeated || (typeof hp==="number" && hp<=0) ||
    ["dead","unconscious","incapacitated","paralyzed","stunned","petrified"].some(s=>a?.statuses?.has?.(s));
}
function nativeActivity(actor,ref) {
  const activity=actor?.items?.get?.(ref?.itemId)?.system?.activities?.get?.(ref?.activityId);
  if(typeof activity?.use!=="function") throw new Error("A atividade nativa do combo foi removida ou não é utilizável.");
  return activity;
}
function activityKey(a) {return [a?.item?.actor?.id??a?.actor?.id,a?.item?.id,a?.id].join(":");}
function sceneId(combat) {return combat.scene?.id ?? combat.scene ?? combat.combatant?.token?.parent?.id;}
function withinRange(combat,from,to,distance) {
  if(distance===null || from.id===to.id) return true;
  if(canvas?.scene?.id!==sceneId(combat) || !canvas.grid?.measurePath) throw new Error("Abra a cena do combate para verificar o alcance.");
  const a=from.token?.object?.center,b=to.token?.object?.center;
  if(!a||!b) throw new Error("Tokens dos participantes precisam estar na cena.");
  const result=canvas.grid.measurePath([a,b]);
  if(!Number.isFinite(result?.distance)) throw new Error("Não foi possível medir o alcance.");
  return result.distance<=distance;
}
function validateRequest(data,combo,user) {
  const {combat,clock}=combatContext();
  const first=participant(combat,combo.initiatorId);
  if(!owner(first.actor,user) || (!user.isGM && (combo.visibility!=="owners" || hidden(first) || user.viewedScene!==sceneId(combat))))
    throw new Error("Combo indisponível para este personagem.");
  const entries=combo.participants.map(p=>{
    const c=participant(combat,p.actorId);
    if(!user.isGM && hidden(c)) throw new Error("Um participante não está disponível.");
    if(incapacitated(c)) throw new Error("Um participante está incapacitado ou derrotado.");
    if(!withinRange(combat,first,c,combo.maxDistance)) throw new Error("Um participante está fora do alcance.");
    return {...p,c};
  });
  if(combo.activity) nativeActivity(first.actor,combo.activity);
  const ledger=ledgerOf(data,clock);
  const planned=planSpend(ledger,clock,entries.map(p=>({combatantId:p.c.id,cost:p.cost,offTurn:p.offTurn})));
  return {combat,clock,first,entries,planned};
}
function privateResult(user,combo,status) {
  return {status,name:combo.name,...(user.isGM?{description:combo.description}: {})};
}
async function confirm(title,body) {
  const dialog=globalThis.foundry?.applications?.api?.DialogV2;
  if(!dialog?.confirm) throw new Error("Diálogo de confirmação indisponível.");
  return (await dialog.confirm({window:{title},content:body,rejectClose:false}))===true;
}
async function withDeadline(promise,ms=45000) {
  let handle;
  try {return await Promise.race([promise,new Promise(resolve=>{handle=setTimeout(()=>resolve(false),ms);})]);}
  finally {clearTimeout(handle);}
}
/** Called only by the authenticated, active GM over the existing socketlib module. */
export async function receiveSynergyConsent(args,sender) {
  if(!sender?.isGM || !sender.active || sender.id!==game.users?.activeGM?.id) return false;
  if(!Array.isArray(args?.participants)||args.participants.length<1||args.participants.length>7||
      !Number.isFinite(args.expiresAt)||Date.now()>args.expiresAt) return false;
  let clock;
  try {clock=combatClock(game.combat);} catch {return false;}
  if(clockKey(clock)!==args.clock) return false;
  for(const p of args.participants) {
    if(!safeId(p.actorId)||!COSTS.includes(p.cost)) return false;
    try {if(!owner(participant(game.combat,p.actorId).actor,game.user)) return false;} catch {return false;}
  }
  const body="<p>"+esc(args.name)+"</p><ul>"+args.participants.map(p=>"<li>"+esc(participant(game.combat,p.actorId).actor.name)+": "+esc(COST_LABEL[p.cost])+"</li>").join("")+"</ul><p>Aceitar a participação? Nenhum custo será gasto se o combo não puder ser concluído. A solicitação expira em até 45 segundos.</p>";
  const answer=await withDeadline(confirm("Jarvis — combo conjunto",body),Math.max(1,args.expiresAt-Date.now()));
  return answer===true && Date.now()<=args.expiresAt;
}
function controllers(actor) {
  return values(game.users).filter(u=>!u.isGM && owner(actor,u));
}
function chooseController(actor,users) {
  return users.filter(u=>u.active).sort((a,b)=>(Number(b.character?.id===actor.id)-Number(a.character?.id===actor.id)) || a.id.localeCompare(b.id))[0];
}
async function getConsent(combo,context,user) {
  const groups=new Map(), controllerIds=new Map();
  for(const p of context.entries) {
    // The initiating player explicitly confirmed their own cost in the UI.
    if(!user.isGM && p.actorId===combo.initiatorId) {controllerIds.set(p.actorId,user.id);continue;}
    const users=controllers(p.c.actor);
    const selected=chooseController(p.c.actor,users);
    if(users.length && !selected) return false;
    controllerIds.set(p.actorId,selected?.id??null);
    if(!selected) continue;
    const rows=groups.get(selected.id)??[];
    rows.push({actorId:p.actorId,cost:p.cost});
    groups.set(selected.id,rows);
  }
  const costs=context.entries.map(p=>esc(p.c.actor.name)+": "+esc(COST_LABEL[p.cost])).join("<br>");
  // Always ask the GM to approve execution, including GM-controlled participants
  // and target selection for the optional native activity.
  const approved=await withDeadline(confirm("Jarvis — autorizar "+combo.name,
    "<p>"+costs+"</p><p>"+esc(combo.description)+"</p><p>"+(combo.activity?"A atividade nativa será aberta no cliente do Mestre. Selecione seus alvos no canvas antes da confirmação.":"Após o gasto, resolva os efeitos manualmente.")+"</p>"));
  if(!approved || clockKey(combatClock(game.combat))!==clockKey(context.clock)) return false;
  if(groups.size && !remoteSocket) throw new Error("Ative socketlib para solicitar participação de jogadores.");
  const expiresAt=Date.now()+45000;
  const requests=Array.from(groups,([userId,participants])=>withDeadline(remoteSocket.executeAsUser("synergyConsent",userId,
    {name:combo.name,participants,clock:clockKey(context.clock),expiresAt})).catch(()=>false));
  const answers=await Promise.all(requests);
  return answers.every(v=>v===true)&&Date.now()<=expiresAt ? controllerIds : false;
}
async function runCombo(user,args) {
  senderCheck(user);
  if(comboPending) throw new Error("Já existe uma solicitação de combo em andamento.");
  comboPending=true;
  try {
  const {combo,before}=await serial(()=>{
    const {data}=load();
    const combo=data.combos.find(c=>c.id===args.comboId && c.initiatorId===args.actorId);
    if(!combo || (!user.isGM && combo.visibility!=="owners")) throw new Error("Combo indisponível.");
    return {combo,before:validateRequest(data,combo,user)};
  });
  const approvals=await getConsent(combo,before,user);
  if(!approvals) return privateResult(user,combo,"cancelled");
  // Do not hold the economy queue during consent: native uses and GM corrections
  // must be visible to the final check.
  return await serial(async()=>{
  const fresh=load();
  const latest=fresh.data.combos.find(c=>c.id===combo.id);
  if(JSON.stringify(latest)!==JSON.stringify(combo)) throw new Error("O combo mudou; solicite novamente.");
  if(!user.active) throw new Error("Iniciador desconectado.");
  const context=validateRequest(fresh.data,combo,user);
  if(clockKey(before.clock)!==clockKey(context.clock) || before.entries.some((p,i)=>p.c.id!==context.entries[i].c.id))
    throw new Error("O turno ou participante mudou; solicite novamente.");
  // Recheck controller connectivity and permissions after the dialogues.
  if(context.entries.some(p=>{
    if(!user.isGM && p.actorId===combo.initiatorId) return !owner(p.c.actor,user)||!game.users.get(user.id)?.active;
    const users=controllers(p.c.actor), selected=chooseController(p.c.actor,users);
    return (users.length&&!selected)||(selected?.id??null)!==approvals.get(p.actorId);
  })) throw new Error("O controlador de um participante mudou; solicite novamente.");
  const previous=copy(ledgerOf(fresh.data,context.clock));
  replaceLedger(fresh.data,context.planned);
  await save(fresh.doc,fresh.data);
  if(!combo.activity) return privateResult(user,combo,"committed");
  // External activity effects cannot be rolled back safely on an exception.
  // Keep the ledger explicit rather than replaying an attack or damaging twice.
  try {
    gm();
    if(clockKey(combatClock(game.combat))!==clockKey(context.clock)) throw new Error("Turno mudou após o registro; ajuste os custos manualmente.");
    const activity=nativeActivity(context.first.actor,combo.activity);
    suppressedActivity=activityKey(activity);
    const result=await activity.use();
    if(result==null) {
      if(clockKey(combatClock(game.combat))!==clockKey(context.clock))
        throw new Error("Atividade cancelada após mudança de turno; revise os custos.");
      const rollback=load();
      if(JSON.stringify(ledgerOf(rollback.data,context.clock))!==JSON.stringify(context.planned))
        throw new Error("Registro alterado durante a resolução; revise os custos.");
      replaceLedger(rollback.data,previous);
      await save(rollback.doc,rollback.data);
      return privateResult(user,combo,"cancelled");
    }
    return privateResult(user,combo,"executed");
  } catch(error) {
    console.error(MODULE_ID+" | Synergy: atividade exige revisão manual",error);
    ui.notifications?.error("Synergy: a atividade não foi concluída com segurança. Revise seus efeitos e custos; não repita automaticamente.");
    return privateResult(user,combo,"review");
  } finally {suppressedActivity=null;}
  });
  } finally {comboPending=false;}
}
function actorAccess(user,actorId) {
  if(!safeId(actorId)||!owner(game.actors.get(actorId),user)) throw new Error("Ficha não controlada.");
}
function listFor(data,user,actorId) {
  actorAccess(user,actorId);
  const combos=data.combos.filter(c=>c.initiatorId===actorId && (user.isGM||c.visibility==="owners"));
  return user.isGM?combos:combos.map(c=>({id:c.id,name:c.name,ownCost:c.participants.find(p=>p.actorId===actorId)?.cost}));
}
async function nativeRecord(user,args) {
  const {doc,data}=load();
  let context;
  try {context=combatContext();} catch {return {skipped:true};}
  const {combat,clock}=context, ledger=ledgerOf(data,clock);
  if(!ledger) return {skipped:true};
  if(clockKey(clock)!==args.clock) throw new Error("Turno mudou antes do registro da atividade; confira a economia.");
  if(!safeId(args.actorId)||!safeId(args.itemId)||!safeId(args.activityId)||!safeId(args.messageId)) throw new Error("Registro de atividade inválido.");
  const c=participant(combat,args.actorId);
  if(!owner(c.actor,user)) throw new Error("Usuário não controla a atividade.");
  const message=game.messages?.get?.(args.messageId);
  const author=message?.author?.id ?? message?.user?.id ?? message?.user;
  if(!message || author!==user.id || message.speaker?.actor!==c.actor.id ||
      message.system?.activity?.id!==args.activityId || message.system?.item?.id!==args.itemId)
    throw new Error("Atividade sem mensagem de uso verificável.");
  const activity=c.actor.items?.get?.(args.itemId)?.system?.activities?.get?.(args.activityId);
  const cost=activity?.activation?.type;
  if(!["action","bonus","reaction"].includes(cost)) return {skipped:true};
  replaceLedger(data,recordNative(ledger,clock,c.id,cost,args.messageId));
  await save(doc,data);
  return {recorded:true};
}
export function setSynergySocket(socket) {remoteSocket=socket;}
export function dispatchSynergy(args,user) {
  if(args?.action==="request") return runCombo(user,args);
  return serial(async()=>{
    senderCheck(user);
    const action=args?.action;
    if(action==="record") return nativeRecord(user,args);
    const {doc,data}=load();
    if(action==="list") return listFor(data,user,args.actorId);
    if(action==="status") {
      actorAccess(user,args.actorId);
      try {
        const {combat,clock}=combatContext(), c=participant(combat,args.actorId), ledger=ledgerOf(data,clock);
        if(!ledger) return {ready:false,reason:"Economia ainda não iniciada."};
        return {ready:true,...remaining(currentLedger(ledger,clock),clock,c.id)};
      } catch(e) {return {ready:false,reason:e.message};}
    }
    requireGMUser(user);
    if(action==="all") return data.combos;
    if(action==="save") {
      const combo=normalizeCombo(args.combo);
      for(const p of combo.participants) if(!game.actors.get(p.actorId)) throw new Error("Participante não encontrado no mundo.");
      if(combo.activity) nativeActivity(game.actors.get(combo.initiatorId),combo.activity);
      if(!data.combos.some(c=>c.id===combo.id)&&data.combos.length>=100) throw new Error("Limite de 100 combos.");
      data.combos=data.combos.filter(c=>c.id!==combo.id);data.combos.push(combo);
      await save(doc,data);return combo;
    }
    if(action==="delete") {
      data.combos=data.combos.filter(c=>c.id!==args.comboId);await save(doc,data);return {removed:true};
    }
    const {combat,clock}=combatContext(), old=ledgerOf(data,clock);
    if(action==="start") {
      if(old) throw new Error("Economia já iniciada. Use ressincronizar ou ajuste o saldo.");
      data.ledgers=data.ledgers.filter(l=>game.combats?.get?.(l.clock.combatId)?.started);
      replaceLedger(data,newLedger(clock));
    } else if(action==="resync") {
      if(!old) throw new Error("Inicie a economia primeiro.");
      replaceLedger(data,resyncLedger(old,clock));
    } else if(action==="adjust") {
      const c=participant(combat,args.actorId);
      replaceLedger(data,setRemaining(old,clock,c.id,args.cost,args.value));
    } else throw new Error("Comando Synergy desconhecido.");
    await save(doc,data);return {updated:true};
  });
}
export async function synergyCommand(args) {
  if(game.user?.isGM) return dispatchSynergy(args,game.user);
  if(!remoteSocket) throw new Error("Synergy requer socketlib ativo e um Mestre conectado.");
  return remoteSocket.executeAsGM("synergyCommand",args);
}
export function registerSynergyTracking() {
  Hooks.on("dnd5e.postUseActivity",(activity,usage,results)=>{
    if(!game.combat?.started || activityKey(activity)===suppressedActivity || !["action","bonus","reaction"].includes(activity?.activation?.type)) return;
    const actor=activity?.item?.actor??activity?.actor;
    if(!owner(actor,game.user) || !results?.message?.id) return;
    let clock;try {clock=clockKey(combatClock(game.combat));} catch {return;}
    const args={action:"record",actorId:actor.id,itemId:activity.item.id,activityId:activity.id,messageId:results.message.id,clock};
    void synergyCommand(args).catch(e=>{
      console.warn(MODULE_ID+" | Synergy: registro nativo não concluído",e);
      // Avoid interrupting ordinary activities when the optional engine is unused.
      if(game.user?.isGM || remoteSocket) ui.notifications?.warn("Synergy: confira o saldo de ações ("+e.message+").");
    });
  });
}
