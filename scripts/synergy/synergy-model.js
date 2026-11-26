/** Shared, pure rules for cooperative activities. No Foundry writes here. */
export const COSTS = Object.freeze(["action", "bonus", "reaction", "free"]);
export const COST_LABEL = Object.freeze({action:"Ação",bonus:"Ação bônus",reaction:"Reação",free:"Sem custo"});
const types = COSTS.slice(0,3);
const id = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const integer = (v,min,max) => Number.isInteger(v) && v>=min && v<=max;
const clean = (v,max) => typeof v === "string" ? v.trim().slice(0,max) : "";
const initial = () => ({action:1,bonus:1,reaction:1});
const copy = v => JSON.parse(JSON.stringify(v));

export function normalizeCombo(raw) {
  if (!raw || !id(raw.id) || !clean(raw.name,120)) throw new Error("Informe o ID e o nome do combo.");
  if (!Array.isArray(raw.participants) || raw.participants.length<2 || raw.participants.length>7) throw new Error("Escolha de 2 a 7 participantes.");
  const seen = new Set();
  const participants = raw.participants.map(p => {
    if (!id(p?.actorId) || seen.has(p.actorId) || !COSTS.includes(p.cost)) throw new Error("Participante duplicado, inválido ou sem custo definido.");
    seen.add(p.actorId);
    const requiredStatus=p.requiredStatus||null;
    if(requiredStatus!==null && !id(requiredStatus)) throw new Error("Condição obrigatória inválida.");
    return {actorId:p.actorId,cost:p.cost,offTurn:p.offTurn===true,requiredStatus};
  });
  if (!id(raw.initiatorId) || !seen.has(raw.initiatorId)) throw new Error("O iniciador deve participar do combo.");
  const maxDistance = raw.maxDistance == null || raw.maxDistance === "" ? null : Number(raw.maxDistance);
  if (maxDistance !== null && (!Number.isFinite(maxDistance) || maxDistance<0 || maxDistance>10000)) throw new Error("Alcance inválido.");
  const activity = raw.activity == null ? null : {itemId:raw.activity.itemId,activityId:raw.activity.activityId};
  if (activity && (!id(activity.itemId) || !id(activity.activityId))) throw new Error("Atividade nativa inválida.");
  return {id:raw.id,name:clean(raw.name,120),description:clean(raw.description,2000),initiatorId:raw.initiatorId,participants,maxDistance,activity,visibility:raw.visibility==="owners"?"owners":"gm"};
}

export function combatClock(combat) {
  const order = Array.from(combat?.turns ?? [], c=>c.id);
  const round = combat?.round, turn = combat?.turn;
  if (!combat?.started || !id(combat.id) || !integer(round,1,1000000) || !integer(turn,0,order.length-1) || !order.every(id) || new Set(order).size!==order.length)
    throw new Error("Inicie um combate com ordem de iniciativa definida.");
  return {combatId:combat.id,round,turn,order};
}
export const clockKey = c => JSON.stringify([c.combatId,c.round,c.turn,c.order]);
export function newLedger(clock) {
  return {clock:copy(clock),rows:[],receipts:[]};
}
export function currentLedger(ledger,clock) {
  if (!ledger || ledger.clock.combatId!==clock.combatId) throw new Error("O Mestre precisa iniciar a economia de ações neste combate.");
  const old=ledger.clock;
  if (JSON.stringify(old.order)!==JSON.stringify(clock.order) || clock.round<old.round || (clock.round===old.round && clock.turn<old.turn))
    throw new Error("Iniciativa alterada ou turno retrocedido. O Mestre deve ressincronizar a economia.");
  const next=copy(ledger);
  next.clock=copy(clock);
  return next;
}
export function remaining(ledger,clock,combatantId) {
  const index=clock.order.indexOf(combatantId);
  if(index<0) throw new Error("Participante fora do combate.");
  const epoch=clock.round-(index>clock.turn?1:0);
  const old=ledger.rows.find(r=>r.id===combatantId);
  if(old && old.epoch>epoch) throw new Error("Turno retrocedido; ressincronize a economia.");
  return old && old.epoch===epoch ? {id:combatantId,epoch,...Object.fromEntries(types.map(k=>[k,old[k]]))} : {id:combatantId,epoch,...initial()};
}
function writeRow(ledger,row) {
  ledger.rows=ledger.rows.filter(r=>r.id!==row.id);
  ledger.rows.push(row);
}
export function planSpend(ledger,clock,charges) {
  const next=currentLedger(ledger,clock);
  if(!Array.isArray(charges)||!charges.length||new Set(charges.map(c=>c.combatantId)).size!==charges.length) throw new Error("Custos duplicados ou ausentes.");
  for(const c of charges) {
    if(!COSTS.includes(c.cost)) throw new Error("Custo inválido.");
    const row=remaining(next,clock,c.combatantId);
    if(c.cost==="free") continue;
    if(c.cost!=="reaction" && c.offTurn!==true && clock.order[clock.turn]!==c.combatantId)
      throw new Error("Ação e ação bônus exigem o próprio turno.");
    if(row[c.cost]<1) throw new Error("Ação, ação bônus ou reação indisponível.");
    row[c.cost]--;
    writeRow(next,row);
  }
  return next;
}
export function setRemaining(ledger,clock,combatantId,cost,value) {
  if(!types.includes(cost)||!integer(value,0,20)) throw new Error("Escolha um custo e um saldo entre 0 e 20.");
  const next=currentLedger(ledger,clock);
  const row=remaining(next,clock,combatantId);
  row[cost]=value;writeRow(next,row);return next;
}
/** Successful native uses are advisory: repeat attack activities within the same
 * action are saturated at zero. GM can correct extra attacks or special grants. */
export function recordNative(ledger,clock,combatantId,cost,receipt) {
  if(!id(receipt)||!types.includes(cost)) throw new Error("Registro de atividade inválido.");
  const next=currentLedger(ledger,clock);
  if(next.receipts.includes(receipt)) return next;
  const row=remaining(next,clock,combatantId);
  if(cost==="reaction" || clock.order[clock.turn]===combatantId) {
    row[cost]=Math.max(0,row[cost]-1);writeRow(next,row);
  }
  next.receipts=[...next.receipts,receipt].slice(-1000);
  return next;
}
export function resyncLedger(ledger,clock) {
  // Preserve all prior balances, never silently refund on initiative edits.
  const next=newLedger(clock);
  next.receipts=Array.from(ledger?.receipts ?? []).slice(-1000);
  next.rows=clock.order.map((id,index)=>{
    const old=ledger?.rows?.find(r=>r.id===id);
    return {id,epoch:clock.round-(index>clock.turn?1:0),...(old?Object.fromEntries(types.map(k=>[k,old[k]])):initial())};
  });
  return next;
}
