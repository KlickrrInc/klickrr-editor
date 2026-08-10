import type { TabData } from "./tabs";
import type { LineEnding, TextEncoding } from "./fileops";
import { bookmarkPositions } from "./bookmarks";

const SESSION_KEY = "klickrr.session.v1";
const RECENTS_KEY = "klickrr.recents.v1";
const RESTORE_KEY = "klickrr.restoreSession";
const RECENT_FOLDERS_KEY = "klickrr.recentFolders.v1";

export interface SavedTab {
  path: string | null;
  title: string;
  contents: string;
  dirty: boolean;
  encoding: TextEncoding;
  lineEnding: LineEnding;
  diskModifiedMs: number;
  diskSize: number;
  anchor: number;
  head: number;
  pinned?: boolean;
  preview?: boolean;
  bookmarks?: number[];
  large?: boolean;
}

export interface SavedSession {
  tabs: SavedTab[];
  active: number;
  sidebarVisible: boolean;
  savedAt: number;
}

export function restorationEnabled(): boolean {
  return localStorage.getItem(RESTORE_KEY) !== "false";
}

export function setRestorationEnabled(value: boolean): void {
  localStorage.setItem(RESTORE_KEY, String(value));
}

export function saveSession(tabs: TabData[], activeId: number | null, sidebarVisible: boolean): void {
  if (!restorationEnabled()) return;
  const payload: SavedSession = {
    tabs: tabs.map((t) => ({
      path: t.path, title: t.title, contents: t.state.doc.toString(), dirty: t.dirty,
      encoding: t.encoding, lineEnding: t.lineEnding, diskModifiedMs: t.diskModifiedMs,
      diskSize: t.diskSize, anchor: t.state.selection.main.anchor, head: t.state.selection.main.head,
      pinned: t.pinned, preview: t.preview,
      bookmarks: bookmarkPositions(t.state),
      large: t.large,
    })),
    active: Math.max(0, tabs.findIndex((t) => t.id === activeId)),
    sidebarVisible,
    savedAt: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function loadSession(): SavedSession | null {
  if (!restorationEnabled()) return null;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as SavedSession | null;
    return value?.tabs?.length ? value : null;
  } catch { return null; }
}

export function clearSession(): void { localStorage.removeItem(SESSION_KEY); }

export function recentFiles(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

export function addRecent(path: string): void {
  const values = [path, ...recentFiles().filter((p) => p !== path)].slice(0, 20);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(values));
}

export function removeRecent(path: string): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentFiles().filter((p) => p !== path)));
}

export function clearRecents(): void { localStorage.removeItem(RECENTS_KEY); }

export function recentFolders(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) ?? "[]") as string[]; }
  catch { return []; }
}
export function addRecentFolder(path: string): void {
  localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify([path, ...recentFolders().filter((p) => p !== path)].slice(0, 12)));
}
