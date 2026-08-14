// Klickrr - Edit — app bootstrap. Owns the single EditorView, the TabManager,
// the sidebar (Directory/Cliptext/Functions), the column ruler, the output pane,
// the hex viewer, and the native macOS menu that drives every command.

import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  openSearchPanel,
  findNext,
  findPrevious,
  gotoLine,
  getSearchQuery,
  setSearchQuery,
  SearchQuery,
} from "@codemirror/search";
import { undo, redo } from "@codemirror/commands";
import { foldAll, unfoldAll, foldEffect, matchBrackets } from "@codemirror/language";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Toolbar } from "./toolbar";
import type { TbItem } from "./toolbar";
import { openEditorSettings } from "./settings";
import { editorConfigEffects, editorSettingsEffects } from "./editor";
import { applyAppearance, loadSettings, saveSettings } from "./settings";
import { IntegratedTerminal } from "./terminal";
import { promptText } from "./prompt";
import {
  makeState,
  cursorPosition,
  languageCompartment,
  toggleWrap,
} from "./editor";
import { languageForFilename, openCustomLanguages } from "./languages";
import { TabManager } from "./tabs";
import type { TabData } from "./tabs";
import { Sidebar } from "./sidebar";
import { Ruler } from "./ruler";
import { OutputPane } from "./output";
import { HexView } from "./hexview";
import { setupAppMenu, refreshAppMenu, setAcceleratorsSuspended } from "./appmenu";
import type { AppMenuActions, AppMenuState } from "./appmenu";
import { openKeymapConfig } from "./keymap";
import { cancelTool, runToolStreaming, openToolsConfig, needsFile, loadTools } from "./tools";
import type { UserTool, ToolContext } from "./tools";
import {
  pickOpenPath,
  pickSavePath,
  readFile,
  readFileBytes,
  writeFileBytes,
  writeFile,
  statFile,
  createDir,
  renamePath,
  duplicatePath,
  undoReplaceFiles,
  takeOpenFiles,
  tailFile,
  basename,
  dirname,
  resolveEditorConfig,
} from "./fileops";
import type { LineEnding, TextEncoding } from "./fileops";
import type { EditorConfigResult } from "./fileops";
import { addRecent, clearRecents, loadSession, recentFiles, removeRecent, saveSession } from "./persistence";
import { openFindInFiles, openQuickOpen, openReplaceInFiles } from "./workspace-dialogs";
import { bookmarkPositions, deleteMarkedLines, nextBookmark, restoreBookmarks, toggleBookmark } from "./bookmarks";
import { selectSelectionMatches } from "@codemirror/search";
import { marked } from "marked";
import { openTemplates } from "./templates";
import { openProjectConfig, openProjectManager } from "./project";
import { APP_VERSION } from "./version";
import { openClipboardHistory, openCommandPalette, openExtractMatches, openGitPanel, openNotes, openRegexPlayground, openUnicodeInspector, rememberClipboard } from "./productivity";
import type { PaletteCommand } from "./productivity";

// --- DOM handles -----------------------------------------------------------
const host = document.getElementById("editor-host")!;
const tabbarEl = document.getElementById("tabbar")!;
const sidebarEl = document.getElementById("sidebar")!;
const sidebarSplitter = document.getElementById("sidebar-splitter")!;
const rulerEl = document.getElementById("ruler")!;
const hexEl = document.getElementById("hexview")!;
const statusPos = document.getElementById("status-pos")!;
const statusLang = document.getElementById("status-lang")!;
const statusPath = document.getElementById("status-path")!;
const statusFormat = document.getElementById("status-format")!;
const statusZoom = document.getElementById("status-zoom")!;
const previewPane = document.getElementById("preview-pane")!;
const previewFrame = document.getElementById("preview-frame") as HTMLIFrameElement;

// True while we programmatically swap a tab's state, so the resulting update
// isn't mistaken for a user edit that would flag the tab dirty.
let switching = false;
let wrapOn = false;
let hexOn = false;
let splitOn = false, splitVertical = true, syncSplitScroll = false, syncingSplit = false;
let minimapOn = false;
const SIDEBAR_LINK_KEY = "klickrr.sidebarLinked";
let sidebarLinked = localStorage.getItem(SIDEBAR_LINK_KEY) !== "false";
let splitView: EditorView | undefined;
let recordingMacro = false, replayingMacro = false, macroPrevious = "";
let macroSteps: { from: number; to: number; insert: string }[] = [];
let lastRepeatable: (() => void) | undefined;
function repeatable(run: () => void): void { lastRepeatable = run; run(); }

const editorCallbacks = {
  onChange: () => {
    if (switching) return;
    recordMacroChange();
    const tab = tabs.active;
    if (tab?.preview) { tab.preview = false; tabs.render(); }
    if (tab && !tab.dirty) {
      tab.dirty = true;
      tabs.render();
    }
    scheduleOutlineRefresh();
    scheduleSessionSave();
    schedulePreview();
    if (splitOn && splitView && !syncingSplit && splitView.state.doc.toString() !== view.state.doc.toString()) {
      syncingSplit = true; splitView.dispatch({ changes: { from: 0, to: splitView.state.doc.length, insert: view.state.doc.toString() } }); syncingSplit = false;
    }
    renderMinimap();
  },
  onCursor: (v: EditorView) => updateStatus(v),
};

function recordMacroChange(): void {
  const current = view.state.doc.toString();
  if (recordingMacro && !replayingMacro) { let from = 0; while (from < macroPrevious.length && from < current.length && macroPrevious[from] === current[from]) from++;
    let oldEnd = macroPrevious.length, newEnd = current.length; while (oldEnd > from && newEnd > from && macroPrevious[oldEnd - 1] === current[newEnd - 1]) { oldEnd--; newEnd--; }
    macroSteps.push({ from, to: oldEnd, insert: current.slice(from, newEnd) }); }
  macroPrevious = current;
}
async function toggleMacroRecording(): Promise<void> {
  if (!recordingMacro) { recordingMacro = true; macroSteps = []; macroPrevious = view.state.doc.toString(); output.info("Macro recording started."); }
  else { recordingMacro = false; const name = await promptText("Save Macro", { value: "Last Macro" }); if (name) { const all = JSON.parse(localStorage.getItem("klickrr.macros.v1") ?? "{}"); all[name] = macroSteps; localStorage.setItem("klickrr.macros.v1", JSON.stringify(all)); output.info(`Saved macro “${name}”.`); } }
  void refreshAppMenu();
}
function replayMacro(name?: string): void {
  if (replayingMacro) { output.info("Recursive macro replay is blocked."); return; }
  const all = JSON.parse(localStorage.getItem("klickrr.macros.v1") ?? "{}"); const keys = Object.keys(all); const key = name ?? keys[keys.length - 1]; const steps = key ? all[key] as typeof macroSteps : macroSteps; if (!steps?.length) { output.info("No recorded macro to replay."); return; }
  replayingMacro = true; try { for (const step of steps) view.dispatch({ changes: { from: Math.min(step.from, view.state.doc.length), to: Math.min(step.to, view.state.doc.length), insert: step.insert } }); } finally { replayingMacro = false; }
}

const view = new EditorView({ parent: host });
const splitHost = document.getElementById("split-host")!;
const minimap = document.getElementById("minimap") as HTMLCanvasElement;
function renderMinimap(): void { if (!minimapOn) return; const rect = minimap.getBoundingClientRect(); minimap.width = Math.max(1, Math.floor(rect.width * devicePixelRatio)); minimap.height = Math.max(1, Math.floor(rect.height * devicePixelRatio)); const ctx = minimap.getContext("2d")!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = document.documentElement.dataset.theme === "dark" ? "#79818d" : "#7a8a9a"; const lines = view.state.doc.toString().split("\n"); const h = rect.height / Math.max(1, lines.length); lines.forEach((line, i) => { const width = Math.min(rect.width - 4, line.trim().length * 1.1); if (width) ctx.fillRect(2, i * h, width, Math.max(.5, h * .55)); }); }
minimap.addEventListener("click", (e) => { const ratio = e.offsetY / minimap.clientHeight; jumpToLine(Math.max(1, Math.round(ratio * view.state.doc.lines))); });
function toggleMinimap(): void { minimapOn = !minimapOn; minimap.classList.toggle("hidden", !minimapOn); document.getElementById("editor-area")!.classList.toggle("with-minimap", minimapOn); renderMinimap(); void refreshAppMenu(); }
const ruler = new Ruler(rulerEl, view);
const hexView = new HexView(hexEl);

const tabs = new TabManager(tabbarEl, {
  onSelect: (id) => switchTo(id),
  onClose: (id) => void closeTab(id),
  onPin: (id) => { tabs.togglePin(id); scheduleSessionSave(); },
});

const sidebar = new Sidebar(sidebarEl, {
  openFile: (path) => void openPath(path),
  insertSnippet: (text) => {
    const selected = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    const tab = tabs.active; insertAtCursor(text.split("${selection}").join(selected).split("${date}").join(new Date().toISOString().slice(0, 10))
      .split("${filename}").join(tab?.title ?? "").split("${project}").join(sidebar.getRoot()));
  },
  jumpToLine: (line) => jumpToLine(line),
  reveal: (path) => void revealItemInDir(path),
  trash: async (path, isDir, name) => {
    const ok = await confirm(`Move "${name}" to the Trash?`, {
      title: isDir ? "Delete folder" : "Delete file",
      kind: "warning",
    });
    if (!ok) return false;
    try {
      await invoke("move_to_trash", { path });
      // Close any open tab for a trashed file.
      const tab = tabs.tabs.find((t) => t.path === path);
      if (tab) tabs.remove(tab.id);
      if (tabs.tabs.length === 0) newTab();
      else mountActive();
      return true;
    } catch (e) {
      output.info("Delete failed: " + String(e));
      return false;
    }
  },
  createFile: async (dirPath) => {
    const name = await promptText("New File", {
      label: `In ${dirPath}`,
      placeholder: "filename.txt",
    });
    if (!name) return false;
    const path = `${dirPath}/${name}`;
    try {
      await invoke("create_file", { path });
      await openPath(path);
      return true;
    } catch (e) {
      output.info("Create file failed: " + String(e));
      return false;
    }
  },
  createFolder: async (dirPath) => {
    const name = await promptText("New Folder", { label: `In ${dirPath}`, placeholder: "folder name" });
    if (!name) return false;
    try { await createDir(`${dirPath}/${name}`); return true; }
    catch (e) { output.info(String(e)); return false; }
  },
  rename: async (path, _isDir, name) => {
    const newName = await promptText("Rename", { label: "New name", value: name });
    if (!newName || newName === name) return false;
    const newPath = `${dirname(path)}/${newName}`;
    try { await renamePath(path, newPath); const tab = tabs.tabs.find((t) => t.path === path);
      if (tab) { tab.path = newPath; tab.title = newName; tabs.render(); } return true; }
    catch (e) { output.info(String(e)); return false; }
  },
  duplicate: async (path, name) => {
    const dot = name.lastIndexOf("."); const suggested = dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
    const newName = await promptText("Duplicate", { label: "Copy name", value: suggested }); if (!newName) return false;
    try { await duplicatePath(path, `${dirname(path)}/${newName}`); return true; }
    catch (e) { output.info(String(e)); return false; }
  },
  move: async (path, name) => {
    const target = await promptText("Move", { label: "Destination path", value: `${sidebar.getRoot()}/${name}` }); if (!target || target === path) return false;
    try { await renamePath(path, target); const tab = tabs.tabs.find((t) => t.path === path);
      if (tab) { tab.path = target; tab.title = basename(target); tabs.render(); } return true; }
    catch (e) { output.info(String(e)); return false; }
  },
  copyPath: (path, relative) => {
    const value = relative ? path.replace(sidebar.getRoot().replace(/\/$/, "") + "/", "") : path;
    void navigator.clipboard.writeText(value);
  },
});

const output = new OutputPane(document.getElementById("output")!, () => ruler.sync(),
  (path, line, column) => void openPath(path).then(() => jumpToPosition(line, column)));

// --- status bar & outline --------------------------------------------------
function activeLangLabel(): string {
  const tab = tabs.active;
  return languageForFilename(tab?.path ?? tab?.title ?? null).label;
}

function updateStatus(v: EditorView): void {
  const { line, col } = cursorPosition(v);
  statusPos.textContent = `Ln ${line}, Col ${col}`;
  statusLang.textContent = activeLangLabel();
  statusPath.textContent = tabs.active?.path ?? "";
  const tab = tabs.active;
  statusFormat.textContent = tab ? `${tab.encoding.toUpperCase()} · ${tab.lineEnding.toUpperCase()}${tab.large ? " · LARGE FILE (READ-ONLY)" : ""}${tab.logWatch ? ` · FOLLOWING${tab.logTruncated ? " (TAIL)" : ""}` : ""}` : "";
}

let outlineTimer: number | undefined;
function refreshOutlineNow(): void {
  sidebar.refreshFunctions(view.state.doc.toString(), activeLangLabel());
}
function scheduleOutlineRefresh(): void {
  window.clearTimeout(outlineTimer);
  outlineTimer = window.setTimeout(refreshOutlineNow, 300);
  if (hexOn) void renderHex();
}

// --- editor helpers --------------------------------------------------------
function insertAtCursor(text: string): void {
  const marker = text.search(/\$(?:0|\d+)/); const clean = text.replace(/\$(?:0|\d+)/g, "");
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: clean },
    selection: EditorSelection.cursor(from + (marker >= 0 ? marker : clean.length)),
  });
  view.focus();
}

/** Wrap the selection in open/close (HTML menu). With no selection and a close
 *  tag, the caret lands between the tags. */
function wrapSelection(open: string, close = ""): void {
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const insert = open + selected + close;
  const selection =
    !selected && close
      ? EditorSelection.cursor(sel.from + open.length)
      : EditorSelection.cursor(sel.from + insert.length);
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert }, selection });
  view.focus();
}

function jumpToLine(line: number): void {
  const clamped = Math.max(1, Math.min(line, view.state.doc.lines));
  const info = view.state.doc.line(clamped);
  view.dispatch({
    selection: EditorSelection.cursor(info.from),
    scrollIntoView: true,
  });
  view.focus();
}
function jumpToPosition(line: number, column = 1): void {
  rememberLocation();
  const info = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
  const pos = Math.min(info.to, info.from + Math.max(0, column - 1));
  view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true }); view.focus();
}

const locationBack: { tab: number; pos: number }[] = [];
const locationForward: { tab: number; pos: number }[] = [];
function rememberLocation(): void {
  if (tabs.activeId != null) locationBack.push({ tab: tabs.activeId, pos: view.state.selection.main.head });
  if (locationBack.length > 100) locationBack.shift(); locationForward.length = 0;
}
function navigateLocation(back: boolean): void {
  const source = back ? locationBack : locationForward, target = back ? locationForward : locationBack;
  const next = source.pop(); if (!next || tabs.activeId == null) return;
  target.push({ tab: tabs.activeId, pos: view.state.selection.main.head }); switchTo(next.tab);
  view.dispatch({ selection: EditorSelection.cursor(Math.min(next.pos, view.state.doc.length)), scrollIntoView: true });
}
async function gotoColumn(): Promise<void> {
  const value = await promptText("Go to Column", { value: String(cursorPosition(view).col) }); const column = Number(value); if (!column) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head); rememberLocation();
  view.dispatch({ selection: EditorSelection.cursor(Math.min(line.to, line.from + column - 1)), scrollIntoView: true }); view.focus();
}
async function gotoByteOffset(): Promise<void> {
  const value = await promptText("Go to Byte Offset", { value: "0" }); const wanted = Number(value); if (!Number.isFinite(wanted) || wanted < 0) return;
  const text = view.state.doc.toString(); let pos = 0, bytes = 0;
  for (const ch of text) { const size = new TextEncoder().encode(ch).length; if (bytes + size > wanted) break; bytes += size; pos += ch.length; }
  rememberLocation(); view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true }); view.focus();
}
function jumpMatchingPair(): void {
  const pos = view.state.selection.main.head;
  for (const at of [pos, Math.max(0, pos - 1)]) {
    const match = matchBrackets(view.state, at, 1) ?? matchBrackets(view.state, at, -1);
    if (match?.end) { rememberLocation(); const target = at <= match.start.to ? match.end.from : match.start.from;
      view.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true }); return; }
  }
  const text = view.state.doc.toString(); const tagRe = /<\/?([A-Za-z][\w:-]*)\b[^>]*>/g; const tags: { from: number; to: number; name: string; close: boolean; self: boolean }[] = [];
  let m: RegExpExecArray | null; while ((m = tagRe.exec(text))) tags.push({ from: m.index, to: tagRe.lastIndex, name: m[1].toLowerCase(), close: m[0][1] === "/", self: /\/\s*>$/.test(m[0]) });
  const current = tags.find((t) => pos >= t.from && pos <= t.to) ?? [...tags].reverse().find((t) => t.to <= pos); if (!current || current.self) return;
  const index = tags.indexOf(current); let depth = 0;
  const scan = current.close ? tags.slice(0, index).reverse() : tags.slice(index + 1);
  for (const tag of scan) { if (tag.name !== current.name || tag.self) continue;
    if (tag.close === current.close) depth++; else if (depth-- === 0) { rememberLocation(); view.dispatch({ selection: EditorSelection.cursor(tag.from), scrollIntoView: true }); return; }
  }
}
function openGotoLineOnce(): void {
  const inputs = [...view.dom.querySelectorAll<HTMLInputElement>('.cm-dialog input[name="line"]')];
  if (inputs.length) {
    // Older invocations may already have stacked dialogs. Close every duplicate
    // through CodeMirror's own close button so its dialog state stays in sync.
    for (const duplicate of inputs.slice(1)) duplicate.closest(".cm-dialog")?.querySelector<HTMLButtonElement>(".cm-dialog-close")?.click();
    inputs[0].focus(); inputs[0].select(); return;
  }
  gotoLine(view);
}
function foldSelection(): void {
  const sel = view.state.selection.main;
  if (sel.empty) { output.info("Select the lines to fold first."); return; }
  view.dispatch({ effects: foldEffect.of({ from: sel.from, to: sel.to }) });
}

/** Find Next/Previous work off the search panel's query. If the user never
 *  opened the panel there is no query yet, so seed one from the selection (or
 *  the word under the cursor) instead of silently doing nothing. */
function ensureSearchQuery(): boolean {
  if (getSearchQuery(view.state).search) return true;
  const sel = view.state.selection.main;
  const range = sel.empty ? view.state.wordAt(sel.head) : sel;
  const term = range ? view.state.sliceDoc(range.from, range.to) : "";
  if (!term) { view.focus(); openSearchPanel(view); return false; }
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: term })) });
  return true;
}

/** Open the search panel with the caret in the replace field, so "Replace…"
 *  actually lands somewhere different from "Find…". */
function openReplacePanel(): void {
  view.focus();
  openSearchPanel(view);
  const focusReplace = () => {
    const input = view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]');
    if (input) { input.focus(); input.select(); }
  };
  focusReplace();
  requestAnimationFrame(focusReplace);
}

function selectAllOccurrences(): void {
  const sel = view.state.selection.main;
  if (sel.empty) {
    const word = view.state.wordAt(sel.head);
    if (!word) { output.info("Put the cursor in a word (or select text) first."); return; }
    view.dispatch({ selection: EditorSelection.range(word.from, word.to) });
  }
  selectSelectionMatches(view);
  view.focus();
}

// --- clipboard (toolbar buttons; the menu uses native predefined items) ----
async function copySelection(): Promise<void> {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  if (text) await navigator.clipboard.writeText(text);
  rememberClipboard(text);
  view.focus();
}

async function cutSelection(): Promise<void> {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  if (text) {
    await navigator.clipboard.writeText(text);
    rememberClipboard(text);
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: "" } });
  }
  view.focus();
}

async function pasteClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { rememberClipboard(text); insertAtCursor(text); }
  } catch {
    output.info("Paste failed: clipboard read was blocked.");
  }
}

function deleteSelection(): void {
  const sel = view.state.selection.main;
  if (sel.from !== sel.to) {
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: "" } });
  }
  view.focus();
}

/** Open the current (saved) file in the default web browser. */
async function previewInBrowser(): Promise<void> {
  const tab = tabs.active;
  if (!tab?.path) {
    output.info("Save the file first to preview it in a browser.");
    return;
  }
  if (tab.dirty) await saveActive();
  try {
    await openUrl("file://" + encodeURI(tab.path));
  } catch (e) {
    output.info("Preview failed: " + String(e));
  }
}

let previewOn = false, previewTimer: number | undefined;
function renderIntegratedPreview(): void {
  if (!previewOn) return; const tab = tabs.active; if (!tab) return; const text = view.state.doc.toString();
  const lang = activeLangLabel(); const body = lang === "Markdown" ? marked.parse(text) : text;
  const isHtml = lang === "HTML" || lang === "XML";
  previewFrame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'"><style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:16px;line-height:1.5;color:#222}pre,code{font-family:Menlo,monospace}img{max-width:100%}</style>${isHtml ? body : `<article>${body}</article>`}`;
}
function schedulePreview(): void { window.clearTimeout(previewTimer); previewTimer = window.setTimeout(renderIntegratedPreview, 250); }
function toggleIntegratedPreview(): void { previewOn = !previewOn; previewPane.classList.toggle("hidden", !previewOn); document.getElementById("editor-area")!.classList.toggle("previewing", previewOn); if (previewOn) renderIntegratedPreview(); ruler.sync(); void refreshAppMenu(); }
document.getElementById("preview-close")?.addEventListener("click", () => { if (previewOn) toggleIntegratedPreview(); });

/** Reveal the sidebar and switch it to a pane (toolbar panel buttons). */
function showSidebarPane(name: "directory" | "cliptext" | "functions"): void {
  sidebarEl.classList.remove("collapsed");
  ruler.sync();
  sidebar.showPane(name);
}

const savedSidebarWidth = Number(localStorage.getItem("klickrr.sidebarWidth"));
if (savedSidebarWidth) sidebarEl.style.setProperty("--sidebar-width", `${savedSidebarWidth}px`);
let resizingSidebar = false;
function setSidebarWidth(clientX: number): void {
  const mainLeft = document.getElementById("main")!.getBoundingClientRect().left;
  const width = Math.max(150, Math.min(600, clientX - mainLeft));
  sidebarEl.style.setProperty("--sidebar-width", `${width}px`); localStorage.setItem("klickrr.sidebarWidth", String(width)); ruler.sync();
}
sidebarSplitter.addEventListener("pointerdown", (event) => { resizingSidebar = true; sidebarSplitter.setPointerCapture(event.pointerId); document.body.classList.add("resizing-sidebar"); });
sidebarSplitter.addEventListener("pointermove", (event) => { if (resizingSidebar) setSidebarWidth(event.clientX); });
sidebarSplitter.addEventListener("pointerup", (event) => { resizingSidebar = false; sidebarSplitter.releasePointerCapture(event.pointerId); document.body.classList.remove("resizing-sidebar"); });
sidebarSplitter.addEventListener("dblclick", () => { sidebarEl.style.setProperty("--sidebar-width", "250px"); localStorage.setItem("klickrr.sidebarWidth", "250"); ruler.sync(); });
sidebarSplitter.addEventListener("keydown", (event) => { const width = sidebarEl.getBoundingClientRect().width; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSidebarWidth(sidebarEl.getBoundingClientRect().left + width + (event.key === "ArrowLeft" ? -10 : 10)); } });

// --- color picker (HTML toolbar) -------------------------------------------
const colorInput = document.getElementById("color-input") as HTMLInputElement;
let colorCallback: ((hex: string) => void) | null = null;
colorInput.addEventListener("input", () => {
  if (colorCallback) colorCallback(colorInput.value);
  colorCallback = null;
});
function pickColor(onPick: (hex: string) => void): void {
  colorCallback = onPick;
  colorInput.value = "#ff0000";
  colorInput.click();
}

// --- editor settings -------------------------------------------------------
function applyEditorSettings(): void {
  const s = loadSettings();
  applyAppearance(s);
  snapshotActive();
  for (const tab of tabs.tabs) tab.state = tab.state.update({ effects: editorSettingsEffects(s, tab.state.doc.toString(), tab.path) }).state;
  mountActive();
  statusZoom.textContent = s.zoom === 100 ? "" : `${s.zoom}%`;
  remeasureFont();
}

// --- integrated terminal ---------------------------------------------------
const terminalPanel = document.getElementById("terminal-panel")!;
const terminalHost = document.getElementById("terminal-host")!;
let terminal: IntegratedTerminal | undefined;

function terminalVisible(): boolean {
  return !terminalPanel.classList.contains("hidden");
}

function openTerminal(cwd?: string): void {
  terminalPanel.classList.remove("hidden");
  ruler.sync();
  if (!terminal) terminal = new IntegratedTerminal(terminalHost);
  void terminal.start(cwd);
}

function toggleTerminal(): void {
  if (terminalVisible()) {
    terminalPanel.classList.add("hidden");
    ruler.sync();
    view.focus();
  } else {
    openTerminal();
  }
  refreshToolbars();
}

/** Tools → Terminal Here: open the integrated terminal in the active file's dir. */
function terminalHere(): void {
  const path = tabs.active?.path;
  openTerminal(path ? dirname(path) : undefined);
}

document.getElementById("terminal-close")?.addEventListener("click", () => {
  terminalPanel.classList.add("hidden");
  ruler.sync();
  refreshToolbars();
  view.focus();
});

// --- user tools (Tools menu) ----------------------------------------------
function toolContext(): ToolContext {
  const { line, col } = cursorPosition(view);
  const sel = view.state.selection.main;
  return { path: tabs.active?.path ?? null, line, col, selection: view.state.sliceDoc(sel.from, sel.to), document: view.state.doc.toString(), projectRoot: sidebar.getRoot() };
}

async function runUserTool(tool: UserTool): Promise<void> {
  const ctx = toolContext();
  if (needsFile(tool.command) && !ctx.path) {
    output.info(`"${tool.name}": save the file first (its command uses a file macro).`);
    return;
  }
  if (ctx.path && tabs.active?.dirty) await saveActive();
  output.info(`Running: ${tool.name}`);
  try {
    const res = await runToolStreaming(tool, ctx, (stream, data) => output.stream(data, stream === "stderr"),
      (id) => output.beginStream(tool.name, () => void cancelTool(id)));
    const combined = [res.stdout, res.stderr].filter(Boolean).join(res.stdout && res.stderr ? "\n" : "");
    if (tool.output === "newDocument") newTab(combined, null, true);
    else if (tool.output === "replaceSelection") { const sel = view.state.selection.main; view.dispatch({ changes: { from: sel.from, to: sel.to, insert: combined } }); }
    else output.endStream(res.code);
  } catch (e) {
    output.report(tool.name, "", String(e), -1);
  }
}

// --- hex viewer ------------------------------------------------------------
async function renderHex(): Promise<void> {
  // Reloading would silently throw away pending byte edits (Save Hex Edits /
  // Undo Hex Edit still need them), so leave an edited dump alone.
  if (hexView.hasEdits) return;
  const tab = tabs.active;
  if (tab?.path && !tab.dirty) {
    const fb = await readFileBytes(tab.path, 262144);
    const note = fb.truncated
      ? `… showing first ${fb.bytes.length} of ${fb.total} bytes`
      : "";
    hexView.render(fb.bytes, note);
  } else {
    const bytes = Array.from(new TextEncoder().encode(view.state.doc.toString()));
    hexView.render(bytes);
  }
}

async function toggleHex(): Promise<void> {
  hexOn = !hexOn;
  if (hexOn) {
    await renderHex();
    hexView.show();
    rulerEl.style.display = "none";
    host.style.display = "none";
  } else {
    hexView.hide();
    rulerEl.style.display = "";
    host.style.display = "";
    view.focus();
  }
}
async function searchHex(): Promise<void> { if (!hexOn) await toggleHex(); const q = await promptText("Search Hex", { label: "Text or space-separated bytes (e.g. 48 65 6c 6c 6f)" }); if (!q) return; const at = hexView.search(q); output.info(at >= 0 ? `Hex match at 0x${at.toString(16).padStart(8, "0")}` : "No hex match found."); }
async function configureHexRows(): Promise<void> {
  const value = await promptText("Hex Bytes per Row", { label: "Bytes per row (4–64)", value: String(hexView.bytesPerRowValue) });
  if (value == null || value === "") return;
  const n = Number(value);
  if (!Number.isFinite(n)) { output.info("Enter a number between 4 and 64."); return; }
  hexView.setBytesPerRow(n);
}
async function editHexByte(): Promise<void> {
  if (!hexOn) await toggleHex();
  const offsetText = await promptText("Edit Hex Byte", { label: "Offset (decimal or 0xhex)", value: "0x0" });
  if (!offsetText) return;
  const valueText = await promptText("Edit Hex Byte", { label: "New byte (two hex digits)", value: "00" });
  if (!valueText) return;
  const offset = Number(offsetText.trim());
  const value = /^[0-9a-f]{1,2}$/i.test(valueText.trim()) ? Number.parseInt(valueText.trim(), 16) : NaN;
  if (!hexView.editByte(offset, value)) { output.info(`Invalid offset or byte value (offset must be 0–${Math.max(0, hexView.editedBytes().length - 1)}, byte 00–FF).`); return; }
  output.info(`Set byte 0x${offset.toString(16)} to 0x${value.toString(16).padStart(2, "0")}. Use Save Hex Edits… to write it to disk.`);
}
async function saveHexEdits(): Promise<void> { const tab = tabs.active;
  if (!tab?.path) { output.info("Save the file to disk before writing hex edits."); return; }
  if (!hexView.hasEdits) { output.info("No hex edits to save — use Edit Hex Byte… first."); return; }
  if (!(await confirm(`Overwrite “${tab.title}” with the edited bytes? A .bak backup will be created.`, { title: "Save Hex Edits", kind: "warning" }))) return; try { await writeFileBytes(tab.path, hexView.editedBytes(), true); hexView.markSaved(); await revertActive(); } catch (e) { output.info(String(e)); } }

function toggleSidebar(): void {
  sidebarEl.classList.toggle("collapsed");
  ruler.sync();
  scheduleSessionSave();
}

function syncSidebarToActive(): void {
  const path = tabs.active?.path;
  if (sidebarLinked && path) void sidebar.revealPath(path);
}

function toggleSidebarLink(): void {
  sidebarLinked = !sidebarLinked;
  localStorage.setItem(SIDEBAR_LINK_KEY, String(sidebarLinked));
  if (sidebarLinked) syncSidebarToActive();
  void refreshAppMenu();
}

function ensureSplitView(): EditorView {
  if (!splitView) {
    splitView = new EditorView({ state: makeState(view.state.doc.toString(), tabs.active?.path ?? null, {
      onChange: () => { if (syncingSplit || !splitView) return; syncingSplit = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: splitView.state.doc.toString() } }); syncingSplit = false; },
      onCursor: () => {},
    }), parent: splitHost });
    splitView.scrollDOM.addEventListener("scroll", () => { if (syncSplitScroll && splitView) view.scrollDOM.scrollTop = splitView.scrollDOM.scrollTop; });
    view.scrollDOM.addEventListener("scroll", () => { if (syncSplitScroll && splitView) splitView.scrollDOM.scrollTop = view.scrollDOM.scrollTop; });
  }
  return splitView;
}
function toggleSplit(vertical: boolean): void {
  if (splitOn && splitVertical === vertical) { splitOn = false; splitHost.classList.add("hidden"); }
  else { splitOn = true; splitVertical = vertical; const other = ensureSplitView(); other.setState(makeState(view.state.doc.toString(), tabs.active?.path ?? null, { onChange: () => {
      if (syncingSplit || !splitView) return; syncingSplit = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: splitView.state.doc.toString() } }); syncingSplit = false;
    }, onCursor: () => {} })); splitHost.classList.remove("hidden"); }
  document.getElementById("editor-area")!.classList.toggle("split-vertical", splitOn && splitVertical);
  document.getElementById("editor-area")!.classList.toggle("split-horizontal", splitOn && !splitVertical); ruler.sync(); void refreshAppMenu();
}

let sessionTimer: number | undefined;
function scheduleSessionSave(): void {
  window.clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(() => {
    snapshotActive();
    saveSession(tabs.tabs, tabs.activeId, !sidebarEl.classList.contains("collapsed"));
  }, 500);
}

function persistSessionNow(): void {
  window.clearTimeout(sessionTimer);
  snapshotActive();
  saveSession(tabs.tabs, tabs.activeId, !sidebarEl.classList.contains("collapsed"));
}

function defaultMeta() {
  return { encoding: "utf-8" as TextEncoding, lineEnding: "lf" as LineEnding, diskModifiedMs: 0, diskSize: 0, large: false };
}

// --- tab lifecycle ---------------------------------------------------------
function mountActive(): void {
  const tab = tabs.active;
  if (!tab) return;
  switching = true;
  view.setState(tab.state);
  switching = false;
  tabs.render();
  updateStatus(view);
  ruler.sync();
  refreshOutlineNow();
  syncSidebarToActive();
  refreshToolbars();
  renderMinimap();
  if (hexOn) void renderHex();
  if (splitOn && splitView) splitView.setState(makeState(tab.state.doc.toString(), tab.path, { onChange: () => {
    if (syncingSplit || !splitView) return; syncingSplit = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: splitView.state.doc.toString() } }); syncingSplit = false;
  }, onCursor: () => {} }));
  view.focus();
}

/** Snapshot the live editor state back into the active tab before we leave it. */
function snapshotActive(): void {
  const tab = tabs.active;
  if (tab) tab.state = view.state;
}

function newTab(doc = "", path: string | null = null, dirty = false, meta = defaultMeta()): void {
  snapshotActive();
  const id = tabs.nextId();
  const tab: TabData = {
    id,
    path,
    title: path ? basename(path) : "untitled",
    state: makeState(doc, path, editorCallbacks, meta.large),
    dirty,
    ...meta,
  };
  tabs.add(tab);
  mountActive();
  scheduleSessionSave();
}

function switchTo(id: number): void {
  if (tabs.activeId === id) return;
  snapshotActive();
  tabs.activeId = id;
  mountActive();
  scheduleSessionSave();
}

type CloseChoice = "save" | "discard" | "cancel";
function closeChoice(title: string): Promise<CloseChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div"); overlay.className = "modal-overlay";
    const modal = document.createElement("div"); modal.className = "modal close-modal";
    const h = document.createElement("h2"); h.textContent = "Save changes?";
    const p = document.createElement("p"); p.textContent = `“${title}” has unsaved changes.`;
    const buttons = document.createElement("div"); buttons.className = "modal-actions";
    const finish = (v: CloseChoice) => { overlay.remove(); resolve(v); };
    for (const [label, value, cls] of [["Cancel", "cancel", ""], ["Don’t Save", "discard", "danger"], ["Save", "save", "primary"]] as const) {
      const b = document.createElement("button"); b.textContent = label; b.className = cls; b.addEventListener("click", () => finish(value)); buttons.appendChild(b);
    }
    modal.append(h, p, buttons); overlay.appendChild(modal); document.body.appendChild(overlay);
  });
}

/** Close a tab. Returns false if the user cancelled (or the save failed), so
 *  callers like Close All can stop instead of blowing past the cancel. */
async function closeTab(id: number): Promise<boolean> {
  const tab = tabs.get(id);
  if (!tab) return true;
  if (tab.dirty) {
    const choice = await closeChoice(tab.title);
    if (choice === "cancel") return false;
    if (choice === "save") {
      switchTo(tab.id);
      if (!(await saveActive())) return false;
    }
  }
  const wasActive = tabs.activeId === id;
  tabs.remove(id);
  if (tabs.tabs.length === 0) {
    newTab(); // never leave the window empty
    return true;
  }
  if (wasActive) mountActive();
  else tabs.render();
  scheduleSessionSave();
  return true;
}

async function closeAll(): Promise<void> {
  for (const id of tabs.tabs.map((t) => t.id)) {
    if (!(await closeTab(id))) return; // cancelled — leave the rest open
  }
}

function reopenClosedTab(): void {
  if (tabs.reopenClosed()) { mountActive(); scheduleSessionSave(); }
  else output.info("There are no recently closed tabs.");
}

// --- file commands ---------------------------------------------------------
/** Open (or focus, if already open) a file by absolute path. */
async function openPath(path: string, preview = false): Promise<void> {
  const existing = tabs.tabs.find((t) => t.path === path);
  if (existing) {
    switchTo(existing.id);
    return;
  }
  let file; const config: EditorConfigResult = await resolveEditorConfig(path).catch(() => ({}));
  try { file = await readFile(path); }
  catch (e) { removeRecent(path); output.info(String(e)); return; }
  addRecent(path);
  const meta = { encoding: file.encoding, lineEnding: file.line_ending, diskModifiedMs: file.modified_ms, diskSize: file.size, large: file.large };
  // Reuse a pristine untitled tab if that's all we have.
  const only = tabs.tabs.length === 1 ? tabs.tabs[0] : undefined;
  if (only && only.path === null && !only.dirty && only.state.doc.length === 0) {
    only.path = path;
    only.title = basename(path);
    only.dirty = false;
    only.preview = preview;
    only.state = makeState(file.contents, path, editorCallbacks, file.large);
    if (config.indent_style) only.state = only.state.update({ effects: editorConfigEffects(config.indent_size ?? config.tab_width ?? loadSettings().tabSize, config.indent_style === "space") }).state;
    Object.assign(only, meta);
    mountActive();
    // This is the common first-open path. Persist immediately so quitting soon
    // after opening still restores the file on the next launch.
    persistSessionNow();
    void refreshAppMenu();
    return;
  }
  newTab(file.contents, path, false, { ...meta, preview } as typeof meta & { preview: boolean });
  if (config.indent_style) view.dispatch({ effects: editorConfigEffects(config.indent_size ?? config.tab_width ?? loadSettings().tabSize, config.indent_style === "space") });
  const active = tabs.active; if (active && config.end_of_line && ["lf", "crlf", "cr"].includes(config.end_of_line)) active.lineEnding = config.end_of_line as LineEnding;
  persistSessionNow();
  void refreshAppMenu();
}

async function openFile(): Promise<void> {
  const path = await pickOpenPath();
  if (path) await openPath(path);
}

async function saveActive(): Promise<boolean> {
  const tab = tabs.active;
  if (!tab) return false;
  if (tab.large) { output.info("Large-file mode is read-only to prevent overwriting a partially loaded file."); return false; }
  if (!tab.path) {
    return saveActiveAs();
  }
  snapshotActive();
  try {
    if (tab.diskModifiedMs) {
      const disk = await statFile(tab.path);
      if ((disk.modified_ms !== tab.diskModifiedMs || disk.size !== tab.diskSize) &&
          !(await confirm(`“${tab.title}” changed on disk. Overwrite the newer disk version?`, { title: "Confirm Overwrite", kind: "warning" }))) return false;
    }
    const saved = await writeFile(tab.path, tab.state.doc.toString(), tab.encoding, tab.lineEnding, loadSettings().backupOnSave);
    tab.dirty = false; tab.diskModifiedMs = saved.modified_ms; tab.diskSize = saved.size; addRecent(tab.path);
    tabs.render(); updateStatus(view); scheduleSessionSave(); return true;
  } catch (e) { output.info(String(e)); return false; }
}

async function saveActiveAs(): Promise<boolean> {
  const tab = tabs.active;
  if (!tab) return false;
  if (tab.large) { output.info("Large-file mode is read-only; Save As is disabled for partially loaded content."); return false; }
  const path = await pickSavePath(tab.title);
  if (!path) return false;
  snapshotActive();
  let saved;
  try { saved = await writeFile(path, tab.state.doc.toString(), tab.encoding, tab.lineEnding, loadSettings().backupOnSave); }
  catch (e) { output.info(String(e)); return false; }
  tab.path = path;
  tab.title = basename(path);
  tab.dirty = false;
  tab.diskModifiedMs = saved.modified_ms; tab.diskSize = saved.size; addRecent(path);
  view.dispatch({
    effects: languageCompartment.reconfigure(languageForFilename(path).extension),
  });
  tab.state = view.state;
  tabs.render();
  updateStatus(view);
  refreshOutlineNow();
  scheduleSessionSave();
  void refreshAppMenu();
  return true;
}

/** Save every dirty tab that has a path (untitled tabs are skipped). */
async function saveAll(): Promise<void> {
  snapshotActive();
  let skipped = 0;
  for (const tab of tabs.tabs) {
    if (!tab.dirty) continue;
    if (!tab.path) {
      skipped++;
      continue;
    }
    try {
      const saved = await writeFile(tab.path, tab.state.doc.toString(), tab.encoding, tab.lineEnding, loadSettings().backupOnSave);
      tab.dirty = false; tab.diskModifiedMs = saved.modified_ms; tab.diskSize = saved.size;
    } catch (e) { output.info(String(e)); }
  }
  tabs.render();
  updateStatus(view);
  if (skipped > 0) output.info(`Save All: ${skipped} untitled file(s) skipped — use Save As.`);
  scheduleSessionSave();
}

async function revertActive(): Promise<void> {
  const tab = tabs.active; if (!tab?.path) return;
  if (tab.dirty && !(await confirm(`Discard changes and reload “${tab.title}”?`, { title: "Revert to Saved", kind: "warning" }))) return;
  const file = await readFile(tab.path);
  tab.state = makeState(file.contents, tab.path, editorCallbacks, file.large); tab.dirty = false; tab.large = file.large;
  tab.encoding = file.encoding; tab.lineEnding = file.line_ending; tab.diskModifiedMs = file.modified_ms; tab.diskSize = file.size;
  mountActive(); scheduleSessionSave();
}

async function compareWithDisk(): Promise<void> {
  const tab = tabs.active; if (!tab?.path) return; snapshotActive();
  let disk; try { disk = await readFile(tab.path, tab.encoding); } catch (e) { output.info(String(e)); return; }
  const overlay = document.createElement("div"); overlay.className = "modal-overlay";
  const modal = document.createElement("div"); modal.className = "modal compare-modal";
  const h = document.createElement("h2"); h.textContent = `Compare ${tab.title}`;
  const columns = document.createElement("div"); columns.className = "compare-columns";
  for (const [label, text] of [["Editor", tab.state.doc.toString()], ["On Disk", disk.contents]]) {
    const col = document.createElement("section"); const title = document.createElement("strong"); title.textContent = label;
    const pre = document.createElement("pre"); pre.textContent = text; col.append(title, pre); columns.appendChild(col);
  }
  const actions = document.createElement("div"); actions.className = "modal-actions"; const close = document.createElement("button"); close.textContent = "Close"; close.addEventListener("click", () => overlay.remove()); actions.appendChild(close);
  modal.append(h, columns, actions); overlay.appendChild(modal); document.body.appendChild(overlay);
}

async function duplicateActive(): Promise<void> {
  const tab = tabs.active; if (!tab) return; snapshotActive();
  newTab(tab.state.doc.toString(), null, true, { encoding: tab.encoding, lineEnding: tab.lineEnding, diskModifiedMs: 0, diskSize: 0, large: false });
}

async function renameActive(): Promise<void> {
  const tab = tabs.active; if (!tab?.path) return;
  const name = await promptText("Rename File", { label: "New filename", value: tab.title }); if (!name || name === tab.title) return;
  const newPath = `${dirname(tab.path)}/${name}`;
  try { await renamePath(tab.path, newPath); tab.path = newPath; tab.title = name; addRecent(newPath);
    view.dispatch({ effects: languageCompartment.reconfigure(languageForFilename(newPath).extension) }); tab.state = view.state;
    tabs.render(); updateStatus(view); sidebar.refreshDirectory(); scheduleSessionSave(); }
  catch (e) { output.info(String(e)); }
}

function setEncoding(encoding: TextEncoding): void { const tab = tabs.active; if (!tab) return; tab.encoding = encoding; tab.dirty = true; tabs.render(); updateStatus(view); scheduleSessionSave(); }
async function reopenWithEncoding(encoding: TextEncoding): Promise<void> {
  const tab = tabs.active; if (!tab?.path) return;
  if (tab.dirty && !(await confirm(`Discard edits and reopen “${tab.title}” as ${encoding.toUpperCase()}?`, { title: "Reopen With Encoding", kind: "warning" }))) return;
  try { const file = await readFile(tab.path, encoding); tab.state = makeState(file.contents, tab.path, editorCallbacks, file.large); tab.dirty = false; tab.large = file.large;
    tab.encoding = encoding; tab.lineEnding = file.line_ending; tab.diskModifiedMs = file.modified_ms; tab.diskSize = file.size; mountActive(); persistSessionNow(); }
  catch (e) { output.info(String(e)); }
}
function setLineEnding(lineEnding: LineEnding): void { const tab = tabs.active; if (!tab) return; tab.lineEnding = lineEnding; tab.dirty = true; tabs.render(); updateStatus(view); scheduleSessionSave(); }

function replaceDocument(transform: (text: string) => string): void {
  const text = view.state.doc.toString(), changed = transform(text); if (changed === text) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: changed } }); view.focus();
}
function transformSelection(transform: (text: string) => string): void {
  const sel = view.state.selection.main; const from = sel.empty ? view.state.doc.lineAt(sel.head).from : sel.from;
  const to = sel.empty ? view.state.doc.lineAt(sel.head).to : sel.to;
  view.dispatch({ changes: { from, to, insert: transform(view.state.sliceDoc(from, to)) } }); view.focus();
}
/** Line-oriented transform: the full lines touched by the selection, or the
 *  whole document when nothing is selected. (transformSelection falls back to
 *  the *current line*, which makes multi-line commands like Sort a no-op.) */
function transformLines(transform: (text: string) => string): void {
  const sel = view.state.selection.main;
  const from = sel.empty ? 0 : view.state.doc.lineAt(sel.from).from;
  const to = sel.empty ? view.state.doc.length : view.state.doc.lineAt(sel.to).to;
  const text = view.state.sliceDoc(from, to);
  const changed = transform(text);
  if (changed !== text) view.dispatch({ changes: { from, to, insert: changed } });
  view.focus();
}
function changeCase(mode: "upper" | "lower"): void { transformSelection((s) => mode === "upper" ? s.toUpperCase() : s.toLowerCase()); }
function trimTrailing(): void { replaceDocument((s) => s.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n")); }
function sortLines(): void { transformLines((s) => s.split("\n").sort((a, b) => a.localeCompare(b)).join("\n")); }
function uniqueLines(): void { transformLines((s) => [...new Set(s.split("\n"))].join("\n")); }
/** With a selection, join every selected line; with none, join the current
 *  line to the one below it (the usual editor behavior). */
function joinLines(): void {
  const sel = view.state.selection.main;
  if (!sel.empty) { transformLines((s) => s.replace(/[ \t]*\n[ \t]*/g, " ")); return; }
  const line = view.state.doc.lineAt(sel.head);
  if (line.number >= view.state.doc.lines) return;
  const next = view.state.doc.line(line.number + 1);
  const lead = next.text.length - next.text.trimStart().length;
  view.dispatch({
    changes: { from: line.to, to: next.from + lead, insert: next.text.trim() ? " " : "" },
    selection: EditorSelection.cursor(line.to),
  });
  view.focus();
}
function splitLines(): void { transformLines((s) => s.split("\n").flatMap((line) => {
  const out: string[] = []; let rest = line; while (rest.length > 80) { let at = rest.lastIndexOf(" ", 80); if (at < 1) at = 80; out.push(rest.slice(0, at)); rest = rest.slice(at).trimStart(); } out.push(rest); return out;
}).join("\n")); }
function tabsToSpaces(): void { const n = loadSettings().tabSize; replaceDocument((s) => s.replace(/\t/g, " ".repeat(n))); }
function spacesToTabs(): void { const n = loadSettings().tabSize; replaceDocument((s) => s.replace(new RegExp(`^ {${n}}`, "gm"), "\t")); }
function htmlEscape(): void { transformSelection((s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")); }
function htmlUnescape(): void { transformSelection((s) => s.replace(/&quot;/g, "\"").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&")); }
function urlTransform(decode: boolean): void { transformSelection((s) => { try { return decode ? decodeURIComponent(s) : encodeURIComponent(s); } catch { output.info("Invalid URL-encoded text."); return s; } }); }
function formatJson(): void { transformSelection((s) => { try { return JSON.stringify(JSON.parse(s), null, loadSettings().tabSize); } catch (e) { output.info("JSON formatting failed: " + String(e)); return s; } }); }
function formatXml(): void { transformSelection((s) => { let depth = 0; return s.replace(/>\s*</g, ">\n<").split("\n").map((line) => { const closing = /^<\//.test(line); if (closing) depth = Math.max(0, depth - 1); const out = "  ".repeat(depth) + line.trim(); if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++; return out; }).join("\n"); }); }
async function insertEntity(): Promise<void> { const value = await promptText("Insert HTML Entity", { label: "Entity name or character", value: "&copy;" }); if (value) insertAtCursor(value.startsWith("&") ? value : `&#${value.codePointAt(0)};`); }
async function generateTable(): Promise<void> { const rows = Number(await promptText("Table Generator", { label: "Rows", value: "3" })); const cols = Number(await promptText("Table Generator", { label: "Columns", value: "3" })); if (!rows || !cols) return; const lines = ["<table>"]; for (let r = 0; r < Math.min(rows, 50); r++) lines.push("  <tr>" + "<td></td>".repeat(Math.min(cols, 20)) + "</tr>"); lines.push("</table>"); insertAtCursor(lines.join("\n")); }
async function multilineRegex(): Promise<void> { const pattern = await promptText("Multiline Regular Expression", { label: "Pattern (may span lines; use \\n)" }); if (!pattern) return; let re: RegExp;
  try { re = new RegExp(pattern, "gms"); } catch (e) { output.info("Invalid regular expression: " + String(e)); return; }
  const text = view.state.doc.toString(), match = re.exec(text); if (!match) { output.info("No multiline match found."); return; }
  const replacement = await promptText("Multiline Regular Expression", { label: "Replacement using $1 groups (Cancel selects first match)", value: "" });
  if (replacement == null) { view.dispatch({ selection: EditorSelection.range(match.index, match.index + match[0].length), scrollIntoView: true }); view.focus(); return; }
  replaceDocument((source) => source.replace(re, replacement)); }

async function copyActivePath(relative = false): Promise<void> {
  const path = tabs.active?.path;
  if (!path) { output.info("Save the file first — an unsaved buffer has no path to copy."); return; }
  const value = relative ? path.replace(sidebar.getRoot().replace(/\/$/, "") + "/", "") : path;
  try { await navigator.clipboard.writeText(value); output.info(`Copied: ${value}`); }
  catch (e) { output.info("Copy failed: " + String(e)); }
}

/** Re-measure after the editor font changed: CodeMirror caches character
 *  metrics, and the ruler/minimap are drawn from them. */
function remeasureFont(): void {
  const redraw = { read: () => 0, write: () => { ruler.sync(); renderMinimap(); } };
  view.requestMeasure(redraw);
  splitView?.requestMeasure();
}

/** View → Zoom In / Zoom Out / Actual Size (delta 0 resets to 100%). */
function zoom(delta: number): void {
  const s = loadSettings();
  const next = delta === 0 ? 100 : Math.max(50, Math.min(200, s.zoom + delta));
  if (next === s.zoom) return;
  s.zoom = next;
  saveSettings(s);
  // Font size is a :root CSS variable, so no per-tab state rebuild is needed —
  // every view (including the split pane) picks it up immediately.
  applyAppearance(s);
  remeasureFont();
  statusZoom.textContent = next === 100 ? "" : `${next}%`;
}

let checkingExternal = false;
async function checkExternalChanges(): Promise<void> {
  if (checkingExternal) return; checkingExternal = true;
  try {
    for (const tab of tabs.tabs) {
      if (!tab.path || !tab.diskModifiedMs || tab.logWatch) continue;
      try {
        const stat = await statFile(tab.path); if (stat.modified_ms === tab.diskModifiedMs && stat.size === tab.diskSize) continue;
        if (!tab.dirty) { const current = tabs.activeId; switchTo(tab.id); await revertActive(); if (current && tabs.get(current)) switchTo(current); }
        else if (tabs.activeId === tab.id && await confirm(`“${tab.title}” changed on disk. Reload it and discard your edits?`, { title: "File Changed", kind: "warning" })) await revertActive();
      } catch { /* missing or temporarily inaccessible; save will still be explicit */ }
    }
  } finally { checkingExternal = false; }
}
window.addEventListener("focus", () => { void checkExternalChanges(); sidebar.refreshDirectory(); });
window.setInterval(() => void checkExternalChanges(), 5000);

async function refreshLogTab(tab: TabData): Promise<void> {
  if (!tab.path || !tab.logWatch) return;
  try { const tail = await tailFile(tab.path); if (tail.size === tab.diskSize && tab.state.doc.length) return;
    let contents = tail.contents.replace(/\r\n?/g, "\n"); if (tab.logFilter) contents = contents.split("\n").filter((line) => line.includes(tab.logFilter!)).join("\n");
    tab.state = makeState(contents, tab.path, editorCallbacks, true); tab.diskSize = tail.size; tab.logTruncated = tail.truncated;
    if (tabs.activeId === tab.id) mountActive(); }
  catch (e) { output.info("Log follow stopped: " + String(e)); tab.logWatch = false; }
}
async function toggleLogWatch(): Promise<void> {
  const tab = tabs.active; if (!tab?.path) { output.info("Save the file before following it as a log."); return; }
  tab.logWatch = !tab.logWatch;
  if (tab.logWatch) { tab.dirty = false; await refreshLogTab(tab); }
  else await revertActive();
  updateStatus(view); void refreshAppMenu();
}
window.setInterval(() => { for (const tab of tabs.tabs) if (tab.logWatch) void refreshLogTab(tab); }, 1000);
async function setLogFilter(): Promise<void> { const tab = tabs.active; if (!tab?.logWatch) { output.info("Enable Follow File as Log first."); return; } const value = await promptText("Log Filter", { label: "Show lines containing (empty clears)", value: tab.logFilter ?? "" }); tab.logFilter = value ?? ""; tab.diskSize = -1; await refreshLogTab(tab); }

/** Help → About: a real dialog rather than a line in the output pane. */
function showAbout(): void {
  const overlay = document.createElement("div"); overlay.className = "modal-overlay";
  const modal = document.createElement("div"); modal.className = "modal about-modal";
  const h = document.createElement("h2"); h.textContent = "Klickrr - Edit";
  const version = document.createElement("p"); version.className = "about-version"; version.textContent = `Version ${APP_VERSION}`;
  const blurb = document.createElement("p");
  blurb.textContent = "A lightweight text and code editor for macOS — quick to launch, small on disk, with a crisp classic color scheme.";
  const stack = document.createElement("p"); stack.className = "about-stack";
  stack.textContent = "Built with Tauri 2, Vite and CodeMirror 6.";
  const actionsRow = document.createElement("div"); actionsRow.className = "modal-actions";
  const copy = document.createElement("button"); copy.textContent = "Copy Version Info";
  copy.addEventListener("click", () => void navigator.clipboard.writeText(`Klickrr - Edit ${APP_VERSION} — Tauri 2 + CodeMirror 6 (${navigator.userAgent})`));
  const close = document.createElement("button"); close.textContent = "Close"; close.className = "primary";
  close.addEventListener("click", () => overlay.remove());
  actionsRow.append(copy, close);
  modal.append(h, version, blurb, stack, actionsRow);
  overlay.appendChild(modal);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  close.focus();
}

function printDoc(): void {
  const area = document.getElementById("print-area")!;
  area.textContent = view.state.doc.toString();
  window.print();
}

// --- native menu -----------------------------------------------------------
const actions: AppMenuActions = {
  newFile: () => newTab(),
  newFromTemplate: () => openTemplates((contents, name) => { newTab(contents, null, true); const tab = tabs.active; if (tab) { tab.title = name; tabs.render(); } }),
  open: () => void openFile(),
  save: () => void saveActive(),
  saveAs: () => void saveActiveAs(),
  saveAll: () => void saveAll(),
  revert: () => void revertActive(),
  compareWithDisk: () => void compareWithDisk(),
  duplicate: () => void duplicateActive(),
  rename: () => void renameActive(),
  openRecent: (path) => void openPath(path),
  clearRecent: () => { clearRecents(); void refreshAppMenu(); },
  print: () => printDoc(),
  closeTab: () => {
    if (tabs.activeId != null) void closeTab(tabs.activeId);
  },
  closeAll: () => void closeAll(),
  reopenClosed: () => reopenClosedTab(),
  find: () => {
    view.focus();
    openSearchPanel(view);
  },
  findNext: () => {
    if (ensureSearchQuery()) findNext(view);
    view.focus();
  },
  findPrev: () => {
    if (ensureSearchQuery()) findPrevious(view);
    view.focus();
  },
  replace: () => openReplacePanel(),
  gotoLine: () => openGotoLineOnce(),
  gotoColumn: () => void gotoColumn(),
  gotoByte: () => void gotoByteOffset(),
  matchingPair: () => jumpMatchingPair(),
  locationBack: () => navigateLocation(true),
  locationForward: () => navigateLocation(false),
  foldAll: () => { foldAll(view); view.focus(); },
  unfoldAll: () => { unfoldAll(view); view.focus(); },
  foldSelection: () => foldSelection(),
  selectAllOccurrences: () => selectAllOccurrences(),
  toggleBookmark: () => toggleBookmark(view),
  nextBookmark: () => nextBookmark(view),
  previousBookmark: () => nextBookmark(view, true),
  deleteBookmarked: () => {
    if (!bookmarkPositions(view.state).length) { output.info("No bookmarked lines to delete."); return; }
    deleteMarkedLines(view, true);
  },
  deleteUnbookmarked: () => {
    // With no bookmarks this would delete the entire document — almost never
    // what the user meant by "keep the bookmarked lines".
    if (!bookmarkPositions(view.state).length) { output.info("Set a bookmark first — with none, this would delete every line."); return; }
    deleteMarkedLines(view, false);
  },
  findInFiles: () => { snapshotActive(); openFindInFiles(sidebar.getRoot(), tabs.tabs.filter((t) => t.path).map((t) => ({ path: t.path!, contents: t.state.doc.toString() })), (path, line, col) => void openPath(path).then(() => jumpToPosition(line, col))); },
  replaceInFiles: () => openReplaceInFiles(sidebar.getRoot(), (paths) => { for (const tab of tabs.tabs) if (tab.path && paths.includes(tab.path) && !tab.dirty) { const active = tabs.activeId; void openPath(tab.path).then(() => revertActive()).finally(() => { if (active) switchTo(active); }); } }),
  undoReplaceInFiles: () => void undoReplaceFiles().then((count) => { output.info(`Restored ${count} file(s) from the last Replace in Files transaction.`); void checkExternalChanges(); }).catch((e) => output.info(String(e))),
  quickOpen: () => void openQuickOpen(sidebar.getRoot(), recentFiles(), (path) => void openPath(path, true)),
  upperCase: () => repeatable(() => changeCase("upper")),
  lowerCase: () => repeatable(() => changeCase("lower")),
  trimTrailing: () => repeatable(trimTrailing),
  sortLines: () => repeatable(sortLines),
  uniqueLines: () => repeatable(uniqueLines),
  joinLines: () => repeatable(joinLines),
  splitLines: () => repeatable(splitLines),
  pastePlain: () => void pasteClipboard(),
  htmlEscape: () => repeatable(htmlEscape),
  htmlUnescape: () => repeatable(htmlUnescape),
  urlEncode: () => repeatable(() => urlTransform(false)),
  urlDecode: () => repeatable(() => urlTransform(true)),
  formatJson: () => repeatable(formatJson),
  formatXml: () => repeatable(formatXml),
  insertEntity: () => void insertEntity(),
  generateTable: () => void generateTable(),
  multilineRegex: () => void multilineRegex(),
  tabsToSpaces: () => repeatable(tabsToSpaces),
  spacesToTabs: () => repeatable(spacesToTabs),
  setEncoding: (v) => { setEncoding(v as TextEncoding); void refreshAppMenu(); },
  reopenEncoding: (v) => void reopenWithEncoding(v as TextEncoding),
  setLineEnding: (v) => { setLineEnding(v as LineEnding); void refreshAppMenu(); },
  zoom: (delta) => zoom(delta),
  copyPath: (relative) => void copyActivePath(relative),
  toggleLogWatch: () => void toggleLogWatch(),
  setLogFilter: () => void setLogFilter(),
  togglePreview: () => toggleIntegratedPreview(),
  splitVertical: () => toggleSplit(true),
  splitHorizontal: () => toggleSplit(false),
  syncSplitScroll: () => { syncSplitScroll = !syncSplitScroll; void refreshAppMenu(); },
  toggleSidebar: () => {
    toggleSidebar();
    refreshToolbars();
  },
  toggleSidebarLink: () => toggleSidebarLink(),
  toggleOutput: () => {
    output.toggle();
    refreshToolbars();
  },
  toggleWrap: () => {
    wrapOn = toggleWrap(view);
    refreshToolbars();
    view.focus();
  },
  toggleHex: () => {
    void toggleHex().then(refreshToolbars);
  },
  searchHex: () => void searchHex(),
  configureHexRows: () => void configureHexRows(),
  editHexByte: () => void editHexByte(),
  undoHex: () => hexView.undoEdit(),
  redoHex: () => hexView.redoEdit(),
  saveHex: () => void saveHexEdits(),
  runTool: (t) => void runUserTool(t),
  configureTools: () => openToolsConfig(() => void refreshAppMenu()),
  configureKeys: () =>
    openKeymapConfig({
      suspendMenu: async () => {
        setAcceleratorsSuspended(true);
        await refreshAppMenu();
      },
      restoreMenu: async () => {
        setAcceleratorsSuspended(false);
        await refreshAppMenu();
      },
    }),
  configureSettings: () => openEditorSettings(() => applyEditorSettings()),
  configureLanguages: () => openCustomLanguages(() => { for (const tab of tabs.tabs) tab.state = makeState(tab.state.doc.toString(), tab.path, editorCallbacks, tab.large); mountActive(); }),
  configureProject: () => openProjectConfig(sidebar.getRoot()),
  projectManager: () => openProjectManager(sidebar.getRoot(), (workspace) => { if (workspace.roots[0]) void sidebar.openRoot(workspace.roots[0]); }),
  gitPanel: () => openGitPanel(sidebar.getRoot(), (args) => invoke("git_command", { root: sidebar.getRoot(), args }), (title, result) => output.report(title, result.stdout, result.stderr, result.code)),
  toggleTerminal: () => toggleTerminal(),
  terminalHere: () => terminalHere(),
  installCli: () => void invoke<string>("install_cli").then((path) => output.info(`Installed mcedit at ${path}. Add ~/.local/bin to PATH if needed. Usage: mcedit file[:line[:column]]`)).catch((e) => output.info(String(e))),
  toggleMacroRecording: () => void toggleMacroRecording(),
  replayMacro: () => replayMacro(),
  commandPalette: () => openCommandPalette(paletteCommands()),
  regexPlayground: () => { const sel = view.state.selection.main; openRegexPlayground(view.state.sliceDoc(sel.from, sel.to) || view.state.doc.toString().slice(0, 20000)); },
  clipboardHistory: () => openClipboardHistory((text) => insertAtCursor(text)),
  notes: () => openNotes(),
  unicodeInspector: () => { const sel = view.state.selection.main; const value = view.state.sliceDoc(sel.from, sel.to) || view.state.sliceDoc(sel.head, Math.min(view.state.doc.length, sel.head + 1)); openUnicodeInspector(value); },
  extractMatches: () => openExtractMatches(view.state.doc.toString(), (text) => newTab(text, null, true)),
  repeatLastCommand: () => { if (lastRepeatable) lastRepeatable(); else output.info("No repeatable transformation has been used yet."); },
  shareSelection: () => { const sel = view.state.selection.main; const text = view.state.sliceDoc(sel.from, sel.to); if (!text) { output.info("Select text to share."); return; } if (navigator.share) void navigator.share({ text }).catch(() => {}); else void navigator.clipboard.writeText(text).then(() => output.info("Sharing is unavailable; selection copied to the clipboard.")); },
  toggleMinimap: () => toggleMinimap(),
  gitStatus: () => void invoke<{stdout: string; stderr: string; code: number}>("git_command", { root: sidebar.getRoot(), args: ["status", "--short", "--branch"] }).then((r) => output.report("git status", r.stdout, r.stderr, r.code)).catch((e) => output.info(String(e))),
  gitDiff: () => { const path = tabs.active?.path; if (!path) return; void invoke<{stdout: string; stderr: string; code: number}>("git_command", { root: sidebar.getRoot(), args: ["diff", "--", path] }).then((r) => output.report("git diff", r.stdout, r.stderr, r.code)).catch((e) => output.info(String(e))); },
  newWindow: () => { new WebviewWindow(`editor-${Date.now()}`, { url: "index.html", title: "Klickrr - Edit", width: 1100, height: 720 }); },
  closeWindow: () => { persistSessionNow(); void getCurrentWindow().close(); },
  quickLook: () => { const path = tabs.active?.path; if (path) void invoke("quick_look", { path }).catch((e) => output.info(String(e))); },
  installLoginItem: () => void invoke<string>("install_login_item").then((p) => output.info(`Installed login item: ${p}`)).catch((e) => output.info(String(e))),
  installFinderAction: () => void invoke<string>("install_finder_quick_action").then((p) => output.info(`Installed Finder Quick Action: ${p}`)).catch((e) => output.info(String(e))),
  insertHtml: (open, close) => wrapSelection(open, close),
  about: () => showAbout(),
};

/** Everything the menus can do, as a flat searchable list. Built lazily so the
 *  user tools (which change) and the accelerators are always current. */
function paletteCommands(): PaletteCommand[] {
  const a = actions;
  const entries: [string, string, () => void][] = [
    ["File", "New Document", a.newFile],
    ["File", "New from Template…", a.newFromTemplate],
    ["File", "Open…", a.open],
    ["File", "Save", a.save],
    ["File", "Save As…", a.saveAs],
    ["File", "Save All", a.saveAll],
    ["File", "Revert to Saved", a.revert],
    ["File", "Compare with Disk…", a.compareWithDisk],
    ["File", "Duplicate Document", a.duplicate],
    ["File", "Rename…", a.rename],
    ["File", "Print…", a.print],
    ["File", "Close Tab", a.closeTab],
    ["File", "Close All Tabs", a.closeAll],
    ["File", "Reopen Closed Tab", a.reopenClosed],
    ["Edit", "Uppercase", a.upperCase],
    ["Edit", "Lowercase", a.lowerCase],
    ["Edit", "Trim Trailing Whitespace", a.trimTrailing],
    ["Edit", "Sort Lines", a.sortLines],
    ["Edit", "Remove Duplicate Lines", a.uniqueLines],
    ["Edit", "Join Lines", a.joinLines],
    ["Edit", "Split Lines at Column 80", a.splitLines],
    ["Edit", "Paste as Plain Text", a.pastePlain],
    ["Edit", "Clipboard History…", a.clipboardHistory],
    ["Edit", "Share Selection…", a.shareSelection],
    ["Edit", "Select All Occurrences", a.selectAllOccurrences],
    ["Edit", "Convert Tabs to Spaces", a.tabsToSpaces],
    ["Edit", "Convert Spaces to Tabs", a.spacesToTabs],
    ["Search", "Find…", a.find],
    ["Search", "Find Next", a.findNext],
    ["Search", "Find Previous", a.findPrev],
    ["Search", "Replace…", a.replace],
    ["Search", "Multiline Regex…", a.multilineRegex],
    ["Search", "Grep Playground…", a.regexPlayground],
    ["Search", "Extract Matches…", a.extractMatches],
    ["Search", "Go to Line…", a.gotoLine],
    ["Search", "Go to Column…", a.gotoColumn],
    ["Search", "Go to Byte Offset…", a.gotoByte],
    ["Search", "Jump to Matching Bracket/Tag", a.matchingPair],
    ["Search", "Previous Location", a.locationBack],
    ["Search", "Next Location", a.locationForward],
    ["Search", "Find in Files…", a.findInFiles],
    ["Search", "Replace in Files…", a.replaceInFiles],
    ["Search", "Undo Last Replace in Files", a.undoReplaceInFiles],
    ["Search", "Quick Open…", a.quickOpen],
    ["View", "Toggle Sidebar", a.toggleSidebar],
    ["View", "Link Sidebar with Editor", a.toggleSidebarLink],
    ["View", "Toggle Output Pane", a.toggleOutput],
    ["View", "Toggle Terminal", a.toggleTerminal],
    ["View", "Toggle Word Wrap", a.toggleWrap],
    ["View", "Toggle Hex View", a.toggleHex],
    ["View", "Search Hex/Text…", a.searchHex],
    ["View", "Hex Bytes per Row…", a.configureHexRows],
    ["View", "Edit Hex Byte…", a.editHexByte],
    ["View", "Undo Hex Edit", a.undoHex],
    ["View", "Redo Hex Edit", a.redoHex],
    ["View", "Save Hex Edits…", a.saveHex],
    ["View", "Toggle Integrated Preview", a.togglePreview],
    ["View", "Toggle Minimap", a.toggleMinimap],
    ["View", "Split Vertically", a.splitVertical],
    ["View", "Split Horizontally", a.splitHorizontal],
    ["View", "Synchronize Split Scrolling", a.syncSplitScroll],
    ["View", "Zoom In", () => a.zoom(10)],
    ["View", "Zoom Out", () => a.zoom(-10)],
    ["View", "Actual Size", () => a.zoom(0)],
    ["Document", "Fold All", a.foldAll],
    ["Document", "Unfold All", a.unfoldAll],
    ["Document", "Fold Selection", a.foldSelection],
    ["Document", "Toggle Bookmark", a.toggleBookmark],
    ["Document", "Next Bookmark", a.nextBookmark],
    ["Document", "Previous Bookmark", a.previousBookmark],
    ["Document", "Delete Bookmarked Lines", a.deleteBookmarked],
    ["Document", "Delete Unbookmarked Lines", a.deleteUnbookmarked],
    ["Document", "Copy File Path", () => a.copyPath(false)],
    ["Document", "Copy Relative Path", () => a.copyPath(true)],
    ["Document", "Follow File as Log", a.toggleLogWatch],
    ["Document", "Set Log Filter…", a.setLogFilter],
    ["Document", "Character Inspector…", a.unicodeInspector],
    ["HTML", "Entity Picker…", a.insertEntity],
    ["HTML", "HTML Escape", a.htmlEscape],
    ["HTML", "HTML Unescape", a.htmlUnescape],
    ["HTML", "URL Encode", a.urlEncode],
    ["HTML", "URL Decode", a.urlDecode],
    ["HTML", "Format JSON", a.formatJson],
    ["HTML", "Format XML", a.formatXml],
    ["HTML", "Table Generator…", a.generateTable],
    ["Tools", "Notes & Scratchpad…", a.notes],
    ["Tools", "Terminal Here", a.terminalHere],
    ["Tools", "Install mcedit Command…", a.installCli],
    ["Tools", "Configure User Tools…", a.configureTools],
    ["Tools", "Record Macro", a.toggleMacroRecording],
    ["Tools", "Replay Last Macro", a.replayMacro],
    ["Tools", "Repeat Last Transformation", a.repeatLastCommand],
    ["Project", "Project Workspaces…", a.projectManager],
    ["Project", "Project Configuration…", a.configureProject],
    ["Project", "Git Working Copy…", a.gitPanel],
    ["Project", "Git Status", a.gitStatus],
    ["Project", "Diff Active File", a.gitDiff],
    ["Window", "New Window", a.newWindow],
    ["Window", "Quick Look Active File", a.quickLook],
    ["Application", "Editor Settings…", a.configureSettings],
    ["Application", "Keyboard Shortcuts…", a.configureKeys],
    ["Application", "Custom Languages…", a.configureLanguages],
    ["Application", "About Klickrr - Edit", a.about],
  ];
  const commands: PaletteCommand[] = entries.map(([category, label, run]) => ({ category, label, run }));
  // User tools are dynamic, so append whatever the Tools menu currently shows.
  for (const tool of loadTools()) commands.push({ category: "User Tool", label: tool.name, run: () => a.runTool(tool) });
  return commands;
}

const getState = (): AppMenuState => ({
  sidebarVisible: !sidebarEl.classList.contains("collapsed"),
  sidebarLinked,
  outputVisible: output.visible,
  terminalVisible: terminalVisible(),
  wrapOn,
  hexOn,
  encoding: tabs.active?.encoding ?? "utf-8",
  lineEnding: tabs.active?.lineEnding ?? "lf",
  recentFiles: recentFiles(),
  logWatch: !!tabs.active?.logWatch,
  previewOn,
  splitOn,
  splitVertical,
  syncSplitScroll,
  recordingMacro,
  minimapOn,
});

// --- toolbars (compact icon rows) ------------------------------------------
let standardToolbar: Toolbar | undefined;
let htmlToolbar: Toolbar | undefined;
function refreshToolbars(): void {
  standardToolbar?.update();
  htmlToolbar?.update();
}

const standardItems: TbItem[] = [
  { title: "New (⌘N)", icon: "new", action: () => newTab() },
  { title: "Open (⌘O)", icon: "open", action: () => void openFile() },
  { title: "Save (⌘S)", icon: "save", action: () => void saveActive() },
  { title: "Save All (⌥⌘S)", icon: "saveAll", action: () => void saveAll() },
  { sep: true },
  { title: "Print (⌘P)", icon: "print", action: () => printDoc() },
  { sep: true },
  { title: "Cut (⌘X)", icon: "cut", action: () => void cutSelection() },
  { title: "Copy (⌘C)", icon: "copy", action: () => void copySelection() },
  { title: "Paste (⌘V)", icon: "paste", action: () => void pasteClipboard() },
  { title: "Delete", icon: "delete", action: () => deleteSelection() },
  { sep: true },
  { title: "Undo (⌘Z)", icon: "undo", action: () => { undo(view); view.focus(); } },
  { title: "Redo (⇧⌘Z)", icon: "redo", action: () => { redo(view); view.focus(); } },
  { sep: true },
  { title: "Find (⌘F)", icon: "find", action: () => { view.focus(); openSearchPanel(view); } },
  { title: "Replace (⌥⌘F)", icon: "replace", action: () => { view.focus(); openSearchPanel(view); } },
  { title: "Find Next (⌘G)", icon: "findNext", action: () => { findNext(view); view.focus(); } },
  { title: "Go to Line (⌘L)", icon: "goto", action: () => openGotoLineOnce() },
  { sep: true },
  { title: "Word Wrap", text: "W", textClass: "tb-box", action: () => { wrapOn = toggleWrap(view); view.focus(); }, active: () => wrapOn },
  { title: "Hex View", text: "Hx", action: () => void toggleHex(), active: () => hexOn },
  { sep: true },
  { title: "Directory", icon: "directory", action: () => showSidebarPane("directory") },
  { title: "Cliptext", icon: "cliptext", action: () => showSidebarPane("cliptext") },
  { title: "Function List", icon: "functions", action: () => showSidebarPane("functions") },
  { title: "Output Window", icon: "output", action: () => output.toggle(), active: () => output.visible },
  { title: "Terminal", icon: "terminal", action: () => toggleTerminal(), active: () => terminalVisible() },
];

const htmlItems: TbItem[] = [
  { title: "Preview in Browser", icon: "globe", action: () => void previewInBrowser() },
  { sep: true },
  { title: "Bold (⌘B)", text: "B", textClass: "tb-bold", action: () => wrapSelection("<b>", "</b>") },
  { title: "Italic (⌘I)", text: "I", textClass: "tb-italic", action: () => wrapSelection("<i>", "</i>") },
  { title: "Underline (⌘U)", text: "U", textClass: "tb-underline", action: () => wrapSelection("<u>", "</u>") },
  {
    title: "Font Color…",
    icon: "fontColor",
    action: () => pickColor((hex) => wrapSelection(`<span style="color:${hex}">`, "</span>")),
  },
  {
    title: "Insert Color…",
    icon: "colorGrid",
    action: () => pickColor((hex) => insertAtCursor(hex)),
  },
  { sep: true },
  { title: "Non-breaking Space", text: "nb", action: () => insertAtCursor("&nbsp;") },
  { title: "Line Break", text: "↵", action: () => insertAtCursor("<br>\n") },
  { title: "Paragraph", text: "¶", action: () => wrapSelection("<p>", "</p>") },
  { title: "Heading", text: "H1", action: () => wrapSelection("<h1>", "</h1>") },
  { sep: true },
  {
    title: "Image…",
    icon: "image",
    action: async () => {
      const url = await promptText("Insert Image", { label: "Image URL", placeholder: "https://…" });
      if (url) insertAtCursor(`<img src="${url}" alt="">`);
    },
  },
  {
    title: "Link…",
    icon: "link",
    action: async () => {
      const url = await promptText("Insert Link", { label: "Link URL", placeholder: "https://…" });
      if (url) wrapSelection(`<a href="${url}">`, "</a>");
    },
  },
  { title: "Horizontal Rule", icon: "hr", action: () => insertAtCursor("<hr>\n") },
  { title: "Copyright", text: "©", action: () => insertAtCursor("&copy;") },
  { sep: true },
  { title: "Table", icon: "table", action: () => insertAtCursor("<table>\n  <tr><td></td></tr>\n</table>\n") },
  { title: "Unordered List", icon: "list", action: () => wrapSelection("<ul>\n  <li>", "</li>\n</ul>") },
  { title: "Preformatted", text: "PRE", action: () => wrapSelection("<pre>", "</pre>") },
  { title: "Div", text: "div", action: () => wrapSelection("<div>", "</div>") },
  { title: "Span", text: "SP", action: () => wrapSelection("<span>", "</span>") },
  { sep: true },
  { title: "Video", icon: "video", action: () => wrapSelection('<video controls src="">', "</video>") },
  { title: "Audio", icon: "audio", action: () => wrapSelection('<audio controls src="">', "</audio>") },
];

// --- boot ------------------------------------------------------------------
standardToolbar = new Toolbar(document.getElementById("toolbar-standard")!, standardItems);
htmlToolbar = new Toolbar(document.getElementById("toolbar-html")!, htmlItems);
applyAppearance();
statusZoom.textContent = loadSettings().zoom === 100 ? "" : `${loadSettings().zoom}%`;
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyAppearance());

async function boot(): Promise<void> {
  const saved = loadSession();
  if (saved) {
    for (const item of saved.tabs) {
      const state = restoreBookmarks(makeState(item.contents, item.path, editorCallbacks, item.large), item.bookmarks ?? []);
      const max = state.doc.length;
      const selected = state.update({ selection: EditorSelection.single(Math.min(item.anchor, max), Math.min(item.head, max)) }).state;
      tabs.add({ id: tabs.nextId(), path: item.path, title: item.title, state: selected, dirty: item.dirty,
        encoding: item.encoding ?? "utf-8", lineEnding: item.lineEnding ?? "lf",
        diskModifiedMs: item.diskModifiedMs ?? 0, diskSize: item.diskSize ?? 0,
        pinned: item.pinned, preview: item.preview, large: item.large });
    }
    tabs.activeId = tabs.tabs[Math.min(saved.active, tabs.tabs.length - 1)]?.id ?? null;
    sidebarEl.classList.toggle("collapsed", !saved.sidebarVisible);
    mountActive();
  } else newTab();

  await setupAppMenu(actions, getState);
  const tauri = typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
  if (tauri) {
    const focusEditorWindow = async () => {
      const current = getCurrentWindow();
      await current.show(); await current.unminimize(); await current.setFocus();
      view.focus();
    };
    await listen<string[]>("open-files", async (event) => {
      for (const path of event.payload) await openPath(path);
      await focusEditorWindow();
    });
    const queued = await takeOpenFiles();
    for (const spec of queued) { const match = /^(.*?):(\d+)(?::(\d+))?$/.exec(spec); const path = match?.[1] ?? spec; await openPath(path); if (match) jumpToPosition(Number(match[2]), Number(match[3] ?? 1)); }
    if (queued.length) await focusEditorWindow();
  }
}

window.addEventListener("beforeunload", () => {
  persistSessionNow();
});
void boot();
