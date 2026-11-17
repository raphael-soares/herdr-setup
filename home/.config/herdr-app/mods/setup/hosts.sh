#!/usr/bin/env bash
# Aliases from ~/.ssh/config, one per line, for the sessionizer (ssh mode).

SSH_CONFIG="${HOME}/.ssh/config"

[[ -f "$SSH_CONFIG" ]] || { echo "No SSH config found at $SSH_CONFIG" >&2; exit 1; }

parse_hosts() {
    local config="$1"
    grep -Ei '^(Host |Include )' "$config" | while read -r keyword value; do
        if [[ "${keyword,,}" == "include" ]]; then
            local pattern="${value/#\~/$HOME}"
            for f in $pattern; do
                [[ -f "$f" ]] && parse_hosts "$f"
            done
        else
            # 'Host foo bar' declares several aliases; read -ra so 'Host *' does not glob.
            local -a aliases
            read -ra aliases <<< "$value"
            for alias in "${aliases[@]}"; do
                echo "$alias"
            done
        fi
    done
}

# sort -u: the same alias can show up in more than one file via Include.
hosts=$(parse_hosts "$SSH_CONFIG" | grep -v '[*?!]' | sort -u)
echo "$hosts"
