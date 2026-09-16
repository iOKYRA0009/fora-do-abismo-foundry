const JARVIS_ITEM_REF_PREFIX = "@jarvis:";

function slugify(value = "item") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || "item";
}

function buildItemIndex(items = []) {
  const index = new Map();

  for (const item of items) {
    const identifier = item.system?.identifier ? String(item.system.identifier) : null;
    const nameKey = slugify(item.name);

    for (const key of [identifier, nameKey].filter(Boolean)) {
      if (index.has(key) && index.get(key) !== item.id) {
        throw new Error(`Referência Jarvis ambígua '${key}'. Dois Items usam a mesma chave.`);
      }
      index.set(key, item.id);
    }
  }

  return index;
}

function resolveTarget(target, itemIndex) {
  if (!target || typeof target !== "string" || !target.startsWith(JARVIS_ITEM_REF_PREFIX)) return target;

  const key = slugify(target.slice(JARVIS_ITEM_REF_PREFIX.length));
  const itemId = itemIndex.get(key);
  if (!itemId) {
    throw new Error(`Item referenciado por consumo não encontrado: '${target}'.`);
  }
  return itemId;
}

export async function resolveCrossItemConsumption(actor, createdItems = []) {
  if (!actor || !Array.isArray(createdItems) || !createdItems.length) return 0;

  const itemIndex = buildItemIndex(Array.from(actor.items));
  const updates = [];
  let resolvedCount = 0;

  for (const item of createdItems) {
    const source = item.toObject();
    const activities = source.system?.activities ?? {};
    const update = { _id: item.id };
    let itemChanged = false;

    for (const [activityId, activity] of Object.entries(activities)) {
      const targets = activity?.consumption?.targets;
      if (!Array.isArray(targets) || !targets.length) continue;

      let activityChanged = false;
      const resolvedTargets = targets.map(target => {
        const next = foundry.utils.deepClone(target);
        const resolved = resolveTarget(next.target, itemIndex);
        if (resolved !== next.target) {
          next.target = resolved;
          resolvedCount += 1;
          activityChanged = true;
          itemChanged = true;
        }
        return next;
      });

      if (activityChanged) {
        foundry.utils.setProperty(
          update,
          `system.activities.${activityId}.consumption.targets`,
          resolvedTargets
        );
      }
    }

    if (itemChanged) updates.push(update);
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  return resolvedCount;
}

export function makeJarvisItemRef(identifier) {
  return `${JARVIS_ITEM_REF_PREFIX}${slugify(identifier)}`;
}
