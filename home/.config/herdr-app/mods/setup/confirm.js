// Confirmation dialog with props { title, detail, command: { name, args } }.
// y or Enter confirm; n, q or Esc cancel.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme } from "herdr";

export class Confirm {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  accept() {
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, p.command.args ?? {});
  }

  cancel() {
    closeOverlay(props().overlay);
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const button = (id, label, key, bg, fg, onClick) =>
      h_flex()
        .id(id)
        .h(32)
        .px(14)
        .gap(8)
        .items_center()
        .rounded(8)
        .border_1()
        .border_color(id === "cancel" ? t.input : bg)
        .bg(bg)
        .text_color(fg)
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(onClick)
        .child(label)
        .child(div().text_size(11).opacity(0.6).child(key));
    return v_flex()
      .id("confirm")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "y" || e.key === "enter") this.accept();
        else if (e.key === "n" || e.key === "q" || e.key === "escape") this.cancel();
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .min_h(0)
      .p(18)
      .gap(12)
      .rounded(8)
      .bg(t.popover)
      .text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(p.title ?? "Are you sure?"))
      .child(div().flex_1().min_h(0).overflow_y_scrollbar().text_color(t.muted).child(p.detail ?? ""))
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .text_size(12)
          .child(button("cancel", "Cancel", "n", t.raised, t.foreground, () => this.cancel()))
          .child(button("accept", "Close", "y", t.solid, t.solid_foreground, () => this.accept())),
      );
  }
}
