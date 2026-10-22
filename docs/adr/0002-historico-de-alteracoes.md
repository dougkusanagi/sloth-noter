# 0002 — Histórico local de alterações das notas

- Estado: aceito
- Data: 2026-10-22

## Contexto

O app guarda apenas um passo anterior do estado (`*.previous`). Em 2026-10-22 o conteúdo de um
bloco de código em `À Fazer.md` sumiu e não foi possível recuperar o texto nem descobrir a causa:
pode ter sido o editor, uma colagem não pedida, a sincronização do OneDrive ou o Obsidian, que usa
a mesma pasta. Também já houve colagens sem Ctrl+V nem clique do botão do meio
(`src/paste-intent.js`).

Precisamos de um registro que permita **auditar** (o que mudou, quando e por qual origem) e
**recuperar** (voltar a qualquer versão), ocupando pouco espaço.

## Decisão

Cada nota ganha um histórico local, fora do vault, em
`<app_data_dir>/history/` (Linux: `~/.local/share/dev.slothnote.app/history/`).

### Diário (JSONL, só acréscimo)

Cada linha registra uma alteração com o texto **removido e inserido**, para o diário poder ser
aplicado nos dois sentidos:

```json
{
  "v": 1,
  "t": 1792680271000,
  "nota": "<id>",
  "caminho": "À Fazer.md",
  "rev": 42,
  "origem": "input.paste",
  "gesto": "nenhum",
  "base": "<sha256 do texto antes>",
  "mudancas": [{ "de": 812, "removido": "…", "inserido": "" }]
}
```

- `origem`: o `userEvent` do CodeMirror (`input.type`, `input.paste`, `input.drop`, `delete`,
  `undo`, `redo`, `input.replace`…) ou uma origem do app (`codigo`, `tarefa`, `lista`,
  `formatacao`, `disco`, `disco-externo`, `restauracao`, `sistema`).
- `gesto`: o último gesto que permite colar (`ctrl+v`, `shift+insert`, `botao-meio`, `menu`,
  `nenhum`). Uma colagem com `gesto: nenhum` recebe `alerta: "colagem-sem-gesto"`.
- Digitação contínua (inclusive acentos e pequenas remoções com Backspace ou Delete) em até cerca de 2 s vira uma única entrada. Colagens,
  remoções grandes e mudanças de disco nunca são juntadas.

### Duas camadas de captura

1. **Editor (CodeMirror):** registra a origem e o gesto, com os trechos tirados de
   `tr.startState.sliceDoc`.
2. **Gravação (rede de segurança):** sempre que o `body` de uma nota muda ao ser persistido,
   o app compara o texto anterior com o novo (prefixo e sufixo comuns) e registra a diferença com a
   origem conhecida, ou `sistema` quando não houver. Mudanças que a camada 1 já registrou, com o
   mesmo hash de texto final, não são duplicadas. Mudanças lidas do disco (vault, OneDrive,
   Obsidian, arquivos externos) entram como `disco`/`disco-externo`.

### Cópias completas (snapshots)

Guardadas com gzip e pelo hash do conteúdo, em `history/objects/<sha256>.md.gz`. Um conteúdo já
guardado não é gravado de novo. O app faz uma cópia:

- ao abrir uma nota em cada sessão e a cada 200 entradas do diário;
- antes de uma remoção grande: mais de 200 caracteres ou mais de 20% da nota de uma vez
  (`alerta: "remocao-grande"`);
- antes de aceitar uma mudança vinda do disco;
- **notas externas:** ao abrir (texto exato do disco), antes da primeira gravação da sessão, das
  duas versões em um conflito "usar a do disco / manter a minha" e ao "Copiar para minhas notas".

### Espaço e retenção

- Um diário por nota e por dia; os dias anteriores são comprimidos com gzip.
- Limite padrão: 30 dias **ou** 20 MB, o que vier primeiro. Os mais antigos saem primeiro. A cópia
  de abertura mais recente de cada nota externa só sai quando houver outra mais nova.

### Segurança e falhas

- Arquivos e pastas com permissão `0600`/`0700`. O histórico nunca vai para o vault nem para a
  rede.
- Falhar ao gravar o histórico **nunca** impede o salvamento da nota. O erro é mostrado uma vez
  por sessão, em linguagem simples.
- Configurações: ligar/desligar o histórico, apagar o histórico de uma nota e apagar todo o histórico.
  A captura começa desligada e só é ativada por escolha explícita.

### Recuperação

A tela "Histórico da nota" lista versões com horário, origem e alertas, mostra o que mudou e
oferece "Restaurar esta versão". A restauração também é registrada (`origem: restauracao`), então
pode ser desfeita.

## Consequências

- Recuperar texto perdido não depende mais do OneDrive. As causas ficam visíveis pela origem e
  pelo gesto.
- O formato `v:1` precisa continuar legível nas próximas versões. Mudanças de formato exigem migração
  ou leitura das duas versões.
- O histórico guarda texto apagado de propósito, inclusive dados sensíveis, até a retenção vencer
  ou o usuário apagar.
- A versão web fica sem histórico na primeira entrega.

## Detalhes da primeira implementação

Além dos pontos mínimos acima, cada versão registrada referencia uma cópia completa por hash.
Isso permite restaurar versões sem depender de uma cadeia de diferenças que a retenção possa
remover. Os conteúdos continuam deduplicados e sujeitos ao mesmo limite de espaço. Os diretórios
das notas usam SHA-256 do identificador para não aceitar caminhos vindos da interface.
A última cópia protegida de uma nota externa pode exceder idade e espaço até ser substituída.

## Correção de desempenho

O histórico não participa da fila de salvamento das notas. A captura desligada não prepara
transações nem calcula diferenças. A digitação é agrupada sem recalcular o diff completo a cada
tecla; o diff agrupado é calculado uma vez ao enviar. Os envios aguardam 2 s de pausa ou 10 s de
uso contínuo, com apenas um envio em andamento. Abertura da tela de histórico e fechamento da
janela enviam os dados pendentes. O acréscimo verifica apenas o final do diário para recuperar
uma linha incompleta; a manutenção completa fica restrita à inicialização, execução diária e
excesso do limite de espaço.
