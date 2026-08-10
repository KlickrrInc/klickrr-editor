// Small, dependency-free productivity panels inspired by BBEdit. They use the
// app's existing modal styling and keep user data locally in the webview.

const CLIPBOARD_KEY = "klickrr.clipboards.v1";
const NOTES_KEY = "klickrr.notes.v1";

function panel(title: string, className = ""): { overlay: HTMLDivElement; body: HTMLDivElement; close: () => void } {
  const overlay = document.createElement("div"); overlay.className = "modal-overlay";
  const body = document.createElement("div"); body.className = `modal productivity-modal ${className}`.trim();
  const heading = document.createElement("h2"); heading.textContent = title; body.appendChild(heading); overlay.appendChild(body);
  const close = () => overlay.remove(); overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.body.appendChild(overlay); return { overlay, body, close };
}

export interface PaletteCommand { label: string; category: string; run: () => void }

export function openCommandPalette(commands: PaletteCommand[]): void {
  const ui = panel("Commands", "command-palette");
  const input = document.createElement("input"); input.placeholder = "Type a command…"; input.autofocus = true;
  const list = document.createElement("div"); list.className = "productivity-list"; ui.body.append(input, list);
  let selected = 0;
  const matches = () => { const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean); return commands.filter((c) => terms.every((t) => `${c.category} ${c.label}`.toLowerCase().includes(t))).slice(0, 60); };
  const render = () => { const items = matches(); selected = Math.min(selected, Math.max(0, items.length - 1)); list.replaceChildren(...items.map((command, index) => { const row = document.createElement("button"); row.className = `productivity-row${index === selected ? " selected" : ""}`; row.innerHTML = `<span>${escapeHtml(command.label)}</span><small>${escapeHtml(command.category)}</small>`; row.addEventListener("click", () => { ui.close(); command.run(); }); return row; })); };
  input.addEventListener("input", () => { selected = 0; render(); }); input.addEventListener("keydown", (event) => { const items = matches(); if (event.key === "ArrowDown") { selected = Math.min(items.length - 1, selected + 1); event.preventDefault(); render(); } else if (event.key === "ArrowUp") { selected = Math.max(0, selected - 1); event.preventDefault(); render(); } else if (event.key === "Enter" && items[selected]) { ui.close(); items[selected].run(); } else if (event.key === "Escape") ui.close(); });
  render(); input.focus();
}

export function openRegexPlayground(initialText: string): void {
  const ui = panel("Grep Playground", "regex-playground");
  const controls = document.createElement("div"); controls.className = "productivity-controls";
  const pattern = document.createElement("input"); pattern.placeholder = "Regular expression";
  const replacement = document.createElement("input"); replacement.placeholder = "Replacement (optional)";
  const flags = document.createElement("input"); flags.value = "gm"; flags.title = "Regular-expression flags"; flags.className = "flags-input";
  const sample = document.createElement("textarea"); sample.value = initialText; sample.placeholder = "Sample text";
  const result = document.createElement("pre"); result.className = "regex-result";
  controls.append(pattern, replacement, flags); ui.body.append(controls, sample, result);
  const update = () => { try { const re = new RegExp(pattern.value, flags.value); const found = [...sample.value.matchAll(re)]; const preview = replacement.value ? sample.value.replace(re, replacement.value) : found.map((m, i) => `${i + 1}. ${m[0]}${m.length > 1 ? `  groups: ${m.slice(1).join(" | ")}` : ""}`).join("\n"); result.textContent = `${found.length} match${found.length === 1 ? "" : "es"}\n\n${preview}`; result.classList.remove("error"); } catch (error) { result.textContent = String(error); result.classList.add("error"); } };
  for (const el of [pattern, replacement, flags, sample]) el.addEventListener("input", update); update(); pattern.focus();
}

export function openExtractMatches(source: string, create: (text: string) => void): void {
  const ui = panel("Extract Matches"); const pattern = document.createElement("input"); pattern.placeholder = "Regular expression";
  const group = document.createElement("input"); group.type = "number"; group.min = "0"; group.value = "0"; group.title = "Capture group to extract";
  const flags = document.createElement("input"); flags.value = "gmi"; flags.className = "flags-input";
  const status = document.createElement("div"); const run = document.createElement("button"); run.textContent = "Extract to New Document"; run.className = "primary";
  const controls = document.createElement("div"); controls.className = "productivity-controls"; controls.append(pattern, group, flags); ui.body.append(controls, status, run);
  const preview = () => { try { const requested = flags.value.includes("g") ? flags.value : `${flags.value}g`; const re = new RegExp(pattern.value, requested); const index = Math.max(0, Number(group.value) || 0); const values = [...source.matchAll(re)].map((m) => m[index] ?? ""); status.textContent = `${values.length} value${values.length === 1 ? "" : "s"} will be extracted.`; return values; } catch (error) { status.textContent = String(error); return null; } };
  for (const el of [pattern, group, flags]) el.addEventListener("input", preview); run.addEventListener("click", () => { const values = preview(); if (values) { create(values.join("\n")); ui.close(); } }); pattern.focus();
}

export function rememberClipboard(text: string): void {
  if (!text) return; const current = clipboardHistory(); localStorage.setItem(CLIPBOARD_KEY, JSON.stringify([text, ...current.filter((v) => v !== text)].slice(0, 40)));
}
export function clipboardHistory(): string[] { try { return JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? "[]") as string[]; } catch { return []; } }
export function openClipboardHistory(insert: (text: string) => void): void {
  const ui = panel("Clipboard History"); const list = document.createElement("div"); list.className = "productivity-list"; ui.body.appendChild(list);
  const values = clipboardHistory(); list.replaceChildren(...values.map((value) => { const row = document.createElement("button"); row.className = "productivity-row clipboard-row"; row.textContent = value.replace(/\s+/g, " ").slice(0, 180); row.title = value; row.addEventListener("click", () => { insert(value); ui.close(); }); return row; }));
  if (!values.length) list.textContent = "Clipboard history is empty. Copies made with Klickrr’s toolbar will appear here.";
}

interface Note { id: number; title: string; text: string; updated: number }
function loadNotes(): Note[] { try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]") as Note[]; } catch { return []; } }
function saveNotes(notes: Note[]): void { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }
export function openNotes(): void {
  const ui = panel("Notes & Scratchpad", "notes-panel"); let notes = loadNotes(); let active = notes[0]?.id;
  const search = document.createElement("input"); search.placeholder = "Search notes…"; const add = document.createElement("button"); add.textContent = "+ Note";
  const sidebar = document.createElement("div"); sidebar.className = "notes-list"; const title = document.createElement("input"); title.placeholder = "Note title";
  const text = document.createElement("textarea"); text.placeholder = "Notes save automatically…"; const layout = document.createElement("div"); layout.className = "notes-layout";
  const left = document.createElement("section"); left.append(search, add, sidebar); const right = document.createElement("section"); right.append(title, text); layout.append(left, right); ui.body.appendChild(layout);
  const selected = () => notes.find((n) => n.id === active); const persist = () => { const note = selected(); if (note) { note.title = title.value || "Untitled Note"; note.text = text.value; note.updated = Date.now(); saveNotes(notes); render(); } };
  const select = (id: number) => { active = id; const note = selected(); title.value = note?.title ?? ""; text.value = note?.text ?? ""; render(); };
  const render = () => { const query = search.value.toLowerCase(); sidebar.replaceChildren(...notes.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(query)).map((note) => { const row = document.createElement("button"); row.className = `productivity-row${note.id === active ? " selected" : ""}`; row.textContent = note.title || "Untitled Note"; row.addEventListener("click", () => select(note.id)); return row; })); };
  add.addEventListener("click", () => { const note = { id: Date.now(), title: "Untitled Note", text: "", updated: Date.now() }; notes.unshift(note); saveNotes(notes); select(note.id); title.focus(); title.select(); }); search.addEventListener("input", render); title.addEventListener("input", persist); text.addEventListener("input", persist);
  if (!notes.length) add.click(); else select(active!);
}

export function openUnicodeInspector(value: string): void {
  const ui = panel("Character Inspector"); const chars = Array.from(value || " "); const table = document.createElement("div"); table.className = "unicode-grid";
  for (const char of chars.slice(0, 100)) { const code = char.codePointAt(0)!; const row = document.createElement("div"); const privateUse = (code >= 0xe000 && code <= 0xf8ff) || (code >= 0xf0000 && code <= 0xffffd) || (code >= 0x100000 && code <= 0x10fffd); row.innerHTML = `<strong>${escapeHtml(char)}</strong><span>U+${code.toString(16).toUpperCase().padStart(4, "0")}</span><span>UTF-8 ${Array.from(new TextEncoder().encode(char)).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}</span>${privateUse ? "<em>Private-use character</em>" : ""}`; table.appendChild(row); }
  ui.body.appendChild(table);
}

export interface GitResult { stdout: string; stderr: string; code: number }
export function openGitPanel(root: string, run: (args: string[]) => Promise<GitResult>, report: (title: string, result: GitResult) => void): void {
  const ui = panel("Git Working Copy", "git-panel"); const status = document.createElement("pre"); status.textContent = "Loading…"; const message = document.createElement("input"); message.placeholder = "Commit message"; const buttons = document.createElement("div"); buttons.className = "modal-actions";
  async function load() { const result = await run(["status", "--short", "--branch"]); status.textContent = result.stdout || result.stderr || `Clean working tree: ${root}`; }
  const action = (label: string, args: string[], refresh = false) => { const button = document.createElement("button"); button.textContent = label; button.addEventListener("click", async () => { const result = await run(args); report(`git ${args[0]}`, result); if (refresh) await load(); }); buttons.appendChild(button); };
  action("Refresh", ["status", "--short", "--branch"], true); action("Stage All", ["add", "-A"], true); action("Unstage All", ["reset"], true); action("History", ["log", "--oneline", "--decorate", "-50"]); action("Diff", ["diff"]); action("Staged Diff", ["diff", "--cached"]);
  const commit = document.createElement("button"); commit.textContent = "Commit"; commit.className = "primary"; commit.addEventListener("click", async () => { if (!message.value.trim()) return; const result = await run(["commit", "-m", message.value.trim()]); report("git commit", result); message.value = ""; await load(); }); buttons.appendChild(commit); ui.body.append(status, message, buttons); void load();
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
