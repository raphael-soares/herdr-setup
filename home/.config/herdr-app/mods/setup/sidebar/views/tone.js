// Proporções do Nautilus sobre o fundo do tema: a sidebar usa o `selected` do tema e os
// realces sobem em direção ao texto. O noctalia.json é gerado pelo Noctalia, então o degrau mora aqui.
import { theme as base } from "herdr";

/** @param {string} a @param {string} b @param {number} k */
export const mix = (a, b, k) =>
  "#" +
  [1, 3, 5]
    .map((i) => {
      const x = parseInt(a.slice(i, i + 2), 16);
      const y = parseInt(b.slice(i, i + 2), 16);
      return Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
    })
    .join("");

export function theme() {
  const t = base();
  const k = (n) => mix(t.background, t.foreground, n);
  return {
    ...t,
    chrome: t.selected,
    raised: k(0.1),
    hover: k(0.1),
    selected: k(0.145),
    border: k(0.19),
  };
}
