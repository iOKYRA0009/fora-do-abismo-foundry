# Jarvis Tools 1.5.0 QoL — handoff de desenvolvimento

Atualizado em 2026-11-11. Esta iniciativa **não está concluída**. O manifesto continua em 1.4.1 até a validação final; os schemas permanecem `9.0`, `jarvis-executor-1` e `1.0`.

## Objetivo completo

Entregar Jarvis Tools 1.5.0 com importações V9 seguras, detecção de duplicatas e comparação, validação de Activities, Central Jarvis mais clara e modular, diagnósticos do Executor, benchmarks antes/depois quando viáveis, documentação e testes Node e no Foundry V14 + D&D5e 6.0.x. Preservar as seis áreas, permissões, favoritos, histórico, formatos e operações nativas. Não criar mecânicas de RPG ou sobrescrever Actors existentes silenciosamente.

## Estado Git

- Repositório: `https://github.com/iOKYRA0009/fora-do-abismo-foundry`.
- Branch local: `feat/jarvis-tools-1.5.0-qol`, criada de `main` em `61ece6b` (Jarvis 1.4.1).
- Último commit de código concluído: `ff05844` — `feat(qol): review V9 imports and export executor diagnostics`.
- Para ver o último commit inclusive este handoff: `git log -1 --oneline`.
- Diretório local: `C:\Users\Roger\.codex\.chatgpt-projects\g-p-6a70840fbf8081919fb2119ad103500d\jarvis-qol-150`.

## Arquivos alterados

- `scripts/importer/v9/import-review.js` (novo), `jarvis-importer-v9.js`, `scripts/importer/validators/payload-validator.js`, `scripts/importer/adapters/dnd5e-adapter.js`.
- `scripts/ui/actor-import-with-image.js`, `jarvis-console.js`, `console-tool-catalog.js`, `styles/fora-do-abismo.css`.
- `scripts/macros/execution-report.js` (novo).
- `tests/import-review.test.js`, `execution-report.test.js` (novos), `actor-import-with-image.test.js`, `dnd-runtime.test.js`, `importer-transaction.test.js`.
- Este handoff.

## Melhorias concluídas neste checkpoint

1. Prévia de Actor e Items V9 com atributos, PV, CA, recursos, imagens, Activities, Effects, usos, avisos e conflitos. A Central exige prévia atual e confirmação antes da criação.
2. Detecção de Actor já existente por nome e tipo; comparação somente leitura de campos explícitos e Items existentes. Criação bloqueada sem tocar na ficha anterior.
3. Detecção de Items duplicados no JSON e na ficha por origem, ID, identificador ou nome/tipo. Importação bloqueada antes de criar documentos. O Executor já fazia sua própria verificação de nomes e revalidação antes de executar.
4. Validação adicional de Activity `_id`, ataque, CD, dano, consumo, recuperação, efeitos e erros com caminhos dos campos. Aviso para classe/subclasse/Advancement.
5. Aviso de compatibilidade corrigido para D&D5e 6.0.6, conforme manifesto existente. Versões posteriores de 6.0.x continuam com aviso.
6. Falha após upload de retrato informa o caminho do arquivo que permanece. Relatório JSON do Executor informa PASSOU/FALHOU/MANUAL/NÃO TESTADO, sem fingir teste individual de Activity.
7. Resultado da Central ampliado para revisão, pequenos ajustes de hierarquia e responsividade.

## Pendente, em ordem

1. **P0:** completar avaliação de validação semântica com casos reais de Activities D&D5e 6.0.6; revisar consumo entre Items e idempotência segura nos fluxos existentes. Auditar falhas parciais de Actor/Item/Scene e arquivos enviados, com resultados por elemento.
2. **P1:** refatorar gradualmente `jarvis-console.js` em módulos de renderização e comandos, preservando 6 áreas e 86 ações originais. Analisar ApplicationV2 e HandlebarsApplicationMixin no contexto da UI atual, sem migração arriscada sem teste no Foundry.
3. **P1:** revisar busca por relevância/contexto e estados de carregamento, conclusão, erro e vazio. Medir abertura, abas, busca, JSON, prévia, importação em lote, pacotes grandes e memória antes/depois em ambiente Foundry. Nenhum ganho de desempenho foi reivindicado.
4. **P1:** diagnósticos por documento e Activity em execuções reais, pré-voo mais detalhado, histórico e relatórios. O relatório atual marca Activity como NÃO TESTADO.
5. **P2:** acabamento visual e de acessibilidade com teste de teclado e viewport, documentação de instalação/recuperação, atualização de versão/changelog e PR. Manter configurações anteriores.
6. **Testes Foundry obrigatórios:** Actor novo e duplicado, preservação de ficha, Items/Activities/consumo, falhas, permissões Mestre/jogador, busca, histórico, Scenes com paredes/portas/luzes/tokens, integrações opcionais e regressão das ações. Registrar PASSOU/FALHOU/MANUAL/NÃO TESTADO.

## Testes e bloqueios

- `node --test tests/*.test.js`: **255 passaram, 0 falharam** em 2026-11-11.
- `git diff --check`: passou.
- Foundry local em `http://127.0.0.1:30000`: conexão recusada. Testes E2E e testes reais no mundo **NÃO TESTADOS**.
- `node_modules/playwright-core` não está instalado neste checkout. O comando E2E também requer URL/mundo de homologação e navegador configurados.
- Integrações DAE, Tidy5e, Nik's Tweaks, Visage e Metamorph **NÃO TESTADAS** neste checkpoint.
- Não há benchmarks antes/depois; não afirmar melhoria de velocidade.

## Decisões técnicas

- `importActor` continua criando Actor novo. Nome/tipo já existente bloqueia a criação, sem substituir PV, recursos, slots, condições, imagem ou configuração.
- `importItems` bloqueia coincidências em vez de substituir ou saltar silenciosamente. Isso mantém o contrato de retorno e o rollback do Executor.
- A Central usa DialogV2 existente. Migração total para outra aplicação depende de prova de compatibilidade, não apenas de estética.
- O relatório exportado é uma leitura do histórico. Sem telemetria de Activity real, Activity permanece NÃO TESTADO.
- Imagens enviadas não são apagadas automaticamente após falha ou reversão; o caminho é relatado.

## Próxima tarefa exata

Revisar o código V9 e casos de Activities reais; adicionar testes para consumo/recuperação e duplicatas por identificador estável; depois modularizar um bloco autocontido da Central. Verificar o estado remoto de `main` antes de editar e não recomeçar do zero.

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
