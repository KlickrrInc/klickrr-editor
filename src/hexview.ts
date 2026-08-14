// Read-only hex viewer. Renders bytes as a classic
// dump: 8-digit offset | 16 hex byte pairs | ASCII gutter.

export class HexView {
  private bytes: number[] = [];
  private bytesPerRow = Number(localStorage.getItem("klickrr.hex.bytesPerRow")) || 16;
  private modified = new Set<number>();
  /** Byte values as loaded, so undo can tell "edited back to original" apart
   *  from "still edited" and keep the modified highlighting honest. */
  private original = new Map<number, number>();
  private undo: { offset: number; before: number; after: number }[] = [];
  private redo: { offset: number; before: number; after: number }[] = [];
  constructor(private el: HTMLElement) {
    this.hide();
  }

  get visible(): boolean {
    return !this.el.classList.contains("hidden");
  }

  show(): void {
    this.el.classList.remove("hidden");
  }

  hide(): void {
    this.el.classList.add("hidden");
  }

  /** Load a fresh buffer. This is a *new document*, so any pending byte edits
   *  and their undo history belong to the old one and are dropped. */
  render(bytes: number[] | Uint8Array, note = ""): void {
    this.bytes = Array.from(bytes);
    this.note = note;
    this.modified.clear();
    this.original.clear();
    this.undo = [];
    this.redo = [];
    this.renderCurrent();
  }
  private note = "";
  get bytesPerRowValue(): number { return this.bytesPerRow; }
  setBytesPerRow(value: number): void {
    if (!Number.isFinite(value)) return;
    this.bytesPerRow = Math.max(4, Math.min(64, Math.round(value)));
    localStorage.setItem("klickrr.hex.bytesPerRow", String(this.bytesPerRow));
    this.renderCurrent();
  }
  search(query: string): number {
    const pattern = /^(?:[0-9a-f]{2}\s*)+$/i.test(query.trim()) ? query.trim().split(/\s+/).map((v) => Number.parseInt(v, 16)) : Array.from(new TextEncoder().encode(query));
    if (!pattern.length) return -1;
    outer: for (let i = 0; i <= this.bytes.length - pattern.length; i++) { for (let j = 0; j < pattern.length; j++) if (this.bytes[i + j] !== pattern[j]) continue outer;
      this.scrollToOffset(i); return i; } return -1;
  }
  /** Scroll the row holding `offset` into view, using the real rendered line
   *  height rather than a guessed constant. */
  private scrollToOffset(offset: number): void {
    const rows = Math.max(1, Math.ceil(this.bytes.length / this.bytesPerRow));
    const rowHeight = this.el.scrollHeight / rows;
    this.el.scrollTop = Math.floor(offset / this.bytesPerRow) * rowHeight;
  }
  editByte(offset: number, value: number): boolean {
    if (!Number.isInteger(offset) || !Number.isInteger(value)) return false;
    if (offset < 0 || offset >= this.bytes.length || value < 0 || value > 255) return false;
    const before = this.bytes[offset];
    if (!this.original.has(offset)) this.original.set(offset, before);
    this.bytes[offset] = value;
    this.syncModified(offset);
    this.undo.push({ offset, before, after: value });
    this.redo = [];
    this.renderCurrent();
    this.scrollToOffset(offset);
    return true;
  }
  undoEdit(): void { const op = this.undo.pop(); if (!op) return; this.bytes[op.offset] = op.before; this.syncModified(op.offset); this.redo.push(op); this.renderCurrent(); }
  redoEdit(): void { const op = this.redo.pop(); if (!op) return; this.bytes[op.offset] = op.after; this.syncModified(op.offset); this.undo.push(op); this.renderCurrent(); }
  private syncModified(offset: number): void {
    if (this.bytes[offset] === this.original.get(offset)) this.modified.delete(offset);
    else this.modified.add(offset);
  }
  editedBytes(): number[] { return [...this.bytes]; }
  get hasEdits(): boolean { return this.modified.size > 0; }
  markSaved(): void { this.modified.clear(); this.original.clear(); this.undo = []; this.redo = []; this.renderCurrent(); }
  private renderCurrent(): void {
    this.el.textContent = formatHexDump(this.bytes, this.bytesPerRow, this.modified) + (this.note ? `\n${this.note}\n` : "");
  }
}

function formatHexDump(bytes: number[] | Uint8Array, bytesPerRow = 16, modified = new Set<number>()): string {
  const lines: string[] = [];
  for (let off = 0; off < bytes.length; off += bytesPerRow) {
    const slice = Array.from(bytes.slice(off, off + bytesPerRow));
    const hex = slice
      .map((b, i) => (modified.has(off + i) ? b.toString(16).padStart(2, "0").toUpperCase() : b.toString(16).padStart(2, "0")) + (i === 7 ? " " : ""))
      .join(" ");
    const ascii = slice
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
    const offset = off.toString(16).padStart(8, "0");
    lines.push(`${offset}  ${hex.padEnd(bytesPerRow * 3 + 1, " ")}  |${ascii}|`);
  }
  if (lines.length === 0) return "(empty file)";
  return lines.join("\n");
}
