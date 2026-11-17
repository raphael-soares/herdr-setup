#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
REPO=$PWD
AUTO_TITLE=0.22.3

for cmd in stow git go curl; do
  command -v "$cmd" >/dev/null || { echo "install.sh: precisa de $cmd" >&2; exit 1; }
done

# Diretorios onde o app escreve: reais, senao o estado do app vai parar no repo.
mkdir -p "$HOME/.config/herdr-app/layouts" "$HOME/.config/herdr-app/mods" "$HOME/.config/herdr-core" "$HOME/.local/bin"
stow -d "$REPO" -t "$HOME" -R home

# Agendador do painel Automations do herdr-app. backend: hc roda no app, nao no TUI.
instalar_herdr_automations() {
  local dir="$HOME/Code/Personal/herdr-automations"
  local cfg="$HOME/.config/herdr/plugins/config/dnzzl.automations/automations.yaml"
  [[ -d "$dir" ]] || git clone https://github.com/DnzzL/herdr-automations "$dir"
  (cd "$dir" && go build -o bin/herdr-automations .)
  mkdir -p "$HOME/.local/bin" "$(dirname "$cfg")"
  ln -sfn "$dir/bin/herdr-automations" "$HOME/.local/bin/herdr-automations"
  [[ -f "$cfg" ]] || printf 'backend: hc\nautomations: []\n' > "$cfg"
  "$HOME/.local/bin/herdr-automations" service install
}

instalar_auto_title() {
  local bin="$HOME/.local/share/herdr-auto-title/herdr-auto-title" tmp
  [[ -x "$bin" ]] && "$bin" --version 2>/dev/null | grep -qx "herdr-auto-title $AUTO_TITLE" && return 0
  tmp=$(mktemp -d)
  # O instalador mata o terminal de HC_TERMINAL_ID ao terminar.
  env -u HC_TERMINAL_ID sh "$REPO/home/.config/herdr-app/mods/auto-title/install.sh" "$AUTO_TITLE" "$tmp"
  rm -rf "$tmp"
}

instalar_herdr_automations
instalar_auto_title
