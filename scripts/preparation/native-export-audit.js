// Offline only. Native Actor exports are evidence, never Importer V9 payloads.
const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const positive = x => typeof x === "number" && Number.isFinite(x) && x > 0;
export const SCALING_COLUMNS = ["actor_name", "actor_uuid", "dnd_size_source", "dnd_size",
  "token_width_cells", "token_height_cells", "texture_scale_x", "texture_scale_y",
  "source_export_name", "portrait_reference", "narrative_silhouette", "confirmed_by_gm", "status", "notes"];

export function auditNativeActor(actor, { fileName = "PENDENTE", confirmedByGM = false } = {}) {
  if (!obj(actor) || actor.schemaVersion || !actor.name || !["character", "npc"].includes(actor.type)
      || !obj(actor.system) || !Array.isArray(actor.items) || !Array.isArray(actor.effects)) {
    throw new Error("Esperado export nativo de Actor, com system/items/effects; não payload V9.");
  }
  const p = actor.prototypeToken ?? {}, texture = p.texture ?? {}, issues = [];
  const source = actor._stats?.exportSource ?? {};
  // Exports may intentionally omit _id. exportSource.uuid is the original identity.
  const uuid = source.uuid ?? (actor._id ? `Actor.${actor._id}` : null);
  if (!uuid) issues.push("UUID ausente");
  if (!actor.system.traits?.size) issues.push("Tamanho D&D ausente");
  for (const [key, value] of Object.entries({width:p.width, height:p.height})) {
    if (!positive(value)) issues.push(`prototypeToken.${key} ausente/inválido`);
  }
  for (const key of ["scaleX", "scaleY"]) {
    if (typeof texture[key] !== "number" || !Number.isFinite(texture[key]) || texture[key] === 0)
      issues.push(`texture.${key} ausente/inválido`);
  }
  if (!texture.src) issues.push("Textura do token ausente");
  if (!confirmedByGM) issues.push("Atualidade do export não confirmada pelo Mestre");
  const version = source.systemVersion ?? actor._stats?.systemVersion ?? null;
  if ((source.systemId ?? actor._stats?.systemId) !== "dnd5e") issues.push("Sistema D&D5e não confirmado");
  if (!String(version ?? "").startsWith("6.")) issues.push("Versão D&D5e fora da família 6.x ou ausente");
  const items = actor.items.map(i => ({id:i._id ?? null, name:i.name, type:i.type,
    uses:structuredClone(i.system?.uses ?? null),
    activities:Object.entries(i.system?.activities ?? {}).map(([id,a]) => ({id, name:a.name, type:a.type,
      activation:structuredClone(a.activation ?? null), consumption:structuredClone(a.consumption ?? null)})),
    effects:(i.effects ?? []).map(e=>({id:e._id, name:e.name, disabled:e.disabled})),
    flagNamespaces:Object.keys(i.flags ?? {})}));
  return {
    row: {actor_name:actor.name, actor_uuid:uuid ?? "PENDENTE", dnd_size_source:"system.traits.size",
      dnd_size:actor.system.traits?.size ?? "PENDENTE", token_width_cells:p.width ?? "PENDENTE",
      token_height_cells:p.height ?? "PENDENTE", texture_scale_x:texture.scaleX ?? "PENDENTE",
      texture_scale_y:texture.scaleY ?? "PENDENTE", source_export_name:fileName,
      portrait_reference:actor.img ?? "PENDENTE", narrative_silhouette:"PENDENTE",
      confirmed_by_gm:confirmedByGM, status:issues.length ? "PENDENTE" : "EXPORT_CONFERIDO",
      notes:issues.join("; ") || "Validado no export; visão e formas efetivas exigem Foundry."},
    versions:{core:source.coreVersion ?? actor._stats?.coreVersion ?? null, system:version},
    prototypeToken:structuredClone(p),
    resources:{attributes:structuredClone(actor.system.attributes ?? {}),
      resources:structuredClone(actor.system.resources ?? {}),
      classes:actor.items.filter(i=>i.type === "class").map(i=>({name:i.name, levels:i.system?.levels ?? null})), items,
      effects:actor.effects.map(e=>({id:e._id, name:e.name, disabled:e.disabled})),
      flagNamespaces:Object.keys(actor.flags ?? {})}, issues
  };
}

export function scalingCSV(rows) {
  const cell = value => {
    let s = String(value ?? "PENDENTE");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; // Spreadsheet formula injection.
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [SCALING_COLUMNS, ...rows.map(row=>SCALING_COLUMNS.map(k=>row[k]))]
    .map(row=>row.map(cell).join(",")).join("\n") + "\n";
}
