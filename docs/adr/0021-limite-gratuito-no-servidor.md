# 0021 — O servidor para antes de sair do plano grátis do R2

- Status: Aceito
- Data: 2026-11-13
- Complementa: [0018](0018-protocolo-sincronizacao.md)

## Contexto

O R2 exige cartão para ser ativado, mesmo no plano grátis, e cobra automaticamente o que passar
da franquia mensal (10 GB-mês, 1 milhão de operações Classe A, 10 milhões Classe B). O
Cloudflare não oferece limite rígido de gasto para o R2: os alertas de orçamento só avisam por
e-mail. O usuário escolheu o R2, com a condição de nunca passar da franquia grátis.

## Decisão

- O Worker conta o uso no D1 (`migrations/0002_usage.sql`): bytes de cada imagem guardada e, por
  mês (UTC), as escritas e leituras feitas no R2. A contagem acontece antes da operação, então
  uma chamada que falha também conta, como o R2 cobra.
- Limites com folga para operações que o Worker não vê (painel, exportação manual):
  9 GB, 900 mil escritas e 9 milhões de leituras por mês (`FREE_LIMITS`).
- Ao atingir um limite, o servidor responde 507 `quota_exceeded` sem tocar no R2. Uma imagem que
  já existe é reconhecida pelo D1, sem nova operação no R2.
- No app, a nota que depende de uma imagem recusada espera; as demais notas continuam
  sincronizando, e a tela explica o limite.

## Alternativas

- Workers KV no lugar do R2: grátis sem cartão, mas só 1 GB e mil gravações por dia, e o Worker
  não consegue conferir o hash de imagens grandes dentro do limite de CPU. Chegou a ser
  implantado e foi descartado a pedido do usuário.
- Só alertas de orçamento: não impedem a cobrança.

## Consequências

- Cada operação de imagem grava também no D1, dentro da franquia grátis dele.
- O limite não protege contra uso fora do Worker (painel do Cloudflare, outras ferramentas com a
  mesma conta). Recomenda-se também um alerta de orçamento baixo na conta.
- Não há limpeza automática de imagens (ADR 0018): o espaço só diminui se alguém apagar imagens
  no servidor e em `blob_sizes`.
