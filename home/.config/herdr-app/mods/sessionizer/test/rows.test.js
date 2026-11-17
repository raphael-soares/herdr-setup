import { test } from "node:test";
import assert from "node:assert/strict";
import { nameFor, buildRows, matches } from "../rows.js";

const space = (id, name, extra = {}) => ({ id, name, named: true, machine: null, active: false, folder: "", tabs: [], ...extra });

test("a worktree is named after its main repo and its own folder", () => {
  const git = { top: "/h/.worktree/sapia/fix-login", gitDir: "/h/Code/Unimed/sapia/.git/worktrees/fix-login", commonDir: "/h/Code/Unimed/sapia/.git" };
  assert.equal(nameFor("/h/.worktree/sapia/fix-login", git), "sapia/fix-login");
});

test("a plain repo or a non-repo folder gets no forced name", () => {
  assert.equal(nameFor("/h/Code/x", { top: "/h/Code/x", gitDir: "/h/Code/x/.git", commonDir: "/h/Code/x/.git" }), null);
  assert.equal(nameFor("/h/Code/x", null), null);
});

test("rows come as pinned, repo root, open spaces, folders", () => {
  const rows = buildRows({
    pinned: [{ path: "/h", name: "default" }],
    root: { path: "/h/Code/app", name: null },
    spaces: [space("s1", "notes", { folder: "/h/notes" })],
    places: { s1: "/h/notes" },
    showSpaces: true,
    hideOpenFolders: true,
    folders: [{ label: "syncfast", path: "/h/Code/syncfast" }],
  });
  assert.deepEqual(rows.map((r) => r.kind), ["pinned", "root", "space", "folder"]);
});

test("an open space with a pinned name is shown once, as the pinned row", () => {
  const open = space("s1", "default", { folder: "/somewhere/else" });
  const rows = buildRows({
    pinned: [{ path: "/h", name: "default" }],
    root: null,
    spaces: [open],
    places: { s1: "/somewhere/else" },
    showSpaces: true,
    hideOpenFolders: true,
    folders: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "pinned");
  assert.equal(rows[0].s, open);
});

test("a pinned row whose space is closed carries no space", () => {
  const rows = buildRows({ pinned: [{ path: "/missing/folder", name: "default" }], root: null, spaces: [], places: {}, showSpaces: true, hideOpenFolders: true, folders: [] });
  assert.equal(rows[0].kind, "pinned");
  assert.equal(rows[0].path, "/missing/folder");
  assert.equal(rows[0].s, undefined);
});

test("the repo root row points at the space already open there", () => {
  const atRoot = space("s2", "app", { named: false });
  const rows = buildRows({ pinned: [], root: { path: "/h/Code/app", name: null }, spaces: [atRoot], places: { s2: "/h/Code/app" }, showSpaces: true, hideOpenFolders: true, folders: [] });
  assert.equal(rows[0].kind, "root");
  assert.equal(rows[0].s, atRoot);
});

test("no root row without a root", () => {
  const rows = buildRows({ pinned: [], root: null, spaces: [], places: {}, showSpaces: true, hideOpenFolders: true, folders: [] });
  assert.equal(rows.length, 0);
});

test("pinned and root labels filter like any row", () => {
  const rows = buildRows({ pinned: [{ path: "/h", name: "default" }], root: { path: "/h/Code/app", name: null }, spaces: [], places: {}, showSpaces: true, hideOpenFolders: true, folders: [] });
  assert.deepEqual(rows.filter((r) => matches("dft", r.label)).map((r) => r.kind), ["pinned"]);
  assert.deepEqual(rows.filter((r) => matches("app", r.label)).map((r) => r.kind), ["root"]);
});
