import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, exec, home, watchFolder, checking } from "herdr";
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

  render() {
    const t = theme();
    const name = spaces().find((s) => s.active)?.name ?? "";
    // The block drags the window: without the stop on mouse_down a click becomes a drag.
    const automations = div().id("automations").relative().size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => toggle("automations"))
      .child(svg("mods/setup/icons/robo.svg").size(16))
      .when(this.pending.length > 0, (el) => el.child(
        div().absolute().top(4).right(4).size(7).rounded(4).bg(this.alert ? t.ansi1 : t.accent)));
    return h_flex().size_full().bg(t.chrome).pl(14).pr(10).gap(6).items_center().text_size(13.5)
      .child(div().flex_1().min_w(0).font_semibold().truncate().text_color(t.foreground).child(name))
      .child(automations);
  }
}
