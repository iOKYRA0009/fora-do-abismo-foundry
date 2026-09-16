# Jarvis Importer V9 — Adaptador D&D5e

## Alvo atual

- Foundry VTT: V14+
- D&D5e: arquitetura 6.x
- O adaptador detecta `game.system.version` em runtime e avisa quando encontra uma versão anterior à linha 6.x.

## Por que existe uma camada semântica

O payload V9 pode continuar aceitando `system` bruto para casos avançados, mas o campo `jarvis` permite descrever a intenção da habilidade sem precisar escrever manualmente toda a estrutura interna do D&D5e.

O adaptador transforma essa camada em dados compatíveis com Items e Activities do D&D5e.

## Exemplo: habilidade com uso por descanso longo

```json
{
  "name": "Espada Divina",
  "type": "feat",
  "imgStrategy": {
    "source": "generate",
    "semanticRole": "offense",
    "tags": ["radiant", "weapon"],
    "fallbackIcon": "icons/svg/sword.svg"
  },
  "jarvis": {
    "description": "Você manifesta uma lâmina de luz divina e desfere um golpe radiante.",
    "uses": {
      "max": 1,
      "recovery": "longRest"
    },
    "activities": [
      {
        "type": "attack",
        "name": "Golpe da Espada Divina",
        "activation": {
          "type": "action",
          "value": 1
        },
        "consumption": {
          "targets": [
            {
              "type": "itemUses",
              "value": 1
            }
          ]
        },
        "attack": {
          "ability": "cha",
          "type": {
            "value": "melee",
            "classification": "spell"
          }
        },
        "damage": {
          "includeBase": false,
          "parts": [
            {
              "custom": {
                "enabled": true,
                "formula": "2d8 + @mod"
              },
              "number": null,
              "denomination": null,
              "bonus": "",
              "types": ["radiant"],
              "scaling": {
                "number": 1
              }
            }
          ]
        }
      }
    ]
  }
}
```

## O que o adaptador já faz

- valida se o sistema ativo é D&D5e;
- registra a versão do sistema usada na importação;
- detecta os tipos de Item disponíveis no mundo;
- converte descrição semântica para `system.description`;
- converte usos para `system.uses`;
- converte `shortRest` para `sr` e `longRest` para `lr`;
- cria Activities e IDs válidos;
- suporta Activities `attack`, `save` e `utility` com normalização específica;
- aceita Activities adicionais em modo de passthrough controlado;
- converte consumo de `itemUses`;
- preserva `system` bruto fornecido pelo payload como escape hatch;
- remove o campo `jarvis` antes de enviar o Item ao Foundry.

## Regra de compatibilidade

A camada `jarvis` é nossa API estável. A estrutura interna do D&D5e pode mudar.

Quando uma atualização do sistema alterar Activities, consumo ou usos, corrigimos o adaptador sem precisar reescrever todas as fichas salvas no formato Jarvis.

## Limitações atuais

Ainda precisam de validação em uma instalação real:

- Activities de cura, summon, enchant e cast;
- consumo de recursos externos/atributos;
- recuperação por recharge/dado;
- spells completos e preparação;
- armas/equipamentos com todos os campos físicos;
- Active Effects aplicados por Activity;
- Actor semântico (atributos, perícias, HP, AC, movimento, classes e spellcasting).

O próximo passo recomendado é importar um personagem real da campanha e corrigir o adaptador contra o comportamento real do D&D5e V14/6.x.
