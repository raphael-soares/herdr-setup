import { openOverlay, closeOverlay, shared, setShared } from "herdr";

const SPECS = {
  agenda: { kind: "dialog", frame: "none", width: 640, height: 0.8 },
  sessionizer: { kind: "popup", at: "top", offset: 40, width: 640, height: 0.8 },
  confirma: { kind: "dialog", width: 380, height: 150 },
};
const key = (view) => `setup.overlay.${view}`;

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
