import { validateJarvisActorPayload } from "../validators/payload-validator.js";
import {
  buildGenerationDescriptor,
  resolveDocumentImage
} from "../images/image-strategy.js";
import { Dnd5eV6Adapter } from "../adapters/dnd5e-adapter.js";

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

    this.#applyActorImage(actorData);
    this.#applyItemImages(itemData);

    const actor = await Actor.create(actorData, { renderSheet: false });
    if (!actor) throw new Error("O Foundry não retornou um Actor após a criação.");

    try {
      if (itemData.length) {
        const createdItems = await actor.createEmbeddedDocuments("Item", itemData);
        if (!Array.isArray(createdItems) || createdItems.length !== itemData.length) {
          throw new Error(
            `Criação incompleta de Items: esperado ${itemData.length}, criado ${createdItems?.length ?? 0}.`
          );
        }
      }

      if (effectData.length) {
        const createdEffects = await actor.createEmbeddedDocuments("ActiveEffect", effectData);
        if (!Array.isArray(createdEffects) || createdEffects.length !== effectData.length) {
          throw new Error(
            `Criação incompleta de Active Effects: esperado ${effectData.length}, criado ${createdEffects?.length ?? 0}.`
          );
        }
      }
    } catch (error) {
      console.error("fora-do-abismo-foundry | Falha durante criação de documentos embutidos", error);
      ui.notifications?.error(`Actor ${actor.name} foi criado, mas itens/efeitos falharam. Veja o console.`);
      throw error;
    }

    ui.notifications?.info(`Jarvis Importer V9: ${actor.name} importado com sucesso.`);

    if (renderSheet) actor.sheet?.render(true);
    return actor;
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
    documentData.flags["fora-do-abismo-foundry"] ??= {};
    documentData.flags["fora-do-abismo-foundry"].imageGeneration = descriptor;
  }
}
