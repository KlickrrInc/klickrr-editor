// Thin wrappers around the native dialog plugin + our Rust read_file/write_file
// commands. Everything the UI needs to move bytes to and from disk lives here.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export async function pickOpenPath(): Promise<string | null> {
  const result = await open({ multiple: false, directory: false });
  // v2 returns a string (or string[] when multiple). Normalize to string|null.
  if (result == null) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}
export async function pickFolderPath(): Promise<string | null> {
  const result = await open({ multiple: false, directory: true });
  if (result == null) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function pickSavePath(defaultName?: string): Promise<string | null> {
  const result = await save(defaultName ? { defaultPath: defaultName } : {});
  return result ?? null;
}

export type TextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "ascii" | "windows-1252";
export type LineEnding = "lf" | "crlf" | "cr";

export interface TextFile {
  contents: string;
  encoding: TextEncoding;
  line_ending: LineEnding;
  modified_ms: number;
  size: number;
  large: boolean;
}

export async function readFile(path: string, encoding?: TextEncoding): Promise<TextFile> {
  return invoke<TextFile>("read_text_file", { path, encoding });
}
export interface EditorConfigResult { indent_style?: string; indent_size?: number; tab_width?: number; end_of_line?: string; charset?: string; trim_trailing_whitespace?: boolean; insert_final_newline?: boolean; source?: string }
export async function resolveEditorConfig(path: string): Promise<EditorConfigResult> { return invoke<EditorConfigResult>("resolve_editor_config", { path }); }

export async function writeFile(path: string, contents: string, encoding: TextEncoding = "utf-8", lineEnding: LineEnding = "lf", backup = false): Promise<TextFile> {
  return invoke<TextFile>("write_text_file", { path, contents, encoding, lineEnding, backup });
}

export interface FileStat { modified_ms: number; size: number }
export async function statFile(path: string): Promise<FileStat> {
  return invoke<FileStat>("stat_file", { path });
}
export interface TailFile { contents: string; size: number; truncated: boolean }
export async function tailFile(path: string, max = 2 * 1024 * 1024): Promise<TailFile> { return invoke<TailFile>("tail_file", { path, max }); }

export interface FileBytes {
  bytes: number[];
  total: number;
  truncated: boolean;
}

/** Read up to `max` raw bytes of a file (for the hex viewer). */
export async function readFileBytes(path: string, max: number): Promise<FileBytes> {
  return invoke<FileBytes>("read_file_bytes", { path, max });
}
export async function writeFileBytes(path: string, bytes: number[], backup = true): Promise<void> { await invoke("write_file_bytes", { path, bytes, backup }); }

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir", { path });
}

export async function homeDir(): Promise<string> {
  return invoke<string>("home_dir");
}

export async function createDir(path: string): Promise<void> { await invoke("create_dir", { path }); }
export async function renamePath(path: string, newPath: string): Promise<void> { await invoke("rename_path", { path, newPath }); }
export async function duplicatePath(path: string, newPath: string): Promise<void> { await invoke("duplicate_path", { path, newPath }); }

export interface SearchHit { path: string; line: number; column: number; length: number; preview: string }
export interface SearchOptions { query: string; case_sensitive: boolean; regex: boolean; include_hidden: boolean; include: string; exclude: string; max_results: number }
export async function searchFiles(root: string, options: SearchOptions): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_files", { root, options });
}
export async function listProjectFiles(root: string, includeHidden = false, max = 20000): Promise<string[]> {
  return invoke<string[]>("list_project_files", { root, includeHidden, max });
}
export async function takeOpenFiles(): Promise<string[]> { return invoke<string[]>("take_open_files"); }
export async function replaceFileMatches(targets: SearchHit[], replacement: string): Promise<number> {
  return invoke<number>("replace_file_matches", { targets, replacement });
}
export async function undoReplaceFiles(): Promise<number> { return invoke<number>("undo_replace_files"); }

/** Parent directory of a path (returns "/" at the root). */
export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx <= 0) return "/";
  return path.slice(0, idx);
}

/** Last path segment, for tab titles. Handles both / and \ separators. */
export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}
