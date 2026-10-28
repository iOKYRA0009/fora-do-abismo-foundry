# Jarvis Executor — checkpoint

## Base preservada

- Base: tag `v1.1.0`, commit `a9b506e203823da0e14fab960865ce163fa6a652`.
- Branch de trabalho: `feat/jarvis-executor-final`, criada diretamente da tag.
- A `main` permanece em `1.0.0`; as funções exclusivas da `1.1.0` são a base deste trabalho.
- Antes das alterações, 183 testes Node passaram. Isto não valida a interface real do Foundry.
- Backup inicial fora do repositório e dos mundos: `%USERPROFILE%\Documents\JarvisBackups\Executor-20261028-035055-ae67c781`. Contém `jarvis-v1.1.0-source.zip` e `repository-before-work.bundle`; o bundle foi verificado com `git bundle verify`.

## Etapas concluídas após a base

- Central reorganizada em seis áreas; Executor inicial para Mestre, Biblioteca para jogadores. As ferramentas anteriores permanecem em seções avançadas. Prévia visual, confirmação explícita de JavaScript e acesso ao histórico/reversão foram ligados na interface. Testes de interface focados: 42/42 passaram.
- Prévia de cenas valida coordenadas em células, limites e conversão para pixels. O Scene Package valida imagens e geometria antes de criar documentos, sem sobrescrever nomes existentes. Testes focados de cena/imagem: 18/18 passaram.
- Cópia isolada do Foundry V14 Build 369, com D&D5e 6.0.6 e mundo `jarvis-executor-audit`, preparada fora dos mundos ativos. O servidor de teste iniciou com `--dataPath` apontando para essa cópia. Ainda não há aprovação dos cenários A–E no Foundry real.
- Executor reforçado: valida dados essenciais de Actors, imagens e posições; mantém o esquema `jarvis-executor-1`; registra histórico e IDs para reversão conservadora de documentos criados. Uploads de imagem ficam registrados e não são apagados. Macros JS preservam a autoridade do Mestre e não prometem desfazer. `api.executor.history()` e `rollback(id)` estão ligados na Central.
- Suíte Node integrada: **208/208 passaram**. Smoke no Foundry real, mundo isolado: **6/6 passaram** (abertura, seis áreas, página inicial, busca, layout, fechamento); 8 casos de escrita/papéis ficaram **NÃO TESTADO**. Relatório local: `%TEMP%\JarvisE2E\jarvis-e2e-1793171394754.json`. Não houve erro atribuído ao Jarvis. O servidor de teste foi encerrado.

## Etapa em andamento

**Interrupção pela cota:** a janela de 5 horas atingiu 90% de uso (10% restante) em 2026-10-28. A regra do usuário proíbe iniciar novos recursos ou testes longos. Salvar commit e bundle verificado; retomar os ensaios de criação quando a cota permitir. Nenhum mundo oficial foi alterado.

## Pendente

- Executar `tests/e2e/executor-real.mjs` na cópia isolada para os cenários A–E; o runner está preparado, mas **NÃO FOI EXECUTADO**. O teste de jogador e a falha forçada de upload também precisam de evidência real.
- Pacotes JSON ainda não instalam perfis Visage/Metamorph; macros JS podem usar as APIs existentes (`jarvis.appearance` e `jarvis.transformation`). Avaliar contrato seguro para JSON apenas depois dos ensaios principais.
- Revisar qualquer falha real encontrada antes de preparar próxima versão estável. **Nenhuma nova versão foi publicada.**

## Retomada

1. Abrir esta branch `feat/jarvis-executor-final` na pasta `jarvis-executor-final` e consultar este checkpoint. Não usar `main` como base.
2. A cópia isolada fica em `%LOCALAPPDATA%\Temp\JarvisExecutorFoundryTest-20261028-035436-5ad112af`; servidor Node usa `D:\Foundry Virtual Tabletop\resources\app\main.js`, porta 30001, `--world=jarvis-executor-audit` e `--dataPath` dessa pasta. A instalação normal e os mundos ativos não foram alterados.
3. Com a cota renovada, executar o runner real com `--world jarvis-executor-audit --base-url http://127.0.0.1:30001 --user Gamemaster`, conferir o relatório e corrigir somente falhas observadas.
4. Manter o backup inicial e o bundle final em `%USERPROFILE%\Documents\JarvisBackups\Executor-20261028-035055-ae67c781`. Conferir hashes e `git bundle verify` antes de qualquer publicação.
