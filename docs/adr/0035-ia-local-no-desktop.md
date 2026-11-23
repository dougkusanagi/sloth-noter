# 0035 — IA local para operações de texto no desktop

- Status: Proposto
- Data: 2026-11-23

## Contexto

Os primeiros usos pedidos são resumir um trecho, estruturar dados em tabela e reordenar uma lista. O Sloth Note mantém as notas em Markdown e já aplica edições reversíveis no editor. Os modelos pequenos e o custo de distribuição precisam ser avaliados em português, no Linux e no Windows.

## Proposta

Testar primeiro dois modelos GGUF de texto com llama.cpp em CPU. Priorizar, entre os candidatos que conservam os dados e atendem às metas do [plano](../plans/ia-local-desktop.md), o de menor custo de instalação. Incluir Qwen como referência com licença Apache 2.0. Avaliar o LFM3-Omni apenas quando houver uma tarefa com imagens ou áudio.

| Candidato                                                                                   | Arquivo publicado                                            | Licença declarada |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------- |
| [LFM2.5-1.2B-Instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/tree/main) | Q4_K_M, 731 MB                                               | LFM 1.0           |
| [LFM3-1.7B](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/tree/main)                       | Q4_K_M, 1,10 GB                                              | LFM 1.0           |
| [LFM3-Omni-2B](https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/tree/main)                 | Q4_K_M, 1,10 GB. Projetor multimodal Q4_K_M separado, 292 MB | LFM 1.0           |
| [Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/tree/main)                         | Q8_0, 1,83 GB                                                | Apache 2.0        |

O tamanho é o do arquivo publicado. O consumo real em execução será medido. Os resultados de versões com quantizações diferentes devem ser comparados com essa diferença registrada.

Para um eventual piloto no aplicativo, o motor receberia somente a seleção enviada pela ação da pessoa. A interface mostraria a proposta antes de aplicar. Uma única transação do editor substituiria o trecho, com desfazer. Para operações estruturadas, testar JSON restrito por gramática e validar conteúdo e limites no aplicativo antes de montar o Markdown. Para reordenar, validar que cada índice original aparece uma vez e reconstruir com o texto original. Para listas com critério exato, usar ordenação determinística. [Gramáticas do llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md).

## Alternativas

- Executar um servidor manual como requisito do produto. É simples para a prova de conceito, mas cria instalação adicional para quem usa o app.
- Distribuir o modelo com o instalador. Aumentaria o download para todas as pessoas. A proposta é baixar sob demanda, após mostrar o tamanho.
- Serviço remoto. Enviaria o conteúdo selecionado para fora do dispositivo.
- Usar o modelo multimodal como padrão. Os três usos iniciais exigem texto.

## Consequências esperadas

- Com o modelo disponível no dispositivo, as operações de texto poderão ser feitas offline. O modelo e o motor ainda precisam ser avaliados e empacotados.
- A experiência dependerá do desempenho em CPU e da qualidade em português. Confirmar os termos do modelo selecionado e as obrigações de distribuição antes de decidir.
