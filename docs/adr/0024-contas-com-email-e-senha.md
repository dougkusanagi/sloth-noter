# 0024 — Contas com e-mail e senha na sincronização

- Status: Aceito
- Data: 2026-11-16
- Substitui em parte: [0023](0023-perfis-e-espacos-de-sincronizacao.md) (credencial de espaço gerada
  pelo administrador e a recusa de contas com e-mail e senha)
- Complementa: [0018](0018-protocolo-sincronizacao.md), [0019](0019-criptografia-da-sincronizacao.md),
  [0021](0021-limite-gratuito-no-servidor.md)

## Contexto

Para sincronizar, a pessoa digitava o endereço do servidor, uma chave de acesso e uma chave de
recuperação. A chave de acesso de cada perfil exigia que o administrador rodasse um script e um
SQL no D1. O usuário pediu que a pessoa só se preocupe com nome, e-mail e senha. Ele escolheu,
em 2026-11-16: cadastro com código de convite; criptografia de ponta a ponta mantida, com chave
de recuperação opcional; migração das conexões antigas para contas, e depois o desligamento das
chaves antigas.

## Decisão

- **Conta:** nome, e-mail (aparado e em minúsculas) e senha. O cadastro exige um código de
  convite de uso único (`server/invite-admin.js`; o servidor guarda só o SHA-256 do código).
- **Senha fora do servidor:** o app deriva da senha, com PBKDF2-SHA-256 (600 mil iterações, sal
  `sloth-note/account/<e-mail>`), um segredo mestre, e dele, com HKDF, duas chaves: `authKey`,
  que prova a senha ao servidor (o servidor guarda o SHA-256), e `wrapKey`, que nunca sai do
  aparelho e cifra a chave das notas (AES-GCM, ADR 0019). O servidor guarda a chave das notas só
  cifrada. Entrar em outro aparelho com e-mail e senha devolve essa chave cifrada.
- **Chave de recuperação opcional:** mostrada ao criar a conta. Com ela, a pessoa define uma senha
  nova: o servidor confere um valor derivado da chave (guarda o SHA-256) e encerra as sessões
  antigas. Sem ela, quem esquece a senha não abre as notas do servidor; as dos aparelhos ficam.
- **Sessão:** token aleatório de 256 bits por aparelho, guardado no cofre do sistema no lugar da
  antiga chave de acesso; o servidor guarda o SHA-256. “Sair da conta” encerra a sessão.
- **Espaço de dados:** cada conta tem suas notas (`account_notes`) e imagens
  (`account_blob_sizes`, prefixo `accounts/<id>/` no R2), com a mesma API `/v1` do ADR 0018. As
  cotas do ADR 0021 continuam globais.
- **Servidor padrão:** o app já vem com o endereço do servidor do projeto (`VITE_SYNC_SERVER` muda
  no build). O campo de endereço fica em “Avançado”.
- **Migração:** as chaves antigas (`SYNC_TOKEN` e as de `profile_spaces`) continuam aceitas até o
  administrador desligá-las. O aparelho com chave antiga mostra “Conexão antiga” e o formulário de
  conta; ao entrar, as notas do aparelho sobem para a conta (prévia de primeira sincronização,
  estado separado por servidor e e-mail). O script `profile-admin.js` foi removido.
- **Tentativas:** até 10 por minuto por e-mail (entrar e recuperar) e por código de convite, por
  instância do Worker, além do limite geral.

## Alternativas

- **Cadastro aberto:** mais simples para a pessoa, mas qualquer um poderia gastar a cota grátis
  global; exigiria limite por conta. Descartado pelo usuário.
- **Lista de e-mails liberados:** sem campo extra, mas exige mudar a configuração do Worker a cada
  pessoa. Descartado pelo usuário em favor do convite.
- **Servidor que lê as notas, com troca de senha por e-mail:** desfaria a criptografia de ponta a
  ponta do ADR 0018; o Cloudflare também não oferece envio de e-mail grátis e simples.
- **Derivar a chave das notas direto da senha:** trocar a senha exigiria cifrar de novo todas as
  notas e imagens. Cifrar só a chave das notas permite trocar a senha sem tocar nos dados.
- **PBKDF2 no servidor:** o limite de 10 ms de CPU do plano grátis não comporta; a derivação cara
  fica no aparelho, e o servidor só aplica SHA-256.

## Consequências

- O e-mail não é confirmado e não há “esqueci a senha” por e-mail: o e-mail é só o nome de login.
- O e-mail é o sal: trocar de e-mail exige nova decisão.
- A senha mínima (8 caracteres) só é conferida no app; o servidor recebe apenas `authKey`.
- Quem obtiver o banco pode tentar adivinhar senhas fracas, ao custo de 600 mil iterações por
  tentativa. Senhas fortes continuam protegendo as notas.
- Implantar exige aplicar `0004_accounts.sql` ao D1 remoto (com backup), publicar o Worker e criar
  convites. Até o servidor ser atualizado, o app mostra que o servidor ainda não aceita contas.
- Desligar as chaves antigas é um passo manual do administrador (README).
