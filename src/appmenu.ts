// Native macOS menu bar (the system menu at the top of the screen), built with
// Tauri's JS menu API. This replaces the old in-window toolbar + menu bar — all
// commands now live here, the Mac-native way.
//
// The whole menu is rebuilt on state changes (toggles, tool-list edits) so
// checkmarks and the dynamic Tools list stay correct. Cheap enough to redo.

import {
  Menu,
  Submenu,
  MenuItem,
  CheckMenuItem,
  PredefinedMenuItem,
} from "@tauri-apps/api/menu";
import { loadTools } from "./tools";
import type { UserTool } from "./tools";
import { effectiveAccel } from "./keymap";
import { APP_NAME, APP_VERSION } from "./version";

// While the Keyboard Shortcuts dialog records a chord, native accelerators must
// not intercept the keys — suspend them for the duration.
let acceleratorsSuspended = false;
export function setAcceleratorsSuspended(v: boolean): void {
  acceleratorsSuspended = v;
}

/** Accelerator for a configurable command id, respecting the suspend flag. */
function accel(id: string): string | undefined {
  if (acceleratorsSuspended) return undefined;
  return effectiveAccel(id) ?? undefined;
}

export interface AppMenuActions {
  newFile: () => void;
  newFromTemplate: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  saveAll: () => void;
  revert: () => void;
  compareWithDisk: () => void;
  duplicate: () => void;
  rename: () => void;
  openRecent: (path: string) => void;
  clearRecent: () => void;
  print: () => void;
  closeTab: () => void;
  closeAll: () => void;
  reopenClosed: () => void;
  find: () => void;
  findNext: () => void;
  findPrev: () => void;
  replace: () => void;
  gotoLine: () => void;
  gotoColumn: () => void;
  gotoByte: () => void;
  matchingPair: () => void;
  locationBack: () => void;
  locationForward: () => void;
  foldAll: () => void;
  unfoldAll: () => void;
  foldSelection: () => void;
  selectAllOccurrences: () => void;
  toggleBookmark: () => void;
  nextBookmark: () => void;
  previousBookmark: () => void;
  deleteBookmarked: () => void;
  deleteUnbookmarked: () => void;
  findInFiles: () => void;
  replaceInFiles: () => void;
  undoReplaceInFiles: () => void;
  quickOpen: () => void;
  upperCase: () => void;
  lowerCase: () => void;
  trimTrailing: () => void;
  sortLines: () => void;
  uniqueLines: () => void;
  joinLines: () => void;
  splitLines: () => void;
  pastePlain: () => void;
  htmlEscape: () => void;
  htmlUnescape: () => void;
  urlEncode: () => void;
  urlDecode: () => void;
  formatJson: () => void;
  formatXml: () => void;
  insertEntity: () => void;
  generateTable: () => void;
  multilineRegex: () => void;
  tabsToSpaces: () => void;
  spacesToTabs: () => void;
  setEncoding: (value: string) => void;
  reopenEncoding: (value: string) => void;
  setLineEnding: (value: string) => void;
  zoom: (delta: number) => void;
  copyPath: (relative: boolean) => void;
  toggleLogWatch: () => void;
  setLogFilter: () => void;
  togglePreview: () => void;
  splitVertical: () => void;
  splitHorizontal: () => void;
  syncSplitScroll: () => void;
  toggleSidebar: () => void;
  toggleSidebarLink: () => void;
  toggleOutput: () => void;
  toggleWrap: () => void;
  toggleHex: () => void;
  searchHex: () => void;
  configureHexRows: () => void;
  editHexByte: () => void;
  undoHex: () => void;
  redoHex: () => void;
  saveHex: () => void;
  runTool: (tool: UserTool) => void;
  configureTools: () => void;
  configureKeys: () => void;
  configureSettings: () => void;
  configureLanguages: () => void;
  configureProject: () => void;
  projectManager: () => void;
  gitPanel: () => void;
  toggleTerminal: () => void;
  terminalHere: () => void;
  installCli: () => void;
  toggleMacroRecording: () => void;
  replayMacro: () => void;
  commandPalette: () => void;
  regexPlayground: () => void;
  clipboardHistory: () => void;
  notes: () => void;
  unicodeInspector: () => void;
  extractMatches: () => void;
  repeatLastCommand: () => void;
  shareSelection: () => void;
  toggleMinimap: () => void;
  gitStatus: () => void;
  gitDiff: () => void;
  newWindow: () => void;
  closeWindow: () => void;
  quickLook: () => void;
  installLoginItem: () => void;
  installFinderAction: () => void;
  insertHtml: (open: string, close?: string) => void;
  about: () => void;
}

export interface AppMenuState {
  sidebarVisible: boolean;
  sidebarLinked: boolean;
  outputVisible: boolean;
  terminalVisible: boolean;
  wrapOn: boolean;
  hexOn: boolean;
  encoding: string;
  lineEnding: string;
  recentFiles: string[];
  logWatch: boolean;
  previewOn: boolean;
  splitOn: boolean;
  splitVertical: boolean;
  syncSplitScroll: boolean;
  recordingMacro: boolean;
  minimapOn: boolean;
}

function isTauriEnv(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__ !== "undefined";
}

let rebuild: (() => Promise<void>) | null = null;

/** Build the native app menu and install it. No-op outside the Tauri runtime. */
export async function setupAppMenu(
  actions: AppMenuActions,
  getState: () => AppMenuState
): Promise<void> {
  if (!isTauriEnv()) return;

  const sep = () => PredefinedMenuItem.new({ item: "Separator" });

  // A CheckMenuItem whose click runs the action then rebuilds so its check flips.
  const toggle = (text: string, checked: boolean, run: () => void, id?: string) =>
    CheckMenuItem.new({
      text,
      checked,
      accelerator: id ? accel(id) : undefined,
      action: async () => {
        run();
        await rebuild?.();
      },
    });

  const htmlItem = (text: string, open: string, close = "", id?: string) =>
    MenuItem.new({
      text,
      accelerator: id ? accel(id) : undefined,
      action: () => actions.insertHtml(open, close),
    });

  rebuild = async () => {
    const st = getState();
    const recentMenu = await Submenu.new({ text: "Open Recent", items: [
      ...(await Promise.all(st.recentFiles.map((path) => MenuItem.new({ text: path, action: () => actions.openRecent(path) })))),
      await sep(), await MenuItem.new({ text: "Clear Menu", action: actions.clearRecent }),
    ] });

    const appMenu = await Submenu.new({
      text: "Klickrr - Edit",
      items: [
        await PredefinedMenuItem.new({
          item: { About: { name: APP_NAME, version: APP_VERSION } },
        }),
        await sep(),
        await MenuItem.new({
          text: "Editor Settings…",
          accelerator: accel("app.settings"),
          action: actions.configureSettings,
        }),
        await MenuItem.new({
          text: "Keyboard Shortcuts…",
          accelerator: accel("app.keys"),
          action: actions.configureKeys,
        }),
        await MenuItem.new({ text: "Custom Languages…", action: actions.configureLanguages }),
        await sep(),
        await PredefinedMenuItem.new({ item: "Services" }),
        await sep(),
        await PredefinedMenuItem.new({ item: "Hide" }),
        await PredefinedMenuItem.new({ item: "HideOthers" }),
        await PredefinedMenuItem.new({ item: "ShowAll" }),
        await sep(),
        await PredefinedMenuItem.new({ item: "Quit" }),
      ],
    });

    const fileMenu = await Submenu.new({
      text: "File",
      items: [
        await MenuItem.new({ text: "New", accelerator: accel("file.new"), action: actions.newFile }),
        await MenuItem.new({ text: "New from Template…", action: actions.newFromTemplate }),
        await MenuItem.new({ text: "Open…", accelerator: accel("file.open"), action: actions.open }),
        recentMenu,
        await sep(),
        await MenuItem.new({ text: "Save", accelerator: accel("file.save"), action: actions.save }),
        await MenuItem.new({ text: "Save As…", accelerator: accel("file.saveAs"), action: actions.saveAs }),
        await MenuItem.new({ text: "Save All", accelerator: accel("file.saveAll"), action: actions.saveAll }),
        await MenuItem.new({ text: "Revert to Saved", action: actions.revert }),
        await MenuItem.new({ text: "Compare with Disk…", action: actions.compareWithDisk }),
        await MenuItem.new({ text: "Duplicate", action: actions.duplicate }),
        await MenuItem.new({ text: "Rename…", action: actions.rename }),
        await sep(),
        await MenuItem.new({ text: "Print…", accelerator: accel("file.print"), action: actions.print }),
        await sep(),
        await MenuItem.new({ text: "Close Tab", accelerator: accel("file.closeTab"), action: actions.closeTab }),
        await MenuItem.new({ text: "Close All", accelerator: accel("file.closeAll"), action: actions.closeAll }),
        await MenuItem.new({ text: "Reopen Closed Tab", accelerator: accel("file.reopenClosed"), action: actions.reopenClosed }),
      ],
    });

    // Standard macOS Edit group — predefined items work in the editor and in any
    // focused input (search field, tool config) automatically.
    const editMenu = await Submenu.new({
      text: "Edit",
      items: [
        await PredefinedMenuItem.new({ item: "Undo" }),
        await PredefinedMenuItem.new({ item: "Redo" }),
        await sep(),
        await PredefinedMenuItem.new({ item: "Cut" }),
        await PredefinedMenuItem.new({ item: "Copy" }),
        await PredefinedMenuItem.new({ item: "Paste" }),
        await PredefinedMenuItem.new({ item: "SelectAll" }),
        await sep(),
        await MenuItem.new({ text: "Uppercase", action: actions.upperCase }),
        await MenuItem.new({ text: "Lowercase", action: actions.lowerCase }),
        await MenuItem.new({ text: "Trim Trailing Whitespace", action: actions.trimTrailing }),
        await MenuItem.new({ text: "Sort Lines", action: actions.sortLines }),
        await MenuItem.new({ text: "Remove Duplicate Lines", action: actions.uniqueLines }),
        await MenuItem.new({ text: "Join Lines", action: actions.joinLines }),
        await MenuItem.new({ text: "Split Lines at Column 80", action: actions.splitLines }),
        await MenuItem.new({ text: "Paste as Plain Text", action: actions.pastePlain }),
        await MenuItem.new({ text: "Clipboard History…", action: actions.clipboardHistory }),
        await MenuItem.new({ text: "Share Selection…", action: actions.shareSelection }),
        await MenuItem.new({ text: "Select All Occurrences", accelerator: accel("edit.selectAllOccurrences"), action: actions.selectAllOccurrences }),
        await sep(),
        await MenuItem.new({ text: "Convert Tabs to Spaces", action: actions.tabsToSpaces }),
        await MenuItem.new({ text: "Convert Spaces to Tabs", action: actions.spacesToTabs }),
      ],
    });

    const searchMenu = await Submenu.new({
      text: "Search",
      items: [
        await MenuItem.new({ text: "Find…", accelerator: accel("search.find"), action: actions.find }),
        await MenuItem.new({ text: "Find Next", accelerator: accel("search.findNext"), action: actions.findNext }),
        await MenuItem.new({ text: "Find Previous", accelerator: accel("search.findPrev"), action: actions.findPrev }),
        await MenuItem.new({ text: "Replace…", accelerator: accel("search.replace"), action: actions.replace }),
        await MenuItem.new({ text: "Multiline Regex…", action: actions.multilineRegex }),
        await MenuItem.new({ text: "Grep Playground…", action: actions.regexPlayground }),
        await MenuItem.new({ text: "Extract Matches…", action: actions.extractMatches }),
        await sep(),
        await MenuItem.new({ text: "Go to Line…", accelerator: accel("search.gotoLine"), action: actions.gotoLine }),
        await MenuItem.new({ text: "Go to Column…", action: actions.gotoColumn }),
        await MenuItem.new({ text: "Go to Byte Offset…", action: actions.gotoByte }),
        await MenuItem.new({ text: "Jump to Matching Bracket/Tag", accelerator: accel("search.matchingPair"), action: actions.matchingPair }),
        await MenuItem.new({ text: "Previous Location", accelerator: accel("search.locationBack"), action: actions.locationBack }),
        await MenuItem.new({ text: "Next Location", accelerator: accel("search.locationForward"), action: actions.locationForward }),
        await sep(),
        await MenuItem.new({ text: "Find in Files…", accelerator: accel("search.findInFiles"), action: actions.findInFiles }),
        await MenuItem.new({ text: "Replace in Files…", accelerator: accel("search.replaceInFiles"), action: actions.replaceInFiles }),
        await MenuItem.new({ text: "Undo Last Replace in Files", action: actions.undoReplaceInFiles }),
        await MenuItem.new({ text: "Quick Open…", accelerator: accel("search.quickOpen"), action: actions.quickOpen }),
      ],
    });

    const viewMenu = await Submenu.new({
      text: "View",
      items: [
        await toggle("Sidebar", st.sidebarVisible, actions.toggleSidebar, "view.sidebar"),
        await toggle("Link Sidebar with Editor", st.sidebarLinked, actions.toggleSidebarLink),
        await toggle("Output Pane", st.outputVisible, actions.toggleOutput, "view.output"),
        await toggle("Terminal", st.terminalVisible, actions.toggleTerminal, "view.terminal"),
        await sep(),
        await toggle("Word Wrap", st.wrapOn, actions.toggleWrap, "view.wrap"),
        await toggle("Hex View", st.hexOn, actions.toggleHex, "view.hex"),
        await MenuItem.new({ text: "Search Hex/Text…", action: actions.searchHex }),
        await MenuItem.new({ text: "Hex Bytes per Row…", action: actions.configureHexRows }),
        await MenuItem.new({ text: "Edit Hex Byte…", action: actions.editHexByte }),
        await MenuItem.new({ text: "Undo Hex Edit", action: actions.undoHex }),
        await MenuItem.new({ text: "Redo Hex Edit", action: actions.redoHex }),
        await MenuItem.new({ text: "Save Hex Edits…", action: actions.saveHex }),
        await toggle("Integrated Preview", st.previewOn, actions.togglePreview, "view.preview"),
        await toggle("Minimap", st.minimapOn, actions.toggleMinimap, "view.minimap"),
        await CheckMenuItem.new({ text: "Split Vertically", checked: st.splitOn && st.splitVertical, action: actions.splitVertical }),
        await CheckMenuItem.new({ text: "Split Horizontally", checked: st.splitOn && !st.splitVertical, action: actions.splitHorizontal }),
        await CheckMenuItem.new({ text: "Synchronize Split Scrolling", checked: st.syncSplitScroll, action: actions.syncSplitScroll }),
        await sep(),
        await MenuItem.new({ text: "Zoom In", accelerator: accel("view.zoomIn"), action: () => actions.zoom(10) }),
        await MenuItem.new({ text: "Zoom Out", accelerator: accel("view.zoomOut"), action: () => actions.zoom(-10) }),
        await MenuItem.new({ text: "Actual Size", accelerator: accel("view.actualSize"), action: () => actions.zoom(0) }),
      ],
    });

    const documentMenu = await Submenu.new({ text: "Document", items: [
      await Submenu.new({ text: "Folding", items: [
        await MenuItem.new({ text: "Fold All", action: actions.foldAll }),
        await MenuItem.new({ text: "Unfold All", action: actions.unfoldAll }),
        await MenuItem.new({ text: "Fold Selection", action: actions.foldSelection }),
      ] }),
      await Submenu.new({ text: "Bookmarks", items: [
        await MenuItem.new({ text: "Toggle Bookmark", accelerator: accel("document.toggleBookmark"), action: actions.toggleBookmark }),
        await MenuItem.new({ text: "Next Bookmark", accelerator: accel("document.nextBookmark"), action: actions.nextBookmark }),
        await MenuItem.new({ text: "Previous Bookmark", accelerator: accel("document.previousBookmark"), action: actions.previousBookmark }),
        await sep(),
        await MenuItem.new({ text: "Delete Bookmarked Lines", action: actions.deleteBookmarked }),
        await MenuItem.new({ text: "Delete Unbookmarked Lines", action: actions.deleteUnbookmarked }),
      ] }),
      await sep(),
      await Submenu.new({ text: "Encoding", items: await Promise.all([
        ["UTF-8", "utf-8"], ["UTF-8 with BOM", "utf-8-bom"], ["UTF-16 LE", "utf-16le"],
        ["UTF-16 BE", "utf-16be"], ["ASCII", "ascii"], ["Windows-1252", "windows-1252"],
      ].map(([text, value]) => CheckMenuItem.new({ text, checked: st.encoding === value, action: () => actions.setEncoding(value) }))) }),
      await Submenu.new({ text: "Reopen With Encoding", items: await Promise.all([
        ["UTF-8", "utf-8"], ["UTF-8 with BOM", "utf-8-bom"], ["UTF-16 LE", "utf-16le"],
        ["UTF-16 BE", "utf-16be"], ["ASCII", "ascii"], ["Windows-1252", "windows-1252"],
      ].map(([text, value]) => MenuItem.new({ text, action: () => actions.reopenEncoding(value) }))) }),
      await Submenu.new({ text: "Line Endings", items: await Promise.all([
        ["Unix (LF)", "lf"], ["Windows (CRLF)", "crlf"], ["Classic Mac (CR)", "cr"],
      ].map(([text, value]) => CheckMenuItem.new({ text, checked: st.lineEnding === value, action: () => actions.setLineEnding(value) }))) }),
      await sep(),
      await MenuItem.new({ text: "Copy File Path", action: () => actions.copyPath(false) }),
      await MenuItem.new({ text: "Copy Relative Path", action: () => actions.copyPath(true) }),
      await sep(),
      await CheckMenuItem.new({ text: "Follow File as Log", checked: st.logWatch, action: actions.toggleLogWatch }),
      await MenuItem.new({ text: "Set Log Filter…", action: actions.setLogFilter }),
      await sep(),
      await MenuItem.new({ text: "Character Inspector…", action: actions.unicodeInspector }),
    ] });

    // HTML toolbar actions as a menu: wrap the selection (or insert).
    const htmlMenu = await Submenu.new({
      text: "HTML",
      items: [
        await htmlItem("Bold", "<b>", "</b>", "html.bold"),
        await htmlItem("Italic", "<i>", "</i>", "html.italic"),
        await htmlItem("Underline", "<u>", "</u>", "html.underline"),
        await sep(),
        await htmlItem("Paragraph", "<p>", "</p>"),
        await htmlItem("Heading 1", "<h1>", "</h1>"),
        await htmlItem("Line Break", "<br>\n"),
        await htmlItem("Non-breaking Space", "&nbsp;"),
        await sep(),
        await htmlItem("Link", '<a href="">', "</a>"),
        await htmlItem("Image", '<img src="" alt="">'),
        await htmlItem("Horizontal Rule", "<hr>\n"),
        await sep(),
        await htmlItem("Unordered List", "<ul>\n  <li>", "</li>\n</ul>"),
        await htmlItem("Table", "<table>\n  <tr><td>", "</td></tr>\n</table>"),
        await htmlItem("Div", "<div>", "</div>"),
        await htmlItem("Span", "<span>", "</span>"),
        await htmlItem("Preformatted", "<pre>", "</pre>"),
        await sep(),
        await MenuItem.new({ text: "Entity Picker…", action: actions.insertEntity }),
        await MenuItem.new({ text: "HTML Escape", action: actions.htmlEscape }),
        await MenuItem.new({ text: "HTML Unescape", action: actions.htmlUnescape }),
        await MenuItem.new({ text: "URL Encode", action: actions.urlEncode }),
        await MenuItem.new({ text: "URL Decode", action: actions.urlDecode }),
        await MenuItem.new({ text: "Format JSON", action: actions.formatJson }),
        await MenuItem.new({ text: "Format XML", action: actions.formatXml }),
        await MenuItem.new({ text: "Table Generator…", action: actions.generateTable }),
      ],
    });

    const toolItems = loadTools().map(async (t) =>
      MenuItem.new({ text: t.name, accelerator: t.shortcut || undefined, action: () => actions.runTool(t) })
    );
    const toolsMenu = await Submenu.new({
      text: "Tools",
      items: [
        await MenuItem.new({ text: "Commands…", accelerator: accel("tools.commandPalette"), action: actions.commandPalette }),
        await MenuItem.new({ text: "Notes & Scratchpad…", action: actions.notes }),
        await sep(),
        await MenuItem.new({ text: "Terminal Here", action: actions.terminalHere }),
        await MenuItem.new({ text: "Install mcedit Command…", action: actions.installCli }),
        await sep(),
        ...(await Promise.all(toolItems)),
        await sep(),
        await MenuItem.new({ text: "Configure User Tools…", action: actions.configureTools }),
        await sep(),
        await CheckMenuItem.new({ text: "Record Macro", checked: st.recordingMacro, accelerator: accel("tools.recordMacro"), action: actions.toggleMacroRecording }),
        await MenuItem.new({ text: "Replay Last Macro", accelerator: accel("tools.replayMacro"), action: actions.replayMacro }),
        await MenuItem.new({ text: "Repeat Last Transformation", accelerator: accel("tools.repeatLast"), action: actions.repeatLastCommand }),
      ],
    });

    const projectMenu = await Submenu.new({ text: "Project", items: [
      // Duplicates of the Search-menu entries — the accelerators live there, so
      // these carry none (the old ⌘P here collided with File → Print).
      await MenuItem.new({ text: "Quick Open…", action: actions.quickOpen }),
      await MenuItem.new({ text: "Find in Files…", action: actions.findInFiles }),
      await sep(), await MenuItem.new({ text: "Project Workspaces…", action: actions.projectManager }),
      await MenuItem.new({ text: "Project Configuration…", action: actions.configureProject }),
      await sep(), await MenuItem.new({ text: "Git Working Copy…", action: actions.gitPanel }),
      await sep(), await MenuItem.new({ text: "Git Status", action: actions.gitStatus }),
      await MenuItem.new({ text: "Diff Active File", action: actions.gitDiff }),
      await MenuItem.new({ text: "Open Repository in Terminal", action: actions.terminalHere }),
    ] });

    const windowMenu = await Submenu.new({
      text: "Window",
      items: [
        await MenuItem.new({ text: "New Window", accelerator: accel("window.newWindow"), action: actions.newWindow }),
        await PredefinedMenuItem.new({ item: "Minimize" }),
        await PredefinedMenuItem.new({ item: "Maximize" }),
        await sep(),
        // A custom item rather than PredefinedMenuItem "CloseWindow": that one
        // hardcodes ⌘W, which shadowed File → Close Tab and closed the whole
        // window instead of the tab.
        await MenuItem.new({ text: "Close Window", accelerator: accel("window.closeWindow"), action: actions.closeWindow }),
        await sep(), await MenuItem.new({ text: "Quick Look Active File", action: actions.quickLook }),
        await MenuItem.new({ text: "Install Reopen at Login…", action: actions.installLoginItem }),
        await MenuItem.new({ text: "Install Finder Quick Action…", action: actions.installFinderAction }),
      ],
    });

    const helpMenu = await Submenu.new({
      text: "Help",
      items: [await MenuItem.new({ text: "About Klickrr - Edit", action: actions.about })],
    });

    const menu = await Menu.new({
      items: [
        appMenu,
        fileMenu,
        editMenu,
        searchMenu,
        viewMenu,
        documentMenu,
        htmlMenu,
        toolsMenu,
        projectMenu,
        windowMenu,
        helpMenu,
      ],
    });
    await menu.setAsAppMenu();
  };

  await rebuild();
}

/** Rebuild the menu (e.g. after the user edits the tool list). */
export async function refreshAppMenu(): Promise<void> {
  await rebuild?.();
}
