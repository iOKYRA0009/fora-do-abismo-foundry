# Aprovação de automações de Activity

O Jarvis preserva as flags `automation.pre`, `automation.post` e `automation.effects` dos Itens existentes. Com o uso pelos jogadores desligado, a aprovação individual continua disponível. Ao ligar o controle global, o Mestre autoriza em uma ação as automações já presentes nos personagens. Novas Activities importadas pelo Mestre enquanto o controle está ligado são autorizadas ao concluir a importação.

O módulo expõe `automation.inspect(activity)`, `automation.approve(activity)` e `automation.revoke(activity)` em sua API pública. Só o Mestre ativo pode autorizar ou revogar. A autorização exige UUIDs persistentes de Item e Activity e cobre todo o objeto `automation`, inclusive scripts, efeitos e alvos, além dos dados de todos os Active Effects embutidos no Item. Qualquer alteração invalida o registro anterior. O mundo armazena somente SHA-256 do conteúdo canônico e os UUIDs, sem copiar o código para uma configuração sincronizada com jogadores. Conteúdo acima de 128 KiB não é aceito.

Por padrão, somente o Mestre ativo executa automações Jarvis. O Mestre pode ligar **Uso pelos jogadores** na Central, em **Sistema → Habilidades Jarvis dos jogadores**. Nesse modo, um jogador pode executar uma Activity autorizada de um Actor em que tenha permissão `OWNER`; o script roda com as permissões do próprio jogador. Um segundo Mestre continua sem executar automações. Efeitos em Actors que o jogador não controla e acesso a arquivos/diretórios não ganham permissões extras. Uma Activity alterada depois da autorização deixa de executá-la até ser autorizada novamente.

O controle global registra os hashes das Activities de personagens atuais. Actors do tipo `character` e Actors controlados por jogadores entram nessa autorização. Activities sem UUID estável ou com dados inválidos são ignoradas e aparecem na contagem de falhas do botão. A importação pelo Mestre autoriza Activities válidas quando o controle já estiver ligado.

Em tokens não vinculados, a Activity tem UUID próprio. Uma cópia sem alteração herda a aprovação da ficha original quando o hash de automação e efeitos ainda coincide nos dois documentos. Ao ligar o controle, o Mestre também autoriza Activities existentes em tokens não vinculados nas cenas. Mudanças posteriores no token exigem nova aprovação.

Ao aprovar, revise especialmente código de Itens que jogadores podem editar. Alterar flags depois da aprovação cancela imediatamente a execução; scripts legados continuam guardados no Item para revisão, sem migração destrutiva.
