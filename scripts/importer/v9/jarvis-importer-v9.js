import { validateJarvisActorPayload } from "../validators/payload-validator.js";

export class JarvisImporterV9 {
  async importActor(payload, { renderSheet = true } = {}) {
    validateJarvisActorPayload(payload);

    if (!game.user?.isGM) {
      throw new Error("Jarvis Importer V9 exige permissão de Mestre para criar Actors.");
    }

    if (game.system?.id !== "dnd5e") {
      throw new Error(`Sistema incompatível: ${game.system?.id ?? "desconhecido"}. Esperado: dnd5e.`);
    }

    const actorData = foundry.utils.deepClone(payload.actor);
    const itemData = foundry.utils.deepClone(payload.items ?? []);
    const effectData = foundry.utils.deepClone(payload.effects ?? []);

    const actor = await Actor.create(actorData, { renderSheet: false });
    if (!actor) throw new Error("O Foundry não retornou um Actor após a criação.");

    try {
      if (itemData.length) {
        await actor.createEmbeddedDocuments("Item", itemData);
      }

      if (effectData.length) {
        await actor.createEmbeddedDocuments("ActiveEffect", effectData);
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
}
