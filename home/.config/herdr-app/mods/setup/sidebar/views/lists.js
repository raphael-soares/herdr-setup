// Spaces and agents in one block. Combined (the default): tabs for Spaces, with
// each space's tabs and agents under it, and Agents. With `combined: false` in the settings: the
// two lists one above the other, as two blocks of this mod would draw them.
import { v_flex, h_flex } from "gpui-base";
import { agents, focused, panes, theme, setAgentOrder, nextCommand, run, props } from "herdr";
import { Spaces } from "./spaces.js";
import { Agents } from "./agents.js";
import { TEXT, Badge, Rail } from "./ui.js";

const TABS = ["spaces", "agents"];

export class Lists {
  init(props, cx) {
    this.spaces = new Spaces();
    this.spaces.init(props, cx);
    this.agents = new Agents();
    this.agents.init(props, cx);
    const saved = localStorage.getItem("lists.tab");
    this.tab = TABS.includes(saved) ? saved : "spaces";
    // Teclado (local, não vem do autor): pane.go entra aqui por "focusable" no mod.json.
    this.handle = cx.focus_handle();
    this.nav = [];
    this.cursor = null;
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) !== "focus") continue;
        if (this.tab !== "spaces") this.pick("spaces", cx);
        this.cursor = null;
        this.handle.focus();
        cx.notify();
      }
    });
  }

  key(e, cx) {
    const m = e.modifiers;
    if (m.control || m.alt || m.platform) return;
    const n = this.nav.length;
    let i = Math.max(0, this.nav.findIndex((x) => x.key === this.cursor));
    const k = e.key;
    if (k === "escape" || k === "l" || k === "right") run("pane.go", { direction: "right" });
    else if (!n) return;
    else if (k === "j" || k === "down") i = (i + 1) % n;
    else if (k === "k" || k === "up") i = (i + n - 1) % n;
    else if (k === "g" && m.shift) i = n - 1;
    else if (k === "g") i = 0;
    else if (k === "enter") this.open(this.nav[i]);
    else return;
    if (n) this.cursor = this.nav[i].key;
    cx.stop_propagation();
    cx.notify();
  }

  open(x) {
    if (x.a) return run("pane.focus", { pane: x.a.pane });
    if (x.p) {
      run("space.select", { id: x.w.id });
      return run("pane.focus", { pane: x.p.pane });
    }
    run("space.select", { id: x.w.id });
    if (x.tab) run("tab.select", { id: x.tab.id });
    run("pane.go", { direction: "right" });
  }

  pick(tab, cx) {
    this.tab = tab;
    localStorage.setItem("lists.tab", tab);
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const collapsed = this.spaces.collapsed();
    const root = v_flex()
      .id("better-sidebar-lists")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_size(TEXT.body)
      .on_size_change((size, cx) => this.spaces.resized(size, cx))
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx));
    const kb = this.handle.is_focused();
    // Sem evento de blur no GPUI: enquanto tem o teclado, confere de novo para apagar o cursor ao sair.
    if (kb) cx?.timer.after(300, (cx) => cx.notify());
    this.spaces.under = null;
    this.spaces.quiet = null;
    this.spaces.above = null;
    // The rail has no room for tabs: both lists, as numbers.
    if (!this.spaces.settings.combined || collapsed)
      return root
        .child(
          v_flex()
            .flex_1()
            .min_h(0)
            .child(this.spaces.header(t, collapsed))
            .child(this.spaces.body(t, collapsed)),
        )
        .child(v_flex().flex_1().min_h(0).child(this.agents.render()));

    const view = this.agents.readView();
    // Local: "tabs": false nas props mostra só Spaces, sem a barra de abas.
    const abas = props()?.tabs !== false;
    if (abas) root.child(this.tabBar(t, view));
    if (abas && this.tab !== "spaces") return root.child(this.agents.render({ view, heading: false }));

    // Spaces, each with its tabs and agents beneath in tab order, so rows don't move as
    // their state changes; next-agent keys follow that order.
    const nested = { ...view, sort: { id: "grouped" }, byPriority: false, nested: true };
    const order = [];
    const all = agents();
    // Pinned agents go above every space, in the Agents tab's Pinned group.
    const pinned = view.groups.find((g) => g.id === "pinned");
    const pins = pinned?.members.map((a) => a.address) ?? [];
    order.push(...pins);
    this.spaces.above = () => (pinned ? this.agents.groupRows(pinned, 0, view, t) : []);
    const nest = (lines, row) => h_flex().items_stretch().children(lines.map((l) => Rail(l))).child(row.flex_1().min_w(0));
    // A space's agents hang from its line; a main space's worktrees come after them,
    // so its line carries on, and a worktree's own agents sit one step further in.
    // Every tab shows: a tab with agents as its agents, any other as itself.
    const shownTab = focused()?.tab;
    const plain = (tab) => !all.some((a) => a.tab === tab.id);
    this.nav = [];
    const mark = (el, key) => el.when(kb && key === this.cursor, (r) => r.bg(t.hover));
    this.spaces.under = ({ w, tree, kids }) => {
      // Local: tab dividida mostra a si mesma e, um nível abaixo, cada pane (agente ou não).
      const todos = panes();
      const items = w.tabs.flatMap((tab) => {
        const ps = todos.filter((p) => p.tab === tab.id);
        if (ps.length > 1) return [{ tab, ps }];
        return plain(tab)
          ? tab.settled ? [] : [{ tab }]
          : all.filter((a) => a.tab === tab.id && !pins.includes(a.address)).map((a) => ({ a }));
      });
      const before = tree ? [tree.startsWith("└") ? "" : "│"] : [];
      return items.flatMap((x, i) => {
        const last = i === items.length - 1 && !kids;
        const ramo = [...before, last ? "" : "│"];
        if (x.ps) {
          const tabKey = `tab:${x.tab.id}`;
          this.nav.push({ key: tabKey, w, tab: x.tab });
          const filhos = x.ps.flatMap((p, j) => {
            const fim = j === x.ps.length - 1;
            const a = all.find((ag) => ag.pane === p.pane && !pins.includes(ag.address));
            const key = a ? `agent:${a.address}` : `pane:${p.pane}`;
            this.nav.push(a ? { key, a } : { key, w, tab: x.tab, p });
            if (a) order.push(a.address);
            const [row, ...subs] = a
              ? this.agents.agentWithSubs(a, j, nested, t)
              : [this.agents.paneRow(w, p, p.focused && x.tab.id === shownTab, t)];
            return [nest([...ramo, fim ? "└" : "├"], mark(row, key)), ...subs.map((s) => nest([...ramo, fim ? "" : "│"], s))];
          });
          return [nest([...before, last ? "└" : "├"], mark(this.agents.tabRow(w, x.tab, false, t), tabKey)), ...filhos];
        }
        const key = x.a ? `agent:${x.a.address}` : `tab:${x.tab.id}`;
        this.nav.push(x.a ? { key, a: x.a } : { key, w, tab: x.tab });
        if (x.a) order.push(x.a.address);
        const [row, ...subs] = x.a
          ? this.agents.agentWithSubs(x.a, i, nested, t)
          : [this.agents.tabRow(w, x.tab, x.tab.id === shownTab, t)];
        return [nest([...before, last ? "└" : "├"], mark(row, key)), ...subs.map((s) => nest(ramo, s))];
      });
    };
    // One row lit: a space whose focused agent or tab shows beneath it leaves it to that row.
    this.spaces.quiet = (w) =>
      all.some((a) => a.space === w.id && a.focused) || w.tabs.some((tab) => tab.id === shownTab && plain(tab));
    const body = this.spaces.body(t, false);
    // Toda entrada no teclado começa na tab aberta agora.
    if (kb && (!this.kbAntes || !this.nav.some((x) => x.key === this.cursor))) {
      const aqui =
        this.nav.find((x) => x.a?.focused || (x.p?.focused && x.tab.id === shownTab)) ??
        this.nav.find((x) => (x.a ? x.a.tab : x.tab.id) === shownTab);
      this.cursor = (aqui ?? this.nav[0])?.key ?? null;
    }
    this.kbAntes = kb;
    setAgentOrder(order);
    return root.child(body);
  }

  // Tabs side by side from the left, the picked one filled.
  tabBar(t, view) {
    const tab = (id, label, count) =>
      h_flex()
        .id(`lists-tab-${id}`)
        .px(10)
        .h(24)
        .gap(5)
        .justify_center()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .text_size(TEXT.label)
        .font_medium()
        .text_color(this.tab === id ? t.foreground : t.dim)
        .when(this.tab === id, (el) => el.bg(t.selected))
        .when(this.tab !== id, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => this.pick(id, cx))
        .child(label)
        // The count badge the group headers use.
        .when(count !== null, (el) => el.child(Badge(count)));
    return h_flex()
      .px(8)
      .pt(6)
      .pb(6)
      .mb(4)
      .border_b(1)
      .border_color(t.border)
      .flex_none()
      .gap(6)
      .items_center()
      .child(
        h_flex()
          .flex_1()
          .gap(2)
          .child(tab("spaces", "Spaces", null))
          .child(tab("agents", "Agents", view.count)),
      )
      .child(this.tab === "spaces" ? this.spaces.newSpaceButton() : this.agents.sortMenu());
  }
}
