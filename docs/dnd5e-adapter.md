# Jarvis Importer V9 — Adaptador D&D5e

## Alvo atual

- Foundry VTT: V14
- D&D5e: 6.0.x
- Versão verificada durante o desenvolvimento atual: 6.0.2

## Por que existe uma camada semântica

O payload V9 pode continuar aceitando `system` bruto para casos avançados, mas o campo `jarvis` descreve a intenção da ficha sem exigir que cada import conheça toda a estrutura interna do D&D5e.

O adaptador converte essa camada em dados compatíveis com Actors, Items e Activities do D&D5e.

## Actor semântico

Exemplo:

```json
{
  "name": "Personagem de Teste",
  "type": "character",
  "jarvis": {
    "abilities": {
      "str": 10,
      "dex": 16,
      "con": 14,
      "int": 10,
      "wis": 16,
      "cha": 8
    },
    "saves": ["str", "dex"],
    "skills": {
      "acr": 1,
      "ste": 2,
      "prc": 1
    },
    "hp": {
      "value": 45,
      "max": 45,
      "temp": 0
    },
    "ac": 17,
    "movement": {
      "walk": 40,
      "units": "ft"
    },
    "resources": [
      {
        "slot": "primary",
        "label": "Ki",
        "value": 6,
        "max": 6,
        "sr": true,
        "lr": true
      }
    ]
  }
}
```

### Actor já suportado

- valores de FOR, DES, CON, INT, SAB e CAR;
- proficiência em salvaguardas;
- proficiência em perícias: 0, 0.5, 1 ou 2;
- PV atual, máximo e temporário;
- CA por override;
- movimento usando `attributes.movement.speeds` do D&D5e 6.0;
- atributo de spellcasting;
- detalhes básicos e biografia;
- três recursos nativos: primary, secondary e tertiary.

O D&D5e 6.0 calcula nível e bônus de proficiência a partir dos Items de classe. O V9 não grava esses valores derivados diretamente no Actor.

## Classe semântica

Exemplo:

```json
{
  "name": "Monge",
  "type": "class",
  "jarvis": {
    "levels": 6,
    "hitDie": "d8",
    "primaryAbility": ["dex", "wis"],
    "spellcasting": {
      "progression": "none",
      "ability": ""
    }
  }
}
```

Quando a classe é criada como Item embutido no Actor, o próprio D&D5e deriva o nível total e o bônus de proficiência do personagem.

## Habilidade com uso por descanso longo

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
        }
      }
    ]
  }
}
```

## Resource Engine básico

O D&D5e oferece três recursos nativos no Actor:

- `primary`
- `secondary`
- `tertiary`

O Jarvis pode preencher e configurar recuperação por descanso desses três slots. Recursos adicionais não serão forçados nesses campos: devem usar `Item Uses` ou, futuramente, o Resource Engine customizado do módulo.

Isso evita tentar encaixar sistemas como Almas do Jack em uma estrutura que não foi feita para isso.

## O que o adaptador já faz

- valida se o sistema ativo é D&D5e;
- registra a versão usada na importação;
- detecta tipos de Item disponíveis;
- cria Actor semântico básico;
- cria classe com níveis e dado de vida;
- converte descrição para `system.description`;
- converte usos e recuperação;
- cria Activities com IDs válidos;
- suporta Activities `attack`, `save` e `utility` com normalização específica;
- aceita Activities adicionais em passthrough controlado;
- converte consumo de `itemUses`;
- preserva `system` bruto fornecido pelo payload como escape hatch;
- remove os campos `jarvis` antes de criar os documentos no Foundry.

## Limitações atuais

Ainda precisam ser implementados ou validados em personagem real:

- subclasses e Advancement completo;
- proficiências de classe via Advancement;
- Hit Points derivados automaticamente de classes;
- spellcasting completo e preparação;
- armas/equipamentos com todos os campos físicos;
- Active Effects aplicados por Activity;
- recursos customizados além dos três slots nativos;
- Activities de cura, summon, enchant e cast.

O próximo teste deve usar um personagem real da campanha para validar Actor + classe + recurso em conjunto.
