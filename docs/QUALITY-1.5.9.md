# Jarvis Tools 1.5.9 — importação de Activities

## Falha recebida

Ao importar um personagem V9.0 em um mundo Foundry V14 / D&D5e 6.1.0, a auditoria V9.1 informou que Activities de Items como Expertise, Sneak Attack e Uncanny Dodge não foram gravadas. O usuário era o dono do mundo e estava como Mestre ativo; a permissão de Mestre não explica essa falha. O aviso de imagem enviada para revisão decorre da reversão após o erro.

## Correção geral

- Associa os Items esperados aos criados por ID, identificador nativo ou nome e tipo. A auditoria não depende mais da ordem de retorno da criação em lote nem do nome exibido por uma tradução, quando há identificador.
- Consulta a coleção de Activities ativa no documento do D&D5e. Uma serialização incompleta do Item não produz uma reprovação indevida.
- Regrava apenas as Activities ausentes por meio do `Item.update` nativo, sem substituir as demais. Audita novamente; se alguma continuar ausente, mantém a reversão da ficha incompleta.
- Aplica a mesma recuperação na sincronização de Activities de uma ficha existente.

## Validação

- Testes automatizados para retorno fora de ordem, nome traduzido, coleção ativa com serialização incompleta, recuperação de Activities ausentes e falha persistente.
- Arquivo V9.0 real fornecido pelo usuário: 44 Items e 39 Activities passaram pelo compilador, adaptador e revisão; simulação de perda e recuperação de todas as 39 Activities passou. Essa simulação não substitui a execução no mundo Foundry do destinatário.
- Sem dependência de módulo parceiro para importar personagens.
