import { getRegisteredIcon, inferIconKey } from "./icon-registry.js";

export const IMAGE_SOURCES = Object.freeze({
  FOUNDRY: "foundry",
  GENERATED: "generate",
  CUSTOM: "custom"
});

export function normalizeImageStrategy(strategy = {}) {
  const source = Object.values(IMAGE_SOURCES).includes(strategy.source)
    ? strategy.source
    : IMAGE_SOURCES.FOUNDRY;

  return {
    source,
    iconKey: typeof strategy.iconKey === "string" ? strategy.iconKey : null,
    customPath: typeof strategy.customPath === "string" ? strategy.customPath : null,
    promptHints: Array.isArray(strategy.promptHints) ? strategy.promptHints.filter(Boolean) : [],
    tags: Array.isArray(strategy.tags) ? strategy.tags.filter(Boolean) : [],
    semanticRole: typeof strategy.semanticRole === "string" ? strategy.semanticRole : null,
    style: typeof strategy.style === "string" ? strategy.style : "fora-do-abismo-icon",
    fallbackIcon: typeof strategy.fallbackIcon === "string" ? strategy.fallbackIcon : null
  };
}

export function resolveDocumentImage(documentData, strategy, { kind = "item" } = {}) {
  const normalized = normalizeImageStrategy(strategy);

  if (normalized.source === IMAGE_SOURCES.CUSTOM && normalized.customPath) {
    return normalized.customPath;
  }

  if (normalized.source === IMAGE_SOURCES.GENERATED) {
    // Geração automática será resolvida em uma etapa assíncrona separada.
    // Por enquanto, usamos fallback determinístico para garantir que o Item/Actor sempre tenha imagem válida.
    if (normalized.fallbackIcon) return normalized.fallbackIcon;
  }

  if (normalized.iconKey) {
    const explicit = getRegisteredIcon(normalized.iconKey);
    if (explicit) return explicit;
  }

  const inferredKey = inferIconKey(documentData, normalized, { kind });
  return getRegisteredIcon(inferredKey)
    ?? normalized.fallbackIcon
    ?? getRegisteredIcon(kind === "actor" ? "actor" : "default");
}

export function buildGenerationDescriptor(documentData, strategy = {}, { kind = "item" } = {}) {
  const normalized = normalizeImageStrategy(strategy);
  if (normalized.source !== IMAGE_SOURCES.GENERATED) return null;

  return {
    kind,
    name: documentData?.name ?? "Sem nome",
    documentType: documentData?.type ?? kind,
    style: normalized.style,
    semanticRole: normalized.semanticRole,
    tags: normalized.tags,
    promptHints: normalized.promptHints
  };
}
