# 0039 — Capa no topo da nota

- Status: Aceito
- Data: 2026-11-23

## Contexto

O ADR 0038 grava a capa como a primeira imagem após o título (`sloth:cover`) e a mostra numa faixa abaixo do título. Com propriedades acima do título, a capa ficava entre o título e o texto e quebrava a leitura do topo da nota. Apps de notas parecidos mostram a capa no topo da página.

## Decisão

O formato do arquivo continua o do ADR 0038: a capa segue como imagem Markdown logo abaixo do título. No app desktop, nos modos Padrão e Leitura, a capa é desenhada no topo da área da nota, de ponta a ponta, acima das propriedades e do título. A linha da capa no editor fica escondida e o cursor não entra nela, como nas linhas das propriedades. No modo Código, a linha aparece como texto. O app de celular e as páginas internas (Novidades e Exemplos) mantêm a faixa abaixo do título.

## Alternativas

- Mover a imagem para antes do título ou para as propriedades YAML mudaria o formato dos arquivos que já existem e exigiria migração.
- Manter a faixa abaixo do título deixava a capa separando o título do texto.

## Consequências

- Arquivos já gravados não mudam; outros leitores de Markdown continuam vendo a imagem abaixo do título.
- A capa no topo depende de o editor esconder a linha da capa. Por isso, o desktop e o celular mostram a capa em lugares diferentes até o celular adotar o mesmo desenho.
