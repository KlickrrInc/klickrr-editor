# Klickrr - Edit — Requirements Status

Living backlog derived from [`specs.txt`](specs.txt) (Product Requirements
Specification). Tracks every functional requirement against the current build.

**Legend:** ✅ done · ◐ partial · ⬜ missing · ⛔ excluded (per owner: no FTP/SFTP)
**Priority:** P0 = MVP · P1 = competitive first release · P2 = advanced/later

> Note: FR-REMOTE-001…004 (SFTP / FTP / FTPS) are **excluded by the owner** and
> will not be implemented.

---

## 4.1 Application & document management

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| DOC-001 Create/open/save files | P0 | ✅ | New/open/save/Save As/Save All, duplicate, rename/move, revert-to-saved, 3-way close prompt, atomic same-folder save, and contextual failures. |
| DOC-002 Tabbed document interface | P0 | ✅ | Tabs include filenames, modified state, file badges, drag reorder, pin/unpin, reopen-closed-tab and reusable preview tabs. |
| DOC-003 Session restoration | P0 | ✅ | Restores tabs, selections, active tab, sidebar layout and unsaved buffers; recovery is updated after edits and can be disabled in Editor Settings. |
| DOC-004 Recent files & folders | P0 | ✅ | Recent files and folders are persisted; missing files are removed and file history can be cleared. |
| DOC-005 Split editing | P1 | ✅ | Horizontal/vertical same-document panes have independent cursors/scrolling and optional synchronized scrolling. |

## 4.2 Core text-editing engine

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| EDIT-001 Standard editing | P0 | ✅ | Includes CodeMirror editing keys plus menu commands for case, trailing whitespace, sort/unique/join/split lines and plain-text paste. |
| EDIT-002 Multiple cursors | P1 | ✅ | Cmd+D select-next, Option-click add-cursor, select-all-occurrences and multi-selection editing are enabled. |
| EDIT-003 Column selection | P0 | ✅ | Alt-drag rectangular selection. |
| EDIT-004 Indentation | P0 | ✅ | Tabs/spaces, detection, auto-indent, conversion and extension-specific preferences are implemented. |
| EDIT-005 Line/char navigation | P0 | ✅ | Includes line/column/UTF-8 byte offset, matching-pair navigation and back/forward cursor history. |
| EDIT-006 Visual editing aids | P0 | ✅ | Line numbers, current line, ruler, wrapping, indentation guides, visible whitespace, line endings, configurable right margin and minimap. |
| EDIT-007 Bookmarks & markers | P1 | ✅ | Gutter toggle, next/previous, delete bookmarked/unbookmarked lines and session persistence. |

## 4.3 Search & replace

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| SEARCH-001 Document search | P0 | ✅ | CodeMirror panel: find/replace, next/prev, case, whole-word, regex, wrap, incremental, match count. (Verify: search-within-selection, search history.) |
| SEARCH-002 Multiline regex | P1 | ✅ | Dedicated multiline regex search/replace supports cross-line matches, capture groups and invalid-expression messages. |
| SEARCH-003 Find in files | P0 | ✅ | Rust search supports `.gitignore`, includes/excludes, hidden files, case/regex, folder/open-document scopes and clickable bounded results. |
| SEARCH-004 Replace in files | P1 | ✅ | Preview, per-match selection, rollback on failure, persistent one-step transaction undo and failure reporting. |

## 4.4 Programming-language support

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| LANG-001 Syntax highlighting | P0 | ✅ | HTML/XML, CSS/SCSS, JS/TS, JSON, Markdown, Python, PHP, Java, C/C++, Rust, SQL, YAML, Shell, Ruby, Swift, Objective-C, TOML and INI. |
| LANG-002 Custom language definitions | P1 | ◐ | User extensions, keywords and line/block comments are configurable. Left: custom folding rules and per-language colors. |
| LANG-003 Code folding | P0 | ✅ | Structure/indent gutter, fold/unfold all and fold-selected-region commands. |
| LANG-004 Bracket & tag matching | P0 | ✅ | Highlight/mismatch plus jump-between-brackets and nested HTML/XML tag navigation. |
| LANG-005 Autocomplete | P1 | ✅ | Document-word completion, built-in snippet completion and common abbreviation expansion. |
| LANG-006 Function/symbol list | P1 | ✅ | Live Functions pane with filter-by-typing. |
| LANG-007 Language Server Protocol | P2 | ⬜ | Diagnostics/hover/goto/refs/rename/semantic completion; isolated processes. |

## 4.5 File formats & encodings

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| FILE-001 Encoding support | P0 | ✅ | Detect/display/reopen/save as UTF-8 ±BOM, UTF-16 LE/BE, ASCII and Windows-1252, with representation warnings. |
| FILE-002 Line endings | P0 | ✅ | LF/CRLF/CR are detected, normalized for editing, shown in the status bar, selectable, and preserved/converted on save. |
| FILE-003 External changes | P0 | ✅ | Focus/periodic detection, clean reload, dirty reload/keep prompt, overwrite preflight and side-by-side disk comparison. |
| FILE-004 Large-file mode | P1 | ✅ | Large files load a bounded read-only window with parsing disabled and a clear status indicator. |
| FILE-005 Log watching | P1 | ✅ | Tail follow/pause, document search, line filter and truncation indicator. |

## 4.6 Folder & project workspace

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| PROJ-001 Folder browser | P0 | ✅ | Folder tree supports create file/folder, rename, recursive duplicate, move, Trash, filtering, colorful icons, context actions, and focus refresh. |
| PROJ-002 Quick Open | P0 | ✅ | Keyboard-first fuzzy project file finder with recent-file priority and ignored generated/VCS folders. |
| PROJ-003 Project configuration | P1 | ◐ | Root/include/exclude/language/tool/preview settings are persisted without credentials. Left: fully apply multiple roots and every override across all subsystems. |
| PROJ-004 Git awareness | P2 | ◐ | Git status, active-file diff and repository Terminal are available. Left: tree status badges and configurable Git command list. |

## 4.7 Remote-file editing — ⛔ EXCLUDED

| FR | Pri | Status |
|----|-----|--------|
| REMOTE-001 SFTP | P1 | ⛔ excluded by owner |
| REMOTE-002 FTP/FTPS | P2 | ⛔ excluded by owner |
| REMOTE-003 Remote save safety | P1 | ⛔ excluded by owner |
| REMOTE-004 Credential security | P1 | ⛔ excluded by owner |

## 4.8 Web & Markdown preview

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| PREVIEW-001 Integrated preview | P1 | ✅ | External preview plus side-by-side sandboxed HTML/Markdown preview with save and typing refresh. |
| PREVIEW-002 Preview security | P1 | ✅ | Sandboxed iframe and restrictive CSP disable scripts and local-file access while explicitly allowing safe remote/data images. |

## 4.9 Snippets, templates & web-authoring

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| SNIP-001 Snippet library | P1 | ✅ | User snippets support categories, cursor/tab markers, selection/date/file/project variables and completion abbreviations. |
| TEMPLATE-001 Document templates | P1 | ✅ | New-from-template with per-extension built-ins and add/edit/import/remove management. |
| WEB-001 HTML tools | P2 | ✅ | Tags, selection wrapping, colors, entities, HTML/URL transforms, JSON/XML formatting and table generation. |

## 4.10 User tools & automation

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| TOOL-001 External tools | P1 | ✅ | Commands support env vars, shortcuts, selection/document input, panel/new-doc/replace output and all documented macros. |
| TOOL-002 Output panel | P1 | ✅ | Live stdout/stderr, cancellation, exit status and clickable compiler-style file locations. |
| TOOL-003 Macros | P2 | ✅ | Record/replay/name/save/fixed shortcut with recursive replay guard. |

## 4.11 Hex viewer

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| HEX-001 Hex viewing | P1 | ✅ | Offset/hex/ASCII, configurable bytes per row and text/byte search. |
| HEX-002 Hex editing | P2 | ✅ | Byte overwrite, uppercase modified-byte marking, undo/redo, save confirmation and `.bak` backup. |

## 4.12 Customization

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| CUST-001 Themes | P0 | ✅ | Classic/dark/system appearance, syntax color editor and JSON theme import/export. |
| CUST-002 Fonts | P0 | ✅ | Font size/family, ligatures, and persistent zoom in/out/reset are implemented. |
| CUST-003 Keyboard shortcuts | P1 | ✅ | Remappable shortcuts, conflict detection, Mac defaults and Classic preset. |

## 5. macOS-specific

| FR | Pri | Status | Notes / what's left |
|----|-----|--------|---------------------|
| MAC-001 Native conventions | — | ◐ | Native menu/services/retina/full-screen, multiple windows, Dark Mode, Quick Look, Open With, login-item installer and window tabbing. Left: deeper VoiceOver/accessibility audit. |
| MAC-002 Finder integration | — | ✅ | Reveal, absolute/relative path copy and guided Finder Quick Action installer. |
| MAC-003 Terminal integration | — | ✅ | Integrated terminal, Terminal Here and guided `mcedit` CLI installer with line/column arguments. |
| MAC-004 Sandboxing | — | n/a | Only relevant for Mac App Store distribution; direct distribution assumed. |
| MAC-005 Finder "Open With" (owner-requested) | P1 | ✅ | The bundle registers common text/source associations and handles macOS open-file events for cold and running-app launches, covering Finder Open With, associated-file double-click and `open -a "Klickrr - Edit" file`. |

## 6. Non-functional (tracked, mostly architectural)

- **Performance:** fast launch, low typing latency, off-main-thread search/highlight, cancellable indexing. (CodeMirror covers most editor latency; find-in-files must be off-thread.)
- **Reliability:** periodic recovery of unsaved work, crash isolation for preview/tools, atomic save, cleanup after successful save. (Ties to DOC-001/003, FILE-003.)
- **Security:** Keychain creds (remote excluded), no logging of secrets, correct arg escaping, explicit permission before auto-running project commands.
- **Privacy:** offline core, opt-in telemetry, no doc content in crash reports.
- **Accessibility:** VoiceOver labels, full keyboard access, contrast, reduced-motion.
- **Compatibility:** min macOS version, Apple Silicon native, preserve Unix perms/xattrs.

---

## Suggested implementation waves (for reference)

- **Wave 1 — P0 gaps (implemented 2026-07-18):** DOC-003 session/crash recovery, DOC-004 recent files,
  SEARCH-003 find-in-files, FILE-001 encodings, FILE-002 line endings, FILE-003
  external-change detection, PROJ-002 Quick Open, CUST-001 dark/system themes,
  CUST-002 font/zoom, EDIT-001 text ops, LANG-001 more languages, PROJ-001 folder
  ops, MAC-002 copy-path, DOC-001 revert/duplicate/rename + 3-way close + atomic save.
- **Wave 2 — P1 (implemented 2026-07-18):** DOC-005 splits, EDIT-002 multi-cursor, EDIT-007 bookmarks,
  SEARCH-004 replace-in-files, FILE-004/005 large-file/log, PREVIEW-001 in-app
  preview, SNIP-001 snippets, TEMPLATE-001 templates, TOOL-001/002 tool upgrades,
  HEX-001 hex search, CUST-003 preset keymap, MAC-003 CLI launcher, MAC-001 multi-window,
  MAC-005 Finder "Open With" registration.
- **Wave 3 — P2 (implemented except the partial/missing rows above):** LANG-002 custom languages, LANG-007 LSP, PROJ-004 Git,
  TOOL-003 macros, HEX-002 hex editing, minimap, extension API.

_Owner approval was given on 2026-07-18. Status rows remain the source of truth; partial/missing rows must not be represented as complete._
