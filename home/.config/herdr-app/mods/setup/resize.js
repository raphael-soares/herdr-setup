// Modo de redimensionar, como o `bind -r` do tmux: h/j/k/l (ou H/J/K/L) seguem
// movendo a borda enquanto cada toque chega antes de REPEAT ms.
// Props { pane } ou { block: "sidebar" }. Outra tecla, Esc ou o prazo fecham.

import { div } from "gpui-kit";
import { run, props, layout, openOverlay, closeOverlay, theme } from "herdr";
import { findNode } from "./sidebar/views/find-node.js";

const REPEAT = 500;
const STEP = 40;
const DIR = { h: "left", j: "down", k: "up", l: "right", left: "left", down: "down", up: "up", right: "right" };
// Abaixo de 160px a sidebar vira o rail; 480 é o max do layout.
const SIDEBAR = { min: 160, max: 480 };

// A sidebar fica à esquerda: right alarga, left estreita, up/down não fazem nada.
function step(target, direction) {
  if (target.pane) return run("pane.resize", { direction, pane: target.pane });
  const delta = { left: -STEP, right: STEP }[direction];
  const px = findNode(layout(), target.block)?.size?.px;
  if (!delta || px == null) return;
  run("layout.resize", { id: target.block, px: Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, px + delta)) });
}

// Primeiro passo já move a borda; o modo aberto segura as repetições.
export function startResize(target, direction) {
  step(target, direction);
  openOverlay({ mod: "setup", kind: "popup", at: "top", offset: 40, width: 140, height: 28, props: { view: "resize", ...target } });
}

export class Resize {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.gen = 0;
    this.arm(cx);
  }

  arm(cx) {
    const g = ++this.gen;
    cx.timer.after(REPEAT, () => {
      if (g === this.gen) closeOverlay(props().overlay);
    });
  }

  render() {
    const t = theme();
    const p = props();
    return div()
      .id("resize")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        const dir = DIR[(e.key ?? "").toLowerCase()];
        if (!dir) return closeOverlay(p.overlay);
        step(p.pane ? { pane: p.pane } : { block: p.block }, dir);
        this.arm(cx);
      })
      .size_full()
      .flex()
      .items_center()
      .justify_center()
      .rounded(8)
      .bg(t.popover)
      .text_size(12)
      .text_color(t.muted)
      .child(p.pane ? "resize  h j k l" : "resize  h l");
  }
}
