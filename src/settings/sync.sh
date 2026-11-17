#!/bin/sh
# Copies the Settings screen the installed Herdr ships into mods/settings again
# and puts our hooks back (main.js.patch). Run it after a Herdr update.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
frame=${HERDR_APP_HOME:-$HOME/.config/herdr-app}/frame/settings
mod=$here/../../home/.config/herdr-app/mods/settings

cp "$frame/main.js" "$frame/release-notes.js" "$frame"/*.svg "$mod/"
if ! patch --forward --no-backup-if-mismatch --reject-file=- "$mod/main.js" "$here/main.js.patch"; then
  echo "main.js.patch no longer applies: redo the hooks by hand, then regenerate it with:" >&2
  echo "  diff -u --label a/main.js --label b/main.js \"$frame/main.js\" \"$mod/main.js\" > \"$here/main.js.patch\"" >&2
  exit 1
fi
herdr-app check "$mod"
