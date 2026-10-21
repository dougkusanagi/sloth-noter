# IA local, sincronização com GitHub e assistente de trabalho

> Status: **ideia / proposta** para implementação futura. Nada disto está implementado.
> Prioridade: tarefas, recorrência, lembretes, sincronização e mobile vêm antes da IA local, conforme o [roteiro do projeto](ROADMAP.md#tarefas-sincronização-e-mobile).
> Protótipo navegável: [`ai-prototype/prototype.html`](ai-prototype/prototype.html) (dados fictícios; capturas na mesma pasta).

## 1. Objetivo

Camada de IA **opcional e leve** que ajuda sem atrapalhar a escrita:

- sugerir título/H1 e nome do arquivo;
- resumir e explicar trechos selecionados;
- responder perguntas com base nas notas, citando as fontes;
- sugerir tags de um vocabulário controlado.

Tudo funciona sem IA. Nenhuma sugestão é aplicada sem o usuário aceitar.

## 2. Runtime do modelo

- **Padrão:** sidecar `llama-server` (llama.cpp) embutido, build Vulkan com fallback CPU, API compatível com OpenAI.
- Modelos GGUF baixados sob demanda (ex.: Qwen3 1.7B / 4B), com progresso, cancelamento e verificação de hash.
- Se já houver **Ollama** ou outro endpoint compatível com OpenAI configurado, usar esse. **Nunca instalar o Ollama automaticamente.**
- O modelo só sobe quando é usado e é descarregado após um período ocioso.

## 3. Busca sem embeddings ("RAG em camadas")

Em vez de vetores, um funil progressivo que o modelo pequeno consegue seguir:

1. **Candidatos:** tags (vocabulário controlado) + busca full-text **SQLite FTS5** → algumas dezenas de notas.
2. **Triagem por título:** o modelo lê título + 1ª linha do resumo de cada candidata e escolhe as relevantes.
   - Não é 100% confiável sozinho; por isso o FTS5 também pontua e as melhores por pontuação entram mesmo se o modelo descartar.
3. **Resumos:** lê os resumos das escolhidas e refina.
4. **Resposta:** lê as notas completas (dentro do limite de contexto) e responde **citando as fontes** com links clicáveis.

A interface mostra as etapas em andamento ("Buscando por tags… Lendo 4 resumos…").

## 4. Armazenamento

| Dado                                                                    | Onde                                          | Sincroniza?                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `title`, `tags`, `id` estável — **só o que o usuário aceitou**          | Frontmatter YAML da nota                      | Sim                                                                       |
| Resumo, título sugerido, tags sugeridas, hash do conteúdo, modelo usado | `.sloth/meta/<id>.json` (um arquivo por nota) | Sim; conflito resolvido automaticamente (vence o mais recente / regenera) |
| Índice FTS5, cache                                                      | Banco SQLite local                            | Não (fora do git, reconstruível)                                          |

- Metadados de IA ficam fora do markdown para não poluir o texto nem gerar conflitos de sync.
- O resumo é invalidado pelo hash do conteúdo e regenerado em segundo plano.

## 5. Interface (ver protótipo)

- **Painel direito "Assistente"** (toggle ✦ no cabeçalho), usando o espaço horizontal livre:
  - abas **Esta nota | Histórico** (mesmo componente segmentado da barra esquerda);
  - _Esta nota:_ Resumo, Tags (aceitas + sugeridas tracejadas, clique aceita com desfazer), Relacionadas; botões Regenerar e "Perguntar às notas"; rodapé com o modelo em uso;
  - _Histórico:_ perguntas anteriores com busca, agrupadas por dia; clicar reabre a resposta com as fontes. Estado vazio ≠ "nenhum resultado".
  - Ícones consistentes: ✦ só no cabeçalho do Assistente; cada seção com seu ícone de linha.
- **Título sugerido** sob o H1 com "Usar" / "Ignorar" (Usar atualiza H1, aba e barra lateral, com desfazer).
- Notas sem título mostram o título sugerido em itálico com ✦ na barra lateral.
- Chips de tag na barra lateral filtram a lista.
- **Ctrl+J** abre "Perguntar às notas" (etapas animadas, resposta em streaming, fontes clicáveis).
- Selecionar texto → **Explicar / Resumir** → popover com "Inserir como citação" e "Copiar".
- Responsivo: < 1180px o painel vira sobreposição; < 720px vira bottom sheet.
- **Status de sync só na barra de status inferior**, com popover abrindo para cima.

## 6. Sincronização opcional e provedor GitHub

O app continua local e sem conta por padrão. GitHub é um provedor planejado; também será avaliada uma alternativa gratuita que não exija conta no GitHub. A escolha dessa alternativa permanece em aberto. Backup remoto e sincronização entre dispositivos são entregas distintas.

O contrato de sincronização deve incluir notas, imagens, exclusões, metadados das tarefas e histórico de conclusão, com IDs estáveis, tratamento de conflitos e deduplicação de eventos. O histórico de tarefas é independente dos commits. As escolhas abaixo são a proposta específica para o provedor GitHub:

- Login por **OAuth device flow** (código + abrir navegador; sem tokens manuais).
- Cria automaticamente um **repositório privado** (ex.: `sloth-notes`).
- Commits automáticos com debounce, **pull antes de push**, implementado com `git2` (sem exigir git instalado).
- Conflito na mesma nota: **mantém as duas cópias** (`nota (conflito de <dispositivo>).md`) e avisa; nunca perde texto.
- Estados na barra de status: Sincronizado · Sincronizando · Offline (pendente) · Erro (com ação de tentar de novo).
- Token guardado no keychain do sistema.

## 7. Evolução: assistente que sabe no que estou trabalhando

Exemplo de pergunta: _"quais projetos e o que fiz em cada um deles na última terça?"_

O gargalo não é o tamanho do modelo, e sim ter os dados organizados. Essa pergunta é basicamente uma consulta por data + agregação; o LLM só redige.

**Fontes**

- GitHub: API GraphQL (`contributionsCollection`) e busca de commits/PRs/issues por autor e data (inclui privados com o token do usuário).
- Repositórios locais: `git log --author --since/--until` em pastas configuradas (pega o que ainda não foi enviado).
- As próprias notas: criadas/editadas no dia, tarefas concluídas.

**Diário automático (passo principal)**

- Job diário coleta as fontes num log de atividades SQLite (com data, projeto, tipo) e gera `Diário/AAAA-MM-DD.md` com uma seção por projeto.
- Perguntas por período viram "ler a nota do dia" — o modelo pequeno resolve com o RAG da seção 3.
- O diário é uma nota normal: editável e sincronizada.

**Dois níveis de modelo**

- Local pequeno: título, tags, resumos, perguntas simples.
- Nuvem opcional (ex.: Claude, chave do usuário no keychain): perguntas que cruzam períodos ou exigem raciocínio, usando **ferramentas** (buscar notas, consultar log de atividades, GitHub) em vez de receber tudo no prompt.
- A UI deixa claro quando algo vai para a nuvem e o que será enviado; opt-in explícito.

**Atalho:** expor notas + diário como **servidor MCP**, para que Claude Desktop/Claude Code e outros clientes consultem tudo sem construir um agente dentro do app.

## 8. Ordem sugerida

1. Listas de tarefas dedicadas e histórico de conclusão.
2. Recorrência diária e por dias da semana, com ocorrências independentes.
3. Prazo, lembretes e notificações no desktop.
4. Backup remoto e sincronização opcionais: proposta GitHub acima e avaliação de alternativa gratuita sem GitHub.
5. Versão mobile, com funcionamento offline, sincronização e validação de notificações e alarmes na plataforma escolhida.
6. IA local fase 1: sidecar llama.cpp, título sugerido, resumo, explicar seleção, frontmatter + `.sloth/meta`.
7. Índice FTS5 + tags + "Perguntar às notas" com fontes e histórico.
8. Diário automático (GitHub + git local + notas), aproveitando o histórico de tarefas já registrado.
9. Modelo na nuvem com ferramentas e/ou servidor MCP.

O detalhamento das cinco primeiras etapas e suas decisões em aberto está no [roteiro](ROADMAP.md#tarefas-sincronização-e-mobile). A IA não é requisito para tarefas, histórico ou sincronização.

## 9. Questões em aberto

- Qual modelo padrão por faixa de hardware (RAM/VRAM) e tamanho do download aceitável.
- Vocabulário de tags: fixo, editável pelo usuário ou aprendido das notas.
- Política exata de conflito para `.sloth/meta` quando os dois lados regeneram.
- Privacidade do diário: quais repositórios/pastas entram e se o diário deve sincronizar.
