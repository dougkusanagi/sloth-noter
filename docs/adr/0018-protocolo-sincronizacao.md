# 0018 — Protocolo de sincronização entre desktop e Android

- Status: Proposto; aguarda aprovação do usuário em S1
- Data: 2026-11-12
- Complementa: [0009](0009-sincronizacao-por-servidor-proprio.md)

## Contexto

A fila mobile coloca S1 depois de A1–A4, antes de ampliar a paridade. O servidor
por pessoa e a API HTTP independente do Cloudflare já foram aceitos no ADR 0009.
Ainda faltam as decisões da seção 11.8 dos requisitos. Esta proposta não ativa
rede, não migra notas e não declara a sincronização disponível.

## Decisão proposta

### Proteção e chaves

Usar criptografia de ponta a ponta: conteúdo, título, grupos, fixadas, nomes de
imagens e os vínculos entre notas e imagens são cifrados no aparelho. O servidor
armazena envelopes opacos. HTTPS e uma chave Bearer autenticam cada pedido; a
chave de autenticação é diferente da chave de criptografia.

A chave de criptografia é aleatória, compartilhada explicitamente entre os
aparelhos. Ao configurar, oferecer exportação de uma chave de recuperação.
Perder todos os aparelhos e essa chave impede recuperar o conteúdo do servidor.
Desligar sincronização preserva notas locais. Trocar de servidor exige nova
prévia de sincronização e não reaproveita silenciosamente o cursor anterior.

No Android, proteger os segredos com Android Keystore; no desktop, usar o cofre
de credenciais do sistema. Não guardar segredos em preferências, backups JSON,
localStorage, logs nem arquivos Markdown. Se o cofre estiver indisponível,
manter sincronização desligada e explicar como habilitá-lo. Antes de S3, escolher
e validar a implementação criptográfica e os adaptadores de cofre nas plataformas
suportadas; não implementar criptografia própria.

O servidor ainda observa IDs opacos, revisões, horários, volume, tamanhos e
exclusões. A proposta não oculta esses metadados.

### Identidade, renomeação e mesclagem

Manter o UUID existente da nota. O estado local guarda a última revisão remota
e a base comum, separadas da nota e do histórico local.

Mesclar texto em três vias por linha. Alterações independentes são combinadas;
sobreposições preservam as duas versões, com uma nota de conflito identificando
o aparelho. Metadados alterados de formas incompatíveis também geram conflito,
sem escolher por horário do aparelho.

Renomeação externa: se um arquivo registrado desapareceu e exatamente um arquivo
novo tem o mesmo conteúdo, associar esse arquivo ao ID anterior. Não inferir
identidade somente pelo nome. Se houve edição junto da renomeação, ou houver
mais de um candidato, preservar os arquivos e pedir associação; não apagar nem
unir automaticamente.

Arquivos externos abertos no próprio local não entram automaticamente na
sincronização. A pessoa deve usar “Copiar para minhas notas”, preservando o
contrato do ADR 0001.

### Revisões e exclusões

Guardar somente a revisão atual no servidor. A base comum é local por aparelho;
o histórico local e o backup JSON continuam independentes.

Uma nota pode estar ativa, na lixeira ou excluída de vez. A revisão de exclusão
definitiva deixa uma marca sem conteúdo. Manter essas marcas e o cursor de
mudanças para aparelhos que ficaram offline não ressuscitarem notas antigas.
Edição concorrente com exclusão preserva o texto editado como conflito e mantém
a exclusão da identidade original. Restaurar da lixeira cria nova revisão.

### Imagens

Subir imagens antes da revisão que as referencia. Cada imagem recebe identidade
local estável e envelope cifrado; o SHA-256 usado no caminho de transporte é o
hash do envelope, sem expor o hash do conteúdo original. O manifesto cifrado
mapeia referências locais para os blobs. Reutilizar o mesmo envelope em novas
tentativas e entre aparelhos; não cifrar novamente em cada envio.

Nunca publicar uma revisão que dependa de imagem ausente. Receber e verificar
todos os blobs necessários antes de aplicar a nota pela persistência existente.
Não remover blobs automaticamente nesta primeira entrega; limpeza exige projeto
próprio para não quebrar aparelhos offline.

## Contrato HTTP proposto para S2

Todos os pedidos exigem autenticação, inclusive leitura. JSON usa UTF-8.
IDs e cursores são opacos e associados ao servidor configurado.

| Pedido                       | Resposta de sucesso e condição                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /v1/changes?since=cursor | 200: cursor, changes e hasMore. Cada mudança contém id, revision, hash e deleted. Paginação ordenada pelo cursor do servidor, sem depender do relógio do aparelho.          |
| GET /v1/notes/:id            | 200: id, revision, hash, deleted e envelope; ETag com a revisão. Marca definitiva usa envelope nulo. ID inexistente responde 404.                                           |
| PUT /v1/notes/:id            | If-Match com a revisão lida; criação usa If-None-Match: *. 200: id e revision. Pré-condição ausente responde 428; revisão divergente responde 409 sem modificar o registro. |
| GET /v1/blobs/:sha256        | 200: envelope binário; hash inválido ou ausente não é aceito como imagem válida.                                                                                            |
| PUT /v1/blobs/:sha256        | Idempotente: 201 ao criar, 204 se o mesmo blob existe. Hash é conferido antes de confirmar.                                                                                 |

O corpo de PUT da nota contém hash, deleted e envelope. IDs, versões e limites
são validados no servidor. Conteúdo cifrado também exige validação de formato e
tamanho antes da gravação. Não confiar em nomes ou caminhos enviados pelo cliente.

Mudança e revisão são publicadas atomicamente. Falha antes da publicação não
avança o cursor; blob órfão pode ser reutilizado. Depois de um timeout, consultar
a revisão antes de repetir uma escrita. Não fazer repetição cega de PUT de nota.

Erros JSON usam código estável: unauthorized (401), not_found (404), conflict
(409), precondition_required (428), rate_limited (429) e server_error (5xx).
429 inclui Retry-After; não repetir antes dele. Erros não ecoam chave nem conteúdo.
Redirecionamentos não recebem as credenciais. A gravação local nunca aguarda rede.

## Testes de contrato exigidos antes de implementar S2

- Autenticação: chave ausente/incorreta retorna 401 sem ler ou gravar dados.
- Criação e atualização: revisão, ETag, hash e cursor coerentes.
- Concorrência: dois PUT na mesma base; apenas um vence, o outro recebe 409.
- Falha parcial: conteúdo sem publicação não aparece em changes.
- Cursor: paginação não perde alterações ocorridas entre páginas.
- Exclusão: marca aparece no cursor e não expõe o conteúdo apagado.
- Imagem: PUT repetido é idempotente; hash divergente não grava.
- Limite: 429 com Retry-After, sem perda local nem repetição imediata.
- Migração: exportação/importação conserva IDs, revisões, blobs e marcas.

Os testes executáveis serão escritos contra o contrato aprovado antes do
servidor de referência. Esta lista não equivale a testes executados.

## Alternativas e consequências

Só HTTPS simplifica implantação e recuperação, mas permite ao operador da
infraestrutura ler as notas. Foi preferida a proposta cifrada para evitar
alterar o formato e migrar dados sensíveis depois.

Mesclar por blocos Markdown foi considerado; por linha segue o requisito
existente e permite combinar edições pequenas em um mesmo bloco.

Reconhecer renomeações por nome ou aproximação reduz perguntas, mas pode unir
notas diferentes. A associação conservadora preserva os dados e exige intervenção
nos casos ambíguos.

Guardar várias revisões no servidor facilita recuperação, mas aumenta retenção
e custo. A proposta mantém a recuperação no histórico e backup locais.

Marcas de exclusão e blobs sem limpeza automática ocupam espaço crescente.
O servidor precisa exportar todo o conjunto para migração. Criptografia e cofre
nativo aumentam o trabalho antes de S3; este ADR não promete prazo nem custo de
infraestrutura, que serão conferidos nas fontes oficiais em S2.
