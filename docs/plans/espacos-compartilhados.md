# Plano: espaços compartilhados

Tipo: tarefa

## Objetivo

Permitir que uma pessoa crie um **espaço compartilhado**, convide outras contas e escolha o que
cada uma pode fazer com as notas desse espaço. As notas pessoais continuam fora do espaço e não
mudam de comportamento.

Critério de conclusão: duas contas reais editam as mesmas notas de um espaço pelo desktop e pelo
Android; o nível de acesso é respeitado no servidor; remover alguém corta o acesso; a suíte local
e os testes de contrato do servidor passam.

## Nome: “espaço”

Recomendação: **Espaço compartilhado** (na interface, “Espaço”; em inglês, “Shared space”).

- “Grupo” fala das pessoas, não das notas; “pasta compartilhada” se confunde com as pastas da
  biblioteca e com a pasta de `.md` do desktop; “equipe” sugere uma empresa.
- O servidor já usa `space_id` para o conjunto de notas de cada conta (ADR 0024), e o termo
  “espaço” já existiu no app (ADR 0023). Um espaço compartilhado é o mesmo conceito com mais de
  um membro.

## Níveis de acesso (básico)

| Nível  | Ver notas | Criar, editar e apagar notas | Convidar e remover pessoas | Excluir o espaço |
| ------ | --------- | ---------------------------- | -------------------------- | ---------------- |
| Dono   | sim       | sim                          | sim                        | sim              |
| Editor | sim       | sim                          | não                        | não              |
| Leitor | sim       | não                          | não                        | não              |

Cada espaço tem um dono. Qualquer membro pode sair do espaço. O servidor recusa gravações de
leitores; esconder botões na interface não basta.

## Restrições que vêm de decisões aceitas

- **Criptografia de ponta a ponta (ADR 0019 e 0024):** o servidor não lê as notas. Hoje cada conta
  tem uma chave de notas, cifrada pela senha. Para compartilhar, cada espaço precisa de uma
  **chave própria**, entregue cifrada a cada membro. Isso exige um par de chaves por conta
  (ECDH P-256 da Web Crypto, já disponível nos três WebViews; X25519 ainda não é garantido em
  todos). A chave privada fica cifrada pela `wrapKey`, como a chave de notas.
- **Sem colaboração em tempo real** (ROADMAP, “Fora de escopo”): o espaço usa a mesma
  sincronização por revisões do ADR 0018. Edições simultâneas na mesma nota geram as cópias de
  conflito que já existem; com mais pessoas, elas serão mais frequentes.
- **Cotas do ADR 0021:** hoje valem para o servidor todo. Proposta: o uso de um espaço conta para
  o dono.
- **Cadastro por convite (ADR 0024):** só quem já tem conta pode entrar num espaço.

## Passos

- [ ] P0 — Registrar as decisões em ADR antes do código: nome, níveis, modelo de chaves, onde as
      notas do espaço ficam no desktop e o que acontece ao remover alguém.
- [ ] P1 — Servidor: tabelas `spaces`, `space_members` (conta, nível, chave do espaço cifrada para
      ela), `space_invites` e notas/imagens com `space_id` do espaço; rotas `/v1/spaces/...`;
      checagem de nível em toda leitura e gravação; testes de contrato.
- [ ] P2 — Par de chaves por conta: gerar no próximo login, guardar a chave pública em claro e a
      privada cifrada; migração das contas existentes sem pedir a senha de novo além do login.
- [ ] P3 — Convite: o dono informa o e-mail; o servidor devolve a chave pública da conta; o app do
      dono cifra a chave do espaço para ela. A pessoa convidada aceita ou recusa no app.
- [ ] P4 — Sincronização por espaço: um cursor por espaço no motor de sync, envelopes cifrados com
      a chave do espaço, imagens no prefixo do espaço no R2.
- [ ] P5 — Interface desktop e Android: seção “Espaços” na biblioteca, criar espaço, convidar,
      lista de membros com nível, sair do espaço; notas de leitor abertas só para leitura, com
      aviso claro.
- [ ] P6 — Remover membro e excluir espaço: o servidor corta o acesso na hora; trocar a chave do
      espaço e recifrar as notas depois disso.
- [ ] P7 — Validação: E2E com duas contas (desktop ↔ Android), nível de leitor recusado no
      servidor, remoção, conflito entre pessoas, e validação nativa nos aparelhos.

## Tentativas que falharam

- Nenhuma até agora.

## Dúvidas abertas

- **Onde ficam as notas do espaço no desktop?** Opções: subpasta `Espaços/<nome>/` na pasta de
  notas (arquivos `.md` continuam a fonte de verdade) ou só no estado do app (sem `.md`). A
  primeira mantém o contrato do desktop, mas exige tratar renomear e apagar a subpasta fora do app.
- **Verificar a chave pública de quem é convidado?** Sem verificação, quem controla o servidor
  poderia trocar a chave e ler o espaço. Uma opção é confirmar pelo QR já usado no pareamento
  (ADR 0053); outra é aceitar o risco no nível básico e registrar isso no ADR.
- **Mover uma nota pessoal para um espaço** (e de volta): copia ou move? O histórico local de
  versões (ADR 0002) acompanha?
- **Quem vê quem editou por último?** O envelope é cifrado; o autor poderia ir dentro dele.
- Limite de membros e de espaços por conta no plano grátis.

## Próximo passo

Decidir as dúvidas abertas com o usuário e escrever o ADR de P0. Este plano ainda não entrou na
[fila de prioridades](prioridades.md).
