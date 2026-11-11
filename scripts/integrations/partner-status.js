export const PARTNER_MODULES = Object.freeze([
  { id: "socketlib", name: "socketlib", purpose: "Efeitos em alvos sem permissão de escrita" },
  { id: "tagger", name: "Tagger", purpose: "Etiquetas em objetos da cena" },
  { id: "sequencer", name: "Sequencer", purpose: "Sequências visuais e sonoras" },
  { id: "dae", name: "Dynamic Active Effects", purpose: "Inspeção de efeitos avançados" },
  { id: "item-piles", name: "Item Piles", purpose: "Tesouros interativos no mapa" },
  { id: "tokenmagic", name: "Token Magic FX", purpose: "Filtros em tokens e áreas" },
  { id: "fxmaster", name: "FXMaster", purpose: "Clima e partículas de cena" },
  { id: "polyglot", name: "Polyglot", purpose: "Pistas em idiomas de fantasia" },
  { id: "dd-import", name: "Universal Battlemap Importer", purpose: "Mapas e níveis adicionais" },
  { id: "tidy5e-sheet", name: "Tidy 5e Sheets", purpose: "Atalhos Jarvis nas fichas" }
]);

export function listPartnerStatus(gameRef = globalThis.game) {
  const ready = {
    socketlib: () => typeof globalThis.socketlib?.registerModule === "function",
    tagger: () => typeof globalThis.Tagger?.getByTag === "function",
    sequencer: () => typeof globalThis.Sequence === "function",
    dae: () => true,
    "item-piles": () => typeof gameRef?.itempiles?.API?.createItemPile === "function"
      && Boolean(gameRef?.modules?.get?.("itempilesdnd5e")?.active),
    tokenmagic: () => typeof globalThis.TokenMagic?.addFilters === "function",
    fxmaster: () => typeof globalThis.FXMASTER?.api?.presets?.play === "function",
    polyglot: () => Boolean(gameRef?.polyglot?.provider),
    "dd-import": () => true,
    "tidy5e-sheet": () => Boolean(gameRef?.modules?.get?.("tidy5e-sheet")?.api)
  };
  return PARTNER_MODULES.map(partner => {
    const module = gameRef?.modules?.get?.(partner.id);
    return { ...partner, installed: Boolean(module), active: Boolean(module?.active),
      apiReady: Boolean(module?.active && ready[partner.id]?.()),
      version: module?.version ?? null };
  });
}

export function requirePartner(id, capability = null) {
  const module = globalThis.game?.modules?.get?.(id);
  if (!module?.active) throw new Error(`Jarvis: instale e ative ${PARTNER_MODULES.find(p => p.id === id)?.name ?? id}.`);
  if (capability && !capability()) throw new Error(`Jarvis: ${id} está ativo, mas a API necessária não está disponível nesta versão.`);
  return module;
}

export function requireGm() {
  if (!globalThis.game?.user?.isGM) throw new Error("Jarvis: esta operação de mundo exige o Mestre.");
}
