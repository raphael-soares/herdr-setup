import { View, div } from "gpui-kit";
import { props, theme } from "herdr";
import { forget } from "./overlays.js";
import { Spaces } from "./sidebar/views/spaces.js";
import { Lists } from "./sidebar/views/lists.js";
import { Agents } from "./sidebar/views/agents.js";
import { Footer } from "./sidebar/views/footer.js";
import { PanelToggle } from "./sidebar/views/panel-toggle.js";
import { Titulo } from "./titulo.js";
import { Uso } from "./uso.js";
import { Fluxo } from "./fluxo.js";
import { Agenda } from "./agenda.js";
import { Sessionizer } from "./sessionizer.js";
import { Confirma } from "./confirma.js";

// One mod for every piece that isn't Herdr's: a mod can't import outside its own
// folder, so this is how the pieces share code. `view` in props picks the piece.
const PARTS = {
  spaces: Spaces, lists: Lists, agents: Agents, footer: Footer, "panel-toggle": PanelToggle,
  titulo: Titulo, uso: Uso, fluxo: Fluxo, agenda: Agenda, sessionizer: Sessionizer,
  confirma: Confirma,
};

export default class Setup extends View {
  init(given, cx) {
    this.view = props()?.view;
    const Part = PARTS[this.view];
    this.part = Part ? new Part() : null;
    this.part?.init(given, cx);
  }

  render(cx) {
    if (!this.part) return div().text_color(theme().ansi1).child(`setup: unknown view "${this.view}"`);
    return this.part.render(cx);
  }

  async close(cx) {
    await this.part?.close?.(cx);
    const id = props()?.overlay;
    if (id) forget(this.view, id);
  }
}
