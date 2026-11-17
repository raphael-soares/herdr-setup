# Sessionizer: pinned spaces, git names, repo root item

## Why

The tmux setup always had a `default` session in `~`. The Sessionizer can't offer it:
`roots` lists only subfolders, `depth` starts at 1, and a folder opens as a space named
after the folder. The settings window can't edit it either: its list renderer draws only
a main field plus integer and boolean sub-fields. The ideas come from sesh, written in
this repo's own code, with no new dependency.

## Goals

- A `pinned` setting: spaces with a fixed name and folder, always at the top of the list.
  Default: `[{ "path": "~", "name": "default" }]`.
- A space opened in a git worktree is named `<repo>/<worktree folder>`.
- When the current space is inside a repo but not at its root, an item opens the root.
- Everything in `pinned` is editable from the settings window.

## Non-goals

- A startup command per pinned space (no `argv` field for now).
- zoxide, clone/mkdir, glob configs, "last space" switching.
- Opening Herdr straight into `default` at launch.
- Changing the dim color the `~` space gets.

## Design

**List order:** pinned, repo root item, open spaces, folders.

**Pinned** (`settings.pinned`: array of `{ path, name? }`, `path` with `format: folder`):
- Shown once each. If an open local space has that name, the row shows it as open and
  Enter selects it; otherwise Enter runs `space.new { name, folder }`.
- That open space is left out of the open spaces section, so it isn't listed twice.
- `name` left out: the name comes from the git rule below, then the folder name.

**Git name** (computed on Enter only, never during the folder scan):
- Inside a worktree (`git rev-parse --git-dir` differs from `--git-common-dir`):
  `<main repo folder name>/<worktree folder name>`.
- Otherwise: the folder name, as today. Today's roots hold only repo roots and non-repos,
  so nothing else changes.
- `space.new` gets `name` set from this rule for folder rows too.

**Repo root item:** from the current space's live folder (`place()`),
`git rev-parse --show-toplevel`. Shown only when that differs from the live folder. If an
open space is already at the root, Enter selects it; otherwise it opens one named by the
git rule. Label: `<name> (repo root)` with the path on the right.

**Settings window:** `list()` in `mods/settings/extra.js` learns string sub-fields: a text
field per item for each `type: "string"` property other than the main one, unset when
cleared. `pinned` uses it; nothing sessionizer-specific goes into the settings mod.

## Approaches considered

- Root with `depth: 0` to list `~` itself: rejected, the space would be named `raphael`
  and the "fixed name" idea needs a name anyway.
- Hard-coding a `default` row: rejected, `pinned` covers it and other fixed spaces.
- Git name during the scan: rejected, one `git` call per folder (31 today) for a name
  that changes nothing outside worktrees.

## Left to the builder

- Schema text for `pinned` in `mod.schema.json`; defaults in `DEFAULTS`.
- Row icon for the root item.
