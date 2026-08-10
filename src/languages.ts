// Map a filename to a CodeMirror language extension + a human label for the
// status bar. New-and-unsaved / unknown files fall back to plain text.

import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { cpp } from "@codemirror/lang-cpp";
import { php } from "@codemirror/lang-php";
import { StreamLanguage } from "@codemirror/language";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import type { StringStream } from "@codemirror/language";
import { promptText } from "./prompt";

export interface LanguageInfo {
  label: string;
  extension: Extension;
}

const PLAIN: LanguageInfo = { label: "Plain Text", extension: [] };

type Factory = () => LanguageInfo;

const byExt: Record<string, Factory> = {
  js: () => ({ label: "JavaScript", extension: javascript() }),
  jsx: () => ({ label: "JSX", extension: javascript({ jsx: true }) }),
  mjs: () => ({ label: "JavaScript", extension: javascript() }),
  cjs: () => ({ label: "JavaScript", extension: javascript() }),
  ts: () => ({ label: "TypeScript", extension: javascript({ typescript: true }) }),
  tsx: () => ({ label: "TSX", extension: javascript({ typescript: true, jsx: true }) }),
  html: () => ({ label: "HTML", extension: html() }),
  htm: () => ({ label: "HTML", extension: html() }),
  vue: () => ({ label: "HTML", extension: html() }),
  css: () => ({ label: "CSS", extension: css() }),
  scss: () => ({ label: "SCSS", extension: css() }),
  less: () => ({ label: "LESS", extension: css() }),
  json: () => ({ label: "JSON", extension: json() }),
  py: () => ({ label: "Python", extension: python() }),
  pyw: () => ({ label: "Python", extension: python() }),
  java: () => ({ label: "Java", extension: java() }),
  xml: () => ({ label: "XML", extension: xml() }),
  xsd: () => ({ label: "XML", extension: xml() }),
  svg: () => ({ label: "XML", extension: xml() }),
  md: () => ({ label: "Markdown", extension: markdown() }),
  markdown: () => ({ label: "Markdown", extension: markdown() }),
  rs: () => ({ label: "Rust", extension: rust() }),
  sql: () => ({ label: "SQL", extension: sql() }),
  c: () => ({ label: "C", extension: cpp() }),
  h: () => ({ label: "C/C++ Header", extension: cpp() }),
  cpp: () => ({ label: "C++", extension: cpp() }),
  cc: () => ({ label: "C++", extension: cpp() }),
  cxx: () => ({ label: "C++", extension: cpp() }),
  hpp: () => ({ label: "C++ Header", extension: cpp() }),
  php: () => ({ label: "PHP", extension: php() }),
  yaml: () => ({ label: "YAML", extension: StreamLanguage.define(yaml) }),
  yml: () => ({ label: "YAML", extension: StreamLanguage.define(yaml) }),
  sh: () => ({ label: "Shell", extension: StreamLanguage.define(shell) }),
  bash: () => ({ label: "Shell", extension: StreamLanguage.define(shell) }),
  zsh: () => ({ label: "Shell", extension: StreamLanguage.define(shell) }),
  rb: () => ({ label: "Ruby", extension: StreamLanguage.define(ruby) }),
  swift: () => ({ label: "Swift", extension: StreamLanguage.define(swift) }),
  m: () => ({ label: "Objective-C", extension: cpp() }),
  mm: () => ({ label: "Objective-C++", extension: cpp() }),
  toml: () => ({ label: "TOML", extension: StreamLanguage.define(toml) }),
  ini: () => ({ label: "INI", extension: StreamLanguage.define(properties) }),
  conf: () => ({ label: "Configuration", extension: StreamLanguage.define(properties) }),
};

export function languageForFilename(name: string | null): LanguageInfo {
  if (!name) return PLAIN;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return PLAIN;
  const ext = name.slice(dot + 1).toLowerCase();
  const factory = byExt[ext];
  if (factory) return factory();
  const custom = loadCustomLanguages().find((l) => l.extensions.split(/[,\s]+/).includes(ext));
  return custom ? { label: custom.name, extension: StreamLanguage.define({
    startState: () => ({ block: false }),
    token(stream: StringStream, state: { block: boolean }) {
      if (state.block) { if (custom.blockEnd && stream.skipTo(custom.blockEnd)) { stream.match(custom.blockEnd); state.block = false; } else stream.skipToEnd(); return "comment"; }
      if (custom.blockStart && stream.match(custom.blockStart)) { state.block = true; return "comment"; }
      if (custom.lineComment && stream.match(custom.lineComment)) { stream.skipToEnd(); return "comment"; }
      if (stream.match(/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/)) return "string";
      if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
      const word = stream.match(/^[A-Za-z_]\w*/); if (Array.isArray(word)) return custom.keywords.split(/[,\s]+/).includes(word[0]) ? "keyword" : null;
      stream.next(); return null;
    },
  }) } : PLAIN;
}

interface CustomLanguage { name: string; extensions: string; keywords: string; lineComment: string; blockStart: string; blockEnd: string }
const CUSTOM_KEY = "klickrr.customLanguages.v1";
function loadCustomLanguages(): CustomLanguage[] { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]"); } catch { return []; } }
export function openCustomLanguages(onSave: () => void): void {
  const overlay = document.createElement("div"); overlay.className = "modal-overlay"; const modal = document.createElement("div"); modal.className = "modal"; const h = document.createElement("h2"); h.textContent = "Custom Languages"; const list = document.createElement("div"); list.className = "key-list"; const actions = document.createElement("div"); actions.className = "modal-actions";
  let items = loadCustomLanguages(); const render = () => { list.replaceChildren(...items.map((item, i) => { const row = document.createElement("div"); row.className = "tool-row"; for (const key of ["name", "extensions", "keywords", "lineComment", "blockStart", "blockEnd"] as const) { const input = document.createElement("input"); input.value = item[key]; input.placeholder = key; input.addEventListener("input", () => item[key] = input.value); row.appendChild(input); } const del = document.createElement("button"); del.textContent = "✕"; del.addEventListener("click", () => { items.splice(i, 1); render(); }); row.appendChild(del); return row; })); };
  const add = document.createElement("button"); add.textContent = "Add Language"; add.addEventListener("click", async () => { const name = await promptText("Custom Language", { label: "Name" }); if (name) { items.push({ name, extensions: "", keywords: "", lineComment: "//", blockStart: "/*", blockEnd: "*/" }); render(); } });
  const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.addEventListener("click", () => overlay.remove()); const save = document.createElement("button"); save.textContent = "Save"; save.className = "primary"; save.addEventListener("click", () => { localStorage.setItem(CUSTOM_KEY, JSON.stringify(items)); overlay.remove(); onSave(); }); actions.append(add, cancel, save); modal.append(h, list, actions); overlay.appendChild(modal); document.body.appendChild(overlay); render();
}
