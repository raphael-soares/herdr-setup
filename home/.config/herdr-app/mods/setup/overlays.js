import { openOverlay, closeOverlay, shared, setShared } from "herdr";

const SPECS = {
  automations: { kind: "dialog", frame: "none", width: 640, height: 0.8 },
  confirm: { kind: "dialog", width: 380, height: 150 },
};
const key = (view) => `setup.overlay.${view}`;

// Overlay ids restart at o1 on every app start while shared state persists, so ids
// saved in a previous run are cleared by the always-on flow part when it starts.
export function forgetAll() {
  for (const view of Object.keys(SPECS)) setShared(key(view), null);
}

export function openPart(view, extra = {}) {
  const id = openOverlay({ mod: "setup", ...SPECS[view], props: { ...extra, view } });
  setShared(key(view), id);
  return id;
}

// Same toggle as mod.open: a second press closes it.
export function toggle(view, extra) {
  const id = shared(key(view));
  if (id) {
    setShared(key(view), null);
    closeOverlay(id);
    return;
  }
  openPart(view, extra);
}

export function forget(view, id) {
  if (shared(key(view)) === id) setShared(key(view), null);
}

// A popup is as tall as its items; height is only the most. Without `at`, at the pointer.
export function openMenu(tab, target, at) {
  openOverlay({ mod: "setup", kind: "popup", width: 200, height: 260, ...(at ? { at } : {}), props: { view: "menu", tab, target } });
}
