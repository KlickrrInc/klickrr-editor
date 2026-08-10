import { basename, listProjectFiles, replaceFileMatches, searchFiles } from "./fileops";
import type { SearchHit } from "./fileops";

function overlay(title: string): { root: HTMLElement; modal: HTMLElement; body: HTMLElement; close: () => void } {
  const root = document.createElement("div"); root.className = "modal-overlay";
  const modal = document.createElement("div"); modal.className = "modal workspace-modal";
  const heading = document.createElement("h2"); heading.textContent = title;
  const body = document.createElement("div"); body.className = "workspace-modal-body";
  modal.append(heading, body); root.appendChild(modal); document.body.appendChild(root);
  const close = () => root.remove();
  root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
  return { root, modal, body, close };
}

function fuzzyScore(value: string, query: string): number {
  let at = 0, score = 0;
  const v = value.toLowerCase(), q = query.toLowerCase();
  for (const ch of q) { const next = v.indexOf(ch, at); if (next < 0) return -1; score += next === at ? 3 : 1; at = next + 1; }
  return score - value.length / 1000;
}

export async function openQuickOpen(rootPath: string, recents: string[], openFile: (path: string) => void): Promise<void> {
  const ui = overlay("Quick Open");
  const input = document.createElement("input"); input.className = "workspace-query"; input.placeholder = "Type a filename…";
  const list = document.createElement("div"); list.className = "workspace-results";
  ui.body.append(input, list); input.focus();
  let files: string[] = [];
  const render = () => {
    const q = input.value.trim();
    const ranked = files.map((path) => ({ path, score: fuzzyScore(path.slice(rootPath.length), q) + (recents.includes(path) ? 10 : 0) }))
      .filter((x) => x.score >= 0).sort((a, b) => b.score - a.score).slice(0, 100);
    list.replaceChildren(...ranked.map(({ path }) => {
      const row = document.createElement("button"); row.className = "workspace-result";
      row.innerHTML = `<strong></strong><small></small>`;
      row.querySelector("strong")!.textContent = basename(path);
      row.querySelector("small")!.textContent = path.slice(rootPath.length + 1);
      row.addEventListener("click", () => { ui.close(); openFile(path); }); return row;
    }));
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") (list.firstElementChild as HTMLButtonElement | null)?.click(); });
  try { files = await listProjectFiles(rootPath); render(); }
  catch (e) { list.textContent = "Could not index folder: " + String(e); }
}

export function openFindInFiles(rootPath: string, openDocuments: { path: string; contents: string }[], openFile: (path: string, line: number, column: number) => void): void {
  const ui = overlay("Find in Files");
  const controls = document.createElement("div"); controls.className = "workspace-controls";
  const input = document.createElement("input"); input.className = "workspace-query"; input.placeholder = "Search text…";
  const caseBox = document.createElement("input"); caseBox.type = "checkbox";
  const regexBox = document.createElement("input"); regexBox.type = "checkbox";
  const hiddenBox = document.createElement("input"); hiddenBox.type = "checkbox";
  const scope = document.createElement("select");
  for (const [value, text] of [["folder", "Folder"], ["open", "Open Documents"]]) { const o = document.createElement("option"); o.value = value; o.textContent = text; scope.appendChild(o); }
  const include = document.createElement("input"); include.className = "workspace-pattern"; include.placeholder = "Include, e.g. .ts,.css";
  const exclude = document.createElement("input"); exclude.className = "workspace-pattern"; exclude.placeholder = "Exclude, e.g. vendor";
  const button = document.createElement("button"); button.textContent = "Search"; button.className = "primary";
  const label = (text: string, box: HTMLInputElement) => { const l = document.createElement("label"); l.append(box, " " + text); return l; };
  controls.append(input, scope, include, exclude, label("Case sensitive", caseBox), label("Regex", regexBox), label("Hidden files", hiddenBox), button);
  const list = document.createElement("div"); list.className = "workspace-results search-results";
  ui.body.append(controls, list); input.focus();
  const render = (hits: SearchHit[]) => {
    list.replaceChildren(...hits.map((hit) => { const row = document.createElement("button"); row.className = "workspace-result";
      row.innerHTML = `<strong></strong><small></small>`; row.querySelector("strong")!.textContent = `${hit.path.slice(rootPath.length + 1)}:${hit.line}:${hit.column}`;
      row.querySelector("small")!.textContent = hit.preview; row.addEventListener("click", () => { ui.close(); openFile(hit.path, hit.line, hit.column); }); return row; }));
    if (!hits.length) list.textContent = "No matches.";
  };
  const run = async () => { if (!input.value) return; list.textContent = "Searching…"; button.disabled = true;
    try {
      if (scope.value === "open") {
        const flags = caseBox.checked ? "g" : "gi"; const pattern = regexBox.checked ? input.value : input.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(pattern, flags); const hits: SearchHit[] = [];
        for (const doc of openDocuments) doc.contents.split("\n").forEach((line, index) => { re.lastIndex = 0; const m = re.exec(line); if (m) hits.push({ path: doc.path, line: index + 1, column: m.index + 1, length: m[0].length, preview: line.trim() }); });
        render(hits.slice(0, 2000));
      } else render(await searchFiles(rootPath, { query: input.value, case_sensitive: caseBox.checked, regex: regexBox.checked, include_hidden: hiddenBox.checked, include: include.value, exclude: exclude.value, max_results: 2000 }));
    }
    catch (e) { list.textContent = "Search failed: " + String(e); } finally { button.disabled = false; } };
  button.addEventListener("click", () => void run()); input.addEventListener("keydown", (e) => { if (e.key === "Enter") void run(); });
}

export function openReplaceInFiles(rootPath: string, onComplete: (paths: string[]) => void): void {
  const ui = overlay("Replace in Files"); const controls = document.createElement("div"); controls.className = "workspace-controls";
  const query = document.createElement("input"); query.className = "workspace-query"; query.placeholder = "Find…";
  const replacement = document.createElement("input"); replacement.className = "workspace-query"; replacement.placeholder = "Replace with…";
  const preview = document.createElement("button"); preview.textContent = "Preview"; const apply = document.createElement("button"); apply.textContent = "Replace Selected"; apply.className = "primary"; apply.disabled = true;
  const list = document.createElement("div"); list.className = "workspace-results"; controls.append(query, replacement, preview, apply); ui.body.append(controls, list);
  let hits: SearchHit[] = [], checks: HTMLInputElement[] = [];
  preview.addEventListener("click", async () => { if (!query.value) return; list.textContent = "Searching…";
    try { hits = await searchFiles(rootPath, { query: query.value, case_sensitive: false, regex: false, include_hidden: false, include: "", exclude: "", max_results: 5000 });
      checks = []; list.replaceChildren(...hits.map((hit) => { const row = document.createElement("label"); row.className = "workspace-result replace-result"; const check = document.createElement("input"); check.type = "checkbox"; check.checked = true; checks.push(check);
        const text = document.createElement("span"); text.textContent = `${hit.path.slice(rootPath.length + 1)}:${hit.line}  ${hit.preview}`; row.append(check, text); return row; })); apply.disabled = !hits.length;
    } catch (e) { list.textContent = String(e); } });
  apply.addEventListener("click", async () => { const selected = hits.filter((_, i) => checks[i].checked); if (!selected.length) return; apply.disabled = true;
    try { const count = await replaceFileMatches(selected, replacement.value); const paths = [...new Set(selected.map((h) => h.path))]; ui.close(); onComplete(paths); alert(`Replaced ${count} occurrence(s) in ${paths.length} file(s).`); }
    catch (e) { list.textContent = String(e); apply.disabled = false; } });
  query.focus();
}
