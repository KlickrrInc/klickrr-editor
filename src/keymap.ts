// Configurable keyboard shortcuts. A single registry of app commands with
// Mac-standard defaults; user overrides persist in localStorage. The accelerator
// strings are in Tauri format ("Shift+CmdOrCtrl+S") so they can drive the native
// menu directly (see appmenu.ts). Standard Edit keys (Undo/Cut/Copy/Paste/…) are
// intentionally NOT here — they stay native and fixed, the macOS way.

export interface KeyCommand {
  id: string;
  label: string;
  category: string;
  defaultAccel: string | null;
}

export const KEY_COMMANDS: KeyCommand[] = [
  { id: "app.settings", label: "Editor Settings…", category: "Application", defaultAccel: "CmdOrCtrl+," },
  { id: "app.keys", label: "Keyboard Shortcuts…", category: "Application", defaultAccel: "Alt+CmdOrCtrl+," },
  { id: "file.new", label: "New", category: "File", defaultAccel: "CmdOrCtrl+N" },
  { id: "file.open", label: "Open…", category: "File", defaultAccel: "CmdOrCtrl+O" },
  { id: "file.save", label: "Save", category: "File", defaultAccel: "CmdOrCtrl+S" },
  { id: "file.saveAs", label: "Save As…", category: "File", defaultAccel: "Shift+CmdOrCtrl+S" },
  { id: "file.saveAll", label: "Save All", category: "File", defaultAccel: "Alt+CmdOrCtrl+S" },
  { id: "file.print", label: "Print…", category: "File", defaultAccel: "CmdOrCtrl+P" },
  { id: "file.closeTab", label: "Close Tab", category: "File", defaultAccel: "CmdOrCtrl+W" },
  // ⇧⌘W belongs to Close Window (macOS convention), so Close All takes ⌥⌘W.
  { id: "file.closeAll", label: "Close All", category: "File", defaultAccel: "Alt+CmdOrCtrl+W" },
  { id: "file.reopenClosed", label: "Reopen Closed Tab", category: "File", defaultAccel: "Shift+CmdOrCtrl+T" },
  { id: "edit.selectAllOccurrences", label: "Select All Occurrences", category: "Edit", defaultAccel: "Shift+CmdOrCtrl+L" },
  { id: "search.find", label: "Find…", category: "Search", defaultAccel: "CmdOrCtrl+F" },
  { id: "search.findNext", label: "Find Next", category: "Search", defaultAccel: "CmdOrCtrl+G" },
  { id: "search.findPrev", label: "Find Previous", category: "Search", defaultAccel: "Shift+CmdOrCtrl+G" },
  { id: "search.replace", label: "Replace…", category: "Search", defaultAccel: "Alt+CmdOrCtrl+F" },
  { id: "search.gotoLine", label: "Go to Line…", category: "Search", defaultAccel: "CmdOrCtrl+L" },
  { id: "search.matchingPair", label: "Jump to Matching Bracket/Tag", category: "Search", defaultAccel: "Shift+CmdOrCtrl+\\" },
  { id: "search.locationBack", label: "Previous Location", category: "Search", defaultAccel: "Control+-" },
  { id: "search.locationForward", label: "Next Location", category: "Search", defaultAccel: "Control+Shift+-" },
  { id: "search.findInFiles", label: "Find in Files…", category: "Search", defaultAccel: "Shift+CmdOrCtrl+F" },
  { id: "search.replaceInFiles", label: "Replace in Files…", category: "Search", defaultAccel: "Shift+CmdOrCtrl+H" },
  { id: "search.quickOpen", label: "Quick Open…", category: "Search", defaultAccel: "CmdOrCtrl+E" },
  { id: "view.sidebar", label: "Toggle Sidebar", category: "View", defaultAccel: null },
  { id: "view.output", label: "Toggle Output Pane", category: "View", defaultAccel: null },
  { id: "view.terminal", label: "Toggle Terminal", category: "View", defaultAccel: null },
  { id: "view.preview", label: "Toggle Integrated Preview", category: "View", defaultAccel: null },
  { id: "view.minimap", label: "Toggle Minimap", category: "View", defaultAccel: null },
  { id: "view.wrap", label: "Toggle Word Wrap", category: "View", defaultAccel: null },
  { id: "view.hex", label: "Toggle Hex View", category: "View", defaultAccel: null },
  { id: "view.zoomIn", label: "Zoom In", category: "View", defaultAccel: "CmdOrCtrl+=" },
  { id: "view.zoomOut", label: "Zoom Out", category: "View", defaultAccel: "CmdOrCtrl+-" },
  { id: "view.actualSize", label: "Actual Size", category: "View", defaultAccel: "CmdOrCtrl+0" },
  { id: "document.toggleBookmark", label: "Toggle Bookmark", category: "Document", defaultAccel: "CmdOrCtrl+F2" },
  { id: "document.nextBookmark", label: "Next Bookmark", category: "Document", defaultAccel: "F2" },
  { id: "document.previousBookmark", label: "Previous Bookmark", category: "Document", defaultAccel: "Shift+F2" },
  { id: "html.bold", label: "Bold", category: "HTML", defaultAccel: "CmdOrCtrl+B" },
  { id: "html.italic", label: "Italic", category: "HTML", defaultAccel: "CmdOrCtrl+I" },
  { id: "html.underline", label: "Underline", category: "HTML", defaultAccel: "CmdOrCtrl+U" },
  { id: "tools.commandPalette", label: "Commands…", category: "Tools", defaultAccel: "Shift+CmdOrCtrl+P" },
  { id: "tools.recordMacro", label: "Record Macro", category: "Tools", defaultAccel: "Alt+CmdOrCtrl+M" },
  { id: "tools.replayMacro", label: "Replay Last Macro", category: "Tools", defaultAccel: "Alt+CmdOrCtrl+R" },
  { id: "tools.repeatLast", label: "Repeat Last Transformation", category: "Tools", defaultAccel: "Alt+CmdOrCtrl+." },
  { id: "window.newWindow", label: "New Window", category: "Window", defaultAccel: "Shift+CmdOrCtrl+N" },
  { id: "window.closeWindow", label: "Close Window", category: "Window", defaultAccel: "Shift+CmdOrCtrl+W" },
];

const STORE_KEY = "klickrr.keymap";

type Overrides = Record<string, string | null>;

function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Overrides;
  } catch {
    /* ignore */
  }
  return {};
}

function saveOverrides(o: Overrides): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(o));
}

const defaults: Record<string, string | null> = Object.fromEntries(
  KEY_COMMANDS.map((c) => [c.id, c.defaultAccel])
);
const CLASSIC_PRESET: Record<string, string | null> = {
  ...defaults,
  "search.findNext": "F3",
  "search.findPrev": "Shift+F3",
  "search.gotoLine": "CmdOrCtrl+G",
  "file.closeTab": "CmdOrCtrl+F4",
};

/** Effective accelerator for a command (override if set, else default). */
export function effectiveAccel(id: string): string | null {
  const o = loadOverrides();
  return id in o ? o[id] : defaults[id] ?? null;
}

// --- accelerator formatting ------------------------------------------------
/** Turn a Tauri accelerator ("Shift+CmdOrCtrl+S") into a pretty ⇧⌘S. */
export function prettyAccel(accel: string | null): string {
  if (!accel) return "";
  const map: Record<string, string> = {
    CmdOrCtrl: "⌘",
    Cmd: "⌘",
    Command: "⌘",
    Super: "⌘",
    Control: "⌃",
    Ctrl: "⌃",
    Alt: "⌥",
    Option: "⌥",
    Shift: "⇧",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  const parts = accel.split("+");
  const mods = ["⌃", "⌥", "⇧", "⌘"];
  const out = parts.map((p) => map[p] ?? p);
  // order modifiers ⌃⌥⇧⌘ then the key
  const m = out.filter((p) => mods.includes(p)).sort((a, b) => mods.indexOf(a) - mods.indexOf(b));
  const k = out.filter((p) => !mods.includes(p));
  return [...m, ...k].join("");
}

/** Build a Tauri accelerator from a keydown event, or null if not a valid combo. */
function accelFromEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if (["Shift", "Meta", "Control", "Alt", "CapsLock", "Dead"].includes(key)) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push("CmdOrCtrl");
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null; // require at least one modifier
  const k = key.length === 1 ? key.toUpperCase() : key;
  parts.push(k);
  return parts.join("+");
}

// --- config dialog ---------------------------------------------------------
export interface KeymapConfigHooks {
  /** Suspend native menu accelerators so recording keys isn't intercepted. */
  suspendMenu: () => Promise<void> | void;
  /** Restore native menu accelerators (after save/cancel), reflecting new keys. */
  restoreMenu: () => Promise<void> | void;
}

export function openKeymapConfig(hooks: KeymapConfigHooks): void {
  const working: Overrides = {};
  for (const c of KEY_COMMANDS) working[c.id] = effectiveAccel(c.id);
  let recordingId: string | null = null;
  let captureHandler: ((e: KeyboardEvent) => void) | null = null;

  void hooks.suspendMenu();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  overlay.appendChild(modal);

  const title = document.createElement("h2");
  title.textContent = "Keyboard Shortcuts";
  modal.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "tool-hints";
  hint.textContent =
    "Click a shortcut, then press the new key combination. Standard Mac editing keys (⌘C/⌘V/⌘Z, ⌘←/→, ⌥←/→…) are built in and always active.";
  modal.appendChild(hint);

  const list = document.createElement("div");
  list.className = "key-list";
  modal.appendChild(list);

  function stopRecording(): void {
    if (captureHandler) {
      document.removeEventListener("keydown", captureHandler, true);
      captureHandler = null;
    }
    recordingId = null;
  }

  function assign(id: string, accel: string | null): void {
    // Clear any other command that already holds this accel.
    if (accel) {
      for (const c of KEY_COMMANDS) {
        if (c.id !== id && working[c.id] === accel) working[c.id] = null;
      }
    }
    working[id] = accel;
  }

  function startRecording(id: string): void {
    stopRecording();
    recordingId = id;
    render();
    captureHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        stopRecording();
        render();
        return;
      }
      const accel = accelFromEvent(e);
      if (!accel) return; // wait for a real combo
      assign(id, accel);
      stopRecording();
      render();
    };
    document.addEventListener("keydown", captureHandler, true);
  }

  function render(): void {
    list.replaceChildren();
    let currentCat = "";
    for (const c of KEY_COMMANDS) {
      if (c.category !== currentCat) {
        currentCat = c.category;
        const h = document.createElement("div");
        h.className = "clip-group";
        h.textContent = currentCat;
        list.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "key-row";

      const label = document.createElement("span");
      label.className = "key-label";
      label.textContent = c.label;

      const cap = document.createElement("button");
      cap.className = "key-cap" + (recordingId === c.id ? " recording" : "");
      cap.textContent =
        recordingId === c.id ? "Press keys…" : prettyAccel(working[c.id]) || "—";
      cap.addEventListener("click", () => startRecording(c.id));

      const reset = document.createElement("button");
      reset.className = "key-reset";
      reset.textContent = "Reset";
      reset.title = "Reset to default";
      reset.addEventListener("click", () => {
        working[c.id] = c.defaultAccel;
        render();
      });

      row.append(label, cap, reset);
      list.appendChild(row);
    }
  }
  render();

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.textContent = "Save";
  save.className = "primary";
  const preset = document.createElement("button"); preset.textContent = "Use Classic Preset"; preset.addEventListener("click", () => { for (const c of KEY_COMMANDS) working[c.id] = CLASSIC_PRESET[c.id] ?? c.defaultAccel; render(); });
  actions.append(preset, cancel, save);
  modal.appendChild(actions);

  function close(): void {
    stopRecording();
    overlay.remove();
    void hooks.restoreMenu();
  }
  cancel.addEventListener("click", close);
  save.addEventListener("click", () => {
    const overrides: Overrides = {};
    for (const c of KEY_COMMANDS) {
      if (working[c.id] !== c.defaultAccel) overrides[c.id] = working[c.id];
    }
    saveOverrides(overrides);
    close();
  });

  document.body.appendChild(overlay);
}
