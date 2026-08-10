// CodeMirror 6 wiring. We run a single EditorView and swap per-tab EditorStates
// in and out of it (see TabManager) so each tab keeps its own undo history and
// cursor. The extension set is assembled by hand (rather than via `basicSetup`)
// so our application theme is the only active highlighter.

import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightWhitespace,
  highlightTrailingWhitespace,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { bracketMatching, indentOnInput, indentUnit, foldGutter, foldKeymap } from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { customTheme, classicTheme } from "./theme";
import { languageForFilename } from "./languages";
import { loadSettings } from "./settings";
import type { EditorSettings } from "./settings";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { bookmarkField } from "./bookmarks";

/** Compartment so a tab's language can be reconfigured (e.g. after Save As). */
export const languageCompartment = new Compartment();
/** Compartment for the word-wrap toggle (View menu). */
export const wrapCompartment = new Compartment();
/** Compartments driven by Editor Settings (font size, tab size, line numbers). */
export const fontCompartment = new Compartment();
export const tabCompartment = new Compartment();
export const lineNumberCompartment = new Compartment();
export const aidCompartment = new Compartment();
export const customThemeCompartment = new Compartment();
export const spellCheckCompartment = new Compartment();

function fontExtension(s: EditorSettings): Extension {
  const px = s.fontSize * s.zoom / 100;
  return EditorView.theme({ ".cm-scroller": { fontSize: `${px}px`, fontFamily: s.fontFamily,
    fontVariantLigatures: s.ligatures ? "normal" : "none" } });
}
function indentFor(s: EditorSettings, doc = "", filename: string | null = null): { size: number; spaces: boolean } {
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  for (const entry of s.indentOverrides.split(",")) {
    const [key, raw] = entry.trim().split("=");
    if (key === ext && raw) return { size: Math.max(1, Number.parseInt(raw) || s.tabSize), spaces: !raw.endsWith("t") };
  }
  let tabs = 0; const widths: number[] = [];
  for (const line of doc.split("\n").slice(0, 300)) {
    if (/^\t+\S/.test(line)) tabs++;
    const m = /^( +)\S/.exec(line); if (m) widths.push(m[1].length);
  }
  if (tabs > widths.length) return { size: s.tabSize, spaces: false };
  const candidates = [2, 4, 8];
  const size = candidates.find((n) => widths.length > 0 && widths.every((w) => w % n === 0)) ?? s.tabSize;
  return { size, spaces: widths.length ? true : s.insertSpaces };
}
function tabExtension(s: EditorSettings, doc = "", filename: string | null = null): Extension {
  const indent = indentFor(s, doc, filename);
  return [
    EditorState.tabSize.of(indent.size),
    indentUnit.of(indent.spaces ? " ".repeat(indent.size) : "\t"),
  ];
}
function lineNumberExtension(s: EditorSettings): Extension {
  return s.lineNumbers ? lineNumbers() : [];
}
function aidExtension(s: EditorSettings): Extension {
  const items: Extension[] = [];
  if (s.indentationGuides) items.push(indentationMarkers({ highlightActiveBlock: true, hideFirstIndent: true }));
  if (s.visibleWhitespace) items.push(highlightWhitespace(), highlightTrailingWhitespace());
  if (s.rightMargin > 0) items.push(EditorView.theme({
    ".cm-content": { backgroundImage: `linear-gradient(to right, transparent calc(${s.rightMargin}ch - 1px), rgba(128,128,128,.35) ${s.rightMargin}ch, transparent calc(${s.rightMargin}ch + 1px))`, backgroundAttachment: "local" },
  }));
  return items;
}
function spellCheckExtension(s: EditorSettings): Extension {
  return EditorView.contentAttributes.of({ spellcheck: s.spellCheck ? "true" : "false", autocorrect: s.spellCheck ? "on" : "off" });
}

/** Compartment effects to apply changed Editor Settings to a state/view. */
export function editorSettingsEffects(s: EditorSettings, doc = "", filename: string | null = null) {
  return [
    fontCompartment.reconfigure(fontExtension(s)),
    tabCompartment.reconfigure(tabExtension(s, doc, filename)),
    lineNumberCompartment.reconfigure(lineNumberExtension(s)),
    aidCompartment.reconfigure(aidExtension(s)),
    customThemeCompartment.reconfigure(customTheme(s.customColors)),
    spellCheckCompartment.reconfigure(spellCheckExtension(s)),
  ];
}
export function editorConfigEffects(size: number, spaces: boolean) {
  const width = Math.max(1, Math.min(16, size));
  return [tabCompartment.reconfigure([EditorState.tabSize.of(width), indentUnit.of(spaces ? " ".repeat(width) : "\t")])];
}

// Global word-wrap preference, applied to every tab's fresh state and toggled
// live on the active view. Kept here so makeState() and toggleWrap() agree.
let wrapEnabled = false;

export function toggleWrap(view: EditorView): boolean {
  wrapEnabled = !wrapEnabled;
  view.dispatch({
    effects: wrapCompartment.reconfigure(
      wrapEnabled ? EditorView.lineWrapping : []
    ),
  });
  return wrapEnabled;
}

export interface EditorCallbacks {
  onChange: () => void;
  onCursor: (view: EditorView) => void;
}

function baseExtensions(cb: EditorCallbacks): Extension {
  return [
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    bookmarkField,
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    EditorState.languageData.of(() => [{ autocomplete: documentCompletions }]),
    autocompletion(),
    // Alt-drag column / block selection.
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    classicTheme,
    spellCheckCompartment.of(spellCheckExtension(loadSettings())),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onChange();
      if (u.selectionSet || u.docChanged) cb.onCursor(u.view);
    }),
  ];
}

function documentCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w:-]*/); if (!word || (!context.explicit && word.from === word.to)) return null;
  const text = context.state.doc.toString(); const words = new Set(text.match(/[A-Za-z_$][\w$:-]{2,}/g) ?? []);
  const snippets = [
    { label: "html5", type: "snippet", apply: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title></title>\n</head>\n<body>\n\n</body>\n</html>" },
    { label: "div", type: "snippet", apply: "<div></div>" }, { label: "link", type: "snippet", apply: "<a href=\"\"></a>" },
    { label: "log", type: "snippet", apply: "console.log();" }, { label: "fn", type: "snippet", apply: "function name() {\n  \n}" },
  ];
  return { from: word.from, options: [...snippets, ...[...words].slice(0, 500).map((label) => ({ label, type: "text" }))], validFor: /^[\w$:-]*$/ };
}

/** Build a fresh EditorState for a document, with language derived from filename. */
export function makeState(
  doc: string,
  filename: string | null,
  cb: EditorCallbacks,
  readOnly = false
): EditorState {
  const lang = readOnly ? { extension: [] as Extension } : languageForFilename(filename);
  const s = loadSettings();
  return EditorState.create({
    doc,
    extensions: [
      baseExtensions(cb),
      EditorState.readOnly.of(readOnly),
      languageCompartment.of(lang.extension),
      wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : []),
      fontCompartment.of(fontExtension(s)),
      tabCompartment.of(tabExtension(s, doc, filename)),
      lineNumberCompartment.of(lineNumberExtension(s)),
      aidCompartment.of(aidExtension(s)),
      customThemeCompartment.of(customTheme(s.customColors)),
    ],
  });
}

/** 1-based line/column of the primary cursor. */
export function cursorPosition(view: EditorView): { line: number; col: number } {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}
