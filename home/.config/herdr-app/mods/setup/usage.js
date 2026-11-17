import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, exec, home, openOverlay, notify, terminals, panes, focused, run } from "herdr";

// omp handles the tokens; every 5 min it asks each profile (`omp` and `ompe`) for its usage.
const PROFILES = [
  { name: "Personal", color: "ansi5", args: [] },
  { name: "Work", color: "ansi2", args: ["--profile=enterprise", "--config", `${home()}/.dotfiles/ai/.omp/overlays/enterprise.yml`] },
];
const INTERVAL = 5 * 60_000;
const WINDOW = { "5h": "5 hours", "7d": "7 days" };
const HEIGHTS = [80, 48];

function remaining(ms) {
  const m = Math.max(0, Math.round((ms - Date.now()) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

// A tier limit (e.g. "7d:fable") repeats the overall window and is left out.
function parseUsage(json) {
  const reports = JSON.parse(json).reports ?? [];
  const resets = reports.map((r) => r.resetCredits).find(Boolean);
  return {
    limits: reports
      .flatMap((r) => r.limits)
      .filter((l) => l.amount && !l.scope?.tier)
      .map((l) => ({
        name: l.amount.unit === "usd" ? "Extra usage" : (WINDOW[l.window?.id] ?? l.label),
        fraction: l.amount.usedFraction ?? l.amount.used / l.amount.limit,
        usd: l.amount.unit === "usd" ? l.amount : null,
        reset: l.window?.resetsAt ?? null,
      })),
    resets: resets && {
      ready: resets.redeemableCount ?? 0,
      saved: resets.availableCount ?? 0,
      expires: resets.credits?.find((c) => c.usable)?.expiresAt ?? null,
    },
  };
}

export class Usage {
  init(_props, cx) {
    this.data = PROFILES.map(() => ({ limits: [], resets: null, stale: false }));
    const fetchUsage = (cx) => PROFILES.forEach((p, i) => cx.spawn(async (cx) => {
      try {
        const r = await exec("omp", [...p.args, "usage", "--json"], { timeout: 60_000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop());
        this.data[i] = { ...parseUsage(r.stdout), stale: false };
      } catch {
        this.data[i].stale = true;
      }
      cx.notify();
    }));
    fetchUsage(cx);
    cx.timer.every(INTERVAL, fetchUsage);
    this.size = null;
    this.later = (f) => cx.spawn(f);
    cx.timer.every(400, () => this.adjust(this.visible()));
  }

  // omp profiles in the focused tab's panes, read from the foreground process argv.
  visible() {
    const tab = focused()?.tab;
    const fg = new Map(terminals().map((x) => [x.address, x.foreground]));
    const found = new Set();
    for (const p of panes()) {
      const f = p.tab === tab && p.terminal ? fg.get(p.terminal) : null;
      if (f?.name !== "omp") continue;
      const a = f.argv ?? [];
      const i = a.indexOf("--profile");
      found.add(a.includes("--profile=enterprise") || (i >= 0 && a[i + 1] === "enterprise") ? 1 : 0);
    }
    return [...found].sort();
  }

  // The layout block has a fixed height and follows how many profiles show up. At 0 px the
  // block does not render, so the timer brings it back, not render.
  adjust(vis) {
    const px = vis.length ? 20 + vis.reduce((s, i) => s + HEIGHTS[i], 0) + 16 * (vis.length - 1) : 0;
    if (px === this.size) return;
    this.size = px;
    this.later(async () => run("layout.resize", { id: "usage", px }));
  }

  async details(p) {
    try {
      const r = await exec("hc", ["run", "--bg", "--json", "--no-parent", "--no-notify", "--rm", "--",
        "bash", "-c", 'omp "$@" usage; read -rsn1', "omp", ...p.args]);
      if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
      const { address } = JSON.parse(r.stdout);
      // An overlay for a terminal the app does not know yet does not open.
      for (let i = 0; i < 40 && !terminals().some((x) => x.address === address); i++) await exec("sleep", ["0.05"]);
      openOverlay({ layout: { type: "block", content: { terminal: address } }, kind: "dialog", width: 0.7, height: 0.6 });
    } catch (e) {
      notify({ title: "Usage", body: String(e?.message ?? e), level: "error" });
    }
  }

  render() {
    const t = theme();
    const bar = (f, c) => {
      const v = Math.max(0, Math.min(1, f));
      return h_flex().w_full().h(4).rounded_full().overflow_hidden().bg(t.border)
        .child(div().h_full().rounded_full().bg(v >= 0.9 ? t.blocked : c).flex_basis(0).flex_grow(v))
        .child(div().h_full().flex_basis(0).flex_grow(1 - v));
    };
    const limit = (l, c) => v_flex().gap(4)
      .child(h_flex().h(16).items_center().gap(6)
        .child(div().flex_1().text_color(t.muted).child(l.name))
        .child(div().text_color(t.foreground).font_semibold().child(
          l.usd ? `$${Math.round(l.usd.used)} / $${Math.round(l.usd.limit)}` : `${Math.round(l.fraction * 100)}%`))
        .when(Boolean(l.reset), (el) => el.child(div().text_color(t.dim).child(`· resets in ${remaining(l.reset)}`))))
      .child(bar(l.fraction, c));
    const badge = (r, c) => {
      const hint = `${r.saved} saved, ${r.ready} usable now` + (r.expires ? `, expires in ${remaining(Date.parse(r.expires))}` : "");
      return div()
        .id("usage-resets")
        .px(6)
        .rounded(5)
        .text_size(10.5)
        .bg(`${c}26`)
        .text_color(c)
        .tooltip(hint)
        .child(`${r.ready} reset ready`);
    };
    const section = (p, i) => {
      const d = this.data[i];
      const c = t[p.color];
      return v_flex()
        .id(`usage-${i}`)
        .gap(8)
        .cursor_pointer()
        .on_click(() => this.details(p))
        .when(d.stale, (el) => el.opacity(0.5))
        .child(h_flex().h(16).items_center().gap(6)
          .child(div().flex_1().font_semibold().text_color(c).child(p.name))
          .when(d.resets?.ready > 0, (el) => el.child(badge(d.resets, c))))
        .children(d.limits.length ? d.limits.map((l) => limit(l, c)) : [div().text_color(t.dim).child(d.stale ? "unavailable" : "loading…")]);
    };
    const vis = this.visible();
    this.adjust(vis);
    return v_flex()
      .size_full()
      .px(14)
      .py(10)
      .gap(16)
      .justify_end()
      .text_size(11.5)
      .children(vis.map((i) => section(PROFILES[i], i)));
  }
}
