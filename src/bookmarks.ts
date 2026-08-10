import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

const toggleEffect = StateEffect.define<number>();
const replaceEffect = StateEffect.define<number[]>();

class BookmarkMarker extends GutterMarker {
  toDOM(): Node { const span = document.createElement("span"); span.className = "bookmark-marker"; span.textContent = "◆"; return span; }
}
const marker = new BookmarkMarker();

export const bookmarkField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, transaction) {
    const next = new Set<number>();
    for (const pos of value) next.add(transaction.changes.mapPos(pos));
    for (const effect of transaction.effects) {
      if (effect.is(toggleEffect)) { const line = transaction.state.doc.lineAt(effect.value).from; next.has(line) ? next.delete(line) : next.add(line); }
      if (effect.is(replaceEffect)) { next.clear(); effect.value.forEach((p) => next.add(transaction.state.doc.lineAt(Math.min(p, transaction.state.doc.length)).from)); }
    }
    return next;
  },
  provide: (field) => gutter({ class: "cm-bookmark-gutter", lineMarker: (view, line) => view.state.field(field).has(line.from) ? marker : null,
    domEventHandlers: { mousedown: (view, line) => { view.dispatch({ effects: toggleEffect.of(line.from) }); return true; } } }),
});

export function bookmarkPositions(state: EditorState): number[] { return [...state.field(bookmarkField)].sort((a, b) => a - b); }
export function restoreBookmarks(state: EditorState, positions: number[]): EditorState { return state.update({ effects: replaceEffect.of(positions) }).state; }
export function toggleBookmark(view: EditorView): void { view.dispatch({ effects: toggleEffect.of(view.state.selection.main.head) }); }
export function nextBookmark(view: EditorView, backwards = false): void {
  const marks = bookmarkPositions(view.state); if (!marks.length) return; const at = view.state.selection.main.head;
  const pos = backwards ? [...marks].reverse().find((p) => p < at) ?? marks[marks.length - 1] : marks.find((p) => p > at) ?? marks[0];
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true }); view.focus();
}
export function deleteMarkedLines(view: EditorView, deleteBookmarked: boolean): void {
  const marks = new Set(bookmarkPositions(view.state)); const changes: { from: number; to: number }[] = [];
  for (let n = 1; n <= view.state.doc.lines; n++) { const line = view.state.doc.line(n); const marked = marks.has(line.from);
    if (marked === deleteBookmarked) changes.push({ from: line.from, to: Math.min(view.state.doc.length, line.to + 1) }); }
  view.dispatch({ changes });
}
