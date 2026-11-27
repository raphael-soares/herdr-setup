# Ações pelo teclado na sidebar

## Por quê

A sidebar já tem cursor de teclado (j/k/g/G, Enter), mas as ações sobre um item
só existiam no botão direito. O dono quer agir sobre o item sob o cursor sem
sair do teclado, com as teclas que já conhece do tmux.

## Objetivos

- `a` sobre um item (tab, pane, agente) abre o menu de ações dele, navegável por
  teclado e aberto junto da linha.
- Ações direto na sidebar, sem abrir menu, com as teclas do tmux: `,` renomeia,
  `x` fecha (com confirmação), `c` abre tab nova no space, `%`/`"` dividem o pane
  ao lado ou abaixo, `z` dá zoom. O menu mostra a mesma tecla em cada item e a aceita.
- `l`, → e Enter abrem o item; Esc sai para o pane.

## Fora do escopo (decisões do dono)

- Recolher spaces: tentado e retirado.
- Cursor nas linhas de space: os spaces seguem só no mouse (clique e botão direito).
- Worktree no menu: o dono não usa.
- O modo rail (sidebar estreita, < 160px).

## Decisões

- O menu é um clone do mod `menu` do Herdr dentro do mod `setup` (`menu.js`,
  peça `menu`), com `j`/`k` além de ↑/↓ e "New tab" no menu de space. O botão
  direito nas linhas da sidebar abre o clone. Atualizações do Herdr nesse menu
  deixam de chegar sozinhas.
- O menu de agente usa o menu de pane do agente.
- Depois de `a` ou `x`, o foco volta à sidebar com o cursor no mesmo item.
