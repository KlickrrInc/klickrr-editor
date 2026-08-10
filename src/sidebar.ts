// Left sidebar with three tabs: Directory (a lazy file tree),
// Cliptext (insertable snippets), and Functions (a live outline of the current
// document). It talks to the rest of the app only through the Handlers below.

import { listDir, homeDir, pickFolderPath } from "./fileops";
import type { DirEntry } from "./fileops";
import { fileBadge, folderIcon } from "./fileicons";
import { showContextMenu } from "./contextmenu";
import { addRecentFolder, recentFolders } from "./persistence";
import { promptText } from "./prompt";

export interface SidebarHandlers {
  openFile: (path: string) => void;
  insertSnippet: (text: string) => void;
  jumpToLine: (line: number) => void;
  /** Reveal a path in Finder. */
  reveal: (path: string) => void;
  /** Move a path to Trash; resolve true if it was trashed (then the tree refreshes). */
  trash: (path: string, isDir: boolean, name: string) => Promise<boolean>;
  /** Create a new file inside a directory; resolve true on success. */
  createFile: (dirPath: string) => Promise<boolean>;
  createFolder: (dirPath: string) => Promise<boolean>;
  rename: (path: string, isDir: boolean, name: string) => Promise<boolean>;
  duplicate: (path: string, name: string) => Promise<boolean>;
  move: (path: string, name: string) => Promise<boolean>;
  copyPath: (path: string, relative: boolean) => void;
}

type PaneName = "directory" | "cliptext" | "functions";

export class Sidebar {
  private tabsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private panes: Record<PaneName, HTMLElement>;
  private functionsEl: HTMLElement;
  private root = "/";
  private treeEl: HTMLElement | null = null;
  private rootPicker: HTMLSelectElement | null = null;
  private filterInput: HTMLInputElement | null = null;
  private directoryReady: Promise<void>;
  private expanders = new WeakMap<HTMLElement, () => Promise<void>>();
  private revealVersion = 0;

  constructor(private el: HTMLElement, private handlers: SidebarHandlers) {
    this.el.classList.add("sidebar");

    this.tabsEl = document.createElement("div");
    this.tabsEl.className = "sidebar-tabs";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "sidebar-body";
    this.el.append(this.tabsEl, this.bodyEl);

    this.panes = {
      directory: this.makePane(),
      cliptext: this.makePane(),
      functions: this.makePane(),
    };
    this.functionsEl = this.panes.functions;

    this.buildTabs();
    this.directoryReady = this.buildDirectory();
    this.buildCliptext();
    this.setFunctions([]);
    this.show("directory");
  }

  private makePane(): HTMLElement {
    const p = document.createElement("div");
    p.className = "sidebar-pane";
    this.bodyEl.appendChild(p);
    return p;
  }

  private buildTabs(): void {
    const defs: [PaneName, string][] = [
      ["directory", "Directory"],
      ["cliptext", "Cliptext"],
      ["functions", "Functions"],
    ];
    for (const [name, label] of defs) {
      const tab = document.createElement("button");
      tab.className = "sidebar-tab";
      tab.textContent = label;
      tab.dataset.pane = name;
      tab.addEventListener("click", () => this.show(name));
      this.tabsEl.appendChild(tab);
    }
  }

  /** Programmatically switch the visible pane (used by the toolbar buttons). */
  showPane(name: "directory" | "cliptext" | "functions"): void {
    this.show(name);
  }

  getRoot(): string { return this.root; }
  async openRoot(path: string): Promise<void> { await this.setDirectoryRoot(path); }

  /** Expand the Directory tree to `path` and select its row. */
  async revealPath(path: string): Promise<void> {
    const version = ++this.revealVersion;
    await this.directoryReady;
    if (version !== this.revealVersion || !this.treeEl) return;

    const target = this.normalizePath(path);
    if (!this.isWithinRoot(target)) {
      await this.setDirectoryRoot(this.parentPath(target));
      if (version !== this.revealVersion || !this.treeEl) return;
    }

    this.show("directory");
    if (this.filterInput?.value) {
      this.filterInput.value = "";
      this.filterInput.dispatchEvent(new Event("input"));
    }
    this.treeEl.querySelectorAll<HTMLElement>(".tree-row.selected").forEach((row) => {
      row.classList.remove("selected");
      row.removeAttribute("aria-selected");
    });

    let currentPath = this.normalizePath(this.root);
    let node = this.findNode(currentPath);
    if (!node) return;
    const relative = currentPath === "/" ? target.slice(1) : target.slice(currentPath.length).replace(/^\//, "");
    const parts = relative.split("/").filter(Boolean);
    for (const part of parts) {
      await this.expanders.get(node)?.();
      if (version !== this.revealVersion) return;
      currentPath = currentPath === "/" ? `/${part}` : `${currentPath}/${part}`;
      const next = this.findNode(currentPath);
      if (!next) return;
      node = next;
    }

    const row = node.querySelector<HTMLElement>(":scope > .tree-row");
    row?.classList.add("selected");
    row?.setAttribute("aria-selected", "true");
    row?.scrollIntoView({ block: "nearest" });
  }

  private show(name: PaneName): void {
    for (const key of Object.keys(this.panes) as PaneName[]) {
      this.panes[key].classList.toggle("active", key === name);
    }
    this.tabsEl.querySelectorAll<HTMLElement>(".sidebar-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.pane === name);
    });
  }

  // --- Directory pane ------------------------------------------------------
  private async buildDirectory(): Promise<void> {
    const pane = this.panes.directory;
    pane.replaceChildren();

    const home = await homeDir();
    this.root = home;

    const controls = document.createElement("div");
    controls.className = "dir-controls";
    const picker = document.createElement("select");
    picker.className = "dir-root";
    this.rootPicker = picker;
    const options: [string, string][] = [
      [home, "~ (Home)"],
      ["/", "/ (Root)"],
      ...recentFolders().filter((p) => p !== home && p !== "/").map((p) => [p, p] as [string, string]),
      ["__open__", "Open Folder…"],
    ];
    for (const [value, label] of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      picker.appendChild(opt);
    }
    picker.value = home;
    picker.addEventListener("change", async () => {
      let selected = picker.value;
      if (selected === "__open__") { selected = await pickFolderPath() ?? this.root; }
      await this.setDirectoryRoot(selected);
    });
    const filter = document.createElement("input");
    filter.className = "dir-filter";
    filter.placeholder = "Filter files…";
    this.filterInput = filter;
    filter.addEventListener("input", () => {
      const q = filter.value.toLowerCase();
      treeEl.querySelectorAll<HTMLElement>(".tree-node").forEach((node) => {
        const label = node.querySelector<HTMLElement>(":scope > .tree-row .tree-label")?.textContent?.toLowerCase() ?? "";
        node.style.display = !q || label.includes(q) || node.querySelector(`.tree-label`)?.textContent?.toLowerCase().includes(q) ? "" : "none";
      });
    });

    const treeEl = document.createElement("div");
    treeEl.className = "dir-tree";
    this.treeEl = treeEl;

    controls.append(picker, filter);
    pane.append(controls, treeEl);
    await this.renderTree(treeEl, this.root);
  }

  /** Rebuild the directory tree (after a file was trashed/created). */
  refreshDirectory(): void {
    if (this.treeEl) void this.renderTree(this.treeEl, this.root);
  }

  private async renderTree(treeEl: HTMLElement, root: string): Promise<void> {
    treeEl.replaceChildren();
    const rootNode = this.makeDirNode(
      { name: root === "/" ? "/" : root.split("/").pop() || root, path: root, is_dir: true },
      0
    );
    treeEl.appendChild(rootNode);
    // Auto-expand the root.
    await this.expanders.get(rootNode)?.();
  }

  private normalizePath(path: string): string {
    return path === "/" ? path : path.replace(/\/+$/, "");
  }

  private parentPath(path: string): string {
    const normalized = this.normalizePath(path);
    const slash = normalized.lastIndexOf("/");
    return slash <= 0 ? "/" : normalized.slice(0, slash);
  }

  private isWithinRoot(path: string): boolean {
    const root = this.normalizePath(this.root);
    return root === "/" || path === root || path.startsWith(`${root}/`);
  }

  private findNode(path: string): HTMLElement | undefined {
    return [...(this.treeEl?.querySelectorAll<HTMLElement>(".tree-node") ?? [])]
      .find((node) => node.dataset.path === path);
  }

  private selectRow(row: HTMLElement): void {
    this.treeEl?.querySelectorAll<HTMLElement>(".tree-row.selected").forEach((selected) => {
      selected.classList.remove("selected");
      selected.removeAttribute("aria-selected");
    });
    row.classList.add("selected");
    row.setAttribute("aria-selected", "true");
  }

  private async setDirectoryRoot(path: string): Promise<void> {
    const root = this.normalizePath(path);
    this.root = root;
    addRecentFolder(root);
    const picker = this.rootPicker;
    if (picker) {
      if (![...picker.options].some((option) => option.value === root)) {
        const option = document.createElement("option");
        option.value = root; option.textContent = root;
        picker.insertBefore(option, picker.lastElementChild);
      }
      picker.value = root;
    }
    if (this.treeEl) await this.renderTree(this.treeEl, root);
  }

  /** A single tree node (row + lazily-populated children container). */
  private makeDirNode(entry: DirEntry, depth: number): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "tree-node";
    wrap.dataset.path = this.normalizePath(entry.path);

    const row = document.createElement("div");
    row.className = "tree-row";
    row.style.paddingLeft = `${6 + depth * 14}px`;

    const twisty = document.createElement("span");
    twisty.className = "tree-twisty";
    twisty.textContent = entry.is_dir ? "▸" : "";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.innerHTML = entry.is_dir ? folderIcon(false) : fileBadge(entry.name);

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = entry.name;

    row.append(twisty, icon, label);
    wrap.appendChild(row);

    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openRowMenu(e, entry);
    });

    if (!entry.is_dir) {
      // Match Finder: one click selects; double-click opens a persistent tab.
      row.addEventListener("click", () => this.selectRow(row));
      row.addEventListener("dblclick", () => this.handlers.openFile(entry.path));
      return wrap;
    }

    const children = document.createElement("div");
    children.className = "tree-children";
    children.style.display = "none";
    wrap.appendChild(children);

    let loaded = false;
    let expanded = false;
    const expand = async () => {
      if (expanded) return;
      expanded = true;
      twisty.textContent = "▾";
      icon.innerHTML = folderIcon(true);
      children.style.display = "block";
      if (!loaded) {
        loaded = true;
        try {
          const items = await listDir(entry.path);
          for (const item of items) {
            children.appendChild(this.makeDirNode(item, depth + 1));
          }
          if (items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tree-empty";
            empty.style.paddingLeft = `${6 + (depth + 1) * 14}px`;
            empty.textContent = "(empty)";
            children.appendChild(empty);
          }
        } catch (e) {
          loaded = false;
          const err = document.createElement("div");
          err.className = "tree-empty";
          err.style.paddingLeft = `${6 + (depth + 1) * 14}px`;
          err.textContent = "(no access)";
          children.appendChild(err);
        }
      }
    };
    this.expanders.set(wrap, expand);
    row.addEventListener("click", async () => {
      if (!expanded) {
        await expand();
        return;
      }
      expanded = false;
      twisty.textContent = "▸";
      icon.innerHTML = folderIcon(false);
      children.style.display = "none";
    });

    return wrap;
  }

  /** Right-click menu for a tree row. */
  private openRowMenu(e: MouseEvent, entry: DirEntry): void {
    const items = [];
    if (!entry.is_dir) {
      items.push({ label: "Open", action: () => this.handlers.openFile(entry.path) });
    } else {
      items.push({
        label: "New File…",
        action: async () => {
          if (await this.handlers.createFile(entry.path)) this.refreshDirectory();
        },
      });
      items.push({
        label: "New Folder…",
        action: async () => { if (await this.handlers.createFolder(entry.path)) this.refreshDirectory(); },
      });
    }
    items.push({
      label: "Rename…",
      action: async () => { if (await this.handlers.rename(entry.path, entry.is_dir, entry.name)) this.refreshDirectory(); },
    });
    items.push({
      label: "Duplicate…",
      action: async () => { if (await this.handlers.duplicate(entry.path, entry.name)) this.refreshDirectory(); },
    });
    items.push({ label: "Move…", action: async () => { if (await this.handlers.move(entry.path, entry.name)) this.refreshDirectory(); } });
    items.push({ label: "Copy Path", action: () => this.handlers.copyPath(entry.path, false) });
    items.push({ label: "Copy Relative Path", action: () => this.handlers.copyPath(entry.path, true) });
    items.push({ label: "Reveal in Finder", action: () => this.handlers.reveal(entry.path) });
    items.push({ separator: true, label: "", action: () => {} });
    items.push({
      label: "Move to Trash",
      danger: true,
      action: async () => {
        if (await this.handlers.trash(entry.path, entry.is_dir, entry.name)) {
          this.refreshDirectory();
        }
      },
    });
    showContextMenu(e.clientX, e.clientY, items);
  }

  // --- Cliptext pane -------------------------------------------------------
  private buildCliptext(): void {
    const pane = this.panes.cliptext;
    pane.replaceChildren();

    const groups: { title: string; items: [string, string][] }[] = [
      {
        title: "HTML",
        items: [
          ["HTML5 skeleton", HTML5_SKELETON],
          ["<a> link", '<a href="">$</a>'],
          ["<img>", '<img src="" alt="">'],
          ["<div>", '<div class="">$</div>'],
          ["<table>", TABLE_SNIPPET],
          ["<ul><li>", "<ul>\n  <li>$</li>\n</ul>"],
          ["<style>", "<style>\n$\n</style>"],
          ["<script>", '<script>\n$\n</script>'],
        ],
      },
      {
        title: "General",
        items: [
          ["Date (ISO)", new Date().toISOString().slice(0, 10)],
          ["Lorem", "Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
        ],
      },
    ];
    try {
      const custom = JSON.parse(localStorage.getItem("klickrr.snippets.v1") ?? "[]") as { category: string; name: string; text: string }[];
      for (const snippet of custom) { let group = groups.find((g) => g.title === snippet.category); if (!group) { group = { title: snippet.category, items: [] }; groups.push(group); } group.items.push([snippet.name, snippet.text]); }
    } catch { /* ignore invalid user snippet data */ }

    const add = document.createElement("button"); add.className = "sidebar-action"; add.textContent = "+ Add Snippet";
    add.addEventListener("click", async () => { const name = await promptText("New Snippet", { label: "Name" }); if (!name) return;
      const category = await promptText("New Snippet", { label: "Category", value: "General" }); if (!category) return;
      const text = await promptText("New Snippet", { label: "Content ($0 = cursor, ${selection}, ${date}, ${filename}, ${project})" }); if (text == null) return;
      const items = JSON.parse(localStorage.getItem("klickrr.snippets.v1") ?? "[]"); items.push({ name, category, text }); localStorage.setItem("klickrr.snippets.v1", JSON.stringify(items)); this.buildCliptext(); });
    pane.appendChild(add);

    for (const group of groups) {
      const heading = document.createElement("div");
      heading.className = "clip-group";
      heading.textContent = group.title;
      pane.appendChild(heading);
      for (const [label, snippet] of group.items) {
        const item = document.createElement("div");
        item.className = "clip-item";
        item.textContent = label;
        item.title = "Click to insert at cursor";
        // The "$" marks where the caret should land; strip it on insert.
        item.addEventListener("click", () => this.handlers.insertSnippet(snippet));
        pane.appendChild(item);
      }
    }
  }

  // --- Functions pane ------------------------------------------------------
  /** Rebuild the outline from the current document text + language label. */
  refreshFunctions(text: string, langLabel: string): void {
    this.setFunctions(extractOutline(text, langLabel));
  }

  private setFunctions(items: { name: string; line: number }[]): void {
    this.functionsEl.replaceChildren();
    const filter = document.createElement("input"); filter.className = "dir-filter functions-filter"; filter.placeholder = "Filter symbols…";
    const list = document.createElement("div"); this.functionsEl.append(filter, list);
    filter.addEventListener("input", () => { const q = filter.value.toLowerCase(); list.querySelectorAll<HTMLElement>(".func-item").forEach((el) => { el.style.display = (el.dataset.name ?? "").includes(q) ? "" : "none"; }); });
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.style.padding = "8px 10px";
      empty.textContent = "No functions found.";
      list.appendChild(empty);
      return;
    }
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "func-item";
      el.dataset.name = it.name.toLowerCase();
      const ln = document.createElement("span");
      ln.className = "func-line";
      ln.textContent = String(it.line);
      const nm = document.createElement("span");
      nm.className = "func-name";
      nm.textContent = it.name;
      el.append(ln, nm);
      el.addEventListener("click", () => this.handlers.jumpToLine(it.line));
      list.appendChild(el);
    }
  }
}

// --- outline extraction (lightweight, regex-based) -------------------------
const OUTLINE_PATTERNS: RegExp[] = [
  // JS/TS function declarations, methods, classes
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
  // Python
  /^\s*def\s+([A-Za-z_]\w*)/,
  /^\s*class\s+([A-Za-z_]\w*)/,
  // Java / C / C++ / PHP methods (name followed by "(")
  /^\s*(?:public|private|protected|static|final|function)\s+.*?\b([A-Za-z_]\w*)\s*\(/,
  // Rust
  /^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)/,
];

function extractOutline(text: string, langLabel: string): { name: string; line: number }[] {
  const lines = text.split("\n");
  const out: { name: string; line: number }[] = [];

  if (langLabel === "Markdown") {
    lines.forEach((line, i) => {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) out.push({ name: "  ".repeat(m[1].length - 1) + m[2].trim(), line: i + 1 });
    });
    return out;
  }

  if (langLabel === "CSS" || langLabel === "SCSS" || langLabel === "LESS") {
    lines.forEach((line, i) => {
      // A selector line: "…something… {" at end of line.
      const sel = /^\s*([.#@]?[A-Za-z][^{}]*?)\s*\{\s*$/.exec(line);
      if (sel) out.push({ name: sel[1].trim(), line: i + 1 });
    });
    return out;
  }

  lines.forEach((line, i) => {
    for (const re of OUTLINE_PATTERNS) {
      const m = re.exec(line);
      if (m && m[1]) {
        out.push({ name: m[1], line: i + 1 });
        break;
      }
    }
  });
  return out;
}

const HTML5_SKELETON = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$</title>
</head>
<body>

</body>
</html>`;

const TABLE_SNIPPET = `<table>
  <tr><th>$</th><th></th></tr>
  <tr><td></td><td></td></tr>
</table>`;
