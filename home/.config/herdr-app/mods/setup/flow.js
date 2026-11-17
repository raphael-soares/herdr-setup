import { div } from "gpui-kit";
import { spaces, focused, panes, terminals, run, shared, setShared, nextCommand, notify, openOverlay, checking } from "herdr";
import { openPart, toggle, forgetAll } from "./overlays.js";

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
        else if (c === "ssh") openPart("sessionizer", { ssh: true });
        else if (c === "automations" || c === "sessionizer") toggle(c);
        else if (c.startsWith("worktree-")) this.worktree(c.slice("worktree-".length));
        else if (c === "sidebar") this.sidebar();
        else if (c.startsWith("close-")) this.closeFocused(c.slice("close-".length));
      }
    });
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

  // Only closing a tab asks for confirmation, including via the x on its last pane.
  // Pane and space close right away, and the last tab takes the space with it, unasked.
  closeFocused(what) {
    const f = focused();
    const space = spaces().find((s) => s.active);
    if (!f || !space) return;
    const closeSpace = () => run("space.close", { id: space.id, confirmed: true });
    const lastTab = space.tabs.length === 1;
    if (what === "space") return closeSpace();
    if (what === "pane") {
      if (!f.pane) return;
      if (panes().filter((p) => p.tab === f.tab).length > 1) return run("pane.close", { pane: f.pane });
    }
    const tab = space.tabs.find((t) => t.id === f.tab);
    if (!tab) return;
    if (lastTab) return closeSpace();
    openPart("confirm", { title: `Close tab ${tab.name}?`, detail: "Its terminals will end.", command: { name: "tab.close", args: { id: tab.id, confirmed: true } } });
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
