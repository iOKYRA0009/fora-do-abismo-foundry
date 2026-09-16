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
- [x] Sistema inicial de imagens e `imgStrategy`
- [x] Adaptador D&D5e 6.x — primeira camada
- [x] Activities básicas: attack, save e utility
- [x] Usos e recuperação básica por descanso
- [x] Consumo básico de Item Uses
- [ ] Actor semântico: atributos, perícias, HP, AC e movimento
- [ ] Active Effects aplicados por Activity
- [ ] Magias completas e spellcasting
- [ ] Recursos externos/atributos e consumo avançado
- [ ] Testes em personagem real
- [ ] Testes automatizados
- [ ] Interface de importação dentro do Foundry

## Compatibilidade-alvo

- Foundry VTT: **V14**
- Sistema: **D&D 5e 6.x**

O adaptador detecta a versão real do sistema em runtime. A camada `jarvis` serve como API estável para evitar que cada atualização do D&D5e obrigue a reescrever todas as fichas.

## Estrutura

```text
.
├── module.json
├── scripts/
│   ├── main.js
│   └── importer/
│       ├── adapters/
│       ├── images/
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

## Documentação

- `docs/importer-format.md` — formato geral do payload V9
- `docs/image-pipeline.md` — arquitetura de imagens e geração futura
- `docs/dnd5e-adapter.md` — camada semântica e adaptação para D&D5e
