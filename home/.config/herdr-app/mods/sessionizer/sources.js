import { exec, home, appHome } from "herdr";

export const expand = (p) => (p === "~" ? home() : p.startsWith("~/") ? home() + p.slice(1) : p);
const shorten = (p) => (p.startsWith(home() + "/") ? `~${p.slice(home().length)}` : p);

// Each root as { path, depth, optional }, from a string or an object in settings.
export function readRoots(settings, problems) {
  const given = settings.roots.length ? settings.roots : ["~"];
  const roots = [];
  for (const [i, r] of given.entries()) {
    const entry = typeof r === "string" ? { path: r } : r;
    if (!entry || typeof entry.path !== "string" || !entry.path) {
      problems.push(`roots[${i}] needs a path`);
      continue;
    }
    const depth = entry.depth ?? settings.depth;
    if (!Number.isInteger(depth) || depth < 1) {
      problems.push(`roots[${i}].depth must be a whole number from 1`);
      continue;
    }
    roots.push({ path: expand(entry.path), depth, optional: entry.optional === true });
  }
  return roots;
}

// Folders under every root, labelled by name; a name found more than once shows its path.
export async function scanFolders(roots, settings) {
  const problems = [];
  const found = new Map();
  await Promise.all(
    roots.map(async (root) => {
      const skip = ["-name", "node_modules", ...(settings.hidden ? [] : ["-o", "-name", ".*"])];
      const r = await exec("find", [root.path, "-mindepth", "1", "-maxdepth", String(root.depth), "(", ...skip, ")", "-prune", "-o", "-type", "d", "-print"]);
      if (r.code !== 0 && !r.stdout.trim()) {
        if (!root.optional) problems.push(`${shorten(root.path)}: ${r.stderr.trim().split("\n")[0] || "cannot be read"}`);
        return;
      }
      for (const path of r.stdout.split("\n")) if (path) found.set(path, path.slice(path.lastIndexOf("/") + 1));
    }),
  );
  const count = new Map();
  for (const name of found.values()) count.set(name, (count.get(name) ?? 0) + 1);
  const folders = [...found].map(([path, name]) => ({ label: count.get(name) > 1 ? shorten(path) : name, path }));
  folders.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  return { folders, problems };
}

// Host aliases from the ssh config and the files it includes, wildcards left out.
export async function readHosts(settings) {
  const r = await exec(`${appHome()}/mods/sessionizer/hosts.sh`, [expand(settings.ssh_config)]);
  if (r.code !== 0) return { hosts: [], problems: [r.stderr.trim().split("\n")[0] || `hosts.sh exited with ${r.code}`] };
  return { hosts: r.stdout.split("\n").filter(Boolean), problems: [] };
}

// Repo top, git dir and common git dir of `path` (they differ in a worktree), or null
// outside git or when git can't start.
export async function gitInfo(path) {
  const r = await exec("git", ["-C", path, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"]).catch(() => null);
  if (!r) return null;
  const [top, gitDir, commonDir] = r.stdout.split("\n");
  return r.code === 0 && commonDir ? { top, gitDir, commonDir } : null;
}
