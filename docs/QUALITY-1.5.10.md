# Jarvis Tools 1.5.10 — auditoria de dano e salvaguarda

O arquivo V9.0 de um personagem com 44 Items e 39 Activities passou pela adaptação. Após a correção 1.5.9, a importação no Foundry deixou de relatar Activities ausentes, mas rejeitou fórmulas e tipos de dano e atributos de salvaguarda.

## Causa

No modelo oficial D&D5e 6.1.0, `damage.parts[].types` e `save.ability` são campos `SetField`. O JSON e o adaptador fornecem arrays. A auditoria comparava `Set` com array diretamente, gerando erros mesmo quando os elementos eram iguais. A representação interna não altera a regra do personagem.

## Correção

- Normaliza `Set` e array para listas antes de comparar tipos de dano e atributos de salvaguarda.
- Mantém a rejeição se o tipo de dano, a fórmula, o atributo ou a CD realmente mudarem.
- Aceita o mesmo formato V9.0 do arquivo anterior; V9.1 permanece opcional.

## Verificação

Os testes cobrem os campos `Set` do D&D5e e uma divergência real de tipo de dano. Uma simulação com os 44 Items e 39 Activities do arquivo recebido passou pela auditoria com os campos convertidos em `Set`. A execução no mundo Foundry do destinatário continua sendo a verificação final.
