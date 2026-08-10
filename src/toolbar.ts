// Renders compact icon toolbars from a declarative spec. Buttons show
// an SVG icon (from icons.ts) or a styled text glyph (B, I, ¶, div…). Toggle
// buttons reflect state via an `active()` predicate; call Toolbar.update() after
// any command so those highlight correctly.

import { icons } from "./icons";

export interface TbButton {
  title: string;
  action: () => void;
  icon?: string; // key into icons.ts
  text?: string; // text glyph instead of an icon
  textClass?: string; // extra class for text styling (e.g. "tb-bold")
  active?: () => boolean; // toggle state → adds .active
}

export interface TbSep {
  sep: true;
}

export type TbItem = TbButton | TbSep;

function isSep(item: TbItem): item is TbSep {
  return (item as TbSep).sep === true;
}

export class Toolbar {
  private toggles: { el: HTMLElement; active: () => boolean }[] = [];

  constructor(el: HTMLElement, items: TbItem[]) {
    el.classList.add("toolbar");
    for (const item of items) {
      if (isSep(item)) {
        const sep = document.createElement("span");
        sep.className = "tb-sep";
        el.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "tb-btn";
      btn.title = item.title;
      btn.setAttribute("aria-label", item.title);
      if (item.icon && icons[item.icon]) {
        btn.innerHTML = icons[item.icon];
      } else if (item.text) {
        const span = document.createElement("span");
        span.className = "tb-text" + (item.textClass ? ` ${item.textClass}` : "");
        span.textContent = item.text;
        btn.appendChild(span);
      }
      btn.addEventListener("click", () => {
        item.action();
        this.update();
      });
      el.appendChild(btn);
      if (item.active) { btn.setAttribute("aria-pressed", "false"); this.toggles.push({ el: btn, active: item.active }); }
    }
  }

  /** Re-evaluate toggle states (call after commands that change them). */
  update(): void {
    for (const t of this.toggles) { const active = t.active(); t.el.classList.toggle("active", active); t.el.setAttribute("aria-pressed", String(active)); }
  }
}
