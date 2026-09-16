# Fora do Abismo — Foundry

Base técnica oficial da campanha **Fora do Abismo** para Foundry VTT.

## Objetivo

Este repositório concentra o código da campanha: Jarvis Importer, macros, automações, Active Effects, utilitários e, futuramente, compêndios próprios.

A lore completa não deve ser duplicada aqui. O Google Drive continua sendo a fonte documental da campanha; este repositório é a oficina técnica.

## Instalação no Foundry

Instale o módulo por **Manifest URL**:

```text
https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/latest/download/module.json
```

No Foundry VTT:

1. Abra **Add-on Modules**.
2. Clique em **Install Module**.
3. Cole a URL acima no campo **Manifest URL**.
4. Instale o módulo.
5. Entre no mundo D&D5e e ative **Fora do Abismo — Jarvis Tools** em **Manage Modules**.

O Foundry usa o mesmo Manifest URL para detectar atualizações futuras.

> O pipeline de distribuição é estável; o Jarvis Importer V9 ainda está em versão alpha enquanto validamos fichas reais da campanha.

## Publicação automática

A workflow `.github/workflows/release.yml` publica automaticamente uma nova versão quando código com um novo número em `module.json` chega à branch `main`.

A release contém:

- `module.json` — manifesto que o Foundry lê;
- `fora-do-abismo-foundry.zip` — pacote instalável;
- uma tag `v<versão>` correspondente à versão do manifesto.

Se a versão já existir, a workflow não sobrescreve silenciosamente aquela release. Para publicar mudanças novas, é obrigatório incrementar `module.json.version`.

## Estado atual

**Milestone 1 — Jarvis Importer V9 Bootstrap**

- [x] Manifesto inicial do módulo
- [x] Instalação/atualização via Manifest URL
- [x] Pipeline automático de GitHub Release
- [x] API básica do módulo
- [x] Validação inicial do payload de Actor
- [x] Importação genérica de Actor + Embedded Items
- [x] Esquema JSON inicial
- [x] Sistema inicial de imagens e `imgStrategy`
- [x] Adaptador D&D5e — primeira camada
- [x] Compatibilidade básica verificada com D&D5e 5.3.3 e 6.0.x para Activities centrais
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
- Sistema: **D&D 5e 5.3.3 até 6.0.x** para a camada atualmente implementada
- D&D5e mínimo no manifesto: **5.3.3**
- D&D5e mais recente verificado no manifesto: **6.0.2**

A compatibilidade 5.3.3 foi conferida diretamente contra os modelos de Activity do sistema oficial para `attack`, `save`, `utility`, `uses`, `consumption` e `target`. Recursos ainda não implementados no V9 continuam sujeitos a validação durante os testes com personagens reais.

O adaptador detecta a versão real do sistema em runtime. A camada `jarvis` serve como API estável para evitar que cada atualização do D&D5e obrigue a reescrever todas as fichas.

## Estrutura

```text
.
├── .github/workflows/release.yml
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
├── docs/
└── README.md
```

## Princípio do V9

O importer não deve apenas criar uma ficha "bonita". Ele precisa preservar funcionalidade: atributos, rolagens, recursos, consumo, usos, efeitos e descansos devem funcionar dentro do Foundry.

Quando algo ainda não estiver implementado, o importer deve falhar de forma clara em vez de fingir que funcionou.

## Documentação

- `docs/importer-format.md` — formato geral do payload V9
- `docs/image-pipeline.md` — arquitetura de imagens e geração futura
- `docs/dnd5e-adapter.md` — camada semântica e adaptação para D&D5e
