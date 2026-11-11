# Jarvis Tools 1.5.3 — Compêndios em português

Versão cumulativa sobre 1.4.1 a 1.5.2. O Babele permanece opcional e separado do Jarvis.

## Três melhorias

1. **Busca bilíngue:** a busca global e a busca de um compêndio usam o nome apresentado pelo Babele, o nome original informado por ele e equivalências do glossário Jarvis. A busca não abre documentos completos até o usuário abrir, pré-visualizar ou importar um resultado.
2. **Tradução assistida:** termos comuns de D&D vêm no glossário; o Mestre pode salvar até 500 equivalências próprias em JSON na Central. **Rascunho PT-BR** mostra o nome e a descrição antes de importar. Na ausência de tradução do Babele, substituições literais de termos são aplicadas aos textos de descrição. HTML, referências Foundry e comandos de dados ficam intocados. Isso é um rascunho parcial, não tradução automática de prosa livre nem validação de regras.
3. **Sincronização de Items:** importações de Items feitas pela Central a partir desta versão registram o compêndio, o identificador da fonte e o estado inicial. O Mestre escolhe o compêndio, usa **Ver atualizações** e revisa campos novos e conflitos antes de aplicar. Campos locais editados são preservados. A prévia é limitada a 200 Items por compêndio; fontes removidas não são alteradas. Items antigos sem base de comparação não são atualizados automaticamente.

## Uso

Ative o Babele e um pacote de tradução PT-BR se desejar traduções completas disponíveis nesse pacote. A 1.5.3 funciona sem ele, com o glossário limitado. Em **Add-on Modules**, atualize Jarvis Tools para **1.5.3**, recarregue o mundo e abra **Central → Biblioteca → Compêndios**. Busque por um nome em inglês e outro em português; use **Rascunho PT-BR**; importe um Item pela Central para habilitar sincronizações futuras.

Os menus do Foundry dependem de uma localização PT-BR própria. A 1.5.3 não altera compêndios originais, não copia código do Babele e não modifica dados ou fórmulas de dados ao criar um rascunho. A sincronização pode receber alterações de dados da fonte apenas em campos ainda iguais aos da importação; por isso exige prévia do Mestre.
