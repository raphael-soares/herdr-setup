import { div } from "gpui-kit";
import { spaces, focused, panes, terminals, run, shared, setShared, nextCommand, notify, openOverlay, checking } from "herdr";
import { openPart, toggle } from "./overlays.js";

// Bloco flutuante sempre vivo: guarda o space anterior, mostra a barra de tabs
// só no layout sem sidebar e com mais de uma tab, e abre menus pelo teclado.
export class Fluxo {
  init(_props, cx) {
    this.tabsVisiveis = null;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "voltar") this.voltar();
        else if (c === "novo") openOverlay({ mod: "new-menu", kind: "dialog", width: 250 });
        else if (c === "ssh") openPart("sessionizer", { ssh: true });
        else if (c === "agenda" || c === "sessionizer") toggle(c);
        else if (c.startsWith("worktree-")) this.worktree(c.slice("worktree-".length));
        else if (c === "sidebar") this.sidebar();
        else if (c.startsWith("fechar-")) this.fechar(c.slice("fechar-".length));
      }
    });
  }

  voltar() {
    this.registrar();
    const alvo = shared("fluxo.anterior");
    if (!alvo || alvo === shared("fluxo.atual") || !spaces().some((s) => s.id === alvo)) {
      notify({ title: "No previous space", level: "info", timeout: 2000 });
      return;
    }
    setShared("fluxo.anterior", shared("fluxo.atual"));
    setShared("fluxo.atual", alvo);
    run("space.select", { id: alvo });
  }

  registrar() {
    const ativo = spaces().find((s) => s.active);
    const atual = ativo?.id ?? null;
    const visto = shared("fluxo.atual") ?? null;
    if (atual && atual !== visto) {
      if (visto) setShared("fluxo.anterior", visto);
      setShared("fluxo.atual", atual);
    }
    const nome = shared("layout");
    if (nome !== this.layoutVisto) {
      this.layoutVisto = nome;
      this.tabsVisiveis = null;
    }
    const mostrar = nome !== "raphael" && (ativo?.tabs.length ?? 0) > 1;
    if (mostrar !== this.tabsVisiveis) {
      this.tabsVisiveis = mostrar;
      run(mostrar ? "layout.show" : "layout.hide", { id: "tabs" });
    }
  }

  trocar(nome) {
    run("layout.switch", { name: nome });
  }

  // O pane não muda de visual por estado; sem sidebar é outro layout, sem moldura.
  sidebar() {
    this.trocar(shared("layout") === "raphael-cheio" ? "raphael" : "raphael-cheio");
  }

  // Só fechar tab pede confirmação, inclusive pelo x no último pane dela. Pane e
  // space fecham direto, e a última tab leva o space junto, sem pergunta.
  fechar(oque) {
    const f = focused();
    const space = spaces().find((s) => s.active);
    if (!f || !space) return;
    const fecharSpace = () => run("space.close", { id: space.id, confirmed: true });
    const ultimaTab = space.tabs.length === 1;
    if (oque === "space") return fecharSpace();
    if (oque === "pane") {
      if (!f.pane) return;
      if (panes().filter((p) => p.tab === f.tab).length > 1) return run("pane.close", { pane: f.pane });
    }
    const tab = space.tabs.find((t) => t.id === f.tab);
    if (!tab) return;
    if (ultimaTab) return fecharSpace();
    openPart("confirma", { title: `Close tab ${tab.name}?`, detail: "Its terminals will end.", command: { name: "tab.close", args: { id: tab.id, confirmed: true } } });
  }

  worktree(action) {
    const space = spaces().find((s) => s.active);
    if (!space) return;
    const size = action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 };
    openOverlay({ mod: "worktree", kind: "dialog", ...size, props: { space: space.id, action } });
  }

  // Mexer em estado compartilhado ou no layout durante o render se perde; adia.
  // Ler foco e layout aqui faz o render voltar quando eles mudam.
  render(cx) {
    focused();
    terminals();
    shared("layout");
    if (!checking()) cx.timer.after(0, () => this.registrar());
    return div();
  }
}
