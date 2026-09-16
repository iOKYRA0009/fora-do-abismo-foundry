const MODULE_ID = "fora-do-abismo-foundry";

const CURRENT_SYSTEM_PREFIX = "Compendium.dnd5e.";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function asSourceUuid(item = {}) {
  const candidates = [
    item?._stats?.compendiumSource,
    item?.flags?.dnd5e?.sourceId,
    item?.system?.source?.uuid
  ];
  return candidates.find(value => typeof value === "string" && value.startsWith(CURRENT_SYSTEM_PREFIX)) ?? null;
}

function isGenericImage(path = "") {
  const value = String(path ?? "");
  return !value
    || value.startsWith("icons/svg/")
    || value.includes("/icons/svg/items/")
    || value.endsWith("/feature.svg")
    || value.endsWith("/equipment.svg")
    || value.endsWith("/spell.svg");
}

function copyPath(target, source, path) {
  const value = foundry.utils.getProperty(source, path);
  if (value === undefined) return;
  foundry.utils.setProperty(target, path, clone(value));
}

function overlayCharacterState(current, source) {
  const out = clone(current);

  // Keep stable IDs because activities/resources in the same payload can refer
  // to embedded documents by ID after import.
  if (source._id) out._id = source._id;
  if (source.name) out.name = source.name;
  if (source.sort !== undefined) out.sort = source.sort;

  // Preserve a deliberate campaign/custom image, but prefer the current-system
  // compendium image over old generic placeholders.
  if (source.img && !isGenericImage(source.img)) out.img = source.img;

  // Only mutable character state is overlaid. Rules, Activities, Advancements
  // and Active Effects come from the current D&D5e 6.x compendium document.
  const statePaths = [
    "system.quantity",
    "system.equipped",
    "system.attuned",
    "system.identified",
    "system.container",
    "system.uses.spent",
    "system.prepared"
  ];
  for (const path of statePaths) copyPath(out, source, path);

  // Preserve Jarvis semantic metadata. Third-party automation flags from old
  // exports are intentionally not carried into a freshly rehydrated official
  // document.
  if (source.jarvis) out.jarvis = clone(source.jarvis);
  out.flags ??= {};
  if (source.flags?.[MODULE_ID]) out.flags[MODULE_ID] = clone(source.flags[MODULE_ID]);

  return out;
}

const uuidCache = new Map();

async function resolveCurrentDocument(uuid) {
  if (!uuid) return null;
  if (uuidCache.has(uuid)) return uuidCache.get(uuid);

  let document = null;
  try {
    document = await fromUuid(uuid, { strict: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Falha ao resolver compendiumSource '${uuid}'.`, error);
  }

  uuidCache.set(uuid, document ?? null);
  return document ?? null;
}

/**
 * Replace serialized official D&D5e documents from old Actor exports with the
 * current implementation from the installed D&D5e system whenever the exact
 * compendium source can still be resolved.
 *
 * Homebrew and manually recreated official content are left untouched.
 */
export async function rehydrateLegacyOfficialItems(items = [], { notify = false } = {}) {
  if (!Array.isArray(items) || !items.length) return { items: [], report: [] };

  const report = [];
  const resolved = [];

  for (const source of items) {
    const sourceVersion = String(source?._stats?.systemVersion ?? "");
    const currentVersion = String(game.system?.version ?? "");

    // Fresh documents built from the current system (including class/subclass
    // templates customized by a Jarvis macro) must not be replaced again.
    if (!sourceVersion || sourceVersion === currentVersion) {
      resolved.push(clone(source));
      continue;
    }

    const uuid = asSourceUuid(source);
    if (!uuid) {
      resolved.push(clone(source));
      continue;
    }

    const currentDocument = await resolveCurrentDocument(uuid);
    if (!currentDocument || currentDocument.documentName !== "Item" || currentDocument.type !== source.type) {
      resolved.push(clone(source));
      report.push({
        name: source.name,
        uuid,
        status: "unresolved",
        reason: "A fonte oficial não pôde ser resolvida na instalação atual; o Item original foi preservado."
      });
      continue;
    }

    const hydrated = overlayCharacterState(currentDocument.toObject(), source);
    resolved.push(hydrated);
    report.push({
      name: source.name,
      uuid,
      status: "rehydrated",
      sourceSystemVersion: source?._stats?.systemVersion ?? null,
      currentSystemVersion: game.system?.version ?? null
    });
  }

  const count = report.filter(entry => entry.status === "rehydrated").length;
  if (notify && count) {
    ui.notifications?.info(`Jarvis: ${count} Item(s) oficial(is) reidratado(s) para D&D5e ${game.system?.version ?? "atual"}.`);
  }

  return { items: resolved, report };
}

/**
 * Nik's DnD5e Tweaks' Self Effect Application treats any Activity with
 * self-target metadata as its responsibility and, when no Activity effect is
 * linked, falls back to every non-transfer Active Effect on the parent Item.
 *
 * Jarvis-managed effect Activities already apply their own embedded effect via
 * the D&D5e 6.x pipeline. Neutralising UI target metadata prevents a second
 * third-party application without changing the Jarvis target (which is always
 * activity.item.actor for these self buffs).
 */
export function isolateJarvisManagedEffects(itemData, semanticActivities = []) {
  if (!itemData?.system?.activities || !Array.isArray(semanticActivities)) return itemData;

  for (const semantic of semanticActivities) {
    const automation = semantic?.automation;
    const managesEffect = Boolean(automation?.effect || automation?.effects);
    if (!managesEffect || !semantic?._id) continue;

    const activity = itemData.system.activities[semantic._id];
    if (!activity) continue;

    activity.flags ??= {};
    activity.flags[MODULE_ID] ??= {};
    activity.flags[MODULE_ID].managedSelfEffect = true;

    activity.range ??= {};
    activity.range.value = "";
    activity.range.units = "any";
    activity.range.special ??= "";
    activity.range.override = true;

    activity.target ??= {};
    activity.target.prompt = false;
    activity.target.override = true;
    activity.target.affects ??= {};
    activity.target.affects.count = "";
    activity.target.affects.type = "";
    activity.target.affects.choice = false;
    activity.target.affects.special ??= "";
    activity.target.template ??= {};
    activity.target.template.type = "";
    activity.target.template.count ??= "";
    activity.target.template.contiguous = false;
    activity.target.template.stationary = false;
    activity.target.template.units ??= "ft";
  }

  return itemData;
}
