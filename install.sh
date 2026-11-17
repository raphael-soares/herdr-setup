#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
REPO=$PWD
AUTO_TITLE=0.22.3

for cmd in stow git go curl; do
  command -v "$cmd" >/dev/null || { echo "install.sh: needs $cmd" >&2; exit 1; }
done

# Folders the app writes into must be real, or app state ends up in the repo.
mkdir -p "$HOME/.config/herdr-app/layouts" "$HOME/.config/herdr-app/mods" "$HOME/.config/herdr-core" "$HOME/.local/bin"
stow -d "$REPO" -t "$HOME" -R home

# Scheduler behind the Automations panel, vendored in src/automations/ (DnzzL/herdr-automations
# v0.12.1 plus one-shot `at:` schedules). backend: hc runs in the app, not the TUI.
install_herdr_automations() {
  local cfg="$HOME/.config/herdr/plugins/config/dnzzl.automations/automations.yaml"
  (cd "$REPO/src/automations" && go build -o bin/herdr-automations .)
  mkdir -p "$HOME/.local/bin" "$(dirname "$cfg")"
  ln -sfn "$REPO/src/automations/bin/herdr-automations" "$HOME/.local/bin/herdr-automations"
  [[ -f "$cfg" ]] || printf 'backend: hc\nautomations: []\n' > "$cfg"
  "$HOME/.local/bin/herdr-automations" service install
}

install_auto_title() {
  local bin="$HOME/.local/share/herdr-auto-title/herdr-auto-title" tmp
  [[ -x "$bin" ]] && "$bin" --version 2>/dev/null | grep -qx "herdr-auto-title $AUTO_TITLE" && return 0
  tmp=$(mktemp -d)
  # The installer kills the HC_TERMINAL_ID terminal when it finishes.
  env -u HC_TERMINAL_ID sh "$REPO/home/.config/herdr-app/mods/auto-title/install.sh" "$AUTO_TITLE" "$tmp"
  rm -rf "$tmp"
}

install_herdr_automations
install_auto_title
