// A lightweight right-click context menu. Call showContextMenu at the cursor
// with a list of items; it closes on outside click, Escape, or after a choice.

export interface CtxItem {
  label: string;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

let openMenu: HTMLElement | null = null;

function closeMenu(): void {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
    document.removeEventListener("mousedown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
  }
}

function onDocDown(e: MouseEvent): void {
  if (openMenu && !openMenu.contains(e.target as Node)) closeMenu();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") closeMenu();
}

export function showContextMenu(x: number, y: number, items: CtxItem[]): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement("div");
    row.className = "ctx-item" + (item.danger ? " danger" : "");
    row.setAttribute("role", "menuitem"); row.tabIndex = 0;
    row.textContent = item.label;
    row.addEventListener("click", () => {
      closeMenu();
      item.action();
    });
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") row.click(); });
    menu.appendChild(row);
  }

  // Position, keeping the menu on-screen.
  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 6);
  const top = Math.min(y, window.innerHeight - rect.height - 6);
  menu.style.left = `${Math.max(4, left)}px`;
  menu.style.top = `${Math.max(4, top)}px`;
  menu.style.visibility = "visible";

  openMenu = menu;
  menu.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  document.addEventListener("mousedown", onDocDown, true);
  document.addEventListener("keydown", onKey, true);
}
