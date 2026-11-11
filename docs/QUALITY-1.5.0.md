# Jarvis Tools 1.5.0 — Quality of Life

## Atualização

1. Faça backup do mundo no Foundry.
2. Em **Add-on Modules**, atualize **Fora do Abismo — Jarvis Tools** pela URL do manifesto: `https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/latest/download/module.json`.
3. Confirme a versão **1.5.0**, abra o mundo e recarregue a página.
4. Teste primeiro uma ficha de exemplo. Esta versão não migra fichas existentes nem altera Actors automaticamente.

## Mudanças

- Importação V9 de Actor e Items em duas etapas: prévia e confirmação. A revisão mostra atributos, PV, CA, recursos, imagens, Items, Activities, Effects, avisos e conflitos. Alterar JSON, arquivo ou Actor selecionado invalida a prévia.
- Duplicatas são bloqueadas antes de criar documentos, por nome/tipo ou identificador estável quando disponível. Importar Actor continua criando **uma ficha nova**; não sobrescreve PV, slots, condições, imagens nem configurações existentes.
- Validação aponta o campo problemático em dano, CD, ataque, consumo, recuperação, efeitos e IDs de Activity. Alvos de consumo repetidos na mesma Activity são bloqueados para evitar cobrança duplicada. Classe, subclasse e Advancement incompletos recebem aviso.
- O Executor mantém o fluxo de prévia, confirmação, histórico e reversão conservadora. **Baixar relatório** exporta um JSON com estados PASSOU/FALHOU/MANUAL/NÃO TESTADO por execução e documento. Activity individual fica como NÃO TESTADO até verificação em jogo. JavaScript arbitrário continua exigindo consentimento e não tem reversão automática.
- A busca prioriza nome exato, início do nome e início de palavra, preservando cache, limite, cancelamento e permissões. A Central preserva Executor, Biblioteca, Personagens, Cenas, Aparências e Sistema, favoritos e preferências anteriores.
- Resultado e prévia usam mais espaço, contraste e responsividade. O aviso de compatibilidade do V9 agora corresponde à versão verificada no manifesto: D&D5e 6.0.6.

Os schemas permanecem `9.0` (Actor Importer), `jarvis-executor-1` (Executor) e `1.0` (Scene Package). Não há mecânicas de RPG novas.

## Compatibilidade e limites verificados

- Manifesto: Foundry V14; D&D5e mínimo 6.0.0, verificado 6.0.6. Versões posteriores de D&D5e 6.0.x exibem aviso e não foram declaradas verificadas.
- Testes locais: `node --test tests/*.test.js` — **260 passaram, 0 falharam**. `git diff --check` passou.
- Foundry real, GPU/canvas, permissões em mundo ativo e integrações DAE, Tidy5e, Nik's Tweaks, Visage e Metamorph: **NÃO TESTADOS nesta entrega**. Os manifestos locais desses módulos foram encontrados, mas isso não substitui execução no mundo.
- Sem benchmark comparável antes/depois em Foundry. Esta versão não reivindica ganho medido de desempenho.

## Roteiro rápido para testar no mundo

Registre PASSOU/FALHOU e a mensagem exibida em cada caso:

1. Abra a Central como Mestre e como jogador; confira as seis áreas, navegação por teclado, favoritos e permissões.
2. Importe um Actor V9 novo com retrato, Item, Activity e Effect. Confira atributos, PV, imagem de ficha/Token e uso da Activity.
3. Tente importar o mesmo Actor novamente. Deve mostrar conflito e preservar a ficha original. Compare também um Actor renomeado com `sourceId`.
4. Adicione Items a uma ficha de teste, repita a importação e confira que Items, recursos e condições anteriores permanecem intactos.
5. Revise consumo e recuperação de Activity, incluindo uma entrada com alvo de consumo repetido; a segunda deve ser recusada antes de importar.
6. Execute um pacote Executor com Actor e Scene de teste; confira paredes, portas, luzes, tokens, histórico, relatório e reversão. Imagens enviadas podem permanecer depois da reversão.
7. Teste Visage, Metamorph, DAE, Tidy5e e Nik's Tweaks apenas se ativos no seu mundo. Envie os resultados para ajustes.

## Recuperação

- Antes de atualizar, guarde backup do mundo. Para voltar ao código anterior, instale o `module.json` ou ZIP da [release v1.4.0](https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/tag/v1.4.0) e mantenha a atualização automática desativada até a correção.
- Trocar a versão do módulo não desfaz documentos criados. Para pacotes do Executor, use **Histórico e recuperação → Reverter pacote**. A reversão é conservadora e pode exigir revisão manual se documentos foram alterados depois.
- Imagens enviadas permanecem no armazenamento após falha ou reversão; o erro e o histórico informam os caminhos conhecidos. Não apague arquivos antes de verificar referências em cenas e fichas.
