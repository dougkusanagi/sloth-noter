# 0025 — Nova chave de assinatura do atualizador e releases publicadas pela tag

- Status: Aceito
- Data: 2026-11-16

## Contexto

O atualizador do desktop (Tauri) só instala pacotes assinados pela chave privada cuja chave pública
está em `src-tauri/tauri.conf.json`. A primeira chave (`B124ECE4FFDCC822`) foi versionada por engano
no repositório. Na versão 0.3.0 (commit `6e5f8cf`), o arquivo foi removido e a chave pública do app
trocou para `BBAAA258C0703039`. A chave privada correspondente não foi encontrada nesta máquina,
e o secret `TAURI_SIGNING_PRIVATE_KEY` do GitHub continuava com a chave antiga (criado em
2026-10-27). Assim, nenhuma release poderia ser aceita pelos apps 0.3.0 ou mais novos.

Além disso, o workflow `release.yml` criava as releases como rascunho. O endereço
`releases/latest/download/latest.json` só aponta para releases publicadas, então uma tag nova não
chegava aos apps sem publicação manual.

## Decisão

- Gerar uma chave nova (`3BCFAC0C9A68BDF1`), sem senha, como a anterior. A privada fica em
  `~/.local/share/sloth-note/signing/updater.key`, no secret `TAURI_SIGNING_PRIVATE_KEY` e na cópia
  de `bun run credentials:save`. A pública fica em `tauri.conf.json`.
- O workflow publica a release ao terminar (`releaseDraft: false`): enviar a tag `vX.Y.Z` basta para
  os apps receberem a atualização.
- A chave vazada foi mantida localmente como `updater.key.vazada-B124`, só para referência; ela não
  deve assinar nada.

## Alternativas

- Recuperar a chave `BBAAA258C0703039`: preservaria a atualização automática das instalações 0.3.0+,
  mas a chave não foi encontrada.
- Voltar a assinar com a chave vazada: os apps 0.2.0 aceitariam, mas qualquer pessoa com acesso ao
  histórico do repositório poderia assinar uma atualização.
- Manter as releases como rascunho e publicar à mão: dá uma revisão antes, mas a tag sozinha não
  atualiza os apps.

## Consequências

- Instalações anteriores a esta versão confiam em outra chave. Cada pessoa precisa baixar e
  instalar esta versão uma vez, à mão; depois disso, as atualizações voltam a ser automáticas.
- Perder a chave nova repete o problema. Ela precisa estar na cópia cifrada das credenciais.
- Uma tag com erro gera uma release pública imediatamente. Corrija com uma versão nova; não mova a
  tag.
