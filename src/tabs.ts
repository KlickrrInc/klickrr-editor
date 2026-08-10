// Tab model + tab-bar rendering. Each tab owns a CodeMirror EditorState; the
// active tab's live state lives in the shared EditorView and is snapshotted back
// here on switch (see main.ts). TabManager is pure data + DOM for the tab strip.

import type { EditorState } from "@codemirror/state";
import type { LineEnding, TextEncoding } from "./fileops";
import { fileBadge } from "./fileicons";
import { showContextMenu } from "./contextmenu";

export interface TabData {
  id: number;
  path: string | null; // absolute path on disk; null for a never-saved buffer
  title: string; // display name shown on the tab
  state: EditorState; // CodeMirror state (doc + undo history + cursor)
  dirty: boolean; // unsaved changes since last save/open
  encoding: TextEncoding;
  lineEnding: LineEnding;
  diskModifiedMs: number;
  diskSize: number;
  pinned?: boolean;
  preview?: boolean;
  large?: boolean;
  logWatch?: boolean;
  logTruncated?: boolean;
  logFilter?: string;
}

export interface TabHandlers {
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onPin: (id: number) => void;
}

export class TabManager {
  tabs: TabData[] = [];
  activeId: number | null = null;
  private seq = 0;
  private closed: TabData[] = [];

  constructor(private el: HTMLElement, private handlers: TabHandlers) {}

  nextId(): number {
    return ++this.seq;
  }

  add(tab: TabData): void {
    if (tab.preview) {
      const old = this.tabs.find((t) => t.preview && !t.dirty && !t.pinned);
      if (old) this.tabs.splice(this.tabs.indexOf(old), 1);
    }
    const firstUnpinned = this.tabs.findIndex((t) => !t.pinned);
    if (tab.pinned && firstUnpinned >= 0) this.tabs.splice(firstUnpinned, 0, tab);
    else this.tabs.push(tab);
    this.activeId = tab.id;
  }

  get(id: number): TabData | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  get active(): TabData | undefined {
    return this.activeId == null ? undefined : this.get(this.activeId);
  }

  remove(id: number, remember = true): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const [removed] = this.tabs.splice(idx, 1);
    if (remember && removed.path) this.closed.unshift({ ...removed, preview: false });
    this.closed = this.closed.slice(0, 20);
    if (this.activeId === id) {
      const neighbor = this.tabs[idx] ?? this.tabs[idx - 1];
      this.activeId = neighbor ? neighbor.id : null;
    }
  }

  reopenClosed(): TabData | undefined {
    const tab = this.closed.shift();
    if (!tab) return undefined;
    tab.id = this.nextId(); this.add(tab); return tab;
  }

  togglePin(id: number): void {
    const tab = this.get(id); if (!tab) return;
    tab.pinned = !tab.pinned; tab.preview = false;
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    const firstUnpinned = this.tabs.findIndex((t) => !t.pinned);
    if (tab.pinned) this.tabs.splice(firstUnpinned < 0 ? this.tabs.length : firstUnpinned, 0, tab);
    else this.tabs.push(tab);
    this.render();
  }

  render(): void {
    this.el.replaceChildren();
    for (const tab of this.tabs) {
      const tabEl = document.createElement("div");
      tabEl.className = "tab" + (tab.id === this.activeId ? " active" : "");
      if (tab.pinned) tabEl.classList.add("pinned");
      if (tab.preview) tabEl.classList.add("preview");
      tabEl.draggable = true;
      tabEl.dataset.id = String(tab.id);
      tabEl.title = tab.path ?? tab.title;

      const icon = document.createElement("span");
      icon.className = "tab-icon";
      icon.innerHTML = fileBadge(tab.title);
      tabEl.appendChild(icon);

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = (tab.dirty ? "• " : "") + tab.title;
      tabEl.appendChild(label);

      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "Close";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlers.onClose(tab.id);
      });
      tabEl.appendChild(close);

      tabEl.addEventListener("mousedown", (e) => {
        // middle-click closes, like most editors
        if (e.button === 1) {
          e.preventDefault();
          this.handlers.onClose(tab.id);
        }
      });
      tabEl.addEventListener("click", () => this.handlers.onSelect(tab.id));
      tabEl.addEventListener("dblclick", () => this.handlers.onPin(tab.id));
      tabEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
          { label: tab.pinned ? "Unpin Tab" : "Pin Tab", action: () => this.handlers.onPin(tab.id) },
          { label: "Close", action: () => this.handlers.onClose(tab.id) },
        ]);
      });
      tabEl.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/tab-id", String(tab.id)));
      tabEl.addEventListener("dragover", (e) => e.preventDefault());
      tabEl.addEventListener("drop", (e) => {
        e.preventDefault(); const fromId = Number(e.dataTransfer?.getData("text/tab-id"));
        const from = this.tabs.findIndex((t) => t.id === fromId), to = this.tabs.findIndex((t) => t.id === tab.id);
        if (from < 0 || to < 0 || from === to) return;
        const [moving] = this.tabs.splice(from, 1); moving.preview = false; this.tabs.splice(to, 0, moving); this.render();
      });

      this.el.appendChild(tabEl);
    }
  }
}
