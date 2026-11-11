# Jarvis Importer V9.1 — formato de autoria

O motor aceita pacotes `schemaVersion: "9.0"` completos e pacotes `schemaVersion: "9.1"` compactos. O V9.1 compila para o V9.0 antes da criação transacional. Ele não muda a numeração externa do módulo.

## Pacote compacto

```json
{
  "schemaVersion": "9.1",
  "actor": { "name": "NPC", "type": "npc", "jarvis": { "hp": { "value": 30, "max": 30 }, "ac": 14 } },
  "actions": [
    { "name": "Espada", "kind": "attack", "toHit": 5, "damage": { "formula": "1d8+3", "type": "slashing" } },
    { "name": "Grito", "kind": "save", "ability": "con", "dc": 14, "damage": { "formula": "2d6", "type": "thunder" }, "onSave": "half" }
  ],
  "items": [], "effects": []
}
```

`actions` aceita `attack`, `save`, `check`, `damage`, `heal`, `teleport` e `utility`. Para ataques de NPC, informe `toHit` fixo; personagens podem usar `ability` para cálculo do sistema. Para salvaguardas e testes, informe `ability` e `dc`. Cura usa `healing` com fórmula; teletransporte usa `distance` em pés. Fórmulas compactas aceitam dados, inteiros, `@mod` e `@prof` com soma/subtração. Regras mais complexas podem usar Items e Activities nativos no formato 9.0.

`scenarios` é opcional: cada entrada informa `action`, `kind`, `d20`, `expected` e `targetAC` para ataques ou `modifier` para salvaguardas/testes. O ensaio apenas confere a aritmética esperada, não executa o sistema real.

Cada `action.description` é **pública e específica daquela habilidade**. Não coloque segredos do Mestre nesse campo. O texto geral do Item é mantido na ficha, enquanto o cartão de uso prefere a descrição individual da Activity.

Classes e subclasses podem usar `jarvis.grants: [{"level":3,"uuids":["Compendium...Item..."]}]` para criar Advancement `ItemGrant` nativo. Os UUIDs devem existir. O campo `system.advancement` nativo continua aceito como entrada avançada.

Consulte [o tutorial V9.1](QUALITY-1.5.5.md) para importação de imagens, atualização de fichas e correção do chat de Items antigos.

## Objetivo

Definir um payload estável entre o conteúdo produzido pelo Jarvis e o Foundry VTT.

O V9 separa duas responsabilidades:

1. **Formato Jarvis** — estrutura previsível que pode ser validada antes da importação.
2. **Adaptador D&D 5e** — transforma conceitos de ficha em campos reais do sistema instalado.

O bootstrap atual aceita dados de Actor, Items e Active Effects já no formato esperado pelo Foundry. A próxima etapa é reduzir a necessidade de escrever `system` manualmente.

## Payload mínimo

```json
{
  "schemaVersion": "9.0",
  "actor": {
    "name": "Personagem de Teste",
    "type": "character",
    "system": {}
  },
  "items": [],
  "effects": []
}
```

## Regras do formato 9.0 anterior

- `schemaVersion` deve ser `9.0`.
- `actor.name` é obrigatório.
- `actor.type` é obrigatório.
- `items` e `effects`, quando presentes, devem ser arrays.
- Apenas um Mestre deve executar importações.
- O importer interrompe a operação se o sistema ativo não for `dnd5e`.

O formato 9.0 continua disponível para dados nativos avançados e compatibilidade com pacotes antigos.
