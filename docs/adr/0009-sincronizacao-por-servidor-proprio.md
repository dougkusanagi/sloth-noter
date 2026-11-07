# 0009. Sincronização por servidor próprio no Cloudflare

- Status: Aceito
- Data: 2026-11-07

## Contexto

O Android está em implementação, e o usuário quer testá-lo com os mesmos dados do desktop. O app
é local e sem conta; a sincronização era uma proposta posterior em [IA e sync](../IA-E-SYNC.md),
com o GitHub como provedor planejado. O requisito é não pagar por servidor e poder migrar depois
para uma VPS barata.

As alternativas foram avaliadas em 2026-11-07, com base nas páginas de preços e em artigos da
mesma data. Os limites citados podem mudar e devem ser conferidos antes da implementação.

## Decisão

1. A sincronização entre desktop e Android passa por um **servidor HTTP próprio**, com uma API
   pequena e versionada (`/v1`). O app não depende de nada específico do provedor.
2. A implementação de referência roda no **plano grátis do Cloudflare**: Workers para a API, D1
   para metadados e cursor de mudanças, R2 para conteúdo e imagens. O código fica em `server/`.
3. **Um servidor por pessoa.** O endereço e a chave de acesso ficam nas Configurações do app. A
   sincronização começa desligada, e o app continua funcionando sem ela.
4. Migrar para uma VPS significa implementar a mesma API em outro servidor e mover os dados com a
   exportação do servidor, sem mudar o app.
5. A entrega vem logo depois da usabilidade básica do Android (etapas A1–A4 do
   [plano de execução](../plans/mobile-interface.md)), antes do restante da paridade.
6. O protocolo (formato, mesclagem, conflitos, exclusões, imagens, chave e criptografia) será
   decidido na etapa S1, em ADR próprio. Requisitos em [plano mobile, seção 11](../plano-mobile.md#11-sincronização).

## Alternativas

- **GitHub do usuário:** grátis e com arquivos legíveis, mas exige conta no GitHub, mantém notas
  apagadas no histórico e pede cuidado com permissões. Continua como provedor futuro possível.
- **Nuvem do usuário (Google Drive, OneDrive, Dropbox):** sem servidor, mas cada provedor exige
  código próprio. Continua como possibilidade futura.
- **Rede local entre os aparelhos:** sem custo e sem conta, mas exige a mesma rede e os dois apps
  abertos. Continua como possibilidade futura.
- **Firebase (Spark):** desde fevereiro de 2026, o Cloud Storage exige o plano Blaze, com cartão;
  as imagens ficariam fora do plano grátis.
- **Supabase (Free):** 500 MB de banco e 1 GB de arquivos; projetos são pausados após 1 semana sem
  uso, o que quebra uma sincronização pessoal usada de vez em quando.
- **CRDT (Automerge, Yjs):** peso e complexidade maiores do que o caso pede (uma pessoa, poucos
  aparelhos, `.md` editados também fora do app).

## Consequências

- O projeto passa a manter código de servidor, testes de contrato e um guia de implantação.
- Os limites grátis valem por conta do Cloudflare. Por isso o servidor é de cada pessoa, e o
  projeto não guarda notas de outras pessoas. Oferecer sincronização a terceiros exige nova decisão.
- Sem criptografia de ponta a ponta, quem controla a conta do Cloudflare e o próprio Cloudflare
  conseguem ler as notas. A escolha fica para S1.
- O contrato "nenhuma requisição externa obrigatória" continua valendo, porque a sincronização é
  opcional e desligada por padrão.
- O histórico local de versões continua fora da rede e do backup ([ADR 0002](0002-historico-de-alteracoes.md)).
- A sincronização não substitui o backup JSON.
