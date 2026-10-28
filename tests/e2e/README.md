# Auditoria E2E do Jarvis no Foundry real

O runner `foundry-smoke.mjs` usa Playwright com Edge/Chromium e só executa ações depois de confirmar `game.world.id` no mundo isolado cujo slug foi informado. O mundo principal `fora-do-abismo` é recusado. O runner não inicia nem fecha o Foundry, não instala módulos e não altera documentos. Ele abre a Central, percorre as seis áreas para o Mestre, confere a página inicial do Executor, pesquisa e tamanho da janela, e fecha a Central. Operações de escrita são relatadas como **NÃO TESTADO**.

Pré-requisitos: Foundry aberto em um mundo isolado de auditoria, cópia já protegida por backup, Jarvis ativo e `playwright-core` disponível localmente. O runner cria uma sessão de navegador separada. Para usar o Edge local no Windows:

```powershell
node tests/e2e/foundry-smoke.mjs --world jarvis-executor-audit --base-url http://127.0.0.1:30001 --user Gamemaster
```

Se a cópia estiver na página de entrada e `game.world.id` estiver disponível, o runner pode entrar com `--user "Nome do mestre"`. A senha, quando necessária, deve vir de `JARVIS_TEST_PASSWORD` no ambiente, nunca da linha de comando. Se o slug não puder ser verificado, ele termina com **NÃO TESTADO**, sem tentar entrar. A opção `--browser CAMINHO` indica outro executável do Chromium. A opção `--report NOME.json` escolhe o nome do relatório; ele sempre fica na pasta temporária do Windows, em `JarvisE2E`, sem sobrescrever arquivo existente. Não envie o relatório publicamente sem revisá-lo: mensagens de erro podem conter nomes da campanha.

O relatório registra exceções da página, promessas rejeitadas, erros de console, requisições falhas, respostas HTTP com erro e falhas das próprias verificações. Atribuição usa a primeira linha da pilha que cite um módulo; quando aparecem Jarvis e outro módulo, marca possível conflito. Um erro sem pilha clara fica como origem indefinida. O módulo oferece também captura local opt-in, sem upload e limitada a 200 eventos:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
jarvis.diagnostics.capture.start();
// Reproduza o problema no mundo isolado.
jarvis.diagnostics.capture.stop();
const report = await jarvis.diagnostics.run({ checkUpdates: false });
jarvis.diagnostics.download(report);
```

A captura do módulo começa somente após `start()` e não observa erros anteriores. O runner instala o listener do navegador antes de carregar a página; mesmo assim, teste aprovado indica apenas os casos exercitados. É necessário executar sessões separadas para Mestre, Trusted Player e Player. Os casos que exigem criação, efeitos, edição de cena, integrações ou restauração continuam **NÃO TESTADO** até haver automação própria na cópia isolada.
