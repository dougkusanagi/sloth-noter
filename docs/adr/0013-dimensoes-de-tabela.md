# 0013. Dimensões de tabelas no Markdown

- Status: Substituído por 0014
- Data: 2026-11-12

## Contexto

O editor permite redimensionar colunas e linhas. O Markdown GFM não representa essas medidas. As configurações de cabeçalho já acompanham a tabela em um comentário (ADR 0012).

## Decisão

Estender o comentário existente com `widths=120,240` e `heights=36,80`, em pixels CSS, por posição visual, incluindo o cabeçalho e excluindo a linha separadora Markdown. Zero ou ausência de medida indica tamanho automático. Valores inválidos são ignorados; larguras aceitam 48–1600 e alturas 28–1200. A altura é mínima: conteúdo maior continua visível. O arraste grava uma transação ao terminar e pode ser cancelado com Escape; desfazer usa o histórico do editor. As configurações de cabeçalho continuam sendo lidas e preservadas.

## Alternativas

Guardar as medidas fora da nota perderia a configuração ao transportar o arquivo. Converter a tabela em HTML prejudicaria a edição Markdown.

## Consequências

Outros leitores ignoram as medidas. As medidas pertencem às posições de linhas e colunas; mudanças no conteúdo podem aumentar as alturas. Exportações levam os textos das células, sem dimensões, imagens ou formatação. XLSX usa células de texto para preservar identificadores e evitar interpretação como fórmulas. CSV usa UTF-8 com BOM, ponto e vírgula e prefixa textos iniciados por caracteres de fórmula com apóstrofo.
