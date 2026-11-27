# Hierarquia da sidebar sem linhas de árvore

## Por quê

A sidebar mostra máquina, space e itens (worktree, tab, pane, agente,
sub-agente) com crachá colorido no space e linhas `│ ├ └` em todo nível. É
ruído: as linhas só se justificariam com recolher, que já foi retirado, e o
crachá disputa atenção com o que importa. O dono quer uma lista agrupada no
jeito Finder, onde o recuo diz quem é filho de quem.

## Objetivos

- Máquina é a seção: mantém o `machineHeader` atual (pequeno, dim, ícone de
  servidor, dobra no clique, estado quando não conectada).
- A máquina local ganha o mesmo cabeçalho só quando alguma remota tem space
  aberto. Sem remota, nenhum cabeçalho, como hoje.
- Space sem crachá: nome em tamanho e cor de texto normais, 10px de respiro
  acima de cada space (exceto o primeiro do grupo). Clique, arrastar, menu do
  botão direito e estado aceso continuam.
- Filhos sem linhas: 14px de recuo por nível de profundidade, o primeiro nível
  alinhado ao nome do space. Vale na lista de spaces e na aba Agents.

## Fora do escopo

- Ícone do agente: fica (o dono mistura shell e agente).
- "Needs you", cursor de teclado, painel de uso no rodapé: ficam.
- Tirar a cota da statusline do omp: mudança separada no `~/.dotfiles`.
- Modo rail (`compact`) não muda.

## Abordagens

- **Recuo por profundidade (escolhida):** o `Rail` sai de `ui.js`; `nest`,
  `tree()` e a linha de worktree passam a carregar a profundidade. Menos largura
  por nível (14px contra 24px) e nenhum código de linha morto.
- **Rail com glifos em branco:** diff menor, mas mantém 24px por nível, aperta
  títulos fundos e deixa código que ninguém usa.

## Decisões

- `space.colors` continua sendo gravado: os menus do próprio Herdr usam.
- Rótulo da máquina local: hostname se o `hc` o expuser; senão "local"
  (decisão do agente; o Herdr dá `name: null` para a local).

## Aceite

Com o fedora aberto (dois spaces), um worktree, uma tab dividida e um agente
com sub-agente, dá para ler máquina > space > item > sub-item sem linhas, e o
j/k passa pelos mesmos itens de antes.
