// A tiny async text-input modal (the webview blocks window.prompt). Resolves to
// the entered string, or null if cancelled.

export function promptText(
  title: string,
  opts: { label?: string; placeholder?: string; value?: string } = {}
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal prompt-modal";
    overlay.appendChild(modal);

    const h = document.createElement("h2");
    h.textContent = title;
    modal.appendChild(h);

    if (opts.label) {
      const lbl = document.createElement("div");
      lbl.className = "tool-hints";
      lbl.textContent = opts.label;
      modal.appendChild(lbl);
    }

    const input = document.createElement("input");
    input.className = "prompt-input";
    input.value = opts.value ?? "";
    input.placeholder = opts.placeholder ?? "";
    modal.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.className = "primary";
    actions.append(cancel, ok);
    modal.appendChild(actions);

    function done(value: string | null): void {
      overlay.remove();
      resolve(value);
    }
    cancel.addEventListener("click", () => done(null));
    ok.addEventListener("click", () => done(input.value.trim() || null));
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) done(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(input.value.trim() || null);
      if (e.key === "Escape") done(null);
    });

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}
