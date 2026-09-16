# Jarvis Native Self Effects — alpha.11

A alpha.11 adiciona aplicação de Active Effects diretamente pelo `Jarvis Automation`, sem depender de prompts ou macros de módulos externos.

## Helpers disponíveis em `automation.post`

- `jarvis.applyActorEffect(effectData, { key, replace })`
  - cria um Active Effect no Actor associado à Activity;
  - usa `type: "base"` nativo do D&D5e 6.x;
  - força `transfer: false` e `disabled: false`;
  - remove `system.type` para evitar payloads incompatíveis com o modelo `base`;
  - quando `key` é fornecida, grava `flags.fora-do-abismo-foundry.automationKey`;
  - com `replace: true` (padrão), reinicia o efeito anterior com a mesma chave.

- `jarvis.getActorEffect(keyOrName)`
- `jarvis.hasActorEffect(keyOrName)`
- `jarvis.removeActorEffect(keyOrName)`

## Objetivo

Transformações e buffs homebrew do projeto, como Avatar da Tempestade, Motor de Sangue e Cinzas e futuras formas de Jack, podem aplicar efeitos temporários sem depender de `sc-macro`, Self Effect Application ou outro módulo externo.

Efeitos oficiais importados do D&D5e continuam podendo usar o fluxo nativo do sistema quando apropriado.
