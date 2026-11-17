// The sections this clone adds to Herdr's Settings: our mods' settings, drawn from
// their mod.schema.json; the settings.json keys Herdr's own sections leave out;
// and keys.json. Everything is written back to the same files, with the
// read-change-write-if-unchanged rule the shipped sections use for settings.json.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, readTextFile, writeTextFile, notify, pickFolder } from "herdr";

export const EXTRA_SECTIONS = [
  { id: "sessionizer", title: "Sessionizer", icon: "search" },
  { id: "sidebar", title: "Sidebar", icon: "panel-right" },
  { id: "terminal", title: "Terminal", icon: "terminal" },
  { id: "keys", title: "Keys", icon: "keyboard" },
];

// Section id -> the mod whose mod.json `settings` it edits.
const MODS = { sessionizer: "sessionizer", sidebar: "setup" };

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const label = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

class JsonFile {
  constructor(path, name) {
    this.path = path;
    this.name = name;
    this.raw = null;
    this.data = null;
    this.error = null;
  }

  async load() {
    this.raw = await readTextFile(this.path);
    try {
      const value = this.raw ? JSON.parse(this.raw) : {};
      if (!isObject(value)) throw new Error("not an object");
      this.data = value;
      this.error = null;
    } catch {
      this.data = null;
      this.error = `${this.name} has errors: fix it first`;
    }
  }

  // The reason `edit` wasn't written, or null once it is.
  async change(edit) {
    let error;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.load();
      if (this.error) return this.error;
      const next = JSON.parse(JSON.stringify(this.data));
      const refused = edit(next);
      if (refused) return refused;
      const text = JSON.stringify(next, null, 2) + "\n";
      try {
        await writeTextFile(this.path, text, this.raw);
        this.raw = text;
        this.data = next;
        return null;
      } catch (e) {
        error = e;
      }
    }
    return `Not saved to ${this.name}: ${error?.message ?? error}`;
  }
}

// Sets obj[path] to value; a value equal to the default is removed instead, with
// the objects it leaves empty, so the file keeps only what differs.
function assign(obj, path, value, fallback) {
  const chain = [obj];
  for (const key of path.slice(0, -1)) {
    if (!isObject(chain.at(-1)[key])) chain.at(-1)[key] = {};
    chain.push(chain.at(-1)[key]);
  }
  const last = path.at(-1);
  if (value === undefined || same(value, fallback)) delete chain.at(-1)[last];
  else chain.at(-1)[last] = value;
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length) break;
    delete chain[i - 1][path[i - 1]];
  }
}

export class Extra {
  constructor(host, cx) {
    this.host = host;
    this.input = InputState.new();
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("blur", (_e, cx) => this.commit(cx));
    this.edit = null; // { id, initial, apply(text) } while a text field is open
    this.adding = null; // { section, chord } while a new key is typed
    this.mods = {};
    for (const [section, mod] of Object.entries(MODS)) {
      this.mods[section] = { file: new JsonFile(`${appHome()}/mods/${mod}/mod.json`, `mods/${mod}/mod.json`), schema: null, mod };
    }
    this.keys = new JsonFile(`${appHome()}/keys.json`, "keys.json");
    cx.spawn(async (cx) => {
      await this.keys.load();
      for (const m of Object.values(this.mods)) {
        await m.file.load();
        try {
          m.schema = JSON.parse((await readTextFile(`${appHome()}/mods/${m.mod}/mod.schema.json`)) ?? "null");
        } catch {
          m.schema = null;
        }
      }
      cx.notify();
    });
  }

  has(section) {
    return EXTRA_SECTIONS.some((s) => s.id === section);
  }

  // Esc leaves an open field before it closes the dialog.
  onKey(e, cx) {
    if (e.key !== "escape" || (!this.edit && !this.adding)) return false;
    this.edit = null;
    this.adding = null;
    this.host.handle.focus();
    cx.stop_propagation();
    cx.notify();
    return true;
  }

  save(file, edit, cx) {
    cx.spawn(async (cx) => {
      const failed = await file.change(edit);
      if (failed) notify({ title: failed, level: "error" });
      cx.notify();
    });
  }

  start(id, value, apply, cx) {
    this.edit = { id, initial: value, apply };
    this.input.set_value(value);
    this.input.focus();
    cx.notify();
  }

  commit(cx) {
    const edit = this.edit;
    if (!edit) return;
    this.edit = null;
    const text = this.input.value().trim();
    if (text !== edit.initial) edit.apply(text, cx);
    this.host.handle.focus();
    cx.notify();
  }

  // A text value: shown as a box, an input while it's clicked.
  field(t, id, value, placeholder, apply, width) {
    const box = (el) => (width ? el.w(width) : el.flex_1().min_w(0));
    if (this.edit?.id === id) {
      return box(Input.new(this.input).h(30).px(9).rounded(7).border_1().border_color(t.accent).bg(t.background).text_size(13).text_color(t.foreground));
    }
    return box(
      div()
        .id(id)
        .h(30)
        .px(9)
        .flex()
        .items_center()
        .rounded(7)
        .border_1()
        .border_color(t.border)
        .bg(t.background)
        .cursor_text()
        .text_size(13)
        .text_color(value ? t.foreground : t.dim)
        .hover((s) => s.border_color(t.muted))
        .on_click((_e, cx) => this.start(id, value, apply, cx))
        .child(div().truncate().child(value || placeholder)),
    );
  }

  remove(t, id, onClick) {
    return div()
      .id(id)
      .w(26)
      .h(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .cursor_pointer()
      .text_size(15)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(onClick)
      .child("\u00d7");
  }

  // A setting with a list or a wide control under its title instead of beside it.
  block(t, title, about, body) {
    return v_flex()
      .w_full()
      .gap(8)
      .py(12)
      .border_b(1)
      .border_color(t.border)
      .child(div().text_size(14).text_color(t.foreground).child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(12.5).line_height("18px").text_color(t.dim).child(about)))
      .child(body);
  }

  note(t, text) {
    return div().pb(6).text_size(12.5).line_height("18px").text_color(t.dim).child(text);
  }

  render(section, t) {
    if (section === "terminal") return this.terminal(t);
    if (section === "keys") return this.keyList(t);
    return this.modSettings(section, t);
  }

  // Every write takes the cx of the click or input event that asked for it: the
  // render cx can't spawn once render returns, so a write through it never ran.
  modSettings(section, t) {
    const m = this.mods[section];
    const body = v_flex().w_full().child(this.note(t, `Saved in mods/${m.mod}/mod.json. Saving reloads the mod.`));
    if (m.file.error) return body.child(this.note(t, m.file.error));
    const fields = m.schema?.properties?.settings?.properties;
    if (!m.file.data || !fields) return body.child(this.note(t, m.file.data ? `mods/${m.mod}/mod.schema.json describes no settings.` : "Reading…"));
    const set = (path, value, fallback, cx) => this.save(m.file, (next) => assign(next, ["settings", ...path], value, fallback), cx);
    return body.children(Object.entries(fields).map(([key, schema]) => this.prop(t, `${section}-${key}`, [key], schema, m.file.data.settings?.[key], set)));
  }

  prop(t, id, path, schema, given, set) {
    const title = schema.title ?? label(path.at(-1));
    const about = schema.description;
    const fallback = schema.default;
    const value = given ?? fallback;
    const types = [].concat(schema.type ?? []);
    if (types[0] === "object" && schema.properties) {
      return v_flex()
        .w_full()
        .pt(10)
        .child(this.host.heading(t, title))
        .children(Object.entries(schema.properties).map(([key, sub]) => this.prop(t, `${id}-${key}`, [...path, key], sub, given?.[key], set)));
    }
    if (types[0] === "boolean") {
      return this.host.row(t, title, about, this.host.toggle(t, id, Boolean(value), (_e, cx) => set(path, !value, fallback, cx)));
    }
    if (types[0] === "integer" || types[0] === "number") {
      const step = schema.multipleOf ?? 1;
      const clamp = (n) => Math.min(schema.maximum ?? Infinity, Math.max(schema.minimum ?? -Infinity, Math.round(n / step) * step));
      const now = Number(value ?? 0);
      return this.host.row(t, title, about, this.host.stepper(t, id, String(now), (_e, cx) => set(path, clamp(now - step), fallback, cx), (_e, cx) => set(path, clamp(now + step), fallback, cx)));
    }
    if (types[0] === "array") return this.list(t, id, title, about, path, schema, Array.isArray(value) ? value : [], set);
    // A string, or a string that may also be written as a number (a duration).
    const apply = (text, cx) => {
      if (!text) return set(path, undefined, fallback, cx);
      if (schema.pattern && !new RegExp(schema.pattern).test(text)) return notify({ title: `${title}: "${text}" doesn't fit`, body: about, level: "error" });
      set(path, text, fallback, cx);
    };
    return this.host.row(t, title, about, this.field(t, id, value == null ? "" : String(value), String(fallback ?? ""), apply, 220));
  }

  // A list of strings, or of strings and objects (a folder with options).
  list(t, id, title, about, path, schema, items, set) {
    const variants = schema.items?.oneOf ?? [schema.items ?? {}];
    const shape = variants.find((v) => v.type === "object");
    const main = shape ? (shape.required?.[0] ?? Object.keys(shape.properties)[0]) : null;
    const folders = (shape ? shape.properties[main] : schema.items)?.format === "folder";
    const write = (next, cx) => set(path, next, schema.default, cx);
    // An object with nothing but its main field goes back to the short string form.
    const tidy = (entry) => (shape && variants.some((v) => v.type === "string") && Object.keys(entry).length === 1 ? entry[main] : entry);
    const rows = items.map((item, i) => {
      const entry = shape ? (typeof item === "string" ? { [main]: item } : { ...item }) : item;
      const change = (key, v, cx) => {
        const next = { ...entry };
        if (v === undefined) delete next[key];
        else next[key] = v;
        write(items.map((x, j) => (j === i ? tidy(next) : x)), cx);
      };
      const row = h_flex().w_full().gap(8).items_center();
      if (!shape) {
        return row
          .child(this.field(t, `${id}-${i}`, entry, "", (text, cx) => write(text ? items.map((x, j) => (j === i ? text : x)) : items.filter((_, j) => j !== i), cx), null))
          .child(this.remove(t, `${id}-${i}-x`, (_e, cx) => write(items.filter((_, j) => j !== i), cx)));
      }
      row.child(this.field(t, `${id}-${i}`, entry[main], "", (text, cx) => (text ? change(main, text, cx) : write(items.filter((_, j) => j !== i), cx)), null));
      for (const [key, sub] of Object.entries(shape.properties)) {
        if (key === main) continue;
        if (sub.type === "integer") {
          // Unset ("-") follows the list-wide setting; below the minimum goes back to unset.
          const cur = entry[key];
          const low = sub.minimum ?? 1;
          row.child(div().text_size(12).text_color(t.dim).child(label(key)));
          row.child(
            this.host.stepper(
              t,
              `${id}-${i}-${key}`,
              cur === undefined ? "-" : String(cur),
              (_e, cx) => cur !== undefined && change(key, cur <= low ? undefined : cur - 1, cx),
              (_e, cx) => change(key, cur === undefined ? (sub.default ?? low) : Math.min(sub.maximum ?? Infinity, cur + 1), cx),
            ),
          );
        } else if (sub.type === "boolean") {
          row.child(div().text_size(12).text_color(t.dim).child(label(key)));
          row.child(this.host.toggle(t, `${id}-${i}-${key}`, entry[key] === true, (_e, cx) => change(key, entry[key] === true ? undefined : true, cx)));
        }
      }
      return row.child(this.remove(t, `${id}-${i}-x`, (_e, cx) => write(items.filter((_, j) => j !== i), cx)));
    });
    const add = h_flex()
      .w_full()
      .gap(8)
      .items_center()
      .child(this.field(t, `${id}-new`, "", folders ? "Type a folder, or choose one" : "Add", (text, cx) => text && write([...items, text], cx), null))
      .when(folders, (el) =>
        el.child(
          this.host.button(t, `${id}-pick`, "Choose…", (_e, cx) =>
            cx.spawn(async (cx) => {
              const folder = await pickFolder({ prompt: title });
              if (folder) write([...items, folder], cx);
              cx.notify();
            }),
          ),
        ),
      );
    return this.block(t, title, about, v_flex().w_full().gap(6).children(rows).child(add));
  }

  terminal(t) {
    const p = this.host.person;
    const change = (edit, cx) => this.host.change(edit, cx);
    const flag = (key, fallback) => (p[key] ?? fallback) === true;
    const toggle = (key, fallback, cx) => change((next) => {
      const on = !flag(key, fallback);
      if (on === fallback) delete next[key];
      else next[key] = on;
    }, cx);
    const contrast = Number(p.minimum_contrast ?? 1);
    const setContrast = (n, cx) => change((next) => {
      const v = Math.round(Math.min(21, Math.max(1, n)) * 10) / 10;
      if (v === 1) delete next.minimum_contrast;
      else next.minimum_contrast = v;
    }, cx);
    const directory = p.worktrees?.directory ?? "";
    const setDirectory = (dir, cx) => change((next) => {
      const rest = { ...(next.worktrees ?? {}) };
      if (dir) rest.directory = dir;
      else delete rest.directory;
      if (Object.keys(rest).length) next.worktrees = rest;
      else delete next.worktrees;
    }, cx);
    return v_flex()
      .w_full()
      .child(this.note(t, "Saved in settings.json, next to what Herdr's own sections write."))
      .child(this.host.heading(t, "Worktrees"))
      .child(
        this.block(
          t,
          "Worktree folder",
          "Where New worktree makes checkouts: <folder>/<repo>/<branch>. Empty: ~/.herdr/worktrees.",
          h_flex()
            .w_full()
            .gap(8)
            .child(this.field(t, "tm-worktrees", directory, "~/.herdr/worktrees", (text, cx) => setDirectory(text, cx), null))
            .child(
              this.host.button(t, "tm-worktrees-pick", "Choose…", (_e, cx) =>
                cx.spawn(async (cx) => {
                  const folder = await pickFolder({ prompt: "Worktree folder" });
                  if (folder) setDirectory(folder, cx);
                  cx.notify();
                }),
              ),
            ),
        ),
      )
      .child(div().h(12))
      .child(this.host.heading(t, "Terminals"))
      .child(this.host.row(t, "Scrollbars", "A scrollbar on each terminal with scrollback.", this.host.toggle(t, "tm-scrollbars", flag("pane_scrollbars", true), (_e, cx) => toggle("pane_scrollbars", true, cx))))
      .child(this.host.row(t, "Font ligatures", "Join characters like -> and != in terminal fonts that have ligatures.", this.host.toggle(t, "tm-ligatures", flag("font_ligatures", false), (_e, cx) => toggle("font_ligatures", false, cx))))
      .child(
        this.host.row(
          t,
          "Minimum contrast",
          "Terminal text below this contrast ratio becomes near white or near black. 1 leaves program colors alone; 1.6 was the old adjustment.",
          this.host.stepper(t, "tm-contrast", contrast.toFixed(1), (_e, cx) => setContrast(contrast - 0.1, cx), (_e, cx) => setContrast(contrast + 0.1, cx)),
        ),
      );
  }

  keyList(t) {
    const body = v_flex().w_full().child(this.note(t, "Saved in keys.json and used at once. A key is like ctrl-shift-t, or a sequence like ctrl-space c. An action is a command (tab.new, pane.split:down), <mod>.<command>, send:<text>, or {\"command\": …, \"args\": {…}}."));
    const data = this.keys.data;
    if (this.keys.error) return body.child(this.note(t, this.keys.error));
    if (!data) return body.child(this.note(t, "Reading…"));
    const save = (edit, cx) => this.save(this.keys, edit, cx);
    // send: actions carry control characters (ctrl-space is \u0000): shown and typed escaped.
    const actionText = (a) => (typeof a === "string" ? a.replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`) : JSON.stringify(a));
    const parseAction = (text) => {
      if (!text.startsWith("{")) return { value: text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))) };
      try {
        const v = JSON.parse(text);
        return isObject(v) && typeof v.command === "string" ? { value: v } : { error: "An object action needs a \"command\"" };
      } catch (e) {
        return { error: `Not JSON: ${e.message}` };
      }
    };
    const setAction = (section, chord, text, cx) => {
      const parsed = parseAction(text);
      if (parsed.error) return notify({ title: parsed.error, level: "error" });
      if (!parsed.value) return notify({ title: "An action can't be empty: use × to remove the key", level: "error" });
      save((next) => void (next[section][chord] = parsed.value), cx);
    };
    const rename = (section, chord, text, cx) =>
      save((next) => {
        if (!text) return "A key can't be empty: use × to remove it";
        if (text in next[section]) return `${text} is already in ${section}`;
        next[section] = Object.fromEntries(Object.entries(next[section]).map(([k, v]) => [k === chord ? text : k, v]));
      }, cx);
    const sections = Object.keys(data).filter((s) => isObject(data[s]));
    for (const section of sections) {
      const id = `ks-${section}`;
      const rows = Object.entries(data[section]).map(([chord, action], i) =>
        h_flex()
          .w_full()
          .gap(8)
          .items_center()
          .child(this.field(t, `${id}-${i}-k`, chord, "", (text, cx) => rename(section, chord, text, cx), 200))
          .child(this.field(t, `${id}-${i}-a`, actionText(action), "", (text, cx) => setAction(section, chord, text, cx), null))
          .child(this.remove(t, `${id}-${i}-x`, (_e, cx) => save((next) => void delete next[section][chord], cx))),
      );
      const adding = this.adding?.section === section ? this.adding : null;
      const add = adding
        ? h_flex()
            .w_full()
            .gap(8)
            .items_center()
            .child(this.field(t, `${id}-new-k`, adding.chord, "Key", (text) => { adding.chord = text; }, 200))
            .child(
              this.field(t, `${id}-new-a`, "", "Action", (text, cx) => {
                const parsed = parseAction(text);
                if (parsed.error || !parsed.value || !adding.chord) return notify({ title: parsed.error ?? "Type the key and the action", level: "error" });
                const chord = adding.chord;
                this.adding = null;
                save((next) => {
                  if (chord in next[section]) return `${chord} is already in ${section}`;
                  next[section][chord] = parsed.value;
                }, cx);
              }, null),
            )
            .child(this.remove(t, `${id}-new-x`, (_e, cx) => { this.adding = null; cx.notify(); }))
        : div().child(this.host.button(t, `${id}-add`, "Add key", (_e, cx) => { this.adding = { section, chord: "" }; cx.notify(); }));
      body.child(v_flex().w_full().gap(6).pt(10).pb(12).border_b(1).border_color(t.border).child(this.host.heading(t, section)).children(rows).child(add));
    }
    return body.child(
      v_flex()
        .w_full()
        .gap(6)
        .pt(12)
        .child(this.note(t, "A new section: terminal, layout:<name> or mod:<name>."))
        .child(
          h_flex().w_full().child(
            this.field(t, "ks-new-section", "", "Section name", (text, cx) => {
              if (!/^(global|terminal|layout:.+|mod:.+)$/.test(text)) return notify({ title: `"${text}" is not a keys.json section`, level: "error" });
              save((next) => (text in next ? `${text} is already there` : void (next[text] = {})), cx);
            }, 260),
          ),
        ),
    );
  }
}
