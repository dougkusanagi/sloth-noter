# Instruções do Sloth Note

## Changelog do aplicativo

- A página **Novidades** (menu principal e Configurações) lê `changelog/unreleased/*.md` e `CHANGELOG.md` diretamente. São a fonte única do registro; não mantenha uma cópia no código da interface.
- **Todo commit, por mínimo que seja, deve incrementar a versão do projeto e adicionar ou atualizar o changelog no próprio commit.** Isso inclui correções, recursos, refatorações internas, testes, documentação e formatação. Prepare os registros antes de concluir o commit, para que estejam atualizados imediatamente após ele; não faça um segundo commit apenas para registrar o anterior.
- Use SemVer: quebra de compatibilidade → major; funcionalidade nova compatível → minor; demais mudanças → patch. Atualize `package.json`, `src-tauri/Cargo.toml` e a entrada do aplicativo em `src-tauri/Cargo.lock` de forma consistente; `tauri.conf.json` continua lendo a versão de `package.json`. Consolide os fragmentos correspondentes à mudança em `changelog/X.Y.Z.md` no mesmo commit, preservando as imagens referenciadas.
- Use `changelog/unreleased/<slug>.md`, começando com `Adicionado:`, `Alterado:`, `Descontinuado:`, `Removido:`, `Corrigido:` ou `Segurança:`. Cada fragmento trata de uma mudança coerente. Escreva em português, para quem usa o app: o que mudou, onde encontrar ou como usar e quais condições ou limitações reais importam. Evite mensagens de commit copiadas, jargão, promessas e números sem evidência.
- Para novidades e alterações visuais, inclua captura real ou ilustração quando ela esclarecer o uso. Prefira uma captura recortada e legível, com dados fictícios, sem informações pessoais; salve em `public/changelog/<slug>.png` e referencie como `![Descrição útil da imagem](/changelog/<slug>.png)`. Os arquivos devem acompanhar o app e funcionar offline. Não use links externos nem imagens decorativas. Correções não precisam de imagens.
- Antes de concluir a mudança, confira se a entrada aparece na página, se imagens carregam e se o conteúdo pode ser lido em desktop e mobile. Não registre recursos futuros como disponíveis.
- Incrementar a versão e registrar o changelog em cada commit não autoriza criar tags nem publicar releases. Tags e publicação continuam dependendo de pedido do usuário.

## Seção Sobre

- O app deve sempre oferecer uma seção **Sobre**, acessível pela interface, com o nome **Sloth Note** e a versão atual.
- Obtenha a versão dos metadados nativos ou da mesma fonte usada no build; nunca mantenha uma versão literal separada na interface. A seção deve acompanhar cada atualização automaticamente.
