# Alpha 15 — Jack Engine

Esta versão adiciona a infraestrutura específica necessária para a ficha de Jack Ebonhart sem depender de módulos terceiros.

- Active Effects Jarvis podem ser aplicados a Actors alvo selecionados.
- Coleta de Almas pode sincronizar automaticamente Ecos do Underdark.
- Ao cair de PV positivo para 0, Jack perde metade das Almas acumuladas.
- Fome de Orcus é detectada no primeiro ataque acertado do turno quando Jack possui 25+ Almas.
- Eldritch Blast aciona Raízes do Vazio uma vez por turno.
- 20 natural em Eldritch Blast aciona Florescimento do Vazio.
- A API expõe `api.jack.syncActor(actor)` e `api.jack.getSoulStatus(actor)`.

O motor só atua em Actors explicitamente marcados com `flags.fora-do-abismo-foundry.jackEngine.enabled = true`.
