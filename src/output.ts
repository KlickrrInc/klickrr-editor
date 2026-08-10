// A collapsible bottom pane that shows user-tool output (stdout/stderr/exit
// code) in a compact output window.

export class OutputPane {
  private bodyEl: HTMLElement;
  private titleEl: HTMLElement;
  private cancelBtn: HTMLButtonElement;

  constructor(private el: HTMLElement, private onToggle: () => void, private openLocation?: (path: string, line: number, column: number) => void) {
    const header = document.createElement("div");
    header.className = "output-header";

    this.titleEl = document.createElement("span");
    this.titleEl.className = "output-title";
    this.titleEl.textContent = "Output";

    const spacer = document.createElement("span");
    spacer.style.flex = "1";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.className = "output-btn";
    clearBtn.addEventListener("click", () => this.clear());

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.title = "Hide output";
    closeBtn.className = "output-btn";
    closeBtn.addEventListener("click", () => this.hide());

    this.cancelBtn = document.createElement("button"); this.cancelBtn.textContent = "Cancel"; this.cancelBtn.className = "output-btn hidden";
    header.append(this.titleEl, spacer, this.cancelBtn, clearBtn, closeBtn);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "output-body";

    this.el.append(header, this.bodyEl);
    this.hide();
  }

  get visible(): boolean {
    return !this.el.classList.contains("hidden");
  }

  show(): void {
    this.el.classList.remove("hidden");
    this.onToggle();
  }

  hide(): void {
    this.el.classList.add("hidden");
    this.onToggle();
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  clear(): void {
    this.bodyEl.replaceChildren();
  }

  private line(text: string, cls?: string): void {
    const div = document.createElement("div");
    div.className = "output-line" + (cls ? ` ${cls}` : "");
    div.textContent = text;
    const match = /((?:\/[^:\s]+)+):(\d+)(?::(\d+))?/.exec(text);
    if (match && this.openLocation) { div.classList.add("output-link"); div.title = "Click to open"; div.addEventListener("click", () => this.openLocation!(match[1], Number(match[2]), Number(match[3] ?? 1))); }
    this.bodyEl.appendChild(div);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /** Print a command's result and reveal the pane. */
  report(title: string, stdout: string, stderr: string, code: number): void {
    this.line(`$ ${title}`, "output-cmd");
    if (stdout.trim()) stdout.replace(/\n$/, "").split("\n").forEach((l) => this.line(l));
    if (stderr.trim())
      stderr.replace(/\n$/, "").split("\n").forEach((l) => this.line(l, "output-err"));
    this.line(
      `[exit ${code}]`,
      code === 0 ? "output-ok" : "output-err"
    );
    this.show();
  }

  info(text: string): void {
    this.line(text, "output-cmd");
    this.show();
  }
  beginStream(title: string, cancel: () => void): void { this.line(`$ ${title}`, "output-cmd"); this.cancelBtn.classList.remove("hidden"); this.cancelBtn.onclick = cancel; this.show(); }
  stream(text: string, error = false): void { text.replace(/\n$/, "").split("\n").forEach((line) => this.line(line, error ? "output-err" : undefined)); }
  endStream(code: number): void { this.cancelBtn.classList.add("hidden"); this.cancelBtn.onclick = null; this.line(`[exit ${code}]`, code === 0 ? "output-ok" : "output-err"); }
}
