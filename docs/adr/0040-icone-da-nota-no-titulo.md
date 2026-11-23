# 0040 — Ícone da nota no título e capas da galeria na biblioteca

- Status: Aceito
- Data: 2026-11-23

## Contexto

O topo da nota passou a ter os botões Adicionar ícone e Adicionar capa e o menu Ações da nota. O ícone precisava de um lugar no arquivo. A galeria de capas oferece imagens que acompanham o app.

## Decisão

- O ícone é o emoji no início do título H1, seguido de espaço: `# 🌱 Horta`. Escolhido pelo usuário em 2026-11-23.
- Uma capa da galeria (`public/covers/`) é copiada para a biblioteca de imagens ao ser escolhida, como uma importação. A nota guarda uma imagem Markdown comum, no formato do ADR 0038. Se a biblioteca já tem uma imagem com o mesmo nome (`capa-<id>.webp`), ela é reutilizada.
- O seletor de emoji usa a biblioteca `frimousse` com os dados do Emojibase (`emojibase-data`) em português e inglês, embutidos no app para funcionar offline.

## Alternativas

- Guardar o ícone numa propriedade YAML (`icone:`) deixaria o título e os links `[[Nota]]` sem o emoji, mas mostraria o bloco de propriedades em notas que só têm ícone, e outros apps não exibiriam o ícone.
- Referenciar a capa da galeria pelo caminho do app (`/covers/...`) quebraria a imagem na exportação, na sincronização e em outros leitores de Markdown.
- Uma lista fixa de emojis, sem dependência, não teria busca por nome nem tons de pele.

## Consequências

- O nome da nota, a busca e os links `[[...]]` incluem o emoji. Trocar ou remover o ícone renomeia a nota e atualiza as referências, como uma edição do H1.
- Um emoji no início de um título escrito à mão também vira o ícone.
- Os dados de emoji aumentam o pacote em cerca de 1,5 MB (pt e en), carregados só ao abrir o seletor.
