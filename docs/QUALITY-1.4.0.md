# Jarvis Tools 1.4.0 · Três ferramentas de qualidade

A atualização é independente de módulos terceiros. A pesquisa estudou recursos públicos do Foundry V14, Better Levels, Better Roofs, Universal Battlemap Importer, Monk's Wall Enhancement, Monk's Active Tile Triggers, Baileywiki Mass Edit, FXMaster, Sequencer, Tagger, Scene Packer e Monk's Enhanced Journal. **Nenhum código ou material artístico desses módulos foi incorporado**.

## 1 · Registro de Produção
**Onde:** Central Jarvis > Cenas > Mapas > Registro de Produção.

- Abra a Scene, clique **Capturar e baixar JSON** para exportar uma fotografia técnica do mapa.
- A fotografia inclui dimensões, grade, ambiente, fundos, Tiles, paredes, portas, luzes e sons.
- **Não inclui Tokens, fichas nem atores**, e não grava mudanças na Scene.
- Para verificar alterações após posicionar paredes e luzes, selecione o JSON salvo e clique **Comparar versão**.
- O relatório mostra documentos adicionados, removidos e alterados por ID, além de alterações na grade e no ambiente.
- A ferramenta **não restaura** arquivos ou documentos automaticamente; um snapshot é referência auditável, não backup restaurável. Preserve também backups próprios do mundo Foundry.
- A comparação exige o mesmo ID de Scene e acesso do Mestre.

API: `game.modules.get("fora-do-abismo-foundry").api.scenes.production.capture(scene)` e `.compare(snapshot,scene)`.

## 2 · Inspetor HD na prévia
**Onde:** Central Jarvis > Executor > Validar e visualizar > Ajustar mapa antes de criar.

- Botão **Mostrar grid** para sobrepor a grade real do mosaico e detectar deslocamentos.
- Contornos e nomes dos setores exibidos diretamente sobre a composição.
- Expandir **Inspeção HD** apresenta avisos sobre pixels por célula, bordas desalinhadas, grandes regiões vazias, falta de paredes e iluminação em ambiente escuro.
- Os avisos são **heurísticos**: espaços entre o subsolo, a Catedral e a praça podem ser intencionais. Não rejeitam mapas nem movem arte automaticamente.
- Zoom, pan, luzes e arraste da versão 1.3.0 continuam disponíveis. A prévia **não** simula raycasting e a visão dos jogadores; confirme visão na Scene real com conta de jogador.

API pura: `api.scenes.quality.inspectMosaic(blueprint)`.

## 3 · Diretor de Atmosfera
**Onde:** Central Jarvis > Cenas > Mapas > Diretor de Atmosfera.

Três estados autorais:
- **Liturgia velada:** cerimônia pública aparentemente serena.
- **Fome silenciosa:** sensação opressiva antes de entender o ritual.
- **Ruptura:** instabilidade acentuada para momentos apropriados.

Use **Prévia do clima**, **Aplicar clima**, **Restaurar ambiente**.

Somente o Mestre executa alterações; o comando modifica **apenas** `environment.darknessLevel` e `backgroundColor` na Scene ativa. Não toca em Tiles, paredes, portas, luzes, Token, Actors, áudio, FXMaster ou Sequencer. O valor anterior ao primeiro comando fica guardado na memória da aba, e a opção Restaurar funciona enquanto essa sessão do Jarvis estiver aberta. **Para recuperação durável**, use o Registro de Produção e backup do Foundry.

API: `api.scenes.director.list()`, `.preview(key,scene)`, `.apply(key,scene)`, `.restore(scene)`.

## Limites de segurança e compatibilidade
- Foundry V14 + D&D5e 6.x.
- O Jarvis 1.3.0 de mosaico até quatro mapas é preservado.
- Instalação atualiza o Jarvis Tools; **não instala módulos externos**.
- Os testes automatizados verificam cálculos, diffs, permissão de Mestre e uma Scene falsa; **não equivalem a rodar V14 com GPU, fog e jogadores**. Para uso final, testar num mundo de homologação.

O Foundry V14 possui níveis nativos. O mosaico do Jarvis 1.3.0 continua posicionando setores dentro de um único plano horizontal do grid; o Diretor e o Inspetor não convertem o mapa em andares nativos nem ativam telhados automaticamente.
