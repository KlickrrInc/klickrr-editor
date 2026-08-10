// User-configured shell commands run against the current file. Definitions
// persist in localStorage. Commands support file and cursor
// argument macros, expanded here before being handed to the Rust `run_tool`.

import { Channel, invoke } from "@tauri-apps/api/core";
import { basename, dirname } from "./fileops";

export interface UserTool {
  id: string;
  name: string;
  command: string;
  env?: string;
  shortcut?: string;
  input?: "none" | "selection" | "document";
  output?: "panel" | "newDocument" | "replaceSelection";
}

export interface ToolContext {
  path: string | null; // absolute path of the active file (null = unsaved)
  line: number;
  col: number;
  selection: string;
  document: string;
  projectRoot: string;
}

export interface ToolOutput {
  stdout: string;
  stderr: string;
  code: number;
}

const STORE_KEY = "klickrr.userTools";

const DEFAULT_TOOLS: UserTool[] = [
  { id: "reveal", name: "Reveal in Finder", command: 'open -R "$(FilePath)"' },
  { id: "default-app", name: "Open in Default App", command: 'open "$(FilePath)"' },
];

/** Supported macros, shown as hints in the config dialog. */
export const MACROS: [string, string][] = [
  ["$(FilePath)", "full path of the current file"],
  ["$(FileDir)", "directory containing the file"],
  ["$(FileName)", "file name with extension"],
  ["$(FileNameNoExt)", "file name without extension"],
  ["$(FileExt)", "file extension (no dot)"],
  ["$(CurLine)", "cursor line number"],
  ["$(CurCol)", "cursor column number"],
  ["$(SelectedText)", "selected editor text"],
  ["$(ProjectRoot)", "current project root"],
];

export function loadTools(): UserTool[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as UserTool[];
  } catch {
    /* fall through to defaults */
  }
  return [...DEFAULT_TOOLS];
}

export function saveTools(tools: UserTool[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(tools));
}

export function expandMacros(command: string, ctx: ToolContext): string {
  const path = ctx.path ?? "";
  const name = path ? basename(path) : "";
  const dot = name.lastIndexOf(".");
  const nameNoExt = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const map: Record<string, string> = {
    "$(FilePath)": path,
    "$(FileDir)": path ? dirname(path) : "",
    "$(FileName)": name,
    "$(FileNameNoExt)": nameNoExt,
    "$(FileExt)": ext,
    "$(CurLine)": String(ctx.line),
    "$(CurCol)": String(ctx.col),
    "$(SelectedText)": ctx.selection,
    "$(ProjectRoot)": ctx.projectRoot,
  };
  return command.replace(/\$\(\w+\)/g, (m) => (m in map ? map[m] : m));
}

/** True if the command references a file macro (so it needs a saved file). */
export function needsFile(command: string): boolean {
  return /\$\(File\w+\)/.test(command);
}

export async function runTool(tool: UserTool, ctx: ToolContext): Promise<ToolOutput> {
  const command = expandMacros(tool.command, ctx);
  const cwd = ctx.path ? dirname(ctx.path) : undefined;
  const env: Record<string, string> = {};
  for (const line of (tool.env ?? "").split("\n")) { const at = line.indexOf("="); if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1); }
  const stdin = tool.input === "selection" ? ctx.selection : tool.input === "document" ? ctx.document : undefined;
  return invoke<ToolOutput>("run_tool", { command, cwd, env, stdin });
}

export async function runToolStreaming(tool: UserTool, ctx: ToolContext, onChunk: (stream: "stdout" | "stderr", data: string) => void, onStart?: (id: string) => void): Promise<ToolOutput & { id: string }> {
  const command = expandMacros(tool.command, ctx), cwd = ctx.path ? dirname(ctx.path) : undefined, env: Record<string, string> = {};
  for (const line of (tool.env ?? "").split("\n")) { const at = line.indexOf("="); if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1); }
  const stdin = tool.input === "selection" ? ctx.selection : tool.input === "document" ? ctx.document : undefined; const id = `${tool.id}-${Date.now()}`;
  onStart?.(id); return new Promise((resolve, reject) => { let stdout = "", stderr = ""; const channel = new Channel<{event: "stdout" | "stderr" | "exit"; data?: string; code?: number}>();
    channel.onmessage = (message) => { if (message.event === "stdout") { stdout += message.data ?? ""; onChunk("stdout", message.data ?? ""); } else if (message.event === "stderr") { stderr += message.data ?? ""; onChunk("stderr", message.data ?? ""); } else resolve({ id, stdout, stderr, code: message.code ?? -1 }); };
    invoke("run_tool_stream", { id, command, cwd, env, stdin, onEvent: channel }).catch(reject); });
}
export async function cancelTool(id: string): Promise<void> { await invoke("cancel_tool", { id }); }

// --- config modal ----------------------------------------------------------
/** Open the "Configure User Tools" modal. Calls onClose with the saved list. */
export function openToolsConfig(onClose: (tools: UserTool[]) => void): void {
  let tools = loadTools();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  overlay.appendChild(modal);

  const title = document.createElement("h2");
  title.textContent = "Configure User Tools";
  modal.appendChild(title);

  const list = document.createElement("div");
  list.className = "tool-list";
  modal.appendChild(list);

  function renderList(): void {
    list.replaceChildren();
    if (tools.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "No tools yet — add one below.";
      list.appendChild(empty);
    }
    tools.forEach((tool, i) => {
      const row = document.createElement("div");
      row.className = "tool-row";

      const nameIn = document.createElement("input");
      nameIn.value = tool.name;
      nameIn.placeholder = "Name";
      nameIn.className = "tool-name";
      nameIn.addEventListener("input", () => (tools[i].name = nameIn.value));

      const cmdIn = document.createElement("input");
      cmdIn.value = tool.command;
      cmdIn.placeholder = "Command";
      cmdIn.className = "tool-cmd";
      cmdIn.addEventListener("input", () => (tools[i].command = cmdIn.value));

      const del = document.createElement("button");
      del.textContent = "✕";
      del.title = "Remove";
      del.className = "tool-del";
      del.addEventListener("click", () => {
        tools.splice(i, 1);
        renderList();
      });

      const envIn = document.createElement("input"); envIn.value = tool.env ?? ""; envIn.placeholder = "ENV=value"; envIn.title = "Environment variables (newline-separated)"; envIn.addEventListener("input", () => tools[i].env = envIn.value);
      const inputSel = document.createElement("select"); for (const [v, t] of [["none", "No input"], ["selection", "Selection input"], ["document", "Document input"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; inputSel.appendChild(o); } inputSel.value = tool.input ?? "none"; inputSel.addEventListener("change", () => tools[i].input = inputSel.value as UserTool["input"]);
      const outputSel = document.createElement("select"); for (const [v, t] of [["panel", "Output panel"], ["newDocument", "New document"], ["replaceSelection", "Replace selection"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; outputSel.appendChild(o); } outputSel.value = tool.output ?? "panel"; outputSel.addEventListener("change", () => tools[i].output = outputSel.value as UserTool["output"]);
      const shortcut = document.createElement("input"); shortcut.value = tool.shortcut ?? ""; shortcut.placeholder = "Shortcut, e.g. CmdOrCtrl+R"; shortcut.addEventListener("input", () => tools[i].shortcut = shortcut.value);
      row.append(nameIn, cmdIn, envIn, inputSel, outputSel, shortcut, del);
      list.appendChild(row);
    });
  }
  renderList();

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add tool";
  addBtn.className = "tool-add";
  addBtn.addEventListener("click", () => {
    tools.push({ id: `t${tools.length}_${Date.now() % 100000}`, name: "New Tool", command: "" });
    renderList();
  });
  modal.appendChild(addBtn);

  const hints = document.createElement("div");
  hints.className = "tool-hints";
  hints.innerHTML =
    "<strong>Macros:</strong> " +
    MACROS.map(([m, d]) => `<code title="${d}">${m}</code>`).join(" ");
  modal.appendChild(hints);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.textContent = "Save";
  save.className = "primary";
  actions.append(cancel, save);
  modal.appendChild(actions);

  function close(): void {
    overlay.remove();
  }
  cancel.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  save.addEventListener("click", () => {
    tools = tools.filter((t) => t.name.trim() && t.command.trim());
    saveTools(tools);
    onClose(tools);
    close();
  });

  document.body.appendChild(overlay);
}
