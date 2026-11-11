const MODULE_ID = "fora-do-abismo-foundry";
const SETTING = "translationGlossary";
const termIndexes = new WeakMap();

// Deliberately small and literal: this is a terminology aid, not a rules translator.
export const DND_GLOSSARY = Object.freeze({
  "Acid": "Ácido", "Bludgeoning": "Contundente", "Cold": "Frio",
  "Fire": "Fogo", "Force": "Energia", "Lightning": "Elétrico",
  "Necrotic": "Necrótico", "Piercing": "Perfurante", "Poison": "Veneno",
  "Psychic": "Psíquico", "Radiant": "Radiante", "Slashing": "Cortante",
  "Thunder": "Trovejante", "Armor Class": "Classe de Armadura",
  "Hit Points": "Pontos de Vida", "Saving Throw": "Teste de Resistência",
  "Ability Check": "Teste de Atributo", "Spell Attack": "Ataque Mágico",
  "Bonus Action": "Ação Bônus", "Short Rest": "Descanso Curto",
  "Long Rest": "Descanso Longo", "Concentration": "Concentração",
  "Fireball": "Bola de Fogo", "Magic Missile": "Mísseis Mágicos",
  "Shield": "Escudo", "Healing Word": "Palavra Curativa",
  "Cure Wounds": "Curar Ferimentos", "Counterspell": "Contramágica",
  "Mage Armor": "Armadura Arcana", "Longsword": "Espada Longa",
  "Shortsword": "Espada Curta", "Dagger": "Adaga", "Longbow": "Arco Longo",
  "Shortbow": "Arco Curto", "Greatsword": "Espada Grande",
  "Darkvision": "Visão no Escuro", "Initiative": "Iniciativa",
  "Advantage": "Vantagem", "Disadvantage": "Desvantagem"
});

export function normalizeTerm(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").trim();
}

export function validateGlossary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("O glossário deve ser um objeto JSON: nome em inglês → nome em português.");
  }
  const entries = Object.entries(value);
  if (entries.length > 500) throw new Error("O glossário aceita até 500 termos próprios.");
  const result = {};
  for (const [source, target] of entries) {
    if (!source.trim() || source.length > 120 || typeof target !== "string"
      || !target.trim() || target.length > 200) {
      throw new Error("Cada termo precisa ter um nome e uma tradução curta.");
    }
    result[source.trim()] = target.trim();
  }
  return result;
}

export function registerTranslationSettings() {
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world", config: false, type: Object, default: {}
  });
}

export function glossaryOverrides() {
  try { return validateGlossary(game.settings.get(MODULE_ID, SETTING) ?? {}); }
  catch { return {}; }
}

export async function saveGlossaryOverrides(value) {
  if (!game.user?.isGM) throw new Error("Somente o Mestre pode alterar o glossário.");
  const validated = validateGlossary(value);
  await game.settings.set(MODULE_ID, SETTING, validated);
  return validated;
}

export function glossary(override = glossaryOverrides()) {
  return { ...DND_GLOSSARY, ...override };
}

function termIndex(terms) {
  let index = termIndexes.get(terms);
  if (index) return index;
  index = new Map();
  for (const [source, target] of Object.entries(terms)) {
    index.set(normalizeTerm(source), [source, target]);
    index.set(normalizeTerm(target), [source, target]);
  }
  termIndexes.set(terms, index);
  return index;
}

function lookup(term, terms) {
  const pair = termIndex(terms).get(normalizeTerm(term));
  return pair && normalizeTerm(term) === normalizeTerm(pair[0]) ? pair[1] : null;
}

export function originalName(entry) {
  return entry?.flags?.babele?.originalName ?? entry?.flags?.core?.originalName
    ?? entry?.name ?? "";
}

export function localizedName(entry, terms = glossary()) {
  const shown = String(entry?.name ?? "");
  const original = originalName(entry);
  return normalizeTerm(shown) !== normalizeTerm(original) ? shown : lookup(original, terms) ?? shown;
}

export function bilingualNames(entry, terms = glossary()) {
  const original = originalName(entry);
  const shown = localizedName(entry, terms);
  const names = new Set([shown, original, entry?.name]);
  const index = termIndex(terms);
  for (const name of [original, shown]) {
    const pair = index.get(normalizeTerm(name));
    if (pair) { names.add(pair[0]); names.add(pair[1]); }
  }
  return [...names].filter(Boolean);
}

export function matchesBilingual(entry, query, terms = glossary()) {
  const needle = normalizeTerm(query);
  return !needle || bilingualNames(entry, terms).some(name => normalizeTerm(name).includes(needle))
    || normalizeTerm(entry?.type).includes(needle);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Only substitutions inside text nodes. HTML tags, UUIDs, dice expressions and links stay intact.
export function draftDescription(html, terms = glossary()) {
  if (typeof html !== "string" || !html) return html;
  const pairs = Object.entries(terms).filter(([source]) => source.length > 3)
    .sort((a, b) => b[0].length - a[0].length);
  return html.split(/(<[^>]*>|\[\[[\s\S]*?\]\]|@\w+\[[^\]]*\](?:\{[^}]*\})?)/g).map(segment => {
    if (segment.startsWith("<") || segment.startsWith("[[") || segment.startsWith("@")) return segment;
    let text = segment;
    for (const [source, target] of pairs) {
      const expression = new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi");
      text = text.replace(expression, target);
    }
    return text;
  }).join("");
}

export function localizedImportData(source, terms = glossary()) {
  const data = structuredClone(source);
  const original = originalName(data);
  const translated = localizedName(data, terms);
  const babeleTranslated = normalizeTerm(data.name) !== normalizeTerm(original);
  data.name = translated;
  if (!babeleTranslated && data.system?.description) {
    for (const field of ["value", "chat"]) {
      if (typeof data.system.description[field] === "string") {
        data.system.description[field] = draftDescription(data.system.description[field], terms);
      }
    }
  }
  return data;
}
