# Sessionizer pinned spaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pinned spaces (default `default` in `~`), worktree spaces named `<repo>/<worktree>`, a repo root item, and `pinned` editable in the settings window.

**Architecture:** Naming and row ordering move into a pure module `sessionizer/rows.js` (no `herdr` import, so Node can test it). `sources.js` gains one `git` probe. `main.js` wires it. The settings mod's generic `list()` learns string sub-fields.

**Tech Stack:** Herdr mod JS (gpui-kit), `node --test` (Node 22) for the pure module, `herdr-app check` for mods.

**Spec:** `docs/superpowers/specs/2026-11-17-sessionizer-pinned-design.md`

## Global Constraints

- All code, comments and UI text in English.
- No new dependency; `git` and `find` via `exec` only.
- Git calls on Enter or for the current space only, never per scanned folder.
- Nothing sessionizer-specific inside `mods/settings`.
- Default pinned: `[{ "path": "~", "name": "default" }]`. No `argv`/command field.
- List order: pinned, repo root item, open spaces, folders.

## Review Focus

- Pinned path that doesn't exist: row still shown; Enter must not crash (Herdr reports the bad folder). Covered in Task 1 (`buildRows` never stats paths).
- A pinned name equal to an open space in another folder: selects that space (name wins). Task 1 test.
- Current space in a non-git folder or at the repo root: no root item. Task 1 test.
- Filter typed: pinned and root rows filter like any row. Task 1 test.
- Clearing a string sub-field in settings removes the key instead of writing `""`. Task 3 manual check.

---

### Task 1: Pure naming and row ordering

**Files:**
- Create: `home/.config/herdr-app/mods/sessionizer/rows.js`
- Create: `home/.config/herdr-app/mods/sessionizer/test/rows.test.js`

**Interfaces:**
- Produces:
  - `nameFor(path: string, git: {top: string, gitDir: string, commonDir: string} | null): string`
  - `buildRows({ pinned: {path, name}[], root: {path, name} | null, spaces: Space[], folders: {label, path}[], openPlaces: string[], localSpaces: Space[] }): Row[]`
    where `Row` is `{kind:"pinned", label, path, name, s?}` | `{kind:"root", label, path, name, s?}` | `{kind:"space", s, label}` | `{kind:"folder", label, path}`; `s` is the open space when one matches.
  - `matches(query, text)` moved here from `main.js` unchanged.

- [ ] **Step 1: Write the failing tests** (`node:test`, `node:assert/strict`)
  - `nameFor("/h/Code/x", null)` → `"x"`
  - `nameFor("/h/.worktree/sapia/fix-login", {top:"/h/.worktree/sapia/fix-login", gitDir:"/h/Code/Unimed/sapia/.git/worktrees/fix-login", commonDir:"/h/Code/Unimed/sapia/.git"})` → `"sapia/fix-login"`
  - plain repo (`gitDir === commonDir`) → folder name
  - `buildRows` order: pinned, root, spaces, folders
  - pinned `default` with an open local space named `default` (any folder): pinned row has `s`, and that space is absent from the `space` rows
  - `root: null` → no root row
  - `buildRows` with a pinned path that doesn't exist on disk returns the row unchanged
- [ ] **Step 2:** `node --test home/.config/herdr-app/mods/sessionizer/test/` → FAIL (module missing)
- [ ] **Step 3:** Implement `rows.js`. Folder hiding keeps today's rule (`p === d.path || p.startsWith(d.path + "/")` against `openPlaces`). Space labels keep `* name  (machine)`.
- [ ] **Step 4:** Same command → PASS
- [ ] **Step 5:** Commit `feat(sessionizer): pure naming and row ordering`

### Task 2: Wire pinned, git names and root item into the mod

**Files:**
- Modify: `home/.config/herdr-app/mods/sessionizer/sources.js` (add `gitInfo`)
- Modify: `home/.config/herdr-app/mods/sessionizer/main.js` (`DEFAULTS`, `rows()`, `go()`, row render)
- Modify: `home/.config/herdr-app/mods/sessionizer/mod.schema.json` (`pinned`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `gitInfo(path: string): Promise<{top, gitDir, commonDir} | null>` via one `exec("git", ["-C", path, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"])`; null on non-zero exit.

- [ ] **Step 1:** `DEFAULTS.pinned = [{ path: "~", name: "default" }]`. Schema: array of `{ path (format folder, required), name (string) }`, title "Pinned", description "Spaces always at the top of the list, opened by name.".
- [ ] **Step 2:** In `init`, after settings load, compute the root item once: `gitInfo(place(current, panes()))`; when `top` differs from the live folder, `root = { path: top, name: nameFor(top, info) }`.
- [ ] **Step 3:** `go()`: `space` → `space.select`; pinned/root with `s` → `space.select`; otherwise `space.new { name, folder, machine: "" }`. Folder rows: `await gitInfo(path)` then `space.new { name: nameFor(...), folder, machine: "" }`. Pinned without `name` uses the same rule.
- [ ] **Step 4:** Render: pinned row like a space row when open, `+` when not; root row label `<name> (repo root)` with the path on the right, mark `^`.
- [ ] **Step 5:** `herdr-app check ~/.config/herdr-app/mods/sessionizer` → no errors.
- [ ] **Step 6:** Live check in the running app: open Sessionizer; `default` is first; Enter opens a space named `default` in `~`; open again, Enter selects it and it is listed once. `cd` into a subfolder of a repo, reopen: root item right after pinned; Enter opens the root. Open a `~/.worktree/<repo>/<handle>` folder: space named `<repo>/<handle>`.
- [ ] **Step 7:** Commit `feat(sessionizer): pinned spaces, git names and repo root item`

### Task 3: String sub-fields in the settings list

**Files:**
- Modify: `home/.config/herdr-app/mods/settings/extra.js:288-307` (`list()`)

**Interfaces:**
- Consumes: `this.field(t, id, value, placeholder, onSubmit, null)` as used at line 287.

- [ ] **Step 1:** In the sub-field loop, for `sub.type === "string"`: a small dim label (`label(key)`) and `this.field(t, \`${id}-${i}-${key}\`, entry[key] ?? "", sub.title ?? label(key), (text, cx) => change(key, text || undefined, cx), null)`.
- [ ] **Step 2:** `herdr-app check ~/.config/herdr-app/mods/settings` → no errors.
- [ ] **Step 3:** Live check: Settings → Sessionizer shows "Pinned" with `~` and `default`; rename to `home`, `mod.json` gets `"name": "home"`; clear it, the key disappears; add a folder with Choose…, it appears in the Sessionizer. Roots rows look as before.
- [ ] **Step 4:** Commit `feat(settings): string sub-fields in list settings`
