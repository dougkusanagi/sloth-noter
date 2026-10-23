# Instruções do Sloth Note

## Changelog do aplicativo

- A página **Novidades** (menu principal e Configurações) lê `changelog/unreleased/*.md` e `CHANGELOG.md` diretamente. São a fonte única do registro; não mantenha uma cópia no código da interface.
- A cada commit com mudança perceptível ao usuário, crie ou atualize o fragmento correspondente **no mesmo commit**, antes de concluí-lo. Assim, após cada commit a página já estará atualizada, sem um segundo commit só de documentação. Testes, refatorações e formatação sem efeito visível não precisam de entrada.
- Use `changelog/unreleased/<slug>.md`, começando com `Adicionado:`, `Alterado:`, `Descontinuado:`, `Removido:`, `Corrigido:` ou `Segurança:`. Cada fragmento trata de uma mudança coerente. Escreva em português, para quem usa o app: o que mudou, onde encontrar ou como usar e quais condições ou limitações reais importam. Evite mensagens de commit copiadas, jargão, promessas e números sem evidência.
- Para novidades e alterações visuais, inclua captura real ou ilustração quando ela esclarecer o uso. Prefira uma captura recortada e legível, com dados fictícios, sem informações pessoais; salve em `public/changelog/<slug>.png` e referencie como `![Descrição útil da imagem](/changelog/<slug>.png)`. Os arquivos devem acompanhar o app e funcionar offline. Não use links externos nem imagens decorativas. Correções não precisam de imagens.
- Antes de concluir a mudança, confira se a entrada aparece na página, se imagens carregam e se o conteúdo pode ser lido em desktop e mobile. Não registre recursos futuros como disponíveis.
- Num lançamento solicitado pelo usuário, consolide os fragmentos no registro da versão, preserve as imagens referenciadas e siga as regras de versão e confirmação já aplicáveis. Não altere a versão a cada commit.
