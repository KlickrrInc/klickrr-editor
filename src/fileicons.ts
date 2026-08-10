// Colorful, filetype-aware icons for the Directory tree. Files get a small
// rounded colored badge with a short label; folders get a warm folder glyph
// (open/closed). Returns HTML strings the sidebar drops into the icon slot.

interface Badge {
  label: string;
  color: string;
}

const IMG: Badge = { label: "IMG", color: "#26a69a" };

const BY_EXT: Record<string, Badge> = {
  js: { label: "JS", color: "#e8a613" },
  mjs: { label: "JS", color: "#e8a613" },
  cjs: { label: "JS", color: "#e8a613" },
  jsx: { label: "JSX", color: "#e8a613" },
  ts: { label: "TS", color: "#2f74c0" },
  tsx: { label: "TSX", color: "#2f74c0" },
  html: { label: "<>", color: "#e34c26" },
  htm: { label: "<>", color: "#e34c26" },
  vue: { label: "VUE", color: "#41b883" },
  css: { label: "CSS", color: "#2965f1" },
  scss: { label: "SAS", color: "#c76395" },
  less: { label: "LES", color: "#2b5686" },
  json: { label: "{}", color: "#cb820a" },
  py: { label: "PY", color: "#3572a5" },
  java: { label: "JV", color: "#b07219" },
  rs: { label: "RS", color: "#c8926b" },
  go: { label: "GO", color: "#00add8" },
  php: { label: "PHP", color: "#8993be" },
  rb: { label: "RB", color: "#cc342d" },
  sql: { label: "SQL", color: "#e38c00" },
  sh: { label: "SH", color: "#4caf50" },
  c: { label: "C", color: "#5b6b78" },
  h: { label: "H", color: "#8e44ad" },
  cpp: { label: "C++", color: "#f34b7d" },
  cc: { label: "C++", color: "#f34b7d" },
  cxx: { label: "C++", color: "#f34b7d" },
  hpp: { label: "HPP", color: "#8e44ad" },
  xml: { label: "XML", color: "#f1662a" },
  xsd: { label: "XML", color: "#f1662a" },
  svg: { label: "SVG", color: "#ffb13b" },
  md: { label: "MD", color: "#519aba" },
  markdown: { label: "MD", color: "#519aba" },
  yml: { label: "YML", color: "#cb171e" },
  yaml: { label: "YML", color: "#cb171e" },
  toml: { label: "TML", color: "#9c4221" },
  ini: { label: "INI", color: "#6d8086" },
  conf: { label: "CFG", color: "#6d8086" },
  txt: { label: "TXT", color: "#8a8a8a" },
  csv: { label: "CSV", color: "#1a7f37" },
  pdf: { label: "PDF", color: "#e2483d" },
  zip: { label: "ZIP", color: "#b0902f" },
  lock: { label: "LK", color: "#8a8a8a" },
  png: IMG,
  jpg: IMG,
  jpeg: IMG,
  gif: IMG,
  webp: IMG,
  ico: IMG,
  bmp: IMG,
};

const GENERIC: Badge = { label: "•", color: "#9aa4ad" };

function badgeFor(name: string): Badge {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return GENERIC;
  return BY_EXT[name.slice(dot + 1).toLowerCase()] ?? GENERIC;
}

/** HTML for a file's colored badge icon. */
export function fileBadge(name: string): string {
  const b = badgeFor(name);
  return `<span class="ficon" style="background:${b.color}">${b.label}</span>`;
}

/** HTML for a folder icon (warmer when open). */
export function folderIcon(open: boolean): string {
  const fill = open ? "#f2cd7b" : "#e8b64a";
  return `<svg class="dicon" viewBox="0 0 16 16" fill="${fill}" stroke="#c99a2e" stroke-width="0.8">
<path d="M1.5 4.2c0-.5.4-.9.9-.9h3.1l1.2 1.3h6.9c.5 0 .9.4.9.9v6.8c0 .5-.4.9-.9.9H2.4c-.5 0-.9-.4-.9-.9z"/></svg>`;
}
