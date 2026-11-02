// Cole como Macro Script no mundo de HOMOLOGAÇÃO. Leitura apenas, sem ChatMessage ou upload.
// Preencha IDs do mundo de teste somente se quiser conferir Actors específicos.
(() => {
  if (!game.user?.isGM) throw new Error("Diagnóstico restrito ao Mestre.");
  const actorIds = [];
  const optional = ["midi-qol", "dae", "visage", "metamorph", "fxmaster", "sequencer"];
  const jarvis = game.modules.get("fora-do-abismo-foundry");
  const report = {
    worldId:game.world?.id, foundry:game.version,
    system:{id:game.system.id,version:game.system.version},
    jarvis:{active:jarvis?.active ?? false,version:jarvis?.version ?? null,apiKeys:Object.keys(jarvis?.api ?? {})},
    modules:optional.map(id=>({id,active:game.modules.get(id)?.active ?? false,version:game.modules.get(id)?.version ?? null})),
    actors:actorIds.map(id=>{
      const a=game.actors.get(id);
      return a ? {id,uuid:a.uuid,name:a.name,size:a.system.traits?.size,prototypeToken:a.prototypeToken.toObject()}
        : {id,status:"NÃO ENCONTRADO"};
    })
  };
  console.info("Jarvis M00 — diagnóstico somente leitura (GM)",report);
  ui.notifications.info("Diagnóstico disponível no console deste navegador; nenhum documento alterado.");
  return report;
})();
