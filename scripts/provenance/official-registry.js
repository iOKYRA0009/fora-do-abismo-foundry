function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const entries = [
  {
    key: "warlock:undead",
    type: "subclass",
    classIdentifier: "warlock",
    canonicalName: "The Undead",
    aliases: [
      "the undead", "undead", "morto-vivo", "patrono morto-vivo",
      "patrono undead", "undead patron"
    ],
    identifiers: ["undead", "the-undead", "patrono-undead", "patrono-morto-vivo"],
    sourceBooks: ["Van Richten's Guide to Ravenloft"],
    sourceRules: ["2014"],
    rules: ["2014", "2024"],
    profileModes: {
      "2014": "native",
      "2024": "legacy-adapted"
    },
    features: [
      { level: 1, name: "Expanded Spell List", aliases: ["expanded spell list", "lista de magias expandida"] },
      { level: 1, name: "Form of Dread", aliases: ["form of dread", "forma de pavor", "forma do pavor"] },
      { level: 6, name: "Grave Touched", aliases: ["grave touched", "toque da sepultura", "toque sepulcral"] },
      { level: 10, name: "Necrotic Husk", aliases: ["necrotic husk", "carcaca necrotica", "casca necrotica"] },
      { level: 14, name: "Spirit Projection", aliases: ["spirit projection", "projecao espiritual", "projecao de espirito"] }
    ]
  },
  {
    key: "sorcerer:storm-sorcery",
    type: "subclass",
    classIdentifier: "sorcerer",
    canonicalName: "Storm Sorcery",
    aliases: [
      "storm sorcery", "storm sorcerer", "feiticeiro da tempestade",
      "feiticeiro da tormenta", "feiticaria da tempestade", "magia da tempestade"
    ],
    identifiers: [
      "storm-sorcery", "storm-sorcerer", "feiticeiro-da-tempestade",
      "feiticaria-da-tempestade", "feiticeiro-da-tormenta"
    ],
    sourceBooks: ["Xanathar's Guide to Everything", "Sword Coast Adventurer's Guide"],
    sourceRules: ["2014"],
    rules: ["2014", "2024"],
    profileModes: {
      "2014": "native",
      "2024": "legacy-adapted"
    },
    features: [
      { level: 1, name: "Wind Speaker", aliases: ["wind speaker", "orador do vento"] },
      { level: 1, name: "Tempestuous Magic", aliases: ["tempestuous magic", "magia tempestuosa"] },
      { level: 6, name: "Heart of the Storm", aliases: ["heart of the storm", "coracao da tempestade"] },
      { level: 6, name: "Storm Guide", aliases: ["storm guide", "guia da tempestade"] },
      { level: 14, name: "Storm's Fury", aliases: ["storms fury", "storm s fury", "furia da tempestade"] },
      { level: 18, name: "Wind Soul", aliases: ["wind soul", "alma do vento"] }
    ]
  },
  {
    key: "fighter:eldritch-knight",
    type: "subclass",
    classIdentifier: "fighter",
    canonicalName: "Eldritch Knight",
    aliases: ["eldritch knight", "cavaleiro arcano", "cavaleiro mistico"],
    identifiers: ["eldritch-knight", "cavaleiro-arcano", "cavaleiro-mistico"],
    sourceBooks: ["Player's Handbook"],
    sourceRules: ["2014", "2024"],
    rules: ["2014", "2024"],
    profileModes: {
      "2014": "native",
      "2024": "native-updated"
    },
    features: [
      { level: 3, name: "Spellcasting", aliases: ["spellcasting", "conjuracao", "conjuracao cavaleiro arcano"] },
      { level: 3, name: "Weapon Bond / War Bond", aliases: ["weapon bond", "war bond", "vinculo com arma", "vinculo de arma", "vinculo de guerra"] },
      { level: 7, name: "War Magic", aliases: ["war magic", "magia de guerra"] },
      { level: 10, name: "Eldritch Strike", aliases: ["eldritch strike", "golpe mistico", "golpe arcano"] },
      { level: 15, name: "Arcane Charge", aliases: ["arcane charge", "carga arcana"] },
      { level: 18, name: "Improved War Magic", aliases: ["improved war magic", "magia de guerra aprimorada"] }
    ]
  }
];

for (const entry of entries) {
  entry.aliases = new Set([entry.canonicalName, ...(entry.aliases ?? [])].map(normalize));
  entry.identifiers = new Set((entry.identifiers ?? []).map(normalize));
  entry.featureIndex = new Map();

  for (const feature of entry.features ?? []) {
    const aliases = [feature.name, ...(feature.aliases ?? [])].map(normalize);
    for (const alias of aliases) entry.featureIndex.set(alias, feature);
  }
}

export const OFFICIAL_SUBCLASS_REGISTRY = Object.freeze(entries);

export function normalizeOfficialKey(value) {
  return normalize(value);
}

export function findOfficialSubclass({ name = "", identifier = "", classIdentifier = "" } = {}) {
  const normalizedName = normalize(name);
  const normalizedIdentifier = normalize(identifier);
  const normalizedClass = normalize(classIdentifier);

  return OFFICIAL_SUBCLASS_REGISTRY.find(entry => {
    if (normalizedClass && entry.classIdentifier !== normalizedClass) return false;
    if (normalizedIdentifier && entry.identifiers.has(normalizedIdentifier)) return true;
    return normalizedName ? entry.aliases.has(normalizedName) : false;
  }) ?? null;
}

export function findOfficialFeature(entry, name = "") {
  if (!entry || !name) return null;
  return entry.featureIndex.get(normalize(name)) ?? null;
}
