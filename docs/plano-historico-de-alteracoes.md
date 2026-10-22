# Plano — Histórico local de alterações

Decisão e formato: [ADR 0002](adr/0002-historico-de-alteracoes.md). Primeira entrega: só desktop
(Tauri). Cada etapa pode virar um commit próprio, com testes passando.

## Etapa 1 — Armazenamento no backend (Rust)

- Módulo `src-tauri/src/history.rs`:
  - `history_append(entries)`: acrescenta linhas JSONL em `history/<id-da-nota>/<AAAA-MM-DD>.jsonl`.
  - `history_snapshot(text) -> hash`: grava `history/objects/<sha256>.md.gz` se ainda não existir.
  - `history_list(id)`, `history_read(id, dia)`, `history_object(hash)` para a tela de histórico.
  - `history_clear(id?)`: apaga o histórico de uma nota ou todo o histórico.
  - Compactação e retenção ao iniciar o app e uma vez por dia: gzip dos dias anteriores, limite de 30
    dias / 20 MB e proteção da última cópia de abertura de cada nota externa.
  - Permissões `0700`/`0600`. Escrita com `O_APPEND`. Uma linha corrompida no fim é ignorada na
    leitura.
- Testes em Rust: acréscimo, deduplicação por hash, retenção, limite de tamanho e leitura com a
  última linha cortada.

## Etapa 2 — Núcleo no frontend

- `src/history.js` (sem dependência do Tauri, testável com `node --test`):
  - `diffTexts(antes, depois)`: diferença por prefixo e sufixo comuns → `{de, removido, inserido}`.
  - `fromTransaction(tr)`: trechos de uma transação do CodeMirror com `startState.sliceDoc`.
  - `applyBackward/applyForward`: aplica as entradas nos dois sentidos, para reconstruir versões.
  - Agrupamento: junta digitação da mesma origem em até cerca de 2 s; não junta colagens, remoções
    grandes nem mudanças de disco.
  - Alertas: `remocao-grande` (mais de 200 caracteres ou mais de 20%) e `colagem-sem-gesto`.
  - Fila com envio em lote, por exemplo a cada 1 s e ao fechar, sem bloquear o salvamento. Uma
    falha mostra um único aviso por sessão.
- Testes: diff com acentos e emojis, ida e volta (`applyBackward(applyForward(x)) === x`),
  agrupamento e alertas.

## Etapa 3 — Captura no editor

- Extensão do CodeMirror (`src/editor/history-log.js`) que lê `userEvent` de cada transação com
  mudança.
- Expor em `src/paste-intent.js` e `src/middle-click-paste.js` o último gesto (`ctrl+v`,
  `shift+insert`, `botao-meio`, `menu`, `nenhum`) para preencher `gesto`.
- Dar origem explícita às mudanças feitas pelo app: tarefas, listas, formatação, blocos inseridos e
  substituições de busca.

## Etapa 4 — Rede de segurança na gravação

- No caminho de persistência (`persistence-desktop.js`, `persistence-vault.js`,
  `external-notes.js`, `vault-sync.js`), comparar o `body` anterior com o novo de cada nota e
  registrar a diferença que a etapa 3 não registrou (pelo hash do texto final).
- Leituras do disco (vault alterado pelo OneDrive ou pelo Obsidian, nota externa alterada fora do app)
  → cópia completa antes de aceitar e entrada `disco`/`disco-externo`.
- Modo Código (`textarea`) → origem `codigo`.

## Etapa 5 — Cópias das notas externas

- Ao abrir, antes da primeira gravação da sessão, nas duas versões de um conflito e ao "Copiar
  para minhas notas".

## Etapa 6 — Tela "Histórico da nota"

- Ação no menu da nota e na paleta de comandos.
- Lista de versões agrupadas por dia: horário, origem em linguagem simples ("Colado sem Ctrl+V",
  "Alterado fora do app"…) e alertas em destaque.
- Prévia do que saiu e do que entrou, e "Restaurar esta versão", que também é registrada.
- Estados: carregando, sem histórico, histórico desligado e erro de leitura.
- Configurações: desligar, apagar o histórico desta nota e apagar todo o histórico.
- Verificação visual em desktop e mobile, nos temas claro e escuro.

## Etapa 7 — Testes E2E e entrega

- E2E (Playwright): editar, colar e apagar um trecho grande → a tela mostra as versões e o alerta →
  restaurar devolve o texto.
- Changelog: "Adicionado: histórico local de alterações com restauração de versões".
- Atualizar o ADR 0002 para "aceito" e documentar em `docs/RECURSOS.md`.

## Fora do escopo agora

- Versão web (IndexedDB).
- Histórico de imagens e anexos.
- Sincronizar o histórico entre máquinas.

## Entrega em 2026-10-22

As sete etapas foram implementadas. A validação inclui testes unitários JavaScript, testes Rust
com retenção e permissões, E2E com a ponte nativa simulada e inspeção de capturas em desktop e
mobile, nos temas claro e escuro. A validação do armazenamento real é feita pelos testes Rust;
o E2E não inicia uma janela Tauri.

Cada versão referencia um objeto completo deduplicado, além do diário de diferenças, para manter
a restauração independente de entradas anteriores removidas pela retenção. Veja os detalhes no ADR.
