# Jarvis Executor — validação da versão 1.2.0

## Origem e proteção dos dados

- Base: tag `v1.1.0`, commit `a9b506e203823da0e14fab960865ce163fa6a652`.
- Branch de trabalho: `feat/jarvis-executor-final`, criada diretamente da tag.
- Backup inicial fora do repositório e dos mundos: `%USERPROFILE%\Documents\JarvisBackups\Executor-20261028-035055-ae67c781`. Contém `jarvis-v1.1.0-source.zip` e `repository-before-work.bundle`, verificados antes das alterações.
- O Foundry real do usuário, os mundos oficiais e os arquivos sincronizados do projeto permaneceram intocados. Os testes de escrita ocorreram apenas na cópia `%LOCALAPPDATA%\Temp\JarvisExecutorFoundryTest-20261028-035436-5ad112af`, mundo `jarvis-executor-audit`.

## Implementação concluída

- Central com seis áreas. Executor inicial para Mestre; Biblioteca inicial para jogador. Ferramentas anteriores preservadas em áreas avançadas.
- Executor com prévia de JavaScript ou JSON, confirmação explícita do risco do JavaScript, histórico e reversão conservadora dos documentos criados por pacote JSON.
- Pacote `jarvis-executor-1` com Actor V9, itens, Activities, cenas, paredes, portas, luzes, Tokens, cinco tipos de imagem e perfis Visage/Metamorph. Perfis são registrados apenas em Actor novo do mesmo pacote, sem ativação automática no Token.
- Validação de dados, imagens, coordenadas, referências, módulos opcionais e permissões antes de escrever. Adição de itens em Actor preexistente é recusada por risco de alterar metadados fora da reversão.
- Imagens enviadas não são apagadas automaticamente na reversão; permanecem identificadas no histórico para revisão do Mestre.

## Evidência de testes

- Suíte Node: **212/212 passaram**.
- Smoke visual: **6/6 passaram** no Foundry V14 Build 369 e D&D5e 6.0.6, mundo isolado. Relatório: `%TEMP%\JarvisE2E\jarvis-e2e-1793189715680.json`.
- Executor real: **12 casos passaram**: prévia, NPC com Activities, rolagem de ataque, cena com parede/porta/luz/Token, imagens, estado dos módulos opcionais, perfis JSON, rejeição de JSON inválido, asset ausente, duplicação, falha forçada de upload e reversão. Relatório: `%TEMP%\JarvisE2E\executor-real-1793189674523.json`.
- A renderização completa das camadas no canvas ficou **não confirmada** no Edge sem interface. O documento da cena contém exatamente as paredes, luz e Token esperados. O navegador de teste registrou erros internos de renderização do Foundry/D&D5e sem quadro Jarvis; a inspeção visual em janela normal ainda é recomendada.
- Permissões reais: usuários temporários Player e Trusted viram a Biblioteca sem Executor; `preview`, `history`, `rollback` e `run` foram recusados para ambos. Os usuários de teste foram removidos e as contagens de Actors, Scenes e Items ficaram iguais antes e depois.

## Publicação

- Versão preparada: `1.2.0`, ainda não publicada neste checkpoint.
- A workflow `.github/workflows/release.yml` publica a tag e os assets no push da `main`. Antes de publicar, confirmar novamente testes, backup final e estado remoto. Depois, verificar tag, manifesto e ZIP publicados.
