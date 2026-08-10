import { promptText } from "./prompt";

interface Template { name: string; extension: string; contents: string; builtin?: boolean }
const KEY = "klickrr.templates.v1";
const BUILTINS: Template[] = [
  { name: "Plain Text", extension: "txt", contents: "", builtin: true },
  { name: "HTML5 Document", extension: "html", contents: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title></title>\n</head>\n<body>\n\n</body>\n</html>\n", builtin: true },
  { name: "Markdown Document", extension: "md", contents: "# Title\n\n", builtin: true },
];
function load(): Template[] { try { return [...BUILTINS, ...(JSON.parse(localStorage.getItem(KEY) ?? "[]") as Template[])]; } catch { return [...BUILTINS]; } }
function save(items: Template[]): void { localStorage.setItem(KEY, JSON.stringify(items.filter((t) => !t.builtin))); }

export function openTemplates(onCreate: (contents: string, suggestedName: string) => void): void {
  const overlay = document.createElement("div"); overlay.className = "modal-overlay"; const modal = document.createElement("div"); modal.className = "modal";
  const h = document.createElement("h2"); h.textContent = "New from Template"; const list = document.createElement("div"); list.className = "key-list";
  const actions = document.createElement("div"); actions.className = "modal-actions";
  const render = () => { const items = load(); list.replaceChildren(...items.map((item) => { const row = document.createElement("div"); row.className = "template-row"; const use = document.createElement("button"); use.className = "workspace-result"; use.textContent = `${item.name} (.${item.extension})`; use.addEventListener("click", () => { overlay.remove(); onCreate(item.contents, `untitled.${item.extension}`); }); row.appendChild(use);
    if (!item.builtin) { const edit = document.createElement("button"); edit.textContent = "Edit"; edit.addEventListener("click", async () => { const contents = await promptText("Edit Template", { label: item.name, value: item.contents }); if (contents != null) { item.contents = contents; save(items); render(); } }); const remove = document.createElement("button"); remove.textContent = "Remove"; remove.addEventListener("click", () => { save(items.filter((t) => t !== item)); render(); }); row.append(edit, remove); } return row; })); };
  const add = document.createElement("button"); add.textContent = "Add"; add.addEventListener("click", async () => { const name = await promptText("Add Template", { label: "Name" }); const extension = await promptText("Add Template", { label: "File extension" }); const contents = await promptText("Add Template", { label: "Initial contents" }); if (name && extension && contents != null) { const items = load(); items.push({ name, extension, contents }); save(items); render(); } });
  const importBtn = document.createElement("button"); importBtn.textContent = "Import"; importBtn.addEventListener("click", () => { const input = document.createElement("input"); input.type = "file"; input.addEventListener("change", async () => { const file = input.files?.[0]; if (!file) return; const items = load(); const ext = file.name.split(".").pop() ?? "txt"; items.push({ name: file.name, extension: ext, contents: await file.text() }); save(items); render(); }); input.click(); });
  const close = document.createElement("button"); close.textContent = "Close"; close.addEventListener("click", () => overlay.remove()); actions.append(add, importBtn, close); modal.append(h, list, actions); overlay.appendChild(modal); document.body.appendChild(overlay); render();
}
