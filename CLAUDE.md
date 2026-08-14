# CLAUDE.md — Klickrr Edit

> A lightweight, fast **macOS text/code editor**.
> Stack: **Tauri 2** (native WebKit webview — small footprint) + **Vite** +
> **vanilla TypeScript** + **CodeMirror 6**. Electron was explicitly rejected
> for being heavy; keep this app lean.

The design north star is a lightweight editor that is quick to launch, uses a
crisp classic color scheme, and favors familiar, compact UI over novelty.

## Build / run / verify

```bash
npm install            # once
npm run tauri dev      # run the desktop app (first Rust build takes a few min)
npm run build          # tsc + vite build — the fast way to catch TS errors
npm run tauri build    # produce a distributable .app / .dmg
cd src-tauri && cargo check   # fast way to catch Rust errors
```

- **Always sanity-check a change with `npm run build` (frontend) and/or
  `cargo check` (backend) before claiming it works.** Both are fast.
- To eyeball UI/colors without launching the native app, run `npm run dev` and
  open `http://localhost:1420` in a browser. Caveat: `invoke(...)` calls
  (`home_dir`, `list_dir`, `run_tool`, file I/O) and `navigator.clipboard` only
  work inside the real Tauri runtime, so the Directory pane and tools will be
  inert in a plain browser — everything else (layout, theme, menus, ruler)
  renders faithfully.

## Architecture (one EditorView, per-tab state)

Single `EditorView` is reused for all tabs. Each tab owns its own
`EditorState` (doc + undo history + cursor); switching tabs snapshots the live
state back into the outgoing tab and `view.setState(...)`s the incoming one.
This keeps memory low and preserves per-tab history.

The UI has the **native macOS menu bar** (Tauri JS menu API, `appmenu.ts`) PLUS
two **in-window compact icon toolbars** (`toolbar.ts` + `icons.ts`).
Menu and toolbars call the same command functions defined in `main.ts`.

```
index.html          DOM shell: #toolbars(#toolbar-standard+#toolbar-html) #tabbar #main(#sidebar+#editor-area(#ruler+#editor-host+#hexview)) #output #statusbar #print-area
src/
  main.ts           bootstrap + orchestration: owns the EditorView, defines command fns, builds menu + toolbars, file I/O, tools, hex
  appmenu.ts        native macOS menu; item accelerators come from keymap.ts (effectiveAccel); rebuilt on state change; no-op outside Tauri
  keymap.ts         configurable shortcut registry (KEY_COMMANDS + localStorage overrides) + the Keyboard Shortcuts dialog
  settings.ts       editor settings (font/tab/spaces/line-numbers) store + Editor Settings dialog
  toolbar.ts        Toolbar class: renders buttons from a TbItem[] spec; .update() re-reads toggle active() states
  icons.ts          toolbar SVG icons; fileicons.ts = filetype badges + folder glyphs for the tree
  contextmenu.ts    reusable right-click menu; prompt.ts = async text-input modal
  terminal.ts       integrated terminal: xterm.js wired to the Rust PTY via events + pty_* commands
  icons.ts          16×16 original inline-SVG icon set; letter buttons use styled text instead
  editor.ts         CodeMirror extension set; language + word-wrap Compartments; makeState(); cursorPosition()
  theme.ts          "Classic Light" theme — ALL colors live in the `palette` object
  languages.ts      filename extension → CodeMirror LanguageSupport + status-bar label
  tabs.ts           TabData model + tab-strip rendering (TabManager)
  sidebar.ts        Directory (lazy file tree) / Cliptext (snippets) / Functions (outline) panes
  ruler.ts          canvas column ruler; tracks scroll via .cm-content's live left edge
  output.ts         bottom output pane for tool stdout/stderr/exit code
  hexview.ts        read-only hex dump viewer (offset | hex | ASCII)
  tools.ts          user tools: localStorage store, macro expansion, run, config modal
  fileops.ts        dialog + Rust-command wrappers (open/save/read/write, readFileBytes, listDir, homeDir), basename/dirname
  styles.css        all app chrome (tabs/sidebar/ruler/output/hex/modal/print); editor surface is themed in theme.ts
src-tauri/src/lib.rs  Rust backend: file I/O, list_dir, home_dir, run_tool, move_to_trash, create_file, pty_start/write/resize/kill (PTY state via .manage)
```

### Rust backend is deliberately thin
Native pickers come from `tauri-plugin-dialog` (called from JS). Disk I/O and
directory listing are tiny custom commands taking an **absolute path** from the
picker/tree — this sidesteps the `fs`-plugin scoping dance. `run_tool` runs a
shell command via `/bin/sh -c` (macros pre-expanded on the JS side). When you
add a command: define it in `lib.rs`, add it to `generate_handler![...]`, and
wrap it in `fileops.ts`. New plugins also need a permission in
`src-tauri/capabilities/default.json`.

## Conventions / how-to

- **Colors:** change the `palette` object in `theme.ts` — nothing else. Current
  values use blue tags/keywords/CSS-properties, magenta strings and attribute
  values, teal numbers, dark-red attribute names and CSS selectors, and green
  comments.
- **Editor font:** size/family/ligatures are `--kr-font-*` CSS variables on
  `:root`, written by `applyAppearance()` in `settings.ts` and consumed by
  `.cm-scroller`/`.cm-content` in `theme.ts`. **Never put a literal `fontSize`
  or `fontFamily` in `classicEditorTheme`** — a literal there has the same
  specificity as the settings rule but is emitted later in the sheet, so it
  silently wins and the font-size/font-family/zoom settings go dead.
- **Add a language:** add an extension→`{label, extension}` entry in
  `languages.ts` and the `@codemirror/lang-*` dep. Highlighting maps through
  `theme.ts` by lezer tag, so no theme change is usually needed.
- **Add a menu item:** edit `rebuild()` inside `setupAppMenu()` in `appmenu.ts`
  (native menu). Use `MenuItem.new({text, accelerator, action})`,
  `CheckMenuItem` for toggles (they call the action then `rebuild()` to flip the
  check), or `PredefinedMenuItem` for the standard Edit/Window items. Wire the
  callback through the `AppMenuActions` object passed from `main.ts`. The whole
  menu is rebuilt on state changes and when the tool list is edited
  (`refreshAppMenu()`). Native menus only exist in the Tauri runtime — the
  browser preview (`npm run dev`) has none, so test menu changes with
  `npm run tauri dev`.
- **Add a toolbar button:** append a `TbItem` to `standardItems` / `htmlItems`
  in `main.ts` (`{title, action, icon?, text?, textClass?, active?}`). Use an
  `icon` key from `icons.ts` (add a new SVG there if needed) or a `text` glyph.
  For a toggle, give it `active: () => <state>` and call `refreshToolbars()`
  wherever that state changes (also mirror it in the menu). Toolbar and menu
  should invoke the SAME command function — don't duplicate logic.
- **User tool macros** (in `tools.ts`): `$(FilePath) $(FileDir) $(FileName)
  $(FileNameNoExt) $(FileExt) $(CurLine) $(CurCol)`. A tool referencing a file
  macro requires a saved file; the app saves a dirty buffer before running.
- **Keyboard:** two layers. (1) In-editor motions/edits are CodeMirror's
  platform-aware keymaps (`editor.ts`) — ⌘←/→, ⌥←/→, ⌘⌫ etc. — always active,
  not configurable. (2) App shortcuts are native menu **accelerators** whose
  strings come from the `keymap.ts` registry (`effectiveAccel(id)`); a native
  accelerator supersedes the CM keymap for the same chord, so the menu action
  must replicate the behavior. To add/change an app shortcut, edit `KEY_COMMANDS`
  in `keymap.ts` (default) — users remap live via the Keyboard Shortcuts dialog.
- **Add a configurable command:** add a `KEY_COMMANDS` entry (`id`, `label`,
  `category`, `defaultAccel`) in `keymap.ts`, then use `accel("<id>")` for that
  item's accelerator in `appmenu.ts`. The dialog picks it up automatically.
- **Match surrounding style:** vanilla TS, no framework, small modules, comments
  that explain *why*. Keep the footprint small.

## Gotchas

- **Tab-switch dirty flag:** `main.ts` sets `switching=true` around
  `view.setState` so the swap isn't mistaken for a user edit. Preserve that
  guard if you touch tab switching.
- **Ruler alignment:** the ruler anchors to `contentDOM.getBoundingClientRect().left`
  (which already reflects horizontal scroll) and clips over the gutter width.
  Call `ruler.sync()` after anything that changes editor geometry (tab mount,
  sidebar/output toggle).
- **Edit menu = native predefined items.** Undo/Redo/Cut/Copy/Paste/Select All
  are `PredefinedMenuItem`s — they act on whatever is focused (the editor OR a
  text input like the search field / tool config). CodeMirror handles the
  resulting native copy/cut/paste and `beforeinput` history events, so don't
  reimplement clipboard/undo in JS.
- **Native menu needs capability permissions:** `core:menu:default`,
  `core:app:default`, `core:window:default` in
  `src-tauri/capabilities/default.json`. If menu building throws at runtime,
  check those. `appmenu.ts` no-ops outside the Tauri runtime (browser preview).
- **Editor settings are per-tab compartments.** Each EditorState bakes in
  font/tab/line-number compartment values (from `settings.ts` at makeState time).
  To apply changed settings to ALL open tabs, `main.applyEditorSettings()`
  snapshots the active tab, then `tab.state = tab.state.update({effects}).state`
  for every tab (preserves undo history) and remounts. Don't try to make settings
  a single view-level extension — `view.setState` per tab would drop it.
- **Integrated terminal = xterm.js ↔ Rust PTY.** Rust `pty_start` spawns the
  login shell in a `portable-pty` PTY, a reader thread emits `pty-output` events,
  and `pty_write`/`pty_resize` feed input/size back. The single session lives in
  `.manage(PtyState)`. Event names and command arg names must match `terminal.ts`
  exactly. Delete via **Move to Trash** (`trash` crate) — never a hard delete.
- **Recording a shortcut suspends accelerators.** Native accelerators intercept
  keys before the webview, so recording a chord in the dialog would be hijacked.
  `setAcceleratorsSuspended(true)` + `refreshAppMenu()` strips accelerators while
  the dialog is open (see `main.ts` `configureKeys`); restored on close. Keep
  that dance if you touch the dialog.
- **Menu modals are native-menu-only.** The Tools and Keyboard Shortcuts dialogs
  are reached through the native menu, which doesn't exist in the browser preview
  — verify them via `npm run tauri dev` or a throwaway `verify-*.html` page that
  imports and calls the opener directly.
- **Menu accelerators must not collide.** Two items sharing a chord means macOS
  silently routes it to one of them. Every app accelerator therefore lives in
  the `KEY_COMMANDS` registry in `keymap.ts` and reaches the menu via
  `accel("<id>")` — don't hardcode the string in `appmenu.ts`. Watch the
  predefined items too: `PredefinedMenuItem "CloseWindow"` hardcodes ⌘W and used
  to shadow File → Close Tab, so Window → Close Window is a custom item on ⇧⌘W.
- **The ruler measures its own character width** (a hidden `.ruler-probe` run
  styled from `--kr-font-*`). `view.defaultCharacterWidth` is a CodeMirror cache
  that refreshes a measure-cycle late, so using it made the ruler misalign for
  one step after every zoom.
- **Bundle size warning** on build (~1 MB): all `lang-*` grammars are bundled.
  Fine for now; lazy-load later if it matters.

## Backlog

**FTP/SFTP remote editing** is the big remaining feature (plan: Rust `suppaftp`
+ `ssh2`; credentials in memory or macOS Keychain, never plaintext; a remote
tree mirroring the Directory pane). Also: integrated **web-browser preview**,
**spell checker**, **document templates**, wider menus (Document/Project),
sidebar **resize splitter**, **dark theme** + theme switching, **session
restore**, URL highlighting.

Done so far: tabbed editing, open/save/save-all, print, extension syntax
highlighting + Classic Light theme, regex find/replace, column selection, line
numbers + ruler, code folding, Directory/Cliptext/Functions sidebar, native
macOS menu bar, two compact icon toolbars (Standard + HTML), HTML insert
menu, user tools + output pane, a hex viewer, browser preview, configurable
keyboard shortcuts, editor settings, colorful filetype tree icons, sidebar
right-click menu (open/reveal/new-file/trash), and an integrated PTY terminal.
