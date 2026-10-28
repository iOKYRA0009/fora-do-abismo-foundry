# PADRÃO HD DE MAPAS | FORA DO ABISMO

**Protocolo artístico complementar à [Matriz Oficial de Mapas](MATRIZ-CRIACAO-MAPAS.md).** Aprovado apenas como direção técnica proposta; não altera a lore nem o esquema atual. Referência: Jarvis Tools 1.2.3.

## Objetivo

Produzir mapas que mantenham nitidez e leitura no zoom do Foundry, preservando o fluxo **criar arte → montar pacote → prévia ajustável → executar**.

### Dois níveis de produção

- **HD equilibrado, primeiro piloto:** 128 pixels de **arte real** por célula. Mapa 25 × 20 = **3200 × 2560 px**.
- **Premium:** 160 pixels por célula. Mapa 25 × 20 = **4000 × 3200 px**. Se um render único não atingir qualidade local, produzir quatro setores de 2000 × 1600, guiados por planta única e continuidade verificada entre bordas.

Recortar ou redimensionar um mapa pequeno **não** cria detalhes. Quatro Tiles têm custo de textura próximo ao de uma arte única com a mesma quantidade de pixels; atenção à memória GPU.

## Pipeline permanente

1. Definir planta-mestra tática, grade, entradas, paredes, terrenos, elevações e pontos de interesse.
2. Gerar chão e arquitetura de cima, sem tokens, grade, texto, círculos nem marcações de Foundry pintadas.
3. Renderizar detalhes reais em alta resolução: materiais, pedras, raízes, tábuas, móveis, água e sombras coerentes.
4. Se houver mosaico, gerar setores usando bordas de referência e sobreposição; revisar emendas, continuidade de caminhos, perspectiva e cores.
5. Se a cena precisar, criar imagens **separadas e transparentes** de telhados e copas; o Foundry V14 oferece Tiles overhead com oclusão ao mover tokens.
6. Inspecionar a arte em zoom de 100% e 200%. Sem nitidez convincente, corrigir **a arte** antes do pacote Jarvis.
7. No Jarvis, anexar imagens e construir cena com `imagePlacement`, `structures`, portas, luzes, tokens e visão; usar prévia editável antes da confirmação.
8. Guardar o JSON exportado depois dos ajustes como fonte de verdade das coordenadas.

## Implementação: o que funciona hoje versus futuro

**Jarvis 1.2.3:** pacote raiz `jarvis-executor-1`, cenas `1.0`, imagens externas ou base64, apenas **um background Tile** gerado por `scene.backgroundSrc`, geometria calibrada e prévia arrastável.

**Futuro, requer código + testes reais:** mosaico de Tiles posicionados automaticamente, overlays transparentes com oclusão, prévia multicamada, integridade de imagens e gerenciamento da memória. Campos como `scene.imageTiles` ou `scene.overheadTiles` seriam **propostas**, não parte do esquema vigente.

**Limites atuais:** 8 MB/imagem, 48 MB em assets por pacote e aproximadamente 12 MB no texto JSON, com aumento por base64. Caso exceda, permitir JSON + múltiplas imagens selecionadas de uma vez; futura importação ZIP deve validar caminhos e tamanhos. Nunca inventar suporte ZIP já disponível.

## Primeiro teste de aprovação

Refazer a **Cabana na Floresta Sombria** (25 × 20) em **3200 × 2560 px com detalhes genuínos**, não upscale simples. Conferir visualmente lareira, piso, telhado, árvores e rio em zoom. Somente depois adicionar camadas e avaliar necessidade de mosaico.

**Regra:** a melhoria do importador não substitui a melhoria da arte. O Mestre não deve montar quatro partes manualmente.
