// Agenda: scheduled agent prompts (herdr-automations) as a modal.
// Everything goes through the herdr-automations CLI JSON (internal/api/api.go
// upstream is the contract); the yaml and history files are only watched.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { exec, home, theme, terminals, spaces, run, pickFolder, watchFolder, props, closeOverlay, checking } from "herdr";

const FINISHED = new Set(["done", "failed", "cancelled", "missed"]);
const ACCOUNTS = [["omp-personal", "Personal"], ["omp-work", "Work"]];
const MODES = [["once", "Once"], ["hourly", "Hourly"], ["daily", "Daily"], ["weekdays", "Weekdays"], ["weekly", "Weekly"], ["advanced", "Advanced"]];
const ONCE_DAYS = [["today", "Today"], ["tomorrow", "Tomorrow"], ["date", "Pick a date"]];
const WORKSPACES = [["worktree", "New worktree"], ["root", "Repo root"], ["existing", "Existing space"]];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const I = (name) => `mods/setup/icons/${name}.svg`;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const tilde = (p) => (p && p.startsWith(home()) ? "~" + p.slice(home().length) : p ?? "");
const expand = (p) => (p.startsWith("~/") ? home() + p.slice(1) : p);
const base = (p) => (p ?? "").replace(/\/+$/, "").split("/").pop() || p || "";
const pad = (n) => String(n).padStart(2, "0");
const hm = (h, m) => `${pad(h)}:${pad(m)}`;
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const nextMs = (a) => (a.next && !a.next.startsWith("0001") ? Date.parse(a.next) : Infinity);
const accountLabel = (a) => (a.template ? ACCOUNTS.find(([v]) => v === a.template)?.[1] ?? a.template : a.agent || "agent");

function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function until(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))}m`;
  const d = new Date(iso), t = hm(d.getHours(), d.getMinutes());
  if (s < 86400 && d.getDate() === new Date().getDate()) return `today ${t}`;
  // Spelled out: the mod runtime ignores toLocaleDateString's options.
  return `${DAY_NAMES[d.getDay()]} ${t}`;
}
function duration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h${pad(Math.round((sec % 3600) / 60))}`;
}
function slug(text) {
  return (text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter(Boolean).slice(0, 4).join("-").slice(0, 40).replace(/^-+|-+$/g, "");
}

function parseDays(d) {
  let out;
  if (d.includes("-")) {
    const [a, b] = d.split("-").map(Number);
    if (a > b) return null;
    out = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else out = d.split(",").map(Number);
  return [...new Set(out.map((n) => n % 7))].sort();
}
function parseCron(cron) {
  const c = (cron ?? "").trim();
  let m = c.match(/^(\d{1,2}) \* \* \* \*$/);
  if (m && +m[1] < 60) return { mode: "hourly", m: +m[1], h: 9, days: [1] };
  m = c.match(/^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-7](?:,[0-7])*|[0-7]-[0-7])$/);
  if (m && +m[1] < 60 && +m[2] < 24) {
    const [, mi, h, d] = m;
    if (d === "*") return { mode: "daily", m: +mi, h: +h, days: [1] };
    if (d === "1-5") return { mode: "weekdays", m: +mi, h: +h, days: [1] };
    const days = parseDays(d);
    if (days) return { mode: "weekly", m: +mi, h: +h, days };
  }
  return { mode: "advanced", raw: c };
}
function describe(a) {
  if (a.at) {
    const d = new Date(a.at), day = ymd(d);
    const label = day === dayOffset(0) ? "Today" : day === dayOffset(1) ? "Tomorrow" : `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
    return [hm(d.getHours(), d.getMinutes()), `${label}, once`];
  }
  const p = parseCron(a.cron);
  if (p.mode === "hourly") return [`:${pad(p.m)}`, "every hour"];
  if (p.mode === "daily") return [hm(p.h, p.m), "every day"];
  if (p.mode === "weekdays") return [hm(p.h, p.m), "Mon to Fri"];
  if (p.mode === "weekly") return [hm(p.h, p.m), p.days.map((d) => DAY_NAMES[d]).join(", ")];
  const n = nextMs(a);
  return [n === Infinity ? "--:--" : hm(new Date(n).getHours(), new Date(n).getMinutes()), "custom"];
}

export class Agenda {
  init(_props, cx) {
    this.list = null;
    this.runs = [];
    this.view = "list";
    this.ed = null;
    this.error = null;
    this.fresh = [];
    this.added = new Set();
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (checking()) return;
    cx.spawn(async (cx) => {
      this.bin = await this.locate();
      if (!this.bin) { this.missing = true; cx.notify(); return; }
      await this.refresh(cx);
      this.watch(cx);
    });
    cx.timer.every(30000, (cx) => this.refresh(cx));
  }

  async locate() {
    for (const bin of ["herdr-automations", `${home()}/.local/bin/herdr-automations`]) {
      try { if ((await exec(bin, ["version"])).code === 0) return bin; } catch {}
    }
    return null;
  }

  async cli(args) {
    const r = await exec(this.bin, args);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().replace(/^error: /, ""));
    return r.stdout;
  }

  async refresh(cx) {
    if (!this.bin) return;
    try {
      this.list = JSON.parse(await this.cli(["ls", "--json"]));
      this.runs = JSON.parse(await this.cli(["history", "--json"]));
      this.error = null;
    } catch (e) { this.error = String(e.message ?? e); }
    cx.notify();
    this.collect(cx);
    if (this.list && !this.list.scheduler && !this.started) {
      this.started = true;
      this.act(cx, ["service", "install"]);
    }
  }

  // "Disappears once seen": finished runs land in this.fresh and are marked
  // seen right away, which also clears the dot on the titulo robot.
  collect(cx) {
    const add = this.runs.filter((r) => FINISHED.has(r.status) && !r.seen && !this.added.has(r.run_id));
    if (!add.length) return;
    for (const r of add) this.added.add(r.run_id);
    this.fresh = [...add, ...this.fresh].slice(0, 10);
    cx.spawn(async () => { for (const r of add) { try { await this.cli(["seen", r.run_id]); } catch {} } });
  }

  watch(cx) {
    const dirs = [this.list?.config?.replace(/\/[^/]+$/, ""), this.list?.state].filter(Boolean);
    for (const dir of dirs) cx.spawn(async (cx) => {
      for (;;) { try { await watchFolder(dir); } catch { return; } await this.refresh(cx); }
    });
  }

  live(address) { return terminals().find((t) => t.address === address && t.state === "live"); }

  act(cx, args, then) {
    cx.spawn(async (cx) => {
      try { await this.cli(args); then?.(); this.error = null; } catch (e) { this.error = String(e.message ?? e); }
      await this.refresh(cx);
    });
  }

  openRun(r, cx) {
    if (r.terminal && this.live(r.terminal)) {
      // As a modal, a focused terminal would sit behind it.
      if (props()?.overlay) closeOverlay(props().overlay);
      run("pane.focus", { terminal: r.terminal });
    } else if (this.list?.automations.some((a) => a.name === r.automation)) this.edit(r.automation, cx);
  }

  // ---- editor ----

  edit(original, cx) {
    const a = original ? this.list?.automations.find((x) => x.name === original) : null;
    if (original && !a) return;
    const here = spaces().find((s) => s.active && !s.machine);
    const src = a ?? { cron: "0 9 * * 1-5", repo: here?.folder ?? "", workspace: "worktree", template: "omp-personal", timeout_minutes: 60 };
    let p = parseCron(src.cron), onceDay = null, date = "";
    if (src.at) {
      const d = new Date(src.at);
      date = ymd(d);
      onceDay = date === dayOffset(0) ? "today" : date === dayOffset(1) ? "tomorrow" : "date";
      p = { mode: "once", h: d.getHours(), m: d.getMinutes(), days: [1] };
    }
    const field = (value, placeholder) => {
      const s = InputState.new({ placeholder, value: value ?? "" });
      s.on("change", (_e, cx) => { cx.notify(); this.preview(cx); });
      return s;
    };
    const known = ACCOUNTS.some(([v]) => v === src.template) && !src.agent;
    const e = {
      original, mode: p.mode, days: p.days ?? [1],
      minute: field(pad(p.m ?? 0), "00"),
      time: field(p.h !== undefined ? hm(p.h, p.m) : "09:00", "09:00"),
      raw: field(p.mode === "advanced" ? p.raw : src.cron ?? "", "*/15 9-18 * * 1-5"),
      onceDay, date: field(date || dayOffset(1), "2026-11-20"),
      name: field(src.name, ""),
      timeout: field(String(src.timeout_minutes || 60), "60"),
      mcp: field(tilde(src.mcp_config), "path to an MCP servers JSON"),
      model: field(src.model, "agent default"),
      prompt: TextareaState.new({ placeholder: "What should the agent do each time?", value: src.prompt ?? "" }),
      repo: src.repo ?? "", repoOpen: false, repos: [],
      account: known ? src.template : "other",
      other: { agent: src.agent ?? "", template: src.template ?? "", model: src.model ?? "" },
      workspace: src.workspace ?? "worktree", workspace_id: src.workspace_id ?? "",
      more: false, deleting: false, tried: false, result: null, seq: 0,
    };
    e.prompt.set_auto_grow(5, 14);
    e.prompt.on("change", (_e, cx) => { cx.notify(); this.preview(cx); });
    this.ed = e;
    this.view = "editor";
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", 'for d in "$HOME"/Code/*/*/; do [ -e "$d.git" ] && echo "${d%/}"; done']);
        e.repos = r.stdout.split("\n").filter(Boolean);
      } catch {}
      cx.notify();
    });
    this.preview(cx);
    cx.notify();
  }

  setMode(mode, cx) {
    const e = this.ed;
    if (mode === e.mode) return;
    const time = e.time.value().trim();
    if (mode === "advanced") e.raw.set_value(this.buildCron() ?? e.raw.value());
    else if (mode === "hourly" && TIME_RE.test(time)) e.minute.set_value(time.split(":")[1]);
    else if (e.mode === "hourly" && /^\d{1,2}$/.test(e.minute.value().trim()) && TIME_RE.test(time))
      e.time.set_value(`${time.split(":")[0].padStart(2, "0")}:${pad(+e.minute.value().trim() % 60)}`);
    if (mode === "once" && !e.onceDay) {
      const v = e.time.value().trim(), now = new Date();
      const [h, m] = TIME_RE.test(v) ? v.split(":").map(Number) : [9, 0];
      e.onceDay = h * 60 + m > now.getHours() * 60 + now.getMinutes() ? "today" : "tomorrow";
    }
    e.mode = mode;
    this.preview(cx);
    cx.notify();
  }

  // Recurring modes answer a cron line; Once answers a local "YYYY-MM-DDTHH:MM".
  buildCron() {
    const e = this.ed;
    if (e.mode === "advanced") return e.raw.value().trim();
    if (e.mode === "hourly") {
      const v = e.minute.value().trim();
      return /^\d{1,2}$/.test(v) && +v < 60 ? `${+v} * * * *` : null;
    }
    const v = e.time.value().trim();
    if (!TIME_RE.test(v)) return null;
    const [h, m] = v.split(":").map(Number);
    if (e.mode === "once") return null;
    if (e.mode === "daily") return `${m} ${h} * * *`;
    if (e.mode === "weekdays") return `${m} ${h} * * 1-5`;
    return `${m} ${h} * * ${[...e.days].sort().join(",")}`;
  }

  buildAt() {
    const e = this.ed, v = e.time.value().trim();
    const date = e.onceDay === "today" ? dayOffset(0) : e.onceDay === "tomorrow" ? dayOffset(1) : e.date.value().trim();
    if (!TIME_RE.test(v) || !DATE_RE.test(date)) return null;
    const [h, m] = v.split(":").map(Number);
    return `${date}T${hm(h, m)}`;
  }

  draft() {
    const e = this.ed;
    const once = e.mode === "once";
    const cron = once ? "" : this.buildCron(), at = once ? this.buildAt() : "";
    if (once && !at) return { error: TIME_RE.test(e.time.value().trim()) ? "Enter a date like 2026-11-20" : "Enter a time like 09:00" };
    if (!once && !cron) return { error: e.mode === "hourly" ? "Enter a minute from 0 to 59" : "Enter a time like 09:00" };
    const name = e.name.value().trim() || slug(e.prompt.value());
    if (!name) return { error: "Give it a name" };
    const timeout = parseInt(e.timeout.value().trim() || "60", 10);
    if (!Number.isFinite(timeout) || timeout <= 0) return { error: "Timeout must be a number of minutes" };
    const acc = e.account === "other"
      ? { agent: e.other.agent, template: e.other.template, model: e.other.agent ? e.model.value().trim() : "" }
      : { agent: "", template: e.account, model: "" };
    return {
      entry: {
        name, cron, at, repo: expand(e.repo.trim()), workspace: e.workspace,
        workspace_id: e.workspace === "existing" ? e.workspace_id : "", ...acc,
        prompt: e.prompt.value(), mcp_config: expand(e.mcp.value().trim()), timeout_minutes: timeout,
      },
    };
  }

  async put(entry, original, dryRun) {
    const args = ["put", ...(original ? ["--original", original] : []), ...(dryRun ? ["--dry-run"] : [])];
    // exec has no stdin: the JSON goes through the shell.
    const r = await exec("sh", ["-c", 'bin=$1 json=$2; shift 2; printf %s "$json" | "$bin" "$@"', "sh", this.bin, JSON.stringify(entry), ...args]);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().replace(/^error: /, ""));
    return JSON.parse(r.stdout);
  }

  preview(cx) {
    const e = this.ed, seq = ++e.seq, d = this.draft();
    if (d.error || !this.bin) { e.result = null; return; }
    cx.spawn(async (cx) => {
      let result;
      try { result = await this.put(d.entry, e.original, true); } catch (err) { result = { problem: String(err.message ?? err) }; }
      if (this.ed === e && seq === e.seq) { e.result = result; cx.notify(); }
    });
  }

  save(cx) {
    const e = this.ed, d = this.draft();
    if (d.error) { e.tried = true; cx.notify(); return; }
    cx.spawn(async (cx) => {
      try {
        const res = await this.put(d.entry, e.original, false);
        if (res.problem) e.result = res;
        else if (this.ed === e) { this.ed = null; this.view = "list"; }
      } catch (err) { e.result = { problem: String(err.message ?? err) }; }
      await this.refresh(cx);
    });
  }

  back(cx) { this.ed = null; this.view = "list"; cx.notify(); }

  dismiss() { if (props()?.overlay) closeOverlay(props().overlay); }

  key(e, cx) {
    if (e.key !== "escape") return;
    if (this.view === "editor") this.back(cx); else this.dismiss();
    cx.stop_propagation();
  }

  // ---- render ----

  render(cx) {
    const t = theme();
    const editing = Boolean(this.view === "editor" && this.ed);
    let body;
    if (this.missing) body = div().py(8).text_size(12.8).text_color(t.muted).child("herdr-automations is not installed. Run ~/.dotfiles/install.sh terminal.");
    else body = editing ? this.renderEditor(t) : this.renderList(t);
    return v_flex().id("agenda").size_full().min_h(0).rounded(12).overflow_hidden().bg(t.popover)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(editing ? this.editorHeader(t) : this.header(t))
      .when(Boolean(this.error), (el) => el.child(div().px(18).pb(6).text_size(12).text_color(t.ansi1).truncate().child(this.error)))
      .when(!editing && Boolean(this.list && !this.list.scheduler && this.started), (el) => el.child(
        h_flex().mx(18).mb(8).p(10).gap(8).items_center().rounded(10).bg(t.blocked + "14").border_1().border_color(t.blocked + "40")
          .child(div().flex_1().text_size(12.8).child("Scheduler isn't running."))
          .child(this.button("start", "Start", t, (cx) => this.act(cx, ["service", "install"])))))
      .child(div().id("agenda-body").flex_1().min_h(0).overflow_y_scrollbar().child(body))
      .when(editing, (el) => el.child(this.editorFooter(t)));
  }

  button(id, label, t, onClick, opts = {}) {
    return h_flex().id(id).h(opts.h ?? 26).px(10).gap(5).flex_none().items_center().rounded(7).text_size(12).font_medium()
      .border_1().border_color(opts.solid ? t.solid : t.input).bg(opts.solid ? t.solid : t.raised)
      .text_color(opts.solid ? t.solid_foreground : opts.color ?? t.foreground)
      .cursor_pointer().hover((s) => (opts.solid ? s.opacity(0.88) : s.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => onClick(cx))
      .when(Boolean(opts.icon), (el) => el.child(svg(I(opts.icon)).size(13)))
      .child(label);
  }

  esc(t, onClick) {
    return div().id("esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => onClick(cx)).child("Esc");
  }

  switch_(id, on, t, toggle) {
    return h_flex().id(id).w(30).h(17).flex_none().rounded(9).p(2).cursor_pointer().bg(on ? t.accent : t.input)
      .when(on, (el) => el.justify_end())
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => toggle(cx))
      .child(div().size(13).rounded(7).bg(t.background));
  }

  pills(id, options, value, t, pick) {
    return h_flex().flex_wrap().gap(5).children(options.map(([v, label]) =>
      h_flex().id(`${id}-${v}`).h(26).px(9).items_center().rounded(7).text_size(12).cursor_pointer()
        .bg(v === value ? t.selected : t.raised).text_color(v === value ? t.foreground : t.muted)
        .border_1().border_color(v === value ? t.accent : t.input).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => pick(v, cx)).child(label)));
  }

  label(s, t) { return div().pt(16).pb(6).text_size(11.5).font_medium().text_color(t.dim).child(s); }

  header(t) {
    const l = this.list;
    let sub = "", subColor = t.muted;
    if (l?.paused) { sub = "All automations paused"; subColor = t.blocked; }
    else if (l) {
      const soon = l.automations.filter((a) => !a.disabled && nextMs(a) < Infinity).sort((a, b) => nextMs(a) - nextMs(b))[0];
      sub = soon ? `Next: ${soon.name}, ${until(soon.next)}` : "Nothing scheduled";
    }
    return v_flex().flex_none().px(18).pt(18).pb(4).gap(6)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Automations"))
        .when(Boolean(l?.automations.length) || Boolean(l?.paused), (el) => el
          .child(this.button("pause-all", l.paused ? "Resume all" : "Pause all", t,
            (cx) => this.act(cx, [l.paused ? "resume" : "pause", "--all"]), { color: l.paused ? t.blocked : t.foreground })))
        .when(Boolean(l), (el) => el
          .child(this.button("new", "New", t, (cx) => this.edit(null, cx), { icon: "plus" })))
        .child(this.esc(t, () => this.dismiss())))
      .child(div().text_size(12.8).text_color(subColor).truncate().child(sub));
  }

  renderList(t) {
    if (!this.list) return div().px(18).py(8).text_size(12.5).text_color(t.dim).child(this.error ? "" : "Loading…");
    const l = this.list;
    const col = v_flex().px(8).pb(14);
    const label = (s) => div().px(10).child(this.label(s, t));
    if (this.fresh.length) col.child(label("Activity")).children(this.fresh.map((r) => this.activityRow(r, t)));
    if (!l.automations.length && !l.invalid.length) {
      return col.child(v_flex().pt(48).gap(12).items_center()
        .child(div().text_size(12.8).text_color(t.muted).child("No automations yet."))
        .child(this.button("empty-new", "New automation", t, (cx) => this.edit(null, cx), { solid: true, h: 32, icon: "plus" })));
    }
    const sorted = [...l.automations].sort((a, b) => (a.disabled - b.disabled) || (nextMs(a) - nextMs(b)));
    col.child(label("Scheduled")).children(sorted.map((a) => this.row(a, t)));
    for (const d of l.invalid) col.child(v_flex().mx(2).mt(6).p(10).gap(2).rounded(10).bg(t.ansi1 + "14").border_1().border_color(t.ansi1 + "40")
      .child(div().text_size(12.8).font_semibold().child(d.name || `line ${d.line}`))
      .child(div().text_size(12).text_color(t.muted).child(d.message)));
    return col;
  }

  activityRow(r, t) {
    const [icon, color, verb] = r.status === "done" ? ["circle-check", t.ansi2, "finished"]
      : r.status === "failed" ? ["x", t.ansi1, "failed"]
      : r.status === "missed" ? ["x", t.ansi1, "missed a run"] : ["minus", t.dim, "was cancelled"];
    const open = r.terminal && this.live(r.terminal);
    const detail = r.error || (r.seconds ? duration(r.seconds) : "");
    return h_flex().id(`act-${r.run_id}`).h(40).px(10).gap(10).items_center().rounded(8)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.openRun(r, cx))
      .child(svg(I(icon)).size(15).flex_none().text_color(color))
      .child(div().flex_none().text_size(13).child(`${r.automation} ${verb}`))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child([ago(r.at), detail].filter(Boolean).join(" · ")))
      .when(Boolean(open), (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(12).text_color(t.muted)
        .child(svg(I("terminal")).size(13)).child("Open")));
  }

  row(a, t) {
    const [time, when] = describe(a);
    const running = this.runs.find((x) => x.automation === a.name && x.status === "running");
    let sub = `${base(a.repo)} · ${accountLabel(a)}`, subColor = t.dim;
    if (running && this.live(running.terminal)?.status === "blocked") { sub = "needs you"; subColor = t.blocked; }
    else if (running) { sub = `running · ${ago(running.started)}`; subColor = t.working; }
    const failed = !running && (a.last?.status === "failed" || a.last?.status === "missed");
    return h_flex().id(`row-${a.name}`).h(48).px(10).gap(12).items_center().rounded(8)
      .when(a.disabled || this.list.paused, (el) => el.opacity(0.45))
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.edit(a.name, cx))
      .child(v_flex().w(88).flex_none()
        .child(div().text_size(13).font_medium().child(time))
        .child(div().text_size(11.5).text_color(t.dim).truncate().child(when)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(13).truncate().child(a.name))
        .child(h_flex().min_w(0).text_size(12)
          .child(div().text_color(subColor).truncate().child(sub))
          .when(failed, (el) => el.child(div().flex_none().text_color(t.ansi1).child(" · last run failed")))))
      .child(div().id(`run-${a.name}`).px(6).py(2).flex_none().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.raised).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => this.act(cx, ["run", a.name, "--bg"])).child("Run"))
      .child(this.switch_(`sw-${a.name}`, !a.disabled, t, (cx) => this.act(cx, [a.disabled ? "resume" : "pause", a.name])));
  }

  editorHeader(t) {
    const e = this.ed;
    return h_flex().flex_none().px(18).pt(18).pb(4).gap(8).items_center()
      .child(div().id("ed-back").size(22).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim)
        .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => this.back(cx))
        .child(svg(I("chevron-left")).size(15)))
      .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().child(e.original ?? "New automation"))
      .child(this.esc(t, (cx) => this.back(cx)));
  }

  editorFooter(t) {
    const e = this.ed, name = e.original;
    return h_flex().flex_none().px(18).py(12).gap(8).items_center().border_t_1().border_color(t.border)
      .when(Boolean(name), (el) => el
        .child(this.button("ed-rm", e.deleting ? "Confirm delete" : "Delete", t, (cx) => {
          if (!e.deleting) { e.deleting = true; cx.notify(); return; }
          this.act(cx, ["rm", name], () => { if (this.ed === e) { this.ed = null; this.view = "list"; } });
        }, { h: 32, color: t.ansi1 }))
        .child(this.button("ed-run", "Run now", t, (cx) => this.act(cx, ["run", name, "--bg"]), { h: 32 })))
      .child(div().flex_1())
      .child(this.button("ed-cancel", "Cancel", t, (cx) => this.back(cx), { h: 32 }))
      .child(this.button("ed-save", "Save", t, (cx) => this.save(cx), { h: 32, solid: true }));
  }

  input(id, state, t, opts = {}) {
    return div().id(id).h(34).px(10).flex().items_center().rounded(8).border_1().border_color(t.input).bg(t.background)
      .when(Boolean(opts.w), (el) => el.w(opts.w).flex_none())
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(state).h_full().w_full().text_size(13));
  }

  renderEditor(t) {
    const e = this.ed;
    const d = this.draft();
    const problem = d.error || e.result?.problem;
    const field = (labelText, control) => h_flex().min_h(34).gap(12).items_center()
      .child(div().w(84).flex_none().text_size(12.5).text_color(t.muted).child(labelText))
      .child(div().flex_1().min_w(0).child(control));

    const col = v_flex().px(18).pb(16);

    col.child(this.label("What to do", t))
      .child(div().id("ed-prompt").px(10).py(8).rounded(8).border_1().border_color(t.input).bg(t.background)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Textarea.new(e.prompt).w_full().text_size(13)));

    col.child(this.label("When", t)).child(this.pills("mode", MODES, e.mode, t, (v, cx) => this.setMode(v, cx)));
    const when = h_flex().pt(8).gap(10).items_center().flex_wrap();
    if (e.mode === "hourly") when.child(div().text_size(12.5).text_color(t.muted).child("At minute")).child(this.input("ed-min", e.minute, t, { w: 56 }));
    else if (e.mode === "advanced") when.child(div().flex_1().child(this.input("ed-raw", e.raw, t)));
    else if (e.mode === "once") {
      when.child(this.pills("once", ONCE_DAYS, e.onceDay, t, (v, cx) => { e.onceDay = v; this.preview(cx); cx.notify(); }));
      if (e.onceDay === "date") when.child(this.input("ed-date", e.date, t, { w: 110 }));
      when.child(div().text_size(12.5).text_color(t.muted).child("at")).child(this.input("ed-time", e.time, t, { w: 80 }));
    }
    else when.child(div().text_size(12.5).text_color(t.muted).child("At")).child(this.input("ed-time", e.time, t, { w: 80 }));
    if (e.mode === "weekly") when.child(h_flex().gap(4).children(DAY_NAMES.map((dayName, i) => {
      const on = e.days.includes(i);
      return h_flex().id(`day-${i}`).h(26).px(8).items_center().rounded(7).text_size(12).cursor_pointer()
        .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted)
        .border_1().border_color(on ? t.accent : t.input).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          if (on && e.days.length === 1) return;
          e.days = on ? e.days.filter((x) => x !== i) : [...e.days, i].sort();
          this.preview(cx); cx.notify();
        }).child(dayName);
    })));
    col.child(when);

    col.child(this.label("Where", t));
    const where = v_flex().gap(8)
      .child(field("Name", this.input("ed-name", e.name, t)))
      .child(field("Repository", h_flex().id("ed-repo").h(34).px(10).gap(8).items_center().rounded(8)
        .border_1().border_color(e.repoOpen ? t.accent : t.input).bg(t.background).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { e.repoOpen = !e.repoOpen; cx.notify(); })
        .child(svg(I("folder")).size(14).flex_none().text_color(t.muted))
        .child(div().flex_none().text_size(13).child(base(e.repo) || "Choose a repository"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(tilde(e.repo)))
        .child(svg(I(e.repoOpen ? "chevron-down" : "chevron-right")).size(14).flex_none().text_color(t.dim))));
    if (e.repoOpen) where.child(h_flex().child(div().w(96).flex_none()).child(div().flex_1().min_w(0).child(this.repoList(t))));
    const accounts = e.account === "other"
      ? [...ACCOUNTS, ["other", `Other (${e.other.template || e.other.agent})`]] : ACCOUNTS;
    where.child(field("Account", this.pills("acc", accounts, e.account, t, (v, cx) => {
      if (v === e.account) return;
      e.account = v; this.preview(cx); cx.notify();
    })));
    where.child(field("Runs in", this.pills("ws", WORKSPACES, e.workspace, t, (v, cx) => {
      e.workspace = v; this.preview(cx); cx.notify();
    })));
    if (e.workspace === "existing") where.child(field("Space", this.pills("space",
      spaces().filter((s) => !s.machine).map((s) => [s.id, s.name]), e.workspace_id, t,
      (v, cx) => { e.workspace_id = v; this.preview(cx); cx.notify(); })));
    col.child(where);

    col.child(h_flex().id("ed-more").pt(16).pb(6).gap(4).items_center().cursor_pointer().text_size(11.5).font_medium().text_color(t.dim)
      .hover((s) => s.text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { e.more = !e.more; cx.notify(); })
      .child("Advanced options").child(svg(I(e.more ? "chevron-down" : "chevron-right")).size(12)));
    if (e.more) {
      const adv = v_flex().gap(8)
        .child(field("Timeout (min)", this.input("ed-timeout", e.timeout, t, { w: 80 })))
        .child(field("MCP config", this.input("ed-mcp", e.mcp, t)));
      if (e.account === "other" && e.other.agent) adv.child(field("Model", this.input("ed-model", e.model, t)));
      col.child(adv);
    }

    col.child(div().pt(14).text_size(12)
      .when(Boolean(problem), (el) => el.text_color(d.error && !e.tried ? t.muted : t.ansi1).child(problem))
      .when(!problem && Boolean(e.result?.next), (el) => el.text_color(t.muted)
        .child(e.mode === "once"
          ? `Runs once, ${until(e.result.next[0])}. Removed after it runs or is missed.`
          : `Next: ${(e.result?.next ?? []).map((n) => until(n)).join(" · ")}`)));

    if (e.original) {
      const runs = this.runs.filter((r) => r.automation === e.original && r.status !== "scheduled").slice(0, 10);
      if (runs.length) col.child(this.label("Runs", t)).children(runs.map((r) => {
        const color = r.status === "done" ? t.ansi2 : r.status === "failed" || r.status === "missed" ? t.ansi1
          : r.status === "running" ? t.working : t.muted;
        return h_flex().id(`h-${r.run_id}`).h(30).px(8).gap(10).items_center().rounded(6).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.openRun(r, cx))
          .child(div().w(72).flex_none().text_size(12).text_color(color).child(r.status))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(r.error || (r.seconds ? duration(r.seconds) : "")))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(ago(r.at)));
      }));
    }
    return col;
  }

  repoList(t) {
    const e = this.ed;
    const seen = new Set();
    const dirs = [...spaces().filter((s) => !s.machine && s.folder).map((s) => s.folder), ...e.repos]
      .map((p) => p.replace(/\/+$/, "")).filter((p) => p && !seen.has(p) && seen.add(p))
      .sort((a, b) => base(a).localeCompare(base(b)));
    const item = (id, icon, main, sub, onClick) => h_flex().id(id).h(32).px(10).gap(8).items_center().rounded(6)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => onClick(cx))
      .child(svg(I(icon)).size(14).flex_none().text_color(t.muted))
      .child(div().flex_none().text_size(13).child(main))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(sub));
    return v_flex().id("ed-repos").max_h(240).p(4).rounded(8).border_1().border_color(t.border).bg(t.background).overflow_y_scrollbar()
      .children(dirs.map((p) => item(`repo-${p}`, "folder", base(p), tilde(p), (cx) => {
        e.repo = p; e.repoOpen = false; this.preview(cx); cx.notify();
      })))
      .child(item("repo-choose", "folder-plus", "Choose…", "", (cx) => cx.spawn(async (cx) => {
        const dir = await pickFolder({ prompt: "Repository for this automation" });
        if (dir) { e.repo = dir; e.repoOpen = false; this.preview(cx); }
        cx.notify();
      })));
  }
}
