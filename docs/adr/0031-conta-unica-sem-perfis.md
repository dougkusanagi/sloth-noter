# 0031 — Conta única, sem perfis locais

- Status: Aceito
- Data: 2026-11-17
- Substitui: [0023](0023-perfis-e-espacos-de-sincronizacao.md) (parte dos perfis locais)

## Contexto

O ADR 0023 criou até 5 perfis locais, cada um com notas, cofre e conta próprios. O usuário pediu
um app mais simples: criar a conta e entrar para sincronizar. A conta de sincronização é o perfil.

## Decisão

- O app tem um só conjunto de notas, no diretório de dados original (o antigo perfil `primary`).
- Removidos: catálogo `profiles.json`, comandos `active_profile`, `profiles_load`, `profiles_save`,
  `profile_switch`, a tela **Perfis** e o nome do perfil na barra de status e no menu do celular.
- O cofre guarda só o segredo `sync`. Os segredos `sync-<id>` deixam de ser lidos.
- `{{profile}}` nos modelos passa a mostrar o nome (ou o e-mail) da conta conectada.
- O servidor não muda: a tabela `profile_spaces` continua, mas o app não cria novos espaços.

## Alternativas

- Esconder a tela e manter o código: rejeitado; o usuário pediu a remoção.

## Consequências

- Notas de perfis extras criados antes ficam em `profiles/<id>/` no diretório de dados, sem
  acesso pelo app. Não são apagadas. Quem precisar delas pode importar os arquivos à mão.
- O app volta a abrir sempre o perfil principal, mesmo que `profiles.json` indique outro.
