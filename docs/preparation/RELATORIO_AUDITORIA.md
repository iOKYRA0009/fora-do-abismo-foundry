# Etapa 1 — auditoria técnica V5.4

Base: `8ebd9daa6985233dd5e9abcbd59cf2a424ec2535`, main consultada em 02/11/2026.
Branch de trabalho: `feat/v54-etapa1-gromm`. Nenhuma alteração no runtime instalado, main ou mundo de produção.

## Compatibilidade e capacidades

| Componente | Evidência no código atual | Resultado |
|---|---|---|
| Manifest | module.json: Jarvis 1.4.0; Foundry mínimo/verificado/máximo 14; dnd5e mínimo 6.0.0, verificado 6.0.6 | Declaração; não comprova instalação do usuário |
| Importer V9 | scripts/importer/v9/jarvis-importer-v9.js + validators + adaptador D&D5e | Cria Actor novo, itens, Activities, recursos, efeitos; rollback tenta excluir Actor incompleto |
| Macro Executor | scripts/macros/macro-executor.js | Pacote jarvis-executor-1; Actors 9.0; Scenes 1.0; nomes existentes recusados |
| Alterar PJs via itemAdditions | Checagem actorNames no Executor | Recusado para Actor existente; manter poderes fora das fichas |
| Scene Builder | scripts/scenes/scene-builder.js | Scene nova, paredes/portas/luzes/sons/Tiles/tokens; replacement é opção existente, não utilizada aqui |
| Prévia | scene-calibration.js, executor-map-edit.js | imagePlacement converte pixels; structures deriva paredes/portas; prévia permite arraste |
| Mosaico | multi-image-tiles.js | Até 4 setores, um plano; rect em pixels + pixelWidth/pixelHeight obrigatórios; não equivale a andares/telhados |
| Tokens | buildTokenData + actor.getTokenDocument | Herda textura e visão; width/height opcionais sobrescrevem ocupação; M00 compara com export |
| Preset limited | scene-calibration.js | Insere range 60 quando token não informa vision. M00 omite o preset para preservar protótipos |
| Registro de Produção | production-snapshot.js | Fotografia técnica sem Tokens/Actors; não é backup restaurável |
| Inspetor HD | mosaic-quality.js | Heurísticas; não comprova detalhes artísticos, raycasting ou visão do jogador |
| Diretor de Atmosfera | atmosphere-director.js | Altera darknessLevel/backgroundColor; não controla áudio ou FX |
| Managed Macros | managed-macros.js | Comandos controlados; não é importador arbitrário de scripts |

Limites lidos no Executor: 8 MiB por imagem, 48 MiB de imagens, 40 assets, 20 Actors,
10 Scenes, 30 itemAdditions. Texto-fonte limitado a 12 MiB. JSON com imagem embutida
é suportado; ZIP não é entrada do Executor. Uploads não têm rollback; JS arbitrário
não possui reversão garantida. O preparador não executa uploads nem JS no Foundry.

Schemas lidos: jarvis-actor-v9, jarvis-scene-v1, jarvis-scene-package-v1. O último é
um formato de pacote de cena separado, NÃO a raiz do Macro Executor. A validação
executável atual também suporta campos como imageTiles/structures; não inferir
suporte apenas da permissividade additionalProperties dos schemas.

## Implementação nova

- `scripts/preparation/native-export-audit.js`: valida exports nativos, conserva UUID
  de exportSource (mesmo sem _id), extrai escala, recursos, Activities, efeitos e versões.
- `scripts/preparation/m00-package.js`: prepara apenas pacote TESTE sem Actors/itens novos;
  reutiliza calibrador/validador/inspector existentes; bloqueia escala divergente, presets
  que sobrescrevem visão, atores ambíguos, sobreposição e limites do canvas.
- `tools/prepare-m00.mjs`: leitura local, hashes, CSV e relatórios; saída em diretório novo
  obrigatório. Não importa Actor V9, não procura servidor e não modifica fontes.
- `macros/preparation/00_DIAGNOSTICO_READONLY.js`: leitura GM das versões e módulos,
  sem envio ao chat, upload ou escrita no mundo.

Nenhuma mudança necessária no motor para este rascunho. A arte final, geografia definitiva,
NPCs aprovados e homologação são dependências, não funcionalidades resolvidas por código.
Dados pessoais, artes e relatórios da campanha ficam em `private/`, ignorado pelo Git.

## Validação

Comandos efetivamente executados: `node --test tests/*.test.js`,
`node --test tests/m00-preparation.test.js`, e CLI com os exports locais confirmados.
Baseline: 245 testes PASSARAM. Resultados finais e checklist: `M00_TESTES.md`.
Testes Node usam documentos simulados: não comprovam Foundry V14 real.

Documentação primária adicional consultada:
[SceneData V14](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneData.html),
[TokenData V14](https://foundryvtt.com/api/interfaces/foundry.documents.types.TokenData.html).
O código e os exports continuam sendo a evidência da integração específica do Jarvis.
