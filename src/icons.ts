// Small inline SVG icons for the toolbars (16×16, currentColor). These are
// original, simple glyphs designed for this application, not
// copies of its artwork. Letter/symbol buttons (B, I, U, ¶, div…) are rendered
// as styled text by the toolbar instead of living here.

const wrap = (inner: string): string =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const icons: Record<string, string> = {
  new: wrap('<path d="M4 1.7h5l3 3v9.6H4z"/><path d="M9 1.7v3h3"/>'),
  open: wrap('<path d="M1.7 4h4l1.2 1.3H14v8.7H1.7z"/>'),
  save: wrap('<path d="M2.5 2.5h8.5L13.5 5v8.5h-11z"/><path d="M5 2.5v3.5h5V2.5"/><rect x="5" y="8.5" width="6" height="5"/>'),
  saveAll: wrap('<path d="M4.5 4.5h7L13.5 6.5v7h-9z"/><path d="M6.8 4.5v2.8h4.2V4.5"/><path d="M2.5 2.5h7l1.4 1.4"/>'),
  print: wrap('<path d="M4 6.5V2.5h8v4"/><path d="M4 12H2.5V6.5h11V12H12"/><rect x="4.5" y="9.5" width="7" height="4"/>'),
  cut: wrap('<circle cx="4" cy="11.5" r="2"/><circle cx="12" cy="11.5" r="2"/><path d="M5.7 10.2 13 3M10.3 10.2 3 3"/>'),
  copy: wrap('<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M3.5 10.5H2.5v-8h8v1"/>'),
  paste: wrap('<rect x="3" y="3.5" width="10" height="11" rx="1"/><rect x="5.5" y="1.7" width="5" height="2.6" rx="0.6"/>'),
  delete: `<svg viewBox="0 0 16 16" fill="none" stroke="#d43b2f" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  undo: wrap('<path d="M6 4 3 7l3 3"/><path d="M3 7h6a4 4 0 0 1 0 8H6"/>'),
  redo: wrap('<path d="M10 4l3 3-3 3"/><path d="M13 7H7a4 4 0 0 0 0 8h3"/>'),
  find: wrap('<circle cx="6.8" cy="6.8" r="4.1"/><path d="M9.8 9.8 14 14"/>'),
  replace: wrap('<circle cx="6.5" cy="6.5" r="3.8"/><path d="M9.3 9.3 13.5 13.5"/><path d="M2 13.5h6M6 11.7 8 13.5 6 15.3"/>'),
  findNext: wrap('<circle cx="6.5" cy="6.5" r="3.8"/><path d="M9.3 9.3 13.5 13.5"/><path d="M4.8 6.5h3.6M6.6 4.7 8.4 6.5 6.6 8.3"/>'),
  goto: wrap('<path d="M2.5 4h11M2.5 8h7M2.5 12h11"/><path d="M12 6.5 14 8l-2 1.5"/>'),
  wrap: wrap('<path d="M2.5 3.5h11M2.5 8h8.5a2.2 2.2 0 0 1 0 4.4H8"/><path d="M9.6 10.6 8 12.2l1.6 1.6"/><path d="M2.5 12.5h3"/>'),
  globe: wrap('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.2 2 9.8 0 12M8 2c-2 2.2-2 9.8 0 12"/>'),
  image: wrap('<rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="5.5" cy="6.5" r="1.2"/><path d="M2.5 12l3.5-3.5 2.5 2.5L11 8l3 3"/>'),
  link: wrap('<path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1"/><path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1"/>'),
  hr: wrap('<path d="M2 8h12"/><path d="M2.5 4.5h5M8.5 11.5h5"/>'),
  table: wrap('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6.5h12M2 10h12M6 3v10M10 3v10"/>'),
  list: wrap('<path d="M6 4h8M6 8h8M6 12h8"/><circle cx="3" cy="4" r="0.9" fill="currentColor"/><circle cx="3" cy="8" r="0.9" fill="currentColor"/><circle cx="3" cy="12" r="0.9" fill="currentColor"/>'),
  video: wrap('<rect x="2" y="4" width="9" height="8" rx="1"/><path d="M11 7l3-2v6l-3-2z"/>'),
  audio: wrap('<path d="M6 10V4l6-1.5v6"/><circle cx="4.3" cy="10.5" r="1.7"/><circle cx="10.3" cy="8.5" r="1.7"/>'),
  directory: wrap('<path d="M1.7 4h4l1.2 1.3H14v8.7H1.7z"/>'),
  cliptext: wrap('<rect x="3" y="2.5" width="10" height="12" rx="1"/><rect x="5.5" y="1.5" width="5" height="2.2" rx="0.5"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3"/>'),
  functions: wrap('<path d="M6.5 2.5c-2 0-2 2-2 3.2s0 2-1.4 2.3c1.4.3 1.4 1.1 1.4 2.3s0 3.2 2 3.2"/><path d="M9.5 2.5c2 0 2 2 2 3.2s0 2 1.4 2.3c-1.4.3-1.4 1.1-1.4 2.3s0 3.2-2 3.2"/>'),
  output: wrap('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M4.5 6.5 6.5 8 4.5 9.5M8 9.5h3"/>'),
  terminal: wrap('<rect x="1.7" y="2.7" width="12.6" height="10.6" rx="1.2"/><path d="M4 6l2.2 2L4 10M7.5 10.3h3.5"/>'),
  fontColor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 7.5 3h1L12 11M5.3 8h5.4"/><rect x="3" y="13" width="10" height="2" fill="#d43b2f" stroke="none"/></svg>`,
  colorGrid: `<svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" fill="#e23b3b"/><rect x="9" y="2" width="5" height="5" fill="#2f7bd4"/><rect x="2" y="9" width="5" height="5" fill="#2fae5a"/><rect x="9" y="9" width="5" height="5" fill="#e0a92f"/></svg>`,
};
