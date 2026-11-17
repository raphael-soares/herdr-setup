// Sessionizer, like tmux-sessionizer: open spaces first (*), then the folders under
// the configured roots that no open space is in. Type to filter, Enter goes.
// With props { source: "ssh" } it lists ssh hosts instead: each host is a tab
// named after it in one space, reused if it is already open.
// Settings live under `settings` in mod.json; mod.schema.json describes them.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, run, home, notify, theme, settings as appSettings, props, closeOverlay, shared, setShared, checking } from "herdr";
import { loadSettings } from "./settings.js";
import { readRoots, scanFolders, readHosts } from "./sources.js";

const DEFAULTS = {
  roots: [],
  depth: 1,
  hidden: false,
  open_spaces: true,
  hide_open_folders: true,
  ssh_space: "ssh",
  ssh_config: "~/.ssh/config",
  keys: {
    down: ["down", "ctrl-n", "ctrl-j"],
    up: ["up", "ctrl-p", "ctrl-k"],
    close_space: ["ctrl-x"],
    clear: ["ctrl-u"],
  },
};

const ROW = 32;
const MAX_LIST = 320;
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Space colors, kept by space id in shared "space.colors": a theme
// color name ("ansi6") or a picked #rrggbb. A space seen without one gets
// the theme color fewest spaces use, once; every mod does the same in the
// same order, so they agree, and adding or renaming spaces moves nothing.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, all) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// Each character of the query appears in order in the text, like fzf.
function matches(query, text) {
  let i = 0;
  const t = text.toLowerCase();
  for (const ch of query.toLowerCase()) {
    i = t.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

// "ctrl-n", "down", "alt-shift-k": modifiers joined to the key by "-".
function chord(e) {
  const m = e.modifiers;
  return [m.control && "ctrl", m.alt && "alt", m.shift && "shift", m.platform && "cmd", e.key].filter(Boolean).join("-");
}

const spaceLabel = (s) => `* ${s.name}${s.machine ? `  (${s.machine})` : ""}`;

export default class Sessionizer extends View {
  init(_props, cx) {
    this.ssh = props()?.source === "ssh";
    this.config = DEFAULTS;
    this.loading = true;
    this.filter = "";
    this.at = 0;
    this.scroll = 0;
    this.folders = [];
    this.hosts = [];
    this.input = InputState.new({ placeholder: this.ssh ? "Host…" : "Space or folder…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", () => this.go(this.rows()[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      const { settings, problems } = await loadSettings("sessionizer", DEFAULTS);
      this.config = settings;
      if (this.ssh) {
        const r = await readHosts(settings);
        this.hosts = r.hosts;
        problems.push(...r.problems);
      } else {
        const r = await scanFolders(readRoots(settings, problems), settings);
        this.folders = r.folders;
        problems.push(...r.problems);
      }
      this.loading = false;
      if (problems.length) notify({ title: "Sessionizer", body: problems.join("\n"), level: "warning" });
      cx.notify();
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  sshSpace() {
    return spaces().find((s) => s.named && s.name === this.config.ssh_space && s.machine === null);
  }

  rows() {
    let out;
    if (this.ssh) {
      const tabs = this.sshSpace()?.tabs ?? [];
      out = this.hosts.map((h) => ({ kind: "host", label: h, tab: tabs.find((c) => c.named && c.name === h) }));
    } else {
      const all = this.config.open_spaces ? spaces() : [];
      const live = panes();
      const open = this.config.hide_open_folders ? spaces().filter((s) => s.machine === null).map((s) => place(s, live)).filter(Boolean) : [];
      out = all.map((s) => ({ kind: "space", s, label: spaceLabel(s) }));
      for (const d of this.folders) {
        if (!open.some((p) => p === d.path || p.startsWith(d.path + "/"))) out.push({ kind: "folder", ...d });
      }
    }
    return this.filter ? out.filter((r) => matches(this.filter, r.label)) : out;
  }

  go(r) {
    if (!r) return;
    this.dismiss();
    if (r.kind === "space") run("space.select", { id: r.s.id });
    else if (r.kind === "folder") run("space.new", { folder: r.path, machine: "" });
    else this.openHost(r);
  }

  openHost(r) {
    const s = this.sshSpace();
    const argv = ["ssh", r.label];
    if (!s) return run("space.new", { name: this.config.ssh_space, tab: r.label, folder: home(), machine: "", argv });
    run("space.select", { id: s.id });
    if (r.tab) run("tab.select", { id: r.tab.id });
    else run("tab.new", { name: r.label, space: s.id, folder: home(), argv });
  }

  onKey(e, rows, cx) {
    const k = chord(e);
    const is = (action) => this.config.keys[action]?.includes(k);
    const n = rows.length;
    const sel = rows[this.at];
    if (e.key === "escape") return this.dismiss();
    if (n && is("down")) this.at = (this.at + 1) % n;
    else if (n && is("up")) this.at = (this.at + n - 1) % n;
    else if (is("close_space")) {
      if (sel?.kind === "space" && !sel.s.active) run("space.close", { id: sel.s.id, confirmed: true });
    } else if (is("clear")) {
      this.input.set_value("");
      this.filter = "";
      this.at = 0;
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    // One continuous strip: each row at a fixed y. Scrolling moves the strip only
    // as far as it takes to keep the selected row in view.
    const total = rows.length * ROW;
    const height = Math.min(MAX_LIST, this.listHeight ?? MAX_LIST);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    if (rows.length) {
      if (this.at * ROW < this.scroll) this.scroll = this.at * ROW;
      if ((this.at + 1) * ROW > this.scroll + height) this.scroll = (this.at + 1) * ROW - height;
    }
    const position = (el, i) => (fixed ? el.absolute().left(0).right(0).top(i * ROW - this.scroll).h(ROW) : el);
    const visible = (i) => !fixed || ((i + 1) * ROW > this.scroll && i * ROW < this.scroll + height);
    const home_ = home();

    const row = (r, i) => {
      const base = h_flex()
        .id(r.kind === "space" ? `sz-${r.s.id}` : `sz-${r.kind}-${r.path ?? r.label}`)
        .mx(4)
        .px(10)
        .h(ROW)
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click(() => this.go(r));
      if (r.kind === "space") {
        return base
          .child(h_flex().size(18).flex_none().rounded(5).bg(spaceColor(t, r.s)).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...r.s.name][0]?.toUpperCase() ?? "?"))
          .child(div().flex_1().truncate().text_color(t.foreground).when(r.s.active, (d) => d.font_semibold()).child(r.label))
          .when(r.s.active, (el) => el.child(div().text_size(11).text_color(t.dim).child("current")));
      }
      if (r.kind === "host") {
        return base
          .child(div().w(18).flex_none().text_color(r.tab ? t.foreground : t.muted).child(r.tab ? "*" : "+"))
          .child(div().flex_1().truncate().text_color(t.foreground).child(r.label))
          .when(Boolean(r.tab), (el) => el.child(div().text_size(11).text_color(t.dim).child("open")));
      }
      const shown = r.path.startsWith(home_ + "/") ? `~${r.path.slice(home_.length)}` : r.path;
      return base
        .child(div().w(18).flex_none().text_color(t.muted).child("+"))
        .child(div().flex_none().text_color(t.foreground).child(r.label))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(t.dim).child(shown));
    };

    const empty = this.loading ? "Looking…" : this.filter ? "Nothing matches" : this.ssh ? "No ssh hosts" : "No spaces or folders";

    return v_flex()
      .id("sessionizer")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => this.onKey(e, rows, cx))
      .child(
        h_flex()
          .items_center()
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(this.ssh ? "SSH" : "Sessionizer"))
          .child(div().id("sz-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.dismiss()).child("Esc")),
      )
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg("mods/sessionizer/icons/search.svg").size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .when(!rows.length, (el) => el.child(div().px(14).h(ROW).flex().items_center().mb(6).text_color(t.dim).child(empty)))
      .when(rows.length > 0, (el) =>
        el.child(
          v_flex()
            .id("sz-list")
            .on_size_change((size, cx) => {
              this.listHeight = size.height / appSettings().zoom;
              cx.notify();
            })
            .h(Math.min(MAX_LIST, total))
            .min_h(0)
            .mb(6)
            .when(fixed, (el) =>
              el.overflow_hidden().on_scroll_wheel((e, cx) => {
                this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
                // The selection follows the wheel, so the next frame doesn't scroll back to it.
                while (this.at < rows.length - 1 && this.at * ROW < this.scroll) this.at++;
                while (this.at > 0 && (this.at + 1) * ROW > this.scroll + height) this.at--;
                cx.notify();
              }))
            .children(rows.map((r, i) => (visible(i) ? position(row(r, i), i) : null)).filter(Boolean)),
        ),
      );
  }
}
