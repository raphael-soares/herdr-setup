import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, exec, home, watchFolder, checking, run } from "herdr";
import { Icon, TEXT, FONT } from "./sidebar/views/ui.js";
import { toggle } from "./overlays.js";

const FINISHED = ["done", "failed", "cancelled", "missed"];

export class Title {
  init(_props, cx) {
    this.pending = [];
    this.alert = false;
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (const bin of ["herdr-automations", `${home()}/.local/bin/herdr-automations`]) {
        try { if ((await exec(bin, ["version"])).code === 0) { this.bin = bin; break; } } catch {}
      }
      if (!this.bin) return;
      let state = null;
      try { state = JSON.parse((await exec(this.bin, ["ls", "--json"])).stdout).state; } catch {}
      await this.refresh(cx);
      if (state) for (;;) { try { await watchFolder(state); } catch { return; } await this.refresh(cx); }
    });
    cx.timer.every(60000, (cx) => this.refresh(cx));
  }

  async refresh(cx) {
    if (!this.bin) return;
    try {
      const r = await exec(this.bin, ["history", "--json"]);
      if (r.code !== 0) return;
      this.pending = JSON.parse(r.stdout).filter((x) => FINISHED.includes(x.status) && !x.seen);
      this.alert = this.pending.some((x) => x.status === "failed" || x.status === "missed");
    } catch { return; }
    cx.notify();
  }

  // AdwHeaderBar: the title centered and bold, flat buttons at each end.
  render() {
    const t = theme();
    const name = spaces().find((s) => s.active)?.name ?? "";
    // The block drags the window: without the stop on mouse_down a click becomes a drag.
    const button = (id, onClick) =>
      div().id(id).relative().size(30).flex_none().flex().items_center().justify_center().rounded(8)
        .text_color(t.foreground).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(onClick);
    const sidebar = button("sidebar", () => run("setup.sidebar")).child(Icon("sidebar-show", 16).text_color(t.foreground));
    const automations = button("automations", () => toggle("automations"))
      .child(svg("mods/setup/icons/automations.svg").size(16))
      .when(this.pending.length > 0, (el) => el.child(
        div().absolute().top(5).right(5).size(7).rounded(4).bg(this.alert ? t.ansi1 : t.accent)));
    return h_flex().size_full().px(8).pb(6).items_center().font_family(FONT).text_size(TEXT.body)
      .child(h_flex().flex_1().child(sidebar))
      .child(div().min_w(0).max_w(160).font_bold().truncate().text_color(t.foreground).child(name))
      .child(h_flex().flex_1().justify_end().child(automations));
  }
}
