# 0023 — Perfis locais e espaços de sincronização separados

- Status: Substituído por [0031](0031-conta-unica-sem-perfis.md); antes, em parte por [0024](0024-contas-com-email-e-senha.md) (credenciais e cadastro)
- Data: 2026-11-13
- Complementa: [0018](0018-protocolo-sincronizacao.md), [0021](0021-limite-gratuito-no-servidor.md)

## Contexto

O app tinha um só conjunto de notas, um só cofre de sincronização e um só token no servidor.
O usuário quer até 5 perfis, cada um sincronizando suas notas entre vários aparelhos, na mesma
infraestrutura Cloudflare (um Worker, um D1 e um R2).

## Decisão

- Perfil local: catálogo em `profiles.json` (até 5, IDs validados). O perfil `primary` mantém o
  diretório de dados antigo; os outros usam um diretório próprio. O diretório fica fixo durante
  a vida do processo; trocar de perfil salva o catálogo e reinicia o app (no Android, fecha).
- Cofre: um segredo por perfil (`sync` para o Principal, `sync-<id>` para os demais).
- Servidor: tabela `profile_spaces` (slots 1–4, só o hash SHA-256 da credencial, revogação por
  `revoked_at`). O Worker resolve o espaço pela credencial; o cliente não escolhe o espaço.
  Notas e tamanhos de imagem ficam em tabelas com `space_id`; imagens no R2 em prefixo por espaço.
- O token antigo (`SYNC_TOKEN`) continua acessando apenas os dados antigos (quinto espaço).
- Não há cadastro público. O administrador gera a credencial com `server/profile-admin.js` e
  executa o SQL gerado. O nome do perfil não conecta aparelhos: o que conecta é usar o mesmo
  espaço (credencial) e a mesma chave de recuperação.

## Alternativas

- Um Worker/D1/R2 por perfil: isola mais, mas multiplica a configuração e as franquias grátis.
- Contas com e-mail e senha: mais código e superfície de ataque, sem necessidade para uso próprio.
- Trocar de perfil sem reiniciar: exigiria cancelar todas as gravações em andamento; descartado
  pelo risco de gravar no perfil errado.

## Consequências

- As cotas do ADR 0021 continuam globais, somando todos os espaços.
- Perfis locais não protegem as notas de quem usa a mesma conta do sistema.
- Não há exclusão de perfis nesta entrega.
- Implantar exige aplicar `0003_profile_spaces.sql` ao D1 remoto (com backup) e publicar o Worker.
