// What the Sessionizer lists and what a new space is called, kept free of the
// herdr module so Node can test it.

const base = (p) => p.slice(p.lastIndexOf("/") + 1);

// Each character of the query appears in order in the text, like fzf.
export function matches(query, text) {
  let i = 0;
  const t = text.toLowerCase();
  for (const ch of query.toLowerCase()) {
    i = t.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

// A name for a space opened at `path`, or null to let Herdr name it (and keep
// renaming it as its terminal moves). Only a worktree needs one: Herdr would
// show its folder alone, which hides the repo.
export function nameFor(path, git) {
  if (!git || git.gitDir === git.commonDir) return null;
  const main = git.commonDir.replace(/\/\.git\/?$/, "");
  return `${base(main)}/${base(git.top ?? path)}`;
}

const spaceLabel = (s) => `* ${s.name}${s.machine ? `  (${s.machine})` : ""}`;

// Rows in list order: pinned, repo root, open spaces, folders no open space is in.
export function buildRows({ pinned, root, spaces, places, showSpaces, hideOpenFolders, folders }) {
  const local = spaces.filter((s) => s.machine === null);
  const taken = new Set();
  const claim = (s) => (s && taken.add(s.id), s);
  const out = [];
  for (const given of pinned) {
    const p = { ...given, path: given.path.replace(/(.)\/+$/, "$1") };
    const s = claim(local.find((x) => (p.name ? x.named && x.name === p.name : places[x.id] === p.path)));
    out.push({ kind: "pinned", label: p.name ?? base(p.path), path: p.path, name: p.name ?? null, s });
  }
  if (root) {
    const s = local.find((x) => places[x.id] === root.path);
    out.push({ kind: "root", label: `${root.name ?? base(root.path)} (repo root)`, path: root.path, name: root.name, s });
  }
  if (showSpaces) for (const s of spaces) if (!taken.has(s.id)) out.push({ kind: "space", s, label: spaceLabel(s) });
  const open = hideOpenFolders ? local.map((s) => places[s.id]).filter(Boolean) : [];
  for (const d of folders) {
    if (!open.some((p) => p === d.path || p.startsWith(d.path + "/"))) out.push({ kind: "folder", ...d });
  }
  return out;
}
