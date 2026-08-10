// A horizontal column ruler above the editor: a tick per column,
// a taller tick every 5, and a number every 10 (labelled 1, 2, 3… = tens). It
// aligns to the editor's monospace grid and tracks horizontal scrolling by
// anchoring to the live left edge of `.cm-content`.

import { EditorView } from "@codemirror/view";

export class Ruler {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(private host: HTMLElement, private view: EditorView) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ruler-canvas";
    this.host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;

    this.view.scrollDOM.addEventListener("scroll", () => this.draw(), {
      passive: true,
    });
    const ro = new ResizeObserver(() => this.draw());
    ro.observe(this.host);
    ro.observe(this.view.scrollDOM);
    window.addEventListener("resize", () => this.draw());
  }

  /** Force a redraw (call after swapping documents — gutter width can change). */
  sync(): void {
    this.draw();
  }

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0) return;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const charWidth = this.view.defaultCharacterWidth || 8;
    const hostRect = this.host.getBoundingClientRect();
    const scRect = this.view.scrollDOM.getBoundingClientRect();
    const contentRect = this.view.contentDOM.getBoundingClientRect();

    // Left edge of the text content, in ruler-local px (moves with scroll).
    const origin = contentRect.left - hostRect.left;
    // Right edge of the gutter — don't draw ruler marks over the line numbers.
    const gutter = this.view.scrollDOM.querySelector<HTMLElement>(".cm-gutters");
    const clipLeft = scRect.left - hostRect.left + (gutter?.offsetWidth ?? 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipLeft, 0, w - clipLeft, h);
    ctx.clip();

    ctx.strokeStyle = "#b8b8b8";
    ctx.fillStyle = "#808080";
    ctx.font = "9px 'SF Mono', Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    for (let col = 0; ; col++) {
      const x = Math.round(origin + col * charWidth) + 0.5;
      if (x > w) break;
      if (x < clipLeft - charWidth) continue;

      let tickHeight = 3;
      if (col % 10 === 0) tickHeight = 8;
      else if (col % 5 === 0) tickHeight = 5;

      ctx.beginPath();
      ctx.moveTo(x, h - tickHeight);
      ctx.lineTo(x, h - 1);
      ctx.stroke();

      if (col > 0 && col % 10 === 0) {
        ctx.fillText(String(col / 10), x, 1);
      }
    }
    ctx.restore();
  }
}
