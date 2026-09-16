export const JARVIS_ICON_REGISTRY = Object.freeze({
  default: "icons/svg/item-bag.svg",
  actor: "icons/svg/mystery-man.svg",
  weapon: "icons/svg/sword.svg",
  spell: "icons/svg/book.svg",
  feat: "icons/svg/upgrade.svg",
  equipment: "icons/svg/shield.svg",
  consumable: "icons/svg/item-bag.svg",
  defense: "icons/svg/shield.svg",
  aura: "icons/svg/aura.svg",
  healing: "icons/svg/heal.svg",
  lightning: "icons/svg/lightning.svg",
  necrotic: "icons/svg/skull.svg",
  radiant: "icons/svg/sun.svg",
  movement: "icons/svg/wing.svg",
  summon: "icons/svg/mystery-man.svg"
});

export function getRegisteredIcon(iconKey) {
  if (!iconKey || typeof iconKey !== "string") return null;
  return JARVIS_ICON_REGISTRY[iconKey] ?? null;
}

export function inferIconKey(documentData = {}, strategy = {}, { kind = "item" } = {}) {
  const tags = new Set([
    ...(Array.isArray(strategy.tags) ? strategy.tags : []),
    strategy.semanticRole,
    documentData.type,
    kind
  ].filter(Boolean).map(value => String(value).toLowerCase()));

  const priority = [
    "radiant",
    "necrotic",
    "lightning",
    "healing",
    "summon",
    "defense",
    "movement",
    "weapon",
    "spell",
    "feat",
    "equipment",
    "consumable",
    "actor"
  ];

  for (const key of priority) {
    if (tags.has(key)) return key;
  }

  if (kind === "actor") return "actor";
  return JARVIS_ICON_REGISTRY[documentData.type] ? documentData.type : "default";
}
