# IA local no desktop

## Objetivo

Validar um modelo local para resumir trechos em português, converter dados em tabelas Markdown e reordenar listas por critério textual. A proposta de arquitetura está no [ADR 0035](../adr/0035-ia-local-no-desktop.md).

## Etapas

- [x] Selecionar candidatos com arquivos GGUF oficiais e registrar tamanho, licença e ferramentas.
- [ ] Medir LFM2.5-1.2B-Instruct e LFM3-1.7B com a mesma versão do llama.cpp, em CPU, usando textos fictícios. Usar Qwen3-1.7B como referência se a licença ou qualidade dos candidatos impedir a adoção.
- [ ] Comparar os resultados em Windows e Linux e decidir se há caminho para o piloto.
- [ ] Prototipar uma ação de seleção com prévia, cancelar e aplicar com desfazer. Confirmar que uma edição ou troca de nota enquanto a geração está ativa invalida a proposta.
- [ ] Empacotar o motor nas plataformas escolhidas, com download do modelo sob demanda. Verificar hash, interrupção, retomada, falta de espaço, cancelamento e remoção.
- [ ] Verificar em binário real, sem conexão após a instalação do modelo. Conferir também a desativação, retomada após falha e ausência de envio, execução de ferramentas ou coleta de conteúdo.

## Medição

- Conjunto inicial de 18 exemplos em português, seis por operação. Cobrir nomes com acentos, números e datas semelhantes, linhas repetidas, campos vazios e dados que precisam permanecer na mesma linha.
- Resumo precisa conservar pessoas, datas e fatos fornecidos. Tabelas precisam conservar linhas e colunas, incluir campos vazios e escapar o caractere de barra vertical. Reordenação precisa preservar cada item e seu Markdown.
- Registrar versão do executável e revisão do modelo, CPU, RAM, máximo de tokens, configurações, memória de pico, latência com modelo frio e aquecido e resultados de cada exemplo. Metas iniciais a confirmar na máquina de referência: primeira resposta em até 3 s com o modelo aquecido e até 15 s para operação curta.
- Critério para o piloto: todas as respostas que alterem listas ou tabelas passam na validação estrutural e os exemplos de resumo preservam os fatos essenciais. Registrar falhas individuais, inclusive respostas rejeitadas.

## Próximo passo

Executar a comparação local. A pesquisa documental não mediu desempenho, consumo de RAM ou qualidade das respostas.
