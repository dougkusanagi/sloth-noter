# 0020 — Estado da sincronização no documento e CORS do servidor

- Status: Aceito
- Data: 2026-11-13
- Complementa: [0018](0018-protocolo-sincronizacao.md)

## Contexto

O motor (`src/sync/engine.js`) precisa de um estado local por servidor: cursor, base comum de
cada nota e os envelopes de imagem já enviados. Se esse estado e as notas fossem gravados em
momentos diferentes, uma queda no meio poderia fazer o próximo envio sobrescrever o texto do
outro aparelho. Além disso, o app chama o servidor a partir da própria origem (`tauri://`,
`http://tauri.localhost` ou o navegador), o que exige CORS.

## Decisão

- O estado fica no próprio documento, no campo `sync = { server, cursor, bases, blobs }`, e é
  gravado na mesma gravação que aplica as notas recebidas (`applySync`). No modo pasta, vai no
  arquivo auxiliar junto de abas e preferências. Segredos nunca ficam nele (ADR 0018).
- Trocar de servidor ignora o estado salvo e recomeça com prévia.
- Uma nota editada enquanto a sincronização rodava não é substituída: a base dela volta ao valor
  anterior e a próxima rodada mescla. Num 409, o motor busca a revisão nova daquela nota mesmo
  que o feed de mudanças já tenha passado por ela.
- O servidor responde a CORS com `Access-Control-Allow-Origin: *`. A autenticação é só pelo
  cabeçalho `Authorization: Bearer`, nunca por cookie, então liberar a origem não expõe dados
  sem a chave. O pré-voo `OPTIONS` responde sem autenticação e sem tocar no armazenamento.

## Alternativas

- Guardar o estado em `localStorage` ou num arquivo separado: duas gravações, sem garantia de
  que nota e estado mudem juntos.
- Restringir CORS a origens fixas: as origens do WebView variam por plataforma e versão do Tauri;
  a proteção real é a chave Bearer.

## Consequências

- O documento cresce com uma cópia das notas sincronizadas (as bases). O backup JSON inclui esse
  campo; restaurá-lo em outro aparelho só pode gerar conflitos resolvidos pela mesclagem.
- Leitores antigos do documento ignoram o campo `sync`.
