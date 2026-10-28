import { Dnd5eV6Adapter } from "../importer/adapters/dnd5e-adapter.js";

const MODULE_ID = "fora-do-abismo-foundry";
const ITEM_TYPES = new Set(["feat", "weapon", "spell", "consumable", "equipment", "tool",
  "loot", "container", "class", "subclass", "background", "race"]);

function requireGM() {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
    throw new Error("Jarvis Conteúdo: apenas o Mestre ativo pode criar documentos.");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function plainData(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Jarvis Conteúdo: ${label} deve ser um objeto.`);
  }
  return foundry.utils.deepClone(value);
}

function allowedItemType(type) {
  const declared = game.documentTypes?.Item;
  const available = Array.isArray(declared) ? new Set(declared)
    : declared && typeof declared === "object" ? new Set(Object.keys(declared)) : ITEM_TYPES;
  return available.has(type) && ITEM_TYPES.has(type);
}

function normalize(input) {
  const spec = plainData(input, "a criação");
  const kind = spec.kind === "actor" ? "actor" : spec.kind === "item" ? "item" : null;
  if (!kind) throw new Error("Jarvis Conteúdo: escolha personagem ou Item.");
  const mode = spec.mode ?? "simple";
  if (!["simple", "advanced"].includes(mode)) throw new Error("Jarvis Conteúdo: modo inválido.");
  const name = String(spec.name ?? spec.data?.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Jarvis Conteúdo: informe um nome.");
  const type = String(spec.type ?? spec.data?.type ?? (kind === "actor" ? "character" : "feat"));
  if (kind === "actor" && !["character", "npc"].includes(type)) {
    throw new Error("Jarvis Conteúdo: Actor deve ser character ou npc.");
  }
  if (kind === "item" && !allowedItemType(type)) {
    throw new Error(`Jarvis Conteúdo: tipo de Item '${type}' indisponível.`);
  }
  if (JSON.stringify(spec).length > 256 * 1024) throw new Error("Jarvis Conteúdo: dados acima de 256 KiB.");
  const data = mode === "advanced" ? plainData(spec.data ?? {}, "data avançada") : {};
  data.name = name;
  data.type = type;
  if (mode === "simple") {
    if (kind === "actor") {
      const abilities = spec.abilities ?? {};
      if (!abilities || typeof abilities !== "object" || Array.isArray(abilities)
        || Object.keys(abilities).some(key => !["str", "dex", "con", "int", "wis", "cha"].includes(key)
          || !Number.isInteger(Number(abilities[key])) || Number(abilities[key]) < 1 || Number(abilities[key]) > 30)) {
        throw new Error("Jarvis Conteúdo: atributos devem ser inteiros de 1 a 30.");
      }
      const hp = spec.hp === undefined || spec.hp === "" ? null : Number(spec.hp);
      const ac = spec.ac === undefined || spec.ac === "" ? null : Number(spec.ac);
      if (hp !== null && (!Number.isInteger(hp) || hp < 1 || hp > 9999)) {
        throw new Error("Jarvis Conteúdo: PV devem ser um inteiro de 1 a 9999.");
      }
      if (ac !== null && (!Number.isInteger(ac) || ac < 0 || ac > 99)) {
        throw new Error("Jarvis Conteúdo: CA deve ser um inteiro de 0 a 99.");
      }
      data.jarvis = { abilities: Object.fromEntries(Object.entries(abilities)
        .map(([key, value]) => [key, Number(value)])) };
      if (hp !== null) data.jarvis.hp = { value: hp, max: hp };
      if (ac !== null) data.jarvis.ac = ac;
      if (String(spec.biography ?? "").trim()) {
        data.jarvis.details = { biography: escapeHtml(String(spec.biography).trim()).replace(/\r?\n/g, "<br>") };
      }
    }
    const description = String(spec.description ?? "").trim();
    if (description && kind === "item") {
      data.jarvis = { description: escapeHtml(description).replace(/\r?\n/g, "<br>") };
    }
    if (kind === "item" && spec.usesMax !== undefined && spec.usesMax !== "") {
      const usesMax = Number(spec.usesMax);
      if (!Number.isInteger(usesMax) || usesMax < 0 || usesMax > 9999) {
        throw new Error("Jarvis Conteúdo: cargas devem ser um inteiro de 0 a 9999.");
      }
      data.jarvis ??= {};
      data.jarvis.uses = { max: usesMax, spent: 0 };
    }
  }
  const effects = spec.effects ?? [];
  if (!Array.isArray(effects) || effects.length > 30 || effects.some(effect =>
    !effect || typeof effect !== "object" || Array.isArray(effect) || !String(effect.name ?? "").trim()
  )) throw new Error("Jarvis Conteúdo: forneça até 30 Active Effects com nome.");
  const progression = spec.progression ?? [];
  if (!Array.isArray(progression) || progression.length > 20) {
    throw new Error("Jarvis Conteúdo: progressão deve conter até 20 níveis.");
  }
  if (progression.length && (kind !== "item" || type !== "class")) {
    throw new Error("Jarvis Conteúdo: progressão Jarvis só pode ser registrada em classe.");
  }
  if (progression.some(step => !step || !Number.isInteger(Number(step.level))
    || Number(step.level) < 1 || Number(step.level) > 20 || !Array.isArray(step.grants))) {
    throw new Error("Jarvis Conteúdo: cada progressão precisa de nível 1–20 e lista de concessões.");
  }
  const destinationActorId = spec.destinationActorId ? String(spec.destinationActorId) : null;
  if (kind === "actor" && destinationActorId) throw new Error("Jarvis Conteúdo: Actor não pode ser embutido em outro Actor.");
  if (kind === "item") {
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID].provenanceInput = {
      kind: "homebrew", confidence: 1, reason: "Criado no assistente Jarvis."
    };
  }
  return { kind, mode, name, type, data, effects: foundry.utils.deepClone(effects),
    progression: foundry.utils.deepClone(progression), destinationActorId };
}

export function contentTemplates() {
  return [
    { key: "npc", label: "NPC", spec: { kind: "actor", type: "npc", mode: "simple" } },
    { key: "character", label: "Personagem", spec: { kind: "actor", type: "character", mode: "simple" } },
    { key: "feat", label: "Talento ou habilidade", spec: { kind: "item", type: "feat", mode: "simple" } },
    { key: "class", label: "Classe", spec: { kind: "item", type: "class", mode: "simple" } },
    { key: "subclass", label: "Subclasse", spec: { kind: "item", type: "subclass", mode: "simple" } },
    { key: "spell", label: "Magia", spec: { kind: "item", type: "spell", mode: "simple" } },
    { key: "equipment", label: "Equipamento", spec: { kind: "item", type: "equipment", mode: "simple" } }
  ];
}

export function contentItemTypes() {
  return [...ITEM_TYPES].filter(allowedItemType);
}

export function previewContent(input) {
  requireGM();
  Dnd5eV6Adapter.assertRuntime();
  const spec = normalize(input);
  const adapted = spec.kind === "actor" ? Dnd5eV6Adapter.adaptActor(spec.data)
    : Dnd5eV6Adapter.adaptItem(spec.data);
  return { kind: spec.kind, mode: spec.mode, name: spec.name, type: spec.type,
    destination: spec.destinationActorId ? { actorId: spec.destinationActorId } : "world",
    activities: Object.keys(adapted.system?.activities ?? {}).length,
    effects: spec.effects.length, progressionSteps: spec.progression.length,
    uses: adapted.system?.uses ?? null,
    actor: spec.kind === "actor" ? { hp: adapted.system?.attributes?.hp ?? null,
      ac: adapted.system?.attributes?.ac ?? null,
      abilities: adapted.system?.abilities ?? null } : null,
    warnings: [
      ...(spec.type === "class" || spec.type === "subclass"
        ? ["Revise Advancement, níveis e escolhas na ficha nativa D&D5e."] : []),
      ...(spec.effects.length ? ["Revise os Active Effects na ficha antes de usar em jogo."] : []),
      ...(adapted.system?.activities ? ["Activities importadas precisam de revisão mecânica e aprovação de scripts Jarvis."] : [])
    ] };
}

export async function createContent(input, { openSheet = true } = {}) {
  requireGM();
  Dnd5eV6Adapter.assertRuntime();
  const spec = normalize(input);
  const preview = previewContent(input);
  const adapted = spec.kind === "actor" ? Dnd5eV6Adapter.adaptActor(spec.data)
    : Dnd5eV6Adapter.adaptItem(spec.data);
  let document;
  let created;
  try {
    if (spec.kind === "actor") {
      document = await Actor.create(adapted);
    } else if (spec.destinationActorId) {
      const actor = game.actors.get(spec.destinationActorId);
      if (!actor) throw new Error("Jarvis Conteúdo: personagem de destino não encontrado.");
      [document] = await actor.createEmbeddedDocuments("Item", [adapted]);
    } else document = await Item.create(adapted);
    if (!document) throw new Error("Jarvis Conteúdo: o Foundry não criou o documento.");
    created = document;
    if (spec.effects.length) {
      const effects = await document.createEmbeddedDocuments("ActiveEffect", spec.effects);
      if (effects?.length !== spec.effects.length) throw new Error("Jarvis Conteúdo: Active Effects incompletos.");
    }
    if (spec.progression.length) {
      await document.setFlag(MODULE_ID, "progression", spec.progression);
    }
  } catch (error) {
    if (created) {
      try {
        await created.delete();
      } catch (rollbackError) {
        const message = `Jarvis Conteúdo: falha ao remover o documento criado (${created.name ?? "sem nome"}). Revise a ficha antes de repetir a criação.`;
        console.error(`${MODULE_ID} | ${message}`, rollbackError);
        ui.notifications?.error?.(message);
        throw new AggregateError([error, rollbackError], message);
      }
    }
    throw error;
  }
  if (openSheet) document.sheet?.render(true);
  return { document, preview };
}
