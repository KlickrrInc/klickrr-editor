// "Classic Light" — a crisp, high-contrast color scheme: white background,
// blue tags/keywords/properties, magenta
// strings & attribute values, teal numbers, maroon attribute names & CSS
// selectors, green comments — all on a clean monospace grid.
//
// Every color lives in the `palette` object below; change a hex there and the
// whole editor follows. Nothing else needs editing to re-skin.

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const palette = {
  background: "#ffffff",
  foreground: "#000000",
  caret: "#000000",
  selection: "#9fc5f3",
  selectionMatch: "#e3edfb",
  // CodeMirror paints selections behind the active line. Keep this translucent
  // so a selection contained entirely on the current line remains visible.
  lineHighlight: "rgba(245, 248, 253, 0.45)",
  gutterBackground: "#ffffff",
  gutterForeground: "#9a9a9a",
  gutterActiveForeground: "#404040",
  gutterBorder: "#e2e2e2",

  // classic syntax colors
  keyword: "#0000ff", // blue: keywords, HTML tags, CSS properties, at-rules
  comment: "#008000", // green
  string: "#ff00ff", // magenta: strings & HTML attribute values
  number: "#008080", // teal: numbers, units, percentages
  operator: "#000000", // black: punctuation, brackets, operators
  selector: "#a00000", // dark red: CSS selectors, type/class names
  attribute: "#a00000", // dark red: HTML attribute names
  function: "#000000", // function calls use the foreground color
  variable: "#000000",
  meta: "#808080", // gray: processing instructions, meta
  heading: "#0000ff",
  link: "#0000ff",
  invalid: "#cd3131",
};

export const classicEditorTheme = EditorView.theme(
  {
    "&": {
      color: palette.foreground,
      backgroundColor: palette.background,
      height: "100%",
    },
    // Font face/size come from Editor Settings via CSS custom properties on
    // :root (see applyAppearance). They must NOT be hardcoded here — a literal
    // value in this base theme has the same specificity as the settings rule
    // but is emitted later in the sheet, which would silently win and make the
    // font-size / font-family / zoom settings dead.
    ".cm-content": {
      caretColor: palette.caret,
      fontFamily: "var(--kr-font-family)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: palette.caret },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: palette.selection },
    ".cm-selectionMatch": { backgroundColor: palette.selectionMatch },
    ".cm-activeLine": { backgroundColor: palette.lineHighlight },
    ".cm-activeLineGutter": {
      backgroundColor: palette.lineHighlight,
      color: palette.gutterActiveForeground,
    },
    ".cm-gutters": {
      backgroundColor: palette.gutterBackground,
      color: palette.gutterForeground,
      border: "none",
      borderRight: `1px solid ${palette.gutterBorder}`,
    },
    ".cm-foldGutter .cm-gutterElement": { color: "#a0a0a0" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 12px" },
    ".cm-scroller": {
      fontSize: "var(--kr-font-size)",
      fontFamily: "var(--kr-font-family)",
      fontVariantLigatures: "var(--kr-ligatures)",
      lineHeight: "1.5",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "#e3edfb",
      outline: "1px solid #9cc0f0",
    },
    ".cm-searchMatch": {
      backgroundColor: "#fff2a8",
      outline: "1px solid #e0c65b",
    },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffd86b" },
    ".cm-panels": {
      backgroundColor: "#f0f0f0",
      color: palette.foreground,
    },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #d0d0d0" },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid #d0d0d0" },
  },
  { dark: false }
);

export const classicHighlightStyle = HighlightStyle.define([
  // blue — keywords, HTML tag names, CSS property names, at-rules
  {
    tag: [
      t.keyword,
      t.modifier,
      t.controlKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.tagName,
      t.propertyName,
      t.atom,
    ],
    color: palette.keyword,
  },
  // green — comments remain non-italicized for readability
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: palette.comment,
  },
  // magenta — strings and HTML attribute values
  {
    tag: [t.string, t.special(t.string), t.regexp, t.attributeValue],
    color: palette.string,
  },
  // teal — numbers, units, booleans/null
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null, t.unit],
    color: palette.number,
  },
  // black — operators, punctuation, brackets, function calls, plain variables
  {
    tag: [
      t.operator,
      t.punctuation,
      t.separator,
      t.bracket,
      t.angleBracket,
      t.squareBracket,
      t.paren,
      t.brace,
      t.function(t.variableName),
      t.function(t.propertyName),
      t.variableName,
    ],
    color: palette.operator,
  },
  // dark red — CSS selectors, type/class names
  {
    tag: [t.typeName, t.className, t.namespace, t.labelName, t.constant(t.className)],
    color: palette.selector,
  },
  // dark red — HTML attribute names
  { tag: [t.attributeName], color: palette.attribute },
  // gray — processing instructions / meta (e.g. <?php ?>)
  {
    tag: [t.meta, t.documentMeta, t.annotation, t.processingInstruction],
    color: palette.meta,
  },
  // markdown niceties
  { tag: [t.heading], color: palette.heading, fontWeight: "bold" },
  { tag: [t.link, t.url], color: palette.link, textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "bold" },
  { tag: [t.strikethrough], textDecoration: "line-through" },
  { tag: [t.invalid], color: palette.invalid },
]);

/** The full Classic Light extension: theme + syntax highlighting. */
export const classicTheme = [
  classicEditorTheme,
  syntaxHighlighting(classicHighlightStyle),
];

export type ThemeColors = Pick<typeof palette, "background" | "foreground" | "keyword" | "comment" | "string" | "number" | "selector">;

/** User color overrides layered after the classic highlighter. */
export function customTheme(colors: ThemeColors) {
  const highlight = HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.tagName, t.propertyName, t.atom], color: colors.keyword },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: colors.comment },
    { tag: [t.string, t.regexp, t.attributeValue], color: colors.string },
    { tag: [t.number, t.integer, t.float, t.bool, t.null, t.unit], color: colors.number },
    { tag: [t.typeName, t.className, t.namespace, t.labelName, t.attributeName], color: colors.selector },
  ]);
  return [EditorView.theme({ "&": { backgroundColor: colors.background, color: colors.foreground },
    ".cm-gutters": { backgroundColor: colors.background }, ".cm-content": { caretColor: colors.foreground } }), syntaxHighlighting(highlight)];
}
