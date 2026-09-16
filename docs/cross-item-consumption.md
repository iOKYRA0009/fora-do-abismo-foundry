# Jarvis V9 — Consumo entre Items

## Objetivo

Permitir que uma Activity de um Item consuma os usos de outro Item do mesmo Actor sem exigir que o payload conheça o `_id` gerado pelo Foundry.

## Sintaxe Jarvis

Use o identificador semântico do Item-alvo com o prefixo `@jarvis:`.

Exemplo de recurso:

```json
{
  "name": "Foco (Ki)",
  "type": "feat",
  "jarvis": {
    "identifier": "foco-ki",
    "uses": {
      "max": 6,
      "recovery": ["shortRest", "longRest"]
    }
  }
}
```

Exemplo de habilidade separada que consome o recurso:

```json
{
  "name": "Rajada de Golpes",
  "type": "feat",
  "jarvis": {
    "identifier": "rajada-de-golpes",
    "activities": [
      {
        "type": "utility",
        "name": "Rajada de Golpes",
        "activation": { "type": "bonus", "value": 1 },
        "consumption": {
          "spellSlot": false,
          "targets": [
            {
              "type": "itemUses",
              "target": "@jarvis:foco-ki",
              "value": 1
            }
          ]
        }
      }
    ]
  }
}
```

## Como funciona

1. O V9 cria todos os Items do Actor.
2. O `cross-item-linker` monta um índice pelos `system.identifier` e nomes normalizados.
3. Referências `@jarvis:<identificador>` são substituídas pelo `_id` real do Item criado.
4. A Activity passa a usar o consumo nativo `itemUses` do D&D5e.

## Falhas

O importer falha de forma explícita quando:

- a referência não encontra nenhum Item;
- dois Items criam a mesma chave de referência;
- o Actor não consegue atualizar os Items após a resolução.

O objetivo é evitar habilidades que aparecem na ficha mas silenciosamente deixam de consumir recursos.
