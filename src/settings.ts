// Editor settings: font size, tab size, spaces-vs-tabs, line numbers. Persisted
// in localStorage; applied to CodeMirror via compartments in editor.ts. The
// config dialog is opened from the menu bar (Klickrr - Edit → Editor Settings).

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  lineNumbers: boolean;
  fontFamily: string;
  ligatures: boolean;
  zoom: number;
  theme: "light" | "dark" | "system";
  restoreSession: boolean;
  indentOverrides: string;
  indentationGuides: boolean;
  visibleWhitespace: boolean;
  spellCheck: boolean;
  backupOnSave: boolean;
  rightMargin: number;
  customColors: { background: string; foreground: string; keyword: string; comment: string; string: string; number: string; selector: string };
}

const DEFAULTS: EditorSettings = {
  fontSize: 13,
  tabSize: 4,
  insertSpaces: true,
  lineNumbers: true,
  fontFamily: "SF Mono, Menlo, Monaco, Courier New, monospace",
  ligatures: false,
  zoom: 100,
  theme: "system",
  restoreSession: true,
  indentOverrides: "py=4s,js=2s,ts=2s,json=2s,yaml=2s",
  indentationGuides: true,
  visibleWhitespace: false,
  spellCheck: false,
  backupOnSave: true,
  rightMargin: 80,
  customColors: { background: "#ffffff", foreground: "#000000", keyword: "#0000ff", comment: "#008000", string: "#ff00ff", number: "#008080", selector: "#a00000" },
};

const STORE_KEY = "klickrr.editorSettings";

export function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const parsed = JSON.parse(raw) as Partial<EditorSettings>; return { ...DEFAULTS, ...parsed, customColors: { ...DEFAULTS.customColors, ...parsed.customColors } }; }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: EditorSettings): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
  localStorage.setItem("klickrr.restoreSession", String(s.restoreSession));
}

export function applyAppearance(s = loadSettings()): void {
  const dark = s.theme === "dark" || (s.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function openEditorSettings(onSave: (s: EditorSettings) => void): void {
  const s = loadSettings();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  overlay.appendChild(modal);

  const title = document.createElement("h2");
  title.textContent = "Editor Settings";
  modal.appendChild(title);

  const form = document.createElement("div");
  form.className = "settings-form";
  modal.appendChild(form);

  function numberRow(label: string, value: number, min: number, max: number, onInput: (n: number) => void): void {
    const row = document.createElement("div");
    row.className = "settings-row";
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.className = "settings-number";
    input.addEventListener("input", () => {
      const n = Math.max(min, Math.min(max, Number(input.value) || value));
      onInput(n);
    });
    row.append(l, input);
    form.appendChild(row);
  }

  function checkRow(label: string, value: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement("div");
    row.className = "settings-row";
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    row.append(l, input);
    form.appendChild(row);
  }

  function textRow(label: string, value: string, onInput: (v: string) => void): void {
    const row = document.createElement("div"); row.className = "settings-row";
    const l = document.createElement("label"); l.textContent = label;
    const input = document.createElement("input"); input.type = "text"; input.value = value;
    input.addEventListener("input", () => onInput(input.value)); row.append(l, input); form.appendChild(row);
  }

  function selectRow(label: string, value: string, values: [string, string][], onChange: (v: string) => void): void {
    const row = document.createElement("div"); row.className = "settings-row";
    const l = document.createElement("label"); l.textContent = label;
    const input = document.createElement("select");
    for (const [v, text] of values) { const o = document.createElement("option"); o.value = v; o.textContent = text; input.appendChild(o); }
    input.value = value; input.addEventListener("change", () => onChange(input.value)); row.append(l, input); form.appendChild(row);
  }
  function colorRow(label: string, key: keyof EditorSettings["customColors"]): void {
    const row = document.createElement("div"); row.className = "settings-row"; const l = document.createElement("label"); l.textContent = label;
    const input = document.createElement("input"); input.type = "color"; input.value = s.customColors[key]; input.addEventListener("input", () => { s.customColors[key] = input.value; }); row.append(l, input); form.appendChild(row);
  }

  numberRow("Font size (px)", s.fontSize, 8, 40, (n) => (s.fontSize = n));
  textRow("Font family", s.fontFamily, (v) => (s.fontFamily = v));
  checkRow("Enable font ligatures", s.ligatures, (v) => (s.ligatures = v));
  numberRow("Zoom (%)", s.zoom, 50, 200, (n) => (s.zoom = n));
  selectRow("Appearance", s.theme, [["system", "Follow System"], ["light", "Classic Light"], ["dark", "Dark"]], (v) => (s.theme = v as EditorSettings["theme"]));
  for (const [label, key] of [["Background", "background"], ["Foreground", "foreground"], ["Keywords/tags", "keyword"], ["Comments", "comment"], ["Strings", "string"], ["Numbers", "number"], ["Selectors/attributes", "selector"]] as [string, keyof EditorSettings["customColors"]][]) colorRow(label, key);
  numberRow("Tab size (spaces)", s.tabSize, 1, 12, (n) => (s.tabSize = n));
  checkRow("Insert spaces instead of tabs", s.insertSpaces, (v) => (s.insertSpaces = v));
  textRow("Language indentation overrides", s.indentOverrides, (v) => (s.indentOverrides = v));
  checkRow("Show line numbers", s.lineNumbers, (v) => (s.lineNumbers = v));
  checkRow("Show indentation guides", s.indentationGuides, (v) => (s.indentationGuides = v));
  checkRow("Show whitespace and line endings", s.visibleWhitespace, (v) => (s.visibleWhitespace = v));
  checkRow("Check spelling as you type", s.spellCheck, (v) => (s.spellCheck = v));
  checkRow("Create .bak backup when saving", s.backupOnSave, (v) => (s.backupOnSave = v));
  numberRow("Right margin column (0 disables)", s.rightMargin, 0, 240, (n) => (s.rightMargin = n));
  checkRow("Restore windows and unsaved files on launch", s.restoreSession, (v) => (s.restoreSession = v));

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.textContent = "Save";
  save.className = "primary";
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Export Theme";
  exportBtn.addEventListener("click", () => { const blob = new Blob([JSON.stringify({ theme: s.theme, colors: s.customColors }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "klickrr-theme.json"; a.click(); URL.revokeObjectURL(a.href); });
  const importBtn = document.createElement("button"); importBtn.textContent = "Import Theme";
  importBtn.addEventListener("click", () => { const input = document.createElement("input"); input.type = "file"; input.accept = ".json"; input.addEventListener("change", async () => { const file = input.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); if (data.colors) s.customColors = { ...s.customColors, ...data.colors }; if (data.theme) s.theme = data.theme; } catch { /* ignore invalid theme */ } }); input.click(); });
  actions.append(importBtn, exportBtn, cancel, save);
  modal.appendChild(actions);

  const close = () => overlay.remove();
  cancel.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  save.addEventListener("click", () => {
    saveSettings(s);
    onSave(s);
    close();
  });

  document.body.appendChild(overlay);
}
