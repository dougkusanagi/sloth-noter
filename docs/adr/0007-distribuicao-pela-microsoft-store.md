# 0007 — Distribuição no Windows pela Microsoft Store (MSIX)

- Estado: aceito
- Data: 2026-11-05

## Contexto

O instalador NSIS publicado no GitHub não tem assinatura de código. O Controle inteligente de
aplicativos do Windows 11 bloqueia o `sloth-note.exe` instalado por ele; o SmartScreen mostra um
aviso. A assinatura do updater (`TAURI_SIGNING_PRIVATE_KEY`) só protege as atualizações e não
vale para o Windows. O mantenedor não quer pagar por um certificado de assinatura de código.

## Decisão

- Publicar o app no Windows pela Microsoft Store como **Aplicativo MSIX**. A Microsoft assina o
  pacote na publicação.
- `bun run store:msix` gera o pacote a partir do mesmo código, com a feature Cargo `store`.
- Nessa feature, `update_environment` retorna `false` no Windows: o atualizador próprio fica
  desligado e a Store cuida das atualizações.
- A identidade do pacote (nome, publisher) vem do Partner Center e fica em
  `src-tauri/windows/store/identity.json`. Esses valores não são segredos.

## Alternativas

- **"Aplicativo EXE ou MSI" no Partner Center**: aceita o instalador NSIS atual, mas a Store
  exige que ele já venha assinado por uma autoridade confiável. Não resolve o bloqueio.
- **Certificado OV/EV ou Azure Trusted Signing**: resolve fora da Store, mas é pago.
- **SignPath Foundation**: gratuito para código aberto, mas depende de aprovação externa.

## Consequências

- O instalador NSIS e o atualizador do GitHub continuam existindo. Usuários que instalarem por
  eles continuam vendo o bloqueio ou o aviso.
- Cada envio à Store precisa de uma versão maior; o pacote usa `X.Y.Z.0`.
- O pacote MSIX roda em contêiner de app: a pasta de instalação é somente leitura. O app já grava
  os dados na pasta de dados do usuário, mas isso ainda não foi testado num pacote instalado.
