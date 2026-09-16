import { validateJarvisActorPayload } from "../validators/payload-validator.js";
import {
  buildGenerationDescriptor,
  resolveDocumentImage
} from "../images/image-strategy.js";
import { resolveCrossItemConsumption } from "../resources/cross-item-linker.js";
import { Dnd5eV6Adapter } from "../adapters/dnd5e-adapter.js";
import { applyActorProgressions } from "../../progression/progression-engine.js";

const MODULE_ID = "fora-do-abismo-foundry";

export class JarvisImporterV9 {
  async importActor(payload, { renderSheet = true } = {}) {
    validateJarvisActorPayload(payload);

    if (!game.user?.isGM) {
      throw new Error("Jarvis Importer V9 exige permissão de Mestre para criar Actors.");
    }

    Dnd5eV6Adapter.assertRuntime();

    const actorData = Dnd5eV6Adapter.adaptActor(payload.actor);
    const itemData = Dnd5eV6Adapter.adaptItems(payload.items ?? []);
    const effectData = foundry.utils.deepClone(payload.effects ?? []);

    this.#applyLayoutMetadata(actorData, itemData, payload);
    this.#applyItemSemanticMetadata(itemData, payload.items ?? []);
    this.#applyActorImage(actorData);
    this.#applyItemImages(itemData);

    const actor = await Actor.create(actorData, { renderSheet: false });
    if (!actor) throw new Error("O Foundry não retornou um Actor após a criação.");

    try {
      if (itemData.length) {
        await this.#createItems(actor, itemData);
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
    } catch (error) {
      console.error("fora-do-abismo-foundry | Falha durante criação de documentos embutidos", error);
      ui.notifications?.error(`Actor ${actor.name} foi criado, mas itens/efeitos/progressão falharam. Veja o console.`);
      throw error;
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

    const itemData = Dnd5eV6Adapter.adaptItems(sourceItems);
    this.#applyItemSemanticMetadata(itemData, sourceItems);
    this.#applyItemImages(itemData);

    const created = await this.#createItems(actor, itemData);
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
    });
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
