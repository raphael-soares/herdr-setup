// Spaces and agents in one block. Combined (the default): tabs for Spaces, with
// each space's tabs and agents under it, and Agents. With `combined: false` in the settings: the
// two lists one above the other, as two blocks of this mod would draw them.
import { v_flex, h_flex } from "gpui-base";
import { agents, focused, panes, setAgentOrder, nextCommand, run, props, setShared } from "herdr";
import { theme } from "./tone.js";
import { Spaces } from "./spaces.js";
import { Agents } from "./agents.js";
import { TEXT, Badge, FONT } from "./ui.js";
import { openMenu, openPart } from "../../overlays.js";
import { startResize } from "../../resize.js";

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
        // Volta de um menu aberto com `a`: o cursor fica onde estava.
        this.cursor = this.resume ?? null;
        this.keep = this.resume != null;
        this.resume = null;
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
    const x = this.nav[i];
    const k = e.key;
    if (k === "escape") run("pane.go", { direction: "right" });
    else if (m.shift && (k === "h" || k === "l")) {
      this.resume = this.cursor;
      startResize({ block: "sidebar" }, k === "h" ? "left" : "right");
    }
    else if (!n) return;
    else if (k === "j" || k === "down") i = (i + 1) % n;
    else if (k === "k" || k === "up") i = (i + n - 1) % n;
    else if (k === "g" && m.shift) i = n - 1;
    else if (k === "g") i = 0;
    else if (k === "l" || k === "right" || k === "enter") this.open(x);
    else if (k === "a") this.menu(x);
    else if (this.act(x, e.key_char ?? k)) return cx.stop_propagation();
    else return;
    if (n) this.cursor = this.nav[i].key;
    cx.stop_propagation();
    cx.notify();
  }

  // Ações diretas, as mesmas letras que o menu mostra (menu.js, LETTER).
  // Fechar pede confirmação: um x solto mataria o processo do pane.
  act(x, k) {
    const pane = (x.a ?? x.p)?.pane;
    const space = x.w?.id ?? x.a?.space;
    const [kind, args, name] = pane
      ? ["pane", { pane }, x.a?.title ?? x.p?.title ?? "pane"]
      : ["tab", { id: x.tab.id }, x.tab.name ?? "tab"];
    if (k === ",") run(`${kind}.rename`, args);
    else if (k === "c") run("tab.new", { space });
    else if (k === "%" && pane) run("pane.split", { direction: "right", pane });
    else if (k === '"' && pane) run("pane.split", { direction: "down", pane });
    else if (k === "z" && pane) run("pane.zoom", { pane });
    else if (k === "x") {
      this.resume = this.cursor;
      openPart("confirm", { title: `Fechar ${kind}?`, detail: name, command: { name: `${kind}.close`, args } });
    } else return false;
    return true;
  }

  // Pelo teclado o ponteiro está longe (no terminal): o menu abre sob a linha.
  menu(x, at = this.anchor(x.key)) {
    this.resume = this.cursor;
    if (x.a) openMenu("pane", { pane: x.a.pane, terminal: x.a.address }, at);
    else if (x.p) openMenu("pane", { pane: x.p.pane, terminal: x.p.terminal }, at);
    else openMenu("tab", { id: x.tab.id, space: x.w.id }, at);
  }

  anchor(key) {
    const b = this.boxes?.[key];
    setShared("setup.debug", { key, b: b ?? null, n: Object.keys(this.boxes ?? {}).length });
    return b ? { x: b.x + 24, y: b.y + b.height } : undefined;
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
    const kb = this.handle.is_focused();
    // flow's resize chord reads this to move the sidebar's edge instead of a pane's.
    if (kb !== this.kbShared) {
      this.kbShared = kb;
      setShared("sidebar.focused", kb);
    }
    const root = v_flex()
      .id("better-sidebar-lists")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .font_family(FONT)
      .text_size(TEXT.body)
      .on_size_change((size, cx) => this.spaces.resized(size, cx))
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx));
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
    // Every tab shows: a tab with agents as its agents, any other as itself.
    const shownTab = focused()?.tab;
    const plain = (tab) => !all.some((a) => a.tab === tab.id);
    this.nav = [];
    // Borda transparente em toda linha navegável: o contorno do cursor não empurra o texto.
    this.boxes ??= {};
    const mark = (el, key, x) => {
      const on = kb && key === this.cursor;
      // my(1): dois destaques vizinhos (cursor e item com foco) não se encostam.
      return el
        .my(1)
        .border_1()
        .border_color(on ? t.accent + "48" : "#00000000")
        .when(on, (r) => r.bg(t.accent + "14"))
        // Sem evento de layout: a caixa da linha vem do último movimento do ponteiro na janela.
        .on_window_mouse_move((e) => {
          this.boxes[key] = e.bounds;
        })
        .when(Boolean(x), (r) => r.on_mouse_down("right", () => this.menu(x, "pointer")));
    };
    this.spaces.under = ({ w }) => {
      // Local: tab dividida mostra a si mesma e, um nível abaixo, cada pane (agente ou não).
      const todos = panes();
      const items = w.tabs.flatMap((tab) => {
        const ps = todos.filter((p) => p.tab === tab.id);
        if (ps.length > 1) return [{ tab, ps }];
        return plain(tab)
          ? tab.settled ? [] : [{ tab }]
          : all.filter((a) => a.tab === tab.id && !pins.includes(a.address)).map((a) => ({ a }));
      });
      return items.flatMap((x, i) => {
        if (x.ps) {
          const tabKey = `tab:${x.tab.id}`;
          const tabEntry = { key: tabKey, w, tab: x.tab };
          this.nav.push(tabEntry);
          const filhos = x.ps.flatMap((p, j) => {
            const a = all.find((ag) => ag.pane === p.pane && !pins.includes(ag.address));
            const key = a ? `agent:${a.address}` : `pane:${p.pane}`;
            const entry = a ? { key, a } : { key, w, tab: x.tab, p };
            this.nav.push(entry);
            if (a) order.push(a.address);
            const [row, ...subs] = a
              ? this.agents.agentWithSubs(a, j, nested, t)
              : [this.agents.paneRow(w, p, p.focused && x.tab.id === shownTab, t)];
            return [mark(row, key, entry), ...subs];
          });
          return [mark(this.agents.tabRow(w, x.tab, false, t), tabKey, tabEntry), ...filhos];
        }
        const key = x.a ? `agent:${x.a.address}` : `tab:${x.tab.id}`;
        const entry = x.a ? { key, a: x.a } : { key, w, tab: x.tab };
        this.nav.push(entry);
        if (x.a) order.push(x.a.address);
        const [row, ...subs] = x.a
          ? this.agents.agentWithSubs(x.a, i, nested, t)
          : [this.agents.tabRow(w, x.tab, x.tab.id === shownTab, t)];
        return [mark(row, key, entry), ...subs];
      });
    };
    // One row lit: a space whose focused agent or tab shows beneath it leaves it to that row.
    this.spaces.quiet = (w) =>
      all.some((a) => a.space === w.id && a.focused) || w.tabs.some((tab) => tab.id === shownTab && plain(tab));
    const body = this.spaces.body(t, false);
    // Toda entrada no teclado começa na tab aberta agora; a volta de um menu mantém o cursor.
    if (kb && ((!this.kbAntes && !this.keep) || !this.nav.some((x) => x.key === this.cursor))) {
      const aqui =
        this.nav.find((x) => x.a?.focused || (x.p?.focused && x.tab.id === shownTab)) ??
        this.nav.find((x) => (x.a ? x.a.tab : x.tab.id) === shownTab);
      this.cursor = (aqui ?? this.nav[0])?.key ?? null;
    }
    if (kb) this.keep = false;
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
