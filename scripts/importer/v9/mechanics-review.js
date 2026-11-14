const activitiesOf = item => item?.system?.activities ?? {};
const persistedActivity = (item, id) => {
  const prepared = activitiesOf(item);
  return prepared?.get?.(id) ?? prepared?.[id] ?? null;
};
const semanticActivitiesOf = item => item?.jarvis?.activities ?? Object.values(activitiesOf(item));
const asArray = value => Array.isArray(value) ? value : value instanceof Set ? [...value] : value ? [value] : [];

export function matchCreatedItems(expectedItems, createdItems) {
  const created = Array.from(createdItems ?? []);
  const used = new Set();
  return expectedItems.map((expected, index) => {
    const id = expected._id ?? expected.id;
    let actual = id && created.find(item => !used.has(item) && (item?.id ?? item?._id) === id);
    const identifier = expected.system?.identifier;
    if (!actual && !id && identifier) {
      actual = created.find(item => !used.has(item) && item?.type === expected.type
        && (item?.system?.identifier ?? item?._source?.system?.identifier) === identifier);
    }
    if (!actual && !id && expected.name && expected.type) {
      actual = created.find(item => !used.has(item)
        && item?.type === expected.type
        && [item?.name, item?._source?.name, item?.toObject?.().name].includes(expected.name));
    }
    // Synchronization audits one existing Item; its incoming type can differ from the old document.
    if (!actual && !id && expectedItems.length === 1 && created.length === 1) actual = created[0];
    // Small document doubles in tests may omit the identifying fields.
    if (!actual && !id && !expected.type && !created[index]?.name) actual = created[index];
    if (actual) used.add(actual);
    return { expected, actual };
  });
}

/** Re-save only Activities omitted by the document creation/update pipeline. */
export async function restoreMissingActivities(expectedItems, createdItems) {
  for (const { expected, actual } of matchCreatedItems(expectedItems, createdItems)) {
    if (!actual?.update) continue;
    const missing = Object.entries(activitiesOf(expected))
      .filter(([id]) => !persistedActivity(actual, id));
    if (!missing.length) continue;
    const changes = Object.fromEntries(missing.map(([id, activity]) =>
      [`system.activities.${id}`, activity]));
    await actual.update(changes);
  }
}

function scenarioResult(scenario, activity) {
  const die = Number(scenario.d20);
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error("d20 deve estar entre 1 e 20.");
  if (scenario.kind === "attack") {
    if (scenario.targetAC === undefined || scenario.targetAC === null) throw new Error("targetAC é obrigatório.");
    const ac = Number(scenario.targetAC);
    if (!Number.isFinite(ac) || ac < 1) throw new Error("targetAC deve ser uma CA positiva.");
    const bonus = activity.attack?.flat ? Number(activity.attack?.bonus) : Number(scenario.modifier);
    if (!Number.isFinite(bonus)) throw new Error("modifier é obrigatório quando o ataque usa atributo e proficiência.");
    return { total: die + bonus, target: ac, outcome: die === 20 ? "hit" : die === 1 ? "miss" : die + bonus >= ac ? "hit" : "miss" };
  }
  if (scenario.kind === "save" || scenario.kind === "check") {
    if (scenario.modifier === undefined || scenario.modifier === null) throw new Error("modifier é obrigatório.");
    const dc = Number(activity[scenario.kind]?.dc?.formula);
    const modifier = Number(scenario.modifier);
    if (!Number.isFinite(dc) || !Number.isFinite(modifier)) throw new Error("CD numérica e modifier são obrigatórios.");
    return { total: die + modifier, target: dc, outcome: die + modifier >= dc ? "success" : "failure" };
  }
  throw new Error("kind deve ser attack, save ou check.");
}

export function inspectActorMechanics(payload) {
  const errors = [];
  const checks = [];
  const actions = (payload.items ?? []).flatMap(item => semanticActivitiesOf(item).map(activity => ({ item: item.name, activity })));
  if (payload.compilerVersion === "9.1") {
    for (const { item, activity } of actions) {
      const label = `${item} / ${activity.name ?? activity.type}`;
      if (activity.type === "attack" && !activity.damage?.parts?.length) errors.push(`${label}: ataque sem dano.`);
      if (activity.type === "save" && (!asArray(activity.save?.ability).length || !activity.save?.dc?.formula)) {
        errors.push(`${label}: salvaguarda sem atributo ou CD.`);
      }
      if (activity.type === "check" && (!activity.check?.ability || !activity.check?.dc?.formula)) {
        errors.push(`${label}: teste sem atributo ou CD.`);
      }
    }
  }
  if (payload.scenarios !== undefined && !Array.isArray(payload.scenarios)) errors.push("scenarios deve ser uma lista.");
  for (const [index, scenario] of (Array.isArray(payload.scenarios) ? payload.scenarios : []).entries()) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      errors.push(`scenarios[${index}]: informe um objeto de ensaio.`);
      continue;
    }
    const entry = actions.find(row => row.activity.name === scenario.action && row.activity.type === scenario.kind);
    if (!entry) { errors.push(`scenarios[${index}]: ação '${scenario.action}' não encontrada.`); continue; }
    try {
      const result = scenarioResult(scenario, entry.activity);
      checks.push({ action: scenario.action, kind: scenario.kind, d20: scenario.d20, ...result });
      if (scenario.expected && scenario.expected !== result.outcome) {
        errors.push(`scenarios[${index}]: esperado '${scenario.expected}', calculado '${result.outcome}' (${result.total} contra ${result.target}).`);
      }
    } catch (error) { errors.push(`scenarios[${index}]: ${error.message}`); }
  }
  return { actions: actions.length, checks, errors, passed: !errors.length };
}

/** Detect native Activity fields lost during Foundry's document preparation. */
export function verifyPersistedActivities(expectedItems, createdItems) {
  const failures = [];
  const damage = (value, id) => (value?.parts ?? []).map(part => ({
    formula: String(part?.custom?.enabled ? part?.custom?.formula : part?.bonus ?? ""),
    types: asArray(part?.types).sort().join(",")
  }));
  for (const { expected, actual } of matchCreatedItems(expectedItems, createdItems)) {
    if (!actual) {
      failures.push(`${expected.name}: Item criado não foi encontrado para auditoria das Activities.`);
      continue;
    }
    if (!actual.system?.activities) {
      if (Object.keys(activitiesOf(expected)).length) {
        failures.push(`${expected.name}: o Item criado não expõe Activities para auditoria.`);
      }
      continue;
    }
    for (const [id, activity] of Object.entries(activitiesOf(expected))) {
      const persisted = persistedActivity(actual, id);
      if (!persisted) { failures.push(`${expected.name}: Activity ${id} não foi gravada.`); continue; }
      if (persisted.type !== activity.type) failures.push(`${expected.name}: tipo da Activity ${id} mudou.`);
      if (String(persisted.description?.value ?? "") !== String(activity.description?.value ?? "")) {
        failures.push(`${expected.name}: descrição individual da Activity ${id} não foi gravada.`);
      }
      if (activity.type === "attack" && (String(persisted.attack?.bonus ?? "") !== String(activity.attack?.bonus ?? "")
        || String(persisted.attack?.ability ?? "") !== String(activity.attack?.ability ?? "")
        || Boolean(persisted.attack?.flat) !== Boolean(activity.attack?.flat))) failures.push(`${expected.name}: bônus ou atributo de ataque mudou.`);
      if (activity.type === "save" && (String(persisted.save?.dc?.formula ?? "") !== String(activity.save?.dc?.formula ?? "")
        || JSON.stringify(asArray(persisted.save?.ability).sort()) !== JSON.stringify(asArray(activity.save?.ability).sort()))) {
        failures.push(`${expected.name}: CD ou atributo da salvaguarda mudou.`);
      }
      if (activity.type === "save" && persisted.damage?.onSave !== activity.damage?.onSave) {
        failures.push(`${expected.name}: efeito de sucesso na salvaguarda mudou.`);
      }
      if (["attack", "save", "damage"].includes(activity.type)
        && JSON.stringify(damage(persisted.damage, id)) !== JSON.stringify(damage(activity.damage, id))) {
        failures.push(`${expected.name}: fórmula ou tipo do dano mudou.`);
      }
      if (activity.type === "check" && (String(persisted.check?.ability ?? "") !== String(activity.check?.ability ?? "")
        || String(persisted.check?.dc?.formula ?? "") !== String(activity.check?.dc?.formula ?? ""))) {
        failures.push(`${expected.name}: atributo ou CD do teste mudou.`);
      }
      if (activity.type === "heal" && String(persisted.healing?.custom?.formula ?? "") !== String(activity.healing?.custom?.formula ?? "")) {
        failures.push(`${expected.name}: fórmula da cura mudou.`);
      }
      if (activity.type === "teleport" && String(persisted.teleport?.value ?? "") !== String(activity.teleport?.value ?? "")) {
        failures.push(`${expected.name}: distância do teletransporte mudou.`);
      }
    }
  }
  return failures;
}
