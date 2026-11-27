import { div } from "gpui-kit";
import { spaces, focused, panes, terminals, run, shared, setShared, nextCommand, notify, openOverlay, checking, layout } from "herdr";
import { openPart, toggle, forgetAll } from "./overlays.js";
import { startResize } from "./resize.js";
import { findNode } from "./sidebar/views/find-node.js";

// Always-on floating block: remembers the previous space, shows the tab bar
// only in the layout without sidebar when there is more than one tab, and opens menus from the keyboard.
export class Flow {
  init(_props, cx) {
    this.tabsShown = null;
    if (!checking()) forgetAll();
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "back") this.back();
        else if (c === "new") openOverlay({ mod: "new-menu", kind: "dialog", width: 250 });
        else if (c === "ssh") openOverlay({ mod: "sessionizer", kind: "popup", at: "top", offset: 40, width: 640, height: 0.8, props: { source: "ssh" } });
        else if (c === "automations") toggle(c);
        else if (c.startsWith("worktree-")) this.worktree(c.slice("worktree-".length));
        else if (c === "sidebar") this.sidebar();
        else if (c.startsWith("close-")) this.closeFocused(c.slice("close-".length));
        else if (c.startsWith("resize-")) this.resize(c.slice("resize-".length));
      }
    });
  }

  // Sideways, the sidebar's edge moves when the sidebar has focus or the tab has a single
  // pane (its only shared edge is the sidebar's); with more panes the focused one moves.
  resize(direction) {
    const f = focused();
    const sidebar = findNode(layout(), "sidebar");
    const sideways = direction === "left" || direction === "right";
    const lone = f != null && panes().filter((p) => p.tab === f.tab).length === 1;
    if (sideways && sidebar && !sidebar.hidden && (shared("sidebar.focused") || lone))
      return startResize({ block: "sidebar" }, direction);
    if (f?.pane) startResize({ pane: f.pane }, direction);
  }

  back() {
    this.track();
    const target = shared("flow.previous");
    if (!target || target === shared("flow.current") || !spaces().some((s) => s.id === target)) {
      notify({ title: "No previous space", level: "info", timeout: 2000 });
      return;
    }
    setShared("flow.previous", shared("flow.current"));
    setShared("flow.current", target);
    run("space.select", { id: target });
  }

  track() {
    const active = spaces().find((s) => s.active);
    const current = active?.id ?? null;
    const seen = shared("flow.current") ?? null;
    if (current && current !== seen) {
      if (seen) setShared("flow.previous", seen);
      setShared("flow.current", current);
    }
    const name = shared("layout");
    if (name !== this.layoutSeen) {
      this.layoutSeen = name;
      this.tabsShown = null;
    }
    const show = name !== "full" && (active?.tabs.length ?? 0) > 1;
    if (show !== this.tabsShown) {
      this.tabsShown = show;
      run(show ? "layout.show" : "layout.hide", { id: "tabs" });
    }
  }

  // The pane never changes look by state; no sidebar is a separate layout, without a frame.
  sidebar() {
    run("layout.switch", { name: shared("layout") === "compact" ? "full" : "compact" });
  }

  // The x on a tab's last pane closes the tab after asking, and the last tab takes its space with it.
  // A pane with siblings closes right away.
  closeFocused(what) {
    const f = focused();
    const space = spaces().find((s) => s.active);
    if (!f || !space) return;
    if (what === "pane") {
      if (!f.pane) return;
      if (panes().filter((p) => p.tab === f.tab).length > 1) return run("pane.close", { pane: f.pane });
    }
    const tab = space.tabs.find((t) => t.id === f.tab);
    if (!tab) return;
    const lastTab = space.tabs.length === 1;
    openPart("confirm", {
      title: `Close tab ${tab.name}?`,
      detail: lastTab ? `Space ${space.name} closes with it.` : "Its terminals will end.",
      command: { name: "tab.close", args: { id: tab.id, confirmed: true } },
    });
  }

  worktree(action) {
    const space = spaces().find((s) => s.active);
    if (!space) return;
    const size = action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 };
    openOverlay({ mod: "worktree", kind: "dialog", ...size, props: { space: space.id, action } });
  }

  // Changing shared state or the layout during render gets lost; defer it.
  // Reading focus and layout here makes render run again when they change.
  render(cx) {
    focused();
    terminals();
    shared("layout");
    if (!checking()) cx.timer.after(0, () => this.track());
    return div();
  }
}
