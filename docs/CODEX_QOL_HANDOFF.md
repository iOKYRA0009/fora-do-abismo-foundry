# Jarvis Tools 1.5.0 QoL — handoff de desenvolvimento

Atualizado em 2026-11-11. A versão **1.5.0 definitiva** está preparada para publicação e para os testes manuais do proprietário no Foundry. A tag `v1.4.1` permanece intacta; `git merge-base --is-ancestor v1.4.1 HEAD` passou, confirmando que a 1.5.0 contém a 1.4.1. Os schemas permanecem `9.0`, `jarvis-executor-1` e `1.0`.

## Objetivo completo

Entregar Jarvis Tools 1.5.0 com importações V9 seguras, detecção de duplicatas e comparação, validação de Activities, Central Jarvis mais clara e modular, diagnósticos do Executor, benchmarks antes/depois quando viáveis, documentação e testes Node e no Foundry V14 + D&D5e 6.0.x. Preservar as seis áreas, permissões, favoritos, histórico, formatos e operações nativas. Não criar mecânicas de RPG ou sobrescrever Actors existentes silenciosamente.

## Estado Git

- Repositório: `https://github.com/iOKYRA0009/fora-do-abismo-foundry`.
- Branch local: `feat/jarvis-tools-1.5.0-qol`, criada de `main` em `61ece6b` (Jarvis 1.4.1).
- Último commit de release preparado: `1b3ee3a` — `release: prepare Jarvis Tools 1.5.0 for Foundry update`. Checkpoints de código: `12d6389`, `5362e42`, `385d1f4`, `ff05844`.
- PR: https://github.com/iOKYRA0009/fora-do-abismo-foundry/pull/36 . Publicação pendente no momento deste checkpoint; verificar estado do PR e da release antes de retomar.
- Para ver o último commit inclusive este handoff: `git log -1 --oneline`.
- Diretório local: `C:\Users\Roger\.codex\.chatgpt-projects\g-p-6a70840fbf8081919fb2119ad103500d\jarvis-qol-150`.

## Arquivos alterados

- `scripts/importer/v9/import-review.js` (novo), `jarvis-importer-v9.js`, `scripts/importer/validators/payload-validator.js`, `scripts/importer/adapters/dnd5e-adapter.js`.
- `scripts/ui/actor-import-with-image.js`, `jarvis-console.js`, `console-tool-catalog.js`, `import-review-view.js` (novo), `styles/fora-do-abismo.css`.
- `scripts/macros/execution-report.js` (novo).
- `tests/import-review.test.js`, `import-review-view.test.js`, `execution-report.test.js` (novos), `actor-import-with-image.test.js`, `dnd-runtime.test.js`, `importer-transaction.test.js`.
- Este handoff.

## Melhorias concluídas neste checkpoint

1. Prévia de Actor e Items V9 com atributos, PV, CA, recursos, imagens, Activities, Effects, usos, avisos e conflitos. A Central exige prévia atual e confirmação antes da criação.
2. Detecção de Actor já existente por nome e tipo; comparação somente leitura de campos explícitos e Items existentes. Criação bloqueada sem tocar na ficha anterior.
3. Detecção de Items duplicados no JSON e na ficha por origem, ID, identificador ou nome/tipo. Importação bloqueada antes de criar documentos. O Executor já fazia sua própria verificação de nomes e revalidação antes de executar.
4. Validação adicional de Activity `_id`, ataque, CD, dano, consumo, recuperação, efeitos e erros com caminhos dos campos. Aviso para classe/subclasse/Advancement.
5. Aviso de compatibilidade corrigido para D&D5e 6.0.6, conforme manifesto existente. Versões posteriores de 6.0.x continuam com aviso.
6. Falha após upload de retrato informa o caminho do arquivo que permanece. Relatório JSON do Executor informa PASSOU/FALHOU/MANUAL/NÃO TESTADO, sem fingir teste individual de Activity.
7. Resultado da Central ampliado para revisão, pequenos ajustes de hierarquia e responsividade.
8. Painel de revisão V9 renderizado por módulo independente, com HTML escapado, seções legíveis e invalidação quando JSON, arquivo ou Actor selecionado mudam.
9. Busca local prioriza nome exato, início do nome e início de palavra sem alterar cache/cancelamento dos compêndios. O validador bloqueia consumo duplicado do mesmo recurso em uma Activity.
10. Prévia avisa sobre dano, salvaguarda e usos de Activity incompletos. Actor renomeado ainda é detectado por `_id` ou `flags.core.sourceId` quando disponível.
11. Manifesto 1.5.0, README e `docs/QUALITY-1.5.0.md` preparados com instalação, compatibilidade, roteiro de teste e recuperação. A 1.4.1 está contida por ancestralidade Git e não foi modificada.

## Pendente, em ordem

1. **P0:** completar avaliação de validação semântica com casos reais de Activities D&D5e 6.0.6; revisar consumo entre Items e idempotência segura nos fluxos existentes. Auditar falhas parciais de Actor/Item/Scene e arquivos enviados, com resultados por elemento.
2. **P1:** refatorar gradualmente `jarvis-console.js` em módulos de renderização e comandos, preservando 6 áreas e 86 ações originais. Analisar ApplicationV2 e HandlebarsApplicationMixin no contexto da UI atual, sem migração arriscada sem teste no Foundry.
3. **P1:** revisar busca por relevância/contexto e estados de carregamento, conclusão, erro e vazio. Medir abertura, abas, busca, JSON, prévia, importação em lote, pacotes grandes e memória antes/depois em ambiente Foundry. Nenhum ganho de desempenho foi reivindicado.
4. **P1:** diagnósticos por documento e Activity em execuções reais, pré-voo mais detalhado, histórico e relatórios. O relatório atual marca Activity como NÃO TESTADO.
5. **P2:** acabamento visual e de acessibilidade depende de observação em mundo real. Manter configurações anteriores.
6. **Testes Foundry pelo proprietário:** Actor novo e duplicado, preservação de ficha, Items/Activities/consumo, falhas, permissões Mestre/jogador, busca, histórico, Scenes com paredes/portas/luzes/tokens e integrações opcionais. Registrar PASSOU/FALHOU/MANUAL/NÃO TESTADO e corrigir regressões relatadas em atualização posterior.

## Testes e bloqueios

- `node --test tests/*.test.js`: **260 passaram, 0 falharam** em 2026-11-11.
- `git diff --check`: passou.
- Foundry local em `http://127.0.0.1:30000`: conexão recusada. Testes E2E e testes reais no mundo **NÃO TESTADOS**.
- `node_modules/playwright-core` não está instalado neste checkout. O comando E2E também requer URL/mundo de homologação e navegador configurados.
- Integrações DAE, Tidy5e, Nik's Tweaks, Visage e Metamorph **NÃO TESTADAS** neste checkpoint.
- Manifestos instalados em dados locais: D&D5e `6.0.6`, DAE `14.0.19`, Tidy5e `14.4.0`, Visage `5.12.0`, Metamorph `1.5.3`, Jarvis instalado `1.4.0`. Isto não comprova que o mundo esteja ativo nem que as integrações funcionem. Nenhum mundo foi encontrado em `Data/worlds` nesta inspeção.
- Não há benchmarks antes/depois; não afirmar melhoria de velocidade.

## Decisões técnicas

- `importActor` continua criando Actor novo. Nome/tipo já existente bloqueia a criação, sem substituir PV, recursos, slots, condições, imagem ou configuração.
- `importItems` bloqueia coincidências em vez de substituir ou saltar silenciosamente. Isso mantém o contrato de retorno e o rollback do Executor.
- A Central usa DialogV2 existente. Migração total para outra aplicação depende de prova de compatibilidade, não apenas de estética.
- A [API oficial V14](https://foundryvtt.com/api/modules/foundry.applications.html) descreve DialogV2 como subclass de ApplicationV2 adequada a janelas sem rerender. A Central atual não recria o DOM em trocas de abas; manter DialogV2 evita uma migração arriscada sem teste real. HandlebarsApplicationMixin fica para avaliação após teste de integração.
- O relatório exportado é uma leitura do histórico. Sem telemetria de Activity real, Activity permanece NÃO TESTADO.
- Imagens enviadas não são apagadas automaticamente após falha ou reversão; o caminho é relatado.

## Próxima tarefa exata

Conferir PR #36 e release `v1.5.0`; se a workflow publicar com sucesso, verificar `module.json` e ZIP na release e instruir o proprietário a atualizar pelo Foundry. Depois receber o resultado dos testes manuais e corrigir regressões sem alterar `v1.4.1` nem republicar silenciosamente `v1.5.0`.

## Comandos para retomar

```powershell
cd 'C:\Users\Roger\.codex\.chatgpt-projects\g-p-6a70840fbf8081919fb2119ad103500d\jarvis-qol-150'
git status --short --branch
git log -1 --oneline
git fetch origin
git log --oneline --left-right HEAD...origin/main
node --test tests/*.test.js
```

## Critérios de conclusão

- P0/P1/P2 acima implementados ou limites justificados com precisão, sem perda de funcionalidade.
- Testes Node verdes e testes Foundry de homologação registrados por caso, inclusive permissões e integrações disponíveis.
- Benchmarks comparáveis antes/depois ou ausência de medição explicitamente registrada, sem alegações de ganho.
- Manifesto/changelog/documentação de instalação e recuperação coerentes com versões realmente testadas.
- Branch publicada e PR preparado com descrição, testes, compatibilidade, recuperação e pendências claras; `main` intacta.
