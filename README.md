# Fora do Abismo — Foundry

Base técnica oficial da campanha **Fora do Abismo** para Foundry VTT.

## Objetivo

Este repositório concentra o código da campanha: Jarvis Importer, macros, automações, Active Effects, utilitários e, futuramente, compêndios próprios.

A lore completa não deve ser duplicada aqui. O Google Drive continua sendo a fonte documental da campanha; este repositório é a oficina técnica.

## Estado atual

**Milestone 1 — Jarvis Importer V9 Bootstrap**

- [x] Manifesto inicial do módulo
- [x] API básica do módulo
- [x] Validação inicial do payload de Actor
- [x] Importação genérica de Actor + Embedded Items
- [x] Esquema JSON inicial
- [ ] Adaptador específico para D&D 5e
- [ ] Recursos/usos/consumo
- [ ] Active Effects
- [ ] Magias e ataques validados
- [ ] Testes automatizados
- [ ] Interface de importação dentro do Foundry

## Compatibilidade-alvo

- Foundry VTT: **V14**
- Sistema: **D&D 5e**

A compatibilidade declarada no manifesto será atualizada à medida que os testes reais avançarem.

## Estrutura

```text
.
├── module.json
├── scripts/
│   ├── main.js
│   └── importer/
│       ├── v9/
│       └── validators/
├── schemas/
├── styles/
├── macros/
├── templates/
├── docs/
└── tests/
```

## Princípio do V9

O importer não deve apenas criar uma ficha "bonita". Ele precisa preservar funcionalidade: atributos, rolagens, recursos, consumo, usos, efeitos e descansos devem funcionar dentro do Foundry.

Quando algo ainda não estiver implementado, o importer deve falhar de forma clara em vez de fingir que funcionou.
