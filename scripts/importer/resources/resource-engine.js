const RESOURCE_SLOTS = Object.freeze(["primary", "secondary", "tertiary"]);

function asInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeResource(resource = {}, index = 0) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw new Error(`Recurso #${index + 1} inválido.`);
  }

  const slot = resource.slot ?? RESOURCE_SLOTS[index];
  if (!RESOURCE_SLOTS.includes(slot)) {
    throw new Error(`Recurso '${resource.label ?? index + 1}' usa slot inválido '${slot}'. Use primary, secondary ou tertiary.`);
  }

  const max = Math.max(0, asInteger(resource.max, 0));
  const value = clamp(asInteger(resource.value, max), 0, max);
  const recovery = resource.recovery ?? null;

  return {
    slot,
    data: {
      label: String(resource.label ?? ""),
      value,
      max,
      sr: Boolean(resource.sr ?? (recovery === "shortRest") ?? false),
      lr: Boolean(resource.lr ?? (recovery === "longRest") ?? false)
    }
  };
}

export function applyActorResources(systemData, resources = []) {
  if (!Array.isArray(resources)) {
    throw new Error("actor.jarvis.resources deve ser uma lista.");
  }

  if (resources.length > RESOURCE_SLOTS.length) {
    throw new Error("O D&D5e oferece apenas 3 slots nativos de recurso no Actor (primary, secondary, tertiary). Recursos adicionais devem usar Item Uses ou flags próprias do Jarvis.");
  }

  const normalized = resources.map(normalizeResource);
  const slots = normalized.map(resource => resource.slot);
  if (new Set(slots).size !== slots.length) {
    throw new Error("actor.jarvis.resources contém slots repetidos; cada recurso deve usar primary, secondary ou tertiary uma vez.");
  }

  systemData.resources ??= {};

  normalized.forEach(({ slot, data }) => {
    systemData.resources[slot] = {
      ...(systemData.resources[slot] ?? {}),
      ...data
    };
  });

  return systemData;
}

export function getResourceSlots() {
  return [...RESOURCE_SLOTS];
}
