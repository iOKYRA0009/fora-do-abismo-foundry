import { validateJarvisActorPayload } from "../validators/payload-validator.js";
import { compileActorBlueprintV91 } from "./blueprint-v91.js";
import { inspectActorMechanics, verifyPersistedActivities } from "./mechanics-review.js";
import { reviewActorImport, reviewItemImport, findItemConflicts, itemIdentity } from "./import-review.js";
import {
  buildGenerationDescriptor,
  resolveDocumentImage
} from "../images/image-strategy.js";
import { resolveCrossItemConsumption } from "../resources/cross-item-linker.js";
import { Dnd5eV6Adapter } from "../adapters/dnd5e-adapter.js";
import {
  isolateJarvisManagedEffects,
  rehydrateLegacyOfficialItems
} from "../compat/legacy-item-rehydrator.js";
import { applyActorProgressions } from "../../progression/progression-engine.js";
import { stampActorProvenance } from "../../provenance/content-provenance.js";
import {
  DEFAULT_RULES_PROFILE,
  setActorRulesProfile
} from "../../rules/rules-profile.js";

const MODULE_ID = "fora-do-abismo-foundry";

async function verifyGrantReferences(items = []) {
  const uuids = [...new Set(items.flatMap(item => (item.jarvis?.grants ?? []).flatMap(entry => entry.uuids ?? [])))];
  if (!uuids.length) return;
  if (typeof globalThis.fromUuid !== "function") throw new Error("Foundry não disponibilizou fromUuid para validar Advancement.");
  for (const uuid of uuids) {
    const document = await globalThis.fromUuid(uuid);
    if (document?.documentName !== "Item") throw new Error(`Advancement: Item '${uuid}' não foi encontrado no compêndio.`);
  }
}

export class JarvisImporterV9 {
  previewActor(payload, options = {}) {
    return reviewActorImport(compileActorBlueprintV91(payload), options);
  }

  previewItems(actor, items) {
    return reviewItemImport(items, actor);
  }

  previewActorSync(actor, source) {
    if (!actor || actor.documentName !== "Actor") throw new Error("Selecione uma ficha válida.");
    const payload = compileActorBlueprintV91(source);
    const mechanics = inspectActorMechanics(payload);
    const errors = [...mechanics.errors];
    if (actor.type !== payload.actor.type) errors.push("O tipo da ficha selecionada não coincide com o pacote.");
    if (String(actor.name).trim().toLowerCase() !== String(payload.actor.name).trim().toLowerCase()) {
      errors.push("O nome da ficha selecionada não coincide com o pacote.");
    }
    if (findItemConflicts(payload.items ?? []).length) errors.push("O pacote contém Items duplicados.");
    const existing = Array.from(actor.items ?? []);
    const additions = [];
    const updates = [];
    for (const sourceItem of payload.items ?? []) {
      const matches = existing.filter(item => itemIdentity(item) === itemIdentity(sourceItem)
        || (item.type === sourceItem.type && String(item.name).trim().toLowerCase() === String(sourceItem.name).trim().toLowerCase()));
      if (matches.length > 1) errors.push(`${sourceItem.name}: mais de um Item correspondente na ficha.`);
      else if (!matches.length) additions.push(sourceItem.name);
      else if (!matches[0].flags?.[MODULE_ID]?.adapter) errors.push(`${sourceItem.name}: Item existente não foi importado pelo Jarvis; revisão manual necessária.`);
      else updates.push({ name: sourceItem.name, type: sourceItem.type, id: matches[0].id });
    }
    return { actor: { id: actor.id, name: actor.name, type: actor.type }, additions, updates,
      mechanics, errors, warnings: [], canImport: !errors.length,
      items: (payload.items ?? []).map(item => ({ name: item.name, type: item.type, activities: item.jarvis?.activities ?? [] })),
      protection: "Atualiza somente Activities de Items Jarvis correspondentes e adiciona Items novos. PV, recursos, condições e atributos atuais ficam preservados." };
  }

  async syncActor(actor, source) {
    if (!game.user?.isGM) throw new Error("A sincronização V9.1 exige Mestre ativo.");
    Dnd5eV6Adapter.assertRuntime();
    const payload = compileActorBlueprintV91(source);
    const review = this.previewActorSync(actor, payload);
    if (!review.canImport) throw new Error(`Sincronização bloqueada: ${review.errors.join(" ")}`);
    await verifyGrantReferences(payload.items);
    const { items: resolved } = await rehydrateLegacyOfficialItems(payload.items ?? []);
    const adapted = Dnd5eV6Adapter.adaptItems(resolved);
    this.#applyItemSemanticMetadata(adapted, resolved);
    this.#applyItemImages(adapted);
    const existingIds = new Set(Array.from(actor.items ?? [], item => item.id));
    const snapshots = [];
    const additions = [];
    try {
      for (let index = 0; index < adapted.length; index += 1) {
        const itemData = adapted[index];
        const match = review.updates.find(row => row.name === itemData.name && row.type === itemData.type);
        if (!match) { additions.push(itemData); continue; }
        const item = actor.items.get?.(match.id) ?? Array.from(actor.items ?? []).find(row => row.id === match.id);
        const previous = foundry.utils.deepClone(item.toObject?.().system?.activities ?? item.system?.activities ?? {});
        const merged = foundry.utils.deepClone(previous);
        for (const [id, incoming] of Object.entries(itemData.system?.activities ?? {})) {
          const oldId = Object.keys(merged).find(key => key === id || (merged[key]?.type === incoming.type && merged[key]?.name === incoming.name));
          const targetId = oldId ?? id;
          merged[targetId] = { ...foundry.utils.deepClone(incoming), _id: targetId,
            uses: oldId ? foundry.utils.deepClone(merged[oldId].uses ?? incoming.uses) : incoming.uses };
        }
        snapshots.push({ item, activities: previous });
        await item.update({ "system.activities": merged });
        const failures = verifyPersistedActivities([{ name: itemData.name, system: { activities: merged } }], [item]);
        if (failures.length) throw new Error(`Auditoria V9.1: ${failures.join(" ")}`);
      }
      if (additions.length) await this.#createItems(actor, additions);
      await stampActorProvenance(actor);
    } catch (error) {
      const rollbackErrors = [];
      const newIds = Array.from(actor.items ?? [], item => item.id).filter(id => id && !existingIds.has(id));
      if (newIds.length) try { await actor.deleteEmbeddedDocuments("Item", newIds); } catch (cause) { rollbackErrors.push(cause); }
      for (const snapshot of snapshots.reverse()) {
        try { await snapshot.item.update({ "system.activities": snapshot.activities }); } catch (cause) { rollbackErrors.push(cause); }
      }
      if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], `Sincronização falhou e o reparo automático foi incompleto em ${actor.name}.`);
      throw error;
    }
    return { actor: actor.name, added: additions.length, updated: review.updates.length };
  }

  async importActor(payload, { renderSheet = true } = {}) {
    payload = compileActorBlueprintV91(payload);
    validateJarvisActorPayload(payload);

    if (!game.user?.isGM) {
      throw new Error("Jarvis Importer V9 exige permissão de Mestre para criar Actors.");
    }

    Dnd5eV6Adapter.assertRuntime();
    const review = this.previewActor(payload);
    if (!review.canImport) {
      throw new Error(`Importação de '${payload.actor.name}' bloqueada: ${[...review.errors, ...review.warnings].join(" ")}`);
    }
    await verifyGrantReferences(payload.items);

    const actorData = Dnd5eV6Adapter.adaptActor(payload.actor);
    const { items: resolvedItems, report: rehydrationReport } = await rehydrateLegacyOfficialItems(
      payload.items ?? []
    );
    const itemData = Dnd5eV6Adapter.adaptItems(resolvedItems);
    const effectData = foundry.utils.deepClone(payload.effects ?? []);
    const effectivePayload = { ...payload, items: resolvedItems };

    this.#applyLayoutMetadata(actorData, itemData, effectivePayload);
    this.#applyItemSemanticMetadata(itemData, resolvedItems);
    this.#storeRehydrationSummary(actorData, rehydrationReport);
    this.#applyActorImage(actorData);
    this.#applyItemImages(itemData);

    const actor = await Actor.create(actorData, { renderSheet: false });
    if (!actor) throw new Error("O Foundry não retornou um Actor após a criação.");

    try {
      if (itemData.length) {
        const created = await this.#createItems(actor, itemData);
        const failures = verifyPersistedActivities(itemData, created);
        if (failures.length) throw new Error(`Auditoria V9.1: ${failures.join(" ")}`);
      }

      if (effectData.length) {
        const createdEffects = await actor.createEmbeddedDocuments("ActiveEffect", effectData, { keepId: true });
        if (!Array.isArray(createdEffects) || createdEffects.length !== effectData.length) {
          throw new Error(
            `Criação incompleta de Active Effects: esperado ${effectData.length}, criado ${createdEffects?.length ?? 0}.`
          );
        }
      }

      await applyActorProgressions(actor, { notify: false });
      await stampActorProvenance(actor);
      await setActorRulesProfile(
        actor,
        payload.actor?.jarvis?.rulesProfile ?? DEFAULT_RULES_PROFILE
      );
    } catch (error) {
      console.error(`${MODULE_ID} | Falha ao finalizar importação de ${actor.name}`, error);
      try {
        await actor.delete();
      } catch (rollbackError) {
        console.error(`${MODULE_ID} | Falha ao remover Actor incompleto ${actor.name}`, rollbackError);
        const message = `Jarvis: a importação de ${actor.name} falhou e o Actor incompleto não pôde ser removido. Remova-o manualmente; detalhes no console.`;
        ui.notifications?.error(message);
        throw new AggregateError([error, rollbackError], message);
      }
      ui.notifications?.error(`Jarvis: a importação de ${actor.name} falhou. O Actor recém-criado foi removido; detalhes no console.`);
      throw error;
    }

    const hydrated = rehydrationReport.filter(entry => entry.status === "rehydrated").length;
    const unresolved = rehydrationReport.filter(entry => entry.status === "unresolved");
    if (hydrated) {
      console.log(`${MODULE_ID} | ${actor.name}: ${hydrated} Item(s) oficial(is) reidratado(s) para D&D5e ${game.system?.version}.`);
    }
    if (unresolved.length) {
      console.warn(`${MODULE_ID} | ${actor.name}: fontes oficiais não resolvidas foram preservadas.`, unresolved);
    }

    ui.notifications?.info(`Jarvis Importer V9: ${actor.name} importado com sucesso.`);

    if (renderSheet) actor.sheet?.render(true);
    return actor;
  }

  async importItems(actor, sourceItems = [], { sourceLabel = "Jarvis Progression" } = {}) {
    if (!game.user?.isGM) {
      throw new Error("Jarvis Importer V9 exige permissão de Mestre para criar Items.");
    }
    if (!actor || actor.documentName !== "Actor") {
      throw new Error("importItems exige um Actor válido.");
    }
    if (!Array.isArray(sourceItems) || !sourceItems.length) return [];

    Dnd5eV6Adapter.assertRuntime();
    const review = this.previewItems(actor, sourceItems);
    if (!review.canImport) {
      throw new Error(`Importação de Items em '${actor.name}' bloqueada: ${review.warnings.join(" ")}`);
    }

    const { items: resolvedItems, report } = await rehydrateLegacyOfficialItems(sourceItems);
    const itemData = Dnd5eV6Adapter.adaptItems(resolvedItems);
    this.#applyItemSemanticMetadata(itemData, resolvedItems);
    this.#applyItemImages(itemData);

    const existingIds = new Set(Array.from(actor.items ?? [], item => item.id));
    let created;
    try {
      created = await this.#createItems(actor, itemData);
      await stampActorProvenance(actor);
    } catch (error) {
      const newIds = Array.from(actor.items ?? [], item => item.id).filter(id => id && !existingIds.has(id));
      if (newIds.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", newIds);
        } catch (rollbackError) {
          const message = `Jarvis: a importação de Items em ${actor.name} falhou e ${newIds.length} Item(s) incompleto(s) não puderam ser removidos. Revise a ficha.`;
          ui.notifications?.error(message);
          throw new AggregateError([error, rollbackError], message);
        }
      }
      throw error;
    }

    const hydrated = report.filter(entry => entry.status === "rehydrated").length;
    if (hydrated) {
      console.log(`${MODULE_ID} | ${sourceLabel}: ${hydrated} Item(s) oficial(is) reidratado(s).`);
    }
    console.log(`${MODULE_ID} | ${sourceLabel}: ${created.length} Item(s) criado(s) em ${actor.name}.`);
    return created;
  }

  async importFromJson(jsonText, options = {}) {
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`JSON inválido: ${error.message}`);
    }

    return this.importActor(payload, options);
  }

  async #createItems(actor, itemData) {
    const createdItems = await actor.createEmbeddedDocuments("Item", itemData, { keepId: true });
    if (!Array.isArray(createdItems) || createdItems.length !== itemData.length) {
      throw new Error(
        `Criação incompleta de Items: esperado ${itemData.length}, criado ${createdItems?.length ?? 0}.`
      );
    }

    await resolveCrossItemConsumption(actor, createdItems);
    return createdItems;
  }

  #applyLayoutMetadata(actorData, items, payload) {
    const actorSemantic = payload.actor?.jarvis ?? {};
    const sourceItems = payload.items ?? [];
    const hasOrganization = sourceItems.some(item => item?.jarvis?.organization);
    const layout = actorSemantic.featuresLayout ?? (hasOrganization ? "hybrid" : null);

    if (layout) {
      actorData.flags ??= {};
      actorData.flags[MODULE_ID] ??= {};
      actorData.flags[MODULE_ID].featuresLayout = String(layout);
    }

    items.forEach((item, index) => {
      const organization = sourceItems[index]?.jarvis?.organization;
      if (!organization) return;

      item.flags ??= {};
      item.flags[MODULE_ID] ??= {};
      item.flags[MODULE_ID].organization = foundry.utils.deepClone(organization);
    });
  }

  #applyItemSemanticMetadata(items, sourceItems) {
    items.forEach((item, index) => {
      const semantic = sourceItems[index]?.jarvis ?? {};
      item.flags ??= {};
      item.flags[MODULE_ID] ??= {};

      if (semantic.organization) {
        item.flags[MODULE_ID].organization = foundry.utils.deepClone(semantic.organization);
      }

      if (semantic.provenance) {
        item.flags[MODULE_ID].provenanceInput = foundry.utils.deepClone(semantic.provenance);
      }

      if (Array.isArray(semantic.progression) && semantic.progression.length) {
        item.flags[MODULE_ID].progression = foundry.utils.deepClone(semantic.progression);
      }

      const semanticActivities = Array.isArray(semantic.activities) ? semantic.activities : [];
      for (const activity of semanticActivities) {
        if (!activity?.automation) continue;
        if (!activity._id) {
          throw new Error(`Activity '${activity.name ?? "sem nome"}' em '${item.name}' usa automation e precisa de _id explícito.`);
        }

        const built = item.system?.activities?.[activity._id];
        if (!built) {
          throw new Error(`Activity '${activity._id}' de '${item.name}' não foi encontrada após adaptação.`);
        }

        built.flags ??= {};
        built.flags[MODULE_ID] ??= {};
        built.flags[MODULE_ID].automation = foundry.utils.deepClone(activity.automation);
      }

      // Jarvis effect Activities are self-buffs handled by our D&D5e 6.x
      // Effect Engine. Keep third-party self-effect helpers from applying the
      // same Item effects a second time.
      isolateJarvisManagedEffects(item, semanticActivities);
    });
  }

  #storeRehydrationSummary(actorData, report = []) {
    const hydrated = report.filter(entry => entry.status === "rehydrated");
    const unresolved = report.filter(entry => entry.status === "unresolved");
    if (!hydrated.length && !unresolved.length) return;

    actorData.flags ??= {};
    actorData.flags[MODULE_ID] ??= {};
    actorData.flags[MODULE_ID].rehydration = {
      systemVersion: game.system?.version ?? null,
      hydrated: hydrated.map(entry => ({ name: entry.name, uuid: entry.uuid })),
      unresolved: unresolved.map(entry => ({ name: entry.name, uuid: entry.uuid }))
    };
  }

  #applyActorImage(actorData) {
    const strategy = actorData.imgStrategy;

    if (!actorData.img || strategy?.source) {
      actorData.img = resolveDocumentImage(actorData, strategy, { kind: "actor" });
    }

    const descriptor = buildGenerationDescriptor(actorData, strategy, { kind: "actor" });
    if (descriptor) this.#storeGenerationDescriptor(actorData, descriptor);

    delete actorData.imgStrategy;
  }

  #applyItemImages(items) {
    for (const item of items) {
      const strategy = item.imgStrategy;

      if (!item.img || strategy?.source) {
        item.img = resolveDocumentImage(item, strategy, { kind: "item" });
      }

      const descriptor = buildGenerationDescriptor(item, strategy, { kind: "item" });
      if (descriptor) this.#storeGenerationDescriptor(item, descriptor);

      delete item.imgStrategy;
    }
  }

  #storeGenerationDescriptor(documentData, descriptor) {
    documentData.flags ??= {};
    documentData.flags[MODULE_ID] ??= {};
    documentData.flags[MODULE_ID].imageGeneration = descriptor;
  }
}
