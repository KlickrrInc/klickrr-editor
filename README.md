# Klickrr - Edit

A lightweight, fast, open-source text/code editor for macOS, built with
**Tauri 2** (native WebKit webview, small footprint) + **CodeMirror 6**.

Licensed under the [Apache License 2.0](LICENSE).

## Status

Working today:

- **Native macOS menu bar** (the system menu at the top of the screen):
  **File** (New/Open/Save/Save As/Save All/Print/Close Tab/Close All), **Edit**
  (Undo/Redo/Cut/Copy/Paste/Select All), **Search** (Find/Find Next/Find
  Previous/Replace/Go to Line), **View** (Sidebar/Output/Word Wrap/Hex View,
  with checkmarks), **HTML**, **Tools**, **Window**, **Help**.
- **Two compact icon toolbars** (grouped by purpose, with tooltips):
  - **Standard**: New, Open, Save, Save All │ Print │ Cut, Copy, Paste, Delete │
    Undo, Redo │ Find, Replace, Find Next, Go to Line │ Word Wrap, Hex View
    (toggles) │ Directory, Cliptext, Function List, Output Window.
  - **HTML**: Preview in Browser │ Bold, Italic, Underline, Font Color, Color │
    nbsp, Line Break, Paragraph, Heading │ Image, Link, Rule, Copyright │ Table,
    List, PRE, Div, Span │ Video, Audio. Format buttons wrap the selection.
- **User tools** — run configurable external shell commands on the current file
  (Tools menu), with file and cursor macros (`$(FilePath)`, `$(FileDir)`, …)
  and a bottom **output pane** showing stdout/stderr/exit code. Ships with
  Reveal in Finder / Open Terminal Here / Open in Default App; add your own via
  **Tools → Configure User Tools…**
- **Hex Viewer** — View → Hex View shows the current file as an offset / hex /
  ASCII dump (works on binary files).
- **Integrated terminal** — a real shell inside the editor (xterm.js + a PTY on
  the Rust side). **Tools → Terminal Here** opens it in the current file's
  directory; toggle via **View → Terminal** or the toolbar.
- **Editor settings** — font size, tab size, spaces-vs-tabs, line numbers, via
  **Klickrr - Edit → Editor Settings…** (persisted).
- **Configurable color picker & URL prompts** on the HTML toolbar (Font Color /
  Insert Color open a real picker; Image / Link prompt for a URL).
- **Tabbed multi-file editing** — open many files, dirty (`•`) indicator, close
  with the `×`, middle-click, or `Cmd+W`.
- **Directory / Cliptext / Functions sidebar**:
  - **Directory** — lazy file tree with **colorful, filetype-aware icons** and a
    Home / Root switch; single-click a file to select it and double-click to
    open it, with **right-click for Open / Reveal in Finder / New File / Move to
    Trash**. The tree automatically expands and selects the active file; this
    can be disabled with **View → Link Sidebar with Editor**.
  - **Cliptext** — insertable HTML/general snippets (click to drop at cursor).
  - **Functions** — live outline of the current file (functions/classes/CSS
    selectors/Markdown headings); click to jump.
- **Column ruler** above the editor, aligned to the monospace grid.
- **Open / Save / Save As** via native macOS dialogs.
- **Syntax highlighting** by file extension (JS/TS/JSX, HTML, CSS/SCSS, JSON,
  Python, Java, XML/SVG, Markdown, Rust, SQL, C/C++, PHP).
- **Line numbers, bracket matching, code folding, auto-indent, autocomplete.**
- **Find / Replace with regex** — `Cmd+F` (toggle the `.*` regex option in the
  search panel).
- **Command palette** — `Shift+Cmd+P` searches frequently used file, search,
  view, project, and tool commands from one keyboard-driven panel.
- **Grep playground** — interactively test regular expressions, capture groups,
  flags, and replacements against selected or current-document text.
- **Clipboard history, Notes/Scratchpad, and Unicode inspector** — reusable
  clipboard entries, self-saving searchable notes, and code-point/UTF-8 details
  for selected characters.
- **Spell checking and recovery** — optional native check-as-you-type, automatic
  `.bak` files on save, and restoration of unsaved documents after relaunch.
- **Search extraction and repeat** — extract regex matches or capture groups to
  a new document and repeat the most recent text transformation.
- **EditorConfig** — resolves inherited `.editorconfig` files and applies
  per-file indentation and line-ending preferences.
- **Project workspaces and Git panel** — save named multi-root project
  definitions; inspect status/history/diffs and stage, unstage, or commit from
  the Project menu.
- **Column / block selection** — `Alt`-drag.
- **Status bar** — line/column, detected language, full path.
- **"Classic Light" theme** — a high-contrast scheme with blue
  tags/keywords/CSS-properties, magenta strings & attribute values, teal numbers,
  dark-red attribute names & CSS selectors, green comments. See *Matching your
  colors* below to fine-tune.

### Keyboard shortcuts

Standard Mac editing keys are built into the editor (⌘←/→ line, ⌥←/→ word,
⌘↑/↓ document, ⌘⌫ delete-to-start, ⌘C/⌘V/⌘Z…). App shortcuts show next to their
commands in the native menus and are **configurable** via
**Klickrr - Edit → Keyboard Shortcuts…** (`⌘,`): click a shortcut, press a new
combo, Reset to restore the default. Bindings persist across launches.

Defaults: `⌘N` new · `⌘O` open · `⌘S` save · `⇧⌘S` save as · `⌥⌘S` save all ·
`⌘P` print · `⌘W` close tab · `⇧⌘W` close all · `⌘F` find · `⌘G`/`⇧⌘G` find
next/prev · `⌥⌘F` replace · `⌘L` go to line · `⌘B/I/U` bold/italic/underline.

## Run it

```bash
npm install          # once
npm run tauri dev    # launches the desktop app (first run compiles Rust)
```

Build a distributable `.app` / `.dmg`:

```bash
npm run tauri build
```

## Customizing colors

The whole palette lives in one place — `src/theme.ts` (`palette` object). Change
the hex values there to customize the editor without touching the highlighting
logic.

## Project layout

```
src/
  main.ts        app bootstrap: EditorView, command wiring, file I/O orchestration
  appmenu.ts     native macOS menu (Tauri JS menu API); accelerators come from keymap.ts
  keymap.ts      configurable keyboard-shortcut registry + Keyboard Shortcuts dialog
  settings.ts    editor settings (font/tab/line-numbers) store + dialog
  toolbar.ts     renders the two icon toolbars from a spec; icons.ts holds the SVGs
  editor.ts      CodeMirror extension set + per-tab state / word-wrap / settings compartments
  tabs.ts        tab model + tab-bar rendering
  theme.ts       Classic Light theme + syntax colors  ← edit palette here
  languages.ts   filename → language mapping
  sidebar.ts     Directory / Cliptext / Functions panes + right-click context menu
  fileicons.ts   colorful filetype badges + folder icons for the tree
  contextmenu.ts reusable right-click menu
  prompt.ts      async text-input modal (URLs, new file names)
  ruler.ts       column ruler
  output.ts      bottom output pane (tool results)
  hexview.ts     read-only hex dump viewer
  terminal.ts    integrated terminal (xterm.js ↔ Rust PTY)
  tools.ts       user tools: store, macros, run, config modal
  fileops.ts     dialog + read/write/list/bytes wrappers
  styles.css     app chrome (tabs / sidebar / ruler / output / hex / terminal / modal)
src-tauri/
  src/lib.rs     file I/O, list_dir, run_tool, move_to_trash, create_file, pty_* (terminal)
```

## Not yet (candidates for next passes)

**FTP/SFTP** (remote editing — the big one), in-app web-browser preview pane
(the current Preview opens the system browser), spell checker, document
templates, sidebar resize splitter, dark theme + theme switching, session
restore.
