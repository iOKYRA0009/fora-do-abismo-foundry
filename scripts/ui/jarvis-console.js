import { getJarvisAccess, visibleJarvisTabs, assertJarvisAccess } from "./jarvis-console-core.js";
import { searchConsole } from "./console-search.js";
import { TOOL_CATALOG } from "./console-tool-catalog.js";
import { JarvisInputError } from "./console-input-error.js";
import {
  loadConsolePreferences, recordConsoleRecent, setConsoleSidebarCollapsed,
  toggleConsoleFavorite
} from "./console-preferences.js";

const MODULE_ID = "fora-do-abismo-foundry";
const MACRO_COMMAND = `game.modules.get("${MODULE_ID}")?.api?.ui?.open()`;
const TAB_LABELS = Object.freeze({
  overview: "Visão geral", characters: "Personagens e NPCs", content: "Itens e homebrew",
  maps: "Mapas e cenas", appearances: "Aparências e formas", compendiums: "Compêndios",
  macros: "Macros e automações", players: "Jogadores", diagnostics: "Diagnóstico e ajustes"
});
const TAB_ICONS = Object.freeze({
  overview: "fa-gauge-high", characters: "fa-users", content: "fa-book-open",
  maps: "fa-map", appearances: "fa-masks-theater", compendiums: "fa-layer-group",
  macros: "fa-wand-magic-sparkles", players: "fa-user-group", diagnostics: "fa-stethoscope"
});
const TOOL_BY_ID = new Map(TOOL_CATALOG.map(tool => [tool.id, tool]));

let currentDialog = null;
let openingPromise = null;

function api() {
  const value = game.modules.get(MODULE_ID)?.api;
  if (!value) throw new Error("Jarvis ainda não terminou de inicializar.");
  return value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection.values === "function" ? Array.from(collection.values()) : [];
}

function activitiesOf(item) {
  const collection = item?.system?.activities;
  const listed = values(collection);
  return listed.length ? listed : collection && typeof collection === "object"
    ? Object.values(collection).filter(row => row && typeof row === "object") : [];
}

function options(entries, label = entry => entry.label ?? entry.name ?? entry.key, value = entry => entry.id ?? entry.key) {
  return entries.map(entry => `<option value="${escapeHtml(value(entry))}">${escapeHtml(label(entry))}</option>`).join("");
}

function visibleActors() {
  return values(game.actors).filter(actor => getJarvisAccess(game.user, actor).canViewActor);
}

function visiblePacks() {
  return values(game.packs).filter(pack => pack.visible !== false && ["Item", "Actor"].includes(pack.documentName));
}

function availableTools(access = getJarvisAccess(game.user)) {
  return TOOL_CATALOG.filter(tool => !tool.gmOnly || access.gm)
    .filter(tool => !tool.trustedOnly || access.gm || access.trusted);
}

function dashboardToolButtons(ids, preferences) {
  return ids.map(id => TOOL_BY_ID.get(id)).filter(Boolean).map(tool => {
    const favorite = preferences.favorites.includes(tool.id);
    return `<div class="jarvis-console-shortcut"><button type="button" data-jarvis-jump="${escapeHtml(tool.id)}" title="${escapeHtml(tool.description ?? tool.label)}">${escapeHtml(tool.label)}</button>` +
      `<button type="button" data-jarvis-favorite="${escapeHtml(tool.id)}" aria-label="${favorite ? "Remover dos" : "Adicionar aos"} favoritos: ${escapeHtml(tool.label)}" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button></div>`;
  }).join("");
}

function refreshDashboard(root, state) {
  const access = getJarvisAccess(game.user);
  const allowed = new Set(availableTools(access).map(tool => tool.id));
  const preferences = state.preferences ?? loadConsolePreferences();
  for (const [selector, ids] of [
    ["[data-jarvis-favorites]", preferences.favorites.filter(id => allowed.has(id))],
    ["[data-jarvis-recents]", preferences.recents.filter(id => allowed.has(id))]
  ]) {
    const host = root.querySelector(selector);
    if (host) host.innerHTML = ids.length ? dashboardToolButtons(ids, preferences)
      : `<p class="jarvis-console-hint">${selector.includes("favorites") ? "Nenhum favorito ainda." : "Nenhuma ação recente."}</p>`;
  }
  const actor = game.actors?.get?.(fieldValue(root, "jarvis-actor"));
  const active = root.querySelector("[data-jarvis-active-actor]");
  if (active) active.textContent = actor && getJarvisAccess(game.user, actor).canViewActor
    ? `${actor.name} · ${actor.type}` : "Nenhum personagem selecionado";
  const macroHost = root.querySelector("[data-jarvis-macro-favorites]");
  if (macroHost) {
    const jarvis = api();
    const favoriteIds = new Set(jarvis.macros?.favorites?.() ?? []);
    const rows = (jarvis.macros?.list?.() ?? []).filter(row => favoriteIds.has(row.id)).slice(0, 10);
    macroHost.innerHTML = rows.length ? rows.map(row =>
      `<button type="button" data-jarvis-macro-run="${escapeHtml(row.id)}" title="Executar macro autorizada">${escapeHtml(row.name)}</button>`).join("")
      : "<p>Nenhuma macro favorita ainda.</p>";
  }
}

function refreshCaptureStatus(root, capture = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.diagnostics?.capture) {
  const status = root.querySelector("[data-jarvis-capture-status]");
  if (!status) return;
  status.textContent = capture
    ? `Captura ${capture.active ? "ativa" : "parada"} · ${capture.events().length} evento(s) registrado(s).`
    : "Captura de erros indisponível nesta versão do Jarvis.";
}

function refreshActorOptions(root, actorId = null) {
  const select = field(root, "jarvis-actor");
  if (!select) return;
  const previous = actorId ?? select.value;
  const actors = visibleActors();
  select.innerHTML = `<option value="">Selecione</option>${options(actors,
    actor => `${actor.name} · ${actor.type}`, actor => actor.id)}`;
  select.value = actors.some(actor => actor.id === previous) ? previous : "";
  const count = root.querySelector("[data-jarvis-actor-count]");
  if (count) count.textContent = `${actors.length} ficha(s) acessível(is)`;
  const active = root.querySelector("[data-jarvis-active-actor]");
  const selected = actors.find(actor => actor.id === select.value);
  if (active) active.textContent = selected
    ? `${selected.name} · ${selected.type}` : "Nenhum personagem selecionado";
  refreshActorRelatedOptions(root);
}

function refreshActorRelatedOptions(root) {
  const actor = game.actors?.get?.(fieldValue(root, "jarvis-actor"));
  const visible = actor && getJarvisAccess(game.user, actor).canViewActor ? actor : null;
  const playerItems = field(root, "player-item");
  if (playerItems) {
    const previous = playerItems.value;
    const items = visible ? values(visible.items).slice(0, 500) : [];
    playerItems.innerHTML = `<option value="">Selecione</option>${options(items,
      item => `${item.name} · ${item.type}`, item => item.id)}`;
    playerItems.value = items.some(item => item.id === previous) ? previous : "";
  }
  const automationItems = field(root, "automation-item");
  if (automationItems) {
    const previous = automationItems.value;
    const items = visible ? values(visible.items).filter(item => activitiesOf(item).length).slice(0, 500) : [];
    automationItems.innerHTML = `<option value="">Selecione</option>${options(items,
      item => `${item.name} · ${item.id}`, item => item.id)}`;
    automationItems.value = items.some(item => item.id === previous) ? previous : "";
  }
  refreshAutomationActivityOptions(root);
}

function refreshAutomationActivityOptions(root) {
  const select = field(root, "automation-activity");
  if (!select) return;
  const actor = game.actors?.get?.(fieldValue(root, "jarvis-actor"));
  const item = actor && getJarvisAccess(game.user, actor).canViewActor
    ? actor.items?.get?.(fieldValue(root, "automation-item")) : null;
  const rows = activitiesOf(item).slice(0, 100);
  const previous = select.value;
  select.innerHTML = `<option value="">Selecione</option>${options(rows,
    row => `${row.name ?? "Activity"} · ${row.id ?? row._id}`, row => row.id ?? row._id)}`;
  select.value = rows.some(row => (row.id ?? row._id) === previous) ? previous : "";
}

function refreshSceneDocumentOptions(root) {
  const select = field(root, "scene-edit-existing");
  if (!select) return;
  const type = fieldValue(root, "scene-edit-type");
  const name = { Wall: "walls", AmbientLight: "lights", AmbientSound: "sounds" }[type];
  const rows = name ? values(canvas?.scene?.[name]).slice(0, 500) : [];
  const previous = select.value;
  select.innerHTML = `<option value="">Selecione ou informe o ID</option>${options(rows,
    row => `${row.id} · ${type === "Wall" ? (row.c ?? []).join(", ") : `${row.x ?? ""}, ${row.y ?? ""}`}`,
    row => row.id)}`;
  select.value = rows.some(row => row.id === previous) ? previous : "";
}

function refreshManagedMacroOptions(root, selectedId = null) {
  const select = field(root, "managed-macro");
  if (!select) return;
  const rows = api().macros?.list?.() ?? [];
  const previous = selectedId ?? select.value;
  select.innerHTML = `<option value="">Selecione</option>${options(rows,
    row => `${row.name} · ${row.category}`, row => row.id)}`;
  select.value = rows.some(row => row.id === previous) ? previous : "";
}

function populateManagedMacroForm(root) {
  const row = api().macros?.list?.().find(entry => entry.id === fieldValue(root, "managed-macro"));
  if (!row) return;
  for (const [name, value] of Object.entries({
    "managed-name": row.name, "managed-command": row.command, "managed-category": row.category,
    "managed-visibility": row.visibility, "managed-description": row.description,
    "managed-params": JSON.stringify(row.params, null, 2)
  })) {
    const control = field(root, name);
    if (control) control.value = value;
  }
}

function itemTypes() {
  const supported = api().content?.itemTypes?.();
  if (supported) return supported;
  const declared = game.documentTypes?.Item;
  const types = Array.isArray(declared) ? declared : (declared && typeof declared === "object" ? Object.keys(declared) : []);
  return types.length ? types : ["class", "subclass", "feat", "weapon", "equipment", "consumable", "spell", "loot", "tool"];
}

function field(root, name) { return root.querySelector(`[name="${name}"]`); }
function fieldValue(root, name) { return field(root, name)?.value?.trim() ?? ""; }

function selectedActor(root, { required = true, manage = false } = {}) {
  const actor = game.actors.get(fieldValue(root, "jarvis-actor"));
  if (!actor) {
    if (required) throw new JarvisInputError("Selecione um personagem acessível.");
    return null;
  }
  const access = getJarvisAccess(game.user, actor);
  assertJarvisAccess(manage ? access.canManageActor : access.canViewActor,
    "Jarvis: você não tem permissão para este personagem.");
  return actor;
}

function selectedToken(actor) {
  const token = canvas?.tokens?.controlled?.find(candidate => candidate.actor?.id === actor.id)
    ?? canvas?.tokens?.placeables?.find(candidate => candidate.actor?.id === actor.id);
  if (!token) throw new JarvisInputError(`Selecione o Token de ${actor.name} na cena ativa.`);
  return token;
}

async function selectedTransformationToken(actor, state) {
  const remembered = state.transformationTokenId ? canvas?.tokens?.get(state.transformationTokenId) : null;
  const candidates = [
    ...values(canvas?.tokens?.controlled),
    ...(remembered ? [remembered] : []),
    ...values(canvas?.tokens?.placeables)
  ];
  for (const token of candidates) {
    if (token.actor?.id === actor.id) return token;
    try {
      const main = await api().transformation.getMainActor(token);
      if (main?.id === actor.id || main === actor.id || main === actor.uuid) return token;
    } catch (_error) { /* The next token may still be the matching one. */ }
  }
  throw new JarvisInputError(`Selecione o Token de ${actor.name} na cena ativa.`);
}

function requireGM() { assertJarvisAccess(game.user?.isGM, "Jarvis: esta ação exige um Mestre."); }

function summarizeOutput(value, state = { nodes: 0, seen: new WeakSet() }, depth = 0) {
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "bigint") return String(value);
  if (value === null || typeof value !== "object") return value;
  if (value.documentName && value.id) return { type: value.documentName, id: value.id, name: value.name };
  if (state.seen.has(value)) return "[referência repetida]";
  if (depth >= 6 || state.nodes++ >= 500) return "[resumo limitado]";
  state.seen.add(value);
  if (Array.isArray(value)) {
    const entries = value.slice(0, 80).map(entry => summarizeOutput(entry, state, depth + 1));
    if (value.length > 80) entries.push(`[mais ${value.length - 80} registros]`);
    return entries;
  }
  const result = {};
  const keys = Object.keys(value);
  for (const key of keys.slice(0, 80)) {
    try { result[key] = summarizeOutput(value[key], state, depth + 1); }
    catch { result[key] = "[indisponível]"; }
  }
  if (keys.length > 80) result.more = `${keys.length - 80} campos omitidos`;
  return result;
}

function setOutput(root, title, result) {
  const heading = root.querySelector(".jarvis-console-result-title");
  const content = root.querySelector(".jarvis-console-result-content");
  if (!heading || !content) return;
  heading.textContent = title;
  const rendered = typeof result === "string" ? result.slice(0, 50000)
    : JSON.stringify(summarizeOutput(result), null, 2);
  content.textContent = String(rendered ?? "Sem resultado.").slice(0, 50000);
  content.closest(".jarvis-console-result")?.removeAttribute("hidden");
  if (root.dataset) root.dataset.jarvisOutputRevision = String(Number(root.dataset.jarvisOutputRevision ?? 0) + 1);
}

function clearOutput(root) { root.querySelector(".jarvis-console-result")?.setAttribute("hidden", ""); }

function sceneBuildSummary(result, preview) {
  return {
    scene: result?.scene ? { id: result.scene.id, name: result.scene.name } : null,
    preview,
    summary: result?.summary ?? result?.inspection?.counts ?? null,
    backup: result?.existing?.name ?? null,
    regionWarnings: result?.regionSummary ?? null
  };
}

function element(markup) {
  const node = document.createElement("div");
  node.innerHTML = markup;
  return node;
}

function panel(id, body) {
  return `<section class="jarvis-console-panel" id="jarvis-panel-${id}" role="tabpanel" aria-labelledby="jarvis-tab-${id}" data-jarvis-panel="${id}" ${id === "overview" ? "" : "hidden"}>${body}</section>`;
}

function button(action, label, { className = "", title = "" } = {}) {
  const tooltip = title || TOOL_BY_ID.get(action)?.description || label;
  return `<button type="button" data-jarvis-action="${action}" class="${escapeHtml(className)}" title="${escapeHtml(tooltip)}">${escapeHtml(label)}</button>`;
}

function renderContent() {
  const access = getJarvisAccess(game.user);
  const tabs = visibleJarvisTabs(access);
  const jarvis = api();
  const preferences = loadConsolePreferences();
  const actors = visibleActors();
  const packs = visiblePacks();
  const actorOptions = options(actors, actor => `${actor.name} · ${actor.type}`, actor => actor.id);
  const packOptions = options(packs, pack => `${pack.title ?? pack.metadata?.label ?? pack.collection} · ${pack.documentName}`, pack => pack.collection);
  const templates = access.gm ? jarvis.scenes.framework.templates() : [];
  const skins = access.gm ? jarvis.scenes.framework.skins() : [];
  const presets = access.gm ? jarvis.scenes.framework.presets() : [];
  const lighting = access.gm ? jarvis.scenes.lightingPresets() : [];
  const types = itemTypes();
  const contentTemplates = access.gm ? jarvis.content?.templates?.().filter(row => row.spec.kind === "item") ?? [] : [];
  const managedMacros = jarvis.macros?.list?.() ?? [];
  const managedCommands = jarvis.macros?.commands?.() ?? [];
  const sceneEditPresets = access.gm ? jarvis.scenes.editor?.presets?.() ?? [] : [];
  const nav = tabs.map((id, index) => `<button type="button" id="jarvis-tab-${id}" role="tab" aria-controls="jarvis-panel-${id}" tabindex="${index ? -1 : 0}" class="jarvis-console-tab ${index ? "" : "active"}" data-jarvis-tab="${id}" aria-selected="${index ? "false" : "true"}" title="${escapeHtml(TAB_LABELS[id])}"><i class="jarvis-console-tab-icon fa-solid ${TAB_ICONS[id]}" aria-hidden="true"></i><span class="jarvis-console-tab-label">${TAB_LABELS[id]}</span></button>`).join("");
  const gm = access.gm;

  const overview = panel("overview", `
    <h2>Central Jarvis</h2><p>Ferramentas da campanha em um só lugar. Escolha uma área à esquerda ou use a busca.</p>
    <div class="jarvis-console-dashboard">
      <section class="jarvis-console-card"><h3>Estado do módulo</h3><p>Jarvis ${escapeHtml(jarvis.version)}<br>Foundry ${escapeHtml(game.release?.version ?? game.version ?? "V14")} · D&D5e ${escapeHtml(game.system?.version ?? "não identificado")}</p>
      <p>Visage: ${jarvis.appearance.status().active ? "ativo" : "inativo"}<br>Metamorph: ${jarvis.transformation.status().active ? "ativo" : "inativo"}</p></section>
      <section class="jarvis-console-card"><h3>Personagem ativo</h3><p data-jarvis-active-actor>Nenhum personagem selecionado</p><p>${actors.length} ficha(s) e ${packs.length} compêndio(s) acessível(is).</p></section>
      <section class="jarvis-console-card"><h3>Acesso rápido</h3>${dashboardToolButtons(availableTools(access).slice(0, 5).map(tool => tool.id), preferences)}</section>
      <section class="jarvis-console-card"><h3>Favoritos</h3><div data-jarvis-favorites></div></section>
      <section class="jarvis-console-card"><h3>Macros favoritas</h3><div class="jarvis-console-row" data-jarvis-macro-favorites></div></section>
      <section class="jarvis-console-card"><h3>Recentes</h3><div data-jarvis-recents></div></section>
      <section class="jarvis-console-card"><h3>Estado rápido</h3><p>${gm ? "Operações de mundo disponíveis para Mestre." : "Acesso limitado a fichas e ferramentas permitidas."}</p><p>${game.users?.activeGM ? "Mestre ativo conectado." : "Nenhum Mestre ativo detectado."}</p>${gm ? button("diagnostics-run", "Executar diagnóstico") : ""}</section>
    </div>
  `);

  const characters = panel("characters", `
    <h2>Personagens</h2><p>Abra uma ficha existente ou use o importador V9 para preservar recursos, atividades e efeitos.</p>
    <div class="jarvis-console-row">${button("actor-open", "Abrir ficha")}${button("actor-provenance", "Analisar origem")}${button("actor-rules", "Perfil de regras")}${button("actor-jack", "Estado de Jack")}</div>
    ${gm ? `<hr><h3>Criar ficha · modo simples ou avançado</h3><div class="jarvis-console-grid"><label>Nome<input name="actor-name" maxlength="120" placeholder="Nome do personagem"></label><label>Tipo<select name="actor-type"><option value="character">Personagem</option><option value="npc">NPC</option></select></label>
      <label>Modo<select name="actor-mode"><option value="simple">Simples</option><option value="advanced">Avançado</option></select></label><label>PV<input name="actor-hp" type="number" min="1" max="9999" placeholder="Opcional"></label><label>CA<input name="actor-ac" type="number" min="0" max="99" placeholder="Opcional"></label>
      <label>FOR<input name="actor-str" type="number" min="1" max="30" value="10"></label><label>DES<input name="actor-dex" type="number" min="1" max="30" value="10"></label><label>CON<input name="actor-con" type="number" min="1" max="30" value="10"></label>
      <label>INT<input name="actor-int" type="number" min="1" max="30" value="10"></label><label>SAB<input name="actor-wis" type="number" min="1" max="30" value="10"></label><label>CAR<input name="actor-cha" type="number" min="1" max="30" value="10"></label>
      <label class="jarvis-console-span">História inicial<textarea name="actor-biography" rows="2" placeholder="Opcional"></textarea></label></div>
      <p class="jarvis-console-hint">Modo avançado: cole um objeto JSON com <code>data</code> (Actor nativo ou campos Jarvis), <code>effects</code> e outras opções. A ficha nativa permite concluir classe, raça e equipamento.</p><textarea name="actor-advanced" rows="4" placeholder='{"data":{"jarvis":{"skills":{"prc":1}}},"effects":[]}'></textarea>
      <div class="jarvis-console-row">${button("actor-wizard-preview", "Pré-visualizar ficha")}${button("actor-create", "Confirmar criação")}</div>
      <h3>Importar ficha Jarvis V9</h3><p>JSON com <code>schemaVersion: "9.0"</code>, Actor, Items e Effects. O importador valida antes de criar.</p>
      <input name="actor-json-file" type="file" accept=".json,application/json"><textarea name="actor-json" rows="5" placeholder='{"schemaVersion":"9.0","actor":{"name":"Novo personagem","type":"character"},"items":[]}'></textarea>
      <div class="jarvis-console-row">${button("actor-import", "Validar e importar")}${button("actor-progression", "Aplicar progressão da ficha")}${button("actor-compare", "Comparar JSON com a ficha")}</div>
      <h3>Manutenção da ficha</h3><div class="jarvis-console-row"><label>Regras alvo<select name="actor-rules-target"><option value="2024">D&D 2024</option><option value="2014">D&D 2014</option></select></label>
      ${button("actor-rules-set", "Salvar perfil de regras")}${button("actor-provenance-stamp", "Registrar origem dos Items")}${button("actor-jack-sync", "Sincronizar almas de Jack")}</div>` : ""}
  `);

  const content = gm ? panel("content", `
    <h2>Itens, classes e homebrew</h2><p>Cria um Item D&D5e e abre a ficha nativa para configurar Advancement, atividades, usos, magias e detalhes mecânicos.</p>
    <div class="jarvis-console-row"><label>Modelo inicial<select name="item-template">${options(contentTemplates, row => row.label, row => row.key)}</select></label>${button("item-template-use", "Usar modelo")}</div>
    <div class="jarvis-console-grid"><label>Nome<input name="item-name" maxlength="120" placeholder="Nome do conteúdo"></label><label>Tipo<select name="item-type">${options(types, type => type, type => type)}</select></label>
    <label>Destino<select name="item-destination"><option value="world">Biblioteca do mundo</option><option value="actor">Personagem selecionado</option></select></label>
    <label>Cargas máximas<input name="item-uses" type="number" min="0" max="9999" placeholder="Opcional"></label>
    <label>Modo<select name="item-mode"><option value="simple">Simples</option><option value="advanced">Avançado</option></select></label>
    <label class="jarvis-console-span">Descrição inicial<textarea name="item-description" rows="3" placeholder="Descrição, custo, ação e limites da habilidade"></textarea></label></div>
    <p class="jarvis-console-hint">Modo avançado: JSON com <code>data</code>, <code>effects</code> e <code>progression</code>. Activities podem ser informadas em <code>data.jarvis.activities</code>.</p>
    <textarea name="item-advanced" rows="4" placeholder='{"data":{"jarvis":{"activities":[]}},"effects":[],"progression":[]}'></textarea>
    <div class="jarvis-console-row">${button("item-wizard-preview", "Pré-visualizar")}${button("item-create", "Confirmar criação")}</div>
    <p class="jarvis-console-hint">Classes e subclasses são criadas como Items nativos do sistema. Configure progressão e níveis na ficha antes de usar em jogo.</p>
    <h3>Adicionar Items de um JSON V9 à ficha</h3><p>Selecione o personagem ativo. Aceita uma lista de Items ou um objeto com a chave <code>items</code>.</p>
    <input name="items-json-file" type="file" accept=".json,application/json"><textarea name="items-json" rows="4" placeholder='{"items":[{"name":"Novo item","type":"feat"}]}'></textarea>
    <div class="jarvis-console-row">${button("items-import", "Importar Items na ficha")}</div>
  `) : "";

  const maps = gm ? panel("maps", `
    <h2>Mapas, paredes e iluminação</h2><p>O Estúdio revisa cada sugestão antes de criar a cena. A auditoria inspeciona a cena atual sem modificá-la.</p>
    <div class="jarvis-console-row">${button("map-studio", "Abrir Estúdio de Mapas")}${button("map-uvtt", "Importar Universal VTT")}${button("map-audit", "Analisar paredes e luz")}</div>
    <h3>Cena por template</h3><div class="jarvis-console-grid"><label>Template<select name="map-template">${options(templates, item => item.label)}</select></label><label>Skin<select name="map-skin">${options(skins, item => item.label)}</select></label>
    <label>Nome da cena<input name="map-name" maxlength="120" placeholder="Nova cena"></label><label>Colunas<input name="map-columns" type="number" min="5" max="200" value="30"></label><label>Linhas<input name="map-rows" type="number" min="5" max="200" value="22"></label></div>
    <div class="jarvis-console-row">${button("map-template-preview", "Prévia do template")}${button("map-template-create", "Criar cena")}${button("map-skin-apply", "Aplicar skin à cena atual")}</div>
    <h3>Presets prontos</h3><div class="jarvis-console-row"><label>Preset<select name="map-preset">${options(presets, item => item.name)}</select></label>${button("map-preset-preview", "Prévia")}${button("map-preset-create", "Criar preset")}</div>
    <h3>Luz da cena atual</h3><div class="jarvis-console-row"><label>Ambiente<select name="map-lighting">${options(lighting)}</select></label>${button("map-lighting-apply", "Aplicar ambiente")}</div>
    <h3>Editar parede, luz ou som da cena atual</h3><p>Para alterar ou remover, informe o ID do documento nativo. A prévia mostra o estado anterior e os avisos geométricos; o histórico permite desfazer operações compatíveis.</p>
    <div class="jarvis-console-grid"><label>Tipo<select name="scene-edit-type"><option value="Wall">Parede/porta</option><option value="AmbientLight">Luz ambiente</option><option value="AmbientSound">Som ambiente</option><option value="SceneEnvironment">Escuridão e cor da cena</option></select></label>
    <label>Operação<select name="scene-edit-mode"><option value="create">Adicionar</option><option value="update">Modificar</option><option value="delete">Remover</option></select></label>
    <label>Modelo<select name="scene-edit-preset"><option value="">Personalizado</option>${options(sceneEditPresets, row => row.label, row => row.key)}</select></label>
    <label>Documento existente<select name="scene-edit-existing"><option value="">Selecione ou informe o ID</option></select></label>
    <label>ID existente<input name="scene-edit-id" placeholder="Para modificar ou remover"></label>
    <label class="jarvis-console-span">Dados JSON nativos<textarea name="scene-edit-json" rows="4" placeholder='{"c":[100,100,300,100],"door":0}'></textarea></label></div>
    <div class="jarvis-console-row">${button("scene-edit-load", "Carregar dados atuais")}${button("scene-edit-preview", "Pré-visualizar alteração")}${button("scene-edit-apply", "Salvar na cena")}${button("scene-edit-history", "Ver histórico")}
    <label>ID da alteração<input name="scene-undo-id" placeholder="Copie do histórico"></label>${button("scene-edit-undo", "Desfazer alteração")}</div>
    <h3>Scene Package JSON</h3><input name="scene-json-file" type="file" accept=".json,application/json"><textarea name="scene-json" rows="4" placeholder='{"schemaVersion":"1.0","id":"minha-cena","scene":{"name":"Minha cena","columns":30,"rows":20},"walls":[]}'></textarea>
    <div class="jarvis-console-row">${button("scene-package-preview", "Validar e pré-visualizar")}${button("scene-package-create", "Criar Scene Package")}</div>
    <h3>Manutenção da cena ativa</h3><div class="jarvis-console-row">${button("scene-package-inspect", "Inspecionar pacote")}${button("scene-package-repair", "Reparar regiões")}
    <label>Ação manual do pacote<input name="scene-action-key" placeholder="Chave da ação"></label>${button("scene-package-action", "Executar ação")}</div>
    <h3>Recuperação de mapas</h3><div class="jarvis-console-row">${button("scene-migration-preview", "Prévia de migração")}${button("scene-migration-run", "Migrar após revisão")}${button("scene-assets-review", "Revisar arquivos enviados")}</div>
  `) : "";

  const appearances = panel("appearances", `
    <h2>Aparências e formas</h2><p>Visage muda o visual do Token. Metamorph troca sua forma mecânica. Ambos são integrações opcionais.</p>
    <p class="jarvis-console-hint">Visage: ${jarvis.appearance.status().active ? "ativo" : "inativo"} · Metamorph: ${jarvis.transformation.status().active ? "ativo" : "inativo"}</p>
    <div class="jarvis-console-row">${button("appearance-list", "Ver perfis do personagem")}${button("appearance-available", "Ver skins do Token")}</div>
    <h3>Skin Visage</h3><div class="jarvis-console-grid"><label>Chave do perfil<input name="appearance-key" placeholder="ex.: traje-de-combate"></label><label>ID Visage<input name="appearance-id" placeholder="ID da skin no Visage"></label>
    <label>Modo<select name="appearance-mode"><option value="identity">Identidade</option><option value="overlay">Sobreposição</option></select></label></div>
    ${access.gm || access.trusted ? `<div class="jarvis-console-row">${button("appearance-save", "Registrar perfil")}${button("appearance-remove-profile", "Remover perfil")}${button("appearance-apply", "Aplicar ao Token")}${button("appearance-remove", "Remover skin")}${button("appearance-revert", "Reverter visual")}</div>` : ""}
    <h3>Forma Metamorph</h3><div class="jarvis-console-grid"><label>Chave da forma<input name="form-key" placeholder="ex.: forma-alternativa"></label><label>Actor da forma<select name="form-target"><option value="">Selecione</option>${actorOptions}</select></label>
    <label>PV<select name="form-hp"><option value="keep-original">Manter PV originais</option><option value="independent">Independentes</option><option value="absolute">Absolutos</option><option value="percent">Percentuais</option></select></label></div>
    ${access.gm || access.trusted ? `<div class="jarvis-console-row">${button("form-save", "Registrar forma")}${button("form-remove-profile", "Remover forma registrada")}${button("form-apply", "Transformar Token")}${button("form-revert", "Reverter forma")}${button("form-picker", "Abrir seletor Metamorph")}</div>
    <h3>Pacote de aparências Visage</h3><p>Importe um pacote JSON ou exportação Visage para o personagem selecionado. Revise antes de substituir perfis com o mesmo nome.</p>
    <input name="appearance-pack-file" type="file" accept=".json,application/json"><textarea name="appearance-pack-json" rows="4" placeholder='{"profiles":[{"label":"Visual alternativo","tokenPath":"caminho.webp"}]}'></textarea>
    <div class="jarvis-console-row">${button("appearance-pack-import", "Importar pacote de skins")}</div>` : ""}
    <p class="jarvis-console-hint">Alterações de perfil e Token exigem Mestre ou jogador de confiança proprietário do personagem.</p>
  `);

  const compendiums = panel("compendiums", `
    <h2>Compêndios e módulos</h2><p>Consulte conteúdo de módulos ativos sem carregar documentos inteiros até abrir ou importar um resultado.</p>
    <div class="jarvis-console-row"><label>Compêndio<select name="pack"><option value="">Selecione</option>${packOptions}</select></label><label>Buscar<input name="pack-query" maxlength="100" placeholder="Nome ou tipo"></label>${button("pack-search", "Buscar")}</div>
    <div class="jarvis-console-results" data-jarvis-pack-results aria-live="polite"></div>
    <p class="jarvis-console-hint">Mestres podem importar Items para o mundo ou personagem. Jogadores de confiança podem adicionar Items oficiais D&D5e ao próprio personagem.</p>
  `);

  const diagnostics = gm ? panel("diagnostics", `
    <h2>Diagnóstico</h2><p>Verificação somente leitura do módulo, sistema, importador, cenas e fichas.</p>
    <div class="jarvis-console-row">${button("diagnostics-run", "Executar diagnóstico")}${button("framework-test", "Testar templates e skins")}${button("modules-list", "Listar módulos ativos")}</div>
    <h3>Erros da sessão</h3><p>Inicie a captura antes de testar as ações. Os registros ficam neste navegador até serem limpos ou a página ser fechada.</p>
    <div class="jarvis-console-row">${button("diagnostics-capture-start", "Iniciar captura")}${button("diagnostics-capture-stop", "Parar captura")}${button("diagnostics-export", "Exportar relatório JSON")}</div>
    <p class="jarvis-console-hint" data-jarvis-capture-status aria-live="polite"></p>
    <p class="jarvis-console-hint">O teste em memória não substitui uma rodada no mundo real com Token, visão, áudio e combate.</p>
  `) : "";

  const userRows = values(game.users).filter(user => gm || user.id === game.user?.id).map(user =>
    `<li>${escapeHtml(user.name)} · ${escapeHtml(roleLabel(user))}${user.active ? " · online" : ""}</li>`).join("");
  const players = panel("players", `
    <h2>Jogadores</h2><p>Consulte ficha, recursos, itens, compêndios e macros permitidas. Ações que alteram o mundo exigem permissão.</p>
    <ul>${userRows || "<li>Nenhum usuário disponível.</li>"}</ul>
    <div class="jarvis-console-row">${button("actor-open", "Abrir personagem selecionado")}${button("player-overview", "Ver recursos e itens")}${button("pack-focus", "Ir aos compêndios")}</div>
    <div class="jarvis-console-row"><label>Item da ficha<select name="player-item"><option value="">Selecione um personagem</option></select></label>${button("player-item-open", "Abrir Item")}</div>
    <p>As macros autorizadas estão na aba Macros; perfis e formas estão em Aparências.</p>
    ${gm ? `<p class="jarvis-console-hint">Jogador de confiança: papel Trusted Player do Foundry. Só altera fichas que possui; criação global de Actor, Item, mapa e diagnóstico completo continuam com o Mestre.</p>` : ""}
  `);

  const macros = panel("macros", `
    <h2>Macros e automações</h2><p>Comandos gerenciados usam ações autorizadas do Jarvis. O editor nativo de Macros e o arrastar de arquivos .txt/.js continuam disponíveis no Foundry.</p>
    <div class="jarvis-console-row"><label>Biblioteca<select name="managed-macro"><option value="">Selecione</option>${options(managedMacros, row => `${row.name} · ${row.category}`, row => row.id)}</select></label>
    ${button("managed-macro-run", "Executar")}${button("managed-macro-favorite", "Favoritar")}${button("managed-macro-history", "Histórico")}</div>
    <div class="jarvis-console-row"><label>Atalho pessoal (1–10)<input name="macro-slot" type="number" min="1" max="10" value="1"></label>${button("managed-macro-hotbar", "Pôr na barra")}</div>
    ${gm ? `<h3>Gerenciar biblioteca</h3><div class="jarvis-console-grid"><label>Nome<input name="managed-name" maxlength="100" placeholder="Nome da macro"></label>
    <label>Comando<select name="managed-command">${options(managedCommands, row => row.label, row => row.key)}</select></label>
    <label>Categoria<select name="managed-category">${["geral","personagens","conteudo","habilidades","mapas","aparencias","transformacoes","efeitos","biblioteca","utilidades"].map(key => `<option value="${key}">${key}</option>`).join("")}</select></label>
    <label>Visibilidade<select name="managed-visibility"><option value="gm">Mestre</option><option value="trusted">Jogador de confiança</option><option value="all">Todos</option></select></label>
    <label class="jarvis-console-span">Descrição<input name="managed-description" maxlength="500" placeholder="Quando usar"></label>
    <label class="jarvis-console-span">Parâmetros JSON<textarea name="managed-params" rows="2" placeholder='{"actorId":"..."}'></textarea></label></div>
    <div class="jarvis-console-row">${button("managed-macro-create", "Criar")}${button("managed-macro-update", "Salvar edição")}${button("managed-macro-duplicate", "Duplicar")}${button("managed-macro-remove", "Excluir")}</div>
    <h3>Importar comandos gerenciados</h3><p>Importe JSON declarativo. Arquivos JavaScript continuam no editor nativo e nunca entram nesta biblioteca.</p>
    <input name="managed-import-file" type="file" accept=".json,application/json"><textarea name="managed-import-json" rows="3" placeholder='[{"name":"Abrir Central","command":"open-console","visibility":"all"}]'></textarea>
    <div class="jarvis-console-row">${button("managed-macro-import-preview", "Prévia da importação")}${button("managed-macro-import", "Importar após revisão")}</div>
    <h3>Atalho da Central</h3><textarea readonly rows="2" name="macro-command">${escapeHtml(MACRO_COMMAND)}</textarea>
    <div class="jarvis-console-row">${button("macro-install", "Instalar atalho da Central")}${button("macro-copy", "Copiar código")}</div>
    <h3>Scripts de Activities</h3><p>Automações com script devem ser inspecionadas e aprovadas pelo Mestre ativo.</p>
    <div class="jarvis-console-row"><label>Item do personagem ativo<select name="automation-item"><option value="">Selecione</option></select></label><label>Activity<select name="automation-activity"><option value="">Selecione</option></select></label>
    ${button("automation-inspect", "Inspecionar")}${button("automation-approve", "Aprovar")}${button("automation-revoke", "Revogar")}</div>
    <label>Conteúdo completo para revisão<textarea readonly name="automation-source" rows="7" placeholder="Selecione uma Activity e clique em Inspecionar"></textarea></label>` : ""}
  `);

  return element(`<div class="jarvis-console" data-sidebar-collapsed="${preferences.sidebarCollapsed}">
    <header class="jarvis-console-header"><strong>JARVIS <span>${escapeHtml(jarvis.version)}</span></strong><div class="jarvis-console-header-actions"><small>${escapeHtml(game.user?.name ?? "")}</small><button type="button" class="jarvis-console-toggle" data-jarvis-toggle-sidebar aria-label="Recolher ou expandir menu" aria-expanded="${!preferences.sidebarCollapsed}" title="Recolher ou expandir menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button></div></header>
    <div class="jarvis-console-layout"><nav class="jarvis-console-nav" role="tablist" aria-orientation="vertical" aria-label="Ferramentas do Jarvis">${nav}</nav>
    <main class="jarvis-console-main"><div class="jarvis-console-actor"><label>Personagem ativo <select name="jarvis-actor"><option value="">Selecione</option>${actorOptions}</select></label><span data-jarvis-actor-count>${actors.length} ficha(s) acessível(is)</span></div>
    <div class="jarvis-console-search"><label>Busca global<input data-jarvis-global-search type="search" maxlength="100" autocomplete="off" aria-controls="jarvis-global-results" aria-autocomplete="list" placeholder="Ferramentas, personagens e compêndios"></label><div id="jarvis-global-results" class="jarvis-console-search-results" data-jarvis-search-results role="listbox" aria-live="polite"></div></div>
    <div class="jarvis-console-body">${overview}${characters}${content}${maps}${appearances}${compendiums}${macros}${players}${diagnostics}</div><div class="jarvis-console-status" data-jarvis-status role="status" aria-live="polite"></div></main></div>
    <aside class="jarvis-console-result" hidden><div class="jarvis-console-result-head"><strong class="jarvis-console-result-title"></strong>${button("clear-output", "Limpar")}</div><pre class="jarvis-console-result-content"></pre></aside>
  </div>`);
}

function roleLabel(user) {
  if (user.isGM) return "Mestre";
  if (Number(user.role) >= (globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2)) return "Jogador de confiança";
  return "Jogador";
}

async function fileOrText(root, fileName, textName, maxBytes = 2 * 1024 * 1024) {
  const file = field(root, fileName)?.files?.[0];
  if (file) {
    if (file.size > maxBytes) throw new Error(`Arquivo acima de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    return file.text();
  }
  const text = fieldValue(root, textName);
  if (!text) throw new Error("Selecione um arquivo JSON ou cole seu conteúdo.");
  if (text.length > maxBytes) throw new Error("JSON colado excede o limite de tamanho.");
  return text;
}

async function confirmAction(title, content) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title }, content: `<p>${escapeHtml(content)}</p>`
  });
}

function contentSpec(root, kind) {
  const actor = kind === "actor";
  const mode = fieldValue(root, actor ? "actor-mode" : "item-mode") || "simple";
  const name = fieldValue(root, actor ? "actor-name" : "item-name");
  const type = fieldValue(root, actor ? "actor-type" : "item-type") || (actor ? "character" : "feat");
  if (mode === "advanced") {
    const source = fieldValue(root, actor ? "actor-advanced" : "item-advanced");
    if (!source) throw new Error("Informe o JSON avançado com a chave data, ou escolha o modo simples.");
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.data) {
      throw new Error("O JSON avançado precisa de um objeto data.");
    }
    if (!String(name || parsed.data.name || "").trim()) throw new JarvisInputError("Informe um nome antes de criar ou visualizar o conteúdo.");
    return { ...parsed, kind, mode, name: name || parsed.data.name, type,
      destinationActorId: !actor && fieldValue(root, "item-destination") === "actor"
        ? selectedActor(root, { manage: true }).id : null };
  }
  if (!name) throw new JarvisInputError("Informe um nome antes de criar ou visualizar o conteúdo.");
  if (actor) {
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key =>
      [key, fieldValue(root, `actor-${key}`) || "10"]));
    return { kind, mode, name, type, hp: fieldValue(root, "actor-hp"),
      ac: fieldValue(root, "actor-ac"), biography: fieldValue(root, "actor-biography"), abilities };
  }
  return { kind, mode, name, type, description: fieldValue(root, "item-description"),
    usesMax: fieldValue(root, "item-uses"),
    destinationActorId: fieldValue(root, "item-destination") === "actor"
      ? selectedActor(root, { manage: true }).id : null };
}

function sceneEditInput(root, jarvis) {
  const scene = canvas?.scene;
  if (!scene) throw new Error("Abra uma cena antes de editar parede, luz ou som.");
  const selectedMode = fieldValue(root, "scene-edit-mode");
  const presetKey = fieldValue(root, "scene-edit-preset");
  const preset = jarvis.scenes.editor.presets().find(row => row.key === presetKey);
  const type = preset?.type ?? fieldValue(root, "scene-edit-type");
  const mode = type === "SceneEnvironment" ? "update" : selectedMode;
  const text = fieldValue(root, "scene-edit-json");
  let data = {};
  if (mode !== "delete") {
    if (text) {
      data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Dados da cena devem ser um objeto JSON.");
    }
    data = { ...(preset?.data ?? {}), ...data };
  }
  return { scene, input: { type, mode, documentId: fieldValue(root, "scene-edit-id") || null, data } };
}

function selectedManagedMacro(root) {
  const entry = api().macros.list().find(row => row.id === fieldValue(root, "managed-macro"));
  if (!entry) throw new Error("Selecione uma macro autorizada da biblioteca.");
  return entry;
}

function managedMacroSpec(root) {
  const source = fieldValue(root, "managed-params");
  return { name: fieldValue(root, "managed-name"), command: fieldValue(root, "managed-command"),
    category: fieldValue(root, "managed-category"), visibility: fieldValue(root, "managed-visibility"),
    description: fieldValue(root, "managed-description"), params: source ? JSON.parse(source) : {} };
}

function selectedAutomation(root) {
  const actor = selectedActor(root);
  const item = actor.items?.get?.(fieldValue(root, "automation-item"));
  if (!item) throw new Error("Selecione um Item do personagem ativo.");
  const activityId = fieldValue(root, "automation-activity");
  const activity = item.system?.activities?.get?.(activityId)
    ?? activitiesOf(item).find(row => row.id === activityId || row._id === activityId)
    ?? item.system?.activities?.[activityId];
  if (!activity) throw new Error("Activity não encontrada neste Item. Confira o ID na ficha nativa.");
  return { actor, item, activity };
}

function templateSpec(root) {
  const name = fieldValue(root, "map-name");
  const columns = Number(fieldValue(root, "map-columns"));
  const rows = Number(fieldValue(root, "map-rows"));
  if (!name) throw new Error("Informe o nome da cena.");
  if (![columns, rows].every(value => Number.isInteger(value) && value >= 5 && value <= 200)) {
    throw new Error("Colunas e linhas devem ser números inteiros entre 5 e 200.");
  }
  return { schemaVersion: "2.0", template: fieldValue(root, "map-template"), skin: fieldValue(root, "map-skin"),
    scene: { name, columns, rows } };
}

export async function executeJarvisConsoleAction(action, root, state = {}) {
  const jarvis = api();
  if (action === "clear-output") return clearOutput(root);
  if (action === "pack-focus") return selectTab(root, "compendiums");

  if (action === "actor-open") {
    const actor = selectedActor(root);
    actor.sheet?.render(true);
    return setOutput(root, "Personagem", `Ficha aberta: ${actor.name}.`);
  }
  if (action === "actor-create") {
    requireGM();
    if (jarvis.content?.create) {
      const spec = contentSpec(root, "actor");
      const preview = jarvis.content.preview(spec);
      if (!await confirmAction("Criar personagem", `Criar ${preview.name} (${preview.type})? ${JSON.stringify(preview.actor ?? {})}`)) return;
      const { document: actor } = await jarvis.content.create(spec);
      refreshActorOptions(root, actor.id);
      return setOutput(root, "Personagem criado", { name: actor.name, type: actor.type, preview });
    }
    const name = fieldValue(root, "actor-name");
    const type = fieldValue(root, "actor-type");
    if (!name || !["character", "npc"].includes(type)) throw new Error("Informe um nome e tipo válidos.");
    const actor = await Actor.create({ name, type });
    if (!actor) throw new Error("O Foundry não criou o Actor.");
    actor.sheet?.render(true);
    refreshActorOptions(root, actor.id);
    return setOutput(root, "Personagem criado", `${actor.name} · ${actor.type}.`);
  }
  if (action === "actor-wizard-preview") {
    requireGM();
    return setOutput(root, "Prévia do personagem", jarvis.content.preview(contentSpec(root, "actor")));
  }
  if (action === "actor-import") {
    requireGM();
    const json = await fileOrText(root, "actor-json-file", "actor-json");
    const actor = await jarvis.importer.importFromJson(json, { renderSheet: true });
    refreshActorOptions(root, actor.id);
    return setOutput(root, "Importação concluída", `${actor.name} foi criado.`);
  }
  if (action === "actor-compare") {
    requireGM();
    const actor = selectedActor(root);
    const payload = JSON.parse(await fileOrText(root, "actor-json-file", "actor-json"));
    return setOutput(root, "Comparação com JSON", jarvis.diagnostics.compareActor(payload, actor));
  }
  if (action === "actor-provenance") {
    const actor = selectedActor(root);
    return setOutput(root, `Origem de ${actor.name}`,
      jarvis.provenance.formatReport(jarvis.provenance.analyzeActor(actor)));
  }
  if (action === "actor-rules") {
    const actor = selectedActor(root);
    return setOutput(root, `Regras de ${actor.name}`,
      jarvis.rules.formatReport(jarvis.rules.analyzeActor(actor)));
  }
  if (action === "actor-jack") {
    const actor = selectedActor(root);
    return setOutput(root, `Estado de Jack · ${actor.name}`, jarvis.jack.getSoulStatus(actor));
  }
  if (action === "actor-progression") {
    requireGM();
    const actor = selectedActor(root);
    const count = await jarvis.progression.applyActor(actor, { notify: true });
    return setOutput(root, "Progressão", `${count} Item(s) de progressão criado(s) em ${actor.name}.`);
  }
  if (action === "actor-rules-set") {
    requireGM();
    const actor = selectedActor(root, { manage: true });
    const target = fieldValue(root, "actor-rules-target");
    if (!["2014", "2024"].includes(target)) throw new Error("Escolha o perfil de regras 2014 ou 2024.");
    if (!await confirmAction("Perfil de regras", `Registrar D&D ${target} como perfil de ${actor.name}?`)) return;
    return setOutput(root, "Perfil de regras", jarvis.rules.formatReport(await jarvis.rules.setActorProfile(actor, target)));
  }
  if (action === "actor-provenance-stamp") {
    requireGM();
    const actor = selectedActor(root, { manage: true });
    if (!await confirmAction("Origem dos Items", `Registrar a classificação de origem dos Items de ${actor.name}?`)) return;
    return setOutput(root, "Origem registrada", jarvis.provenance.formatReport(await jarvis.provenance.stampActor(actor)));
  }
  if (action === "actor-jack-sync") {
    requireGM();
    const actor = selectedActor(root, { manage: true });
    return setOutput(root, `Almas de Jack · ${actor.name}`, await jarvis.jack.syncActor(actor, { notify: true }));
  }

  if (action === "item-template-use") {
    requireGM();
    const template = jarvis.content.templates().find(row => row.key === fieldValue(root, "item-template"));
    if (!template || template.spec.kind !== "item") throw new Error("Modelo de Item indisponível.");
    const typeField = field(root, "item-type");
    if (typeField) typeField.value = template.spec.type;
    const modeField = field(root, "item-mode");
    if (modeField) modeField.value = template.spec.mode;
    return setOutput(root, "Modelo selecionado", `${template.label}: complete o nome e os detalhes antes de criar.`);
  }
  if (action === "item-create") {
    requireGM();
    if (jarvis.content?.create) {
      const spec = contentSpec(root, "item");
      const preview = jarvis.content.preview(spec);
      if (!await confirmAction("Criar conteúdo", `Criar ${preview.name} (${preview.type}) em ${typeof preview.destination === "string" ? "biblioteca do mundo" : "personagem selecionado"}? ${preview.effects} efeito(s), ${preview.activities} Activity(ies).`)) return;
      const { document: item } = await jarvis.content.create(spec);
      return setOutput(root, "Conteúdo criado", { name: item.name, type: item.type, preview });
    }
    const name = fieldValue(root, "item-name");
    const type = fieldValue(root, "item-type");
    if (!name || !itemTypes().includes(type)) throw new Error("Informe nome e tipo de Item válidos.");
    const description = fieldValue(root, "item-description");
    const itemData = { name, type, flags: { [MODULE_ID]: { provenanceInput: {
      kind: "homebrew", confidence: 1, reason: "Criado pelo Estúdio de Conteúdo Jarvis."
    } } } };
    if (description) itemData.system = { description: { value: escapeHtml(description).replace(/\r?\n/g, "<br>") } };
    const destination = fieldValue(root, "item-destination");
    let item;
    if (destination === "actor") {
      const actor = selectedActor(root, { manage: true });
      [item] = await actor.createEmbeddedDocuments("Item", [itemData]);
    } else {
      item = await Item.create(itemData);
    }
    if (!item) throw new Error("O Foundry não criou o Item.");
    item.sheet?.render(true);
    return setOutput(root, "Homebrew criado", `${item.name} (${item.type}). Configure e valide a mecânica na ficha nativa.`);
  }
  if (action === "item-wizard-preview") {
    requireGM();
    return setOutput(root, "Prévia de Item ou classe", jarvis.content.preview(contentSpec(root, "item")));
  }
  if (action === "items-import") {
    requireGM();
    const actor = selectedActor(root, { manage: true });
    const parsed = JSON.parse(await fileOrText(root, "items-json-file", "items-json"));
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(items) || !items.length || items.length > 100 || items.some(item => !item || typeof item !== "object")) {
      throw new Error("Informe uma lista de 1 a 100 Items V9 válidos.");
    }
    if (!await confirmAction("Importar Items", `Adicionar ${items.length} Item(s) à ficha de ${actor.name}?`)) return;
    const created = await jarvis.importer.importItems(actor, items, { sourceLabel: "Central Jarvis" });
    return setOutput(root, "Items importados", `${created.length} Item(s) criados em ${actor.name}.`);
  }

  if (action === "map-studio") { requireGM(); return jarvis.scenes.openStudio(); }
  if (action === "map-uvtt") { requireGM(); return jarvis.scenes.openImporter(); }
  if (action === "map-audit") {
    requireGM();
    return setOutput(root, "Auditoria da cena ativa", jarvis.scenes.audit(canvas?.scene));
  }
  if (action === "scene-edit-load") {
    requireGM();
    const scene = canvas?.scene;
    if (!scene) throw new Error("Abra uma cena para carregar os dados atuais.");
    const type = fieldValue(root, "scene-edit-type");
    let data;
    if (type === "SceneEnvironment") {
      const source = scene.toObject?.() ?? scene;
      data = { environment: { darknessLevel: source.environment?.darknessLevel },
        backgroundColor: source.backgroundColor };
    } else {
      const name = { Wall: "walls", AmbientLight: "lights", AmbientSound: "sounds" }[type];
      const id = fieldValue(root, "scene-edit-id") || fieldValue(root, "scene-edit-existing");
      const document = values(scene[name]).find(row => row.id === id);
      if (!document) throw new Error("Selecione um documento da cena para carregar.");
      const source = document.toObject();
      const keys = { Wall: ["c", "door", "ds", "move", "sight", "light", "sound", "dir", "threshold"],
        AmbientLight: ["x", "y", "config", "hidden"],
        AmbientSound: ["x", "y", "path", "radius", "volume", "repeat", "easing", "hidden"] }[type];
      data = Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
    }
    const textarea = field(root, "scene-edit-json");
    if (textarea) textarea.value = JSON.stringify(data, null, 2);
    const mode = field(root, "scene-edit-mode");
    if (mode) mode.value = "update";
    return setOutput(root, "Dados atuais carregados", data);
  }
  if (["scene-edit-preview", "scene-edit-apply", "scene-edit-history", "scene-edit-undo"].includes(action)) {
    requireGM();
    const editor = jarvis.scenes.editor;
    if (action === "scene-edit-history") return setOutput(root, "Histórico da cena atual", editor.history(canvas?.scene));
    if (action === "scene-edit-undo") {
      const scene = canvas?.scene;
      const transactionId = fieldValue(root, "scene-undo-id");
      const entry = editor.history(scene).find(row => row.id === transactionId);
      if (!entry || entry.status !== "committed") throw new Error("Selecione no histórico uma alteração disponível para desfazer.");
      if (!await confirmAction("Desfazer edição", `Desfazer ${entry.mode} de ${entry.type} na cena '${scene.name}'? Mudanças posteriores no mesmo documento bloquearão a operação.`)) return;
      const result = await editor.undo(scene, transactionId, { confirmed: true });
      refreshSceneDocumentOptions(root);
      return setOutput(root, "Alteração desfeita", result);
    }
    const { scene, input } = sceneEditInput(root, jarvis);
    const preview = editor.preview(scene, input);
    if (action === "scene-edit-preview") {
      state.sceneEditPreview = { sceneId: scene.id, signature: JSON.stringify(input), before: preview.before };
      return setOutput(root, "Prévia de edição da cena", preview);
    }
    if (state.sceneEditPreview?.sceneId !== scene.id || state.sceneEditPreview.signature !== JSON.stringify(input)) {
      state.sceneEditPreview = { sceneId: scene.id, signature: JSON.stringify(input), before: preview.before };
      return setOutput(root, "Revise a prévia antes de salvar", preview);
    }
    if (!await confirmAction("Salvar edição da cena", `${input.mode} ${input.type} em '${scene.name}'? ${preview.warnings.length} aviso(s) geométrico(s).`)) return;
    const report = await editor.apply(scene, input,
      { confirmed: true, expectedBefore: state.sceneEditPreview.before });
    state.sceneEditPreview = null;
    refreshSceneDocumentOptions(root);
    return setOutput(root, "Cena atualizada", report);
  }
  if (action === "map-template-preview") {
    requireGM();
    return setOutput(root, "Prévia do template", await jarvis.scenes.framework.previewSpec(templateSpec(root)));
  }
  if (action === "map-template-create") {
    requireGM();
    const spec = templateSpec(root);
    const preview = await jarvis.scenes.framework.previewSpec(spec);
    if (!await confirmAction("Criar cena", `Criar '${spec.scene.name}' com o template ${spec.template}?`)) return;
    const result = await jarvis.scenes.framework.buildSpec(spec, { view: true });
    return setOutput(root, "Cena criada", sceneBuildSummary(result, preview));
  }
  if (action === "map-preset-preview" || action === "map-preset-create") {
    requireGM();
    const key = fieldValue(root, "map-preset");
    const preview = await jarvis.scenes.framework.previewPreset(key);
    if (action === "map-preset-preview") return setOutput(root, "Prévia do preset", preview);
    if (!await confirmAction("Criar preset", `Criar a cena do preset ${key}?`)) return;
    const result = await jarvis.scenes.framework.buildPreset(key, { view: true });
    return setOutput(root, "Preset criado", sceneBuildSummary(result, preview));
  }
  if (action === "map-skin-apply") {
    requireGM();
    const scene = canvas?.scene;
    if (!scene) throw new Error("Abra uma cena antes de aplicar a skin.");
    const key = fieldValue(root, "map-skin");
    if (!await confirmAction("Aplicar skin", `Aplicar ${key} à cena '${scene.name}'?`)) return;
    return setOutput(root, "Skin aplicada", await jarvis.scenes.framework.applySkin(scene, key, { replaceBackground: false }));
  }
  if (action === "map-lighting-apply") {
    requireGM();
    const scene = canvas?.scene;
    if (!scene) throw new Error("Abra uma cena antes de alterar a luz.");
    const key = fieldValue(root, "map-lighting");
    const preset = jarvis.scenes.applyLightingPreset({ scene: {} }, key).scene;
    if (!await confirmAction("Aplicar ambiente", `Definir a escuridão e a cor de fundo de '${scene.name}' como ${key}?`)) return;
    const input = { type: "SceneEnvironment", mode: "update",
      data: { environment: { darknessLevel: preset.environment.darknessLevel },
        backgroundColor: preset.backgroundColor } };
    const preview = jarvis.scenes.editor.preview(scene, input);
    const result = await jarvis.scenes.editor.apply(scene, input,
      { confirmed: true, expectedBefore: preview.before });
    return setOutput(root, "Ambiente aplicado", { scene: scene.name, preset: key, transactionId: result.transactionId,
      note: "Luzes existentes não foram modificadas. Use o histórico desta cena para desfazer." });
  }
  if (action === "scene-package-preview" || action === "scene-package-create") {
    requireGM();
    const source = await fileOrText(root, "scene-json-file", "scene-json", 40 * 1024 * 1024);
    const payload = JSON.parse(source);
    const preview = await jarvis.scenes.package.preview(payload);
    if (action === "scene-package-preview") return setOutput(root, "Prévia do Scene Package", preview);
    if (!await confirmAction("Criar Scene Package", `Criar a cena '${payload.scene?.name ?? "sem nome"}'?`)) return;
    const result = await jarvis.scenes.package.build(payload, { view: true });
    return setOutput(root, "Scene Package criado", sceneBuildSummary(result, preview));
  }
  if (["scene-package-inspect", "scene-package-repair", "scene-package-action"].includes(action)) {
    requireGM();
    const scene = canvas?.scene;
    if (!scene) throw new Error("Abra uma cena antes de usar as opções de manutenção.");
    if (action === "scene-package-inspect") {
      return setOutput(root, "Scene Package da cena ativa", jarvis.scenes.package.inspect(scene));
    }
    if (action === "scene-package-repair") {
      if (!await confirmAction("Reparar regiões", `Recriar as regiões do Scene Package em '${scene.name}'?`)) return;
      const result = await jarvis.scenes.package.repairRegions(scene);
      return setOutput(root, "Regiões reparadas", result.regionSummary);
    }
    const key = fieldValue(root, "scene-action-key");
    if (!key) throw new Error("Informe a chave de uma ação manual do Scene Package.");
    if (!await confirmAction("Ação manual", `Executar a ação '${key}' em '${scene.name}'?`)) return;
    return setOutput(root, "Ação executada", await jarvis.scenes.package.runAction(scene, key));
  }
  if (["scene-migration-preview", "scene-migration-run", "scene-assets-review"].includes(action)) {
    requireGM();
    if (action === "scene-assets-review") {
      return setOutput(root, "Arquivos de mapas para revisão", jarvis.scenes.package.inspectAssetLedger()
        .filter(entry => entry.needsReview));
    }
    const preview = jarvis.scenes.package.previewLegacyManifests();
    if (action === "scene-migration-preview") return setOutput(root, "Prévia da migração", preview);
    if (!preview.count) return setOutput(root, "Migração de mapas", "Nenhuma cena exige migração.");
    if (!await confirmAction("Migrar mapas legados",
      `Migrar ${preview.count} cena(s) após criar backup privado? Revise primeiro a prévia exibida nesta Central.`)) return;
    return setOutput(root, "Relatório da migração", await jarvis.scenes.package.migrateLegacyManifests({ confirmed: true }));
  }

  if (["appearance-list", "appearance-available", "appearance-save", "appearance-apply", "appearance-revert",
    "appearance-remove", "appearance-remove-profile", "appearance-pack-import", "form-save", "form-remove-profile",
    "form-apply", "form-revert", "form-picker"].includes(action)) {
    const mutate = !["appearance-list", "appearance-available"].includes(action);
    const actor = selectedActor(root, { manage: mutate });
    if (action === "appearance-list") return setOutput(root, "Perfis visuais e formas", {
      visage: jarvis.appearance.getProfiles(actor), metamorph: jarvis.transformation.getProfiles(actor)
    });
    if (action === "appearance-available") return setOutput(root, "Skins disponíveis", await jarvis.appearance.getAvailable(selectedToken(actor)));
    if (action === "appearance-save") {
      assertJarvisAccess(jarvis.appearance.status().active, "Ative o Visage para registrar skins.");
      return setOutput(root, "Perfil visual salvo", await jarvis.appearance.setProfile(actor,
        fieldValue(root, "appearance-key"), fieldValue(root, "appearance-id"), { mode: fieldValue(root, "appearance-mode") }));
    }
    if (action === "appearance-remove-profile") {
      const key = fieldValue(root, "appearance-key");
      if (!key) throw new Error("Informe a chave do perfil visual.");
      if (!await confirmAction("Remover perfil", `Remover o perfil visual '${key}' de ${actor.name}?`)) return;
      return setOutput(root, "Perfil visual removido", await jarvis.appearance.removeProfile(actor, key));
    }
    if (action === "appearance-apply") {
      assertJarvisAccess(jarvis.appearance.status().active, "Ative o Visage para aplicar skins.");
      await jarvis.appearance.apply(selectedToken(actor), fieldValue(root, "appearance-key"));
      return setOutput(root, "Skin aplicada", `Visual atualizado em ${actor.name}.`);
    }
    if (action === "appearance-remove") {
      assertJarvisAccess(jarvis.appearance.status().active, "Ative o Visage para remover skins.");
      const key = fieldValue(root, "appearance-key");
      if (!key) throw new Error("Informe a chave da skin.");
      await jarvis.appearance.remove(selectedToken(actor), key);
      return setOutput(root, "Skin removida", `${key} removida do Token de ${actor.name}.`);
    }
    if (action === "appearance-revert") {
      assertJarvisAccess(jarvis.appearance.status().active, "Ative o Visage para reverter skins.");
      await jarvis.appearance.revert(selectedToken(actor));
      return setOutput(root, "Visual revertido", actor.name);
    }
    if (action === "form-save") {
      const target = game.actors.get(fieldValue(root, "form-target"));
      assertJarvisAccess(target && getJarvisAccess(game.user, target).canViewActor, "Selecione uma forma acessível.");
      return setOutput(root, "Forma registrada", await jarvis.transformation.setProfile(actor,
        fieldValue(root, "form-key"), target, { hpMode: fieldValue(root, "form-hp") }));
    }
    if (action === "form-remove-profile") {
      const key = fieldValue(root, "form-key");
      if (!key) throw new Error("Informe a chave da forma.");
      if (!await confirmAction("Remover forma", `Remover a forma registrada '${key}' de ${actor.name}?`)) return;
      return setOutput(root, "Forma removida", await jarvis.transformation.removeProfile(actor, key));
    }
    if (action === "appearance-pack-import") {
      assertJarvisAccess(jarvis.appearance.status().active, "Ative o Visage para importar pacotes de aparências.");
      const parsed = JSON.parse(await fileOrText(root, "appearance-pack-file", "appearance-pack-json"));
      const entries = Array.isArray(parsed) ? parsed
        : parsed?.profiles ?? parsed?.visages ?? parsed?.layers ?? parsed?.appearances ?? [parsed];
      if (!Array.isArray(entries) || !entries.length || entries.length > 100) {
        throw new Error("O pacote deve conter de 1 a 100 aparências.");
      }
      for (const entry of entries) jarvis.appearance.buildLocal(entry);
      if (!await confirmAction("Importar aparências", `Instalar ${entries.length} aparência(s) Visage em ${actor.name}? Perfis com o mesmo nome serão substituídos.`)) return;
      const report = await jarvis.appearance.importVisageExport(actor, parsed);
      return setOutput(root, "Pacote de aparências instalado", report);
    }
    if (action === "form-apply") {
      assertJarvisAccess(jarvis.transformation.status().active, "Ative o Metamorph para transformar Tokens.");
      const token = await selectedTransformationToken(actor, state);
      state.transformationTokenId = token.id;
      await jarvis.transformation.morph(token, fieldValue(root, "form-key"));
      return setOutput(root, "Forma aplicada", actor.name);
    }
    if (action === "form-revert") {
      assertJarvisAccess(jarvis.transformation.status().active, "Ative o Metamorph para reverter Tokens.");
      const token = await selectedTransformationToken(actor, state);
      await jarvis.transformation.revert(token);
      state.transformationTokenId = null;
      return setOutput(root, "Forma revertida", actor.name);
    }
    assertJarvisAccess(jarvis.transformation.status().active, "Ative o Metamorph para abrir o seletor.");
    return jarvis.transformation.openPicker(await selectedTransformationToken(actor, state));
  }

  if (action === "player-overview") {
    const actor = selectedActor(root);
    const source = actor.system ?? {};
    return setOutput(root, `Recursos e Items · ${actor.name}`, {
      hp: source.attributes?.hp ?? null, resources: source.resources ?? null,
      items: values(actor.items).slice(0, 100).map(item => ({ id: item.id, name: item.name,
        type: item.type, uses: item.system?.uses ?? null })),
      note: values(actor.items).length > 100 ? "Lista limitada aos primeiros 100 Items." : undefined
    });
  }
  if (action === "player-item-open") {
    const actor = selectedActor(root);
    const item = actor.items?.get?.(fieldValue(root, "player-item"));
    if (!item) throw new JarvisInputError("Selecione um Item do personagem ativo.");
    item.sheet?.render(true);
    return setOutput(root, "Item aberto", `${item.name} · ${item.type}`);
  }

  if (action === "pack-search") {
    const pack = visiblePacks().find(candidate => candidate.collection === fieldValue(root, "pack"));
    if (!pack) throw new Error("Selecione um compêndio visível.");
    const query = fieldValue(root, "pack-query").toLocaleLowerCase("pt-BR");
    const index = await pack.getIndex({ fields: ["type", "img"] });
    state.packRows = values(index).filter(entry => !query ||
      `${entry.name ?? ""} ${entry.type ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 100)
      .map(entry => ({ pack, id: entry._id ?? entry.id, name: entry.name, type: entry.type ?? pack.documentName }));
    const host = root.querySelector("[data-jarvis-pack-results]");
    host.innerHTML = state.packRows.length ? `<p>${state.packRows.length} resultado(s), limite de 100.</p><ol>${state.packRows.map((row, index) =>
      `<li><span>${escapeHtml(row.name)} <small>${escapeHtml(row.type)}</small></span><div><button type="button" data-jarvis-index="${index}" data-jarvis-action="pack-open">Abrir</button>${getJarvisAccess(game.user).gm || getJarvisAccess(game.user).trusted ? `<button type="button" data-jarvis-index="${index}" data-jarvis-action="pack-import">Adicionar</button>` : ""}</div></li>`).join("")}</ol>`
      : "<p>Nenhum resultado encontrado.</p>";
    return setOutput(root, "Compêndio", `${pack.title ?? pack.collection}: ${state.packRows.length} resultado(s).`);
  }
  if (action === "pack-open" || action === "pack-import") {
    const index = Number(state.actionIndex);
    const row = state.packRows?.[index];
    if (!row || !visiblePacks().includes(row.pack)) throw new Error("Resultado de compêndio não está mais disponível.");
    const document = await row.pack.getDocument(row.id);
    if (!document) throw new Error("Documento não encontrado no compêndio.");
    if (action === "pack-open") {
      document.sheet?.render(true);
      return setOutput(root, "Compêndio", `Aberto: ${document.name}.`);
    }
    const actor = selectedActor(root, { required: false });
    const access = getJarvisAccess(game.user, actor);
    assertJarvisAccess(access.gm || access.canManageActor, "A importação exige Mestre ou jogador de confiança proprietário.");
    if (!access.gm) {
      assertJarvisAccess(row.pack.metadata?.packageName === "dnd5e" && document.documentName === "Item",
        "Jogadores de confiança só podem importar Items dos compêndios oficiais D&D5e.");
    }
    const data = document.toObject();
    delete data._id;
    delete data.folder;
    let created;
    if (document.documentName === "Item") {
      if (actor) [created] = await actor.createEmbeddedDocuments("Item", [data]);
      else { requireGM(); created = await Item.create(data); }
    } else {
      requireGM();
      created = await Actor.create(data);
    }
    if (!created) throw new Error("O Foundry não criou o documento importado.");
    created.sheet?.render(true);
    const destination = document.documentName === "Item" && actor ? `a ${actor.name}` : "ao mundo";
    return setOutput(root, "Compêndio importado", `${created.name} foi adicionado ${destination}.`);
  }

  if (["diagnostics-capture-start", "diagnostics-capture-stop", "diagnostics-export"].includes(action)) {
    requireGM();
    const capture = jarvis.diagnostics?.capture;
    if (!capture) throw new Error("A captura de erros não está disponível nesta versão do Jarvis.");
    if (action === "diagnostics-capture-start") {
      capture.start();
      refreshCaptureStatus(root, capture);
      return setOutput(root, "Captura iniciada", "Teste as ações desejadas e depois exporte o relatório. Nenhum documento do mundo é alterado pela captura.");
    }
    capture.stop();
    refreshCaptureStatus(root, capture);
    if (action === "diagnostics-capture-stop") {
      return setOutput(root, "Captura encerrada", `${capture.events().length} evento(s) registrado(s). A ausência de erros não comprova ações que não foram testadas.`);
    }
    const report = await jarvis.diagnostics.run({ checkUpdates: false });
    const filename = jarvis.diagnostics.download(report);
    return setOutput(root, "Relatório exportado", `${filename} · ${capture.events().length} evento(s). A ausência de erros não comprova ações que não foram testadas.`);
  }
  if (action === "diagnostics-run") {
    requireGM();
    const report = await jarvis.diagnostics.run();
    refreshCaptureStatus(root);
    return setOutput(root, "Diagnóstico Jarvis", jarvis.diagnostics.format(report));
  }
  if (action === "framework-test") {
    requireGM();
    return setOutput(root, "Templates, skins e presets", await jarvis.scenes.framework.selfTest());
  }
  if (action === "modules-list") {
    requireGM();
    return setOutput(root, "Módulos ativos", values(game.modules).filter(module => module.active)
      .map(module => ({ id: module.id, title: module.title, version: module.version })));
  }
  if (["managed-macro-run", "managed-macro-favorite", "managed-macro-history", "managed-macro-hotbar",
    "managed-macro-create", "managed-macro-update", "managed-macro-duplicate", "managed-macro-remove",
    "managed-macro-import-preview", "managed-macro-import"].includes(action)) {
    const library = jarvis.macros;
    if (action === "managed-macro-history") return setOutput(root, "Histórico pessoal de macros", library.history());
    if (action === "managed-macro-import-preview" || action === "managed-macro-import") {
      requireGM();
      const source = await fileOrText(root, "managed-import-file", "managed-import-json", 256 * 1024);
      const preview = library.previewImport(source);
      if (action === "managed-macro-import-preview") {
        state.macroImportPreview = source;
        return setOutput(root, "Prévia da biblioteca", preview);
      }
      if (state.macroImportPreview !== source) {
        state.macroImportPreview = source;
        return setOutput(root, "Revise a importação antes de confirmar", preview);
      }
      if (!await confirmAction("Importar macros", `Adicionar ${preview.count} comando(s) autorizado(s) à biblioteca?`)) return;
      const result = await library.import(source);
      state.macroImportPreview = null;
      refreshManagedMacroOptions(root);
      refreshDashboard(root, state);
      return setOutput(root, "Macros importadas", result);
    }
    if (action === "managed-macro-create") {
      requireGM();
      const spec = managedMacroSpec(root);
      if (!await confirmAction("Criar macro", `Criar '${spec.name}' com o comando ${spec.command}?`)) return;
      const entry = await library.create(spec);
      refreshManagedMacroOptions(root, entry.id);
      refreshDashboard(root, state);
      return setOutput(root, "Macro criada", entry);
    }
    const entry = selectedManagedMacro(root);
    if (action === "managed-macro-run") return setOutput(root, `Macro · ${entry.name}`, await library.execute(entry.id));
    if (action === "managed-macro-favorite") {
      const favorites = await library.toggleFavorite(entry.id);
      refreshDashboard(root, state);
      return setOutput(root, "Macros favoritas", favorites);
    }
    if (action === "managed-macro-hotbar") {
      const slot = Number(fieldValue(root, "macro-slot"));
      if (game.user.hotbar?.[slot] && !await confirmAction("Substituir atalho",
        `O atalho ${slot} já está ocupado. Substituí-lo por '${entry.name}'?`)) return;
      return setOutput(root, "Atalho instalado", await library.installHotbar(entry.id, slot));
    }
    requireGM();
    if (action === "managed-macro-update") {
      const spec = managedMacroSpec(root);
      if (!await confirmAction("Editar macro", `Salvar mudanças em '${entry.name}'?`)) return;
      const updated = await library.update(entry.id, spec);
      refreshManagedMacroOptions(root, updated.id);
      refreshDashboard(root, state);
      return setOutput(root, "Macro atualizada", updated);
    }
    if (action === "managed-macro-duplicate") {
      const copied = await library.duplicate(entry.id);
      refreshManagedMacroOptions(root, copied.id);
      refreshDashboard(root, state);
      return setOutput(root, "Macro duplicada", copied);
    }
    if (!await confirmAction("Excluir macro", `Excluir '${entry.name}' da biblioteca? Atalhos já instalados deixarão de funcionar.`)) return;
    const removed = await library.remove(entry.id);
    refreshManagedMacroOptions(root);
    refreshDashboard(root, state);
    return setOutput(root, "Macro removida", removed);
  }
  if (["automation-inspect", "automation-approve", "automation-revoke"].includes(action)) {
    requireGM();
    const { item, activity } = selectedAutomation(root);
    const inspection = jarvis.automation.inspect(activity);
    const automation = activity.flags?.[MODULE_ID]?.automation ?? null;
    const embeddedEffects = values(item.effects).map(effect => effect.toObject?.() ?? effect);
    const fullSource = JSON.stringify({ automation, embeddedEffects }, null, 2);
    const sourceField = field(root, "automation-source");
    if (action === "automation-inspect") {
      if (sourceField) sourceField.value = fullSource;
      state.automationPreview = { uuid: activity.uuid, source: fullSource };
      return setOutput(root, `Automação · ${item.name}`, { inspection, automation,
        embeddedEffects: embeddedEffects.map(effect => effect.name) });
    }
    if (action === "automation-approve") {
      if (state.automationPreview?.uuid !== activity.uuid
        || state.automationPreview?.source !== fullSource) {
        if (sourceField) sourceField.value = fullSource;
        state.automationPreview = { uuid: activity.uuid, source: fullSource };
        return setOutput(root, "Revise a automação antes de aprovar", { inspection, automation,
          embeddedEffects: embeddedEffects.map(effect => effect.name) });
      }
      if (!await confirmAction("Aprovar automação", `Aprovar script e efeitos de '${item.name}' / '${activity.name}'? Qualquer mudança posterior revoga esta aprovação.`)) return;
      state.automationPreview = null;
      return setOutput(root, "Automação aprovada", await jarvis.automation.approve(activity));
    }
    if (!await confirmAction("Revogar automação", `Revogar a aprovação de '${item.name}' / '${activity.name}'?`)) return;
    state.automationPreview = null;
    return setOutput(root, "Aprovação revogada", await jarvis.automation.revoke(activity));
  }
  if (action === "macro-copy") {
    requireGM();
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Área de transferência indisponível; copie o código exibido.");
    await navigator.clipboard.writeText(MACRO_COMMAND);
    return setOutput(root, "Macro", "Código copiado.");
  }
  if (action === "macro-install") {
    requireGM();
    const slot = Number(fieldValue(root, "macro-slot"));
    if (!Number.isInteger(slot) || slot < 1 || slot > 10) throw new Error("Escolha um atalho de 1 a 10.");
    if (game.user.hotbar?.[slot] && !await confirmAction("Substituir atalho",
      `O atalho ${slot} já está ocupado. Substituí-lo pela Macro Jarvis?`)) return;
    let macro = values(game.macros).find(candidate => candidate.command === MACRO_COMMAND && candidate.type === "script");
    if (!macro) macro = await Macro.create({ name: "Jarvis — Central", type: "script", command: MACRO_COMMAND,
      img: "icons/svg/book.svg" });
    if (!macro) throw new Error("O Foundry não criou a Macro.");
    await game.user.assignHotbarMacro(macro, slot);
    return setOutput(root, "Macro instalada", `Jarvis — Central no atalho ${slot}.`);
  }
  throw new Error(`Ação Jarvis desconhecida: ${action}.`);
}

function selectTab(root, id, { focus = false } = {}) {
  if (!visibleJarvisTabs(getJarvisAccess(game.user)).includes(id)) return;
  for (const tab of root.querySelectorAll("[data-jarvis-tab]")) {
    const active = tab.dataset.jarvisTab === id;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.setAttribute("tabindex", active ? "0" : "-1");
    if (active && focus) tab.focus?.();
  }
  for (const panel of root.querySelectorAll("[data-jarvis-panel]")) panel.hidden = panel.dataset.jarvisPanel !== id;
  const body = root.querySelector(".jarvis-console-body");
  if (body) body.scrollTop = 0;
}

function renderSearchResults(root, rows) {
  const host = root.querySelector("[data-jarvis-search-results]");
  if (!host) return;
  host.innerHTML = rows.length ? rows.map((row, index) =>
    `<button type="button" role="option" data-jarvis-search-index="${index}"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.description ?? row.type)}</small></button>`
  ).join("") : "";
}

async function openSearchResult(root, state, index) {
  const row = state.searchRows?.[index];
  if (!row) return;
  if (row.type === "tool") {
    const tool = availableTools().find(entry => entry.id === row.action);
    if (!tool) throw new Error("Ferramenta não disponível para este usuário.");
    selectTab(root, tool.tab);
    root.querySelector(`[data-jarvis-action="${tool.id}"]`)?.focus?.();
  } else if (row.type === "actor") {
    const actor = game.actors?.get?.(row.actorId);
    if (!actor || !getJarvisAccess(game.user, actor).canViewActor) throw new Error("Ficha não disponível.");
    refreshActorOptions(root, actor.id);
    selectTab(root, "characters");
  } else if (row.type === "item") {
    const actor = row.actorId ? game.actors?.get?.(row.actorId) : null;
    const item = actor ? actor.items?.get?.(row.itemId) : game.items?.get?.(row.itemId);
    const permitted = game.user?.isGM || item?.testUserPermission?.(game.user, "OBSERVER")
      || actor?.testUserPermission?.(game.user, "OBSERVER");
    if (!item || !permitted) throw new Error("Item não disponível.");
    item.sheet?.render(true);
  } else if (row.type === "scene") {
    const scene = game.scenes?.get?.(row.sceneId);
    if (!scene || !(game.user?.isGM || scene.testUserPermission?.(game.user, "OBSERVER")
      || (scene.active && scene.navigation))) throw new Error("Cena não disponível.");
    await scene.view();
    if (game.user?.isGM) selectTab(root, "maps");
  } else if (row.type === "macro") {
    const entry = api().macros?.list?.().find(candidate => candidate.id === row.macroId);
    if (!entry) throw new Error("Macro não disponível.");
    refreshManagedMacroOptions(root, entry.id);
    selectTab(root, "macros");
  } else if (row.type === "compendium") {
    const pack = visiblePacks().find(entry => entry.collection === row.packId);
    if (!pack) throw new Error("Compêndio não disponível.");
    const select = field(root, "pack");
    const query = field(root, "pack-query");
    if (select) select.value = pack.collection;
    if (query) query.value = row.label;
    selectTab(root, "compendiums");
    await executeJarvisConsoleAction("pack-search", root, state);
  }
  const input = root.querySelector("[data-jarvis-global-search]");
  if (input) input.value = "";
  state.searchRows = [];
  renderSearchResults(root, []);
}

function queueGlobalSearch(root, state) {
  clearTimeout(state.searchTimer);
  state.searchAbort?.abort();
  state.searchRows = [];
  renderSearchResults(root, []);
  const query = root.querySelector("[data-jarvis-global-search]")?.value ?? "";
  if (!query.trim()) {
    const status = root.querySelector("[data-jarvis-status]");
    if (status) status.textContent = "";
    return;
  }
  const controller = new AbortController();
  state.searchAbort = controller;
  state.searchTimer = setTimeout(async () => {
    const status = root.querySelector("[data-jarvis-status]");
    if (status) status.textContent = "Buscando…";
    try {
      const rows = await searchConsole(query, { access: getJarvisAccess(game.user),
        actors: visibleActors(),
        items: [...values(game.items), ...visibleActors().flatMap(actor => values(actor.items))],
        scenes: values(game.scenes), macros: api().macros?.list?.() ?? [],
        packs: visiblePacks(), tools: TOOL_CATALOG,
        limit: 30, signal: controller.signal });
      if (controller.signal.aborted) return;
      state.searchRows = rows;
      renderSearchResults(root, rows);
      if (status) status.textContent = `${rows.length} resultado(s).`;
    } catch (error) {
      if (!controller.signal.aborted && status) status.textContent = `Busca falhou: ${error.message}`;
    }
  }, 180);
}

async function handleNavigationClick(event, root, state) {
  const tab = event.target.closest("[data-jarvis-tab]");
  if (tab) { selectTab(root, tab.dataset.jarvisTab); return true; }
  const toggle = event.target.closest("[data-jarvis-toggle-sidebar]");
  if (toggle) {
    const collapsed = root.dataset.sidebarCollapsed !== "true";
    state.preferences = await setConsoleSidebarCollapsed(collapsed);
    root.dataset.sidebarCollapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    return true;
  }
  const favorite = event.target.closest("[data-jarvis-favorite]");
  if (favorite) {
    state.preferences = await toggleConsoleFavorite(favorite.dataset.jarvisFavorite);
    refreshDashboard(root, state);
    return true;
  }
  const macro = event.target.closest("[data-jarvis-macro-run]");
  if (macro) {
    const entry = api().macros?.list?.().find(row => row.id === macro.dataset.jarvisMacroRun);
    if (!entry) throw new Error("Macro favorita não está mais disponível.");
    macro.disabled = true;
    try { setOutput(root, `Macro · ${entry.name}`, await api().macros.execute(entry.id)); }
    finally { macro.disabled = false; }
    return true;
  }
  const jump = event.target.closest("[data-jarvis-jump]");
  if (jump) {
    const tool = availableTools().find(entry => entry.id === jump.dataset.jarvisJump);
    if (tool) { selectTab(root, tool.tab); root.querySelector(`[data-jarvis-action="${tool.id}"]`)?.focus?.(); }
    return true;
  }
  const searchResult = event.target.closest("[data-jarvis-search-index]");
  if (searchResult) {
    await openSearchResult(root, state, Number(searchResult.dataset.jarvisSearchIndex));
    return true;
  }
  return false;
}

function bindDialog(dialog, state) {
  const root = dialog.element?.querySelector(".jarvis-console");
  if (!root || root.dataset.jarvisBound) return;
  root.dataset.jarvisBound = "true";
  refreshDashboard(root, state);
  refreshCaptureStatus(root);
  refreshActorRelatedOptions(root);
  refreshSceneDocumentOptions(root);
  root.addEventListener("click", async event => {
    try { if (await handleNavigationClick(event, root, state)) return; }
    catch (error) {
      setOutput(root, "Erro", error?.message ?? String(error));
      ui.notifications?.error(`Jarvis: ${error?.message ?? error}`);
      return;
    }
    const control = event.target.closest("[data-jarvis-action]");
    if (!control) return;
    const action = control.dataset.jarvisAction;
    if (control.disabled) return;
    control.disabled = true;
    control.setAttribute?.("aria-busy", "true");
    const status = root.querySelector("[data-jarvis-status]");
    if (status) status.textContent = "Executando…";
    state.actionIndex = control.dataset.jarvisIndex;
    const previousOutput = Number(root.dataset.jarvisOutputRevision ?? 0);
    try {
      await executeJarvisConsoleAction(action, root, state);
      if (TOOL_BY_ID.has(action) && Number(root.dataset.jarvisOutputRevision ?? 0) > previousOutput) {
        try {
          state.preferences = await recordConsoleRecent(action);
          refreshDashboard(root, state);
        } catch (historyError) {
          // A failed preference write must never turn a successful action into a UI error.
          console.warn(`${MODULE_ID} | Não foi possível registrar a ação recente`, historyError);
        }
      }
      if (status) status.textContent = "Pronto.";
    }
    catch (error) {
      const detail = Array.isArray(error?.details) ? `\n${error.details.join("\n")}` : "";
      if (error instanceof JarvisInputError) {
        // Missing selections or required names are guidance, not runtime failures.
        setOutput(root, "Preencha os campos", `${error.message}${detail}`);
        ui.notifications?.warn(`Jarvis: ${error.message}`);
        if (status) status.textContent = "Aguardando preenchimento.";
      } else {
        try { api().diagnostics?.capture?.recordFailure?.("action", error, action); }
        catch { /* Diagnostics must never hide the original action error. */ }
        refreshCaptureStatus(root);
        setOutput(root, "Erro", `${error?.message ?? error}${detail}`);
        ui.notifications?.error(`Jarvis: ${error?.message ?? error}`);
        console.error(`${MODULE_ID} | Ação ${action} falhou`, error);
        if (status) status.textContent = "Ação não concluída.";
      }
    } finally { control.disabled = false; control.removeAttribute?.("aria-busy"); }
  });
  root.addEventListener("change", event => {
    if (event.target?.matches?.('[name="jarvis-actor"]')) {
      refreshDashboard(root, state);
      refreshActorRelatedOptions(root);
    }
    if (event.target?.matches?.('[name="managed-macro"]')) populateManagedMacroForm(root);
    if (event.target?.matches?.('[name="automation-item"]')) refreshAutomationActivityOptions(root);
    if (event.target?.matches?.('[name="scene-edit-type"]')) refreshSceneDocumentOptions(root);
    if (event.target?.matches?.('[name="scene-edit-existing"]')) {
      const id = field(root, "scene-edit-id");
      if (id) id.value = event.target.value;
    }
  });
  root.addEventListener("input", event => {
    if (event.target?.matches?.("[data-jarvis-global-search]")) queueGlobalSearch(root, state);
  });
  root.addEventListener("keydown", event => {
    const tab = event.target?.closest?.("[data-jarvis-tab]");
    if (!tab) return;
    const tabs = Array.from(root.querySelectorAll("[data-jarvis-tab]"));
    const index = tabs.indexOf(tab);
    let next = index;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(root, tabs[next].dataset.jarvisTab, { focus: true });
  });
}

export function openJarvisConsole() {
  if (currentDialog && (currentDialog.rendered || openingPromise)) {
    if (currentDialog.rendered) currentDialog.bringToFront();
    return currentDialog;
  }
  const state = { packRows: [], actionIndex: null, transformationTokenId: null,
    preferences: loadConsolePreferences(), searchRows: [], searchAbort: null, searchTimer: null };
  const Dialog = foundry.applications.api.DialogV2;
  const dialog = new Dialog({
    window: { title: "Jarvis — Fora do Abismo", resizable: true },
    position: { width: Math.min(1080, Math.max(640, (globalThis.innerWidth ?? 1160) - 80)),
      height: Math.min(720, Math.max(540, (globalThis.innerHeight ?? 800) - 80)) },
    modal: false,
    content: renderContent(),
    buttons: [{ action: "close", label: "Fechar" }]
  });
  currentDialog = dialog;
  openingPromise = Promise.resolve().then(() => dialog.render({ force: true }))
    .then(() => bindDialog(dialog, state))
    .catch(error => {
      if (currentDialog === dialog) currentDialog = null;
      ui.notifications?.error(`Jarvis: não foi possível abrir a interface. ${error.message}`);
      console.error(`${MODULE_ID} | Interface falhou`, error);
    }).finally(() => { openingPromise = null; });
  return dialog;
}

export function registerJarvisConsoleControl() {
  Hooks.on("getSceneControlButtons", controls => {
    const tools = controls.tokens?.tools;
    if (!tools) return;
    tools.jarvisConsole = {
      name: "jarvisConsole", title: "Jarvis — Fora do Abismo", icon: "fa-solid fa-book-skull",
      order: Object.keys(tools).length, button: true, visible: true,
      onChange: () => openJarvisConsole()
    };
  });
}
