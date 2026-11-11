const MODULE_ID = "fora-do-abismo-foundry";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

export function privateActivityDescription(activity) {
  const given = activity?.description;
  if (typeof given === "string" && given.trim()) return given;
  if (typeof given?.value === "string" && given.value.trim()) return given.value;
  const label = String(activity?.name || "Habilidade").trim();
  return `<p>${escapeHtml(label)}</p>`;
}

export function sharedItemDescription(activity, itemDescription, activityCount) {
  const value = String(activity?.description?.value ?? "").trim();
  const parent = String(itemDescription ?? "").trim();
  return Boolean(value && parent && value === parent && (activityCount > 1 || parent.length > 500));
}

/** Audit before touching an existing actor. Only Jarvis-imported items qualify. */
export function previewActivityChatRepair(actor) {
  if (!actor || actor.documentName !== "Actor") throw new Error("Selecione uma ficha válida.");
  const fixes = [];
  for (const item of Array.from(actor.items ?? [])) {
    if (!item.flags?.[MODULE_ID]?.adapter) continue;
    const activities = Object.entries(item.toObject?.().system?.activities ?? item.system?.activities ?? {});
    for (const [id, activity] of activities) {
      if (String(activity?.description?.value ?? "").trim()
        && !sharedItemDescription(activity, item.system?.description?.value, activities.length)) continue;
      fixes.push({ itemId: item.id, item: item.name, activityId: id,
        activity: activity?.name || activity?.type || "Habilidade",
        description: `<p>${escapeHtml(activity?.name || activity?.type || "Habilidade")}</p>` });
    }
  }
  return { actor: actor.name, fixes };
}

export async function repairActivityChatDescriptions(actor) {
  if (!globalThis.game?.user?.isGM) throw new Error("A correção de descrições exige Mestre ativo.");
  const report = previewActivityChatRepair(actor);
  for (const fix of report.fixes) {
    const item = actor.items.get?.(fix.itemId) ?? Array.from(actor.items ?? []).find(row => row.id === fix.itemId);
    if (!item) throw new Error(`Item '${fix.item}' desapareceu durante o reparo.`);
    await item.update({ [`system.activities.${fix.activityId}.description.value`]: fix.description });
  }
  return report;
}
