#!/usr/bin/env bash
# Folders for the sessionizer, one per line: label<TAB>path.

# herdr-app runs the script without going through .bashrc, so load it here.
if [[ -z "${SESSIONIZER_DIRS:-}" ]]; then
    for _rc in "$HOME"/.config/shell/rc.d/*.sh; do [[ -r "$_rc" ]] && source "$_rc"; done
    [[ -f ~/.env.local ]] && source ~/.env.local
fi

SEARCH_DIRS=()
if [[ -n "${SESSIONIZER_DIRS:-}" ]]; then
    IFS=':' read -r -a SEARCH_DIRS <<< "$SESSIONIZER_DIRS"
    # ~ only becomes $HOME when the shell expands it; from a variable it is literal.
    SEARCH_DIRS=("${SEARCH_DIRS[@]/#\~/$HOME}")
fi

# Skip the ones that do not exist: find aborts the whole scan on an invalid path.
_existing=()
for _d in "${SEARCH_DIRS[@]}"; do
    [[ -d "$_d" ]] && _existing+=("$_d")
done
SEARCH_DIRS=("${_existing[@]}")
[[ ${#SEARCH_DIRS[@]} -eq 0 ]] && SEARCH_DIRS=("$HOME")

mapfile -t _all_dirs < <(find "${SEARCH_DIRS[@]}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)

# Basename repeated across SEARCH_DIRs: every occurrence gets its parent dir.
declare -A base_count
for d in "${_all_dirs[@]}"; do
    base="${d##*/}"
    base_count["$base"]=$(( ${base_count[$base]:-0} + 1 ))
done

declare -A dir_map
for d in "${_all_dirs[@]}"; do
    base="${d##*/}"
    if [[ ${base_count[$base]} -gt 1 ]]; then
        label="${d%/*}/${base}"
    else
        label="$base"
    fi
    dir_map["$label"]="$d"
done

for label in "${!dir_map[@]}"; do
    printf '%s\t%s\n' "$label" "${dir_map[$label]}"
done | sort
