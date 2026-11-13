const MODULE_ID = "fora-do-abismo-foundry";
const CONFIG_KEY = "thirdThroneV3";
const STATE_KEY = "thirdThroneV3State";
const KINDS = ["enforcado", "procissao", "sentinela"];
const LABELS = {
  enforcado: "Oswin — O Enforcado Sem Corda",
  procissao: "Mirel, Sabine e Heloa — A Procissão dos Últimos Suspiros",
  sentinela: "Bram — A Sentinela dos Nomes Negados"
};
const POWER_COSTS = {
  correntes: { kind: "enforcado", cost: 0, label: "Golpe das Correntes", action: true },
  laco: { kind: "enforcado", cost: 5, label: "Laço do Impossível" },
  passagens: { kind: "enforcado", cost: 5, label: "Fechar as Passagens" },
  refrao: { kind: "procissao", cost: 0, label: "Refrão Raso", action: true },
  coro: { kind: "procissao", cost: 5, label: "Coro das Passagens Mortas" },
  litania: { kind: "procissao", cost: 5, label: "Litania dos Nomes Vazios" },
  guarda: { kind: "sentinela", cost: 0, label: "Interpor Escudo", reaction: true },
  muralha: { kind: "sentinela", cost: 5, label: "Muralha dos Ausentes", reaction: true },
  golpe: { kind: "sentinela", cost: 5, label: "Golpe da Sentinela" }
};
const BASIC_ACTIONS = { correr: "Correr", desengajar: "Desengajar", esquivar: "Esquivar", ajudar: "Ajudar" };
const dismissing = new Set();

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function values(collection) { return collection?.contents ?? Array.from(collection?.values?.() ?? []); }
function config(jack) { return jack?.getFlag?.(MODULE_ID, CONFIG_KEY); }
function state(jack) { return jack?.getFlag?.(MODULE_ID, STATE_KEY); }
function roundKey(combat) { return combat?.started ? `${combat.id}:${combat.round}` : `fora:${Math.floor(number(game.time?.worldTime) / 6)}`; }
function now() { return number(game.time?.worldTime); }
function activeState(jack) {
  const current = state(jack);
  if (!current) return null;
  if (now() >= number(current.expiresAt)) return null;
  const combat = game.combat;
  if (combat?.started && current.combatId === combat.id && combat.round >= current.expiresRound) return null;
  return current;
}
function ownedJack(jackId, sender) {
  const jack = game.actors?.get?.(jackId);
  if (!jack || !config(jack) || (sender && !sender.isGM && !jack.testUserPermission?.(sender, "OWNER"))) {
    throw new Error("Terceiro Trono: Jack não encontrado ou usuário sem permissão.");
  }
  if (sender && !sender.isGM && config(jack).userId !== sender.id) {
    throw new Error("Terceiro Trono: este painel pertence ao jogador designado.");
  }
  return jack;
}
function combatTurnIsJack(jack) {
  const combat = game.combat;
  if (!combat?.started) return true;
  const current = combat.combatant;
  return current?.actor?.id === jack.id || current?.token?.actorId === jack.id;
}
function sceneFor(sender, sceneId) {
  const scene = game.scenes?.get?.(sceneId);
  if (!scene || (!sender.isGM && sender.viewedScene !== scene.id)) {
    throw new Error("Terceiro Trono: cena não acessível ao jogador.");
  }
  return scene;
}
function jackToken(scene, jack, tokenId) {
  const token = scene.tokens?.get?.(tokenId);
  if (!token || token.actorId !== jack.id) throw new Error("Selecione o token de Jack na cena antes de invocar.");
  return token;
}
function tokensFor(scene, current) {
  return (current.tokenIds ?? []).map(id => scene.tokens?.get?.(id)).filter(Boolean);
}
function allThreePresent(scene, current) {
  return current?.mode === "trio" && tokensFor(scene, current).length === 3
    && tokensFor(scene, current).every(token => number(token.actor?.system?.attributes?.hp?.value) > 0);
}
function withinFeet(a, b, scene, feet) {
  const step = gridStep(scene);
  const gridDistance = number(scene.grid?.distance) || 5;
  const dx = (number(a.x) - number(b.x)) / step;
  const dy = (number(a.y) - number(b.y)) / step;
  return Math.hypot(dx, dy) * gridDistance <= feet;
}
function gridStep(scene) { return number(scene.grid?.size) || 100; }
function placement(scene, jack, count) {
  const step = gridStep(scene);
  const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
  const occupied = new Set(values(scene.tokens).map(token => `${token.x}:${token.y}`));
  const found = [];
  for (const [dx, dy] of offsets) {
    const x = jack.x + dx * step, y = jack.y + dy * step;
    if (x < 0 || y < 0 || x >= scene.width || y >= scene.height || occupied.has(`${x}:${y}`)) continue;
    found.push({ x, y });
    occupied.add(`${x}:${y}`);
    if (found.length === count) return found;
  }
  throw new Error("Não há espaços livres próximos de Jack para todas as manifestações.");
}
async function message(jack, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: jack }), content: `<p><strong>Terceiro Trono:</strong> ${text}</p>` });
}
async function grantOwnership(actor, userId) {
  const previous = actor.ownership?.[userId] ?? null;
  await actor.update({ [`ownership.${userId}`]: 3 });
  return previous;
}
async function restoreOwnership(actor, userId, previous) {
  if (!actor || actor.ownership?.[userId] !== 3) return;
  await actor.update(previous == null ? { [`ownership.-=${userId}`]: null } : { [`ownership.${userId}`]: previous });
}
async function clearField(scene, current) {
  const id = current?.field?.templateId;
  if (id && scene?.templates?.get?.(id)) await scene.deleteEmbeddedDocuments("MeasuredTemplate", [id]);
}
async function dismiss(jack, current, { reason = "encerradas" } = {}) {
  if (!current) return;
  if (dismissing.has(jack.id)) return;
  dismissing.add(jack.id);
  try {
    const scene = game.scenes?.get?.(current.sceneId);
    await clearField(scene, current);
    const ids = (current.tokenIds ?? []).filter(id => scene?.tokens?.get?.(id));
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
    for (const [kind, previous] of Object.entries(current.previousOwnership ?? {})) {
      await restoreOwnership(game.actors?.get?.(config(jack)?.summonIds?.[kind]), current.userId, previous);
    }
    await jack.unsetFlag(MODULE_ID, STATE_KEY);
    await message(jack, `manifestações ${reason}.`);
  } finally { dismissing.delete(jack.id); }
}
async function summon(jack, sender, args) {
  if (!combatTurnIsJack(jack)) throw new Error("Jack só pode invocar no próprio turno.");
  if (!config(jack).fusionAccepted && !args.acceptFusion) {
    throw new Error("Jack precisa aceitar voluntariamente a fusão do Orbe antes da primeira invocação.");
  }
  if (activeState(jack)) throw new Error("Encerre a manifestação atual antes de invocar outra.");
  const stale = state(jack);
  if (stale) await dismiss(jack, stale, { reason: "expiradas" });
  const mode = args.kind === "trio" ? "trio" : args.kind;
  if (mode !== "trio" && !KINDS.includes(mode)) throw new Error("Manifestação desconhecida.");
  const energyCost = mode === "trio" ? 30 : 15;
  const energy = number(jack.system?.resources?.secondary?.value);
  if (energy < energyCost) throw new Error(`Energia insuficiente: ${energyCost} necessários.`);
  const scene = sceneFor(sender, args.sceneId);
  const source = jackToken(scene, jack, args.tokenId);
  const kinds = mode === "trio" ? KINDS : [mode];
  const spots = placement(scene, source, kinds.length);
  const actors = kinds.map(kind => game.actors?.get?.(config(jack).summonIds?.[kind]));
  if (actors.some(actor => !actor)) throw new Error("Uma ficha de manifestação não foi instalada.");
  if (!config(jack).fusionAccepted) await jack.setFlag(MODULE_ID, CONFIG_KEY, { ...config(jack), fusionAccepted: true });
  const previousOwnership = {};
  let created = [];
  let charged = false;
  try {
    for (let i = 0; i < kinds.length; i++) previousOwnership[kinds[i]] = await grantOwnership(actors[i], config(jack).userId);
    const documents = [];
    for (let i = 0; i < kinds.length; i++) {
      const doc = await actors[i].getTokenDocument(spots[i]);
      const data = doc.toObject();
      data.actorId = actors[i].id;
      data.actorLink = false;
      data.disposition = 1;
      data.flags = { ...(data.flags ?? {}), [MODULE_ID]: { thirdThroneV3: { jackId: jack.id, kind: kinds[i] } } };
      documents.push(data);
    }
    created = await scene.createEmbeddedDocuments("Token", documents);
    const combat = game.combat;
    const current = {
      mode, kinds, sceneId: scene.id, tokenIds: created.map(token => token.id), userId: config(jack).userId,
      previousOwnership, startedAt: now(), expiresAt: now() + 60,
      combatId: combat?.started ? combat.id : null, expiresRound: combat?.started ? combat.round + 10 : null,
      reactionSpentRound: mode === "trio" ? roundKey(combat) : null,
      lastPaidRound: null, lastFreeReactionRound: null, actionRound: {}, field: null
    };
    await jack.update({ "system.resources.secondary.value": energy - energyCost });
    charged = true;
    await jack.setFlag(MODULE_ID, STATE_KEY, current);
    await message(jack, mode === "trio"
      ? "Oswin, a Procissão e Bram surgem juntos por 1 minuto. Jack gastou 30 Energia, sua ação bônus e sua reação nesta rodada."
      : `${LABELS[mode]} surge por 1 minuto. Jack gastou 15 Energia e sua ação bônus.`);
    return { mode, tokenIds: current.tokenIds, actorIds: actors.map(actor => actor.id), expiresAt: current.expiresAt };
  } catch (error) {
    if (charged) await jack.update({ "system.resources.secondary.value": energy });
    if (created.length) await scene.deleteEmbeddedDocuments("Token", created.map(token => token.id));
    for (let i = 0; i < kinds.length; i++) {
      if (Object.hasOwn(previousOwnership, kinds[i])) await restoreOwnership(actors[i], config(jack).userId, previousOwnership[kinds[i]]);
    }
    throw error;
  }
}
async function power(jack, sender, args) {
  const current = structuredClone(activeState(jack));
  const power = args.power === "basic" && KINDS.includes(args.kind) && BASIC_ACTIONS[args.basic]
    ? { kind: args.kind, cost: 0, label: BASIC_ACTIONS[args.basic] }
    : POWER_COSTS[args.power];
  if (!current || !power || !current.kinds.includes(power.kind)) throw new Error("Habilidade indisponível: manifestação ausente ou expirada.");
  const scene = sceneFor(sender, current.sceneId);
  const token = tokensFor(scene, current).find(t => t.getFlag?.(MODULE_ID, "thirdThroneV3")?.kind === power.kind);
  if (!token || number(token.actor?.system?.attributes?.hp?.value) <= 0) throw new Error("A manifestação não está em campo.");
  const key = roundKey(game.combat);
  if (!power.reaction && !combatTurnIsJack(jack)) throw new Error("A manifestação age após Jack, no turno dele.");
  if (!power.reaction && current.actionRound?.[power.kind] === key) {
    throw new Error("Esta manifestação já usou sua ação nesta rodada.");
  }
  if (power.cost && current.lastPaidRound === key) throw new Error("As manifestações já usaram uma habilidade paga nesta rodada.");
  if (["guarda", "muralha"].includes(args.power) &&
    (current.lastFreeReactionRound === key || current.lastMuralhaRound === key)) {
    throw new Error("Bram já usou sua reação nesta rodada.");
  }
  const souls = number(jack.system?.resources?.primary?.value);
  if (souls < power.cost) throw new Error("Almas Vinculadas insuficientes.");
  if (power.cost) await jack.update({ "system.resources.primary.value": souls - power.cost });
  if (power.cost) current.lastPaidRound = key;
  if (power.reaction && !power.cost) current.lastFreeReactionRound = key;
  if (args.power === "muralha") current.lastMuralhaRound = key;
  if (!power.reaction) current.actionRound = { ...(current.actionRound ?? {}), [power.kind]: key };
  try { await jack.setFlag(MODULE_ID, STATE_KEY, current); }
  catch (error) {
    if (power.cost) await jack.update({ "system.resources.primary.value": souls });
    throw error;
  }
  await message(jack, `${power.label} ativada por ${LABELS[power.kind]}. ${power.cost ? `Custo: ${power.cost} Almas.` : "Sem custo de Almas."} ${power.reaction ? "Reação de Bram gasta." : "Ação da manifestação gasta."} Resolva o alvo e a rolagem pela ficha da manifestação.`);
  return { power: args.power, cost: power.cost, souls: souls - power.cost };
}
async function field(jack, sender, args) {
  const current = structuredClone(activeState(jack));
  if (!current) throw new Error("As manifestações não estão ativas.");
  const scene = sceneFor(sender, current.sceneId);
  if (!allThreePresent(scene, current)) throw new Error("As três manifestações precisam estar em campo e com PV.");
  const souls = number(jack.system?.resources?.primary?.value);
  if (souls < 60) throw new Error("O Coral exige 10 Almas acima das 50 vinculadas: mínimo 60 atuais.");
  const source = jackToken(scene, jack, args.tokenId);
  const combat = game.combat;
  if (!combat?.started || !combatTurnIsJack(jack)) throw new Error("Ative o Coral no turno de Jack, durante um combate.");
  if (current.field && combat.round < current.field.expiresRound) {
    throw new Error("O Coral ainda está ativo. Reative depois que as duas rodadas terminarem.");
  }
  if (!tokensFor(scene, current).every(token => withinFeet(token, source, scene, 30))) {
    throw new Error("As três manifestações devem estar a até 30 pés de Jack para formar o Coral.");
  }
  const oldField = current.field;
  const centerX = source.x + gridStep(scene) / 2, centerY = source.y + gridStep(scene) / 2;
  const template = (await scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle", x: centerX, y: centerY, distance: 90, fillColor: "#5b496e",
    flags: { [MODULE_ID]: { thirdThroneV3: { jackId: jack.id, field: true } } }
  }]))[0];
  let charged = false;
  try {
    await jack.update({ "system.resources.primary.value": souls - 10 });
    charged = true;
    current.field = { templateId: template.id, startedRound: combat.round, expiresRound: combat.round + 2, expiresAt: now() + 12 };
    await jack.setFlag(MODULE_ID, STATE_KEY, current);
  } catch (error) {
    if (charged) await jack.update({ "system.resources.primary.value": souls });
    await scene.deleteEmbeddedDocuments("MeasuredTemplate", [template.id]);
    throw error;
  }
  if (oldField) await clearField(scene, { field: oldField });
  await message(jack, "Coral da Casa Ausente: 90 pés de raio. Para inimigos, a área é terreno difícil por 2 rodadas; aliados atravessam normalmente. Custo: 10 Almas excedentes. Reativar custa outras 10.");
  return { templateId: template.id, expiresRound: current.field.expiresRound, souls: souls - 10 };
}
export async function runThirdThroneOnGm(args, sender) {
  if (!game.user?.isGM || !sender?.active) throw new Error("Terceiro Trono: Mestre ou jogador indisponível.");
  const jack = ownedJack(args?.jackId, sender);
  if (args?.action === "summon") return summon(jack, sender, args);
  if (args?.action === "power") return power(jack, sender, args);
  if (args?.action === "field") return field(jack, sender, args);
  if (args?.action === "dismiss") {
    const current = state(jack);
    if (current) await dismiss(jack, current);
    return { dismissed: Boolean(current) };
  }
  throw new Error("Comando desconhecido do Terceiro Trono.");
}
export function registerThirdThroneEngine() {
  Hooks.on("updateCombat", combat => {
    if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return;
    for (const jack of values(game.actors)) {
      const current = state(jack);
      if (!current || current.combatId !== combat.id) continue;
      const scene = game.scenes?.get?.(current.sceneId);
      if (combat.round >= current.expiresRound || !tokensFor(scene, current).length) {
        void dismiss(jack, current, { reason: "expiradas" });
      } else if (current.field && (combat.round >= current.field.expiresRound || !allThreePresent(scene, current))) {
        void clearField(scene, current).then(async () => {
          current.field = null;
          await jack.setFlag(MODULE_ID, STATE_KEY, current);
        });
      }
    }
  });
  Hooks.on("deleteToken", token => {
    if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return;
    const linked = token.getFlag?.(MODULE_ID, "thirdThroneV3");
    const jack = game.actors?.get?.(linked?.jackId);
    if (dismissing.has(jack?.id)) return;
    const current = state(jack);
    if (!current?.field || !current.tokenIds?.includes(token.id)) return;
    const scene = game.scenes?.get?.(current.sceneId);
    void clearField(scene, current).then(async () => {
      current.field = null;
      await jack.setFlag(MODULE_ID, STATE_KEY, current);
    });
  });
  Hooks.on("updateWorldTime", () => {
    if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return;
    for (const jack of values(game.actors)) {
      const current = state(jack);
      if (!current) continue;
      const scene = game.scenes?.get?.(current.sceneId);
      if (now() >= current.expiresAt) void dismiss(jack, current, { reason: "expiradas" });
      else if (current.field && now() >= current.field.expiresAt) {
        void clearField(scene, current).then(async () => {
          current.field = null;
          await jack.setFlag(MODULE_ID, STATE_KEY, current);
        });
      }
    }
  });
}
