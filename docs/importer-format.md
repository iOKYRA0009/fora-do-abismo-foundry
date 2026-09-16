# Jarvis Importer V9 — Formato inicial

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

## Regras atuais

- `schemaVersion` deve ser `9.0`.
- `actor.name` é obrigatório.
- `actor.type` é obrigatório.
- `items` e `effects`, quando presentes, devem ser arrays.
- Apenas um Mestre deve executar importações.
- O importer interrompe a operação se o sistema ativo não for `dnd5e`.

## Próxima evolução

O payload V9 deve ganhar uma camada semântica para representar:

- atributos e perícias;
- CA, PV, deslocamentos e sentidos;
- classes e níveis;
- ataques;
- magias;
- recursos com usos e recuperação;
- consumo de recurso por habilidade;
- talentos;
- Active Effects;
- automações especiais da campanha.

A regra principal é simples: se uma habilidade disser que consome um recurso, isso precisa existir e funcionar dentro do Foundry.
