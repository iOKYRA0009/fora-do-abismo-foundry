const MODULE_ID = "fora-do-abismo-foundry";

function slugify(value = "entry") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "entry";
}

function getProgression(item) {
  const progression = item?.getFlag(MODULE_ID, "progression");
  return Array.isArray(progression) ? progression : [];
}

function getEffectiveLevel(item) {
  if (!item?.actor) return 0;
  if (item.type === "class") return Number(item.system?.levels ?? 0);

  if (item.type === "subclass") {
    const classIdentifier = item.system?.classIdentifier;
    if (!classIdentifier) return 0;
    const parentClass = item.actor.items.find(candidate =>
      candidate.type === "class" && candidate.system?.identifier === classIdentifier
    );
    return Number(parentClass?.system?.levels ?? 0);
  }

  return 0;
}

function entryId(entry, index) {
  if (entry?.id) return slugify(entry.id);
  const names = (entry?.grants ?? []).map(grant => grant?.jarvis?.identifier ?? grant?.system?.identifier ?? grant?.name ?? "item");
  return slugify(`${entry?.level ?? 0}-${index}-${names.join("-")}`);
}

function findExistingGrant(actor, template) {
  const identifier = template?.jarvis?.identifier ?? template?.system?.identifier;
  if (identifier) {
    const key = slugify(identifier);
    const byIdentifier = actor.items.find(item => slugify(item.system?.identifier ?? "") === key);
    if (byIdentifier) return byIdentifier;
  }

  const name = String(template?.name ?? "").trim().toLowerCase();
  const type = template?.type;
  if (!name) return null;
  return actor.items.find(item => item.type === type && String(item.name ?? "").trim().toLowerCase() === name) ?? null;
}

async function markEntriesGranted(item, granted) {
  const current = item.getFlag(MODULE_ID, "progressionState") ?? {};
  await item.setFlag(MODULE_ID, "progressionState", {
    ...current,
    granted: [...new Set(granted)]
  });
}

export async function applyItemProgression(item, { notify = false } = {}) {
  if (!item?.actor || !["class", "subclass"].includes(item.type)) return 0;

  const progression = getProgression(item);
  if (!progression.length) return 0;

  const level = getEffectiveLevel(item);
  if (!Number.isFinite(level) || level <= 0) return 0;

  const state = item.getFlag(MODULE_ID, "progressionState") ?? {};
  const granted = new Set(Array.isArray(state.granted) ? state.granted : []);
  const importer = game.modules.get(MODULE_ID)?.api?.importer;
  if (!importer?.importItems) {
    throw new Error("Jarvis Progression não encontrou importer.importItems.");
  }

  let createdCount = 0;
  let stateChanged = false;

  for (let index = 0; index < progression.length; index += 1) {
    const entry = progression[index];
    const requiredLevel = Number(entry?.level ?? 0);
    if (!Number.isFinite(requiredLevel) || requiredLevel <= 0 || requiredLevel > level) continue;

    const id = entryId(entry, index);
    if (granted.has(id)) continue;

    const grants = Array.isArray(entry.grants) ? entry.grants : [];
    const missing = grants.filter(template => !findExistingGrant(item.actor, template));

    if (missing.length) {
      const created = await importer.importItems(item.actor, missing, {
        sourceLabel: `${item.name} nível ${requiredLevel}`
      });
      createdCount += created.length;
    }

    granted.add(id);
    stateChanged = true;

    if (notify && (grants.length || entry.note)) {
      const suffix = entry.note ? ` — ${entry.note}` : "";
      ui.notifications?.info(`${item.name}: progressão de nível ${requiredLevel} aplicada${suffix}.`);
    }
  }

  if (stateChanged) await markEntriesGranted(item, [...granted]);
  return createdCount;
}

export async function applyActorProgressions(actor, options = {}) {
  if (!actor) return 0;
  let created = 0;

  for (const item of actor.items.filter(candidate => ["class", "subclass"].includes(candidate.type))) {
    created += await applyItemProgression(item, options);
  }

  return created;
}

export function registerProgressionEngine() {
  Hooks.on("updateItem", (item, changes) => {
    if (item?.type !== "class" || !item.actor) return;

    const changedLevels = Object.prototype.hasOwnProperty.call(changes, "system.levels")
      || foundry.utils.hasProperty(changes, "system.levels");
    if (!changedLevels) return;

    void (async () => {
      try {
        await applyItemProgression(item, { notify: true });
        const identifier = item.system?.identifier;
        const subclasses = item.actor.items.filter(candidate =>
          candidate.type === "subclass" && candidate.system?.classIdentifier === identifier
        );
        for (const subclass of subclasses) {
          await applyItemProgression(subclass, { notify: true });
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Falha na progressão automática`, error);
        ui.notifications?.error(`Jarvis Progression: falha ao processar ${item.name}. Veja o console.`);
      }
    })();
  });
}
