import { validateJarvisActorPayload } from "../importer/validators/payload-validator.js";
import { Dnd5eV6Adapter } from "../importer/adapters/dnd5e-adapter.js";

function get(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); }

/** Compare explicit source fields with an existing Actor. Read-only; derived dnd5e values are excluded. */
export function compareActorToPayload(payload, actor) {
  validateJarvisActorPayload(payload);
  if (!actor || actor.documentName !== "Actor") throw new Error("Equivalência: informe um Actor válido.");
  const expected = Dnd5eV6Adapter.adaptActor(payload.actor);
  const actual = typeof actor.toObject === "function" ? actor.toObject() : actor;
  const paths = ["name", "type"];
  const semantic = payload.actor.jarvis ?? {};
  for (const key of Object.keys(semantic.abilities ?? {})) {
    paths.push(`system.abilities.${key}.value`);
    if (typeof semantic.abilities[key] === "object" && semantic.abilities[key]?.proficient !== undefined) {
      paths.push(`system.abilities.${key}.proficient`);
    }
  }
  for (const key of Object.keys(semantic.hp ?? {})) paths.push(`system.attributes.hp.${key}`);
  for (const key of Object.keys(semantic.skills ?? {})) paths.push(`system.skills.${key}.value`);
  for (const key of Object.keys(semantic.resources ?? {})) {
    if (!["primary", "secondary", "tertiary"].includes(key)) continue;
    for (const field of ["label", "value", "max"]) {
      if (semantic.resources[key]?.[field] !== undefined) paths.push(`system.resources.${key}.${field}`);
    }
  }
  const differences = [];
  const matches = [];
  for (const path of new Set(paths)) {
    const wanted = get(expected, path);
    const found = get(actual, path);
    if (wanted === undefined) continue;
    if (String(wanted) === String(found)) matches.push(path);
    else differences.push({ path, expected: wanted, actual: found ?? null });
  }
  const actorItems = Array.from(actor.items?.contents ?? actual.items ?? []);
  const missingItems = (payload.items ?? []).filter(source =>
    !actorItems.some(item => item.name === source.name && item.type === source.type)
  ).map(item => ({ name: item.name, type: item.type }));
  return {
    actorId: actor.id ?? null, actorName: actor.name ?? actual.name,
    mode: "read-only", matchedFields: matches.length, differences, missingItems,
    note: "PV atuais podem ter mudado em jogo; nomes de itens oficiais reidratados podem mudar no compêndio. Revise diferenças antes de corrigir.",
    ok: differences.length === 0 && missingItems.length === 0
  };
}
