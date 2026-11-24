import { resolveSmartCompendiums } from "./smart-compendium.js";
const MODULE_ID = "fora-do-abismo-foundry";
export async function rehydrateLegacyOfficialItems(items=[],{notify=false}={}) {
  const result=await resolveSmartCompendiums(items);
  const count=result.report.filter(x=>x.status==="rehydrated").length;
  if(notify&&count)globalThis.ui?.notifications?.info("Jarvis: "+count+" Item(s) reutilizado(s) de compêndios.");
  return result;
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

  let isolatedAny = false;
  for (const semantic of semanticActivities) {
    const automation = semantic?.automation;
    const managesEffect = Boolean(automation?.effect || automation?.effects);
    if (!managesEffect || !semantic?._id) continue;

    const activity = itemData.system.activities[semantic._id];
    if (!activity) continue;

    activity.flags ??= {};
    activity.flags[MODULE_ID] ??= {};
    activity.flags[MODULE_ID].managedSelfEffect = true;
    isolatedAny = true;

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

  // Some Item types also carry an item-level target/range which Nik checks as
  // a fallback. Neutralise only intrinsic self metadata when at least one
  // Jarvis-managed effect Activity exists.
  if (isolatedAny) {
    if (itemData.system?.range?.units === "self") itemData.system.range.units = "any";
    if (itemData.system?.target?.affects?.type === "self") itemData.system.target.affects.type = "";
    if (itemData.system?.target?.template?.type === "self") itemData.system.target.template.type = "";
  }

  return itemData;
}
