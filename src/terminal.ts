// Integrated terminal: an xterm.js front end wired to the Rust PTY (see
// lib.rs pty_*). Output arrives via the "pty-output" event; keystrokes go back
// through pty_write; the panel size is kept in sync with pty_resize.

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export class IntegratedTerminal {
  private term: Terminal;
  private fit: FitAddon;
  private started = false;
  private unlisten: UnlistenFn[] = [];

  constructor(el: HTMLElement) {
    this.term = new Terminal({
      fontFamily: "'SF Mono', Menlo, Monaco, monospace",
      fontSize: 12,
      cursorBlink: true,
      theme: {
        background: "#ffffff",
        foreground: "#1c1c1c",
        cursor: "#1c1c1c",
        selectionBackground: "#c5dbf7",
      },
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(el);
    this.term.onData((d) => void invoke("pty_write", { data: d }));

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(el);
  }

  /** Start the shell (once) in `cwd`, or focus + resize if already running. */
  async start(cwd?: string): Promise<void> {
    this.fit.fit();
    if (this.started) {
      this.resize();
      this.term.focus();
      return;
    }
    this.started = true;
    this.unlisten.push(
      await listen<string>("pty-output", (e) => this.term.write(e.payload))
    );
    this.unlisten.push(
      await listen("pty-exit", () => this.term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n"))
    );
    await invoke("pty_start", {
      cwd: cwd ?? null,
      cols: this.term.cols,
      rows: this.term.rows,
    });
    this.term.focus();
  }

  /** Re-fit to the panel and tell the PTY the new size. */
  resize(): void {
    try {
      this.fit.fit();
      void invoke("pty_resize", { cols: this.term.cols, rows: this.term.rows });
    } catch {
      /* panel not visible yet */
    }
  }

  focus(): void {
    this.term.focus();
  }
}
