# Jarvis Provenance Engine — V9 alpha.9

O Provenance Engine separa conteúdo oficial de D&D, recriações manuais e homebrew da campanha sem depender apenas do nome do Item.

## Classificações

- `official-system`: documento originado de compêndio confiável `Compendium.dnd5e.*` ou SRD 5.1/5.2.
- `official-recreation`: conteúdo oficial reconhecido pelo registro canônico, mas recriado manualmente no mundo.
- `official-modified`: base oficial com automação/modificação adicional detectável.
- `homebrew`: conteúdo criado pelo Jarvis ou com automação própria sem correspondência oficial conhecida.
- `homebrew-extension`: característica não canônica anexada a uma subclasse oficial reconhecida.
- `unverified`: evidência insuficiente. O V9 não assume silenciosamente que é homebrew.

## Registro inicial de subclasses

O registro inicial existe para os três personagens que motivaram a alpha.9:

- Warlock — The Undead — Van Richten's Guide to Ravenloft — regras 2014.
- Sorcerer — Storm Sorcery — Xanathar's Guide to Everything / Sword Coast Adventurer's Guide — regras 2014.
- Fighter — Eldritch Knight — Player's Handbook — variantes 2014 e 2024.

O registro armazena apenas metadados de identificação, nomes de características e níveis; não contém reprodução de texto de livros.

## Conflitos de edição

O engine compara `system.source.rules` da subclasse com a classe base. Uma recriação manual marcada como 2024 dentro de uma classe 2014 é reconhecida como conteúdo oficial, mas recebe um conflito de edição no relatório.

Isso é particularmente importante para Actors antigos migrados entre versões do sistema.

## API

```js
const api = game.modules.get("fora-do-abismo-foundry")?.api;
const report = api.provenance.analyzeActor(actor);
console.log(api.provenance.formatReport(report));
await api.provenance.stampActor(actor);
```

`stampActor` grava a classificação em `flags.fora-do-abismo-foundry.provenance` de cada Item e um resumo no Actor.

## Relação com progressão

A classificação não substitui automaticamente conteúdo oficial ausente. O objetivo é permitir que o importer escolha corretamente entre:

1. progressão nativa do D&D5e quando o conteúdo está realmente instalado;
2. recriação oficial preservada quando o conteúdo foi cadastrado manualmente;
3. Jarvis Progression para extensões e homebrews da campanha.

Nunca converter silenciosamente uma recriação oficial em homebrew nem substituir uma versão modificada pelo texto canônico sem decisão explícita do Mestre.
