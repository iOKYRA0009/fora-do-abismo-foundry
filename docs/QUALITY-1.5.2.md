# Jarvis Tools 1.5.2 — Activities sem aprovação

O bloqueio por aprovação das automações Jarvis foi removido a pedido do proprietário do mundo. A versão é cumulativa sobre 1.4.1, 1.5.0 e 1.5.1; as tags anteriores permanecem intactas.

## Comportamento

- Não há botão de **Uso pelos jogadores**, inspeção para aprovação, nem lista de hashes consultada na execução.
- Quem aciona uma Activity executa seus scripts `automation.pre` e `automation.post` e os efeitos Jarvis configurados no próprio cliente, com as permissões normais do Foundry.
- Uma Activity sem automação Jarvis segue o fluxo nativo do D&D5e. O Jarvis não cancela mais o uso por falta de aprovação ou por papel de usuário.
- Um script `pre` que retorna `false` ainda pode cancelar intencionalmente uma Activity, conforme a regra escrita nessa habilidade. Erros de script continuam sendo informados.
- O registro de aprovações das versões anteriores permanece armazenado no mundo, mas a 1.5.2 não o lê nem altera. Isso evita uma migração destrutiva.

## Atualização

Faça backup do mundo, atualize o módulo em **Add-on Modules** e confirme **1.5.2**. Recarregue o mundo e os clientes dos jogadores. Teste a Activity de Nicolau pela ficha na aba Personagens e a de Jack pelo token. Se uma habilidade ainda não rolar dados, confira se sua Activity nativa contém uma ação de ataque, dano ou teste; um script Jarvis não cria essa rolagem automaticamente.

Testes automatizados verificam execução por Mestre e jogador, ausência de cancelamento sem automação, pré-requisito intencional e remoção de Effect. A validação no Foundry real será feita pelo proprietário.
