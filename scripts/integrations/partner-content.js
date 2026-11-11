import { requireGm, requirePartner } from "./partner-status.js";

const MODULE_ID = "fora-do-abismo-foundry";

export async function createLootPile({ items, scene = globalThis.canvas?.scene, x, y,
  name = "Tesouro" } = {}) {
  requireGm();
  requirePartner("item-piles", () => typeof game.itempiles?.API?.createItemPile === "function");
  requirePartner("itempilesdnd5e");
  if (!scene?.id || scene.documentName !== "Scene") throw new Error("Jarvis: abra uma cena válida para o tesouro.");
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0
    || x > scene.width || y > scene.height) throw new Error("Jarvis: posição do tesouro fora da cena.");
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    throw new Error("Jarvis: o tesouro precisa conter entre 1 e 100 Items.");
  }
  const data = items.map(item => {
    const copy = item?.toObject?.() ?? structuredClone(item);
    if (!copy || typeof copy !== "object" || !copy.name || !copy.type) {
      throw new Error("Jarvis: tesouro contém Item inválido.");
    }
    delete copy._id;
    return copy;
  });
  return game.itempiles.API.createItemPile({ sceneId: scene.id, position: { x, y },
    items: data, createActor: true, actorOverrides: { name: String(name).slice(0, 100) } });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export async function sendLanguageMessage({ text, language, actor = null, whisper = [] } = {}) {
  requirePartner("polyglot", () => Boolean(game.polyglot?.provider));
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    throw new Error("Jarvis: mensagem deve ter entre 1 e 4000 caracteres.");
  }
  if (typeof language !== "string" || !language.trim()) throw new Error("Jarvis: informe o idioma da mensagem.");
  const code = language.trim().toLowerCase();
  const languages = game.polyglot.provider.languages;
  const known = languages instanceof Map ? languages.has(code) : Object.hasOwn(languages ?? {}, code);
  if (languages && !known) throw new Error(`Jarvis: idioma '${code}' não configurado no Polyglot.`);
  if (actor && !game.user?.isGM && !actor.testUserPermission?.(game.user, "OWNER")) {
    throw new Error("Jarvis: você não controla o personagem que fala.");
  }
  if (!Array.isArray(whisper) || whisper.some(id => !game.users?.get?.(id))) {
    throw new Error("Jarvis: lista de destinatários inválida.");
  }
  return ChatMessage.create({
    content: escapeHtml(text),
    style: CONST.CHAT_MESSAGE_STYLES.IC,
    speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }),
    whisper,
    flags: { polyglot: { language: code }, [MODULE_ID]: { languageMessage: true } }
  });
}
