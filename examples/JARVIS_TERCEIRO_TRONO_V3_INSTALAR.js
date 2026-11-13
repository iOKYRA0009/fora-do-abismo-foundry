// Cole este arquivo em Central Jarvis > Macro Executor > JavaScript (modo Script).
// Atualiza somente os quatro Actors identificados abaixo. Exige Jarvis com thirdThrone.command e socketlib.
const MODULE = "fora-do-abismo-foundry";
const IDS = {
  jack: "MxWry5bSpDdH36Z7",
  enforcado: "ueUfr5JrOEjLPi2V",
  procissao: "mzoiuTGUwk2zUbHy",
  sentinela: "K1VakgpDkbmyE2Cf"
};
const VERSION = "3.0.0";
if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {
  throw new Error("Terceiro Trono V3: execute como Mestre ativo.");
}
const api = game.modules.get(MODULE)?.api;
if (typeof api?.thirdThrone?.command !== "function") {
  throw new Error("Atualize Jarvis Tools para a versão que inclui Terceiro Trono V3 antes de instalar as fichas.");
}
if (!api.thirdThrone.remoteStatus()?.ready) throw new Error("Ative socketlib e recarregue o Foundry antes da instalação.");
const matches = game.users.contents.filter(u => u.name.trim().toLocaleLowerCase("pt-BR") === "ruan" && !u.isGM);
if (matches.length !== 1) throw new Error(`É necessário exatamente um jogador chamado Ruan. Encontrados: ${matches.length}.`);
const ruan = matches[0];
const actors = Object.fromEntries(Object.entries(IDS).map(([key, id]) => [key, game.actors.get(id)]));
if (Object.values(actors).some(actor => !actor)) throw new Error("Uma das quatro fichas exportadas não existe neste mundo. Importe-a antes de executar.");
if (actors.jack.type !== "character" || ["enforcado", "procissao", "sentinela"].some(k => actors[k].type !== "npc")) {
  throw new Error("Os tipos das fichas não correspondem a Jack e às três manifestações.");
}
const jack = actors.jack;
const folderName = "Jack Ebonhart — Terceiro Trono";
let folder = game.folders.contents.find(f => f.type === "Actor" && f.name === folderName);
if (!folder) folder = await Folder.create({ name: folderName, type: "Actor", color: "#51445f" });
const soulPath = "system.resources.primary.value";
const activityBase = () => ({
  activation: { type: "action", value: 1, override: true, condition: "" },
  consumption: { spellSlot: false, scaling: { allowed: false, max: "" }, targets: [] },
  description: { value: "", chatFlavor: "" },
  duration: { units: "inst", concentration: false, override: true, expiry: null },
  effects: [], range: { override: true, units: "self", value: "", special: "" },
  target: { override: true, prompt: false, template: { type: "", units: "ft", contiguous: false, stationary: false }, affects: { type: "self", count: "1", choice: false } },
  uses: { spent: 0, max: "", recovery: [] }, sort: 0, flags: {}, behaviors: []
});
function utility(id, name, activation, chatFlavor, post = "", pre = "") {
  const a = activityBase();
  Object.assign(a, { _id: id, type: "utility", name });
  a.activation.type = activation;
  a.description.chatFlavor = chatFlavor;
  a.flags[MODULE] = { automation: { ...(pre ? { pre } : {}), ...(post ? { post } : {}) } };
  return a;
}
function attack(id, name, ability, bonus, dice, denomination, damageBonus, damageType, range = 5, post = "") {
  const a = activityBase();
  Object.assign(a, { _id: id, type: "attack", name });
  a.range = { override: true, value: String(range), units: "ft", special: "" };
  a.target.affects = { type: "creature", count: "1", choice: false };
  a.target.prompt = true;
  a.attack = { ability, bonus: String(bonus), flat: false, critical: { threshold: null },
    type: { value: range > 5 ? "ranged" : "melee", classification: "" } };
  a.damage = { includeBase: false, critical: { bonus: "" }, parts: [{
    number: dice, denomination, bonus: String(damageBonus), types: [damageType],
    custom: { enabled: false, formula: "" }, scaling: { mode: "", number: 1 }, modifiers: []
  }] };
  a.flags[MODULE] = { automation: post ? { post } : {} };
  return a;
}
function save(id, name, ability, chatFlavor, post, radius = 0) {
  const a = activityBase();
  Object.assign(a, { _id: id, type: "save", name });
  a.save = { ability: [ability], dc: { calculation: "formula", formula: "17" }, visible: true };
  a.damage = { onSave: "none", parts: [] };
  a.range = { override: true, value: "30", units: "ft", special: "" };
  a.target.affects = { type: "creature", count: radius ? "" : "1", choice: false };
  a.target.prompt = true;
  if (radius) a.target.template = { type: "circle", size: String(radius), units: "ft", contiguous: false, stationary: true };
  a.description.chatFlavor = chatFlavor;
  a.flags[MODULE] = { automation: { post } };
  return a;
}
function commandPost(action, extra = "") {
  return `const api=game.modules.get("${MODULE}")?.api?.thirdThrone;if(!api)throw new Error("Terceiro Trono V3 indisponível.");` +
    `const token=canvas?.tokens?.controlled?.find(t=>t.actor?.id===actor.id);` +
    `await api.command({jackId:actor.id,action:"${action}",sceneId:canvas?.scene?.id,tokenId:token?.id${extra}});`;
}
function powerPost(code, extra = "") {
  return `const api=game.modules.get("${MODULE}")?.api?.thirdThrone;if(!api)throw new Error("Terceiro Trono V3 indisponível.");` +
    `await api.command({jackId:"${IDS.jack}",action:"power",power:"${code}",sceneId:canvas?.scene?.id${extra}});`;
}
function powerPre(cost, kind, reaction = false) {
  return `const j=game.actors.get("${IDS.jack}");const s=j?.getFlag("${MODULE}","thirdThroneV3State");` +
    `if(!s||!s.kinds?.includes("${kind}")||game.time.worldTime>=s.expiresAt){jarvis.notify("Manifestação inativa ou expirada.","warn");return false;}` +
    (cost ? `if(Number(j.system.resources.primary.value)<${cost}){jarvis.notify("Almas insuficientes.","warn");return false;}` : "") +
    `const c=game.combat;const key=c?.started?c.id+":"+c.round:"fora:"+Math.floor(Number(game.time.worldTime)/6);` +
    (reaction ?
      `if(s.lastFreeReactionRound===key||s.lastMuralhaRound===key){jarvis.notify("Bram já usou a reação.","warn");return false;}` :
      `if(c?.started&&c.combatant?.actor?.id!==j.id&&c.combatant?.token?.actorId!==j.id){jarvis.notify("A manifestação age após Jack no turno dele.","warn");return false;}` +
      `if(s.actionRound?.["${kind}"]===key){jarvis.notify("Ação desta manifestação já usada.","warn");return false;}`) +
    (cost ? `if(s.lastPaidRound===key){jarvis.notify("Habilidade paga já usada nesta rodada.","warn");return false;}` : "");
}
function withPre(activity, cost, kind, reaction = false) { activity.flags[MODULE].automation.pre = powerPre(cost, kind, reaction); return activity; }
function itemData(identifier, name, description, activities, sort = 0) {
  return { name, type: "feat", img: "icons/magic/unholy/hand-marked-pink.webp", sort,
    system: { identifier, description: { value: description, chat: "" }, type: { value: "class", subtype: "" },
      activities: Object.fromEntries(activities.map(a => [a._id, a])), uses: { spent: 0, max: "", recovery: [] } },
    flags: { [MODULE]: { provenance: { kind: "homebrew", confidence: 1, reason: "Terceiro Trono V3 aprovado pelo Mestre" },
      organization: { group: "special", label: "TERCEIRO TRONO V3", kind: "active", sort } } } };
}
async function upsertItem(actor, data) {
  const existing = actor.items.find(i => i.system?.identifier === data.system.identifier);
  if (!existing) return (await actor.createEmbeddedDocuments("Item", [data]))[0];
  const old = Array.from(existing.system?.activities ?? []).map(a => a.id ?? a._id);
  const activities = { ...Object.fromEntries(old.map(id => [`-=${id}`, null])), ...data.system.activities };
  await existing.update({ name: data.name, img: data.img, sort: data.sort,
    "system.description.value": data.system.description.value,
    "system.activities": activities,
    [`flags.${MODULE}.organization`]: data.flags[MODULE].organization });
  return existing;
}
const selected = ["enforcado", "procissao", "sentinela"];
const vulnerable = "<p><strong>[REGRA CASEIRA — fraqueza divina]</strong> Vulnerabilidade a dano radiante. São ecos do Trono, do tipo Constructo; Hallow e Expulsar Mortos-Vivos não os afetam automaticamente pelas regras oficiais.</p>";
const roster = {
  enforcado: {
    title: "Oswin — Contenção",
    bio: "Oswin, antigo mordomo-chefe da casa de Jack, comanda correntes de memória e disciplina. Age após Jack; uma ação e até 30 pés de movimento por turno. Não decide por si: sem ordem, Esquiva. Dura até 1 minuto; uma manifestação individual ou o trio. Ataque básico gratuito; controle custa 5 Almas.",
    activities: [
      withPre(attack("TronoOswinAtk001", "Golpe das Correntes — sem custo", "dex", 1, 1, 6, 2, "necrotic", 5, powerPost("correntes")), 0, "enforcado"),
      withPre(save("TronoOswinLaco01", "Laço do Impossível — 5 Almas", "str", "Falha: Restringido até o início do próximo turno de Jack. Sucesso: deslocamento -10 pés no mesmo prazo.", powerPost("laco")), 5, "enforcado"),
      withPre(save("TronoOswinArea01", "Fechar as Passagens — 5 Almas", "str", "Até dois alvos a 15 pés de Oswin. Falha: deslocamento 0 até o início do próximo turno de Jack. Sucesso: sem efeito.", powerPost("passagens")), 5, "enforcado")
    ]
  },
  procissao: {
    title: "Mirel, Sabine e Heloa — Coro",
    bio: "As três antigas servas da família de Jack são uma só manifestação mecânica. Seu coral distorce passos e distâncias. Age após Jack; uma ação e até 30 pés de movimento por turno. Sem ordem, Esquiva. Dura até 1 minuto. Não causa Amedrontado.",
    activities: [
      withPre(utility("TronoCoroLivre01", "Refrão Raso — sem custo", "action", "Um espaço de 5 pés a até 30 pés da Procissão vira terreno difícil para inimigos até o início do próximo turno de Jack.", powerPost("refrao")), 0, "procissao"),
      withPre(save("TronoCoroArea001", "Coro das Passagens Mortas — 5 Almas", "str", "Raio de 15 pés a até 30 pés da Procissão: terreno difícil para inimigos até o início do próximo turno de Jack. Falha em Força: -10 pés de deslocamento no mesmo prazo; sucesso: só terreno difícil.", powerPost("coro"), 15), 5, "procissao"),
      withPre(save("TronoCoroDano001", "Litania dos Nomes Vazios — 5 Almas", "wis", "Escolha até dois inimigos a até 30 pés. Cada um sofre 2d8 psíquico na falha ou metade no sucesso; role o dano pela Activity.", powerPost("litania")), 5, "procissao")
    ]
  },
  sentinela: {
    title: "Bram — Defesa",
    bio: "Bram morreu protegendo a família de Jack e mantém o posto em uma armadura de ossos e raízes. Age após Jack; uma ação, uma reação e até 30 pés de movimento por turno. Sem ordem, Esquiva. Dura até 1 minuto. A reação defensiva básica é gratuita; a Muralha e o ataque forte custam 5 Almas.",
    activities: [
      withPre(utility("TronoBramGuarda1", "Interpor Escudo — reação sem custo", "reaction", "Quando uma criatura a até 10 pés sofrer dano, reduza uma instância em 1d6+3. Consome a reação de Bram.", powerPost("guarda")), 0, "sentinela", true),
      withPre(utility("TronoBramMuralha", "Muralha dos Ausentes — reação, 5 Almas", "reaction", "Quando uma criatura a até 10 pés sofrer dano, reduza uma instância em 2d8+Carisma atual de Jack. Consome a reação de Bram.", powerPost("muralha")), 5, "sentinela", true),
      withPre(attack("TronoBramGolpe01", "Golpe da Sentinela — 5 Almas", "str", 1, 2, 8, 3, "bludgeoning", 5, powerPost("golpe")), 5, "sentinela")
    ]
  }
};
roster.enforcado.activities[2].range.value = "15";
roster.enforcado.activities[2].target.affects.count = "2";
const litania = roster.procissao.activities[2];
litania.target.affects.count = "2";
litania.damage = { onSave: "half", parts: [{ number: 2, denomination: 8, bonus: "", types: ["psychic"],
  custom: { enabled: false, formula: "" }, scaling: { mode: "", number: 1 }, modifiers: [] }] };
for (const [index, formula, label] of [[0, "1d6+3", "Redução de dano"], [1, "2d8+4", "Redução de dano"]]) {
  roster.sentinela.activities[index].roll = { prompt: false, visible: true, name: label, formula };
}
for (const kind of selected) {
  const actor = actors[kind];
  const data = roster[kind];
  const priorBio = actor.system.details?.biography?.value ?? "";
  const originalLore = priorBio.split("<h3>")[0];
  await actor.update({ folder: folder.id,
    "system.traits.dv.value": [...new Set([...(actor.system.traits?.dv?.value ?? []), "radiant"])],
    "system.details.biography.value": `<h2>${data.title}</h2>${originalLore}<p>${data.bio}</p>${vulnerable}` });
  const old = actor.items.find(i => ["Laço do Impossível", "Presságio da Morte", "Muralha dos Ausentes"].includes(i.name));
  if (old) await old.update({ name: `${data.title} — Arquivo V2`,
    "system.description.value": `<p><strong>Arquivo V2:</strong> habilidade substituída. Use TERCEIRO TRONO V3.</p>${old.system.description?.value ?? ""}`,
    [`flags.${MODULE}.thirdThroneV3Archive`]: Array.from(old.system.activities ?? []).map(a => a.toObject?.() ?? a),
    "system.activities": Object.fromEntries(Array.from(old.system.activities ?? []).map(a => [`-=${a.id ?? a._id}`, null])) });
  await upsertItem(actor, itemData(`terceiro-trono-v3-${kind}`, `${data.title} — Ações V3`,
    `<h2>${data.title}</h2><p>${data.bio}</p>${vulnerable}<p>Movimento: 30 pés. Ação própria após Jack; pode Correr, Desengajar, Esquivar e Ajudar. No trio, apenas uma habilidade paga por rodada entre as três. CD atual do Trono: 17; revise se a CD de Jack mudar.</p>`, data.activities));
  const basics = [
    ["correr", "Correr", "Move até o deslocamento adicional da manifestação neste turno."],
    ["desengajar", "Desengajar", "O movimento desta manifestação não provoca Ataques de Oportunidade neste turno."],
    ["esquivar", "Esquivar", "Ataques contra esta manifestação têm desvantagem quando aplicável; vantagem em salvaguardas de Destreza até o começo do próximo turno."],
    ["ajudar", "Ajudar", "Ajuda um aliado em uma tarefa ou no próximo ataque contra inimigo a até 5 pés da manifestação."]
  ].map(([code, name, detail], index) => withPre(utility(`TronoBas${kind.slice(0, 4)}${index}001`, name, "action", detail,
    powerPost("basic", `,kind:"${kind}",basic:"${code}"`)), 0, kind));
  await upsertItem(actor, itemData(`terceiro-trono-v3-basicas-${kind}`, `${data.title} — Ações básicas`,
    "<p>Ações normais de criatura. Uma ação por rodada; Correr, Desengajar, Esquivar e Ajudar não custam Almas.</p>", basics, -10));
}
const summons = selected.map((kind, index) => utility(`TronoConvoc${index}0001`, `Invocar ${roster[kind].title} — 15 Energia`, "bonus",
  "Invoca por 1 minuto, alcance 30 pés; uma manifestação individual ativa.", commandPost("summon", `,kind:"${kind}"`)));
summons.push(utility("TronoConvocarTri", "Invocar o Trio — 30 Energia", "bonus",
  "Invoca as três por 1 minuto. Jack gasta também sua reação até o início do próximo turno; selecione o token dele.", commandPost("summon", `,kind:"trio"`)));
summons.push(utility("TronoEncerrar001", "Encerrar manifestações", "special", "Remove as manifestações e devolve a ocultação das fichas para Ruan.", commandPost("dismiss")));
const fieldPost = commandPost("field");
const fieldActivities = [utility("TronoCampoAtiva1", "Coral da Casa Ausente — 10 Almas excedentes", "action",
  "Com as três ativas, centro em Jack: raio de 90 pés. Inimigos tratam a área como terreno difícil por duas rodadas. Reativar custa mais 10 Almas. Exige ao menos 60 Almas atuais; nunca consome as 50 protegidas.", fieldPost)];
await upsertItem(jack, itemData("terceiro-trono-v3-invocacoes", "Terceiro Trono V3 — Invocar e Encerrar",
  "<h2>Invocar</h2><p>Individual: ação bônus e 15 Energia. Trio: ação bônus, reação de Jack e 30 Energia. Duração: 1 minuto. As manifestações agem após Jack e suas fichas ficam visíveis a Ruan enquanto estão em campo. Zero continua independente.</p>", summons, 10));
await upsertItem(jack, itemData("terceiro-trono-v3-campo", "Terceiro Trono V3 — Coral da Casa Ausente",
  "<h2>Coral da Casa Ausente</h2><p>[REGRA CASEIRA] Com as três presentes, Jack gasta uma ação e 10 Almas acima da reserva de 50. Cria um círculo fixo de 90 pés de raio: terreno difícil apenas para inimigos por duas rodadas. Reativação custa novamente 10 Almas. Se uma manifestação desaparecer, o campo termina. O efeito não acumula com outro terreno difícil.</p>", fieldActivities, 11));
const legacy = jack.items.find(i => i.name.startsWith("O Terceiro Trono — Regente"));
if (legacy) {
  if (!legacy.getFlag(MODULE, "thirdThroneV3Archive")) {
    await legacy.setFlag(MODULE, "thirdThroneV3Archive", { description: legacy.system.description?.value ?? "",
      activities: Array.from(legacy.system.activities ?? []).map(a => a.toObject?.() ?? a) });
  }
  const keep = ["Silêncio Absoluto", "Vontade Alimenta", "Consultar Marcha", "Consultar Terceiro Trono"];
  const acts = Array.from(legacy.system.activities ?? []);
  const changes = { name: "Terceiro Trono — Patamares e legado",
    "system.description.value": "<h2>Terceiro Trono — Patamares</h2><p>[HOMEBREW — FORA DO ABISMO] Após aceitar a fusão voluntária do Orbe, Jack pode manifestar ecos de almas, memória e Raízes do Vazio. Zero permanece independente. Os patamares 10, 25 e 50 já alcançados continuam desbloqueados quando Almas são gastas voluntariamente. Arauto de Ossos continua exigindo 100 Almas atuais.</p><p><strong>25 — Vontade Alimenta a Ruína:</strong> uma vez por turno, +1d8 necrótico após Eldritch Blast atingir alvo afetado por manifestação. <strong>50 — Silêncio Absoluto:</strong> 20 Energia, 1/descanso longo; alvo Restringido por Oswin faz resistência de Constituição contra CD de Jack; falha: Atordoado até o início do próximo turno de Jack. <strong>100 — Arauto/Marcha:</strong> exigem 100 Almas atuais. Use Invocar e Coral V3 para as novas ações.</p>" };
  for (const a of acts) {
    const id = a.id ?? a._id;
    if (!keep.some(name => a.name.startsWith(name))) changes[`system.activities.-=${id}`] = null;
    else if (a.name.startsWith("Silêncio Absoluto")) {
      changes[`system.activities.${id}.flags.${MODULE}.automation.pre`] =
        "const E=Number(actor.system.resources?.secondary?.value??0);if(E<20){jarvis.notify(\"Necessário 20 Energia.\",\"warn\");return false;}const t=[...game.user.targets][0];if(!t){jarvis.notify(\"Selecione alvo Restringido por Oswin.\",\"warn\");return false;}";
      changes[`system.activities.${id}.description.chatFlavor`] = "Alvo Restringido por Oswin: resistência de Constituição; falha: Atordoado até início do próximo turno de Jack.";
    } else if (a.name.startsWith("Vontade Alimenta")) {
      changes[`system.activities.${id}.flags.${MODULE}.automation.pre`] =
        "const s=actor.getFlag(\"fora-do-abismo-foundry\",\"thirdThroneV3State\");if(!s||game.time.worldTime>=s.expiresAt){jarvis.notify(\"É necessária uma manifestação ativa.\",\"warn\");return false;}const c=game.combat;const tag=c?c.id+\":\"+c.round+\":\"+c.turn:null;if(tag&&actor.getFlag(\"fora-do-abismo-foundry\",\"terceiroTronoD8Turno\")===tag){jarvis.notify(\"+1d8 já usado neste turno.\",\"warn\");return false;}";
    } else if (a.name.startsWith("Consultar Terceiro Trono")) {
      changes[`system.activities.${id}.flags.${MODULE}.automation.post`] =
        "const s=Number(actor.system.resources?.primary?.value??0),e=Number(actor.system.resources?.secondary?.value??0);const f=actor.getFlag(\"fora-do-abismo-foundry\",\"thirdThroneV3State\");await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:\"<p><b>Terceiro Trono V3:</b> \"+s+\"/100 Almas atuais; \"+e+\"/50 Energia; \"+(f?.mode||\"sem manifestação\")+\". Patamares 10/25/50 desbloqueados; Arauto e Marcha exigem 100 Almas atuais.</p>\"});";
    }
  }
  await legacy.update(changes);
}
const receptaculo = jack.items.find(i => i.name.startsWith("Receptáculo da Fusão"));
if (receptaculo) {
  const queda = Array.from(receptaculo.system.activities ?? []).find(a => a.name.startsWith("Queda a 0 PV"));
  const changes = {
    "system.description.value": "<h2>Receptáculo da Fusão — V3</h2><p>Almas Vinculadas: 50 iniciais, máximo 100. Habilidades pagas das manifestações consomem 5 Almas. O Coral conjunto consome 10 apenas do excedente acima de 50. Gastos voluntários não são repostos por descanso. Absorção continua +1 comum, +2 drow, +15 boss. Ao cair a 0 PV, perde-se somente o excedente acima de 50; Almas gastas não reaparecem. Energia de Fusão: 50, recuperada no descanso longo; invocação individual 15, trio 30.</p>"
  };
  if (queda) changes[`system.activities.${queda.id ?? queda._id}.flags.${MODULE}.automation.post`] =
    "const s=Number(actor.system.resources?.primary?.value??0);const next=Math.min(s,50);await actor.update({\"system.resources.primary.value\":next});jarvis.notify(\"Queda a 0 PV: Almas \"+s+\" → \"+next+\". Gastos anteriores não são restaurados.\",\"info\");";
  const consulta = Array.from(receptaculo.system.activities ?? []).find(a => a.name.startsWith("Consultar Receptáculo"));
  if (consulta) changes[`system.activities.${consulta.id ?? consulta._id}.flags.${MODULE}.automation.post`] =
    "const s=Number(actor.system.resources?.primary?.value??0),e=Number(actor.system.resources?.secondary?.value??0);await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:\"<p>Receptáculo V3: \"+s+\"/100 Almas e \"+e+\"/50 Energia. Gastos de Almas permanecem gastos; queda a 0 PV elimina somente o excedente acima de 50.</p>\"});";
  await receptaculo.update(changes);
}
const oldFlags = ["terceiroTronoManifestacao", "terceiroTronoPrimeiroComando"];
for (const key of oldFlags) if (jack.getFlag(MODULE, key) !== undefined) await jack.unsetFlag(MODULE, key);
await jack.setFlag(MODULE, "thirdThroneV3", { version: VERSION, userId: ruan.id,
  summonIds: { enforcado: IDS.enforcado, procissao: IDS.procissao, sentinela: IDS.sentinela },
  baseProtectedSouls: 50, fieldExcessCost: 10,
  fusionAccepted: jack.getFlag(MODULE, "thirdThroneV3")?.fusionAccepted === true });
if (jack.ownership?.[ruan.id] !== 3) await jack.update({ [`ownership.${ruan.id}`]: 3 });
ui.notifications.info("Terceiro Trono V3 instalado. Ruan verá as fichas das manifestações ao invocá-las. Teste no mundo de preparação antes da mesa.");
return { version: VERSION, jack: jack.name, player: ruan.name, folder: folder.name,
  summonActors: selected.map(kind => actors[kind].name),
  installedItems: ["Terceiro Trono V3 — Invocar e Encerrar", "Terceiro Trono V3 — Coral da Casa Ausente"] };
