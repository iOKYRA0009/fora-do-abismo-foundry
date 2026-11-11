# Jarvis Tools 1.5.1 — correção de autorização em tokens

Esta atualização é cumulativa sobre 1.4.1 e 1.5.0. As tags anteriores não foram alteradas.

## Correção

- Uma Activity aberta pela ficha de um token não vinculado usa UUIDs diferentes dos da ficha original. Agora ela herda a autorização da ficha original somente se Item, Activity, script, configuração e Active Effects embutidos coincidirem com o conteúdo ainda aprovado.
- Ao ligar **Sistema → Habilidades Jarvis dos jogadores**, o Mestre autoriza também Activities dos tokens não vinculados já presentes nas cenas. Isso cobre alterações que existam somente no token.
- O aviso de bloqueio passa a mostrar se faltou aprovação, se os dados são inválidos, se o registro está indisponível ou se a automação excede o limite.

A permissão `OWNER` e a exigência de Mestre ativo para aprovar continuam valendo. Scripts e efeitos alterados depois da autorização não são liberados automaticamente.

## Atualização e verificação

Faça backup do mundo, atualize **Fora do Abismo — Jarvis Tools** em **Add-on Modules** e confira a versão **1.5.1**. Recarregue o mundo. Na Central, deixe **Uso pelos jogadores** ligado; se o token tiver uma automação própria que já estava alterada antes da atualização, desligue e ligue o controle uma vez para autorizar o estado atual. Teste a Activity pela ficha aberta no token.

Os testes automatizados cobrem cópia de token idêntica, mudança de script no token, mudança na ficha original e Activity existente somente no token. A execução em um mundo Foundry real ainda será verificada pelo proprietário.
