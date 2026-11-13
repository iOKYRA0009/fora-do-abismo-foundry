# Terceiro Trono V3 — Jack Ebonhart

## Instalação

1. Faça cópia do mundo Foundry e atualize o módulo **Fora do Abismo — Jarvis Tools** para esta versão (1.5.6). Ative `socketlib` e recarregue o mundo como Mestre.
   Nesta máquina, o módulo instalado está em `C:\Users\Roger\AppData\Local\FoundryVTT\Data\modules\fora-do-abismo-foundry` e ainda marca versão 1.5.4. Com o Foundry fechado, copie a pasta de mesmo nome do pacote entregue para `Data\modules`, após guardar a pasta antiga.
2. Verifique que as quatro fichas importadas conservam os IDs de Jack, Oswin, Procissão e Bram dos arquivos exportados. Verifique que existe exatamente um usuário jogador chamado **Ruan**.
3. Na **Central Jarvis → Macro Executor → JavaScript (Script)**, abra `examples/JARVIS_TERCEIRO_TRONO_V3_INSTALAR.js`, faça a prévia e execute como Mestre. Não crie um macro tradicional do Foundry.
4. Teste com Jack em cena: selecione seu token, use a Activity **Invocar o Trio** da ficha dele e entre como Ruan para conferir as três fichas na aba Personagens. A permissão de proprietário nas invocações é temporária e volta ao valor anterior quando elas acabam.

O instalador atualiza os quatro Actors pelos IDs, organiza as novas Activities, arquiva as Activities anteriores e conserva os textos originais no arquivo V2 ou em `thirdThroneV3Archive`.

## Regras de mesa [REGRA CASEIRA]

| Escolha | Custo | Economia de ações | Duração |
| --- | --- | --- | --- |
| Uma manifestação | 15 Energia | ação bônus de Jack | até 1 minuto |
| As três juntas | 30 Energia | ação bônus **e reação** de Jack | até 1 minuto |
| Habilidade paga de uma manifestação | 5 Almas | ação dela ou reação de Bram, conforme ficha | efeito próprio |
| Coral da Casa Ausente | 10 Almas acima de 50 | ação de Jack | 2 rodadas |

Oswin, Procissão e Bram têm 30 PV, CA 15, 30 pés de deslocamento, uma ação própria após Jack e ações básicas de NPC (Correr, Desengajar, Esquivar, Ajudar). Uma ação gratuita de sua especialidade substitui sua ação normal. Sem ordem, usam Esquivar. Cada manifestação tem uma ação por rodada; Bram tem uma reação separada. As três compartilham **uma habilidade paga por rodada**. Seus ataques não são uma ação de Jack.

Os 15 por invocação da ficha antiga eram **Energia de Fusão**, não Almas. O trio custaria 45 Energia separadamente; a convocação conjunta fica em 30 Energia porque Jack também abre mão da reação na rodada. As Almas pagam as habilidades de 5 e o Coral de 10.

- **Oswin (controle):** Golpe das Correntes, ataque gratuito `1d6+2` necrótico; Laço do Impossível (5 Almas, CD 17 Força, Restringido até início do próximo turno de Jack na falha, deslocamento −10 pés no sucesso); Fechar as Passagens (5 Almas, até dois alvos próximos, deslocamento 0 na falha).
- **Procissão (terreno/pressão):** Refrão Raso, um espaço de 5 pés de terreno difícil para inimigos sem custo; Coro das Passagens Mortas (5 Almas, raio de 15 pés de terreno difícil, −10 pés na falha em Força); Litania dos Nomes Vazios (5 Almas, até dois inimigos, 2d8 psíquico, metade no sucesso em Sabedoria). O antigo Presságio da Morte com medo é arquivado.
- **Bram (defesa):** Interpor Escudo, reação gratuita que reduz `1d6+3` de uma instância de dano a até 10 pés; Muralha dos Ausentes, reação de 5 Almas que reduz `2d8+4`; Golpe da Sentinela, ação de 5 Almas que causa `2d8+3` contundente. A defesa gratuita e a paga usam a mesma reação.

**Coral da Casa Ausente:** exige as três manifestações vivas e a até 30 pés de Jack. Com uma ação, Jack paga 10 Almas **excedentes** (mínimo 60 Almas atuais) e cria círculo fixo de 90 pés de raio. Apenas inimigos tratam a área como terreno difícil por 2 rodadas. Reativar após expirar custa outra ação e outras 10 Almas excedentes. O efeito termina se alguma manifestação desaparecer; áreas de terreno difícil não acumulam multiplicadores. O módulo cria e remove o molde de área, cobra recursos e registra a regra no chat. **A redução de deslocamento é aplicada pelo Mestre na mesa**; o Foundry não calcula automaticamente terreno difícil para esse molde.

**Fraqueza divina:** as três manifestações recebem vulnerabilidade a dano radiante. Isso é homebrew. Pelo tipo Constructo, não passam a ser automaticamente afetadas por efeitos oficiais exclusivos de Celestiais ou Mortos-Vivos.

Os patamares de 10/25/50 Almas de Jack continuam desbloqueados após gastos voluntários. Arauto de Ossos e Marcha da Morte ainda exigem 100 Almas atuais. Se Jack cair a 0 PV, perde apenas o excedente acima de 50; Almas já gastas não retornam.

## Automação e limites

- O Jarvis cobra Energia/Almas, cria e remove tokens, controla 1 minuto/2 rodadas, verifica uma ação por manifestação e a reação de Bram, concede e restaura as permissões de Ruan, abre as fichas ao invocar e publica custos no chat.
- A reação sacrificada de Jack no trio é registrada no estado e no chat; o Foundry não impede automaticamente que o jogador use outra Activity de reação na mesma rodada. O Mestre deve observar esse custo.
- Posicionamento dos alvos, linha de visão, aplicação de condições, redução de dano e terreno difícil continuam sob arbitragem normal da mesa. A Activity faz as rolagens; se uma Activity for cancelada depois da rolagem, confira o custo no chat.
- A fusão com o Orbe pede aceite voluntário de Jack na primeira invocação.
- O instalador exige Foundry V14 e sistema dnd5e 6.x, conforme `module.json`; não foi executado no mundo ativo deste projeto.

Referência para as ações, reações e terreno difícil: [Regras Básicas D&D 2024 — Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game). As habilidades específicas do Terceiro Trono, seus custos e a fraqueza radiante são regras caseiras da campanha.
